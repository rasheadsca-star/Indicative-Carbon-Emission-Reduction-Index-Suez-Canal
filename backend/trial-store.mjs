/**
 * Private seven-day AIS trial journal.
 * Never store licensed/raw telemetry in the public GitHub checkout.
 */
import {mkdir,realpath,readFile,writeFile,appendFile,chmod,readdir} from "node:fs/promises";
import {resolve,sep,join} from "node:path";

export const TRIAL_DAYS=7;
export const TRIAL_HOURS=TRIAL_DAYS*24;
const validDate=ms=>Number.isFinite(ms)&&ms>Date.UTC(2025,0,1);
const iso=ms=>new Date(ms).toISOString();

export async function openPrivateTrial({directory,projectDir=process.cwd(),now=()=>Date.now(),providerId="aisstream"}={}){
 if(typeof directory!=="string"||!directory.trim())throw Error("AIS_PRIVATE_DATA_DIR must be specified");
 if(!/^[a-z][a-z0-9_-]{1,50}$/i.test(providerId))throw Error("Invalid provider ID");
 const dest=resolve(directory),project=await realpath(resolve(projectDir));
 if(dest===project||dest.startsWith(project+sep))throw Error("Private AIS data must be outside the public repository");
 await mkdir(dest,{recursive:true,mode:0o700});
 const target=await realpath(dest);
 if(target===project||target.startsWith(project+sep))throw Error("Private AIS symlink points into repository");
 await chmod(target,0o700);
 const manifestPath=join(target,"trial-manifest.json");
 let manifest;
 try{manifest=JSON.parse(await readFile(manifestPath,"utf8"))}
 catch(e){
   if(e.code!=="ENOENT")throw Error("Cannot parse existing private trial manifest");
   const start=now();
   if(!validDate(start))throw Error("Invalid trial start timestamp");
   manifest={schema:"ceri-sc-private-ais-trial-v1",providerId,startedAt:iso(start),
     endsAt:iso(start+TRIAL_DAYS*86400000),officialReferenceAvailable:false,
     dataAccess:"PRIVATE_ONLY",status:"TRIAL_NOT_OFFICIAL_TRAFFIC"};
   await writeFile(manifestPath,JSON.stringify(manifest,null,2)+"\n",{flag:"wx",mode:0o600});
 }
 if(manifest.schema!=="ceri-sc-private-ais-trial-v1"||manifest.providerId!==providerId||
    !validDate(Date.parse(manifest.startedAt))||
    Date.parse(manifest.endsAt)-Date.parse(manifest.startedAt)!==TRIAL_DAYS*86400000)
    throw Error("Existing manifest invalid or incompatible");
 let queued=Promise.resolve(),pending=0,failure=null;
 const validTypes=new Set(["position","candidate","heartbeat"]);
 function append(type,data){
   if(!validTypes.has(type))throw Error("Unapproved private event type");
   const ts=typeof data?.at==="string"?Date.parse(data.at):now();
   if(!validDate(ts))throw Error("Invalid event timestamp");
   if(pending>=5000)throw Error("Trial disk writer backlog limit exceeded");
   const filename=join(target,type+"-"+iso(ts).slice(0,10)+".ndjson");
   const line=JSON.stringify(data)+"\n";
   pending++;
   const next=queued.then(async()=>{
      if(failure)throw failure;
      await appendFile(filename,line,{encoding:"utf8",mode:0o600});
   });
   queued=next.catch(e=>{failure=e;}); 
   return next.finally(()=>{pending--});
 }
 return {
   directory:target,manifest,
   append,
   drain:async()=>{await queued;if(failure)throw failure},
   get pending(){return pending},
   async listFiles(type){
     if(!validTypes.has(type))throw Error("Unapproved event type");
     return (await readdir(target)).filter(x=>x.startsWith(type+"-")&&x.endsWith(".ndjson")).sort().map(x=>join(target,x));
   }
 };
}
