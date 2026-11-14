/**
 * Operational source-quality sample, NOT a vessel register.
 * Samples public source availability and recent vessel snapshot coverage.
 * Saves aggregates only; never saves raw MMSI, AIS position, name or NMEA.
 */
import {writeFile,mkdir,readFile} from "node:fs/promises";
import {appendQualitySample,evaluateQuality} from "../src/ais-quality-history.mjs";
const endpoint="https://ais.openwaters.io";
const bbox="29.70,31.90,31.65,32.85";
const checkedAt=new Date().toISOString();
async function request(path){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),18000);
  try{
    const response=await fetch(endpoint+path,{signal:controller.signal,headers:{"Accept":"application/json, text/plain;q=0.5","User-Agent":"CERI-SC-Research-Coverage-Audit/0.1"}});
    return response;
  }finally{clearTimeout(timeout)}
}
const status={version:1,checkedAt,provider:"Open Waters AIS",region:"Suez Canal approximate bounding box",bbox,
  method:"Periodic anonymous snapshot. No official SCA comparison or AIS reception guarantee.",
  use:"diagnostic-only",official:false,emissionsVerified:false,coverageValidated:false,
  health:{reachable:false,httpStatus:null},
  snapshot:{reachable:false,httpStatus:null,recentFeatureCount:null,distinctMmsiCount:null,truncated:null},
  assessment:"NO_VERIFIED_COVERAGE",reason:"This source has not been calibrated against an authoritative daily transit register.",
  errors:[]};
try{
 const r=await request("/health");
 status.health.httpStatus=r.status;status.health.reachable=r.ok;
}catch(e){status.errors.push("health: "+String(e.name||"network error"))}
try{
 const p=new URLSearchParams({bbox,kind:"vessel",max_age:"30m",max_age_moving:"30m"});
 const r=await request("/v1/vessels?"+p);
 status.snapshot.httpStatus=r.status;
 if(!r.ok)throw Error("HTTP "+r.status);
 const data=await r.json();
 if(data?.type!=="FeatureCollection"||!Array.isArray(data.features))throw Error("invalid GeoJSON");
 const distinct=new Set();
 for(const feature of data.features){
   const mmsi=String(feature?.properties?.mmsi??feature?.id??"");
   if(/^\d{9}$/.test(mmsi))distinct.add(mmsi);
 }
 status.snapshot.reachable=true;
 status.snapshot.recentFeatureCount=data.features.length;
 status.snapshot.distinctMmsiCount=distinct.size;
 status.snapshot.truncated=Boolean(data.truncated);
 if(data.truncated)status.errors.push("Provider snapshot may be truncated");
 if(distinct.size===0)status.errors.push("No MMSI returned by this regional snapshot; not proof of zero traffic");
}catch(e){status.errors.push("snapshot: "+String(e.name||e.message||"request error"))}
await mkdir("data",{recursive:true});
await writeFile("data/ais-source-health.json",JSON.stringify(status,null,2)+"\n","utf8");
let previous={samples:[]};
try{previous=JSON.parse(await readFile("data/ais-quality-history.json","utf8"));}catch{}
const history=appendQualitySample(previous,status);
await writeFile("data/ais-quality-history.json",JSON.stringify(history,null,2)+"\n","utf8");
const quality=evaluateQuality(history,new Date(checkedAt));
await writeFile("data/ais-quality-summary.json",JSON.stringify(quality,null,2)+"\n","utf8");
console.log(JSON.stringify({checkedAt,health:status.health,snapshot:status.snapshot,assessment:status.assessment,errors:status.errors}));
