import test from "node:test";
import assert from "node:assert/strict";
import {auditVesselEvidence} from "./ais-sca-voyage-pipeline.mjs";
const aisH="MMSI,Direction,Exit UTC";
const refH="MMSI,Direction,Exit UTC,Source";
const opsH="MMSI,Direction,Exit UTC,Suez Distance Nm,Cape Distance Nm,Speed Kn,Sea Burn Tonnes Day,Suez Extra Hours,Cape Extra Hours,Standby Burn Tonnes Day,Combustion EF,Burn Sensitivity Pct,Distance Source,Fuel Source,Factor Source";
const ais=[aisH,"123456789,Southbound,2026-11-14T12:00:00Z","222333444,Northbound,2026-11-14T16:00:00Z"].join("\n");
const ref=[refH,"123456789,Southbound,2026-11-14T12:15:00Z,SCA sample not authenticated","222333444,Northbound,2026-11-14T16:25:00Z,SCA sample not authenticated"].join("\n");
const rows=[
 "123456789,Southbound,2026-11-14T12:15:00Z,6000,11000,20,100,14,0,12,3.114,10,route log,fuel log,IMO emission factor",
 "222333444,Northbound,2026-11-14T16:25:00Z,6000,11000,20,100,14,0,12,3.114,10,route log,fuel log,IMO emission factor"];
const ops=(rs=rows)=>[opsH,...rs].join("\n");
test("exact reference keyed voyage inputs from two matched candidates yield reproducible unverified aggregation",()=>{
 const a=auditVesselEvidence(ais,ref,ops());
 assert.equal(a.ok,true);
 assert.equal(a.eligible,2);
 assert.equal(a.referenceRecords,2);
 assert.equal(a.sourceMatched,2);
 assert.equal(a.missingOperatingInputs,0);
 assert.equal(a.byDirection.northbound,1);
 assert.equal(a.byDirection.southbound,1);
 assert.ok(Math.abs(a.totals.deltaFuelTonnes-2*1034.6666666666667)<1e-6);
 assert.equal(a.verified,false);
 assert.equal(a.emissionsCertified,false);
 assert.doesNotMatch(JSON.stringify(a),/123456789|222333444|route log|fuel log/);
});
test("no AIS/reference match -> zero eligible not zero validated canal emissions",()=>{
 const wrong=[aisH,"123456789,Northbound,2026-11-14T12:00:00Z"].join("\n");
 const a=auditVesselEvidence(wrong,ref,ops());
 assert.equal(a.eligible,0);
 assert.equal(a.unmatchedOperatingRows,2);
 assert.equal(a.totals.deltaCO2Tonnes,0);
 assert.equal(a.verified,false);
});
test("a missing operational reference never passes the evidence gate",()=>{
 const a=auditVesselEvidence(ais,ref,ops([rows[0].replace("fuel log,"," ,")]));
 assert.equal(a.eligible,0);
 assert.equal(a.rejectedRows,1);
 assert.ok(a.rejectionDetails[0].reasons.includes("missing_operational_source"));
});
test("bad physical inputs are rejected with no optimistic default",()=>{
 const a=auditVesselEvidence(ais,ref,ops([rows[0].replace(",20,100,",",0,100,")]));
 assert.equal(a.eligible,0);
 assert.equal(a.rejectedRows,1);
 assert.match(a.rejectionDetails[0].reasons.join(","),/invalid_operational_input/);
});
test("duplicate operational records cannot silently double count",()=>{
 const a=auditVesselEvidence(ais,ref,ops([rows[0],rows[0]]));
 assert.equal(a.eligible,1);
 assert.equal(a.rejectedRows,1);
 assert.ok(a.rejectionDetails[0].reasons.includes("duplicate_operational_record"));
});
test("ambiguous reference alternatives prevent optimistic matched scenario claim",()=>{
 const extra=ref+",\n"; // malformed rows fail at reconciliation
 assert.throws(()=>auditVesselEvidence(ais,extra,ops()),/Column count mismatch/);
 const ambiguous=ref+"\n123456789,Southbound,2026-11-14T12:20:00Z,SourceB";
 const a=auditVesselEvidence(ais,ambiguous,ops());
 assert.equal(a.ambiguousMatchedRows,1);
 assert.equal(a.eligible,1);
});
test("invalid reference CSV never issues a calculated output",()=>{
 const r=auditVesselEvidence(ais,refH+"\ninvalid,Northbound,2026-11-14T16:25:00Z,Source",ops());
 assert.equal(r.ok,false);
 assert.equal(r.stage,"reconcile");
});
