# Project state, blockers and handover decisions — 2026-11-14

## Short verdict
**Operational target NOT MET.** Functional code, periodic source diagnostics, dated official aggregate traffic statistics and deterministic voyage modelling exist. Reliable 24/7 canal-wide AIS monitoring, institutional daily ground truth, authenticated per-vessel fuel/route particulars and audited ship emissions **do not**. Do not imply otherwise.

## What exists
| Component | Main files | What it actually does | Evidence tier |
|---|---|---|---|
| CERI-SC V9 main | `index.html` | Interactive historical and recent traffic UI, sample voyage modelling | Historical published + modelling |
| 2026 SCA official announcements | `data/sca-2026-official-announcements.json`, `sca-stats/announcements-2026.mjs` | October comparison, revenue, net tonnage, one-day and segmented container announcements | Published period-specific aggregate |
| SCA 2023–2025 series | `data/sca-official-monthly-2024-2025.json`, `sca-stats/official-stats.mjs` | Monthly and annual ship and net-ton totals; some calculated ratios | Published (manually transcribed, arithmetically checked) |
| Annual SCA archive watch | `scripts/sca-annual-archive-watch.mjs`, `data/sca-archive-status.json` | Daily page inspection for newly labelled annual PDFs | Publication monitor, NOT auto extraction |
| AIS Lab | `ais-lab/` | Browser-only AIS snapshot/WebSocket research and tentative transit state | Partial independent AIS; NO proven coverage |
| AIS hourly quality sampling | `scripts/ais-source-quality.mjs`, `src/ais-quality-history.mjs`, `data/ais-quality-*.json` | Stores aggregate 30-minute snapshot observations after periodic runs; 24h/7d diagnostic | Transport/source diagnostics, NOT transits |
| Local AIS vs SCA-like reference match | `ais-lab/reconciliation.mjs`, `ais-lab/reconcile.html` | MMSI/direction/time one-to-one match against uploaded file | User file NOT authenticated |
| Voyage computation | `src/voyage-audit.mjs` | Fixed-route speed and consumption user-input model, TTW combustion CO₂, sensitivity | Illustrative, non-certified |
| Batch voyage join | `src/ais-sca-voyage-pipeline.mjs`, `voyage-evidence.html` | Local 3 CSV join with rejection counts and aggregate hypothetical TTW outputs | User-source scenario only |
| Decision room | `decision-room.html` | Aggregates source-linked indicators and scenario analysis with evidence warnings | Mixed, explicit tiers |
| CI | `.github/workflows/`, `tests/` etc. | GitHub Pages, Node regression checks, periodic snapshots | Software tests, not external source calibration |

## High severity gaps
**BLOCKER A — AIS completeness.** Open Waters public regional bbox often yields only 1–9 distinct MMSI in recent snapshots; this is NOT the actual traffic count. Working socket ≠ known coverage. No persistent authorized always-on ingestion database. No provider SLA, 7-day truth set, real-time authenticity, or live transit confidence.

**BLOCKER B — official reconciliation.** Source pages and annual report archives do not provide a complete programmatic official daily/weekly/ship-level register. Public October 2026 announcement is not a full 2026 daily sequence. SCA data access and publishing authorization are needed to match AIS voyages and compute precision and recall.

**BLOCKER C — model provenance.** Most vessel-specific engine, fuel, weather, port/route, waiting time, speed and load factors are not independently measured. The current TTW model is arithmetically testable but no institutional verified emission saving result can be produced.

**BLOCKER D — lifecycle fuel factors.** Correct WtW depends on production pathway fuel-specific factors and CH4/N2O. V9 intentionally blocks unsupported WtW approximation; do not re-enable quick uplift or zero-emissions shortcuts.

**BLOCKER E — true 24/7 operation.** GitHub Pages is static. GitHub Actions cron provides periodic spot-checks and can skip/delay runs; not a durable event stream or continuous ship-state storage. Need backend, database, telemetry provider, monitoring, alerts and rights/credentials.

**BLOCKER F — IP and internal data.** The source is in a public repository. Do NOT push non-public SCA ship movements, staff, vendor secrets, licensed AIS coordinates or institutionally confidential data without explicit access/hosting approvals.

## Recent integration milestones
- PR #5: independent draft V9 engineering hardening (verify scope and status; do NOT overwrite).
- PR #6 AIS Lab creation; PR #7 diagnostics; PR #8 hourly source quality; PR #9 official statistics and reconciliation; PR #10 current-year homepage false-precision fix; PR #11 archive watcher; PR #12 October 2026 official KPI; PR #13 emissions integrity; PR #14 decision room; PR #15 trend/provenance; PR #16 hourly dedup; PR #17 vessel evidence batch importer. Verify actual merge status and branches.
- Baseline pre-handoff main commit: `1301c3edda27157fde14329e02a21d3b3c18893e`.
- Do not cherry-pick PRs already present in main.

## Quantities that must not be conflated
1. **Official 2025 annual traffic**: 12,758 vessels.
2. **Official October 2026 announcement**: 1,490 vessels **during October**, not annual 2026.
3. **Open Waters recent snapshot**: MMSI positions in approximate bbox over ~30-minute age limit; can contain duplicates over time, vessels not transiting.
4. **AIS-derived candidate passage**: a research heuristic, not SCA register.
5. **Modelled avoided TTW CO₂**: `fuel_cape - fuel_suez` times an EF; hypothetical unless actual inputs authenticated.
6. **Institutional Green Transit Certificate**: not currently issued/certified by this project.

## Key recommendation to GPT + Claude
Concentrate on closing A+B+C in that order, using one evidence chain from source → ship → transit → voyage particulars → route comparator → result → verifier. Require a distinct audit trail and benchmark against official SCA ground truth. No effort should be spent on extra dashboards until data ingestion completeness and uncertainty are validated.
