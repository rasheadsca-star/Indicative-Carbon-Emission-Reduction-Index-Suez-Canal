import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validatePublishedSeries,annualTrends,monthlyTrends,validateDailyObservations,weeklyFromDaily} from "../sca-stats/official-stats.mjs";
const file=JSON.parse(await readFile(new URL("../data/sca-official-monthly-2024-2025.json",import.meta.url),"utf8"));
test("official SCA published 2024/25 monthly totals reconcile to annual data",()=>{
 assert.equal(validatePublishedSeries(file),true);
 assert.equal(file.annual[2024].vessels,13213);
 assert.equal(file.annual[2025].vessels,12758);
 assert.equal(file.annual[2025].netTonnageThousands,522084);
 assert.equal(monthlyTrends(file,2025).length,12);
 assert.equal(monthlyTrends(file,2025)[0].vessels,1046);
 assert.equal(monthlyTrends(file,2025)[0].yoyChangePct<0,true);
 assert.equal(annualTrends(file).find(x=>x.year===2023).vessels,26434);
});
test("official published year values cannot be fabricated from malformed months",()=>{
 const fake=JSON.parse(JSON.stringify(file));
 fake.monthly["2025"][0][0]+=1;
 assert.throws(()=>validatePublishedSeries(fake),/does not match/);
});
test("no official weekly or daily 2026 data is invented",()=>{
 assert.deepEqual(monthlyTrends(file,2026),[]);
 const r=weeklyFromDaily([{date:"2026-11-01",vessels:10,source:"USER INPUT"}],"2026-11-01");
 assert.equal(r.vesselCount,null);
 assert.equal(r.coveredDays,1);
 assert.equal(r.dataStatus,"insufficient-daily-coverage");
});
test("calendar-seven-day user inputs are derived, never official",()=>{
 const rows=Array.from({length:7},(_,i)=>({date:"2026-11-"+String(i+1).padStart(2,"0"),vessels:2,source:"TEST"}));
 const r=weeklyFromDaily(rows,"2026-11-01");
 assert.equal(r.vesselCount,14);
 assert.equal(r.dataStatus,"derived-from-external-daily-unverified");
 assert.match(r.note,/no official SCA weekly publication/i);
});
test("duplicates and malformed daily observations fail closed",()=>{
 assert.throws(()=>validateDailyObservations([{date:"2026-11-01",vessels:1,source:"A"},{date:"2026-11-01",vessels:2,source:"A"}]),/Duplicate/);
 assert.throws(()=>validateDailyObservations([{date:"2026-02-30",vessels:2,source:"A"}]),/Invalid observed/);
 assert.throws(()=>validateDailyObservations([{date:"2026-11-01",vessels:-1,source:"A"}]),/nonnegative/);
});
