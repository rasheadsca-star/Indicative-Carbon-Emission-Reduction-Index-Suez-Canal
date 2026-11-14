# Acceptance, release and independent review plan

## Definition of done
A claim is **completed** only when a GitHub commit with passing source/unit/integration tests, a deployed URL, and independent evidence showing the functionality can be reproduced are available. Deploy success alone is not proof of ship coverage or scientific accuracy.

| ID | Gate | Pass criterion | Current |
|---|---|---|---|
| A01 | Canonical base | Correct main SHA and clean branch; no removal of previous modules | Repository exists, reverify |
| A02 | Repo package | Every tracked source/data/test/binary included, SHA256 manifest and counts; no secrets | Build workflow in handoff |
| A03 | SCA monthly | All 2023–25 annual totals = sum of 12 monthly counts and net tonnages | Software checks exist |
| A04 | SCA recent | October 2026 indicator has source, date, units, scope and comparison | Partial official release |
| A05 | Official daily/weekly | Complete legally accessible daily source, gap checks, calendar and cross-check | **BLOCKED** |
| A06 | Real AIS | Licensed/approved always-on source, >=7 day representative coverage trial, latency, missing/duplicate rate recorded | **BLOCKED** |
| A07 | Passage detection | Enter → canal → exit FSM, north/south timing, duplicate/false candidate test | Prototype; ground truth blocked |
| A08 | AIS-to-official QA | Match to complete independent official register, precision/recall with confidence methods | **BLOCKED** |
| A09 | Vessel particulars | IMO/MMSI, fuel, distance, power/speed/aux profile and data source verified per voyage | User CSV only |
| A10 | TTW model | Reference fuel/CO2 calculation within documented numerical tolerance, uncertainties and signed results | Tests exist, calibration pending |
| A11 | WtW fuel pathway | Validated factors incl CH4/N2O by fuel/fuel pathway; no generic uplift | **BLOCKED** |
| A12 | Audit report | Calculations, input refs, units, model version, source timestamps, record IDs and approval | Partial local JSON |
| A13 | Privacy and rights | No secret or restricted AIS/ship data in public bundle/site; licences captured | Check required |
| A14 | 24/7 operability | Backend uptime monitoring, reconnect, durable DB, retention and alerting | **NOT IMPLEMENTED** |
| A15 | Acceptance | Real vessel scenario signed off by SCA domain engineer + independent methodology reviewer | **BLOCKED** |

## Ten independent adversarial audit cycles
Each cycle must have: defect hypothesis, reproduction steps, test sample, automated/manual evidence, actual observation, severity, fix ID and retest result.
1. **Source and licensing** — official SCA vs public article, rights, unavailable sources, link tampering.
2. **Completeness and time periods** — missing days, bad month-end/leap dates, timezone EET/UTC, stale snapshots.
3. **AIS signal validation** — zero-message socket, spoofed/static MMSI, bbox order, positions outside canal.
4. **Passage duplicates / FSM** — repeated messages, direction reversals, AIS outages, two transit events for same ship.
5. **Reference join** — MMSI/IMO misjoins, conflicting timestamps, ambiguous records, local file source spoofing.
6. **Marine fuel model** — speed vs consumption curve, loading, auxiliary demand, canal stop, unrealistic distances.
7. **GHG factor boundaries** — CO₂ vs CO₂e, TTW vs WtW, methane/N2O, alternative fuel pathways.
8. **Uncertainty and aggregation** — non-additive snapshots, sample selection, negative savings and confidence claims.
9. **Security and confidentiality** — credentials, raw AIS PII/location and confidential SCA files in public repo.
10. **Frontend/deployment** — genuine browser date/values, service worker caching, Pages/Workers, ZIP reproducibility and rollback.

## Reproduction commands
```bash
npm ci
npm test
node --test ais-lab/*.test.mjs
node --test src/*.test.mjs
node --test sca-stats/*.test.mjs
node --test tests/decision-room.test.mjs
node --check scripts/ais-source-quality.mjs
node --check scripts/sca-annual-archive-watch.mjs
```

## Deployment and PR controls
- PR scope limited and documented; branch derived from current main. No direct overwrite of existing applications, no merge before green CI.
- Changes requiring provider credentials must deploy via secure backend secrets; record *required secret names*, not their values.
- The test runner must not fetch untrusted external input as executable code or import confidential data to public CI.
- Attach before/after screenshots with explicit published deployment URL and UTC time; evaluate actual browser data loaded, not screenshot text alone.
- On any regression, revert the new PR rather than overwrite main.

## Operational claims forbidden until verified
- “Live vessel traffic for entire Suez Canal”
- “All transit events captured”
- “Official validated daily fleet counts”
- “Certified CO₂ savings/credits”
- “Well-to-Wake net zero” from missing lifecycle emission factors
- “24/7 monitoring” from GitHub Pages or hourly Actions

## Recommended near-term milestones
M1: audited current-data release and deployment stability + data gap register.
M2: provider proof-of-coverage and lawful official reference access.
M3: durable AIS backend/track database + passage validation.
M4: vessel-specific calibrated route/fuel/CO₂ audit.
M5: pilot cohort, reviewer acceptance and MRV/certificate design.
