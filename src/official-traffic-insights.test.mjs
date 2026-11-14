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
// DEF-004 regression: a later monthly release must be ingestible without code edits.
// The November record below is SYNTHETIC test data (values invented), never shipped to data/.
const synthNov=()=>{const d=JSON.parse(JSON.stringify(announced));
 Object.assign(d.monthlyComparison,{period:"2026-11",baseline:"2025-11",publicationDate:"2026-12-05",
  current:{vessels:1500,netTonnageMillionRounded:90,revenueMillionUsd:730},
  baselineValues:{vessels:1160,netTonnageMillionRounded:48,revenueMillionUsd:380}});return d;};
test("a non-October month is analysed against the same month in the official tables",()=>{
 const x=buildTrafficInsights(hist,synthNov());
 assert.equal(x.latestMonth.month,"November");
 assert.equal(x.latestMonth.period,"2026-11");
 assert.equal(x.latestMonth.comparedTo2024.base,1000);
 assert.equal(x.latestMonth.comparedTo2024.baseYear,2024);
 assert.equal(x.signal,"NOVEMBER_VESSEL_COUNT_ABOVE_2024_AND_2025");
});
test("announcement baseline that contradicts the annual-report month fails closed",()=>{
 const d=synthNov();d.monthlyComparison.baselineValues.vessels=1159;
 assert.throws(()=>buildTrafficInsights(hist,d),/November 2025 baseline conflict/);
});
test("mismatched baseline month and pre-period publication date are rejected",()=>{
 const d=synthNov();d.monthlyComparison.baseline="2025-10";
 assert.throws(()=>buildTrafficInsights(hist,d),/Unexpected reporting periods/);
 const e=synthNov();e.monthlyComparison.publicationDate="2026-10-30";
 assert.throws(()=>buildTrafficInsights(hist,e),/Publication date/);
});
