/**
 * CERI-SC — evidence-bounded voyage model (independent of IMO's annual Fleet & CO2 Calculator).
 * SCA published port-pair distances; engine inputs are user-provided hypothetical particulars.
 * This is NOT a navigation route, ship performance certificate, verified MRV or a toll quotation.
 */
export const SCA_DISTANCE_SOURCE =
  "https://www.suezcanal.gov.eg/English/About/Pages/WhySuezCanal.aspx";
export const IMO_CO2_SOURCE =
  "https://wwwcdn.imo.org/localresources/en/OurWork/Environment/Documents/Air%20pollution/MEPC.346%2878%29.pdf";
export const LHV_SOURCE =
  "https://wwwcdn.imo.org/localresources/en/OurWork/Environment/Documents/Air%20pollution/Roadmap%20to%20Zero%20Emission%20from%20International%20Shipping%20-%20Japan%20March%202020.pdf";

export const OFFICIAL_ROUTES = Object.freeze({
  "Singapore|Rotterdam": { suezNm:8288, capeNm:11755 },
  "Tokyo|Rotterdam": { suezNm:11192, capeNm:14507 },
  "Ras Tanura|Rotterdam": { suezNm:6436, capeNm:11169 },
  "Jeddah|Rotterdam": { suezNm:3997, capeNm:10797 },
  "Jeddah|Piraeus": { suezNm:1316, capeNm:11207 }
});

// C_F = physical combustion CO2, NOT WtW CO2e. Approximate LHV for energy
// equivalence is deliberately separate from combustion carbon factors.
export const FUELS = Object.freeze({
  HFO: { name:"HFO", lhvMJkg:40.4, physicalCO2:3.114, note:"HFO benchmark" },
  VLSFO: { name:"VLSFO (HFO proxy)", lhvMJkg:40.4, physicalCO2:3.114,
    note:"Proxy only: blend-specific LHV and carbon factor require bunker delivery analysis" },
  MGO: { name:"MGO", lhvMJkg:42.7, physicalCO2:3.206,
    note:"LHV illustrative; verify fuel properties" },
  LNG: { name:"LNG", lhvMJkg:48.0, physicalCO2:2.750,
    note:"CO2 only; methane slip, pilot fuel and engine efficiency are NOT modelled" },
  METHANOL: { name:"Fossil methanol", lhvMJkg:19.9, physicalCO2:1.375,
    note:"No pilot fuel or dual-fuel engine penalties; hypothetical equivalent energy" },
  EMETHANOL: { name:"e-Methanol", lhvMJkg:19.9, physicalCO2:1.375,
    note:"Physical CO2 is NOT zero; WtW depends on certified production and carbon source" },
  B100: { name:"B100 illustrative FAME", lhvMJkg:27.0, physicalCO2:2.816,
    note:"Example from IMO-hosted Japan roadmap, not a universal biodiesel specification" },
  B20: { name:"B20 20% mass FAME + 80% HFO proxy", lhvMJkg:37.72,
    physicalCO2:0.2*2.816+0.8*3.114,
    note:"Mass-blend example only; blend energy/content and eligibility require fuel evidence" },
  EAMMONIA: { name:"e-Ammonia", lhvMJkg:20.5, physicalCO2:0,
    note:"CO2 combustion only is zero; N2O, pilot fuel, process WtW and engine design are unmodelled" },
  EHYDROGEN: { name:"e-Hydrogen", lhvMJkg:120, physicalCO2:0,
    note:"CO2 combustion only is zero; N2O where applicable, WtW and machinery efficiency are unmodelled" }
});

const requireRange=(name,value,min,max,allowZero=false)=>{
  if(typeof value!=="number" || !Number.isFinite(value) ||
     (allowZero?value<min:value<=min) || value>max)
    throw new RangeError(name+" must be finite and within its documented operating bounds");
  return value;
};
const optionalMoney=(name,v)=>{
  if(v==null||v==="")return null;
  return requireRange(name,v,0,1e9,true);
};

export function validIMO(imo) {
  const s=String(imo||"").replace(/^IMO\s*/i,"");
  if(!/^\d{7}$/.test(s))return false;
  const check=[7,6,5,4,3,2].reduce((sum,k,i)=>sum+Number(s[i])*k,0)%10;
  return check===Number(s[6]);
}

export function runVoyage(input) {
  if(!input||typeof input!=="object")throw Error("Required scenario object");
  const pair=String(input.origin||"")+"|"+String(input.destination||"");
  const route=OFFICIAL_ROUTES[pair];
  if(!route)throw Error("NO_VERIFIED_SCA_PORT_PAIR: do not invent distances");
  const fuel=FUELS[input.fuelId];
  if(!fuel)throw Error("UNKNOWN_FUEL: no authenticated fuel profile");
  const v=requireRange("speedKn",input.speedKn,0,35);
  const referenceSpeed=requireRange("referenceSpeedKn",input.referenceSpeedKn,0,35);
  const referencePower=requireRange("referenceMainPowerKw",input.referenceMainPowerKw,0,150000);
  const auxPower=requireRange("auxiliaryPowerKw",input.auxiliaryPowerKw,0,15000,true);
  const mainSFOC=requireRange("mainSFOCgKwh",input.mainSFOCgKwh,0,500);
  const auxiliarySFOC=requireRange("auxiliarySFOCgKwh",input.auxiliarySFOCgKwh,0,500);
  const canalDistance=requireRange("canalDistanceNm",input.canalDistanceNm,0,200,true);
  const canalHours=requireRange("canalTransitHours",input.canalTransitHours,0,200);
  const waitingS=requireRange("waitingSuezHours",input.waitingSuezHours,0,500,true);
  const waitingC=requireRange("waitingCapeHours",input.waitingCapeHours,0,500,true);
  const price=optionalMoney("fuelPriceUsdPerTonne",input.fuelPriceUsdPerTonne);
  const toll=optionalMoney("userEnteredTollUsd",input.userEnteredTollUsd);
  const dailyOpex=optionalMoney("dailyOperatingCostUsd",input.dailyOperatingCostUsd);
  if(canalDistance===0)throw Error("Canal segment must have distance");
  if(canalDistance>=route.suezNm)throw Error("Canal distance cannot exceed Suez route");
  if(canalDistance/canalHours>18)throw Error("Canal segment speed is implausible");
  // Mandatory explicit reference fuel basis; SFOC here is calibrated to HFO
  // and alternative-fuel mass is adjusted by energy content at equal assumed efficiency.
  const refLhv=FUELS.HFO.lhvMJkg;
  const energyMassFactor=refLhv/fuel.lhvMJkg;
  const weatherMultiplier=requireRange("weatherMultiplier",input.weatherMultiplier,0,2);
  const mainPowerAtSpeed=s=>referencePower*Math.pow(s/referenceSpeed,3)*weatherMultiplier;
  const combustion=(mainKw,auxKw,hours)=>
    (mainKw*mainSFOC+auxKw*auxiliarySFOC)*hours/1e6*energyMassFactor;
  const canalSpeed=canalDistance/canalHours;
  const openSuezHours=(route.suezNm-canalDistance)/v;
  const capeSeaHours=route.capeNm/v;
  const canalFuel=combustion(mainPowerAtSpeed(canalSpeed),auxPower,canalHours);
  const suezSeaFuel=combustion(mainPowerAtSpeed(v),auxPower,openSuezHours);
  const capeSeaFuel=combustion(mainPowerAtSpeed(v),auxPower,capeSeaHours);
  const standbyS=combustion(0,auxPower,waitingS);
  const standbyC=combustion(0,auxPower,waitingC);
  const suezFuel=suezSeaFuel+canalFuel+standbyS;
  const capeFuel=capeSeaFuel+standbyC;
  const suezHours=openSuezHours+canalHours+waitingS;
  const capeHours=capeSeaHours+waitingC;
  const su={distanceNm:route.suezNm,seaHours:openSuezHours,canalHours,
    waitingHours:waitingS,totalHours:suezHours,fuelTonnes:suezFuel,
    ttWCO2Tonnes:suezFuel*fuel.physicalCO2};
  const ca={distanceNm:route.capeNm,seaHours:capeSeaHours,canalHours:0,
    waitingHours:waitingC,totalHours:capeHours,fuelTonnes:capeFuel,
    ttWCO2Tonnes:capeFuel*fuel.physicalCO2};
  const fuelSavings=ca.fuelTonnes-su.fuelTonnes;
  const hoursSaved=ca.totalHours-su.totalHours;
  const fuelSavingUsd=price===null?null:fuelSavings*price;
  const timeSavingUsd=dailyOpex===null?null:hoursSaved/24*dailyOpex;
  // Canal toll must be user-entered or derived in a separate authoritative engine.
  const netSavingUsd=price!==null&&toll!==null&&dailyOpex!==null
    ?fuelSavingUsd+timeSavingUsd-toll:null;
  return {
    status:"SCA_OFFICIAL_DISTANCE__ASSUMED_ENGINE_VOYAGE",
    verifiedVoyage:false,
    source:SCA_DISTANCE_SOURCE,inputs:{...input},
    fuel:{...fuel,id:input.fuelId},
    suez:su,cape:ca,
    distanceSavedNm:route.capeNm-route.suezNm,
    hoursSaved,daysSaved:hoursSaved/24,fuelSavedTonnes:fuelSavings,
    ttWCO2SavedTonnes:ca.ttWCO2Tonnes-su.ttWCO2Tonnes,
    wtWCO2eSavedTonnes:null,euEtsCostUsd:null,fuelEUCostUsd:null,imoGfiCostUsd:null,
    officialTollUsd:null,tollEstimateUsd:null,userEnteredTollUsd:toll,
    fuelSavingUsd,timeSavingUsd,netSavingUsd,
    assumptions:[
      "Equal reference propulsion efficiency across fuels (NOT verified engine compatibility)",
      "Main-engine cube-law power vs speed; user weather resistance multiplier applies equally to both routes, not forecast, no current or hull fouling",
      "HFO-referenced SFOC and constant auxiliary loads; canal main-engine power idealised",
      "Canal distance, transit and waiting hours are user assumptions; port-pair distances SCA official",
      "Physical TTW CO2 only; CH4, N2O, upstream WtW and compliance costs NOT calculated"
    ]
  };
}
