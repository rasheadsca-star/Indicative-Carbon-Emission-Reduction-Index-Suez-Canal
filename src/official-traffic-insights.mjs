import {validatePublishedSeries} from "../sca-stats/official-stats.mjs";
import {analyzeAnnouncements} from "../sca-stats/announcements-2026.mjs";
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
/**
 * Published SCA traffic data only. Cross-annual and monthly changes are
 * arithmetical comparisons, never estimates of transit counts or emissions.
 */
export function buildTrafficInsights(historical,announcements){
  validatePublishedSeries(historical);
  const a=analyzeAnnouncements(announcements);
  const y24=historical.annual["2024"], y25=historical.annual["2025"];
  // DEF-004: month is derived from the announcement, not hard-wired to October.
  const [py,pmo]=a.period.split("-").map(Number),idx=pmo-1,monthName=MONTHS[idx];
  const mPrev=historical.monthly[String(py-1)]?.[idx],mPrev2=historical.monthly[String(py-2)]?.[idx];
  // The announcement's own baseline must equal the published annual-report monthly figure when that year is held.
  if(Array.isArray(mPrev)&&mPrev[0]!==a.vessels.prev)throw Error(`Official ${monthName} ${py-1} baseline conflict`);
  if(!Array.isArray(mPrev2)||!Number.isSafeInteger(mPrev2[0]))throw Error(`Missing ${monthName} ${py-2} reference`);
  const m24=mPrev2,m25=mPrev??[a.vessels.prev];
  const percent=(next,prev)=>100*(next/prev-1);
  const perVessel=(entry)=>entry.netTonnageThousands*1000/entry.vessels;
  const last=(prev,current)=>({previous:prev,current,absolute:current-prev,changePct:percent(current,prev)});
  const annual={
    year:2025,comparison:2024,
    vessels:last(y24.vessels,y25.vessels),
    netTonnes:last(y24.netTonnageThousands*1000,y25.netTonnageThousands*1000),
    netTonnesPerVessel:last(perVessel(y24),perVessel(y25)),
    sourceUrl:historical.sourceUrl,status:"official-published-derived-indicators"
  };
  const october={
    month:monthName,period:a.period,comparison:a.baseline,
    vessels:a.vessels,
    comparedTo2024:{base:m24[0],baseYear:py-2,current:a.vessels.now,changePct:percent(a.vessels.now,m24[0])},
    netTonnesPerVesselApprox:a.netTonnagePerVesselApprox,
    revenuePerVesselUsdApprox:a.revenuePerVesselUsdApprox,
    sourceUrl:a.sourceUrl,publicationDate:a.publicationDate,
    status:"announced-2026-aggregate-with-rounded-values"
  };
  return {
    // `october` is a legacy key kept for existing UIs; `latestMonth` is the same object for any announced month.
    annual,october,latestMonth:october,
    signal:october.vessels.now>m25[0]&&october.vessels.now>m24[0]
      ?`${monthName.toUpperCase()}_VESSEL_COUNT_ABOVE_${py-2}_AND_${py-1}`:"NO_UNAMBIGUOUS_RECOVERY_SIGNAL",
    noAnnual2026:true,verifiedVoyageSavings:null,
    interpretation:"Annual net tons per transit changed with fleet/cargo mix; it is NOT DWT, GT or a proven causal measure. "+`${monthName} ${py} results are monthly only, not full-year performance.`
  };
}
