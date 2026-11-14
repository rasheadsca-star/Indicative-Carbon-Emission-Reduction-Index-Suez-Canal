import test from "node:test";
import assert from "node:assert/strict";
import {appendQualitySample,evaluateQuality,normalizeQualitySample} from "./ais-quality-history.mjs";
const sample=(checkedAt,n,reachable=true)=>({
 version:1,checkedAt,health:{reachable:true},snapshot:{reachable,distinctMmsiCount:n,recentFeatureCount:n,truncated:false}
});
test("snapshot counts remain independent, never summed into transits",()=>{
 let h=appendQualitySample(null,sample("2026-11-14T10:00:00Z",2));
 h=appendQualitySample(h,sample("2026-11-14T11:00:00Z",2));
 const q=evaluateQuality(h,"2026-11-14T11:00:00Z");
 assert.equal(q.last24h.samples,2);
 assert.equal(q.last24h.snapshotMean,2);
 assert.equal(q.last24h.transitCount,null);
 assert.equal(q.last24h.coverageRate,null);
 assert.equal(q.status,"UNVERIFIED_COVERAGE");
});
test("invalid, truncated snapshots are excluded, not assigned zero",()=>{
 let h=appendQualitySample(null,sample("2026-11-14T10:00:00Z",2));
 const truncated=sample("2026-11-14T11:00:00Z",2);
 truncated.snapshot.truncated=true;
 h=appendQualitySample(h,truncated);
 const q=evaluateQuality(h,"2026-11-14T11:00:00Z");
 assert.equal(q.last24h.samples,2);
 assert.equal(q.last24h.usableSamples,1);
 assert.equal(q.last24h.failures,1);
 assert.equal(q.last24h.snapshotMean,2);
});
test("staleness and missing samples are explicit",()=>{
 let h=appendQualitySample(null,sample("2026-11-13T10:00:00Z",1));
 assert.equal(evaluateQuality(h,"2026-11-14T11:00:00Z").last24h.assessment,"NO_SAMPLES");
 assert.equal(evaluateQuality(h,"2026-11-13T15:00:00Z").last24h.stale,true);
});
test("duplicate sample timestamps do not multiply observations",()=>{
 let h=appendQualitySample(null,sample("2026-11-14T10:00:00Z",1));
 h=appendQualitySample(h,sample("2026-11-14T10:00:00Z",2));
 assert.equal(h.samples.length,1);
 assert.equal(h.samples[0].uniqueMmsi,2);
});
test("bad metadata rejected",()=>{
 assert.throws(()=>normalizeQualitySample({checkedAt:"invalid",version:1}),/Invalid/);
 const fake=sample("2026-11-14T11:00:00Z",2);
 fake.snapshot.recentFeatureCount=1;
 assert.equal(normalizeQualitySample(fake).hasSnapshot,false);
});
test("hourly check reliability remains unavailable before a complete observation window",()=>{
 const h=appendQualitySample(null,sample("2026-11-14T10:00:00Z",3));
 const q=evaluateQuality(h,"2026-11-14T10:05:00Z");
 assert.equal(q.last24h.collectionRunRatio,null);
 assert.equal(q.last24h.scheduleWindowMature,false);
 assert.equal(q.last24h.coverageRate,null);
});
test("mature collection ratio measures hourly scheduler, not regional vessel coverage",()=>{
 let h=appendQualitySample(null,sample("2026-11-13T10:00:00Z",1));
 h=appendQualitySample(h,sample("2026-11-14T10:00:00Z",2));
 const q=evaluateQuality(h,"2026-11-14T10:00:00Z");
 assert.equal(q.last24h.scheduleWindowMature,true);
 assert.equal(q.last24h.collectionRunRatio,1/24);
 assert.equal(q.last24h.coverageRate,null);
});
