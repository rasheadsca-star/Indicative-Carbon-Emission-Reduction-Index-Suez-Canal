/**
 * CERI-SC backend — AIS provider contract and message normaliser (WP2).
 *
 * SERVER-SIDE ONLY. Provider credentials come from environment variables on a
 * durable host; they must never be shipped to GitHub Pages or static JS.
 *
 * A provider that connects and delivers messages proves TRANSPORT, not Suez
 * coverage. `coverageStatus` stays "UNVERIFIED" until a documented >=7-day
 * proof-of-coverage trial has been reconciled against an official reference.
 */

export const COVERAGE_STATUS = Object.freeze(["UNVERIFIED", "TRIAL", "VERIFIED_FOR_PERIOD"]);

/**
 * @typedef {object} AisProvider
 * @property {string} id               stable provider id, e.g. "aisstream"
 * @property {string} licenceRef       contract / ToS reference (URL or document id)
 * @property {string} coverageStatus   one of COVERAGE_STATUS
 * @property {(onMessage:(raw:any)=>void, onHealth:(h:object)=>void)=>Promise<void>} start
 * @property {()=>Promise<void>} stop
 */
export function assertAisProvider(p) {
  if (!p || typeof p !== "object") throw Error("Provider missing");
  for (const k of ["id", "licenceRef", "coverageStatus"]) {
    if (typeof p[k] !== "string" || !p[k].trim()) throw Error("Provider field required: " + k);
  }
  if (!COVERAGE_STATUS.includes(p.coverageStatus)) throw Error("Invalid coverageStatus");
  if (typeof p.start !== "function" || typeof p.stop !== "function") throw Error("Provider must implement start/stop");
  return p;
}

/** Ship-station MMSI only (MID-prefixed, first digit 2–7). Rejects coast/SAR/AtoN/SART/handheld and filler ids. */
export function isShipMmsi(value) {
  const s = String(value ?? "");
  if (!/^[2-7]\d{8}$/.test(s)) return false;
  if (/^(\d)\1{8}$/.test(s)) return false;
  return true;
}

/**
 * Parse a timestamp that carries an EXPLICIT UTC offset. Naive local strings are
 * rejected (Egypt EET/EEST vs UTC ambiguity is a known defect class).
 * Accepts: ISO-8601 with Z/±hh:mm, epoch milliseconds, and the
 * "YYYY-MM-DD HH:MM:SS(.ffffff) +0000 UTC" form used by some stream providers.
 */
export function parseUtc(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 946684800000 ? Math.trunc(value) : NaN;
  if (typeof value !== "string") return NaN;
  let s = value.trim();
  const go = s.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)(\.\d+)? ([+-]\d{4})(?: UTC)?$/);
  if (go) {
    const frac = go[3] ? go[3].slice(0, 4) : "";
    s = `${go[1]}T${go[2]}${frac}${go[4].slice(0, 3)}:${go[4].slice(3)}`;
  }
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(s)) return NaN;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : NaN;
}

const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

function validPosition(lat, lon) {
  // AIS "not available" sentinels are 91/181; (0,0) is a common null-island fault.
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}

/**
 * Canonical message:
 * { mmsi, tsMs, lat, lon, sog, cog, heading, navStatus, msgType, providerId }
 * Returns { ok:true, msg } or { ok:false, reason }.
 */
export function normalizeAisMessage(raw, { adapter = "canonical", providerId = "unknown" } = {}) {
  let m;
  if (adapter === "aisstream") {
    // Shape per provider public docs; MUST be re-verified against a live sample during the trial.
    const md = raw?.MetaData || {};
    const body = raw?.Message?.[raw?.MessageType] || {};
    if (!/PositionReport$/.test(String(raw?.MessageType || ""))) return { ok: false, reason: "not_position_report" };
    m = { mmsi: md.MMSI ?? body.UserID, ts: md.time_utc, lat: num(body.Latitude ?? md.latitude), lon: num(body.Longitude ?? md.longitude),
      sog: num(body.Sog), cog: num(body.Cog), heading: num(body.TrueHeading), navStatus: num(body.NavigationalStatus), msgType: raw.MessageType };
  } else if (adapter === "canonical") {
    m = { mmsi: raw?.mmsi, ts: raw?.ts ?? raw?.tsMs, lat: num(raw?.lat), lon: num(raw?.lon), sog: num(raw?.sog), cog: num(raw?.cog),
      heading: num(raw?.heading), navStatus: num(raw?.navStatus), msgType: String(raw?.msgType || "position") };
  } else {
    throw Error("Unknown adapter " + adapter);
  }
  const mmsi = String(m.mmsi ?? "");
  if (!isShipMmsi(mmsi)) return { ok: false, reason: "invalid_mmsi" };
  const tsMs = parseUtc(m.ts);
  if (!Number.isFinite(tsMs)) return { ok: false, reason: "invalid_or_naive_timestamp" };
  if (!validPosition(m.lat, m.lon)) return { ok: false, reason: "invalid_position" };
  const clean = (v, max) => (Number.isFinite(v) && v >= 0 && v < max ? v : null);
  return { ok: true, msg: {
    mmsi, tsMs, lat: m.lat, lon: m.lon,
    sog: clean(m.sog, 102.3), cog: clean(m.cog, 360), heading: clean(m.heading, 360),
    navStatus: Number.isInteger(m.navStatus) && m.navStatus >= 0 && m.navStatus <= 15 ? m.navStatus : null,
    msgType: String(m.msgType).slice(0, 40), providerId: String(providerId).slice(0, 40)
  } };
}

/**
 * Transport health ≠ coverage. Tracks message flow so an always-on collector can
 * alert on silence; never reports a coverage percentage.
 */
export function createHealthMonitor({ staleAfterMs = 10 * 60_000, clock = () => Date.now() } = {}) {
  let connected = false, lastMessageAt = null, received = 0, rejected = 0, reconnects = 0;
  const reasons = {};
  return {
    onConnect() { if (connected === false && received > 0) reconnects++; connected = true; },
    onDisconnect() { connected = false; },
    onMessage(result) {
      received++;
      if (result.ok) lastMessageAt = clock();
      else { rejected++; reasons[result.reason] = (reasons[result.reason] || 0) + 1; }
    },
    snapshot() {
      const now = clock();
      const silentMs = lastMessageAt === null ? null : now - lastMessageAt;
      return {
        connected, received, rejected, rejectReasons: { ...reasons }, reconnects,
        lastMessageAt: lastMessageAt === null ? null : new Date(lastMessageAt).toISOString(),
        transport: !connected ? "DISCONNECTED" : lastMessageAt === null || silentMs > staleAfterMs ? "CONNECTED_BUT_SILENT" : "FLOWING",
        coverage: "UNKNOWN_UNTIL_RECONCILED"
      };
    }
  };
}
