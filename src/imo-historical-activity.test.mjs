import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateIMOReference,validateSCATypes,computeIMOActivityScenario,computeSimpleIMOExample,HFO_EF,HOURS_PER_YEAR} from "./imo-historical-activity.mjs";
const load=async name=>JSON.parse(await readFile(new URL("../data/"+name,import.meta.url),"utf8"));
const [imo,sca,annual]=await Promise.all([
 load("imo-fleet-2012-reference-coefficients.json"),
 load("sca-official-ship-types-2023-2025.json"),
 load("sca-official-monthly-2024-2025.json")
]);
test("53 IMO annual fuel coefficient records and exact reference example",()=>{
 assert.equal(validateIMOReference(imo),true);
 const r=computeSimpleIMOExample(imo,{shipType:"Container",sizeCategory:"8000-11999",numberOfShips:1,annualActivityHours:12});
 assert.ok(Math.abs(r.fuel_t-40.50519002457)<1e-5);
 assert.ok(Math.abs(r.co2_t-126.133161736)<1e-5);
 assert.equal(r.annualTimeFraction,12/8760);
 assert.equal(HFO_EF,3.114);
 assert.equal(HOURS_PER_YEAR,8760);
});
test("SCA nine-group 2023–2025 annual ship counts exactly match monthly and full year totals",()=>{
 assert.equal(validateSCATypes(sca,annual),true);
 assert.deepEqual([sca.years[2023].shipCount,sca.years[2024].shipCount,sca.years[2025].shipCount],[26434,13213,12758]);
});
test("one documented hypothetical subgroup scenario equals IMO original activity equations",()=>{
 const res=computeIMOActivityScenario({year:2023,imo,sca,annual,assignments:[{
   scaType:"Container Ships",imoShipType:"Container",sizeCategory:"8000-11999",
   shareOfSCAPassages:1,hoursPerPassage:12,assumptionSource:"SYNTHETIC EXAMPLE ONLY"
 }]});
 assert.equal(res.rejected.length,0);
 assert.equal(res.rows.length,1);
 assert.equal(res.rows[0].officialPassagesInGroup,5847);
 assert.ok(Math.abs(res.rows[0].modelledFuel_t-5847*40.50519002457)<0.001);
 assert.ok(Math.abs(res.rows[0].modelledCO2_t-5847*126.133161736)<0.001);
 assert.equal(res.wholeFleetCO2_t,null);
 assert.equal(res.validatedAvoidedCO2_t,null);
 assert.equal(res.groups.find(x=>x.scaType==="Other").status,"UNMAPPED_OTHER_NEEDS_BREAKDOWN");
 assert.equal(res.estimatedNotMeasured,true);
});
test("no unsupported default assumptions: zero rows gives unavailable not zero historical CO2",()=>{
 const res=computeIMOActivityScenario({year:2024,imo,sca,annual,assignments:[]});
 assert.equal(res.modelledPortionCO2_t,null);
 assert.equal(res.wholeFleetCO2_t,null);
 assert.equal(res.groups.length,9);
});
test("wrong IMO type mapping, missing duration/source, duplicate classes, exceeding shares rejected",()=>{
 const base={scaType:"Bulk Carr.",imoShipType:"Bulk carrier",sizeCategory:"35000-59999",shareOfSCAPassages:.7,hoursPerPassage:12,assumptionSource:"research hypothesis"};
 const a=computeIMOActivityScenario({year:2025,imo,sca,annual,assignments:[
   {...base,imoShipType:"Container"},
   {...base,hoursPerPassage:0},
   {...base,assumptionSource:""},
   base,{...base}, // duplicate class
   {...base,sizeCategory:"60000-99999",shareOfSCAPassages:.5}, // over 100%
   {...base,scaType:"Other",sizeCategory:"35000-59999"}]});
 assert.equal(a.rows.length,1);
 assert.equal(a.rejected.length,6);
 assert.equal(a.wholeFleetCO2_t,null);
 assert.ok(a.rejected.some(x=>x.reason==="SHARES_EXCEED_100_PERCENT"));
 assert.ok(a.rejected.some(x=>x.reason==="MISSING_ASSUMPTION_SOURCE"));
 assert.ok(a.rejected.some(x=>x.reason==="UNMAPPED_OTHER_GROUP_REQUIRES_SUBTYPE_BREAKDOWN"));
});
test("mismatched SCA total fails before output, no false precision",()=>{
 const wrong=structuredClone(sca);wrong.years["2024"].groups["Bulk Carr."].passages++;
 assert.throws(()=>validateSCATypes(wrong,annual),/not reconciled/);
 assert.throws(()=>computeIMOActivityScenario({year:2024,imo,sca:wrong,annual,assignments:[]}),/not reconciled/);
});
test("the 2024 original-versus-newer Table 3 discrepancies remain visible",()=>{
 assert.match(sca.notes[0],/243313/);
 assert.match(sca.notes[0],/243315/);
 assert.equal(sca.years["2024"].groups.Tankers.netTonnageThousands,243315);
});
