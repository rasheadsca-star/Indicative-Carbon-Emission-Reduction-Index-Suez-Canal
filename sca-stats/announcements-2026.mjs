/**
 * Derived indicators from official SCA published announcements.
 * Never relabel rounded amounts as precise measurements or emissions.
 */
export function analyzeAnnouncements(data){
  if(data?.schema!=="ceri-sc-sca-2026-announcements-v1")throw Error("Incorrect source schema");
  const m=data.monthlyComparison,c=data.containerRecovery,d=data.singleDay;
  // DEF-004: accept any published month YYYY-MM compared with the SAME month of the previous year
  // (was hard-wired to 2026-10, so the next SCA monthly release could not be ingested without code edits).
  const pm=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(m?.period||"");
  if(!m||!pm||m.baseline!==`${+pm[1]-1}-${pm[2]}`||!c||!d)throw Error("Unexpected reporting periods");
  if(!/^\d{4}-\d\d-\d\d$/.test(m.publicationDate||"")||m.publicationDate<m.period+"-01")throw Error("Publication date must not precede the reported month");
  for(const x of [m,c,d])if(typeof x.sourceUrl!=="string"||!x.sourceUrl.startsWith("https://www.suezcanal.gov.eg/"))throw Error("Missing official source URL");
  const positive=(n)=>Number.isFinite(n)&&n>0;
  for(const group of [m.current,m.baselineValues,c.current,c.baselineValues]){
    if(!Object.values(group).every(positive))throw Error("Invalid value in official announcement");
    if(!Number.isSafeInteger(group.vessels))throw Error("Invalid ship count");
  }
  if(!Number.isSafeInteger(d.vessels)||!positive(d.netTonnageMillionRounded))throw Error("Invalid single-day announcement");
  const comparison=(now,prev)=>({
    now,prev,absolute:now-prev,derivedPct:100*(now/prev-1)
  });
  return {
    period:m.period,baseline:m.baseline,publicationDate:m.publicationDate,sourceUrl:m.sourceUrl,
    vessels:comparison(m.current.vessels,m.baselineValues.vessels),
    netTonnage:comparison(m.current.netTonnageMillionRounded,m.baselineValues.netTonnageMillionRounded),
    revenue:comparison(m.current.revenueMillionUsd,m.baselineValues.revenueMillionUsd),
    // All of the following are indicative quotients from published ROUNDED aggregates.
    netTonnagePerVesselApprox:{
      now:m.current.netTonnageMillionRounded*1e6/m.current.vessels,
      prev:m.baselineValues.netTonnageMillionRounded*1e6/m.baselineValues.vessels
    },
    revenuePerVesselUsdApprox:{
      now:m.current.revenueMillionUsd*1e6/m.current.vessels,
      prev:m.baselineValues.revenueMillionUsd*1e6/m.baselineValues.vessels
    },
    reportedPct:m.authorityReportedChangePct,
    container:{period:c.period,baseline:c.baseline,now:c.current.vessels,
      prev:c.baselineValues.vessels,multiple:c.current.vessels/c.baselineValues.vessels,
      sourceUrl:c.sourceUrl,publicationDate:c.publicationDate,
      classification:c.group},
    singleDay:{date:d.date,vessels:d.vessels,tonnageMillionRounded:d.netTonnageMillionRounded,
      sourceUrl:d.sourceUrl,publicationDate:d.publicationDate},
    status:"official-announced-aggregates-derived-ratios",
    notAvailable:["2026 annual total","2026 daily complete series","2026 weekly series","verified avoided CO2"],
    limitations:data.dataLimitations
  };
}
