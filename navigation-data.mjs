/**
 * CERI-SC navigation statistics intake: untrusted CSV -> traceable, provisional records.
 * Never upgrades a self-reported source label to an authenticated SCA record.
 */
export const REQUIRED_FIELDS = ["date","direction","ship_type","vessel_count","net_tonnage","source","source_date","status"];
const DIRECTIONS = new Set(["northbound","southbound"]);
const STATUSES = new Set(["source-reported","provisional","scenario"]);
export function csvRows(input) {
  if (typeof input!=="string" || !input.trim()) throw Error("CSV is empty");
  if (input.length>5_000_000) throw Error("CSV exceeds 5 MB");
  const rows=[]; let row=[],field="",quoted=false,endedQuote=false;
  const src=input.replace(/^\uFEFF/,"");
  for(let i=0;i<src.length;i++){
    const c=src[i];
    if(quoted){
      if(c==='"' && src[i+1]==='"'){field+='"';i++;}
      else if(c==='"'){quoted=false;endedQuote=true;}
      else field+=c;
    } else if(c==='"' && !field && !endedQuote){quoted=true;}
    else if(c===',' || c==='\n' || c==='\r'){
      row.push(field);field="";endedQuote=false;
      if(c!==','){
        if(row.some(x=>x.trim()!=="")) rows.push(row);
        row=[];
        if(c==='\r'&&src[i+1]==='\n') i++;
      }
    } else {
      if(endedQuote && c.trim()) throw Error("Unexpected character after CSV quote");
      if(!endedQuote)field+=c;
    }
  }
  if(quoted)throw Error("Unterminated quoted field");
  row.push(field);
  if(row.some(x=>x.trim()!==""))rows.push(row);
  return rows;
}
function validDate(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+"T00:00:00Z");
  return !Number.isNaN(+d) && d.toISOString().slice(0,10)===value;
}
function nonnegativeNumber(v,{integer=false}={}) {
  const s=String(v).trim();
  if(!/^(0|[1-9]\d*)(?:\.\d+)?$/.test(s))return null;
  const n=Number(s);
  if(!Number.isSafeInteger(n) && integer)return null;
  if(!Number.isFinite(n)||n<0||(integer&&!Number.isInteger(n)))return null;
  return n;
}
export function parseNavigationCSV(csv) {
  const data=csvRows(csv);
  if(data.length<2)throw Error("CSV needs a header and at least one data row");
  if(data.length>10002)throw Error("CSV exceeds 10,000 rows");
  const keys=data[0].map(x=>x.trim().toLowerCase());
  if(new Set(keys).size!==keys.length)throw Error("Duplicate CSV header");
  for(const key of REQUIRED_FIELDS)if(!keys.includes(key))throw Error("Missing column: "+key);
  const records=[],errors=[],seen=new Set();
  for(let i=1;i<data.length;i++){
    const line=i+1, values=data[i], row=Object.fromEntries(keys.map((k,j)=>[k,(values[j]||"").trim()]));
    if(values.length!==keys.length){errors.push({line,message:"Column count mismatch"});continue;}
    const direction=row.direction.toLowerCase();
    const shipType=row.ship_type.trim();
    const vesselCount=nonnegativeNumber(row.vessel_count,{integer:true});
    const netTonnage=row.net_tonnage===""?null:nonnegativeNumber(row.net_tonnage);
    const status=row.status.toLowerCase();
    const issues=[];
    if(!validDate(row.date))issues.push("Invalid ISO date");
    if(!DIRECTIONS.has(direction))issues.push("Invalid direction");
    if(!shipType||shipType.length>100)issues.push("Invalid ship type");
    if(vesselCount===null)issues.push("Invalid integer vessel count");
    if(row.net_tonnage!=="" && netTonnage===null)issues.push("Invalid net tonnage");
    if(!row.source||row.source.length>250)issues.push("Source required (max 250 characters)");
    if(!validDate(row.source_date))issues.push("Invalid source date");
    if(!STATUSES.has(status))issues.push("Status must be source-reported, provisional, or scenario");
    if(validDate(row.date)&&validDate(row.source_date)&&row.source_date<row.date)issues.push("Source date predates observed date");
    const key=[row.date,direction,shipType.toLowerCase()].join("|");
    if(seen.has(key))issues.push("Duplicate date/direction/type");
    seen.add(key);
    if(issues.length){errors.push({line,message:issues.join("; ")});continue;}
    records.push({date:row.date,direction,shipType,vesselCount,netTonnage,source:row.source,sourceDate:row.source_date,status});
  }
  if(errors.length)return {ok:false,records:[],errors,summaries:[],warnings:[]};
  const groups=new Map();
  for(const record of records){
    const key=record.date+"|"+record.direction;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(record);
  }
  const warnings=[],summaries=[];
  for(const [key,items] of groups){
    const totals=items.filter(x=>x.shipType.toUpperCase()==="TOTAL");
    const types=items.filter(x=>x.shipType.toUpperCase()!=="TOTAL");
    const total=totals[0]||null;
    const typedCount=types.reduce((n,x)=>n+x.vesselCount,0);
    const typedNet=types.every(x=>x.netTonnage!==null)?types.reduce((n,x)=>n+x.netTonnage,0):null;
    if(total && types.length && total.vesselCount!==typedCount)errors.push({line:null,message:key+": type counts differ from TOTAL"});
    if(total && types.length && total.netTonnage!==null && typedNet!==null && Math.abs(total.netTonnage-typedNet)>0.01)
      errors.push({line:null,message:key+": type tonnages differ from TOTAL"});
    if(!total)warnings.push(key+": no independent aggregate TOTAL; categories may be incomplete");
    if(!types.length)warnings.push(key+": category breakdown unavailable");
    if(new Set(items.map(x=>x.source+"|"+x.sourceDate+"|"+x.status)).size!==1)
      warnings.push(key+": mixed provenance within group; investigate before use");
    summaries.push({
      date:items[0].date,direction:items[0].direction,
      count:total?total.vesselCount:typedCount,
      netTonnage:total?total.netTonnage:typedNet,
      source:total?.source||items[0].source,
      sourceDate:total?.sourceDate||items[0].sourceDate,
      status:"unverified-import",
      completeness:total&&types.length?"aggregate-and-categories":total?"aggregate-only":"categories-only",
      categories:types.length
    });
  }
  if(errors.length)return {ok:false,records:[],errors,summaries:[],warnings};
  summaries.sort((a,b)=>a.date.localeCompare(b.date)||a.direction.localeCompare(b.direction));
  return {ok:true,records,summaries,errors:[],warnings};
}
