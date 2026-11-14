/**
 * Source-health report for a private 7-day trial.
 * Hourly message receipt != SCA transit completeness. Public output has no
 * MMSI, coordinates, ship names, or licensed raw AIS payload.
 */
import {createReadStream} from "node:fs";
import {createInterface} from "node:readline";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {TRIAL_HOURS,openPrivateTrial} from "./trial-store.mjs";

const H=3600000;
export function createTrialAccumulator(manifest,{nowMs=Date.now()}={}){
 const start=Date.parse(manifest?.startedAt),end=Date.parse(manifest?.endsAt);
 if(!Number.isFinite(start)||end-start!==TRIAL_HOURS*H)throw Error("Invalid seven-day manifest");
 const heartbeatSlots=new Set(),positionSlots=new Set(),flowingSlots=new Set(),
       distinctPerHour=new Map(),transitIds=new Set(),directions={Northbound:0,Southbound:0};
 let positionRecords=0,heartbeatRecords=0,candidateRecords=0,invalidRows=0;
 function slot(at){
   const ts=Date.parse(at||"");
   if(!Number.isFinite(ts)||ts<start||ts>=end||ts>nowMs+120000)return null;
   const i=Math.floor((ts-start)/H);
   return i>=0&&i<TRIAL_HOURS?i:null;
 }
 function observe(type,item){
   const i=slot(item?.at);
   if(i===null){invalidRows++;return;}
   if(type==="heartbeat"){
     heartbeatRecords++;heartbeatSlots.add(i);
     if(item.transport==="FLOWING")flowingSlots.add(i);
   }else if(type==="position"){
     if(typeof item.mmsi!=="string"||!/^[2-7]\d{8}$/.test(item.mmsi)){
       invalidRows++;return;
     }
     positionRecords++;positionSlots.add(i);
     if(!distinctPerHour.has(i))distinctPerHour.set(i,new Set());
     distinctPerHour.get(i).add(item.mmsi);
   }else if(type==="candidate"){
     if(item?.kind!=="TRANSIT"||!["Northbound","Southbound"].includes(item.direction)||
        typeof item.transitId!=="string"||!item.transitId.trim()){
        invalidRows++;return;
     }
     candidateRecords++;
     if(!transitIds.has(item.transitId)){transitIds.add(item.transitId);directions[item.direction]++}
   }else throw Error("Unknown private trial event type");
 }
 function report(){
   const elapsed=Math.max(0,Math.min(TRIAL_HOURS,Math.ceil((Math.min(nowMs,end)-start)/H)));
   const active=nowMs<end;
   const hoursWithMessages=positionSlots.size;
   const hourly=[];
   for(let i=0;i<elapsed;i++)hourly.push({slot:i,checks:heartbeatSlots.has(i)?1:0,
     withPositions:positionSlots.has(i),uniqueMmsiInSlot:distinctPerHour.get(i)?.size??0,
     status:heartbeatSlots.has(i)?"CHECK_RECORDED":"NO_HEARTBEAT"});
   const coverage={sourceGeographicCoverageRate:null,officialSCARecall:null,
     aisMatchPrecision:null,officialReferenceComplete:false};
   return {
     schema:"ceri-sc-ais-private-trial-report-v1",asOf:new Date(nowMs).toISOString(),
     providerId:manifest.providerId,startedAt:manifest.startedAt,endsAt:manifest.endsAt,
     trialStatus:elapsed===0?"NOT_STARTED":active?"COLLECTING_UNVERIFIED":"WINDOW_ELAPSED_UNVERIFIED",
     expectedTrialHours:TRIAL_HOURS,elapsedTrialHours:elapsed,
     checkedHours:heartbeatSlots.size,checksPerElapsedHour:elapsed?heartbeatSlots.size/elapsed:null,
     hoursWithReceivedPositions:hoursWithMessages,
     hoursWithFlowingTransport:flowingSlots.size,
     positionReportsInPrivateStore:positionRecords,
     candidateTransitsInPrivateStore:transitIds.size,
     aisInferredCandidatesByDirection:directions,
     healthRows:heartbeatRecords,candidateJournalRows:candidateRecords,invalidRows,
     coverage,
     hourly,
     decision:"SOURCE_DIAGNOSTIC_ONLY_NOT_OPERATIONAL",
     warning:"Source traffic cannot be equated with canal coverage. AIS-inferred candidates are not authenticated SCA passages. No formal seven-day quality acceptance without a complete independent SCA reference register and geofence validation."
   };
 }
 return {observe,report};
}

export async function readPrivateTrialReport({directory,nowMs=Date.now()}={}){
 // Use opening guard and existing manifest. Never auto-create a meaningful trial
 // just because a report is requested.
 const store=await openPrivateTrial({directory,now:()=>nowMs,mustExist:true});
 const aggregate=createTrialAccumulator(store.manifest,{nowMs});
 for(const type of ["heartbeat","position","candidate"]){
   const files=await store.listFiles(type);
   for(const file of files){
     const rl=createInterface({input:createReadStream(file,{encoding:"utf8"}),crlfDelay:Infinity});
     for await(const line of rl){
       if(!line.trim())continue;
       try{aggregate.observe(type,JSON.parse(line))}
       catch{aggregate.observe(type,{at:"invalid"})}
     }
   }
 }
 return aggregate.report();
}
