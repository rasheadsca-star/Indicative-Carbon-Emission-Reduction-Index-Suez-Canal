import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script,createContext} from "node:vm";
const html=await readFile(new URL("../sca-green-route-v4-imo-integrated.html",import.meta.url),"utf8");
function json(id){
 const m=html.match(new RegExp('<script type="application/json" id="'+id+'">([\\s\\S]*?)</script>'));
 assert.ok(m,"Embedded reference missing: "+id);
 return JSON.parse(m[1]);
}
function imoScript(){
 const m=html.match(/<script>\s*(\/\* CERI-SC V4 integrated IMO Fleet & CO₂ Calculator[\s\S]*?)<\/script>/);
 assert.ok(m,"Integrated JS engine must exist and be standalone");
 return m[1];
}
test("original Green Route V4 structure preserved with integrated sixth tab",()=>{
 for(const name of ["function runSim()","function switchTab(n)","function updateCanalMacro()",
   "id=\"tab0\"","id=\"tab1\"","id=\"tab2\"","id=\"tab3\"","id=\"tab4\"","id=\"tab5\"",
   "id=\"tab5btn\"","id=\"imoOfficialRows\"","id=\"imoAssumptionRows\"",
   "id=\"imoResultsRows\"","id=\"imoTrendRows\""])
   assert.ok(html.includes(name),name);
 assert.equal((html.match(/class="tb-tab(?: active)?"/g)||[]).length,6);
 assert.equal((html.match(/class="tab-page(?: active)?"/g)||[]).length,6);
 for(const m of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)){
   if(m[0].includes('type="application/json"'))continue;
   new Script(m[1],{filename:"SCA Green Route V4 inline JavaScript"});
 }
});
test("the 53 original IMO 2012 fuel coefficients and annual SCA ship groups reconcile",()=>{
 const imo=json("imo-ref-data"),sca=json("imo-sca-data");
 assert.equal(imo.records.length,53);
 assert.equal(imo.referenceYear,2012);
 assert.equal(imo.co2FactorHFO_tCO2_per_tFuel,3.114);
 assert.equal(imo.records.find(x=>x.shipType==="Container"&&x.sizeCategory==="8000-11999").referenceAnnualFuelPerShip_t,29568.788717939);
 const original={2023:[26434,1568257],2024:[13213,524527],2025:[12758,522084]};
 for(const [year,expected] of Object.entries(original)){
   const x=sca.years[year],a=Object.values(x.groups);
   assert.equal(a.length,9);
   assert.deepEqual([x.shipCount,x.netTonnageThousands],expected);
   assert.equal(a.reduce((s,r)=>s+r.passages,0),expected[0]);
   assert.equal(a.reduce((s,r)=>s+r.netTonnageThousands,0),expected[1]);
 }
 assert.doesNotMatch(html,/'2025':\{ships:15000,/);
 assert.match(html,/'2025':\{ships:12758,containers:1840/);
});
test("integrated original IMO arithmetic yields partial TTW scenario, not verified fleet totals",()=>{
 const ids=new Map();
 class E{
   constructor(tag="div"){this.tag=tag;this.children=[];this.listeners={};this.textContent="";this.value="";this.options=[];this.dataset={};}
   replaceChildren(...items){this.children=[...items]}
   appendChild(item){this.children.push(item)}
   append(...items){this.children.push(...items)}
   addEventListener(type,cb){this.listeners[type]=cb}
 }
 const get=id=>{
   if(!ids.has(id))ids.set(id,new E());
   return ids.get(id);
 };
 get("imo-ref-data").textContent=JSON.stringify(json("imo-ref-data"));
 get("imo-sca-data").textContent=JSON.stringify(json("imo-sca-data"));
 get("imoYear").value="2025";
 const sandbox={document:{getElementById:get,createElement:t=>new E(t)},window:{},console};
 const ctx=createContext(sandbox);
 new Script(imoScript(),{filename:"IMO historical integrated engine"}).runInContext(ctx);
 const engine=sandbox.window.CERI_IMO_INTEGRATED;
 assert.equal(engine.referenceClasses,53);
 assert.equal(engine.officialAnnualTotals[2023],26434);
 assert.equal(engine.officialAnnualTotals[2025],12758);
 const a={line:1,group:"Container Ships",imoClass:"Container|8000-11999",
   share:1,hours:12,hoursProvided:true,source:"SYNTHETIC test only"};
 const got=engine.evaluate("2025",[a]);
 const target=1840*29568.788717939*12/8760*3.114;
 assert.ok(Math.abs(got.partialCO2_t-target)<1e-7);
 assert.equal(got.approved.length,1);
 assert.equal(got.wholeFleetCO2_t,null);
 assert.equal(got.status,"2012_HFO_ILLUSTRATIVE_USER_ASSUMPTIONS_NOT_ACTUAL_OR_SAVED_CO2");
 assert.equal(engine.evaluate("2025",[]).partialCO2_t,null);
 const bad=engine.evaluate("2025",[{...a,hoursProvided:false}]);
 assert.equal(bad.partialCO2_t,null);
 assert.equal(bad.rejections.length,1);
 const duplicate=engine.evaluate("2025",[a,a]);
 assert.equal(duplicate.approved.length,1);
 assert.equal(duplicate.rejections[0].reason,"Duplicate category allocation");
 const overshare=engine.evaluate("2025",[a,{...a,imoClass:"Container|5000-7999",share:0.5}]);
 assert.equal(overshare.rejections[0].reason,"Total group shares exceed 100%");
});
