#!/usr/bin/env node
/**
 * Seven-day private AIS coverage trial. This is NOT SCA operational coverage.
 * Run on a durable, approved server with licensed provider and private volume.
 * All raw ship identifiers/positions stay outside GitHub and its Pages deployment.
 */
import {openPrivateTrial} from "./trial-store.mjs";
import {createHealthMonitor,normalizeAisMessage} from "./ais-provider.mjs";
import {createTransitEngine} from "./transit-fsm.mjs";
import {createAisstreamProvider} from "./providers/aisstream.mjs";
import {pathToFileURL} from "node:url";

export function createTrialSession({store,now=()=>Date.now(),providerId="aisstream"}={}){
 if(!store?.append||!store?.drain)throw Error("Private journal required");
 const monitor=createHealthMonitor({clock:now,staleAfterMs:10*60000});
 const engine=createTransitEngine({clock:now});
 let failure=null,seq=Promise.resolve(),received=0;
 function enqueue(task){
   const next=seq.then(task);
   seq=next.catch(err=>{failure=err});
   return next;
 }
 function onHealth(status){
   if(status?.event==="connect")monitor.onConnect();
   if(["disconnect","error"].includes(status?.event))monitor.onDisconnect();
 }
 function onMessage(raw){
   return enqueue(async()=>{
     if(failure)throw failure;
     const normalized=normalizeAisMessage(raw,{adapter:"aisstream",providerId});
     monitor.onMessage(normalized);received++;
     if(!normalized.ok)return {accepted:false,reason:normalized.reason};
     const msg=normalized.msg;
     const at=new Date(now()).toISOString();
     await store.append("position",{at,mmsi:msg.mmsi,ts:new Date(msg.tsMs).toISOString(),
       lat:msg.lat,lon:msg.lon,sog:msg.sog,cog:msg.cog,providerId});
     const candidate=engine.ingest(msg);
     if(candidate?.kind==="TRANSIT"){
       await store.append("candidate",{at,kind:"TRANSIT",transitId:candidate.transitId,
         direction:candidate.direction,confidence:candidate.confidence,flags:candidate.flags,
         canalHoursLower:candidate.canalHoursLower,canalHoursUpper:candidate.canalHoursUpper});
     }
     return {accepted:true,candidate:!!(candidate?.kind==="TRANSIT")};
   });
 }
 async function heartbeat({processStart=false}={}){
   await seq;
   if(failure)throw failure;
   const health=monitor.snapshot();
   const state=engine.stats();
   await store.append("heartbeat",{at:new Date(now()).toISOString(),
     providerId,transport:health.transport,connected:health.connected,
     received:health.received,rejected:health.rejected,reconnects:health.reconnects,
     lastMessageAt:health.lastMessageAt,
     fsmInferredTransits:state.transits,
     processStart,
     coverage:"UNKNOWN_UNTIL_OFFICIAL_RECONCILIATION"});
   return {health,state,received};
 }
 async function close(){await seq;await store.drain();if(failure)throw failure}
 return {onMessage,onHealth,heartbeat,close,metrics:()=>({monitor:monitor.snapshot(),fsm:engine.stats(),received})};
}

export async function runSevenDayTrial({env=process.env,now=()=>Date.now(),
 createProvider=createAisstreamProvider,log=console.log,err=console.error}={}){
 if(env.AIS_TERMS_ACCEPTED!=="yes")throw Error("Provider use is blocked until operator sets AIS_TERMS_ACCEPTED=yes after reviewing terms and rights");
 if(!env.AISSTREAM_API_KEY)throw Error("AISSTREAM_API_KEY missing; set as server secret, NEVER in GitHub/Pages");
 if(!env.AIS_PRIVATE_DATA_DIR)throw Error("AIS_PRIVATE_DATA_DIR missing; use a private persistent volume outside the repository");
 const store=await openPrivateTrial({directory:env.AIS_PRIVATE_DATA_DIR,now});
 const expires=Date.parse(store.manifest.endsAt);
 if(now()>=expires)throw Error("The seven-day trial window has elapsed. Review report before a new trial");
 const provider=createProvider({apiKey:env.AISSTREAM_API_KEY});
 const session=createTrialSession({store,now,providerId:provider.id});
 let stopped=false,heartbeatTimer=null,silenceTimer=null;
 const stop=async(reason)=>{
   if(stopped)return;
   stopped=true;
   clearInterval(heartbeatTimer);clearTimeout(silenceTimer);
   try{await provider.stop()}catch(e){err("Provider stop issue: "+e.message)}
   try{await session.heartbeat()}catch(e){err("Heartbeat stop issue: "+e.message)}
   await session.close();
   log("AIS private trial collector stopped: "+reason);
 };
 const onFrame=raw=>{
   session.onMessage(raw).catch(e=>{err("Private writer/normalizer failure: "+e.message);void stop("journal_failure")});
 };
 await session.heartbeat({processStart:true});
 // Provider callbacks are connected to an in-memory FSM and secure on-disk journal.
 try{
   await provider.start(onFrame,session.onHealth);
 }catch(e){await stop("startup_error");throw e}
 heartbeatTimer=setInterval(async()=>{
   if(stopped)return;
   try{
     await session.heartbeat();
     if(now()>=expires){await stop("seven_day_window_elapsed")}
   }catch(e){err("Heartbeat error: "+e.message);await stop("heartbeat_error")}
 },60000);
 heartbeatTimer.unref?.();
 const remaining=Math.max(1000,expires-now());
 silenceTimer=setTimeout(()=>{void stop("seven_day_window_elapsed")},remaining);
 // The WebSocket remains active and keeps the process alive; timers are only supporting signals.
 if(import.meta.url===pathToFileURL(process.argv[1]||"").href){
   process.on("SIGINT",()=>{void stop("SIGINT")});
   process.on("SIGTERM",()=>{void stop("SIGTERM")});
 }
 log("Private AIS trial collector started (NOT official coverage). Start: "+store.manifest.startedAt+" end: "+store.manifest.endsAt);
 return {session,store,stop,provider};
}

if(import.meta.url===pathToFileURL(process.argv[1]||"").href){
 runSevenDayTrial().catch(err=>{
   console.error("AIS trial cannot start: "+err.message);
   process.exitCode=1;
 });
}
