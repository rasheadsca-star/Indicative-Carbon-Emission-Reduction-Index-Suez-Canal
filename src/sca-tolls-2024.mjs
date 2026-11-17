/**
 * SCA published 2024 base toll schedule (effective 2024-01-15).
 * Pure progressive SCNT band arithmetic. NO 2026 circular adjustments, rebates,
 * surcharges, tier-deck levies, pilotage, tug/escort, service fees or final invoice.
 * NEVER infer SCNT from DWT, GT or SCGT.
 */
export const SCA_TOLLS_SOURCE="https://www.suezcanal.gov.eg/Arabic/Navigation/Tolls/Pages/TollsTable.aspx";
export const TARIFF_EFFECTIVE_FROM="2024-01-15";
export const TOLL_BAND_WIDTHS=Object.freeze([5000,5000,10000,20000,30000,50000,60000,Infinity]);
const rate=(laden,ballast)=>Object.freeze({laden:Object.freeze(laden),ballast:Object.freeze(ballast)});
export const SCA_2024_BASE_RATES=Object.freeze({
  CRUDE_TANKER:rate([11.04,7.82,5.91,2.93,2.53,2.17,2.13,2.13],[9.4,6.64,5.04,2.5,2.14,1.85,1.82,1.82]),
  PRODUCT_TANKER:rate([11.04,7.82,5.91,3.93,3.84,3.46,3.34,3.34],[9.4,6.64,5.04,2.5,2.14,1.85,1.82,1.82]),
  DRY_BULK:rate([10.13,7.74,6.12,2.24,1.97,1.85,1.77,1.77],[8.62,6.58,5.21,1.89,1.68,1.58,1.5,1.5]),
  LPG_TANKER:rate([11.6,8.4,6.22,5.05,4.42,4.13,4.13,4.13],[9.87,7.14,5.29,4.3,3.76,3.51,3.51,3.51]),
  LNG_TANKER:rate([10.42,8.11,7.02,5.43,5.03,4.8,4.67,4.67],[8.87,6.89,5.97,4.61,4.27,4.08,3.97,3.97]),
  CONTAINER:rate([11.04,7.58,5.89,4.13,3.82,3.01,2.94,2.88],[9.4,6.45,5,3.51,3.25,2.56,2.52,2.44]),
  GENERAL_CARGO:rate([10.08,7.78,5.42,4.07,3.94,3.87,3.8,3.8],[8.58,6.62,4.61,3.45,3.36,3.3,3.22,3.22]),
  RORO:rate([10.08,7.5,5.83,4.21,3.94,3.8,3.65,3.65],[8.58,6.37,4.97,3.59,3.36,3.22,3.12,3.12]),
  CAR_CARRIER:rate([11.04,7.58,5.67,4.05,3.82,3.01,2.88,2.88],[9.4,6.45,4.83,3.45,3.25,2.56,2.44,2.44]),
  PASSENGER:rate([9.97,7,5.77,4.08,4.03,3.9,3.76,3.76],[8.48,5.96,4.91,3.48,3.42,3.31,3.19,3.19]),
  OTHER:rate([10.54,7.1,5.97,4.35,4.21,3.94,3.8,3.8],[8.96,6.04,5.08,3.7,3.59,3.36,3.22,3.22])
});
const max=(name,x,minimum,maximum)=>{
  if(typeof x!=="number"||!Number.isFinite(x)||x<minimum||x>maximum)
    throw new RangeError("INVALID_"+name);
  return x;
};
export function computeSCA2024BaseToll({scnt,vesselClass,loadState,usdPerSdr=null}={}){
  // This is a reference calculation, never a payable amount.
  const tonnage=max("SCNT",scnt,1,600000);
  if(!Number.isInteger(tonnage))throw new RangeError("INVALID_SCNT_INTEGER");
  const rates=SCA_2024_BASE_RATES[vesselClass];
  if(!rates)throw new RangeError("UNSUPPORTED_SCA_CLASS");
  if(loadState!=="laden"&&loadState!=="ballast")throw new RangeError("UNKNOWN_LOAD_STATE");
  if(usdPerSdr!==null)max("SDR_USD_FX",usdPerSdr,0.1,10);
  let remaining=tonnage;
  const breakdown=TOLL_BAND_WIDTHS.map((width,i)=>{
    const tonnageInBand=Math.min(remaining,width);
    remaining-=tonnageInBand;
    const rateSDRperSCNT=rates[loadState][i];
    return {band:i+1,upToSCNT:Number.isFinite(width)?width:null,
      scnt:tonnageInBand,rateSDRperSCNT,subtotalSDR:tonnageInBand*rateSDRperSCNT};
  });
  const baseSDR=breakdown.reduce((sum,band)=>sum+band.subtotalSDR,0);
  return {
    status:"SCA_2024_PUBLISHED_BASE_REFERENCE_ONLY",
    officialInvoice:false,notCurrentTariffValidated:true,
    source:SCA_TOLLS_SOURCE,effectiveFrom:TARIFF_EFFECTIVE_FROM,
    scnt:tonnage,vesselClass,loadState,breakdown,
    baseSDR,baseUsd:usdPerSdr===null?null:baseSDR*usdPerSdr,
    usdPerSdr,
    surchargeSDR:null,rebateSDR:null,serviceFeeUSD:null,
    finalPayableUSD:null,
    warning:"2024 base tariff reference: later SCA circulars, surcharges, rebates and actual vessel condition are NOT accounted for. Use current official SCA toll calculator for payable dues."
  };
}
