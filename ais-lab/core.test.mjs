import test from "node:test";
import assert from "node:assert/strict";
import { AIS_BBOX, classifyZone, vesselCategory, normalizeEvent, normalizeSnapshot, createTracker } from "./core.mjs";

const BASE = Date.parse("2026-11-14T00:00:00Z");
const mk = (mmsi, time, lat, lon, extra = {}) => ({
  mmsi, timestamp: time, lat, lon, name:"TEST VESSEL", shipType: 70,
  sog: 9, cog: 170, source:"test", station:"simulated", isPositionReport:true,
  synthesized:false, ...extra
});
test("bounding box and approximate geographic gates", () => {
  assert.equal(AIS_BBOX.length, 4);
  assert.equal(classifyZone(31.39,32.32), "north");
  assert.equal(classifyZone(30.67,32.33), "canal");
  assert.equal(classifyZone(29.92,32.57), "south");
  assert.equal(classifyZone(30.67,31.9), "outside");
  assert.equal(classifyZone(NaN,32.3), "outside");
});
test("ITU categories are explicit; absent values remain unknown", () => {
  assert.equal(vesselCategory(70),"Cargo");
  assert.equal(vesselCategory(83),"Tanker");
  assert.equal(vesselCategory(null),"Unknown");
});
test("Open Waters event normalization rejects missing/malformed coordinates and identifiers", () => {
  const frame={type:"event",time:"2026-11-14T00:00:00Z",mmsi:123456789,lat:30.67,lon:32.33,
    msg_type:"PositionReport",source:"aisstream",message:{Sog:11,Type:72}};
  assert.equal(normalizeEvent(frame).mmsi, "123456789");
  assert.equal(normalizeEvent(frame).isPositionReport,true);
  assert.equal(normalizeEvent({...frame,mmsi:123}), null);
});
test("snapshot is allowed only to display vessels, never to count passages", () => {
  let now=BASE;
  const tr=createTracker(()=>now);
  for (const [lat,lon] of [[31.39,32.32],[30.67,32.33],[29.92,32.57]]) {
    now+=3*3600000;
    const geo=normalizeSnapshot({
      type:"Feature", id:123456789, geometry:{type:"Point",coordinates:[lon,lat]},
      properties:{mmsi:123456789,seen:new Date(now).toISOString(),name:"Sample",type:72,source:"demo"}
    });
    tr.ingest(geo,false);
  }
  assert.equal(tr.summary().inferredTransits,0);
});
test("one plausible north-to-south passage is inferred once", () => {
  let now=BASE;
  const tr=createTracker(()=>now);
  const ingest=(hour,lat,lon,id)=>{
    now=BASE+hour*3600000;
    return tr.ingest(mk("123456789",now,lat,lon,{eventId:id}),true);
  };
  assert.equal(ingest(0,31.39,32.32,"a").accepted,true);
  assert.equal(ingest(4,30.67,32.33,"b").accepted,true);
  const end=ingest(9,29.92,32.57,"c");
  assert.equal(end.completed?.direction,"Southbound");
  assert.equal(end.completed?.elapsedHours,9);
  assert.equal(tr.summary().inferredTransits,1);
  assert.equal(ingest(9,29.92,32.57,"c").reason,"duplicate");
  assert.equal(tr.summary().inferredTransits,1);
});
test("north-to-south with no interior fixes must not be counted",()=>{
  let now=BASE; const tr=createTracker(()=>now);
  tr.ingest(mk("123456789",now,31.39,32.32),true);
  now+=10*3600000;
  tr.ingest(mk("123456789",now,29.92,32.57),true);
  assert.equal(tr.summary().inferredTransits,0);
});
test("old position reports cannot trigger a transit",()=>{
  let now=BASE+60*60*1000;const tr=createTracker(()=>now);
  for(const [hour,lat,lon] of [[0,31.39,32.32],[4,30.67,32.33],[9,29.92,32.57]]){
    now=BASE+(hour+1)*3600000;
    tr.ingest(mk("123456789",BASE+hour*3600000,lat,lon),true);
  }
  assert.equal(tr.summary().inferredTransits,0);
});
test("implausible position jump is rejected",()=>{
  let now=BASE;const tr=createTracker(()=>now);
  tr.ingest(mk("123456789",now,31.39,32.32),true);
  now+=1000;
  const result=tr.ingest(mk("123456789",now,30.67,32.33),true);
  assert.equal(result.reason,"implausible_jump");
});
test("malformed frames do not create vessels",()=>{
  const tr=createTracker(()=>BASE);
  assert.equal(tr.ingest(mk("bad",BASE,30.67,32.33),true).accepted,false);
  assert.equal(tr.summary().observed,0);
});
