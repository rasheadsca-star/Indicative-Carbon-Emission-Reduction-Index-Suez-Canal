import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM} from "jsdom";
import {runVoyage} from "../src/voyage-physical.mjs";
const html=await readFile(new URL("../next/offline.html",import.meta.url),"utf8");
const create=()=>new JSDOM(html,{runScripts:"dangerously",url:"https://offline-local.test/next/offline.html"});
test("offline HTML embeds all models and requires no imported ES modules or network",()=>{
  assert.doesNotMatch(html,/<script type="module">/);
  assert.doesNotMatch(html,/import \{runVoyage.*from/);
  for(const fn of ["runVoyage","computeSCA2024BaseToll","estimateScenarioWtW","screenEUETS","runVoyageSensitivity"])
    assert.ok(html.includes(fn+"="+fn),fn);
  const dom=create();
  try{
    assert.match(dom.window.document.getElementById("distanceSaved").textContent,/3,467 nm/);
    assert.match(dom.window.document.getElementById("avoided").textContent,/tCO₂/);
    assert.equal(dom.window.document.getElementById("sensitivityRows").querySelectorAll("tr").length,9);
  }finally{dom.window.close()}
});
test("offline arithmetic agrees with canonical physical calculator",()=>{
  const dom=create();
  try{
    const r=runVoyage({origin:"Singapore",destination:"Rotterdam",speedKn:15,
      referenceSpeedKn:15,referenceMainPowerKw:18000,installedMainMcrKw:36000,
      auxiliaryPowerKw:900,mainSFOCgKwh:175,auxiliarySFOCgKwh:190,
      canalDistanceNm:105,canalTransitHours:12,waitingSuezHours:0,
      waitingCapeHours:0,weatherMultiplier:1,fuelEfficiencyRatio:1,fuelId:"HFO"});
    const displayed=dom.window.document.getElementById("avoided").textContent;
    const number=Number(displayed.split(" ")[0].replaceAll(",",""));
    assert.ok(Math.abs(number-r.ttWCO2SavedTonnes)<.1);
  }finally{dom.window.close()}
});
test("offline UI updates SCNT, WtW and physical MCR limit live",()=>{
  const dom=create();
  try{
    const d=dom.window.document;
    const edit=(id,value)=>{
      const input=d.getElementById(id);input.value=String(value);
      input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
    };
    edit("scnt",100000);
    assert.match(d.getElementById("tollBaseResult").textContent,/439,500 SDR/);
    edit("speed",20);
    assert.match(d.getElementById("calcStatus").textContent,/MAIN_ENGINE_POWER_EXCEEDS_MCR/);
    edit("speed",15);
    assert.match(d.getElementById("avoided").textContent,/tCO₂/);
  }finally{dom.window.close()}
});
