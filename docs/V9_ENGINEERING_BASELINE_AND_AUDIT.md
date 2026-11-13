# CERI-SC V9 — adopted engineering baseline (2026-11-14)

## Decision
V9 in this repository is the **single primary development baseline**. The separate CERI-SC v5 research prototype remains a reference for independently tested algorithms and requirements; it must not overwrite V9 or silently mix models.

## Developer / independent critic — first remediation cycle
- **Critical finding:** direct manual annual CO₂ override could rescale category calculations to an arbitrary target while presenting the results as computed.
- **Fix:** the manual editor no longer accepts a CO₂ override. Legacy saved `reduction` values are ignored, not promoted to verified measurements.
- **Finding:** manual vessel count could retain an official status and an announced aggregate total despite changed traffic.
- **Fix:** manual traffic requires an explicit source and is marked `user-scenario`, with a per-transit proxy clearly marked indicative for years with official announced aggregates.
- **Regression:** new test checks disabled override, scenario provenance, count allocation, total adjustment, and reset. CI runs `npm test` on pull requests.

## Methodology restrictions and open items
- 2025 ship-type percentages applied to other years are **illustrative**, not historical actual distributions.
- The annual route-independent illustrative reduction index is not a voyage-level measured reduction and cannot be summed with institutional Scope 1/2/3 MRV as a verified reduction.
- ±20% in the scenario is an explicit sensitivity assumption, **not a statistically calibrated 95% confidence interval**.
- Vessel simulator uses representative fuel/consumption and simplified speed laws. Requires peer-reviewed factors and independent engineering validation.
- IMO number validation, emissions gas coverage (CH₄, N₂O), actual WtW pathways, provenance, uncertainty, and verifier-controlled certificates remain future gates.
- SCA daily data ingest must track source, date, direction, category, duplication, and provisional/official status; do not estimate missing historical categories from 2025 without a warning.
- Official institutional adoption requires separate approvals and verified operational evidence.

## Acceptance and deployment
Only merge after CI success and reviewer inspection. The published GitHub Pages main branch is unchanged by this development branch. No official Green Transit Certificate or actual carbon credit is produced. Claude review is deferred to project end.

## Developer / critic — navigation intake cycle 2 (2026-11-14)
- Added `navigation-data.mjs` with bounded CSV parsing, ISO date validation, explicit source provenance and categorical reconciliation.
- Added `navigation-data.html` (Arabic, RTL), reachable from the V9 header; exports records labelled `unverified-import` without changing route-engine inputs.
- Added `navigation-template.csv`, **synthetic only**, and `tests/navigation-data.mjs`; these tests run inside the existing CI quality gate.
- **Critic finding:** percentage-based tonnage matching allowed nontrivial discrepancies on large aggregated tonnages. Tightened to 0.01 absolute-unit tolerance and re-ran CI.
- A `TOTAL` record is never added to its category records; day/direction/type duplicates are rejected. A missing category breakdown stays explicitly incomplete; missing net tonnage is `null`, not zero.
- Mixed source provenance and incomplete aggregate/category coverage produce warnings, never silent official status.
- **Open gate:** no authenticated live SCA feed or externally validated historical category counts; do not substitute the unverified CSV for official observations, actual vessel fuel usage, or IMO-vetted GHG factors.
- **Open gate:** independent visual/browser accessibility testing and enterprise storage/role-based audit for imported datasets are not complete.
- The user requested Claude review only **at project completion**; not triggered.
