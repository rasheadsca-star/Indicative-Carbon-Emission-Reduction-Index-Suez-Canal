#!/usr/bin/env node
/** Docker liveness = recent local journal heartbeat; NOT AIS coverage. */
import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
export async function checkTrialHeartbeat(directory,{nowMs=Date.now(),maxAgeMs=4*60_000}={}){
 if(!directory)throw Error("Missing private trial directory");
 const files=(await readdir(directory)).filter(f=>/^heartbeat-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort();
 if(!files.length)return {ok:false,reason:"NO_HEARTBEAT"};
 const raw=await readFile(join(directory,files.at(-1)),"utf8");
 const lines=raw.trim().split("\n");
 let last;try{last=JSON.parse(lines.at(-1))}catch{return {ok:false,reason:"BAD_HEARTBEAT"}}
 const age=nowMs-Date.parse(last.at||"");
 return Number.isFinite(age)&&age>=0&&age<=maxAgeMs?
   {ok:true,reason:"COLLECTOR_HEARTBEAT_RECENT_COVERAGE_UNVERIFIED"}:
   {ok:false,reason:"HEARTBEAT_STALE"};
}
if(import.meta.url===pathToFileURL(process.argv[1]||"").href){
 try{
   const status=await checkTrialHeartbeat(process.env.AIS_PRIVATE_DATA_DIR);
   console.log(status.reason);
   if(!status.ok)process.exitCode=1;
 }catch(e){console.error("HEALTHCHECK_ERROR");process.exitCode=1}
}
