/**
 * Local, zero-upload evidence pipeline.
 * 1. One-to-one AIS candidate vs reference reconciliation.
 * 2. Join operating inputs to EXACT reference key: MMSI + direction + exit UTC.
 * 3. Reject unreferenced / ambiguous / invalid records, never compute them as zero.
 * 4. Compute TTW-only voyage scenarios, never mark as actual verified savings.
 */
import {readCsv,reconcilePassages,normalizePassages} from "../ais-lab/reconciliation.mjs";
import {computeVoyageScenario} from "./voyage-audit.mjs";
const COLUMNS=["MMSI","Direction","Exit UTC","Suez Distance Nm","Cape Distance Nm","Speed Kn",
 "Sea Burn Tonnes Day","Suez Extra Hours","Cape Extra Hours",
 "Standby Burn Tonnes Day","Combustion EF","Burn Sensitivity Pct",
 "Distance Source","Fuel Source","Factor Source"];
const inputs=[
 ["suezDistanceNm","suez distance nm"],["capeDistanceNm","cape distance nm"],
 ["speedKn","speed kn"],["seaBurnTonnesDay","sea burn tonnes day"],
 ["suezExtraHours","suez extra hours"],["capeExtraHours","cape extra hours"],
 ["standbyBurnTonnesDay","standby burn tonnes day"],
 ["combustionCO2TonnesPerTonne","combustion ef"],
 ["burnSensitivityPct","burn sensitivity pct"]
];
const direction=value=>({north:"northbound",northbound:"northbound",south:"southbound",southbound:"southbound"})[String(value).trim().toLowerCase()]||null;
const utcTime=v=>{
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(v))return null;
 const time=Date.parse(v);
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,16)===v.slice(0,16)
   ?new Date(time).toISOString():null;
};
export function auditVesselEvidence(aisCSV,referenceCSV,operationCSV,{toleranceMinutes=180}={}){
 const reconciliation=reconcilePassages(aisCSV,referenceCSV,{toleranceMinutes});
 if(!reconciliation.ok)return {ok:false,stage:"reconcile",errors:reconciliation.errors};
 const reference=normalizePassages(referenceCSV,"reference").items;
 const ops=readCsv(operationCSV,COLUMNS);
 const referenceByKey=new Map(reference.map(item=>[
   item.mmsi+"|"+item.direction+"|"+new Date(item.exitMs).toISOString(),item
 ]));
 const rows=new Map(),errors=[],valid=[];
 for(const r of ops){
   const mmsi=r.mmsi||"";
   const d=direction(r.direction);
   const timestamp=utcTime(r["exit utc"]||"");
   const key=mmsi+"|"+d+"|"+timestamp;
   const reasons=[];
   if(!/^\d{9}$/.test(mmsi))reasons.push("invalid_mmsi");
   if(!d)reasons.push("invalid_direction");
   if(!timestamp)reasons.push("invalid_timestamp");
   if(!referenceByKey.has(key))reasons.push("no_exact_reference_record");
   if(rows.has(key))reasons.push("duplicate_operational_record");
   rows.set(key,r.line);
   const provenance={
     distance:r["distance source"]?.trim(),
     fuel:r["fuel source"]?.trim(),
     factor:r["factor source"]?.trim()
   };
   if(Object.values(provenance).some(v=>!v))reasons.push("missing_operational_source");
   let scenario=null;
   if(!reasons.length){
     const modelInputs={};
     for(const [name,column] of inputs){
       const value=r[column];
       modelInputs[name]=value===""?NaN:Number(value);
     }
     try{scenario=computeVoyageScenario(modelInputs)}
     catch(err){reasons.push("invalid_operational_input: "+err.message)}
   }
   if(reasons.length){errors.push({line:r.line,reasons});continue}
   valid.push({key,mmsi,direction:d,referenceExit:timestamp,source:referenceByKey.get(key).source,provenance,scenario,line:r.line});
 }
 const pairKeys=new Set(reconciliation.pairs.map(p=>p.mmsi+"|"+p.direction+"|"+p.referenceExit));
 const matched=valid.filter(item=>pairKeys.has(item.key));
 const unmatched=valid.filter(item=>!pairKeys.has(item.key));
 // Explicit ambiguity: multiple reference crossings with same vessel+direction and
 // within matching tolerance of an AIS exit. Do not use a greedy match to label these verified.
 const ambiguousKeys=new Set();
 for(const pair of reconciliation.pairs){
   const aisTime=Date.parse(pair.aisExit),candidates=reference.filter(ref=>
     ref.mmsi===pair.mmsi&&ref.direction===pair.direction&&
     Math.abs(ref.exitMs-aisTime)<=toleranceMinutes*60000);
   if(candidates.length>1)ambiguousKeys.add(pair.mmsi+"|"+pair.direction+"|"+pair.referenceExit);
 }
 const accepted=matched.filter(x=>!ambiguousKeys.has(x.key));
 const ambiguous=matched.filter(x=>ambiguousKeys.has(x.key));
 const sums=accepted.reduce((a,item)=>{
   a.suezFuelTonnes+=item.scenario.suez.fuelTonnes;
   a.capeFuelTonnes+=item.scenario.cape.fuelTonnes;
   a.deltaFuelTonnes+=item.scenario.deltaFuelTonnes;
   a.deltaCO2Tonnes+=item.scenario.deltaCO2Tonnes;
   a.deltaHours+=item.scenario.deltaHours;
   return a;
 },{suezFuelTonnes:0,capeFuelTonnes:0,deltaFuelTonnes:0,deltaCO2Tonnes:0,deltaHours:0});
 const byDirection={northbound:0,southbound:0};
 for(const item of accepted)byDirection[item.direction]++;
 // Detailed identities remain local to this function. UI and exported report receive
 // aggregate results only; never expose MMSI in public JSON or console logs.
 return {ok:true,
   stage:"batch-voyage-audit",
   trust:"RECONCILED_TO_USER_SUPPLIED_REFERENCE_UNAUTHENTICATED",
   model:"TTW_COMBUSTION_SCENARIO_ONLY",
   official:false,verified:false,emissionsCertified:false,
   aisCandidates:reconciliation.aisCount,referenceRecords:reconciliation.referenceCount,
   sourceMatched:reconciliation.matched,
   suppliedOperatingRows:ops.length,
   eligible:accepted.length,unmatchedOperatingRows:unmatched.length,
   ambiguousMatchedRows:ambiguous.length,rejectedRows:errors.length,
   missingOperatingInputs:reconciliation.pairs.length-matched.length,
   byDirection,totals:sums,
   // Reasons omit identities and numeric values, retaining only the row number and control.
   rejectionDetails:errors,
   warning:"All inputs originate from user-provided local files. CSV labels do not authenticate SCA records, fuel/route assumptions, or AIS reception. Aggregate is NOT measured verified avoided emissions and MUST NOT be extrapolated to all canal transits.",
   methodology:"Exact reference identity/time keyed operational inputs; AIS one-to-one temporal matching; 3 evidence source fields; single-voyage TTW model. No WtW, CH4/N2O, port/sea realism check or independent source authentication."};
}
