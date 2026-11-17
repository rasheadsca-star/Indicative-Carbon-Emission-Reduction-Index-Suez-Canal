/**
 * Non-probabilistic, same-vessel scenario sensitivity for CERI-SC.
 * No distribution / confidence interval is implied by these deterministic choices.
 */
import {runVoyage} from "./voyage-physical.mjs";
export const SENSITIVITY_V1="deterministic-speed-and-suez-wait-2026-11-18";
export function runVoyageSensitivity(baseInputs,{
  speedOffsetKnots=[-2,0,2],additionalSuezWaitHours=[0,12,24]
}={}){
  if(!baseInputs||typeof baseInputs!=="object")throw new Error("INPUT_REQUIRED");
  const base=runVoyage(baseInputs);
  if(!Array.isArray(speedOffsetKnots)||!Array.isArray(additionalSuezWaitHours)||
     speedOffsetKnots.length<1||additionalSuezWaitHours.length<1||
     speedOffsetKnots.length>7||additionalSuezWaitHours.length>7)
    throw new RangeError("INVALID_SENSITIVITY_DIMENSIONS");
  const rows=[];
  for(const speedOffsetKn of speedOffsetKnots){
    if(typeof speedOffsetKn!=="number"||!Number.isFinite(speedOffsetKn)||
       speedOffsetKn< -10||speedOffsetKn>10)
      throw new RangeError("INVALID_SPEED_OFFSET");
    for(const waitExtraHours of additionalSuezWaitHours){
      if(typeof waitExtraHours!=="number"||!Number.isFinite(waitExtraHours)||
        waitExtraHours<0||waitExtraHours>240)
        throw new RangeError("INVALID_SUEZ_WAIT_OFFSET");
      const speedKn=base.inputs.speedKn+speedOffsetKn;
      const waitingSuezHours=base.inputs.waitingSuezHours+waitExtraHours;
      try{
        const r=runVoyage({...base.inputs,speedKn,waitingSuezHours});
        const breakEvenTollUsd=r.fuelSavingUsd===null||r.timeSavingUsd===null
          ?null:r.fuelSavingUsd+r.timeSavingUsd;
        rows.push({
          status:"CALCULATED_HYPOTHETICAL",speedKn,
          additionalSuezWaitHours:waitExtraHours,
          actualSuezWaitHours:waitingSuezHours,
          distanceSavedNm:r.distanceSavedNm,
          daysSaved:r.daysSaved,
          fuelSavedTonnes:r.fuelSavedTonnes,
          ttWCO2SavedTonnes:r.ttWCO2SavedTonnes,
          breakEvenTollUsd,
          netSavingUsd:r.netSavingUsd,
          officialTollUsd:null
        });
      }catch(error){
        // Do not hide an impossible MCR/speed combination by extrapolating.
        rows.push({status:"BLOCKED_PHYSICAL_INPUT",speedKn,
          additionalSuezWaitHours:waitExtraHours,
          actualSuezWaitHours:waitingSuezHours,
          reason:String(error.message),daysSaved:null,fuelSavedTonnes:null,
          ttWCO2SavedTonnes:null,breakEvenTollUsd:null,
          netSavingUsd:null,officialTollUsd:null});
      }
    }
  }
  return {
    status:"DETERMINISTIC_SENSITIVITY_NOT_STATISTICAL_UNCERTAINTY",
    modelVersion:SENSITIVITY_V1,
    baseModelVersion:base.modelVersion,
    verified:false,
    inputBasis:{...base.inputs},
    rows,
    explanation:"Speed and extra Suez waiting are changed individually in a 3x3 scenario grid; unchanged fuel prices, engine inputs, weather and Cape waiting. NOT a probability distribution, confidence interval, live weather or official dues."
  };
}
