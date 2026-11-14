import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {analyzeAnnouncements} from "../sca-stats/announcements-2026.mjs";
const root=new URL("../",import.meta.url);
const html=await readFile(new URL("decision-room.html",root),"utf8");
const official=JSON.parse(await readFile(new URL("data/sca-2026-official-announcements.json",root),"utf8"));
test("decision room renders key sections and preserves evidence boundary",()=>{
 for(const needle of ["id=\"officialCards\"","id=\"aisCards\"","id=\"resultCards\"","id=\"compute\"","id=\"export\"","UNVERIFIED_USER_SCENARIO","ais-quality-summary.json","لا تُجمع"])assert.ok(html.includes(needle),needle);
 assert.match(html,/src\/voyage-audit\.mjs/);
 assert.match(html,/sca-stats\/announcements-2026\.mjs/);
 assert.match(html,/لا تُصدر هذه الوحدة شهادة/);
});
test("official figures underpin useful ratios without a false CO2 savings claim",()=>{
 const x=analyzeAnnouncements(official);
 assert.equal(x.vessels.now,1490);
 assert.equal(x.vessels.absolute,362);
 assert.equal(x.revenue.now,724);
 assert.ok(x.netTonnagePerVesselApprox.now>59000);
 assert.equal(x.notAvailable.includes("verified avoided CO2"),true);
});
test("source uses no invalid claim that AIS snapshots equal transits",()=>{
 assert.doesNotMatch(html,/snapshotMean[^]*?\bactualTransits\s*=/);
 assert.match(html,/لا يساوي عدد السفن العابرة/);
});
