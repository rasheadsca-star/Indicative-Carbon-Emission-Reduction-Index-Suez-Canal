#!/usr/bin/env node
/**
 * Local, offline replay of an AIS NDJSON capture through the transit FSM.
 *   node backend/replay.mjs <capture.ndjson> [--adapter canonical|aisstream] [--provider id] [--out transits.csv]
 * Messages are sorted by (MMSI, time) first, so batch replays are not affected by
 * out-of-order delivery. Writes candidate CSV (reconciliation-compatible) and
 * prints ingest statistics + non-transit records as JSON on stdout.
 * Output rows are AIS-INFERRED CANDIDATES, never official SCA transits.
 */
import { readFile, writeFile } from "node:fs/promises";
import { normalizeAisMessage } from "./ais-provider.mjs";
import { createTransitEngine, transitsToCsv } from "./transit-fsm.mjs";

export function replay(lines, { adapter = "canonical", providerId = "replay", nowMs } = {}) {
  const rejected = {}, msgs = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let raw;
    try { raw = JSON.parse(line); } catch { rejected.invalid_json = (rejected.invalid_json || 0) + 1; continue; }
    const r = normalizeAisMessage(raw, { adapter, providerId });
    if (r.ok) msgs.push(r.msg); else rejected[r.reason] = (rejected[r.reason] || 0) + 1;
  }
  msgs.sort((a, b) => a.mmsi.localeCompare(b.mmsi) || a.tsMs - b.tsMs);
  const end = nowMs ?? (msgs.length ? Math.max(...msgs.map((m) => m.tsMs)) : 0);
  const engine = createTransitEngine({ clock: () => end });
  const records = [];
  for (const m of msgs) { const rec = engine.ingest(m); if (rec) records.push(rec); }
  records.push(...engine.sweep(end));
  return { records, stats: { ...engine.stats(), normaliserRejected: rejected } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const file = args[0];
  if (!file || file.startsWith("--")) { console.error("usage: node backend/replay.mjs <capture.ndjson> [--adapter canonical|aisstream] [--provider id] [--out transits.csv]"); process.exit(2); }
  const text = await readFile(file, "utf8");
  const { records, stats } = replay(text.split(/\r?\n/), { adapter: opt("--adapter", "canonical"), providerId: opt("--provider", "replay") });
  const out = opt("--out", null);
  if (out) await writeFile(out, transitsToCsv(records));
  console.log(JSON.stringify({ claim: "AIS-inferred candidates; not official SCA transits; coverage unverified", stats,
    nonTransit: records.filter((r) => r.kind !== "TRANSIT"), transits: records.filter((r) => r.kind === "TRANSIT").length }, null, 2));
}
