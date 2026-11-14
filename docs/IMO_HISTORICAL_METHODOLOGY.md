# CERI-SC — IMO Fleet & CO2 Calculator historical activity integration

**Status:** original IMO coefficients integrated; retrospective **illustrative** scenarios available for officially published SCA ship-type passages 2023–2025. **NOT historical measured emissions.**

## Original uploaded model

Source workbook: `Fleet-and-CO2-calculator-for-input (5).xlsx` from IMO GreenVoyage2050 Fleet and CO₂ Calculator. It has two sheets: `Country emissions calculation` and `Third IMO GHG Study - Data 2012`. The model has 53 ship-type/size classes and reference per-ship annual fuel use (2012). This project carries those coefficients in `data/imo-fleet-2012-reference-coefficients.json`.

Verified original worksheet formulas, row 3:
- `E3='Third IMO GHG Study - Data 2012'!R2`
- `F3=E3*D3`: reference annual fuel per ship × average annual time fraction allocated to the fleet component.
- `G3=C3*F3`: multiply by fleet component's number of ships.
- `H3=G3*3.114`: convert HFO consumption to combustion CO₂, tonnes CO₂ per tonne fuel.

Example for one 8,000–11,999 TEU container ship, **12 annual hours as a hypothetical activity input**: 2012 reference annual fuel 29,568.788717939 t; equivalent activity 12/8760; fuel 40.50519 t; TTW combustion CO₂ 126.13316 t. No real Suez Canal passage is measured in this example.

**Critical difference:** SCA counts voyages/passage events, while IMO worksheet requires **number of ships in fleet component** and percentage of **their annual activity**. Treating all passage events as unique vessels with 100% annual operation in the canal is invalid. This project defines an explicit *equivalent annual activity scenario* per group:

`IMO_2012_tFuel_reference_per_ship × SCA_passages_in_group × allocated_size_share × (assumed_activity_hours_per_passage / 8760)`

`Indicative_tCO2 = scenario_tFuel × 3.114`.

The yearly *passage count* comes from official SCA table 3, but hours, fuel mix and size share are assumptions until independently evidenced. No fuel-speed/load/berth/canal-specific adjustment is built in. This is not the same as the real 2012 model fleet count or an engineering-grade transit energy estimate.

## SCA 2023–2025 source

`data/sca-official-ship-types-2023-2025.json` contains 9 published SCA ship-type groupings and two measures: passage count and net tonnage in **thousands of net tons**; manually transcribed from SCA official Annual Reports 2024 and 2025 Table 3. All 9 categories exactly reconcile to published whole-year totals. Both originals have a small 2024 category net-ton discrepancy; we use the later 2025 report for all 2024 row data and disclose that choice in the source manifest.

Important mapping caveats:
- SCA `Tankers` may include several IMO oil/chemical/other liquid tanker categories.
- SCA `LNG Ships` maps only approximately to IMO `Liquefied gas tanker` (which includes other gases).
- SCA `Passenger Ships` contains various ship types (cruise/ferries), with huge 2012 energy differences.
- SCA `Other` has **no defensible automatic type-size mapping**. Current modelling intentionally excludes it unless distinct official subtypes are provided and mapping is reviewed.

## Operational report and quality rules

UI: `imo-historical.html`, linked from V9 home, Decision Room, and Historical Performance.

Data/model files:
- `src/imo-historical-activity.mjs`, `src/imo-historical-activity.test.mjs`
- `data/imo-fleet-2012-reference-coefficients.json`
- `data/sca-official-ship-types-2023-2025.json`
- `tests/imo-historical-page.test.mjs`

By default, the full historical CO₂ field is **unavailable**, never zero. The user may explicitly select one IMO size class per SCA group and an assumed number of transit hours with an assumption reference. "Load hypothetical 12-hour example" is overtly synthetic and does **not** assert those sizes or fuel consumption are historically correct. The engine allows multiple class fractions per group up to 100%; the basic UI offers one class per group. The `Other` source bucket is not auto-allocated, so unvalidated *whole fleet* emissions remain null. All calculations are TTW combustion CO₂ for assumed HFO, not lifecycle CO₂e or saved emissions by sailing via Suez instead of the Cape.

**To move beyond indicative assumptions**, obtain by year and ship category: official ship-size distribution; canal/approach/anchorage time; actual fuel mix and operational phases (main/aux/boilers); consumption logs or a calibrated energy-load model; and matched voyage origin/destination route comparisons. Only then produce audited historical fuel and voyage CO₂ statistics with uncertainties. Historical IMO reference annual fuel alone does not establish actual ship-specific savings or SCA Scope 1/2/3 inventory.

## Testing

```bash
npm ci
npm test
node --test src/imo-historical-activity.test.mjs tests/imo-historical-page.test.mjs
```

The separate CI workflow `.github/workflows/imo-historical.yml` enforces the above and verifies source totals and example arithmetic. It does not certify historical activity or greenhouse-gas accuracy.
