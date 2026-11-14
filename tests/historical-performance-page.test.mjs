import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const get=f=>readFile(new URL("../"+f,import.meta.url),"utf8");
test("historical performance page is navigable and source-driven",async()=>{
 const page=await get("historical-performance.html");
 const main=await get("index.html"),stats=await get("official-statistics.html"),room=await get("decision-room.html");
 for(const markup of ["id=\"cards\"","id=\"chart\"","id=\"backtestCards\"","id=\"historicalRows\"","id=\"metric\"","id=\"period\"","id=\"export\""])
   assert.ok(page.includes(markup),markup);
 assert.match(page,/src\/historical-performance\.mjs/);
 assert.match(page,/data\/sca-official-annual-history-1975-2025\.json/);
 assert.match(page,/official.*historical.*performance.*audit\.json/);
 assert.match(page,/وفورات الوقود وCO₂ التاريخية/);
 for(const html of [main,stats,room])assert.match(html,/historical-performance\.html/);
});
test("historic data is labelled as traffic, not a certified CO2 backtest",async()=>{
 const p=await get("historical-performance.html"),data=JSON.parse(await get("data/sca-official-annual-history-1975-2025.json"));
 assert.match(p,/لا توجد وفورات CO₂ متحققة/);
 assert.match(p,/لا نضرب أعداد السفن السنوية في متوسط وفر افتراضي/);
 assert.equal(data.partialYears[0],1975);
 assert.equal(data.netTonnageQualityFlags["2004"],"SOURCE_TABLE_ANOMALY_REQUIRES_CORROBORATION");
 assert.ok(data.sourceUrl.startsWith("https://www.suezcanal.gov.eg/"));
});
