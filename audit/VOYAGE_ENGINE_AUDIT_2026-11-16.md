# CERI-SC — Voyage integrity audit and implementation record
**Date:** 2026-11-16 · **Status:** DEVELOPMENT ONLY — NOT INSTITUTIONALLY VALIDATED

## Branch protection and baseline
- Public production main at audit: 9098c585a806295cc545f93023ad533a66f93a8b, "Restore CERI-SC V9.0 before November 14 updates".
- Original Green Route V4 + IMO historical integration found on independent branch feat/green-route-v4-imo-integrated-20261115. It retains 53 IMO 2012 type-size entries and SCA 2023–2025 passage series.
- New independent branch: work/ceri-sc-voyage-integrity-20261116. Neither main nor the existing integration branch were changed.

## Major observed defects and response
| Ref | Priority | Evidence / response |
| --- | --- | --- |
| V-01 | CRITICAL | Original NEXT applied 0.95 × fuel multiplier × (speed/15)^2.55 × nautical miles for CO2, no vessel propulsion power or SFOC. Replaced by separate physical voyage model. |
| V-02 | HIGH | Original NEXT Singapore–Rotterdam composed segments to 7,890 nm Suez and 11,260 nm Cape; official SCA figures 8,288/11,755. Replaced by official port pairs and gate for unsupported pairs. |
| V-03 | HIGH | Old LNG/methanol mass reduction multipliers failed energy-equivalence. Replaced with LHV-adjusted mass and physical CO2 factor; WtW still withheld. |
| V-04 | HIGH | NEXT showed 2021 31.0 Mt and 2023 45.0 Mt as Verified without supporting voyage audit. Removed from NEXT source section. |
| V-05 | HIGH | Curated IMO identity was implied to mean model-ready performance particulars. Now treated as identity only; engine inputs are independently editable. |
| V-06 | HIGH | Current toll data do not establish SCNT and dated tariff. Only user-entered toll supported; no official quote or fee guess. |
| V-07 | MEDIUM | Methane slip/N2O/WtW and machinery compatibility still unverified. They remain NOT COMPUTED. |
| V-08 | MEDIUM | Maps remain SVG schematic, not geodesic/hydrographic routes. Flagged as illustration. |
| V-09 | MEDIUM | Full Arabic engineering UI localization and browser visual QA are open. |

## Physical voyage equations
Historical IMO annual model is intentionally separate. Hypothetical main-engine power P(v) = P_reference × (v/v_reference)^3 × resistance multiplier.
Fuel consumption t = ((P_main kW × main SFOC g/kWh) + (P_aux kW × aux SFOC g/kWh)) × hours / 1,000,000.
The Suez route separates open-sea distance, a designated assumed canal segment and optional waiting; the Cape route uses independent open-sea distance and waiting. This avoids counting the canal segment twice.
Energy-equivalent selected-fuel mass = reference HFO mass × (40.4 MJ/kg / selected LHV MJ/kg). Equal engine efficiency and no pilot fuel are unverified model assumptions.
CO2 TTW = fuel mass × IMO physical carbon conversion factor. The model does NOT calculate WtW CO2e, methane slip, N2O, actual voyage reports, EU ETS/FuelEU charges or certified reductions.

## Net cost calculation
Only after user supplies fuel price (USD/tonne), daily operating cost (USD/day) and a toll (USD):
net saving = (Cape fuel t − Suez fuel t) × price + (Cape hours − Suez hours) / 24 × daily cost − user-entered toll.
Fuel cost and operating time cost are separate; time saving must not be counted a second time. The toll is NOT an official SCA quotation.

## SCA official route distance anchors
Source: https://www.suezcanal.gov.eg/English/About/Pages/WhySuezCanal.aspx
- Singapore–Rotterdam: 8,288 nm via Suez; 11,755 via Cape; 3,467 saved.
- Tokyo–Rotterdam: 11,192 / 14,507 nm.
- Ras Tanura–Rotterdam: 6,436 / 11,169 nm.
- Jeddah–Rotterdam: 3,997 / 10,797 nm.
- Jeddah–Piraeus: 1,316 / 11,207 nm.
Any unsupported port pair returns NO_VERIFIED_SCA_PORT_PAIR, never an invented great-circle distance.

## Reference sources
- IMO physical CO2 factors: https://wwwcdn.imo.org/localresources/en/OurWork/Environment/Documents/Air%20pollution/MEPC.346%2878%29.pdf
- IMO-hosted alternative fuel LHV reference: https://wwwcdn.imo.org/localresources/en/OurWork/Environment/Documents/Air%20pollution/Roadmap%20to%20Zero%20Emission%20from%20International%20Shipping%20-%20Japan%20March%202020.pdf
- IMO GreenVoyage2050 2012 historical fleet method: https://greenvoyage2050.imo.org/fleet-and-co2-calculator/
- SCA tariff tables: https://www.suezcanal.gov.eg/English/Navigation/Tolls/Pages/TollsTable.aspx
Fuel-spec values (notably B20 and B100 examples) are not universally valid bunkering certificates. Renewable methanol has positive physical exhaust CO2 even if a certified fuel pathway might have lower lifecycle impact.

## Verification and gates
- Deterministic test suite: node --test tests/voyage-physical.test.mjs.
- Entire integrated branch: npm test.
- Dedicated workflow: .github/workflows/voyage-physical.yml, runs on pull request.
- No claim of passing CI until workflow evidence exists.

## Remaining blockers before institutional release
1. Vessel power/speed curves, engine SFOC by load, real fuel/pilot fuel, weather and waiting measurements.
2. Official SCA ship-size/SCNT data and applicable tariff/surcharges for dated tolls.
3. Hydrographically valid geometry for arbitrary port pairs, draft/weather constraints, licences.
4. WtW pathway certification, CH4/N2O and proper regulation applicability for EU ETS/FuelEU.
5. Authorized AIS/ship particulars and matching with actual SCA transit registers.
6. Real preview deployment and browser desktop/tablet/mobile verification; print/PDF quality assurance.
7. Independent review before claiming institutional MRV or certified savings.

**Institutional release verdict: NOT APPROVED. Research-only scenario calculator pending verification.**
