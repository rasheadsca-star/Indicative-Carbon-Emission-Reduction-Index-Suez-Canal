import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=async file=>readFile(new URL("../"+file,import.meta.url),"utf8");
test("2026 official UI uses source reporting period and allows later month ingestion",async()=>{
 const main=await read("index.html"),stats=await read("official-statistics.html"),room=await read("decision-room.html");
 assert.match(main,/const monthLabel=m\.period/);
 assert.match(main,/m\.publicationDate/);
 assert.match(stats,/const period=m\.period/);
 assert.match(room,/a\.period\+" مقابل "\+a\.baseline/);
 for(const page of [main,stats,room]){
   assert.doesNotMatch(page,/m\.period\s*!==\s*['"]2026-10['"]/);
   assert.doesNotMatch(page,/m\.current\.vessels\s*!==\s*1490/);
   assert.doesNotMatch(page,/m\.baselineValues\.vessels\s*!==\s*1128/);
 }
});
test("AIS Lab labels the approach clock and bounded canal duration separately",async()=>{
 const lab=await read("ais-lab/index.html"),render=await read("ais-lab/app.mjs"),core=await read("ais-lab/core.mjs");
 assert.match(lab,/تشمل الانتظار/);
 assert.match(render,/canalHoursLower/);
 assert.match(render,/canalHoursUpper/);
 assert.match(core,/APPROACH_TO_EXIT_INCLUDES_WAITING/);
 assert.match(core,/LONG_APPROACH_WAIT_NOT_CANAL_TRANSIT/);
});