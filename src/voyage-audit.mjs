/**
 * Same-vessel, fixed speed + daily fuel scenario model.
 * TTW combustion CO2 only. Inputs must be user-provided and independently cited for production use.
 * No implied fuel curve, vessel actuals, WtW or methane-slip estimate.
 */
const finite=(v,name,{positive=false,zero=true,max=Number.POSITIVE_INFINITY}={})=>{
 if(typeof v!=="number"||!Number.isFinite(v)||v<0||(!zero&&v===0)||(positive&&v<=0)||v>max)throw Error("Invalid "+name);
 return v;
};
export function computeVoyageScenario(input) {
 const dS=finite(input.suezDistanceNm,"Suez distance",{positive:true,max:100000});
 const dC=finite(input.capeDistanceNm,"Cape distance",{positive:true,max:100000});
 const speed=finite(input.speedKn,"ship speed",{positive:true,max:40});
 const burn=finite(input.seaBurnTonnesDay,"sea fuel daily burn",{positive:true,max:1000});
 const waitS=finite(input.suezExtraHours,"Suez transit/wait hours",{max:1000});
 const waitC=finite(input.capeExtraHours,"Cape waiting hours",{max:1000});
 const standby=finite(input.standbyBurnTonnesDay,"waiting fuel daily burn",{max:1000});
 const ef=finite(input.combustionCO2TonnesPerTonne,"combustion EF",{positive:true,max:5});
 const errorPct=finite(input.burnSensitivityPct,"sensitivity percentage",{max:60});
 const voyage=(distance,extraHours,burnMultiplier=1)=>{
   const seaHours=distance/speed,seaFuel=seaHours/24*burn*burnMultiplier;
   const extraFuel=extraHours/24*standby*burnMultiplier;
   const fuel=seaFuel+extraFuel;
   return {distanceNm:distance,seaHours,extraHours,totalHours:seaHours+extraHours,seaFuelTonnes:seaFuel,extraFuelTonnes:extraFuel,fuelTonnes:fuel,combustionCO2Tonnes:fuel*ef};
 };
 const suez=voyage(dS,waitS),cape=voyage(dC,waitC);
 const deltaFuel=cape.fuelTonnes-suez.fuelTonnes;
 const deltaCO2=cape.combustionCO2Tonnes-suez.combustionCO2Tonnes;
 const deltaHours=cape.totalHours-suez.totalHours;
 // Independent worst-case burn multipliers on each route: a sensitivity envelope, not confidence limits.
 const lowFuel=voyage(dC,waitC,1-errorPct/100).fuelTonnes-voyage(dS,waitS,1+errorPct/100).fuelTonnes;
 const highFuel=voyage(dC,waitC,1+errorPct/100).fuelTonnes-voyage(dS,waitS,1-errorPct/100).fuelTonnes;
 return {status:"UNVERIFIED_USER_SCENARIO",boundary:"Tank-to-Wake combustion CO2 only",
   method:"distance / speed × daily consumption; independent waiting fuel; fixed operational speed; no fuel curve",
   suez,cape,deltaFuelTonnes:deltaFuel,deltaCO2Tonnes:deltaCO2,deltaHours,
   sensitivity:{assumptionPct:errorPct,lowerCO2Tonnes:lowFuel*ef,upperCO2Tonnes:highFuel*ef,
     note:"Assumption range, not a statistical confidence interval"},
   verified:false,calculationUnit:"single voyage",warning:"Not an actual AIS-linked voyage, not WtW CO2e, not institutional MRV or certified saved emissions"};
}
