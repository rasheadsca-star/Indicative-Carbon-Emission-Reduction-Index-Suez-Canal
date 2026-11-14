import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {analyzeAnnouncements} from "./announcements-2026.mjs";
const data=JSON.parse(await readFile(new URL("../data/sca-2026-official-announcements.json",import.meta.url),"utf8"));
test("2026 October official count, comparative count, and revenue calculations",()=>{
 const a=analyzeAnnouncements(data);
 assert.equal(a.vessels.now,1490);
 assert.equal(a.vessels.prev,1128);
 assert.equal(a.vessels.absolute,362);
 assert.ok(a.vessels.derivedPct>32&&a.vessels.derivedPct<33);
 assert.equal(a.revenue.now,724);
 assert.equal(a.revenue.prev,373);
 assert.ok(a.revenue.derivedPct>94&&a.revenue.derivedPct<95);
 assert.equal(a.container.now,166);
 assert.equal(a.container.prev,16);
 assert.equal(a.container.multiple,10.375);
 assert.equal(a.singleDay.vessels,39);
 assert.equal(a.status,"official-announced-aggregates-derived-ratios");
 assert.ok(a.notAvailable.includes("verified avoided CO2"));
});
test("reported percentage is distinct from computed fraction of rounded tonnage",()=>{
 const a=analyzeAnnouncements(data);
 assert.equal(a.reportedPct.netTonnage,86);
 assert.ok(a.netTonnage.derivedPct>87);
 assert.notEqual(a.reportedPct.netTonnage,a.netTonnage.derivedPct);
});
test("missing source and negative values fail closed",()=>{
 const invalid=JSON.parse(JSON.stringify(data));
 invalid.monthlyComparison.current.vessels=-5;
 assert.throws(()=>analyzeAnnouncements(invalid),/Invalid/);
 invalid.monthlyComparison.current.vessels=1490;
 invalid.monthlyComparison.sourceUrl="https://unofficial.example/report";
 assert.throws(()=>analyzeAnnouncements(invalid),/official source/);
});
