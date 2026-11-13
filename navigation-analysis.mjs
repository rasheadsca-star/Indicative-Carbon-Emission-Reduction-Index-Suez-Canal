/**
 * Navigation intelligence from CSV datasets with explicit completeness.
 * Does NOT make observations "official" or generate emissions estimates.
 * Completeness requires BOTH direction totals for every day in a period.
 */
const pad=n=>String(n).padStart(2,"0");
const isoDay=d=>d.toISOString().slice(0,10);
const dayRange=(start,end)=>{
  const days=[];
  const first=new Date(start+"T00:00:00Z").getTime(),last=new Date(end+"T00:00:00Z").getTime();
  for(let t=first;t<=last;t+=86400000)days.push(isoDay(new Date(t)));
  return days;
};
function daysInMonth(year,month){
  const last=new Date(Date.UTC(year,month,0)).getUTCDate();
  return Array.from({length:last},(_,i)=>year+"-"+pad(month)+"-"+pad(i+1));
}
function daysInYear(year){
  return dayRange(year+"-01-01",year+"-12-31");
}
const groupKey=(date,direction)=>date+"|"+direction;
export function buildNavigationIntelligence(importResult){
  if(!importResult?.ok||!Array.isArray(importResult.records)||!Array.isArray(importResult.summaries))
    throw Error("Use a successful parseNavigationCSV result");
  const records=importResult.records,summaries=importResult.summaries;
  const index=new Map(summaries.map(s=>[groupKey(s.date,s.direction),s]));
  const recordsByGroup=new Map();
  for(const record of records){
    const key=groupKey(record.date,record.direction);
    if(!recordsByGroup.has(key))recordsByGroup.set(key,[]);
    recordsByGroup.get(key).push(record);
  }
  const dates=[...new Set(summaries.map(s=>s.date))].sort();
  if(!dates.length)throw Error("No navigation records");
  const dayRows=dates.map(date=>{
    const north=index.get(groupKey(date,"northbound"));
    const south=index.get(groupKey(date,"southbound"));
    const both=Boolean(north&&south);
    const aggregateComplete=both && north.completeness!=="categories-only" && south.completeness!=="categories-only";
    const categoryComplete=both && north.completeness==="aggregate-and-categories" && south.completeness==="aggregate-and-categories";
    const compatible=both&&north.source===south.source&&north.sourceDate===south.sourceDate&&
      (north.status==="unverified-import"&&south.status==="unverified-import");
    const counts=both?north.count+south.count:null;
    const tonnage=both&&north.netTonnage!==null&&south.netTonnage!==null?north.netTonnage+south.netTonnage:null;
    const categories={};
    if(categoryComplete){
      for(const direction of ["northbound","southbound"]){
        for(const record of recordsByGroup.get(groupKey(date,direction))||[]){
          if(record.shipType.toUpperCase()==="TOTAL")continue;
          const name=record.shipType;
          categories[name]=(categories[name]||0)+record.vesselCount;
        }
      }
    }
    const sumTypes=Object.values(categories).reduce((a,b)=>a+b,0);
    return {
      date,northCount:north?.count??null,southCount:south?.count??null,
      count:aggregateComplete?counts:null,netTonnage:aggregateComplete?tonnage:null,
      aggregateComplete,categoryComplete:categoryComplete&&sumTypes===counts,
      comparableProvenance:compatible,categories:categoryComplete&&sumTypes===counts?categories:null,
      status:"unverified-import",
      note:!both?"Missing direction":!aggregateComplete?"Missing independent TOTAL":!compatible?"Mixed sources":"Structurally reconciled; source not authenticated"
    };
  });
  const datesIndex=new Map(dayRows.map(d=>[d.date,d]));
  function periodSummary(period,requiredDates){
    const observed=requiredDates.map(date=>datesIndex.get(date)).filter(Boolean);
    const accepted=observed.filter(d=>d.aggregateComplete);
    const complete=accepted.length===requiredDates.length;
    const allCategories=complete&&accepted.every(d=>d.categoryComplete);
    const sameProvenance=complete&&accepted.every(d=>d.comparableProvenance);
    const cat={};
    if(allCategories){
      for(const day of accepted)for(const [name,count] of Object.entries(day.categories)){
        cat[name]=(cat[name]||0)+count;
      }
    }
    const count=complete?accepted.reduce((n,d)=>n+d.count,0):null;
    const tonnage=complete&&accepted.every(d=>d.netTonnage!==null)?accepted.reduce((n,d)=>n+d.netTonnage,0):null;
    return {period,expectedDays:requiredDates.length,observedDays:observed.length,
      reconciledDays:accepted.length,complete,categoryComplete:allCategories,comparableProvenance:sameProvenance,
      vesselCount:count,netTonnage:tonnage,categories:allCategories?cat:null,
      coverage:accepted.length+"/"+requiredDates.length,status:"unverified-import",
      note:complete?"Complete calendar coverage; NOT verified against authority":"Partial period. No extrapolated totals"};
  }
  const months=[...new Set(dates.map(d=>d.slice(0,7)))].sort();
  const years=[...new Set(dates.map(d=>Number(d.slice(0,4))))].sort();
  const monthly=months.map(period=>{
    const [year,month]=period.split("-").map(Number);
    return periodSummary(period,daysInMonth(year,month));
  });
  const yearly=years.map(year=>periodSummary(String(year),daysInYear(year)));
  const minDate=dates[0],maxDate=dates[dates.length-1];
  const calendar=dayRange(minDate,maxDate);
  const missingDates=calendar.filter(date=>!datesIndex.has(date));
  return {verification:"unverified-import",dayRows,monthly,yearly,
    observedDates:dates.length,periodStart:minDate,periodEnd:maxDate,
    gapCount:missingDates.length,missingDates,
    message:"Coverage and arithmetic do not authenticate source data or establish actual vessel emissions."};
}
