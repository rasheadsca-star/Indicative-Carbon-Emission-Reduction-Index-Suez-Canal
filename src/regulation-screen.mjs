/**
 * Regulatory scope SCREEN (not a compliance calculator).
 * As-of: 2026-11-17. EU ETS excludes special exemptions; voyages require
 * verified preceding/next port calls, vessel type, GT and MRV data.
 */
export const EU_ETS_SOURCE="https://climate.ec.europa.eu/areas-action/transport-decarbonisation/reducing-emissions-shipping-sector_en";
export const FUELEU_SOURCE="https://transport.ec.europa.eu/transport-modes/maritime/decarbonising-maritime-transport-fueleu-maritime_en";
export const IMO_POLICY_SOURCE="https://www.imo.org/en/mediacentre/hottopics/pages/faqs-the-imo-net-zero-framework.aspx";
export const POLICY_AS_OF="2026-11-17";
const euPorts=new Set(["Rotterdam","Piraeus"]);
const nonEuPorts=new Set(["Singapore","Tokyo","Ras Tanura","Jeddah"]);
const rate={2024:0.4,2025:0.7,2026:1};
function sensible(name,x,min,max){
  if(typeof x!=="number"||!Number.isFinite(x)||x<min||x>max)
    throw new RangeError("INVALID_"+name);
  return x;
}
export function screenEUETS(voyage,{
  grossTonnage,shipService,reportingYear=2026,
  directPortCallsConfirmed=false,allowancePriceEur=null
}={}){
  if(voyage?.status!=="SCA_OFFICIAL_DISTANCE__ASSUMED_ENGINE_VOYAGE")
    throw new Error("VOYAGE_REQUIRED");
  if(!Number.isInteger(reportingYear)||reportingYear<2024||reportingYear>2026)
    throw new RangeError("OUT_OF_REVIEW_PERIOD");
  const gt=grossTonnage===null||grossTonnage===undefined?null:
    sensible("GT",grossTonnage,0,1000000);
  if(!["cargo","passenger","unknown"].includes(shipService))
    throw new Error("SHIP_SERVICE_REQUIRED");
  if(typeof directPortCallsConfirmed!=="boolean")throw new TypeError("DIRECT_PORT_CALLS_BOOL_REQUIRED");
  if(allowancePriceEur!==null)sensible("EUA_PRICE",allowancePriceEur,0,2000);
  const origin=voyage.inputs?.origin,dest=voyage.inputs?.destination;
  const via=euPorts.has(origin)&&euPorts.has(dest)?1:
    (euPorts.has(origin)&&nonEuPorts.has(dest))||
    (euPorts.has(dest)&&nonEuPorts.has(origin)) ? 0.5 : null;
  const eligible=gt!==null&&gt>=5000&&shipService!=="unknown";
  const potentiallyCovered=eligible&&via!==null&&directPortCallsConfirmed;
  const phasedFraction=rate[reportingYear];
  const co2OnlySavingsTonnes=potentiallyCovered
    ?voyage.ttWCO2SavedTonnes*via*phasedFraction:null;
  return {
    status:potentiallyCovered?"POTENTIAL_EU_ETS_SCOPE_CO2_ONLY":
      "EU_ETS_SCOPE_NOT_ESTABLISHED",
    verifiedCompliance:false,
    source:EU_ETS_SOURCE,asOf:POLICY_AS_OF,
    grossTonnage:gt,shipService,reportingYear,
    directPortCallsConfirmed,
    voyageLegCoverageFraction:potentiallyCovered?via:null,
    surrenderFractionOfReportingYear:phasedFraction,
    includesCH4N2O:reportingYear>=2026,
    co2OnlyCoveredDelta_t:co2OnlySavingsTonnes,
    co2OnlyIllustrativeCostSaved_EUR:co2OnlySavingsTonnes!==null&&allowancePriceEur!==null
      ?co2OnlySavingsTonnes*allowancePriceEur:null,
    fullEtsCostSaved_EUR:null,
    fuelEU:{status:reportingYear>=2025&&potentiallyCovered
      ?"POTENTIAL_SCOPE_NO_PENALTY_CALCULATION":"SCOPE_NOT_ESTABLISHED",
      source:FUELEU_SOURCE,usesWtW:true,penaltyEUR:null},
    imoNetZero:{status:"DRAFT_NOT_ADOPTED_AS_OF_2026_11_17",
      source:IMO_POLICY_SOURCE,mandatoryCostEUR:null},
    warning:"Regulatory scope check only; actual port calls, exemptions, vessel class, EU ETS verified CH4/N2O (2026), EUA allowances and FuelEU compliance balances are NOT established."
  };
}
