# CERI-SC durable AIS ingestion — architecture and deployment guide (WP2)

**Status 2026-11-14: design + tested core modules. NOT DEPLOYED. No licensed provider, no server, no SCA register.**
GitHub Pages stays a static front end. GitHub Actions cron stays a periodic diagnostic. Neither is 24/7 monitoring.

## 1. Components

```
 provider (licensed)           private server (always-on)                         consumers
 ┌──────────────┐  WSS/TCP  ┌───────────────────────────────────────────────┐
 │ AisProvider  │──────────▶│ collector: normalizeAisMessage → health monitor│
 │ (aisstream / │           │      │ accepted                                 │
 │  Spire / SCA │           │      ▼                                          │
 │  VTMS feed)  │           │ ais_position (partitioned, licence retention)   │
 └──────────────┘           │      │                                          │
                            │      ▼                                          │   aggregate-only JSON
                            │ transit FSM (backend/transit-fsm.mjs)           │──▶ (no positions/identities)
                            │      ▼                                          │   → Pages / Decision Room
                            │ transit_candidate ──▶ reconciliation_run ◀── official_passage (SCA_INTERNAL)
                            │ provider_health, ingest_reject, audit_event      │
                            └───────────────────────────────────────────────┘
```

| Module (in repo) | Role | Tested |
|---|---|---|
| `backend/ais-provider.mjs` | Provider contract, ship-MMSI filter, explicit-UTC parser, adapters, transport health | Yes (synthetic) |
| `backend/transit-fsm.mjs` | Per-vessel north→canal→south FSM, dedup, spoof filter, gap/coverage flags, sweep | Yes (synthetic) |
| `backend/replay.mjs` | Offline NDJSON replay → candidate CSV usable by `ais-lab/reconcile.html` | Yes |
| `backend/providers/aisstream.mjs` | WebSocket connector, server-side key, backoff | Fake socket only — never run live |
| `backend/schema.sql` | PostgreSQL tables incl. provenance and reconciliation guards | Not executed |

## 2. Transit FSM rules (versioned; change requires new `fsm_version`)
- Zones from `ais-lab/core.mjs#classifyZone` (single source). **Provisional**: north approach 31.28–31.65 N; south approach 29.70–30.04 N / ≥32.40 E; canal = ≤13 km from centreline 30.04–31.28 N. The canal zone includes Port Said, East Port Said and Ismailia berths → port calls surface as `LONG_DWELL` or `CANAL_VISIT`, not as normal transits. Replace with SCA/IHO chart polygons before any trial.
- `north→canal→south` = Southbound; `south→canal→north` = Northbound; same-side exit = `CANAL_VISIT_NOT_TRANSIT`.
- Time bounds: lower = first→last canal fix; upper = last approach fix → first exit fix. Upper < 3 h ⇒ rejected (≈193 km would need > 35 kn). Lower > 48 h ⇒ `LONG_DWELL` flag, LOW confidence.
- Confidence labels are heuristics (gap ≤ 1 h & ≥ 80 % canal-latitude coverage = HIGH; ≤ 4 h & ≥ 50 % = MEDIUM; else LOW). They are **not probabilities**; calibrate only against a complete official register.
- Dropped and counted: exact duplicates, conflicting same-timestamp fixes, late (out-of-order) fixes, implied speed > 40 kn, future timestamps > 2 min, naive timestamps.
- Known limitation: streaming mode has no reorder buffer; late fixes are dropped (replay mode sorts first). Add a 2–5 min watermark buffer in the collector.

## 3. API (private server; all responses carry `status` and `claim`)
| Endpoint | Auth | Returns |
|---|---|---|
| `GET /health` | none | process up, DB reachable |
| `GET /v1/providers/health` | staff | `provider_health` latest; `coverage:"UNKNOWN_UNTIL_RECONCILED"` unless a trial is approved |
| `GET /v1/transits?from&to&direction` | staff | `transit_candidate` rows (identities) — internal only |
| `GET /v1/public/daily-candidates?date` | public | **aggregate counts by direction + confidence only**, labelled AIS-inferred |
| `POST /v1/official/releases` | admin | register official release (sha256, access_class) |
| `POST /v1/reconciliation/runs` | admin | run matching; precision/recall NULL unless `reference_complete` |

## 4. Secrets and configuration (names only — values never in Git)
`AISSTREAM_API_KEY` (or `SPIRE_TOKEN` etc.), `DATABASE_URL`, `ADMIN_TOKEN_HASH`, `ALERT_WEBHOOK_URL`. Store in the host's secret manager. GitHub Actions secrets are acceptable only for the diagnostic sampler, never for licensed raw data that would be committed.

## 5. Deployment pathway (no paid service has been ordered)
1. **Data owner decision**: who signs the provider terms (user personally vs SCA). Record in `provider`.
2. **Host**: any always-on Linux VM or container service (SCA data centre preferred for internal register data). Node 22 + PostgreSQL 15. Cloudflare Workers/Pages and GitHub Actions are unsuitable for a persistent socket without paid Durable Objects.
3. **Run**: `node collector` (to be written around the tested modules: provider → normalise → insert → FSM → insert candidate), systemd/compose restart policy, 60 s health samples, alert after 10 min `CONNECTED_BUT_SILENT`.
4. **Publish**: nightly aggregate-only JSON pushed to the public repo/Pages through a PR or data branch; no MMSI, names or positions unless the licence allows.
5. **Trial (gate A06)**: ≥ 7 consecutive days; report messages/day, distinct MMSI/day by zone, gap distribution, latency, candidates/day vs SCA daily totals when available.
6. **Reconciliation (gate A08)**: only with a complete official ship-level register for the same days (`reference_complete=true`).

## 6. File schemas
- **Replay input (NDJSON, canonical)**: one JSON per line `{"mmsi":"622123456","ts":"2026-11-14T10:00:00Z","lat":30.6,"lon":32.33,"sog":7.9,"cog":180}`; `ts` must carry `Z` or `±hh:mm`. `--adapter aisstream` accepts raw provider frames.
- **Candidate CSV (output)**: `MMSI,Direction,Exit UTC,Entry Window Start UTC,Exit Window End UTC,Canal Hours Lower,Canal Hours Upper,Max Gap Hours,Lat Coverage,Confidence,Status,Flags` — first three columns are the `ais-lab/reconciliation.mjs` contract; `Exit UTC` = last canal fix (the true exit lies in the exit window, so reconciliation tolerance must cover it).
- **Official reference CSV / voyage operating CSV**: unchanged, see `CLAUDE_HANDOFF/DATA_SOURCES.md`.
- **Provenance manifest**: `data/official-traffic-provenance.json`, regenerated with `node scripts/build-provenance-manifest.mjs`; CI fails if official data change without it.

## 7. Offline use today
```bash
node backend/replay.mjs capture.ndjson --adapter aisstream --provider trial-1 --out transits.csv
# then upload transits.csv + an authenticated SCA reference CSV in ais-lab/reconcile.html
```
