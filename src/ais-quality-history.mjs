/**
 * Source observations are repeated regional snapshot samples, not unique passages.
 * Persist ONLY aggregate counts. Never sum snapshot counts into a vessel count.
 */
const MAX_SAMPLES=24*45;
const isInt=n=>Number.isSafeInteger(n)&&n>=0;
export function normalizeQualitySample(status){
  const t=Date.parse(status?.checkedAt??"");
  if(!Number.isFinite(t)||!Number.isInteger(status?.version)||status.version!==1)
    throw Error("Invalid AIS observation metadata");
  const count=status.snapshot?.distinctMmsiCount;
  const features=status.snapshot?.recentFeatureCount;
  const valid=status.snapshot?.reachable===true&&isInt(count)&&isInt(features)&&count<=features&&!status.snapshot.truncated;
  return {
    checkedAt:new Date(t).toISOString(),healthy:status.health?.reachable===true,
    hasSnapshot:valid,uniqueMmsi:valid?count:null,snapshotFeatures:valid?features:null,
    status:valid?"PARTIAL_UNVERIFIED_SAMPLE":"UNUSABLE_OR_UNAVAILABLE"
  };
}
export function appendQualitySample(history,current){
  const sample=normalizeQualitySample(current);
  const entries=Array.isArray(history?.samples)?history.samples:[];
  const byTime=new Map();
  for(const raw of entries){
    if(!raw||typeof raw.checkedAt!=="string"||!Number.isFinite(Date.parse(raw.checkedAt)))continue;
    if(!["PARTIAL_UNVERIFIED_SAMPLE","UNUSABLE_OR_UNAVAILABLE"].includes(raw.status))continue;
    const v=raw.hasSnapshot&&isInt(raw.uniqueMmsi)?raw.uniqueMmsi:null;
    byTime.set(raw.checkedAt,{checkedAt:raw.checkedAt,healthy:raw.healthy===true,
      hasSnapshot:v!==null,uniqueMmsi:v,snapshotFeatures:isInt(raw.snapshotFeatures)?raw.snapshotFeatures:null,status:raw.status});
  }
  byTime.set(sample.checkedAt,sample);
  return {schema:"ceri-sc-ais-aggregate-samples-v1",source:"Open Waters regional snapshot",
    updatedAt:sample.checkedAt,claim:"Diagnostic snapshots, NOT transits and NOT validated coverage.",
    samples:[...byTime.values()].sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt)).slice(-MAX_SAMPLES)};
}
export function evaluateQuality(history,now=new Date()){
  const samples=Array.isArray(history?.samples)?history.samples:[];
  const t=now instanceof Date?now.getTime():Date.parse(now);
  if(!Number.isFinite(t))throw Error("Invalid evaluation time");
  const within=h=>samples.filter(x=>{
    const age=t-Date.parse(x.checkedAt);
    return age>=0&&age<h*3600000; // Half-open window prevents counting both hourly endpoints
  });
  const periods=[{hours:24,key:"last24h"},{hours:168,key:"last7d"}];
  const out={status:"UNVERIFIED_COVERAGE",assessedAt:new Date(t).toISOString(),sampleCount:samples.length,
    why:"Regional snapshots overlap in time; do NOT sum unique MMSIs or infer daily SCA vessel counts."};
  for(const {hours,key} of periods){
    const arr=within(hours),usable=arr.filter(x=>x.hasSnapshot&&isInt(x.uniqueMmsi));
    const nums=usable.map(x=>x.uniqueMmsi).sort((a,b)=>a-b);
    const mean=nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;
    const median=nums.length?nums[Math.floor((nums.length-1)/2)]:null;
    const latest=arr.at(-1)||null;
    out[key]={samples:arr.length,usableSamples:usable.length,failures:arr.length-usable.length,
      snapshotMean:mean,snapshotMedian:median,snapshotMax:nums.length?nums.at(-1):null,
      latestCheckedAt:latest?.checkedAt||null,stale:!latest||(t-Date.parse(latest.checkedAt)>150*60000),
      transitCount:null,coverageRate:null,
      // Hourly scheduled collection: estimate its execution coverage only after a
      // complete observation window has elapsed; it is NOT AIS geographic coverage.
      scheduledHourlyChecks:hours,
      scheduleWindowMature:samples.some(x=>{
        const age=t-Date.parse(x.checkedAt);
        return age>=hours*3600000 && age<=45*24*3600000;
      }),
      collectionRunRatio:null,
      assessment:arr.length===0?"NO_SAMPLES":usable.length===0?"NO_USABLE_SNAPSHOT":"REGIONAL_SAMPLE_ONLY"};
    if(out[key].scheduleWindowMature){
      out[key].collectionRunRatio=Math.min(1,arr.length/hours);
    }
  }
  return out;
}
