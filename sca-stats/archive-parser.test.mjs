import test from "node:test";
import assert from "node:assert/strict";
import {listAnnualReportYears} from "./archive-parser.mjs";
test("annual archive year extraction requires both file and year label",()=>{
 const html='<a href="/English/Downloads/2024.pdf">2024</a>\n'+
 '<a href="/English/Downloads/2025.pdf"><span>2025</span></a>\n'+
 '<a href="/English/Downloads/2025.pdf">Report 2024</a>\n'+
 '<a href="/English/Downloads/other.pdf">2026</a>';
 assert.deepEqual(listAnnualReportYears(html),[2024,2025]);
});
test("unknown/dynamic markup is not interpreted as an empty official archive",()=>{
 assert.deepEqual(listAnnualReportYears('<div id="report-list"></div>'),[]);
});
test("malformed and oversized payload rejected",()=>{
 assert.throws(()=>listAnnualReportYears(null),/Invalid/);
 assert.throws(()=>listAnnualReportYears("x".repeat(5_000_001)),/Invalid/);
});
