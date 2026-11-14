import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildTrafficInsights} from "./official-traffic-insights.mjs";
const hist=JSON.parse(await readFile(new URL("../data/sca-official-monthly-2024-2025.json",import.meta.url),"utf8"));
const announced=JSON.parse(await readFile(new URL("../data/sca-2026-official-announcements.json",import.meta.url),"utf8"));
test("published totals reconcile and reveal useful yearly trend",()=>{
 const x=buildTrafficInsights(hist,announced);
 assert.equal(x.annual.vessels.previous,13213);
 assert.equal(x.annual.vessels.current,12758);
 assert.ok(x.annual.vessels.changePct < -3.4 && x.annual.vessels.changePct > -3.5);
 assert.ok(x.annual.netTonnes.changePct < 0 && x.annual.netTonnes.changePct > -0.6);
 assert.ok(x.annual.netTonnesPerVessel.changePct>3);
 assert.equal(x.signal,"OCTOBER_VESSEL_COUNT_ABOVE_2024_AND_2025");
 assert.equal(x.october.vessels.now,1490);
 assert.equal(x.october.comparedTo2024.base,1136);
 assert.equal(x.verifiedVoyageSavings,null);
 assert.equal(x.noAnnual2026,true);
});
test("conflicting October historical baseline is rejected, never silently reconciled",()=>{
 const corrupt=JSON.parse(JSON.stringify(hist));corrupt.monthly["2025"][9][0]=1127;corrupt.annual["2025"].vessels=12757;
 assert.throws(()=>buildTrafficInsights(corrupt,announced),/October 2025 baseline conflict/);
});
test("unreconciled historical totals fail closed",()=>{
 const corrupt=JSON.parse(JSON.stringify(hist));corrupt.annual["2025"].vessels=999;
 assert.throws(()=>buildTrafficInsights(corrupt,announced),/Monthly sum/);
});
