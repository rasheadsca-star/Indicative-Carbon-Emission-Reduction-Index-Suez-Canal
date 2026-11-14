import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,stat,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openPrivateTrial} from "./trial-store.mjs";
import {createTrialAccumulator,readPrivateTrialReport} from "./trial-report.mjs";
import {createTrialSession,runSevenDayTrial} from "./trial-collector.mjs";

const BASE=Date.parse("2026-11-14T00:00:00Z");
const msg=(h,lat,lon,mmsi="234567890")=>({
 MetaData:{MMSI:Number(mmsi),time_utc:new Date(BASE+h*3600000).toISOString()},
 MessageType:"PositionReport",
 Message:{PositionReport:{Latitude:lat,Longitude:lon,Sog:8,Cog:180}}
});
async function withPrivate(testFn){
 const dir=await mkdtemp(join(tmpdir(),"ceri-sc-ais-trial-"));
 try{return await testFn(dir)}finally{await rm(dir,{recursive:true,force:true})}
}

test("seven-day report is fail-closed and cannot invent a trial on empty directory",async()=>{
 await withPrivate(async dir=>{
  await assert.rejects(readPrivateTrialReport({directory:dir,nowMs:BASE}),/has not started/);
 });
});

test("private trial persists separate samples, resumes the same seven-day window and protects file modes",async()=>{
 await withPrivate(async directory=>{
  const store=await openPrivateTrial({directory,now:()=>BASE});
  const first=store.manifest.startedAt,end=store.manifest.endsAt;
  await store.append("heartbeat",{at:new Date(BASE).toISOString(),transport:"DISCONNECTED"});
  await store.append("heartbeat",{at:new Date(BASE+86400000).toISOString(),transport:"CONNECTED_BUT_SILENT"});
  await store.append("position",{at:new Date(BASE).toISOString(),mmsi:"234567890",lat:31.39,lon:32.32});
  await store.append("position",{at:new Date(BASE+1000).toISOString(),mmsi:"234567890",lat:31.391,lon:32.32});
  await store.drain();
  const resumed=await openPrivateTrial({directory,now:()=>BASE+86400000});
  assert.equal(resumed.manifest.startedAt,first);
  assert.equal(resumed.manifest.endsAt,end);
  const privateFiles=await store.listFiles("position");
  assert.equal(privateFiles.length,1);
  assert.equal((await stat(privateFiles[0])).mode&0o777,0o600);
  const report=await readPrivateTrialReport({directory,nowMs:BASE+25*3600000});
  assert.equal(report.expectedTrialHours,168);
  assert.equal(report.elapsedTrialHours,25);
  assert.equal(report.checkedHours,2);
  assert.equal(report.hoursWithReceivedPositions,1);
  assert.equal(report.positionReportsInPrivateStore,2);
  assert.equal(report.hourly[0].uniqueMmsiInSlot,1);
  assert.equal(report.coverage.sourceGeographicCoverageRate,null);
  assert.equal(report.trialStatus,"COLLECTING_UNVERIFIED");
  assert.doesNotMatch(JSON.stringify(report),/234567890|31\.39/);
 });
});

test("private, synthetic AIS stream records only inferred candidate and source-health, never official SCA crossing",async()=>{
 await withPrivate(async directory=>{
  let now=BASE;
  const store=await openPrivateTrial({directory,now:()=>BASE});
  const session=createTrialSession({store,now:()=>now});
  session.onHealth({event:"connect"});
  for(const [h,lat,lon] of [[0,31.39,32.32],[4,30.91,32.315],[8,30.67,32.33],[12,29.92,32.57]]){
    now=BASE+h*3600000;
    const r=await session.onMessage(msg(h,lat,lon));
    assert.equal(r.accepted,true);
  }
  await session.heartbeat();
  await session.close();
  const r=await readPrivateTrialReport({directory,nowMs:BASE+13*3600000});
  assert.equal(r.positionReportsInPrivateStore,4);
  assert.equal(r.candidateTransitsInPrivateStore,1);
  assert.equal(r.aisInferredCandidatesByDirection.Southbound,1);
  assert.equal(r.coverage.officialReferenceComplete,false);
  assert.equal(r.coverage.officialSCARecall,null);
  assert.equal(r.decision,"SOURCE_DIAGNOSTIC_ONLY_NOT_OPERATIONAL");
 });

});

test("missing provider rights, API key and private storage prevent any live connection",async()=>{
 const createProvider=()=>{throw Error("Provider must not be called")};
 await assert.rejects(runSevenDayTrial({env:{},createProvider}),/AIS_TERMS_ACCEPTED/);
 await assert.rejects(runSevenDayTrial({env:{AIS_TERMS_ACCEPTED:"yes"},createProvider}),/AISSTREAM_API_KEY/);
 await assert.rejects(runSevenDayTrial({env:{AIS_TERMS_ACCEPTED:"yes",AISSTREAM_API_KEY:"fake"},createProvider}),/AIS_PRIVATE_DATA_DIR/);
});

test("synthetic private journal can retain invalid telemetry counts without pretending zero transits",()=>{
 const manifest={providerId:"aisstream",startedAt:new Date(BASE).toISOString(),endsAt:new Date(BASE+7*86400000).toISOString()};
 const x=createTrialAccumulator(manifest,{nowMs:BASE+8*86400000});
 x.observe("heartbeat",{at:new Date(BASE).toISOString(),transport:"CONNECTED_BUT_SILENT"});
 x.observe("candidate",{at:new Date(BASE+3600000).toISOString(),kind:"TRANSIT",transitId:"abc",direction:"Southbound"});
 x.observe("candidate",{at:new Date(BASE+3600000).toISOString(),kind:"TRANSIT",transitId:"abc",direction:"Southbound"});
 const r=x.report();
 assert.equal(r.trialStatus,"WINDOW_ELAPSED_UNVERIFIED");
 assert.equal(r.elapsedTrialHours,168);
 assert.equal(r.candidateTransitsInPrivateStore,1);
 assert.equal(r.checkedHours,1);
 assert.equal(r.checksPerElapsedHour,1/168);
 assert.equal(r.coverage.sourceGeographicCoverageRate,null);
});
