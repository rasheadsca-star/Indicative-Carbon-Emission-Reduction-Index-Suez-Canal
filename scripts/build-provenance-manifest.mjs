#!/usr/bin/env node
/**
 * Official-traffic provenance manifest (WP3). Pins each official-data file to a SHA-256,
 * its publisher URLs, periods, units and evidence tier. A regression test fails if a data
 * file changes without the manifest being regenerated and reviewed.
 *   node scripts/build-provenance-manifest.mjs          # writes data/official-traffic-provenance.json
 *   node scripts/build-provenance-manifest.mjs --check  # exit 1 if stale
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const OUT = "data/official-traffic-provenance.json";

export async function buildManifest() {
  const file = async (p) => { const buf = await readFile(new URL(p, root)); return { buf, sha256: createHash("sha256").update(buf).digest("hex") }; };
  const hist = await file("data/sca-official-monthly-2024-2025.json");
  const ann = await file("data/sca-2026-official-announcements.json");
  const h = JSON.parse(hist.buf), a = JSON.parse(ann.buf);
  const years = Object.keys(h.monthly).sort();
  return {
    schema: "ceri-sc-official-provenance-v1",
    note: "Evidence tiers: OFFICIAL_REPORT (annual report table), OFFICIAL_ANNOUNCEMENT (SCA press release, rounded), CANDIDATE (secondary-reported, not ingested). Manually transcribed; not an API feed.",
    files: [
      { path: "data/sca-official-monthly-2024-2025.json", sha256: hist.sha256, tier: "OFFICIAL_REPORT",
        publisher: "Suez Canal Authority", sources: [h.sourceUrl, h.extraSourceUrl2023].filter(Boolean),
        periods: { monthly: `${years[0]}-01..${years.at(-1)}-12`, annual: Object.keys(h.annual).sort() },
        units: h.units, lastPublishedPeriod: h.lastPublishedPeriod,
        checks: ["12 months per year", "sum(monthly vessels)=annual", "sum(monthly net tonnage)=annual"] },
      { path: "data/sca-2026-official-announcements.json", sha256: ann.sha256, tier: "OFFICIAL_ANNOUNCEMENT",
        publisher: "Suez Canal Authority", lastVerifiedAnnouncementDate: a.lastVerifiedAnnouncementDate,
        items: [
          { id: "monthly", period: a.monthlyComparison.period, baseline: a.monthlyComparison.baseline, published: a.monthlyComparison.publicationDate, url: a.monthlyComparison.sourceUrl,
            rounding: "net tonnage to nearest million; revenue in million USD", scope: "all transits" },
          { id: "container-segment", period: a.containerRecovery.period, published: a.containerRecovery.publicationDate, url: a.containerRecovery.sourceUrl, scope: a.containerRecovery.group },
          { id: "single-day", period: a.singleDay.date, published: a.singleDay.publicationDate, url: a.singleDay.sourceUrl, scope: "one day, not a series" }
        ] }
    ],
    unavailable: ["official 2026 daily series", "official 2026 weekly series", "official 2026 annual total", "ship-level official register"]
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const next = JSON.stringify(await buildManifest(), null, 2) + "\n";
  if (process.argv.includes("--check")) {
    const cur = await readFile(new URL(OUT, root), "utf8").catch(() => "");
    if (cur !== next) { console.error("Provenance manifest is stale: run node scripts/build-provenance-manifest.mjs and review."); process.exit(1); }
    console.log("Provenance manifest current");
  } else { await writeFile(new URL(OUT, root), next); console.log("Wrote " + OUT); }
}
