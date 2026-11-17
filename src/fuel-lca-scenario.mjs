/**
 * Optional WtW scenario — must be supplied with a specific fuel production
 * pathway and engine technology. No generic defaults or certified labels.
 * Method: t fuel * 1000 kg/t * LHV MJ/kg * gCO2e/MJ / 1e6 g/t.
 * Source: IMO 2024 marine fuel LCA guidelines (MEPC.391(81)).
 */
export const IMO_LCA_SOURCE =
  "https://www.imo.org/en/OurWork/Environment/Pages/Lifecycle-GHG---carbon-intensity-guidelines.aspx";
const bounded=(name,x,lo,hi)=>{
  if(typeof x!=="number"||!Number.isFinite(x)||x<lo||x>hi)
    throw new RangeError("INVALID_"+name);
  return x;
};
const needed=(name,x)=>{
  if(typeof x!=="string"||x.trim().length<4)throw new Error("MISSING_"+name);
  return x.trim();
};
export function estimateScenarioWtW(voyage,{
  gCO2ePerMJ,productionPathway,engineTechnology,evidenceReference
}={}){
  if(voyage?.status!=="SCA_OFFICIAL_DISTANCE__ASSUMED_ENGINE_VOYAGE"||
    typeof voyage.fuel?.lhvMJkg!=="number")
    throw new Error("INVALID_VOYAGE_ENERGY_BASIS");
  const ghg=bounded("WTW_FACTOR",gCO2ePerMJ,0,350);
  const pathway=needed("PRODUCTION_PATHWAY",productionPathway);
  const engine=needed("ENGINE_TECHNOLOGY",engineTechnology);
  const source=needed("PATHWAY_REFERENCE",evidenceReference);
  const tonnePerFuelTonne=voyage.fuel.lhvMJkg*ghg/1000;
  const suezWtW=voyage.suez.fuelTonnes*tonnePerFuelTonne;
  const capeWtW=voyage.cape.fuelTonnes*tonnePerFuelTonne;
  return {
    status:"USER_SUPPLIED_WTW_PATHWAY_SCENARIO_UNVERIFIED",
    verified:false,certified:false,
    fuelId:voyage.fuel.id,productionPathway:pathway,
    engineTechnology:engine,evidenceReference:source,
    modelGuidance:IMO_LCA_SOURCE,ghgIntensity_gCO2ePerMJ:ghg,
    ttWCombustionCO2TonnesSuez:voyage.suez.ttWCO2Tonnes,
    ttWCombustionCO2TonnesCape:voyage.cape.ttWCO2Tonnes,
    suezWtW_tCO2e:suezWtW,capeWtW_tCO2e:capeWtW,
    deltaWtW_tCO2e:capeWtW-suezWtW,
    warning:"Life-cycle estimate from user-entered factor; not verified or certified, and not official IMO GFI, EU ETS or FuelEU compliance."
  };
}
