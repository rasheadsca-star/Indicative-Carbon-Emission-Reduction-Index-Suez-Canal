/**
 * Deterministic offline build. Node 22+. The generated page runs on file://
 * without ES-module imports or a web server. Do not hand-edit next/offline.html.
 *  node scripts/build-offline.mjs --write   regenerate
 *  node scripts/build-offline.mjs --check   ensure generated artifact is current
 */
import {readFile,writeFile} from "node:fs/promises";
const modules=[
  ["src/voyage-physical.mjs",["runVoyage","validIMO","FUELS","OFFICIAL_ROUTES","SCA_DISTANCE_SOURCE","IMO_CO2_SOURCE"]],
  ["src/sca-tolls-2024.mjs",["computeSCA2024BaseToll","SCA_2024_BASE_RATES"]],
  ["src/fuel-lca-scenario.mjs",["estimateScenarioWtW"]],
  ["src/regulation-screen.mjs",["screenEUETS"]],
  ["src/voyage-sensitivity.mjs",["runVoyageSensitivity"]]
];
const at=relative=>new URL("../"+relative,import.meta.url);
const original=await readFile(at("next/index.html"),"utf8");
let bundles="";
for(const [i,[file,exports]] of modules.entries()){
  let source=await readFile(at(file),"utf8");
  source=source.replace(/^import .*?;\s*$/gm,"").replace(/^export (const|function)\s+/gm,"$1 ");
  if(i===4)source='const {runVoyage}=window.__CERI_MODEL__;\n'+source;
  if(/\bexport\s+(?:const|function)/.test(source)||/^import\s/m.test(source))
    throw new Error("Unexpected ESM statement in "+file);
  const assign=exports.map(x=>x+":"+x).join(",");
  bundles+="// Module: "+file+" (snapshot of branch at bundling)\n(function(){\n"+
    source+"\nwindow.__CERI_MODEL__=Object.assign(window.__CERI_MODEL__||{},{"+assign+"});\n})();\n";
}
const imports=[...original.matchAll(/^import \{([^}]+)\} from "[^"]+";\s*$/gm)];
if(imports.length!==modules.length)throw new Error("Unexpected import count: "+imports.length);
const importNames=[...new Set(imports.flatMap(m=>m[1].split(",").map(x=>x.trim())))];
const clean=original.replace(/^import \{[^}]+\} from "[^"]+";\s*$/gm,"");
if(!clean.includes('<script type="module">'))throw new Error("No inline ESM script");
const result=clean.replace('<script type="module">',
  '<script>\nwindow.__CERI_MODEL__=window.__CERI_MODEL__||{};\n'+bundles+
  '\n</script>\n<script>\nconst {'+importNames.join(",")+'}=window.__CERI_MODEL__;');
if(result.includes('<script type="module">')||result.includes('from "../src/'))
  throw new Error("Bundle retained a module import");
const output=at("next/offline.html");
if(process.argv.includes("--write")){
  await writeFile(output,result,"utf8");
  console.log("Generated next/offline.html ("+result.length+" characters)");
}else if(process.argv.includes("--check")){
  const actual=await readFile(output,"utf8");
  if(actual!==result){
    console.error("next/offline.html is outdated: run node scripts/build-offline.mjs --write");
    process.exitCode=1;
  }else console.log("Offline bundle is up to date ("+result.length+" characters)");
}else{
  console.error("Pass --check or --write");
  process.exitCode=2;
}
