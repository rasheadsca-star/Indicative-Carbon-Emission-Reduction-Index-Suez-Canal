import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildManifest } from "../scripts/build-provenance-manifest.mjs";

test("official data files match their pinned SHA-256 provenance manifest", async () => {
  const committed = JSON.parse(await readFile(new URL("../data/official-traffic-provenance.json", import.meta.url), "utf8"));
  assert.deepEqual(committed, await buildManifest(), "Data changed without regenerating/reviewing data/official-traffic-provenance.json");
});

test("every official source URL is on the SCA domain", async () => {
  const m = await buildManifest();
  const urls = [...m.files[0].sources, ...m.files[1].items.map((i) => i.url)];
  for (const u of urls) assert.match(u, /^https:\/\/www\.suezcanal\.gov\.eg\//);
});
