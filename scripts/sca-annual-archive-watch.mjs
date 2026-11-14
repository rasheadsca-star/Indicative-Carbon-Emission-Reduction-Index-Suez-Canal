/**
 * Public SCA annual archive availability monitor. This does not import report
 * contents, nor certify any daily traffic data.
 */
import {mkdir,writeFile} from "node:fs/promises";
const archiveUrl="https://www.suezcanal.gov.eg/English/Downloads/Pages/default.aspx?folder=Navigation%20Reports/Annual%20Reports%E2%80%8B%E2%80%8B%E2%80%8B";
const result={schema:"ceri-sc-sca-archive-check-v1",checkedAt:new Date().toISOString(),sourceUrl:archiveUrl,fetchOk:false,httpStatus:null,latestPublishedYear:null,publishedYears:[],status:"UNKNOWN",note:"Archive listing only; no verified daily, weekly or monthly series are inferred.",errors:[]};
const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
try {
  const response=await fetch(archiveUrl,{signal:controller.signal,headers:{"Accept":"text/html","User-Agent":"CERI-SC-Public-Archive-Check/1.0"}});
  result.httpStatus=response.status;
  if(!response.ok)throw Error("HTTP "+response.status);
  const html=await response.text();
  // List years only when both the PDF filename and the numeric visible label occur
  // in the same link; do not guess from unrelated publication dates.
  const anchors=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const years=new Set();
  for(const [,href,label] of anchors){
    const candidate=href.match(/(?:^|\/)(20\d\d)\.pdf(?:\?|$)/i);
    const text=label.replace(/<[^>]*>/g," ").trim();
    if(candidate && text.includes(candidate[1]))years.add(Number(candidate[1]));
  }
  result.publishedYears=[...years].sort((a,b)=>a-b);
  if(result.publishedYears.length===0)throw Error("No unambiguously identifiable annual report links returned (possibly dynamic HTML)");
  result.latestPublishedYear=result.publishedYears.at(-1);
  result.fetchOk=true;
  result.status="ARCHIVE_LISTING_READ";
} catch(err) {
  result.errors.push(String(err?.message||err));
  result.status="UNKNOWN";
} finally {clearTimeout(timeout);}
await mkdir("data",{recursive:true});
await writeFile("data/sca-archive-status.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({checkedAt:result.checkedAt,latestPublishedYear:result.latestPublishedYear,status:result.status,errors:result.errors}));
