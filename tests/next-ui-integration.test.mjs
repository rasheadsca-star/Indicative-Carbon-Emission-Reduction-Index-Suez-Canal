import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM} from "jsdom";
import {runVoyage,validIMO,SCA_DISTANCE_SOURCE,IMO_CO2_SOURCE} from "../src/voyage-physical.mjs";
import {computeSCA2024BaseToll,SCA_2024_BASE_RATES} from "../src/sca-tolls-2024.mjs";
import {estimateScenarioWtW} from "../src/fuel-lca-scenario.mjs";
import {screenEUETS} from "../src/regulation-screen.mjs";

const html=await readFile(new URL("../next/index.html",import.meta.url),"utf8");
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(script,"NEXT standalone module not present");
const classic=script[1].replace(/^import .*?;\s*$/gm,"");
function createApp(){
  const d=new JSDOM(html,{runScripts:"outside-only",url:"https://ceri-sc-local.test/next/"});
  Object.assign(d.window,{CERI_VESSELS:[],runVoyage,validIMO,SCA_DISTANCE_SOURCE,
    IMO_CO2_SOURCE,computeSCA2024BaseToll,SCA_2024_BASE_RATES,estimateScenarioWtW,screenEUETS});
  d.window.eval(classic);
  const el=id=>d.window.document.getElementById(id);
  const change=(id,value)=>{
    const x=el(id);
    if(!x)throw Error("Missing "+id);
    if(typeof value==="boolean")x.checked=value;
    else x.value=String(value);
    x.dispatchEvent(new d.window.Event("input",{bubbles:true}));
  };
  return {d,el,change};
}
test("real NEXT script executes default official route and no WtW or toll guesses",()=>{
  const a=createApp();
  try{
    assert.match(a.el("distanceSaved").textContent,/3,467 nm/);
    assert.match(a.el("avoided").textContent,/tCO₂/);
    assert.match(a.el("netSaved").textContent,/Not calculated/);
    assert.match(a.el("wtwResult").textContent,/Not calculated/);
    assert.match(a.el("tollBaseResult").textContent,/Not calculated/);
  }finally{a.d.window.close()}
});
test("SCNT tier math displays referenced 2024 band breakdown, not a final toll",()=>{
  const a=createApp();
  try{
    a.change("scnt",100000);
    assert.match(a.el("tollBaseResult").textContent,/439,500 SDR/);
    assert.match(a.el("tollStatus").textContent,/2024/);
    assert.equal(a.el("tollBreakdown").querySelectorAll("tr").length,8);
    assert.match(a.el("tollResult").textContent,/Not calculated/);
    a.change("sdrFx",1.4);
    assert.match(a.el("tollBaseResult").textContent,/615,300/);
    assert.match(a.el("netSaved").textContent,/Not calculated/);
    a.change("useHistoricalBase",true);
    a.change("fuelPrice",600);
    a.change("opex",5000);
    assert.match(a.el("tollResult").textContent,/SCA_2024_BASE_SCENARIO_ONLY/);
    assert.match(a.el("netSaved").textContent,/\$/);
    assert.match(a.el("tollStatus").textContent,/NOT included/);
  }finally{a.d.window.close()}
});
test("WTW remains withheld until all pathway and engine evidence fields exist",()=>{
  const a=createApp();
  try{
    a.change("wtwFactor",75);
    assert.match(a.el("wtwResult").textContent,/Not calculated/);
    assert.match(a.el("wtwStatus").textContent,/MISSING_PRODUCTION_PATHWAY/);
    a.change("fuelPathway","explicit hydrogen pathway");
    a.change("engineTech","specified propulsion machinery");
    a.change("pathwayRef","external documented source");
    assert.match(a.el("wtwResult").textContent,/tCO₂e/);
    assert.match(a.el("wtwStatus").textContent,/NOT certified/);
  }finally{a.d.window.close()}
});
test("nonsupported route blocks calculation and Arabic toggle keeps engineering fields",()=>{
  const a=createApp();
  try{
    a.change("origin","Tokyo");
    a.change("destination","Piraeus");
    assert.equal(a.el("avoided").textContent,"—");
    assert.match(a.el("calcStatus").textContent,/NO_VERIFIED_SCA_PORT_PAIR/);
    a.change("destination","Rotterdam");
    assert.match(a.el("avoided").textContent,/tCO₂/);
    a.change("mainPower",19000);
    a.el("langBtn").click();
    assert.equal(a.d.window.document.documentElement.dir,"rtl");
    assert.equal(a.el("mainPower").value,"19000");
  }finally{a.d.window.close()}
});

test("EU ETS screening requires GT and confirmed port calls, and never issues a full charge",()=>{
  const a=createApp();
  try{
    assert.match(a.el("etsResult").textContent,/Not calculated/);
    a.change("grossTonnage",80000);
    a.change("shipService","cargo");
    a.change("euaPrice",80);
    assert.match(a.el("etsResult").textContent,/Not calculated/);
    a.change("directPortCalls",true);
    assert.match(a.el("etsResult").textContent,/€[0-9]/);
    assert.match(a.el("policyStatus").textContent,/50% leg/);
    assert.match(a.el("policyStatus").textContent,/2026 CH₄\/N₂O NOT modelled/);
    assert.match(a.el("netSaved").textContent,/Not calculated/);
  }finally{a.d.window.close()}
});
