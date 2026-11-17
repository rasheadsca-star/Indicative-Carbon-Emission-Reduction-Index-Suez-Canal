import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
const read=p=>readFile(new URL(p,root),"utf8");
test("IMO 2012 historical user interface explicitly gates assumptions and avoids fake actuals",async()=>{
 const page=await read("imo-historical.html");
 for(const token of ["src/imo-historical-activity.mjs","data/imo-fleet-2012-reference-coefficients.json",
   "data/sca-official-ship-types-2023-2025.json","id=\"inputRows\"","id=\"year\"",
   "id=\"historicalComparison\"","id=\"export\"","SYNTHETIC_12_HOUR_EXAMPLE_UNVERIFIED_SIZE_AND_FUEL",
   "غير معتمد","ليست إجمالي انبعاثات القناة"])assert.ok(page.includes(token),token);
 assert.match(page,/computeIMOActivityScenario/);
 assert.match(page,/computeSimpleIMOExample/);
 assert.match(page,/validatedAvoidedCO2_t:null/);
});
test("IMO historical links appear in each navigational research overview",async()=>{
 const home=await read("index.html");
 const next=await read("next/index.html");
 assert.match(home,/href="\.\/next\/"/);
 assert.match(next,/href="\.\.\/imo-historical\.html"/);
});
test("IMO data retains exact original HFO CO2 reference, no WtW claim",async()=>{
 const j=JSON.parse(await read("data/imo-fleet-2012-reference-coefficients.json"));
 assert.equal(j.records.length,53);
 assert.equal(j.co2FactorHFO_tCO2_per_tFuel,3.114);
 assert.match(j.emissionsBoundary,/TTW combustion CO2/);
});
