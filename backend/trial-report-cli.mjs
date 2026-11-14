#!/usr/bin/env node
/** Print ONLY the identity-free 7-day source-quality report from a private AIS journal. */
import {writeFile} from "node:fs/promises";
import {readPrivateTrialReport} from "./trial-report.mjs";
const dir=process.argv[2]||process.env.AIS_PRIVATE_DATA_DIR;
if(!dir){console.error("Usage: node backend/trial-report-cli.mjs /path/to/private-data [--out /path/to/report.json]");process.exit(2)}
try{
 const report=await readPrivateTrialReport({directory:dir});
 const pretty=JSON.stringify(report,null,2)+"\n";
 const i=process.argv.indexOf("--out");
 if(i>=0){
   const target=process.argv[i+1];
   if(!target)throw Error("Missing --out filename");
   await writeFile(target,pretty,{mode:0o600});
   console.log("Aggregate-only AIS trial report written to "+target);
 }else process.stdout.write(pretty);
}catch(e){console.error("Private AIS trial report unavailable: "+e.message);process.exitCode=1}
