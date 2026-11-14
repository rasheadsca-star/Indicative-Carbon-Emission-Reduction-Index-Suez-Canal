/**
 * CERI-SC backend — server-side Suez transit finite-state machine (WP2).
 *
 * Input: canonical AIS messages (see ais-provider.mjs), any provider.
 * Output: AIS-INFERRED transit CANDIDATES. They are never official SCA transits;
 * precision/recall can only be measured against a complete official register.
 *
 * Zone geometry is shared with the AIS Lab (ais-lab/core.mjs classifyZone) so the
 * browser prototype and the backend cannot silently diverge. Those geofences are
 * PROVISIONAL engineering polygons and must be validated against SCA/IHO charts.
 *
 * Pattern per vessel (zones north|canal|south; "outside" is ignored):
 *   north → canal → south  = Southbound candidate
 *   south → canal → north  = Northbound candidate
 *   north → canal → north  (or south…south) = canal visit, NOT a transit
 *   canal never exited      = open; swept to OPEN_INCOMPLETE after maxCanalHours
 */
import { classifyZone, haversineKm } from "../ais-lab/core.mjs";

export const CANAL_LAT_SPAN = [30.04, 31.28]; // latitude extent of the "canal" zone in classifyZone
export const DEFAULTS = Object.freeze({
  // ~193 km canal: 3 h implies >35 kn average, physically implausible under canal speed rules → reject.
  minCanalHours: 3,
  // Above 48 h the record is more likely a berth/anchorage dwell (Port Said, Ismailia) or data gap: flag, don't drop.
  maxCanalHours: 48,
  // Gaps above this make entry/exit timing too uncertain for a MEDIUM label.
  maxGapHours: 4,
  // Implied speed between consecutive accepted fixes above this is treated as spoof/jump.
  maxImpliedSpeedKn: 40,
  maxFutureSkewMs: 2 * 60_000
});

const H = 3600_000;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

function confidence(maxGapH, latCoverage, cfg) {
  if (maxGapH <= 1 && latCoverage >= 0.8) return "HIGH";
  if (maxGapH <= cfg.maxGapHours && latCoverage >= 0.5) return "MEDIUM";
  return "LOW";
}

export function createTransitEngine(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const clock = options.clock || (() => Date.now());
  const vessels = new Map();
  const stats = { received: 0, accepted: 0, outside: 0, duplicate: 0, conflictingDuplicate: 0, late: 0, future: 0, impliedJump: 0,
    transits: 0, canalVisits: 0, rejectedFast: 0, openIncomplete: 0 };

  function vessel(mmsi) {
    let v = vessels.get(mmsi);
    if (!v) { v = { last: null, segs: [], providers: new Set() }; vessels.set(mmsi, v); }
    return v;
  }

  function evaluate(mmsi, v) {
    const n = v.segs.length;
    if (n < 3) return null;
    const [a, c, b] = v.segs.slice(-3);
    if (c.zone !== "canal" || a.zone === "canal" || b.zone === "canal") return null;
    // Collapse history: the exit approach becomes the next potential entry approach.
    v.segs = [b];
    const lower = (c.lastAt - c.firstAt) / H;
    const upper = (b.firstAt - a.lastAt) / H;
    const maxGapH = Math.max(c.firstAt - a.lastAt, c.maxGap, b.firstAt - c.lastAt) / H;
    const latCoverage = Math.max(0, Math.min(1, (c.maxLat - c.minLat) / (CANAL_LAT_SPAN[1] - CANAL_LAT_SPAN[0])));
    const base = { mmsi, entryWindowUtc: [iso(a.lastAt), iso(c.firstAt)], exitWindowUtc: [iso(c.lastAt), iso(b.firstAt)],
      exitUtc: iso(c.lastAt), canalHoursLower: +lower.toFixed(2), canalHoursUpper: +upper.toFixed(2), canalPoints: c.n,
      maxGapHours: +maxGapH.toFixed(2), latCoverage: +latCoverage.toFixed(2), providers: [...v.providers].sort() };
    if (a.zone === b.zone) {
      stats.canalVisits++;
      return { ...base, kind: "CANAL_VISIT", direction: null, status: "CANAL_VISIT_NOT_TRANSIT", confidence: null, flags: ["SAME_SIDE_EXIT"] };
    }
    const direction = a.zone === "north" ? "Southbound" : "Northbound";
    const flags = [];
    if (upper < cfg.minCanalHours) {
      stats.rejectedFast++;
      return { ...base, kind: "REJECTED", direction, status: "REJECTED_IMPLAUSIBLY_FAST", confidence: null, flags: ["BELOW_MIN_CANAL_HOURS"] };
    }
    if (lower > cfg.maxCanalHours) flags.push("LONG_DWELL_POSSIBLE_PORT_OR_ANCHORAGE");
    if (maxGapH > cfg.maxGapHours) flags.push("TRACK_GAP");
    if (latCoverage < 0.5) flags.push("LOW_CANAL_COVERAGE");
    stats.transits++;
    return { ...base, kind: "TRANSIT", direction, transitId: `${mmsi}-${direction[0]}-${iso(c.lastAt)}`,
      status: "AIS_INFERRED_CANDIDATE_NOT_OFFICIAL", confidence: flags.includes("LONG_DWELL_POSSIBLE_PORT_OR_ANCHORAGE") ? "LOW" : confidence(maxGapH, latCoverage, cfg), flags };
  }

  /** Ingest one canonical message (already normalised). Returns an emitted record or null. */
  function ingest(msg) {
    stats.received++;
    if (msg.tsMs - clock() > cfg.maxFutureSkewMs) { stats.future++; return null; }
    const zone = classifyZone(msg.lat, msg.lon);
    if (zone === "outside") { stats.outside++; return null; }
    const v = vessel(msg.mmsi);
    if (v.last) {
      if (msg.tsMs === v.last.tsMs) {
        if (msg.lat === v.last.lat && msg.lon === v.last.lon) stats.duplicate++; else stats.conflictingDuplicate++;
        return null;
      }
      if (msg.tsMs < v.last.tsMs) { stats.late++; return null; }
      const hours = (msg.tsMs - v.last.tsMs) / H;
      const kn = haversineKm(v.last, msg) / 1.852 / hours;
      if (kn > cfg.maxImpliedSpeedKn) { stats.impliedJump++; return null; }
    }
    stats.accepted++;
    v.providers.add(msg.providerId || "unknown");
    const seg = v.segs.at(-1);
    if (seg && seg.zone === zone) {
      seg.maxGap = Math.max(seg.maxGap, msg.tsMs - seg.lastAt);
      seg.lastAt = msg.tsMs; seg.n++;
      seg.minLat = Math.min(seg.minLat, msg.lat); seg.maxLat = Math.max(seg.maxLat, msg.lat);
    } else {
      v.segs.push({ zone, firstAt: msg.tsMs, lastAt: msg.tsMs, n: 1, maxGap: 0, minLat: msg.lat, maxLat: msg.lat });
      if (v.segs.length > 3) v.segs.shift();
    }
    v.last = { tsMs: msg.tsMs, lat: msg.lat, lon: msg.lon };
    return evaluate(msg.mmsi, v);
  }

  /** Close canal segments that never exited. Emits OPEN_INCOMPLETE records, never transits. */
  function sweep(nowMs = clock()) {
    const out = [];
    for (const [mmsi, v] of vessels) {
      const seg = v.segs.at(-1);
      if (seg?.zone === "canal" && nowMs - seg.lastAt > cfg.maxCanalHours * H) {
        stats.openIncomplete++;
        out.push({ mmsi, kind: "OPEN_INCOMPLETE", status: "NO_EXIT_OBSERVED", direction: null, lastSeenUtc: iso(seg.lastAt), canalPoints: seg.n });
        v.segs = [];
      }
    }
    return out;
  }

  return { ingest, sweep, stats: () => ({ ...stats, vesselsTracked: vessels.size }), config: cfg };
}

/** CSV compatible with ais-lab/reconciliation.mjs (MMSI, Direction, Exit UTC) plus audit columns. */
export function transitsToCsv(records) {
  const cols = ["MMSI", "Direction", "Exit UTC", "Entry Window Start UTC", "Exit Window End UTC", "Canal Hours Lower", "Canal Hours Upper",
    "Max Gap Hours", "Lat Coverage", "Confidence", "Status", "Flags"];
  const rows = records.filter((r) => r.kind === "TRANSIT").map((r) => [r.mmsi, r.direction, r.exitUtc, r.entryWindowUtc[0], r.exitWindowUtc[1],
    r.canalHoursLower, r.canalHoursUpper, r.maxGapHours, r.latCoverage, r.confidence, r.status, r.flags.join("|")].join(","));
  return [cols.join(","), ...rows].join("\n") + "\n";
}
