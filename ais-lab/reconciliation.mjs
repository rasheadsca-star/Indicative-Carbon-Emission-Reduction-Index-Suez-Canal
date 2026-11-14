/**
 * Local, audit-ready comparison of independent AIS inference CSV and SCA passage records.
 * Does not authenticate the uploaded reference file or infer official passage status.
 * Never silently matches on vessel name, ship type or a time gap beyond tolerance.
 */
const REQUIRED_AIS=["MMSI","Direction","Exit UTC"];
const REQUIRED_REFERENCE=["MMSI","Direction","Exit UTC","Source"];
const MAX_ROWS=10000;
const MAX_CHARS=5_000_000;
export function readCsv(text,required){
  if(typeof text!=="string"||!text.trim()||text.length>MAX_CHARS)throw Error("CSV empty or too large");
  const cells=[],rows=[];let field="",row=[],inside=false,justClosed=false;
  const src=text.replace(/^\uFEFF/,"");
  for(let i=0;i<src.length;i++){
    const c=src[i];
    if(inside){
      if(c==='"'&&src[i+1]==='"'){field+='"';i++;}
      else if(c==='"'){inside=false;justClosed=true;}
      else field+=c;
    }else if(c==='"'&&field===""&&!justClosed){inside=true;}
    else if(c===","||c==="\n"||c==="\r"){
      row.push(field);field="";justClosed=false;
      if(c!==","){
        if(row.some(v=>v.trim()))rows.push(row);
        row=[];
        if(c==="\r"&&src[i+1]==="\n")i++;
      }
    }else {
      if(justClosed&&c.trim())throw Error("Invalid CSV escaping");
      if(!justClosed)field+=c;
    }
  }
  if(inside)throw Error("Unclosed CSV quote");
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2||rows.length>MAX_ROWS+1)throw Error("Invalid CSV row count");
  const fields=rows[0].map(s=>s.trim());
  if(new Set(fields.map(s=>s.toLowerCase())).size!==fields.length)throw Error("Repeated header");
  const indices=new Map(fields.map((s,i)=>[s.toLowerCase(),i]));
  for(const key of required)if(!indices.has(key.toLowerCase()))throw Error("Required field missing: "+key);
  const result=[];
  for(let i=1;i<rows.length;i++){
    const values=rows[i];if(values.length!==fields.length)throw Error("Column count mismatch on CSV line "+(i+1));
    const parsed={line:i+1};
    for(const [key,index] of indices)parsed[key]=values[index].trim();
    result.push(parsed);
  }
  return result;
}
const DIRECTION={northbound:"northbound",southbound:"southbound",north:"northbound",south:"southbound"};
function timestamp(value){
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(value))return NaN;
  const ms=Date.parse(value);
  if(!Number.isFinite(ms))return NaN;
  const d=new Date(ms).toISOString().slice(0,16),provided=value.slice(0,16);
  return d===provided?ms:NaN;
}
export function normalizePassages(csv,kind){
  const input=readCsv(csv,kind==="reference"?REQUIRED_REFERENCE:REQUIRED_AIS);
  const out=[],seen=new Set(),errors=[];
  for(const r of input){
    const mmsi=r.mmsi||"";
    const direction=DIRECTION[(r.direction||"").toLowerCase()];
    const t=timestamp(r["exit utc"]||"");
    const source=(r.source||"").trim();
    const issues=[];
    if(!/^\d{9}$/.test(mmsi))issues.push("MMSI must be 9 digits");
    if(!direction)issues.push("Invalid direction");
    if(!Number.isFinite(t))issues.push("Exit UTC must be ISO 8601 Z");
    if(kind==="reference"&&!source)issues.push("Reference source required");
    if(kind==="ais"&&r.verification && /^(verified|official|certified)$/i.test(r.verification))issues.push("AIS cannot self-certify");
    if(!issues.length){
      const key=mmsi+"|"+direction+"|"+t;
      if(seen.has(key))issues.push("Duplicate passage key");
      seen.add(key);
    }
    if(issues.length){errors.push({line:r.line,message:issues.join("; ")});continue;}
    out.push({mmsi,direction,exitMs:t,source:source||"AIS inferred",line:r.line});
  }
  if(errors.length)return {ok:false,items:[],errors};
  return {ok:true,items:out,errors:[]};
}
export function reconcilePassages(aisCsv,referenceCsv,{toleranceMinutes=180}={}){
  if(!Number.isInteger(toleranceMinutes)||toleranceMinutes<1||toleranceMinutes>360)
    throw Error("Tolerance must be an integer between 1 and 360 minutes");
  const a=normalizePassages(aisCsv,"ais"),r=normalizePassages(referenceCsv,"reference");
  if(!a.ok||!r.ok)return {ok:false,errors:[...a.errors.map(e=>({...e,file:"ais"})),...r.errors.map(e=>({...e,file:"reference"}))]};
  const used=new Set(),pairs=[],unmatchedAIS=[];
  // One-to-one chronological matching; never match by name, type or guessed vessel profile.
  const ordered=[...a.items].sort((x,y)=>x.exitMs-y.exitMs);
  for(const candidate of ordered){
    let best=-1,gap=Infinity;
    for(let i=0;i<r.items.length;i++){
      if(used.has(i))continue;
      const ref=r.items[i];
      if(candidate.mmsi!==ref.mmsi||candidate.direction!==ref.direction)continue;
      const minutes=Math.abs(candidate.exitMs-ref.exitMs)/60000;
      if(minutes<=toleranceMinutes && minutes<gap){gap=minutes;best=i;}
    }
    if(best<0){unmatchedAIS.push(candidate);continue;}
    used.add(best);
    pairs.push({mmsi:candidate.mmsi,direction:candidate.direction,aisExit:new Date(candidate.exitMs).toISOString(),
      referenceExit:new Date(r.items[best].exitMs).toISOString(),offsetMinutes:Math.round(gap*100)/100,
      source:r.items[best].source});
  }
  const unmatchedReferences=r.items.filter((_,i)=>!used.has(i));
  const refCount=r.items.length,aisCount=a.items.length;
  return {ok:true,verification:"manual-reference-not-authenticated",toleranceMinutes,
    aisCount,referenceCount:refCount,matched:pairs.length,
    referenceMatchRate:refCount?pairs.length/refCount:null,
    aisMatchRate:aisCount?pairs.length/aisCount:null,
    pairs,unmatchedAIS,unmatchedReferences,
    warning:"Neither file is institutionally authenticated. Match rates are reconciliation diagnostics, NOT precision/recall or verified AIS coverage without an independently validated complete reference."};
}
