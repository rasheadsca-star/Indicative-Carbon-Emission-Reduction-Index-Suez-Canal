import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {computeSCA2024BaseToll,SCA_2024_BASE_RATES,TOLL_BAND_WIDTHS} from "../src/sca-tolls-2024.mjs";
import {estimateScenarioWtW} from "../src/fuel-lca-scenario.mjs";
import {runVoyage,FUELS} from "../src/voyage-physical.mjs";

const voyageInputs={
  origin:"Singapore",destination:"Rotterdam",speedKn:15,referenceSpeedKn:15,
  referenceMainPowerKw:18000,auxiliaryPowerKw:900,
  mainSFOCgKwh:175,auxiliarySFOCgKwh:190,canalDistanceNm:105,
  canalTransitHours:12,waitingSuezHours:0,waitingCapeHours:0,
  weatherMultiplier:1,fuelEfficiencyRatio:1,fuelId:"HFO"
};
const close=(x,y)=>assert.ok(Math.abs(x-y)<1e-8, x+" != "+y);
test("official 2024 eight progressive SCNT bands reconcile to published 100k container example",()=>{
  assert.deepEqual(TOLL_BAND_WIDTHS,[5000,5000,10000,20000,30000,50000,60000,Infinity]);
  const r=computeSCA2024BaseToll({scnt:100000,vesselClass:"CONTAINER",loadState:"laden"});
  assert.equal(r.baseSDR,439500);
  assert.deepEqual(r.breakdown.map(b=>b.scnt),[5000,5000,10000,20000,30000,30000,0,0]);
  assert.equal(r.baseUsd,null);
  assert.equal(r.officialInvoice,false);
  assert.equal(r.finalPayableUSD,null);
  assert.equal(r.notCurrentTariffValidated,true);
  assert.equal(r.effectiveFrom,"2024-01-15");
});
test("above 130k SCNT accumulates 60k seventh tier and then remainder",()=>{
  const r=computeSCA2024BaseToll({scnt:210000,vesselClass:"CONTAINER",loadState:"laden"});
  assert.deepEqual(r.breakdown.map(b=>b.scnt),[5000,5000,10000,20000,30000,50000,60000,30000]);
  close(r.baseSDR,r.breakdown.reduce((s,b)=>s+b.scnt*b.rateSDRperSCNT,0));
  assert.equal(r.breakdown[7].rateSDRperSCNT,2.88);
});
test("2024 rate class and condition materially change base toll",()=>{
  const c=computeSCA2024BaseToll({scnt:100000,vesselClass:"CONTAINER",loadState:"laden"});
  const b=computeSCA2024BaseToll({scnt:100000,vesselClass:"CONTAINER",loadState:"ballast"});
  const g=computeSCA2024BaseToll({scnt:100000,vesselClass:"LNG_TANKER",loadState:"laden"});
  assert.ok(c.baseSDR>b.baseSDR);
  assert.ok(g.baseSDR!==c.baseSDR);
  assert.deepEqual(SCA_2024_BASE_RATES.PRODUCT_TANKER.ballast,SCA_2024_BASE_RATES.CRUDE_TANKER.ballast);
});
test("SDR/USD conversion only uses user-supplied FX; no fake live rate",()=>{
  const r=computeSCA2024BaseToll({scnt:100000,vesselClass:"CONTAINER",loadState:"laden",usdPerSdr:1.4});
  close(r.baseUsd,615300);
  assert.equal(r.surchargeSDR,null);
  assert.equal(r.rebateSDR,null);
  assert.equal(r.serviceFeeUSD,null);
  assert.equal(r.finalPayableUSD,null);
});
test("actual fractional SCNT is not silently rounded to integer",()=>{
  const r=computeSCA2024BaseToll({scnt:5000.75,vesselClass:"DRY_BULK",loadState:"laden"});
  close(r.baseSDR,5000*10.13+.75*7.74);
});
test("unknown class, DWT/GT substitution, negative tonnage, or missing state are blocked",()=>{
  assert.throws(()=>computeSCA2024BaseToll({scnt:0,vesselClass:"CONTAINER",loadState:"laden"}),/INVALID_SCNT/);
  assert.throws(()=>computeSCA2024BaseToll({scnt:NaN,vesselClass:"CONTAINER",loadState:"laden"}),/INVALID_SCNT/);
  assert.throws(()=>computeSCA2024BaseToll({dwt:100000,vesselClass:"CONTAINER",loadState:"laden"}),/INVALID_SCNT/);
  assert.throws(()=>computeSCA2024BaseToll({scnt:100000,vesselClass:"UNLISTED",loadState:"laden"}),/UNSUPPORTED_SCA_CLASS/);
  assert.throws(()=>computeSCA2024BaseToll({scnt:100000,vesselClass:"CONTAINER"}),/UNKNOWN_LOAD_STATE/);
});
test("B100 FAME fuel intensity and mass-blended B20 energy are corrected",()=>{
  assert.equal(FUELS.B100.lhvMJkg,37.2);
  assert.equal(FUELS.B100.physicalCO2,2.834);
  close(FUELS.B20.lhvMJkg,0.2*37.2+0.8*40.4);
  close(FUELS.B20.physicalCO2,0.2*2.834+0.8*3.114);
});
test("engine efficiency input affects energy-based alternative fuel consumption",()=>{
  const a=runVoyage({...voyageInputs,fuelId:"B100",fuelEfficiencyRatio:1});
  const b=runVoyage({...voyageInputs,fuelId:"B100",fuelEfficiencyRatio:.8});
  assert.ok(b.cape.fuelTonnes>a.cape.fuelTonnes);
  assert.throws(()=>runVoyage({...voyageInputs,fuelEfficiencyRatio:0}),/fuelEfficiencyRatio/);
});
test("user-pathway WtW respects energy units and never marks scenario as certified",()=>{
  const voyage=runVoyage(voyageInputs);
  const result=estimateScenarioWtW(voyage,{gCO2ePerMJ:90,
    productionPathway:"specified reference HFO pathway",
    engineTechnology:"reference engine technology",
    evidenceReference:"example published research pathway"});
  close(result.suezWtW_tCO2e,voyage.suez.fuelTonnes*40.4*90/1000);
  close(result.deltaWtW_tCO2e,voyage.fuelSavedTonnes*40.4*90/1000);
  assert.equal(result.verified,false);
  assert.equal(result.certified,false);
  assert.equal(result.status,"USER_SUPPLIED_WTW_PATHWAY_SCENARIO_UNVERIFIED");
});
test("no universal default WtW, no synthetic valid pathway metadata",()=>{
  const v=runVoyage(voyageInputs);
  assert.throws(()=>estimateScenarioWtW(v),/INVALID_WTW_FACTOR/);
  assert.throws(()=>estimateScenarioWtW(v,{gCO2ePerMJ:90,productionPathway:"p",engineTechnology:"engine",evidenceReference:"src"}),/MISSING_PRODUCTION_PATHWAY/);
  assert.throws(()=>estimateScenarioWtW(v,{gCO2ePerMJ:999,
    productionPathway:"named production pathway",engineTechnology:"named engine",
    evidenceReference:"provided external certificate"}),/INVALID_WTW_FACTOR/);
});
test("NEXT UI exposes controls, provenance and separate results",async()=>{
  const html=await readFile(new URL("../next/index.html",import.meta.url),"utf8");
  for(const needle of ['id="scnt"','id="tollClass"','id="tollState"','id="sdrFx"',
    'id="tollBaseResult"','id="tollBreakdown"','id="useHistoricalBase"',
    'id="wtwFactor"','id="fuelPathway"','id="engineTech"','id="pathwayRef"',
    'id="wtwResult"','id="fuelEfficiency"'])assert.ok(html.includes(needle),needle);
  assert.match(html,/2024 BASE USD as a hypothetical toll/);
  assert.match(html,/estimateScenarioWtW/);
  assert.match(html,/computeSCA2024BaseToll/);
});
