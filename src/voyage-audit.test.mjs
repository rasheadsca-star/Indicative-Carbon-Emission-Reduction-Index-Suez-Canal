import test from "node:test";
import assert from "node:assert/strict";
import {computeVoyageScenario} from "./voyage-audit.mjs";
const inputs={suezDistanceNm:6000,capeDistanceNm:11000,speedKn:20,seaBurnTonnesDay:100,suezExtraHours:14,capeExtraHours:0,standbyBurnTonnesDay:12,combustionCO2TonnesPerTonne:3.114,burnSensitivityPct:10};
test("fixed-voyage reference arithmetic and provenance",()=>{
 const out=computeVoyageScenario(inputs);
 assert.equal(out.suez.seaHours,300);
 assert.equal(out.cape.seaHours,550);
 assert.equal(out.suez.fuelTonnes,1257);
 assert.ok(Math.abs(out.cape.fuelTonnes-2291.666666666667)<1e-9);
 assert.ok(Math.abs(out.deltaFuelTonnes-1034.6666666666667)<1e-8);
 assert.ok(Math.abs(out.deltaCO2Tonnes-out.deltaFuelTonnes*3.114)<1e-8);
 assert.equal(out.status,"UNVERIFIED_USER_SCENARIO");
 assert.equal(out.verified,false);
});
test("negative savings are preserved, never clipped to zero",()=>{
 const o=computeVoyageScenario({...inputs,suezDistanceNm:11000,capeDistanceNm:6000});
 assert.ok(o.deltaCO2Tonnes<0);
});
test("sensitivity range envelopes base result",()=>{
 const o=computeVoyageScenario(inputs);
 assert.ok(o.sensitivity.lowerCO2Tonnes<o.deltaCO2Tonnes);
 assert.ok(o.sensitivity.upperCO2Tonnes>o.deltaCO2Tonnes);
 assert.equal(o.sensitivity.assumptionPct,10);
});
test("bad physical inputs and non-verified zero-fuel tricks rejected",()=>{
 assert.throws(()=>computeVoyageScenario({...inputs,speedKn:0}),/Invalid ship speed/);
 assert.throws(()=>computeVoyageScenario({...inputs,combustionCO2TonnesPerTonne:0}),/Invalid combustion EF/);
 assert.throws(()=>computeVoyageScenario({...inputs,suezDistanceNm:-5}),/Invalid Suez distance/);
 assert.throws(()=>computeVoyageScenario({...inputs,burnSensitivityPct:100}),/Invalid sensitivity/);
});