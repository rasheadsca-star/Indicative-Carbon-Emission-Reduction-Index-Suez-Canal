import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runVoyage} from "../src/voyage-physical.mjs";
import {screenEUETS} from "../src/regulation-screen.mjs";
const ref=runVoyage({origin:"Singapore",destination:"Rotterdam",
  speedKn:15,referenceSpeedKn:15,referenceMainPowerKw:18000,auxiliaryPowerKw:900,
  mainSFOCgKwh:175,auxiliarySFOCgKwh:190,canalDistanceNm:105,
  canalTransitHours:12,waitingSuezHours:0,waitingCapeHours:0,
  weatherMultiplier:1,fuelId:"HFO"});
const close=(x,y)=>assert.ok(Math.abs(x-y)<1e-8, String(x)+" != "+String(y));
const opts={grossTonnage:120000,shipService:"cargo",reportingYear:2026,
  directPortCallsConfirmed:true,allowancePriceEur:80};
test("EU-to-nonEU direct route screening is 50%, 2026 surrender 100%, CO2-only",()=>{
  const x=screenEUETS(ref,opts);
  assert.equal(x.status,"POTENTIAL_EU_ETS_SCOPE_CO2_ONLY");
  assert.equal(x.voyageLegCoverageFraction,.5);
  assert.equal(x.surrenderFractionOfReportingYear,1);
  close(x.co2OnlyIllustrativeCostSaved_EUR,ref.ttWCO2SavedTonnes*.5*80);
  assert.equal(x.includesCH4N2O,true);
  assert.equal(x.fullEtsCostSaved_EUR,null);
  assert.equal(x.verifiedCompliance,false);
});
test("phase-in in emission years is 40% in 2024 and 70% in 2025",()=>{
  const old=screenEUETS(ref,{...opts,reportingYear:2024});
  const mid=screenEUETS(ref,{...opts,reportingYear:2025});
  close(old.co2OnlyIllustrativeCostSaved_EUR,ref.ttWCO2SavedTonnes*.5*.4*80);
  close(mid.co2OnlyIllustrativeCostSaved_EUR,ref.ttWCO2SavedTonnes*.5*.7*80);
  assert.equal(old.includesCH4N2O,false);
  assert.equal(mid.includesCH4N2O,false);
});
test("actual ship GT and consecutive external EU port calls are mandatory",()=>{
  const missing=screenEUETS(ref,{...opts,grossTonnage:null});
  const small=screenEUETS(ref,{...opts,grossTonnage:4000});
  const brokenLeg=screenEUETS(ref,{...opts,directPortCallsConfirmed:false});
  const unknown=screenEUETS(ref,{...opts,shipService:"unknown"});
  for(const x of [missing,small,brokenLeg,unknown]){
    assert.equal(x.status,"EU_ETS_SCOPE_NOT_ESTABLISHED");
    assert.equal(x.co2OnlyIllustrativeCostSaved_EUR,null);
    assert.equal(x.voyageLegCoverageFraction,null);
  }
});
test("FuelEU never becomes fixed CO2 tax, and IMO NZF remains a policy proposal",()=>{
  const x=screenEUETS(ref,opts);
  assert.equal(x.fuelEU.usesWtW,true);
  assert.equal(x.fuelEU.penaltyEUR,null);
  assert.equal(x.imoNetZero.mandatoryCostEUR,null);
  assert.equal(x.imoNetZero.status,"DRAFT_NOT_ADOPTED_AS_OF_2026_11_17");
});
test("no assumed EUA price or future legislation status",()=>{
  const x=screenEUETS(ref,{...opts,allowancePriceEur:null});
  assert.equal(x.co2OnlyIllustrativeCostSaved_EUR,null);
  assert.throws(()=>screenEUETS(ref,{...opts,reportingYear:2029}),/OUT_OF_REVIEW_PERIOD/);
  assert.throws(()=>screenEUETS(ref,{...opts,allowancePriceEur:-3}),/INVALID_EUA_PRICE/);
});
test("UI has required eligibility and unit-separated European model controls",async()=>{
  const h=await readFile(new URL("../next/index.html",import.meta.url),"utf8");
  for(const n of ['id="grossTonnage"','id="shipService"','id="reportingYear"',
    'id="euaPrice"','id="directPortCalls"','id="etsResult"','id="policyStatus"'])
    assert.ok(h.includes(n),n);
  assert.match(h,/screenEUETS/);
  assert.match(h,/IMO Net-Zero Framework still draft as of 17 Nov 2026/);
});
