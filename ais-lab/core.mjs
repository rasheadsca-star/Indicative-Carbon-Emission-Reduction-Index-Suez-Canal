/**
 * CERI-SC AIS LAB — conservative research-only vessel tracker.
 * No official transit count and no measured or certified emissions.
 * Source terms: https://openwaters.io/ais/
 */
export const AIS_BBOX = [29.70, 31.90, 31.65, 32.85];
export const MAX_POSITION_AGE_MS = 30 * 60_000;
export const MAX_LIVE_LAG_MS = 10 * 60_000;
export const MIN_TRANSIT_MS = 3 * 60 * 60_000;
export const MAX_TRANSIT_MS = 48 * 60 * 60_000;
const MAX_TRACKED = 700;
const MAX_COMPLETIONS = 400;
const MAX_POINTS = 36;

const CANAL_WAYPOINTS = [
  [31.265, 32.305], [31.10, 32.305], [30.91, 32.315],
  [30.67, 32.33], [30.49, 32.34], [30.31, 32.345],
  [30.12, 32.515], [30.045, 32.56]
];

export function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
function distanceToCanalKm(lat, lon) {
  let nearest = Infinity;
  const x = lon * Math.cos(30.6 * Math.PI / 180);
  const y = lat;
  for (let i = 1; i < CANAL_WAYPOINTS.length; i++) {
    const [al, ao] = CANAL_WAYPOINTS[i - 1];
    const [bl, bo] = CANAL_WAYPOINTS[i];
    const ax = ao * Math.cos(30.6 * Math.PI / 180), bx = bo * Math.cos(30.6 * Math.PI / 180);
    const dx = bx - ax, dy = bl - al;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - al) * dy) / (dx * dx + dy * dy)));
    nearest = Math.min(nearest, Math.hypot(x - (ax + t * dx), y - (al + t * dy)) * 111.2);
  }
  return nearest;
}
export function classifyZone(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "outside";
  if (lat >= 31.28 && lat <= 31.65 && lon >= 32.1 && lon <= 32.62) return "north";
  if (lat >= 29.70 && lat <= 30.04 && lon >= 32.40 && lon <= 32.85) return "south";
  if (lat > 30.04 && lat < 31.28 && distanceToCanalKm(lat, lon) <= 13) return "canal";
  return "outside";
}
export function vesselCategory(type) {
  const n = Number(type);
  if (!Number.isInteger(n) || n <= 0) return "Unknown";
  if (n >= 70 && n < 80) return "Cargo";
  if (n >= 80 && n < 90) return "Tanker";
  if (n >= 60 && n < 70) return "Passenger";
  if (n >= 30 && n < 40) return "Special";
  if (n >= 40 && n < 60) return "High-speed / service";
  return "Other";
}
function validMmsi(value) { return /^\d{9}$/.test(String(value || "")); }
function finitePosition(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
    && (lat !== 0 || lon !== 0);
}
function normalizeSpeed(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 102.3 ? n : null;
}
function normalizeType(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
}
function normalizeTime(value) {
  const epoch = Date.parse(value || "");
  return Number.isFinite(epoch) ? epoch : null;
}
export function normalizeEvent(frame) {
  if (!frame || frame.type !== "event") return null;
  const message = frame.message || {};
  const mmsi = String(frame.mmsi ?? message.UserID ?? "");
  const lat = Number(frame.lat ?? message.Latitude);
  const lon = Number(frame.lon ?? message.Longitude);
  if (!validMmsi(mmsi) || !finitePosition(lat, lon)) return null;
  const timestamp = normalizeTime(frame.time);
  if (timestamp === null) return null;
  const name = String(frame.name || message.ShipName || message.Name || "").trim().slice(0, 90);
  const shipType = normalizeType(frame.shipType ?? message.Type ?? message.ShipType);
  return {
    mmsi, lat, lon, timestamp, name, shipType,
    sog: normalizeSpeed(frame.sog ?? message.Sog ?? message.SpeedOverGround),
    cog: normalizeSpeed(frame.cog ?? message.Cog),
    source: String(frame.source || "unknown").slice(0, 80),
    station: String(frame.station || "").slice(0, 100),
    messageType: String(frame.msg_type || ""),
    eventId: String(frame.id || "").slice(0, 90),
    isPositionReport: /PositionReport|ClassBPositionReport/i.test(frame.msg_type || ""),
    synthesized: Boolean(frame.synthesized),
    origin: "Open Waters AIS"
  };
}
export function normalizeSnapshot(feature) {
  const p = feature?.properties || {};
  const [lon, lat] = feature?.geometry?.coordinates || [];
  const mmsi = String(p.mmsi ?? feature?.id ?? "");
  if (!validMmsi(mmsi) || !finitePosition(lat, lon)) return null;
  const timestamp = normalizeTime(p.seen);
  if (timestamp === null) return null;
  return {
    mmsi, lat, lon, timestamp,
    name: String(p.name || "").trim().slice(0, 90),
    shipType: normalizeType(p.type),
    sog: normalizeSpeed(p.sog), cog: normalizeSpeed(p.cog),
    source: String(p.source || "unknown").slice(0, 80),
    station: String(p.station || "").slice(0, 100),
    messageType: String(p.msg_type || "snapshot"),
    eventId: "", isPositionReport: false, synthesized: true,
    origin: "Open Waters AIS"
  };
}
export function createTracker(clock = () => Date.now()) {
  const vessels = new Map();
  const completions = [];
  const seenEvents = new Set();
  let liveMessages = 0;
  let dropped = 0;

  function ingest(v, live = false) {
    if (!v || !validMmsi(v.mmsi) || !finitePosition(v.lat, v.lon) || !Number.isFinite(v.timestamp)) {
      dropped++; return { accepted: false, reason: "invalid" };
    }
    const now = clock();
    const age = now - v.timestamp;
    if (age < -2 * 60_000 || age > 7 * 24 * 60 * 60_000) {
      dropped++; return { accepted: false, reason: "timestamp" };
    }
    if (classifyZone(v.lat, v.lon) === "outside") return { accepted: false, reason: "outside" };
    const eventKey = v.eventId ? v.eventId + ":" + v.timestamp : "";
    if (live && eventKey && seenEvents.has(eventKey)) return { accepted: false, reason: "duplicate" };
    if (eventKey) {
      seenEvents.add(eventKey);
      if (seenEvents.size > 4000) seenEvents.delete(seenEvents.values().next().value);
    }

    let entry = vessels.get(v.mmsi);
    if (!entry) {
      entry = { mmsi: v.mmsi, name: "", shipType: null, source: "", station: "",
        sog: null, cog: null, lat: v.lat, lon: v.lon, timestamp: v.timestamp, points: [],
        passage: null, completedAt: null };
      vessels.set(v.mmsi, entry);
    }
    if (entry.points.length && v.timestamp < entry.timestamp) {
      return { accepted: false, reason: "out_of_order" };
    }
    if (entry.points.length && v.isPositionReport && live) {
      const elapsed = (v.timestamp - entry.timestamp) / 3600000;
      if (elapsed > 0 && haversineKm({lat: entry.lat, lon: entry.lon}, v) / elapsed > 55) {
        dropped++; return { accepted: false, reason: "implausible_jump" };
      }
    }
    entry.name = v.name || entry.name;
    entry.shipType = v.shipType ?? entry.shipType;
    entry.source = v.source || entry.source;
    entry.station = v.station || entry.station;
    entry.sog = v.sog ?? entry.sog;
    entry.cog = v.cog ?? entry.cog;
    entry.timestamp = v.timestamp;
    entry.lat = v.lat; entry.lon = v.lon;
    const zone = classifyZone(v.lat, v.lon);
    const fresh = age <= MAX_LIVE_LAG_MS;
    const countable = live && fresh && v.isPositionReport && !v.synthesized;
    if (live) liveMessages++;

    if (countable) {
      const last = entry.points.at(-1);
      if (!last || last.timestamp !== v.timestamp || last.zone !== zone) {
        entry.points.push({ lat: v.lat, lon: v.lon, timestamp: v.timestamp, zone });
        if (entry.points.length > MAX_POINTS) entry.points.shift();
      }
      const passage = entry.passage;
      if (zone === "north" || zone === "south") {
        if (!passage || (passage.start === zone) || v.timestamp - passage.startedAt > MAX_TRANSIT_MS) {
          if (!passage || passage.start !== zone || v.timestamp - passage.startedAt > MAX_TRANSIT_MS) {
            entry.passage = { start: zone, startedAt: v.timestamp, canalSeen: false, canalPoints: 0 };
          }
        } else if (passage.canalSeen &&
                   v.timestamp - passage.startedAt >= MIN_TRANSIT_MS &&
                   v.timestamp - passage.startedAt <= MAX_TRANSIT_MS &&
                   entry.completedAt !== passage.startedAt) {
          const completion = {
            mmsi: entry.mmsi, name: entry.name, shipType: entry.shipType,
            direction: passage.start === "north" ? "Southbound" : "Northbound",
            entryTime: passage.startedAt, exitTime: v.timestamp,
            elapsedHours: +( (v.timestamp - passage.startedAt) / 3600000 ).toFixed(2),
            canalPoints: passage.canalPoints, source: v.source,
            status: "AIS-inferred; not official"
          };
          completions.unshift(completion);
          if (completions.length > MAX_COMPLETIONS) completions.pop();
          entry.completedAt = passage.startedAt;
          entry.passage = null;
          shrink();
          return { accepted: true, completed: completion };
        } else {
          // A jump from the opposite gateway without valid interior evidence is not a transit.
          entry.passage = { start: zone, startedAt: v.timestamp, canalSeen: false, canalPoints: 0 };
        }
      } else if (zone === "canal" && passage &&
                 v.timestamp >= passage.startedAt && v.timestamp - passage.startedAt <= MAX_TRANSIT_MS) {
        passage.canalSeen = true;
        passage.canalPoints++;
      }
    }
    shrink();
    return { accepted: true, countable };
  }
  function shrink() {
    while (vessels.size > MAX_TRACKED) {
      let oldest = null;
      for (const v of vessels.values()) if (!oldest || v.timestamp < oldest.timestamp) oldest = v;
      if (!oldest) break;
      vessels.delete(oldest.mmsi);
    }
  }
  function summary() {
    const now = clock();
    const fresh = [...vessels.values()].filter(v => now - v.timestamp <= MAX_POSITION_AGE_MS && now >= v.timestamp - 120000);
    return {
      observed: fresh.length,
      inCanal: fresh.filter(v => classifyZone(v.lat, v.lon) === "canal").length,
      atNorth: fresh.filter(v => classifyZone(v.lat, v.lon) === "north").length,
      atSouth: fresh.filter(v => classifyZone(v.lat, v.lon) === "south").length,
      inferredTransits: completions.length, liveMessages, dropped,
      newest: fresh.reduce((m, v) => Math.max(m, v.timestamp), 0),
      vessels: fresh.sort((a,b) => b.timestamp - a.timestamp),
      completions: [...completions]
    };
  }
  return { ingest, summary, reset: () => { vessels.clear(); completions.length = 0; seenEvents.clear(); liveMessages = 0; dropped = 0; } };
}
