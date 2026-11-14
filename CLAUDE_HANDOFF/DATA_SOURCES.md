# Sources and data dictionary

## Official SCA — original primary references
- **Annual reports archive:** https://www.suezcanal.gov.eg/English/Downloads/Pages/default.aspx?folder=Navigation%20Reports/Annual%20Reports%E2%80%8B%E2%80%8B%E2%80%8B
- **2025 annual report PDF:** https://www.suezcanal.gov.eg/English/Downloads/DownloadsDocLibrary/Navigation%20Reports/Annual%20Reports%E2%80%8B%E2%80%8B%E2%80%8B/2025.pdf
- **2024 annual report PDF:** https://www.suezcanal.gov.eg/English/Downloads/DownloadsDocLibrary/Navigation%20Reports/Annual%20Reports%E2%80%8B%E2%80%8B%E2%80%8B/2024.pdf
- **2026 October SCA press notice:** https://www.suezcanal.gov.eg/Arabic/MediaCenter/News/Pages/Sca_5-11-2026-%283%29.aspx
- **Jul–Sep 2026 container category:** https://www.suezcanal.gov.eg/English/MediaCenter/News/Pages/Sca_13-10-2026.aspx
- **One-day September 16, 2026 notice:** https://www.suezcanal.gov.eg/English/MediaCenter/News/Pages/Sca_16-9-2026_2.aspx

These URLs are stored in the code. Recheck publication, PDF table and coverage before using figures. SCA is the authority for official canal transit totals, but public aggregate tables do NOT identify ship-by-ship voyage attributes.

## Files and exact meaning
| File | Contents | Date/granularity | Status |
|---|---|---|---|
| `data/sca-official-monthly-2024-2025.json` | Annual 2023/24/25 plus monthly 2023/24/25 ship counts and net-tonnage (thousands of net tons) | Through Dec 2025 | Manually transcribed from annual reports, reconciled annual vs sum of monthly |
| `data/sca-2026-official-announcements.json` | Official press announced Oct 2026, container segment Jul–Sep, isolated Sept daily item | Different publication dates / scope | Primary attributed but not full 2026 series |
| `data/sca-archive-status.json` | SCA archive latest PDF listing/year and last check time | Daily spot-check | Publication monitoring, not contents |
| `data/ais-source-health.json` | HTTP availability and AIS-region 30-min snapshot meta; count of MMSIs per snapshot | Latest check | Unverified partial provider coverage |
| `data/ais-quality-history.json` | Aggregated region snapshots by time, excludes ship positions and names | Hourly job with possible extra push-run samples | Diagnostic snapshots; not ship passage events |
| `data/ais-quality-summary.json` | 24h/7d run and observation checks; no official passage count | Last evaluation | No validated coverage percentage |
| `examples/voyage-operating-template.csv` | Fabricated route/consumption/EF inputs for local testing | Synthetic | NEVER real voyage |
| `examples/voyage-ais-synthetic.csv` and `examples/voyage-reference-synthetic.csv` | Fabricated MMSI/direction/time examples | Synthetic | NEVER official source |
| `next/*.png`, `next/*.jpg` | Static imagery and UI assets | Repository | Not vessel measurement datasets |

## Relevant data schemas
- `ais-lab/reconciliation.mjs` uses AIS candidate CSV fields `MMSI,Direction,Exit UTC` and SCA-*format* reference CSV `MMSI,Direction,Exit UTC,Source`; only matches within user-selected UTC time tolerance.
- `src/ais-sca-voyage-pipeline.mjs` operating input CSV uses `MMSI,Direction,Exit UTC,Suez Distance Nm,Cape Distance Nm,Speed Kn,Sea Burn Tonnes Day,Suez Extra Hours,Cape Extra Hours,Standby Burn Tonnes Day,Combustion EF,Burn Sensitivity Pct,Distance Source,Fuel Source,Factor Source`. The operating CSV is joined to reference voyage **by exact MMSI+direction+reference exit UTC**, and reconciled to AIS candidate; source fields are mandatory but not authenticated.
- `src/voyage-audit.mjs`: fuel = sea leg hours/24 × daily sea consumption + additional hours/24 × daily standby consumption. TTW combustion CO₂ = fuel × combustion EF. Difference = Cape − Suez; negative allowed; independent route burn ±sensitivity assumption not statistical CI.
- `src/official-traffic-insights.mjs` verifies historical and recent SCA published periods before comparison. Ship count, net tonnage and net tonnage/transit have **distinct units**.

## Explicit missing datasets
- **A complete official SCA daily, weekly, and ship-by-ship register for current 2026** suitable for automated lawful import. Daily press items are sporadic and cannot form a complete time series.
- **Continuous AIS track histories** across north approach, canal and south approach with actual coverage and permitted re-use.
- **Authenticated ship design/operational data** (IMO/MMSI joins, engine power, daily fuel and load curve, fuel type, safe speed, main/aux demands, wait and weather, port-of-call route, consumption records).
- **Verified lifecycle GHG factors** by marine fuel supply pathway, CH₄, N₂O, WtW.
- **SCA verification credentials and data release approvals**. Do not put any of these in public repo or bundle.

## Allowed analysis vs prohibited inference
- Allowed: difference 2025 vs 2024 published vessel counts and net tonnage, approximate ratio, seasonal comparisons if period identical, descriptive trend with caveats, comparing a fully specified hypothetical voyage scenario.
- Prohibited: treating spot AIS count as unique transits; treating all 2026 arrivals as official monthly total; expanding one voyage's estimated savings to all canal transits; representing one fuel's combustion-zero as WtW-zero; issuing verified emissions reductions from user-uploaded unverified files.

## Recommended ingestion contract
Every ingested observation/event should carry:
`source_provider, source_url_or_license_id, origin_publisher, acquired_utc, publication_date, measurement_period_start, measurement_period_end, value, unit, precision, geographic_scope, vessel_class_scope, confidence_method, completeness_status, content_sha256, verifier_identity, verification_time, approval_status`.
For per-vessel data additionally include `MMSI/IMO join evidence, north/south direction, entry/exit timestamps UTC, route_id, fuel_type, propulsion/aux load, modeled_measured_label`.
