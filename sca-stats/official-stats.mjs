/**
 * SCA published-statistics reporting layer.
 * Source archives are official publications; entry in local files does not authenticate an arbitrary CSV.
 * Missing daily/weekly observations stay null. No invented extrapolation.
 */
function expectNonnegativeInt(value,label) {
  if (!Number.isSafeInteger(value)||value<0)throw Error(label+" must be a nonnegative safe integer");
  return value;
}
export function validatePublishedSeries(data) {
  if(data?.schema!=="ceri-sc-official-sca-summary-v1"||
     typeof data.sourceUrl!=="string"||!data.sourceUrl.startsWith("https://www.suezcanal.gov.eg/"))
    throw Error("Expected official SCA report source metadata");
  const years=Object.keys(data.monthly);
  for(const year of years){
    const months=data.monthly[year];
    if(!Array.isArray(months)||months.length!==12)throw Error("Expected 12 months for "+year);
    let vessels=0,net=0;
    for(const [i,row] of months.entries()){
      if(!Array.isArray(row)||row.length!==2)throw Error("Invalid month "+i);
      vessels+=expectNonnegativeInt(row[0],"vessel count");
      net+=expectNonnegativeInt(row[1],"net tonnage");
    }
    if(vessels!==data.annual[year]?.vessels||net!==data.annual[year]?.netTonnageThousands)
      throw Error("Monthly sum does not match official year "+year);
  }
  for(const [year,entry] of Object.entries(data.annual)){
    expectNonnegativeInt(entry.vessels,"annual vessels "+year);
    expectNonnegativeInt(entry.netTonnageThousands,"annual net tonnage "+year);
  }
  return true;
}
export function annualTrends(data) {
  validatePublishedSeries(data);
  const years=Object.keys(data.annual).map(Number).sort((a,b)=>a-b);
  return years.map((year,i)=>{
    const prev=data.annual[years[i-1]];
    const {vessels,netTonnageThousands}=data.annual[year];
    return {year,vessels,netTonnageThousands,
      changeVesselsPct:prev&&prev.vessels?100*(vessels-prev.vessels)/prev.vessels:null,
      valueClass:"published-official-summary",sourceUrl:data.sourceUrl};
  });
}
export function monthlyTrends(data,year) {
  validatePublishedSeries(data);
  const current=data.monthly[String(year)];
  if(!current)return [];
  const previous=data.monthly[String(Number(year)-1)];
  return current.map(([vessels,netTonnageThousands],index)=>{
    const prior=previous?.[index]?.[0]??null;
    return {period:String(year)+"-"+String(index+1).padStart(2,"0"),vessels,netTonnageThousands,
      yoyChangePct:prior>0?100*(vessels-prior)/prior:null,
      valueClass:"published-official-summary",sourceUrl:data.sourceUrl};
  });
}
function validIsoDay(s){
  if(!/^\d{4}-\d\d-\d\d$/.test(s))return false;
  const date=new Date(s+"T00:00:00Z");return !Number.isNaN(+date)&&date.toISOString().slice(0,10)===s;
}
function daySequence(start,days) {
  const time=Date.parse(start+"T00:00:00Z");
  return Array.from({length:days},(_,i)=>new Date(time+i*86400000).toISOString().slice(0,10));
}
/** Strict daily CSV derived records; external file does NOT grant verified status. */
export function validateDailyObservations(rows) {
  if(!Array.isArray(rows)||rows.length>15000)throw Error("Daily records exceed limit");
  const seen=new Set(),clean=[];
  for(const r of rows){
    if(!validIsoDay(r.date))throw Error("Invalid observed date");
    const count=expectNonnegativeInt(r.vessels,"daily vessels");
    if(seen.has(r.date))throw Error("Duplicate daily observation "+r.date);
    seen.add(r.date);
    const source=String(r.source||"").trim();
    if(!source)throw Error("Missing daily source attribution");
    clean.push({date:r.date,vessels:count,source,status:"externally-supplied-unverified"});
  }
  return clean.sort((a,b)=>a.date.localeCompare(b.date));
}
/**
 * Calendar weekly totals only if every one of 7 required dates exists;
 * firstDay must represent the explicit window start.
 */
export function weeklyFromDaily(rows,firstDay) {
  if(!validIsoDay(firstDay))throw Error("Invalid week start");
  const records=validateDailyObservations(rows);
  const byDate=new Map(records.map(r=>[r.date,r]));
  const expected=daySequence(firstDay,7);
  const found=expected.map(date=>byDate.get(date)).filter(Boolean);
  return {start:firstDay,end:expected.at(-1),coveredDays:found.length,requiredDays:7,
    vesselCount:found.length===7?found.reduce((sum,r)=>sum+r.vessels,0):null,
    dataStatus:found.length===7?"derived-from-external-daily-unverified":"insufficient-daily-coverage",
    sourceCount:new Set(found.map(x=>x.source)).size,
    note:"Only a 7-day arithmetic sum; no official SCA weekly publication is implied."};
}
