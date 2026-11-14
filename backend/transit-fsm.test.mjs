// All tracks below are SYNTHETIC test fixtures generated in code. They are NOT real vessel movements.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyZone } from "../ais-lab/core.mjs";
import { normalizePassages } from "../ais-lab/reconciliation.mjs";
import { normalizeAisMessage, parseUtc, isShipMmsi, assertAisProvider, createHealthMonitor } from "./ais-provider.mjs";
import { createTransitEngine, transitsToCsv } from "./transit-fsm.mjs";
import { replay } from "./replay.mjs";

const H = 3600_000, T0 = Date.parse("2026-11-01T00:00:00Z");
const NORTH = [31.40, 32.35], SOUTH = [29.85, 32.56];
const CANAL = [[31.20, 32.305], [31.00, 32.31], [30.80, 32.32], [30.60, 32.335], [30.40, 32.342], [30.20, 32.45], [30.06, 32.555]];
const msg = (mmsi, t, [lat, lon], providerId = "synthetic") => ({ mmsi, tsMs: t, lat, lon, providerId });

/** Southbound: 2 h at north approach, 12 h through canal (fix every `step` h), 1 h at south approach. */
function southbound(mmsi, start = T0, step = 2, canal = CANAL) {
  const out = [msg(mmsi, start, NORTH), msg(mmsi, start + 2 * H, NORTH)];
  canal.forEach((p, i) => out.push(msg(mmsi, start + 2.5 * H + i * step * H, p)));
  const last = out.at(-1).tsMs;
  out.push(msg(mmsi, last + 1 * H, SOUTH), msg(mmsi, last + 2 * H, SOUTH));
  return out;
}
const run = (msgs, opts = {}) => {
  const e = createTransitEngine({ clock: () => Math.max(...msgs.map((m) => m.tsMs)), ...opts });
  const recs = msgs.map((m) => e.ingest(m)).filter(Boolean);
  return { e, recs };
};

test("synthetic geometry sits in the intended shared zones", () => {
  assert.equal(classifyZone(...NORTH), "north");
  assert.equal(classifyZone(...SOUTH), "south");
  for (const p of CANAL) assert.equal(classifyZone(...p), "canal", String(p));
});

test("north→canal→south yields exactly one Southbound candidate, never official", () => {
  const { recs } = run(southbound("622123456"));
  assert.equal(recs.length, 1);
  const r = recs[0];
  assert.equal(r.kind, "TRANSIT");
  assert.equal(r.direction, "Southbound");
  assert.equal(r.status, "AIS_INFERRED_CANDIDATE_NOT_OFFICIAL");
  assert.ok(r.canalHoursLower <= r.canalHoursUpper);
  assert.equal(r.canalHoursLower, 12);
  assert.ok(["HIGH", "MEDIUM"].includes(r.confidence));
});

test("south→canal→north yields Northbound", () => {
  const track = southbound("622123457").map((m, i, a) => ({ ...a[a.length - 1 - i], tsMs: m.tsMs }));
  const { recs } = run(track);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].direction, "Northbound");
});

test("canal visit returning to the same side is not a transit", () => {
  const t = [msg("622000001", T0, NORTH), msg("622000001", T0 + H, CANAL[0]), msg("622000001", T0 + 30 * H, CANAL[0]), msg("622000001", T0 + 31 * H, NORTH)];
  const { recs, e } = run(t);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].kind, "CANAL_VISIT");
  assert.equal(e.stats().transits, 0);
});

test("exact duplicates, conflicting duplicates and late messages are dropped and counted", () => {
  const t = southbound("622000002");
  const dup = [...t.slice(0, 4), t[3], { ...t[3], lat: t[3].lat + 0.01 }, t[1], ...t.slice(4)];
  const { recs, e } = run(dup);
  assert.equal(recs.filter((r) => r.kind === "TRANSIT").length, 1);
  const s = e.stats();
  assert.equal(s.duplicate, 1);
  assert.equal(s.conflictingDuplicate, 1);
  assert.equal(s.late, 1);
});

test("an implausible position jump (spoof) is rejected", () => {
  const t = southbound("622000003");
  t.splice(4, 0, { ...t[3], tsMs: t[3].tsMs + 60_000, lat: 30.06, lon: 32.555 }); // ~100 km in 1 minute
  const { recs, e } = run(t);
  assert.equal(e.stats().impliedJump, 1);
  assert.equal(recs.filter((r) => r.kind === "TRANSIT").length, 1);
});

test("faster-than-physical canal passage is rejected, not counted", () => {
  // Approach fixes just outside each canal end, 7 canal fixes in 1.5 h: upper bound < 3 h. Spoof filter relaxed to isolate the rule.
  const tight = [msg("622000004", T0, [31.29, 32.31]), ...CANAL.map((p, i) => msg("622000004", T0 + 0.1 * H + i * 0.25 * H, p)), msg("622000004", T0 + 1.8 * H, [30.03, 32.565])];
  const { recs } = run(tight, { maxImpliedSpeedKn: 1000 });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].status, "REJECTED_IMPLAUSIBLY_FAST");
});

test("track gap is flagged and downgrades confidence", () => {
  const sparse = [CANAL[0], CANAL[6]];
  const { recs } = run(southbound("622000005", T0, 10, sparse));
  assert.ok(recs[0].flags.includes("TRACK_GAP"));
  assert.equal(recs[0].confidence, "LOW");
});

test("long dwell (e.g. berth inside canal zone) is flagged LOW, not silently counted as normal", () => {
  const { recs } = run(southbound("622000006", T0, 10));
  assert.ok(recs[0].canalHoursLower > 48);
  assert.ok(recs[0].flags.includes("LONG_DWELL_POSSIBLE_PORT_OR_ANCHORAGE"));
  assert.equal(recs[0].confidence, "LOW");
});

test("two separate passages of one ship days apart are two candidates with distinct ids", () => {
  const a = southbound("622000007");
  const back = southbound("622000007", a.at(-1).tsMs + 72 * H).map((m, i, arr) => ({ ...arr[arr.length - 1 - i], tsMs: m.tsMs }));
  const { recs } = run([...a, ...back]);
  const tr = recs.filter((r) => r.kind === "TRANSIT");
  assert.deepEqual(tr.map((r) => r.direction), ["Southbound", "Northbound"]);
  assert.notEqual(tr[0].transitId, tr[1].transitId);
});

test("vessel that never exits is swept to OPEN_INCOMPLETE, never a transit", () => {
  const t = southbound("622000008").slice(0, 5);
  const e = createTransitEngine({ clock: () => t.at(-1).tsMs });
  t.forEach((m) => e.ingest(m));
  assert.deepEqual(e.sweep(t.at(-1).tsMs + 10 * H), []);
  const open = e.sweep(t.at(-1).tsMs + 49 * H);
  assert.equal(open.length, 1);
  assert.equal(open[0].kind, "OPEN_INCOMPLETE");
  assert.equal(e.stats().transits, 0);
});

test("future-dated messages beyond clock skew are rejected", () => {
  const e = createTransitEngine({ clock: () => T0 });
  assert.equal(e.ingest(msg("622000009", T0 + 10 * 60_000, NORTH)), null);
  assert.equal(e.stats().future, 1);
});

test("timestamps require an explicit UTC offset (EET/UTC ambiguity guard)", () => {
  assert.ok(Number.isNaN(parseUtc("2026-11-14T12:00:00")));
  assert.ok(Number.isNaN(parseUtc("2026-11-14 12:00:00")));
  assert.equal(parseUtc("2026-11-14T14:00:00+02:00"), Date.parse("2026-11-14T12:00:00Z"));
  assert.equal(parseUtc("2026-11-14 12:00:00.318353 +0000 UTC"), Date.parse("2026-11-14T12:00:00.318Z"));
  assert.ok(Number.isNaN(parseUtc(12)));
});

test("MMSI filter keeps ship stations only", () => {
  for (const ok of ["622123456", "538009876", "215000001"]) assert.ok(isShipMmsi(ok), ok);
  for (const bad of ["123456789", "000000000", "111111111", "992221234", "970123456", "62212345", "6221234567", "222222222", 622123456.5]) assert.ok(!isShipMmsi(bad), String(bad));
});

test("aisstream-shaped message normalises; non-position and sentinel positions are rejected", () => {
  const raw = { MessageType: "PositionReport", MetaData: { MMSI: 622123456, time_utc: "2026-11-14 10:00:00.5 +0000 UTC" },
    Message: { PositionReport: { Latitude: 30.6, Longitude: 32.33, Sog: 7.9, Cog: 180, TrueHeading: 511, NavigationalStatus: 0 } } };
  const r = normalizeAisMessage(raw, { adapter: "aisstream", providerId: "aisstream" });
  assert.ok(r.ok);
  assert.equal(r.msg.heading, null); // 511 = not available
  assert.equal(r.msg.tsMs, Date.parse("2026-11-14T10:00:00.5Z"));
  assert.equal(normalizeAisMessage({ ...raw, MessageType: "ShipStaticData" }, { adapter: "aisstream" }).reason, "not_position_report");
  const sentinel = structuredClone(raw); sentinel.Message.PositionReport.Latitude = 91;
  assert.equal(normalizeAisMessage(sentinel, { adapter: "aisstream" }).reason, "invalid_position");
});

test("provider contract and health monitor separate transport from coverage", () => {
  assert.throws(() => assertAisProvider({ id: "x", licenceRef: "y", coverageStatus: "LIVE", start() {}, stop() {} }));
  assertAisProvider({ id: "x", licenceRef: "ToS-2026", coverageStatus: "UNVERIFIED", async start() {}, async stop() {} });
  let now = T0;
  const h = createHealthMonitor({ clock: () => now });
  h.onConnect();
  assert.equal(h.snapshot().transport, "CONNECTED_BUT_SILENT");
  h.onMessage({ ok: true });
  assert.equal(h.snapshot().transport, "FLOWING");
  assert.equal(h.snapshot().coverage, "UNKNOWN_UNTIL_RECONCILED");
  now += 11 * 60_000;
  assert.equal(h.snapshot().transport, "CONNECTED_BUT_SILENT");
});

test("replay sorts out-of-order capture and output CSV is accepted by the existing reconciliation parser", () => {
  const t = southbound("622123456").map((m) => JSON.stringify({ mmsi: m.mmsi, ts: new Date(m.tsMs).toISOString(), lat: m.lat, lon: m.lon }));
  const shuffled = [t[5], t[0], t[9], ...t.slice(1, 5), ...t.slice(6, 9), ...t.slice(10), "not json", JSON.stringify({ mmsi: "622123456", ts: "2026-11-01T00:00:00", lat: 31.4, lon: 32.35 })];
  const { records, stats } = replay(shuffled);
  assert.equal(records.filter((r) => r.kind === "TRANSIT").length, 1);
  assert.equal(stats.normaliserRejected.invalid_json, 1);
  assert.equal(stats.normaliserRejected.invalid_or_naive_timestamp, 1);
  const csv = transitsToCsv(records);
  const parsed = normalizePassages(csv, "ais");
  assert.ok(parsed.ok, JSON.stringify(parsed.errors));
  assert.equal(parsed.items.length, 1);
});
