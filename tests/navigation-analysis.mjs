import assert from "node:assert/strict";
import {parseNavigationCSV} from "../navigation-data.mjs";
import {buildNavigationIntelligence} from "../navigation-analysis.mjs";
const head="date,direction,ship_type,vessel_count,net_tonnage,source,source_date,status";
function csv(rows){return [head,...rows].join("\n")}
function daily(date,{south=true,total=true,types=true,source="TEST"}={}){
  const arr=[];
  for(const direction of south?["northbound","southbound"]:["northbound"]){
    if(total)arr.push([date,direction,"TOTAL",3,100,source,"2027-01-01","scenario"].join(","));
    if(types){
      arr.push([date,direction,"Container",2,60,source,"2027-01-01","scenario"].join(","));
      arr.push([date,direction,"Bulk Carrier",1,40,source,"2027-01-01","scenario"].join(","));
    }
  }
  return arr;
}
function fromRows(rows){return buildNavigationIntelligence(parseNavigationCSV(csv(rows)))}
const one=fromRows(daily("2026-01-01"));
assert.equal(one.dayRows[0].count,6);
assert.equal(one.dayRows[0].netTonnage,200);
assert.equal(one.dayRows[0].categories.Container,4);
assert.equal(one.monthly[0].vesselCount,null);
assert.equal(one.monthly[0].expectedDays,31);
assert.equal(one.monthly[0].reconciledDays,1);
assert.equal(one.yearly[0].vesselCount,null);
assert.equal(one.monthly[0].status,"unverified-import");
const incomplete=fromRows(daily("2026-01-01",{south:false}));
assert.equal(incomplete.dayRows[0].count,null);
assert.equal(incomplete.dayRows[0].note,"Missing direction");
const onlyTypes=fromRows(daily("2026-01-01",{total:false}));
assert.equal(onlyTypes.dayRows[0].aggregateComplete,false);
assert.equal(onlyTypes.dayRows[0].count,null);
const noTypes=fromRows(daily("2026-01-01",{types:false}));
assert.equal(noTypes.dayRows[0].aggregateComplete,true);
assert.equal(noTypes.dayRows[0].categoryComplete,false);
const year=2024;
let rows=[];
for(let month=1;month<=12;month++){
  const end=new Date(Date.UTC(year,month,0)).getUTCDate();
  for(let d=1;d<=end;d++){
    rows.push(...daily([year,String(month).padStart(2,"0"),String(d).padStart(2,"0")].join("-")));
  }
}
const full=fromRows(rows);
assert.equal(full.dayRows.length,366);
assert.equal(full.monthly.length,12);
assert.equal(full.yearly[0].expectedDays,366);
assert.equal(full.yearly[0].vesselCount,366*6);
assert.equal(full.yearly[0].netTonnage,366*200);
assert.equal(full.yearly[0].categories.Container,366*4);
assert.equal(full.monthly[1].expectedDays,29);
assert.equal(full.monthly.every(m=>m.complete),true);
assert.equal(full.gapCount,0);
rows=rows.filter(s=>!s.startsWith("2024-02-29,"));
const partial=fromRows(rows);
assert.equal(partial.yearly[0].complete,false);
assert.equal(partial.yearly[0].vesselCount,null);
assert.equal(partial.monthly[1].vesselCount,null);
assert.equal(partial.gapCount,1);
assert.deepEqual(partial.missingDates,["2024-02-29"]);
const farApart=fromRows;
assert.throws(()=>farApart([...daily("2001-01-01"),...daily("2026-01-01")]),/20 years/);
const mixedDays=fromRows([...daily("2026-01-01",{source:"FIRST"}),...daily("2026-01-02",{source:"SECOND"})]);
assert.equal(mixedDays.dayRows[0].comparableProvenance,true);
assert.equal(mixedDays.dayRows[1].comparableProvenance,true);
assert.throws(()=>buildNavigationIntelligence({ok:false}),/successful/);
console.log("CERI-SC navigation time-coverage integration cases passed");
