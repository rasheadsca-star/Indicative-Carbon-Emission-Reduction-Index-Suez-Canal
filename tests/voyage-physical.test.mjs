import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {JSDOM} from "jsdom";
import {OFFICIAL_ROUTES,FUELS,validIMO,runVoyage} from "../src/voyage-physical.mjs";
const input={
  origin:"Singapore",destination:"Rotterdam",speedKn:15,referenceSpeedKn:15,
  referenceMainPowerKw:18000,auxiliaryPowerKw:900,mainSFOCgKwh:175,
  auxiliarySFOCgKwh:190,canalDistanceNm:105,canalTransitHours:12,
  waitingSuezHours:0,waitingCapeHours:0,weatherMultiplier:1,
  fuelId:"HFO",fuelPriceUsdPerTonne:null,userEnteredTollUsd:null,
  dailyOperatingCostUsd:null
};
const near=(a,b,precision=1e-8)=>assert.ok(Math.abs(a-b)<precision,String(a)+" != "+String(b));

test("official SCA Singapore–Rotterdam distance and exact savings",()=>{
  assert.deepEqual(OFFICIAL_ROUTES["Singapore|Rotterdam"],{suezNm:8288,capeNm:11755});
  const v=runVoyage(input);
  assert.equal(v.distanceSavedNm,3467);
  assert.equal(v.suez.distanceNm,8288);
  assert.equal(v.cape.distanceNm,11755);
  assert.equal(v.verifiedVoyage,false);
  assert.equal(v.status,"SCA_OFFICIAL_DISTANCE__ASSUMED_ENGINE_VOYAGE");
});

test("sea engine physical power/SFOC reference arithmetic and canal split",()=>{
  const x=runVoyage(input);
  const cruiseHours=(8288-105)/15;
  const capeHours=11755/15;
  const canalPower=18000*(105/12/15)**3;
  const suezFuel=(18000*175+900*190)*cruiseHours/1e6+
    (canalPower*175+900*190)*12/1e6;
  const capeFuel=(18000*175+900*190)*capeHours/1e6;
  near(x.suez.fuelTonnes,suezFuel);
  near(x.cape.fuelTonnes,capeFuel);
  near(x.ttWCO2SavedTonnes,(capeFuel-suezFuel)*3.114);
  near(x.hoursSaved,capeHours-cruiseHours-12);
});

test("cube speed power scales consumption, while time shortens",()=>{
  const slow=runVoyage({...input,speedKn:12});
  const fast=runVoyage({...input,speedKn:20});
  assert.ok(slow.cape.totalHours>fast.cape.totalHours);
  assert.ok(slow.cape.fuelTonnes<fast.cape.fuelTonnes);
  assert.ok(slow.cape.ttWCO2Tonnes<fast.cape.ttWCO2Tonnes);
});

test("equal energy is preserved under alternative fuel mass conversions",()=>{
  const h=runVoyage(input),m=runVoyage({...input,fuelId:"METHANOL"});
  near(h.suez.fuelTonnes*FUELS.HFO.lhvMJkg,m.suez.fuelTonnes*FUELS.METHANOL.lhvMJkg);
  assert.ok(m.suez.fuelTonnes>h.suez.fuelTonnes);
});

test("physical methanol CO2 is not zero; lifecycle unavailable for any fuel",()=>{
  for(const f of ["METHANOL","EMETHANOL","LNG","B100","B20","EAMMONIA","EHYDROGEN"]){
    const v=runVoyage({...input,fuelId:f});
    assert.equal(v.wtWCO2eSavedTonnes,null);
    assert.equal(v.euEtsCostUsd,null);
    assert.equal(v.fuelEUCostUsd,null);
    assert.equal(v.imoGfiCostUsd,null);
  }
  assert.ok(runVoyage({...input,fuelId:"EMETHANOL"}).suez.ttWCO2Tonnes>0);
  assert.equal(runVoyage({...input,fuelId:"EAMMONIA"}).suez.ttWCO2Tonnes,0);
});

test("no fictional official tolls or net cost where data are missing",()=>{
  const a=runVoyage(input);
  assert.equal(a.officialTollUsd,null);
  assert.equal(a.tollEstimateUsd,null);
  assert.equal(a.netSavingUsd,null);
  const b=runVoyage({...input,fuelPriceUsdPerTonne:550,
    dailyOperatingCostUsd:10000,userEnteredTollUsd:700000});
  near(b.netSavingUsd,b.fuelSavedTonnes*550+b.hoursSaved/24*10000-700000);
  assert.equal(b.officialTollUsd,null);
});

test("unverified routes are rejected, not rendered as great-circle or composites",()=>{
  assert.throws(()=>runVoyage({...input,origin:"Shanghai"}),/NO_VERIFIED_SCA_PORT_PAIR/);
  assert.throws(()=>runVoyage({...input,origin:"Tokyo",destination:"Piraeus"}),/NO_VERIFIED/);
  assert.equal(Object.keys(OFFICIAL_ROUTES).length,5);
});

test("reject out-of-bound physical inputs, unsupported fuels and missing fields",()=>{
  assert.throws(()=>runVoyage({...input,speedKn:0}),/speedKn/);
  assert.throws(()=>runVoyage({...input,speedKn:100}),/speedKn/);
  assert.throws(()=>runVoyage({...input,referenceMainPowerKw:-1}),/referenceMainPowerKw/);
  assert.throws(()=>runVoyage({...input,weatherMultiplier:-1}),/weatherMultiplier/);
  assert.throws(()=>runVoyage({...input,canalDistanceNm:0}),/Canal segment/);
  assert.throws(()=>runVoyage({...input,canalDistanceNm:105,canalTransitHours:1}),/implausible/);
  assert.throws(()=>runVoyage({...input,fuelId:"UNLISTED"}),/UNKNOWN_FUEL/);
});

test("weather and wait sensitivity actually change outputs",()=>{
  const base=runVoyage(input);
  const wx=runVoyage({...input,weatherMultiplier:1.12});
  assert.ok(wx.cape.fuelTonnes>base.cape.fuelTonnes);
  const longWait=runVoyage({...input,waitingSuezHours:30});
  assert.ok(longWait.suez.totalHours>base.suez.totalHours);
  assert.ok(longWait.fuelSavedTonnes<base.fuelSavedTonnes);
});

test("negative economic and emission savings remain negative where physical scenario permits",()=>{
  const slowCanal=runVoyage({...input,referenceMainPowerKw:1,auxiliaryPowerKw:15000,
    waitingSuezHours:500});
  assert.ok(slowCanal.fuelSavedTonnes<0);
  assert.ok(slowCanal.ttWCO2SavedTonnes<0);
});

test("IMO check digit is a screening control, not evidence of verified ship machinery",()=>{
  assert.equal(validIMO("9811000"),true);
  assert.equal(validIMO("IMO 9811000"),true);
  assert.equal(validIMO("9811001"),false);
  assert.equal(validIMO("00000"),false);
});

test("NEXT interface imports the canonical module and excludes known false-precision formulas",async()=>{
  const html=await readFile(new URL("../next/index.html",import.meta.url),"utf8");
  assert.match(html,/import \{runVoyage,validIMO,SCA_DISTANCE_SOURCE,IMO_CO2_SOURCE\}/);
  assert.match(html,/weatherMultiplier:readNum\("weather"\)/);
  assert.match(html,/id="mainSfoc"/);
  assert.match(html,/id="toll"/);
  assert.match(html,/Not calculated/);
  assert.doesNotMatch(html,/rate=\.95\*fuel\*Math\.pow/);
  assert.doesNotMatch(html,/Singapore:\{suez:4660,cape:5050\}/);
  assert.doesNotMatch(html,/31\.0 Mt|45\.0 Mt/);
});

test("NEXT markup has required engineering controls and syntactically valid module",async()=>{
  const html=await readFile(new URL("../next/index.html",import.meta.url),"utf8");
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match,"one module script expected");
  const asClassic=match[1].replace(/^import .*?;\s*$/m,"");
  new vm.Script(asClassic,{filename:"next-inline-checked.js"});
  const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://localhost/next/"});
  for(const id of ["origin","destination","speed","fuel","weather","mainPower","auxPower","mainSfoc","auxSfoc","canalDistance","canalHours","waitSuez","waitCape","fuelPrice","toll","opex","avoided","calcStatus","exportBtn"]){
    assert.ok(dom.window.document.getElementById(id),"missing control "+id);
  }
  dom.window.close();
});
