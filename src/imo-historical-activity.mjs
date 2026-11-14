/**
 * CERI-SC IMO fleet activity calculator.
 *
 * Reproduces original IMO sheet logic:
 * F = E * D, G = C * F, H = G * 3.114;
 * E = reference annual fuel per 2012 ship, D = annual time fraction, C =
 * equivalent ship activity count.
 *
 * SCA official annual passages are events, not distinct vessels. Converting
 * per-passage hours to equivalent vessel-years (passages*hours/8760) is an
 * explicit illustrative assumption. THIS IS NOT ACTUAL TRANSIT FUEL NOR
 * MEASURED OR AVOIDED CO2.
 */
export const HFO_EF=3.114;
export const HOURS_PER_YEAR=8760; // 365 days, reference annual activity convention
export const SCA_GROUP_MAP=Object.freeze({
  "Tankers":["Oil tanker","Chemical tanker","Other liquids tankers"],
  "LNG Ships":["Liquefied gas tanker"],
  "Bulk Carr.":["Bulk carrier"],
  "General Cargo":["General cargo"],
  "Container Ships":["Container"],
  "Ro/Ro":["Ro-Ro"],
  "Car Carr.":["Vehicle"],
  "Passenger Ships":["Cruise","Ferry-pax only","Ferry-RoPax"],
  "Other":[]
});
const bad=x=>!Number.isFinite(x)||x<0;
const pct=n=>+(100*n).toFixed(3);
const key=(a,b)=>a+"|"+b;
export function validateIMOReference(imo) {
 if(imo?.schema!=="ceri-sc-imo-fleet-2012-reference-v1"||
    imo.referenceYear!==2012||imo.co2FactorHFO_tCO2_per_tFuel!==HFO_EF||
    !Array.isArray(imo.records)||imo.records.length!==53)throw Error("IMO 2012 catalogue incomplete");
 const seen=new Set();
 for(const r of imo.records){
   if(typeof r.shipType!=="string"||!r.shipType||typeof r.sizeCategory!=="string"||!r.sizeCategory||
      bad(r.referenceAnnualFuelPerShip_t)||r.referenceAnnualFuelPerShip_t===0||r.basisYear!==2012)
     throw Error("Invalid IMO reference coefficient");
   if(seen.has(key(r.shipType,r.sizeCategory)))throw Error("Duplicated IMO ship type/category");
   seen.add(key(r.shipType,r.sizeCategory));
 }
 const sample=imo.records.find(r=>r.shipType==="Container"&&r.sizeCategory==="8000-11999");
 if(!sample||Math.abs(sample.referenceAnnualFuelPerShip_t-29568.788717939)>1e-6)
   throw Error("Original IMO Excel reference coefficient mismatch");
 return true;
}
export function validateSCATypes(data,annual) {
 if(data?.schema!=="ceri-sc-sca-official-type-breakdown-v1"||!Array.isArray(data.types)||data.types.length!==9||
    !data.years||!annual?.annual)throw Error("SCA ship type source incomplete");
 for(const year of ["2023","2024","2025"]){
   const y=data.years[year],total=annual.annual[year];
   if(!y||!total||!y.sourceUrl?.startsWith("https://www.suezcanal.gov.eg/"))
     throw Error("Missing SCA annual type source");
   const keys=Object.keys(y.groups);
   if(keys.length!==data.types.length||keys.some(k=>!data.types.includes(k)))throw Error("SCA group enumeration mismatch");
   const sums=data.types.reduce((s,k)=>{
     const item=y.groups[k];
     if(!Number.isSafeInteger(item?.passages)||item.passages<0||
        !Number.isSafeInteger(item.netTonnageThousands)||item.netTonnageThousands<0)
       throw Error("Invalid SCA type measurement");
     s.passages+=item.passages;s.net+=item.netTonnageThousands;return s
   },{passages:0,net:0});
   if(y.shipCount!==sums.passages||y.netTonnageThousands!==sums.net||
      total.vessels!==sums.passages||total.netTonnageThousands!==sums.net)
     throw Error("SCA annual type totals not reconciled for "+year);
 }
 return true;
}
export function computeIMOActivityScenario({year,assignments,imo,sca,annual}){
 validateIMOReference(imo);validateSCATypes(sca,annual);
 if(!["2023","2024","2025"].includes(String(year)))throw Error("Historical IMO scenario limited to 2023–2025 type breakdown");
 if(!Array.isArray(assignments))throw Error("Expected explicit per-group size/type activity assumptions");
 const map=new Map(imo.records.map(r=>[key(r.shipType,r.sizeCategory),r]));
 const groupCounts=sca.years[String(year)].groups;
 const shares=new Map(),seen=new Set(),rows=[],rejected=[];
 for(const [idx,entry] of assignments.entries()){
   const scaType=entry?.scaType;
   if(!Object.hasOwn(groupCounts,scaType)){rejected.push({row:idx+1,reason:"UNKNOWN_SCA_GROUP"});continue}
   const signature=[scaType,entry.imoShipType,entry.sizeCategory].join("|");
   if(seen.has(signature)){rejected.push({row:idx+1,reason:"DUPLICATE_CLASS_ASSIGNMENT"});continue}
   const klass=map.get(key(entry.imoShipType,entry.sizeCategory));
   if(!klass){rejected.push({row:idx+1,reason:"UNKNOWN_IMO_TYPE_SIZE"});continue}
   const mapped=SCA_GROUP_MAP[scaType];
   if(mapped?.length&&!mapped.includes(entry.imoShipType)){
     rejected.push({row:idx+1,reason:"SHIP_TYPE_MAPPING_NOT_SUPPORTED"});continue
   }
   // 'Other' cannot receive a made-up blanket fleet mixture; user must
   // provide a documented ship-type breakdown before including it.
   if(!mapped?.length){
     rejected.push({row:idx+1,reason:"UNMAPPED_OTHER_GROUP_REQUIRES_SUBTYPE_BREAKDOWN"});continue
   }
   const fraction=entry.shareOfSCAPassages;
   const hours=entry.hoursPerPassage;
   if(typeof fraction!=="number"||!Number.isFinite(fraction)||fraction<=0||fraction>1||
      typeof hours!=="number"||!Number.isFinite(hours)||hours<=0||hours>240){
     rejected.push({row:idx+1,reason:"INVALID_SHARE_OR_HOURS"});continue
   }
   if(typeof entry.assumptionSource!=="string"||!entry.assumptionSource.trim()){
     rejected.push({row:idx+1,reason:"MISSING_ASSUMPTION_SOURCE"});continue
   }
   const next=(shares.get(scaType)||0)+fraction;
   if(next>1+1e-9){rejected.push({row:idx+1,reason:"SHARES_EXCEED_100_PERCENT"});continue}
   shares.set(scaType,next);
   seen.add(signature);
   // Fraction of ship-years equivalent to this passage activity.
   const passageCount=groupCounts[scaType].passages*fraction;
   const annualTimeFraction=hours/HOURS_PER_YEAR;
   const fuel=passageCount*klass.referenceAnnualFuelPerShip_t*annualTimeFraction;
   rows.push({
     scaType,imoShipType:entry.imoShipType,sizeCategory:entry.sizeCategory,
     officialPassagesInGroup:groupCounts[scaType].passages,
     assumedSharePct:pct(fraction),assumedHoursPerPassage:hours,
     equivalentPassages:passageCount,annualTimeFraction,
     imoAnnualFuelPerShip_t:klass.referenceAnnualFuelPerShip_t,
     modelledFuel_t:fuel,modelledCO2_t:fuel*HFO_EF,
     assumptionSource:entry.assumptionSource.trim(),evidence:"USER_ASSUMPTION_NOT_INDEPENDENTLY_VERIFIED"
   });
 }
 const statuses=sca.types.map(group=>{
   const covered=shares.get(group)||0;
   return {scaType:group,officialPassages:groupCounts[group].passages,
     allocatedSharePct:pct(covered),
     missingSharePct:pct(Math.max(0,1-covered)),
     status:group==="Other"?"UNMAPPED_OTHER_NEEDS_BREAKDOWN":covered>=1-1e-9?"MODELLED_FULL_GROUP":"MISSING_OR_PARTIAL_ASSUMPTIONS"};
 });
 const complete=statuses.every(x=>x.status==="MODELLED_FULL_GROUP");
 const partialFuel=rows.reduce((s,r)=>s+r.modelledFuel_t,0);
 return {schema:"ceri-sc-imo-sca-activity-v1",year:Number(year),
   officialPassages:sca.years[String(year)].shipCount,
   officialShipGroups:sca.types.length,sourceUrl:sca.years[String(year)].sourceUrl,
   basis:"2012 annual HFO fuel per IMO ship size × assumed SCA passages × share × hours / 8760 × 3.114",
   modelledPortionFuel_t:rows.length?partialFuel:null,
   modelledPortionCO2_t:rows.length?partialFuel*HFO_EF:null,
   // The source has nine ship groups, including Other which cannot be
   // allocated from aggregate data; don't issue a whole-fleet total.
   wholeFleetFuel_t:complete?partialFuel:null,
   wholeFleetCO2_t:complete?partialFuel*HFO_EF:null,
   groups:statuses,rows,rejected,
   rawReferenceYear:2012,estimatedNotMeasured:true,validatedAvoidedCO2_t:null,
   warning:"Indicative user-assumption scenario, not measured SCA transit emissions, not all ship types necessarily covered, not a Cape-vs-Suez savings calculation, not WtW CO2e."
 };
}
export function computeSimpleIMOExample(imo,{shipType,sizeCategory,numberOfShips=1,annualActivityHours=12}={}){
 validateIMOReference(imo);
 const found=imo.records.find(x=>x.shipType===shipType&&x.sizeCategory===sizeCategory);
 if(!found||!Number.isSafeInteger(numberOfShips)||numberOfShips<1||
     !Number.isFinite(annualActivityHours)||annualActivityHours<=0||annualActivityHours>HOURS_PER_YEAR)
   throw Error("Invalid IMO example inputs");
 const fuel=numberOfShips*found.referenceAnnualFuelPerShip_t*annualActivityHours/HOURS_PER_YEAR;
 return {shipType,sizeCategory,numberOfShips,annualActivityHours,annualTimeFraction:annualActivityHours/HOURS_PER_YEAR,
   fuel_t:fuel,co2_t:fuel*HFO_EF,claim:"ILLUSTRATIVE_REFERENCE_2012_NOT_ACTUAL_CANAL_EMISSIONS"};
}
