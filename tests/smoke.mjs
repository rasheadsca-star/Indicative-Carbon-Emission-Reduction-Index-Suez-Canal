import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../dashboard-v6.css", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");

for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()) {
  if (match[1].trim()) new vm.Script(match[1], { filename: `index-inline-${index}.js` });
}

assert.match(html, /CERI-SC Intelligence Platform V9\.0/);
assert.match(html, /قصيرة الأجل 2025–2028/);
assert.match(html, /متوسطة الأجل 2029–2032/);
assert.match(html, /طويلة الأجل 2033–2050/);
assert.match(html, /Input completeness — not confidence/);
assert.match(html, /Tank-to-Wake CO₂ Factors/);
assert.doesNotMatch(html, /CO₂ Reduced Today \(est\.\)/);
assert.doesNotMatch(html, /This Month \(est\.\)/);
assert.doesNotMatch(html, /No upper limit/);
assert.doesNotMatch(html, /\bperSec\b|liveC\s*\+=|g1RateLbl\s*=\s*['"]\+/);
assert.match(css, /\.print-report-page:last-child/);
assert.match(css, /font-size:12pt/);
assert.match(worker, /\/api\/admin/);
assert.match(worker, /\/api\/feedback/);
assert.doesNotMatch(worker, /position:fixed;z-index:2147483647/);

const runtimeErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => runtimeErrors.push(error.message));
virtualConsole.on("error", (error) => runtimeErrors.push(String(error)));
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://local.ceri-sc.test/",
  virtualConsole,
  beforeParse(window) {
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    window.Response = Response;
    window.fetch = async () => new Response(JSON.stringify({ ok: false, error: "test_fallback" }), { status: 503, headers: { "Content-Type": "application/json" } });
    Object.defineProperty(window.navigator, "serviceWorker", { value: { register: async () => ({}) }, configurable: true });
  },
});

await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(dom.window.document.querySelectorAll("#nav button").length, 6);
assert.match(dom.window.document.querySelector("#main").textContent, /PRO-RATA YEAR-TO-DATE/);
dom.window.document.querySelectorAll("#nav button")[3].click();
assert.match(dom.window.document.querySelector("#main").textContent, /Fuel Lifecycle Boundary/);
dom.window.document.querySelectorAll("#nav button")[4].click();
assert.match(dom.window.document.querySelector("#main").textContent, /Short-term 2025–2028/);
assert.match(dom.window.document.querySelector("#main").textContent, /Anti-double-counting rule/);
dom.window.document.querySelectorAll("#nav button")[5].click();
await new Promise((resolve) => setTimeout(resolve, 40));
assert.match(dom.window.document.querySelector("#main").textContent, /Read-only fallback/);
dom.window.openFeedback();
assert.ok(dom.window.document.getElementById("feedbackModal").classList.contains("open"));
const report = dom.window.buildDashboardPrintReport();
assert.equal(report.querySelectorAll(".print-report-page").length, 4);
assert.deepEqual(runtimeErrors, []);
dom.window.close();

console.log("CERI-SC V9.0 smoke checks passed");
