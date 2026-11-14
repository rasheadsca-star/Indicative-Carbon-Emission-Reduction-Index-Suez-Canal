/**
 * SCA official annual historical analytics. This is a traffic series, not
 * per-ship energy, voyage emissions or avoided CO2.
 * Preserve the anomalous 2004 net-ton number as published but exclude it from
 * tonnage ratios and adjacent tonnage trend comparisons until verified.
 */
const hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const frac=(x,y)=>y>0?100*(x/y-1):null;
const rounded=(x,n=2)=>x===null?null:+x.toFixed(n);

export function validateHistoricalSeries(data,threeYearReference){
 if(data?.schema!=="ceri-sc-sca-official-annual-history-v1")throw Error("Invalid historical schema");
 if(!Array.isArray(data.annual)||data.annual.length!==51)throw Error("Expected 51 annual records, 1975–2025");
 if(typeof data.sourceUrl!=="string"||!data.sourceUrl.startsWith("https://www.suezcanal.gov.eg/"))throw Error("Missing official publication");
 let previous=1974;
 for(const r of data.annual){
   if(!Number.isInteger(r.year)||r.year!==previous+1)throw Error("Historical years are missing or duplicated");
   if(!Number.isSafeInteger(r.vessels)||r.vessels<=0||!Number.isSafeInteger(r.netTonnageThousands)||r.netTonnageThousands<=0)
     throw Error("Invalid historical annual measurements");
   previous=r.year;
 }
 if(previous!==2025||data.lastFullYear!==2025||data.partialYears?.length!==1||data.partialYears[0]!==1975)
   throw Error("Historical coverage bounds mismatch");
 if(data.netTonnageQualityFlags?.["2004"]!=="SOURCE_TABLE_ANOMALY_REQUIRES_CORROBORATION")
   throw Error("2004 official report source-quality anomaly must remain flagged");
 if(threeYearReference){
   if(threeYearReference.schema!=="ceri-sc-official-sca-summary-v1")throw Error("Incorrect reconciliation series");
   for(const year of [2023,2024,2025]){
     const row=data.annual.find(x=>x.year===year),other=threeYearReference.annual[String(year)];
     if(!other||row.vessels!==other.vessels||row.netTonnageThousands!==other.netTonnageThousands)
       throw Error("Historical annual mismatch with detailed monthly series in "+year);
     const monthly=threeYearReference.monthly[String(year)];
     if(!Array.isArray(monthly)||monthly.length!==12||
        monthly.reduce((n,x)=>n+x[0],0)!==row.vessels||
        monthly.reduce((n,x)=>n+x[1],0)!==row.netTonnageThousands)
       throw Error("Historical monthly reconciliation failed for "+year);
   }
 }
 return true;
}

export function buildHistoricalPerformance(data,reference){
 validateHistoricalSeries(data,reference);
 const invalidTonYears=new Set(Object.keys(data.netTonnageQualityFlags||{}).map(Number));
 const partialYears=new Set(data.partialYears);
 const rows=data.annual.map((r,i)=>{
   const p=data.annual[i-1];
   const tonValid=!invalidTonYears.has(r.year);
   const prevTonValid=p&&!invalidTonYears.has(p.year);
   const comparable=p&&!partialYears.has(p.year)&&!partialYears.has(r.year);
   const vesselsChange=comparable?frac(r.vessels,p.vessels):null;
   const netTonChange=comparable&&tonValid&&prevTonValid?frac(r.netTonnageThousands,p.netTonnageThousands):null;
   return {
     year:r.year,vessels:r.vessels,netTonnageThousands:r.netTonnageThousands,
     netTonnageMillions:rounded(r.netTonnageThousands/1000,3),
     netTonnesPerVessel:tonValid?rounded(r.netTonnageThousands*1000/r.vessels,0):null,
     vesselsYoYPct:rounded(vesselsChange),
     tonnageYoYPct:rounded(netTonChange),
     classification:partialYears.has(r.year)?"PARTIAL_YEAR":
       !tonValid?"REPORTED_TONNAGE_ANOMALY":"OFFICIAL_ANNUAL",
     netTonnageUsable:tonValid
   };
 });
 const byYear=new Map(rows.map(x=>[x.year,x]));
 const maxShip=rows.filter(x=>x.classification!=="PARTIAL_YEAR").reduce((a,b)=>!a||b.vessels>a.vessels?b:a,null);
 const worstShipChange=rows.filter(x=>x.vesselsYoYPct!==null).reduce((a,b)=>!a||b.vesselsYoYPct<a.vesselsYoYPct?b:a,null);
 const bestShipChange=rows.filter(x=>x.vesselsYoYPct!==null).reduce((a,b)=>!a||b.vesselsYoYPct>a.vesselsYoYPct?b:a,null);
 const current=byYear.get(2025),peak=byYear.get(2023),prior=byYear.get(2024);
 const recoveryGapPct=rounded(100*(1-current.vessels/peak.vessels));
 const baseline=(begin,end,metric)=>{
   const selected=rows.filter(r=>r.year>=begin&&r.year<=end&&r.classification!=="PARTIAL_YEAR"&&
      (metric!=="netTonnageThousands"||r.netTonnageUsable));
   return selected.length?rounded(selected.reduce((sum,r)=>sum+r[metric],0)/selected.length,2):null;
 };
 return {
   schema:"ceri-sc-historical-performance-analysis-v1",
   sourceUrl:data.sourceUrl,coverage:{from:1975,to:2025,fullYears:50,partialYears:[1975]},
   latest:current,peakShipYear:{year:maxShip.year,vessels:maxShip.vessels},
   largestVesselYoYFall:{year:worstShipChange.year,pct:worstShipChange.vesselsYoYPct},
   largestVesselYoYRise:{year:bestShipChange.year,pct:bestShipChange.vesselsYoYPct},
   comparedTo2023:{vesselsChangePct:rounded(frac(current.vessels,peak.vessels)),
     netTonnageChangePct:rounded(frac(current.netTonnageThousands,peak.netTonnageThousands)),
     recoveryGapTo2023VesselsPct:recoveryGapPct},
   comparedTo2024:{vesselsChangePct:current.vesselsYoYPct,netTonnageChangePct:current.tonnageYoYPct},
   baseline2018to2022:{averageVessels:baseline(2018,2022,"vessels"),
     averageNetTonnageThousands:baseline(2018,2022,"netTonnageThousands")},
   annual:rows,verifiedAvoidedCO2Tonnes:null,
   warnings:[
     "Annual published ship counts and net tonnage do not provide ship-specific voyage fuel/emissions or a verified avoided CO2 counterfactual.",
     "1975 is a partial year (210 normal transit days), excluded from full-year growth and ranking.",
     "2004 published net tonnage appears anomalous. It is preserved but net tons/ship and adjacent tonnage trends are suppressed until cross-source verification.",
     "No daily/monthly time series before 2023 has been authenticated in this data file. Official historical causes/regime labels require independent evidence."
   ]
 };
}

/**
 * Strict walk-forward, no-lookahead benchmark for historical ANNUAL vessel
 * counts. This backtests a time-series predictor, not the route-CO2 model.
 * Shock years are retained; do not drop disappointing errors.
 */
export function backtestHistoricalTraffic(data,{from=1980,to=2025}={}){
 validateHistoricalSeries(data);
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1979||to>2025||from>to)
   throw Error("Invalid walk-forward test interval");
 const row=new Map(data.annual.map(r=>[r.year,r]));
 const runs=[];
 for(let y=from;y<=to;y++){
   const actual=row.get(y).vessels;
   const prior=row.get(y-1).vessels;
   const window=[row.get(y-3).vessels,row.get(y-2).vessels,prior];
   const forecasts={lastYear:prior,movingAverage3:window.reduce((a,b)=>a+b,0)/3};
   runs.push({year:y,actual,forecasts,errors:{
     lastYear:actual-forecasts.lastYear,movingAverage3:actual-forecasts.movingAverage3
   }});
 }
 const stats=k=>{
   const errorAbs=runs.map(r=>Math.abs(r.errors[k])),pctErr=runs.map(r=>100*Math.abs(r.errors[k])/r.actual);
   return {mae:rounded(errorAbs.reduce((s,x)=>s+x,0)/runs.length,2),
     mapePct:rounded(pctErr.reduce((s,x)=>s+x,0)/runs.length,2),
     evaluatedYears:runs.length};
 };
 return {method:"walk-forward; year y forecast uses y−1 (naive) or mean(y−1,y−2,y−3), no future leakage",
   purpose:"Traffic trend benchmark only. Not model validation for marine fuel, routes or CO2.",
   periods:{from,to},lastYear:stats("lastYear"),movingAverage3:stats("movingAverage3"),runs,
   state:"HISTORICAL_TRAFFIC_FORECAST_BACKTEST_NOT_EMISSIONS"};
}
