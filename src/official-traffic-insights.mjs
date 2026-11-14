import {validatePublishedSeries} from "../sca-stats/official-stats.mjs";
import {analyzeAnnouncements} from "../sca-stats/announcements-2026.mjs";
/**
 * Published SCA traffic data only. Cross-annual and monthly changes are
 * arithmetical comparisons, never estimates of transit counts or emissions.
 */
export function buildTrafficInsights(historical,announcements){
  validatePublishedSeries(historical);
  const a=analyzeAnnouncements(announcements);
  const y24=historical.annual["2024"], y25=historical.annual["2025"];
  const m24=historical.monthly["2024"][9],m25=historical.monthly["2025"][9];
  if(m25[0]!==a.vessels.prev)throw Error("Official October 2025 baseline conflict");
  if(!Array.isArray(m24)||m24[0]!==1136)throw Error("Unexpected October 2024 reference");
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
    month:"October",period:"2026-10",comparison:"2025-10",
    vessels:a.vessels,
    comparedTo2024:{base:m24[0],current:a.vessels.now,changePct:percent(a.vessels.now,m24[0])},
    netTonnesPerVesselApprox:a.netTonnagePerVesselApprox,
    revenuePerVesselUsdApprox:a.revenuePerVesselUsdApprox,
    sourceUrl:a.sourceUrl,publicationDate:a.publicationDate,
    status:"announced-2026-aggregate-with-rounded-values"
  };
  return {
    annual,october,
    signal:october.vessels.now>m25[0]&&october.vessels.now>m24[0]
      ?"OCTOBER_VESSEL_COUNT_ABOVE_2024_AND_2025":"NO_UNAMBIGUOUS_RECOVERY_SIGNAL",
    noAnnual2026:true,verifiedVoyageSavings:null,
    interpretation:"Annual net tons per transit changed with fleet/cargo mix; it is NOT DWT, GT or a proven causal measure. October 2026 results are monthly only, not full-year performance."
  };
}
