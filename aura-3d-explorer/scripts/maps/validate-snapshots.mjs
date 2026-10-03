// Run: node --import tsx scripts/maps/validate-snapshots.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateMapSnapshot, snapshotContains } from "../../src/lib/geographicContext.ts";

const root = new URL("../../", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const sites = read("src/content/map-sites.json");
let totalFeatures = 0;
let totalVertices = 0;

for (const site of sites) {
  const raw = read(`public/maps/${site.id}.json`);
  const map = validateMapSnapshot(raw);
  assert.ok(map, `${site.id}: runtime schema validation`);
  assert.equal(map.id, site.id);
  assert.deepEqual(map.bounds, site.bounds);
  assert.ok(snapshotContains(map, site), `${site.id}: example pin must be in coverage`);
  assert.equal(raw.release, "2026-09-23.1");
  assert.equal(raw.license, "ODbL-1.0");
  const provenance = read(`public/maps/provenance/${site.id}.json`);
  assert.deepEqual(provenance.bounds, map.bounds);
  assert.equal(provenance.release, raw.release);
  assert.equal(provenance.statistics.features, map.features.length);
  assert.equal(provenance.downloads.length, 4);
  assert.ok(provenance.downloads.every(download => /^[a-f0-9]{64}$/.test(download.sha256)));
  let count = 0;
  const visit = coordinates => {
    if (typeof coordinates[0] === "number") {
      const [longitude, latitude] = coordinates;
      const [west, south, east, north] = map.bounds;
      assert.ok(longitude >= west && longitude <= east && latitude >= south && latitude <= north,
        `${site.id}: every vertex must remain within documented coverage`);
      count++;
    } else coordinates.forEach(visit);
  };
  for (const feature of map.features) {
    visit(feature.geometry.coordinates);
    const source = provenance.features[feature.id];
    assert.ok(source, `${feature.id}: missing provenance`);
    assert.ok(Array.isArray(source.sources), `${feature.id}: missing upstream source records`);
    if (feature.heightSource === "recorded") assert.equal(feature.height, source.height);
    if (feature.heightSource === "levels") assert.equal(feature.height, Math.round(source.num_floors * 3200) / 1000);
    if (feature.heightSource === "unknown") assert.equal(feature.height, undefined);
    if (feature.kind === "building") assert.ok(feature.heightSource);
  }
  assert.equal(count, provenance.statistics.vertices);
  totalFeatures += map.features.length;
  totalVertices += count;
  console.log(`PASS ${site.id}: ${map.features.length} features, ${count} vertices`);
}
console.log(JSON.stringify({ maps: sites.length, features: totalFeatures, vertices: totalVertices,
  checks: ["runtime schema", "coverage bounds", "example pins", "upstream attribution", "recorded heights", "estimated heights", "unknown-height footprints", "source hashes"],
  attribution: fileURLToPath(new URL("public/maps/ATTRIBUTION.md", root)) }));
