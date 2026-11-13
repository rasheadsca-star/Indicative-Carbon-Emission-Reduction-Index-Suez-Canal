import assert from "node:assert/strict";
import {parseNavigationCSV,csvRows} from "../navigation-data.mjs";
const header="date,direction,ship_type,vessel_count,net_tonnage,source,source_date,status";
const base=[
"2026-01-01,northbound,TOTAL,3,120000,DEMO,2026-01-02,scenario",
"2026-01-01,northbound,Container,2,80000,DEMO,2026-01-02,scenario",
"2026-01-01,northbound,Bulk Carrier,1,40000,DEMO,2026-01-02,scenario"];
const parse=rows=>parseNavigationCSV([header,...rows].join("\n"));
let r=parse(base);
assert.equal(r.ok,true);
assert.equal(r.summaries.length,1);
assert.equal(r.summaries[0].count,3); // NOT 6
assert.equal(r.summaries[0].netTonnage,120000);
assert.equal(r.summaries[0].status,"unverified-import");
assert.equal(r.summaries[0].completeness,"aggregate-and-categories");
assert.equal(r.warnings.length,0);
assert.equal(parse(base.slice(1)).summaries[0].completeness,"categories-only");
assert.equal(parse([base[0]]).summaries[0].completeness,"aggregate-only");
assert.equal(parse([...base,base[1]]).ok,false);
assert.equal(parse([base[0].replace(",3,120000",",4,120000"),...base.slice(1)]).ok,false);
assert.equal(parse([base[0].replace("120000","120001"),...base.slice(1)]).ok,false);
assert.equal(parse([base[0].replace("2026-01-01","2026-02-30")]).ok,false);
assert.equal(parse([base[0].replace(",3,120000",",-1,120000")]).ok,false);
assert.equal(parse([base[0].replace(",3,120000",",3.5,120000")]).ok,false);
assert.equal(parse([base[0].replace("DEMO,2026-01-02","DEMO,2025-12-31")]).ok,false);
assert.equal(parse([base[0].replace(",scenario",",official")]).ok,false);
assert.equal(parse([base[0].replace("120000","")]).summaries[0].netTonnage,null);
assert.deepEqual(csvRows('a,b\n"hello, world",x'),[["a","b"],["hello, world","x"]]);
assert.throws(()=>csvRows('"unfinished'));
assert.throws(()=>csvRows(""),/empty/);
const diff=parse([base[0],base[1].replace("DEMO,2026-01-02","OTHER,2026-01-02"),base[2]]);
assert.equal(diff.ok,true);
assert.match(diff.warnings.join(" "),/mixed provenance/);
console.log("CERI-SC navigation CSV test cases passed");
