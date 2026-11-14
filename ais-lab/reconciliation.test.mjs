import test from "node:test";
import assert from "node:assert/strict";
import {readCsv,normalizePassages,reconcilePassages} from "./reconciliation.mjs";
const headerAIS="MMSI,Name,Direction,Entry UTC,Exit UTC,Elapsed hours,Canal observations,AIS source,Verification";
const headerRef="MMSI,Direction,Exit UTC,Source";
const A=[
'"123456789","Test","Southbound","2026-11-14T04:00:00.000Z","2026-11-14T12:00:00.000Z","8","3","test","AIS-inferred; not official"',
'"222333444","Test","Northbound","2026-11-14T08:00:00.000Z","2026-11-14T16:00:00.000Z","8","4","test","AIS-inferred; not official"'];
const R=[
'"123456789","Southbound","2026-11-14T12:15:00.000Z","Sample SCA source reference — NOT AUTHENTICATED"',
'"222333444","Northbound","2026-11-14T16:25:00.000Z","Sample SCA source reference — NOT AUTHENTICATED"'];
const csv=(head,rows)=>[head,...rows].join("\r\n");
const ais=csv(headerAIS,A),ref=csv(headerRef,R);
test("matches by same MMSI direction within tolerance, one-to-one",()=>{
 const result=reconcilePassages(ais,ref);
 assert.equal(result.ok,true);
 assert.equal(result.matched,2);
 assert.equal(result.referenceMatchRate,1);
 assert.equal(result.aisMatchRate,1);
 assert.equal(result.pairs[0].offsetMinutes,15);
 assert.equal(result.verification,"manual-reference-not-authenticated");
 assert.match(result.warning,/NOT precision\/recall/);
});
test("cannot match an AIS direction mismatch or a large time gap",()=>{
 const rows=csv(headerRef,[
  '"123456789","Northbound","2026-11-14T12:15:00.000Z","Test"',
  '"222333444","Northbound","2026-11-15T16:25:00.000Z","Test"']);
 const x=reconcilePassages(ais,rows);
 assert.equal(x.matched,0);
 assert.equal(x.unmatchedReferences.length,2);
});
test("identical reference event cannot satisfy duplicate AIS passage",()=>{
 const duplicate=csv(headerAIS,[...A,A[0].replace('12:00:00.000Z','12:01:00.000Z')]);
 const r=reconcilePassages(duplicate,ref);
 assert.equal(r.matched,2);
 assert.equal(r.unmatchedAIS.length,1);
});
test("invalid MMSI and source rejected",()=>{
 assert.equal(normalizePassages(csv(headerRef,['"abc","Northbound","2026-11-14T16:25:00.000Z","Test"']),"reference").ok,false);
 assert.equal(normalizePassages(csv(headerRef,['"123456789","Northbound","2026-11-14T16:25:00.000Z",""']),"reference").ok,false);
});
test("explicit duplicate passage event rejected",()=>{
 const x=normalizePassages(csv(headerAIS,[A[0],A[0]]),"ais");
 assert.equal(x.ok,false);
 assert.match(x.errors[0].message,/Duplicate/);
});
test("CSV escaping and quoted comma supported",()=>{
 const r=readCsv('MMSI,Direction,Exit UTC,Source\n"123456789","Northbound","2026-11-14T16:25:00.000Z","A, B"',['MMSI','Direction','Exit UTC','Source']);
 assert.equal(r[0].source,"A, B");
});
test("invalid times, spoofed verification and malformed CSV rejected",()=>{
 assert.equal(normalizePassages(csv(headerRef,['"123456789","Northbound","2026-02-30T16:25:00.000Z","Test"']),"reference").ok,false);
 assert.equal(normalizePassages(csv(headerAIS,[A[0].replace("AIS-inferred; not official","official")]),"ais").ok,false);
 assert.throws(()=>readCsv('"unterminated',['MMSI']),/Unclosed/);
});
test("empty reference does not create a false 100% rate",()=>{
 assert.throws(()=>reconcilePassages(ais,headerRef+"\n,,,,"),/Invalid CSV row count/);
});
test("tolerance is bounded",()=>{
 assert.throws(()=>reconcilePassages(ais,ref,{toleranceMinutes:1000}),/Tolerance/);
});
