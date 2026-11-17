import test from "node:test";
import assert from "node:assert/strict";
import {runVoyage} from "../src/voyage-physical.mjs";
import {runVoyageSensitivity} from "../src/voyage-sensitivity.mjs";
const i={origin:"Singapore",destination:"Rotterdam",speedKn:15,referenceSpeedKn:15,
  referenceMainPowerKw:18000,installedMainMcrKw:36000,auxiliaryPowerKw:900,
  mainSFOCgKwh:175,auxiliarySFOCgKwh:190,canalDistanceNm:105,
  canalTransitHours:12,waitingSuezHours:0,waitingCapeHours:0,
  weatherMultiplier:1,fuelEfficiencyRatio:1,fuelId:"HFO"};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,String(a)+" != "+String(b));

test("installed MCR is an explicit engineering bound, not guessed from speed",()=>{
  const a=runVoyage(i);
  assert.equal(a.powerEnvelope.enforced,true);
  assert.equal(a.powerEnvelope.installedMainMcrKw,36000);
  near(a.powerEnvelope.openSeaPowerKw,18000);
  assert.ok(a.powerEnvelope.canalRequestedPowerKw<36000);
  assert.throws(()=>runVoyage({...i,speedKn:20}),/MAIN_ENGINE_POWER_EXCEEDS_MCR/);
  assert.throws(()=>runVoyage({...i,referenceMainPowerKw:40000}),/REFERENCE_POWER_EXCEEDS_INSTALLED_MCR/);
  assert.throws(()=>runVoyage({...i,installedMainMcrKw:0}),/installedMainMcrKw/);
});
test("missing MCR is marked unverified, never silently inferred",()=>{
  const a=runVoyage({...i,installedMainMcrKw:null});
  assert.equal(a.powerEnvelope.enforced,false);
  assert.equal(a.powerEnvelope.installedMainMcrKw,null);
  assert.ok(a.assumptions.some(s=>s.includes("not supplied")));
});
test("3x3 sensitivity is deterministic with route distance held constant",()=>{
  const result=runVoyageSensitivity(i);
  assert.equal(result.status,"DETERMINISTIC_SENSITIVITY_NOT_STATISTICAL_UNCERTAINTY");
  assert.equal(result.rows.length,9);
  assert.ok(result.rows.every(r=>r.status==="CALCULATED_HYPOTHETICAL"));
  assert.ok(result.rows.every(r=>r.distanceSavedNm===3467));
  const base=runVoyage(i);
  const middle=result.rows.find(r=>r.speedKn===15&&r.additionalSuezWaitHours===0);
  near(middle.fuelSavedTonnes,base.fuelSavedTonnes);
  near(middle.daysSaved,base.daysSaved);
  const delayed=result.rows.find(r=>r.speedKn===15&&r.additionalSuezWaitHours===24);
  assert.ok(delayed.fuelSavedTonnes<middle.fuelSavedTonnes);
  assert.ok(delayed.daysSaved<middle.daysSaved);
});
test("sensitivity never extrapolates engine power beyond selected MCR",()=>{
  const r=runVoyageSensitivity({...i,speedKn:18});
  assert.equal(r.rows.length,9);
  assert.equal(r.rows.filter(row=>row.status==="BLOCKED_PHYSICAL_INPUT").length,3);
  assert.ok(r.rows.filter(row=>row.speedKn===20).every(row=>row.reason.includes("MCR")));
});
test("break-even canal toll is only computed when economic assumptions exist",()=>{
  const r=runVoyageSensitivity(i);
  assert.ok(r.rows.every(row=>row.breakEvenTollUsd===null));
  const priced=runVoyageSensitivity({...i,fuelPriceUsdPerTonne:600,
    dailyOperatingCostUsd:5000,userEnteredTollUsd:300000});
  const middle=priced.rows.find(row=>row.speedKn===15&&row.additionalSuezWaitHours===0);
  near(middle.breakEvenTollUsd,middle.fuelSavedTonnes*600+middle.daysSaved*5000);
  near(middle.netSavingUsd,middle.breakEvenTollUsd-300000);
  assert.equal(middle.officialTollUsd,null);
});
test("invalid sensitivity axes are blocked, not converted to pseudo-percentiles",()=>{
  assert.throws(()=>runVoyageSensitivity(i,{speedOffsetKnots:[-200]}),/INVALID_SPEED_OFFSET/);
  assert.throws(()=>runVoyageSensitivity(i,{additionalSuezWaitHours:[-5]}),/INVALID_SUEZ_WAIT_OFFSET/);
  assert.throws(()=>runVoyageSensitivity(i,{speedOffsetKnots:[]}),/INVALID_SENSITIVITY_DIMENSIONS/);
});
