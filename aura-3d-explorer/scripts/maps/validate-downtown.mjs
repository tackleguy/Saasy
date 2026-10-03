// Run: node --import tsx scripts/maps/validate-downtown.mjs
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { validateMapSnapshot } from "../../src/lib/geographicContext.ts";
const root = new URL("../../", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const requested = new Set(process.argv.slice(2));
const areas = read("src/content/downtown-areas.json").filter(area => !requested.size || requested.has(area.id));
const sites = new Map(read("src/content/map-sites.json").map(site => [site.id, site]));
let totalFeatures = 0, totalVertices = 0, totalTiles = 0;
for (const area of areas) {
  const manifest = read(`public/maps/downtown/${area.id}/manifest.json`);
  const provenance = read(`public/maps/downtown/${area.id}/provenance.json`);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.id, area.id);
  assert.deepEqual(manifest.bounds, area.bounds);
  assert.deepEqual(manifest.nearBounds, sites.get(area.id).bounds);
  assert.equal(manifest.release, "2026-09-23.1");
  assert.equal(manifest.license, "ODbL-1.0");
  assert.ok(manifest.tiles.length > 0 && manifest.tiles.length <= 256);
  assert.equal(provenance.downloads.length, 4);
  assert.ok(provenance.downloads.every(source => /^[a-f0-9]{64}$/.test(source.sha256)));
  assert.deepEqual(provenance.statistics, manifest.statistics);
  const ids = new Set();
  let features = 0, vertices = 0;
  for (const tile of manifest.tiles) {
    assert.ok(!ids.has(tile.id)); ids.add(tile.id);
    assert.ok(tile.url.startsWith(`/maps/downtown/${area.id}/tiles/`));
    const file = new URL(`public${tile.url}`, root);
    assert.ok(statSync(file).size <= 12 * 1024 * 1024, `${tile.id}: byte budget`);
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const snapshot = validateMapSnapshot(raw);
    assert.ok(snapshot, `${tile.id}: runtime snapshot validation`);
    assert.equal(snapshot.id, tile.id);
    assert.deepEqual(snapshot.bounds, tile.bounds);
    assert.equal(snapshot.features.length, tile.features);
    let count = 0;
    const visit = coordinates => {
      if (typeof coordinates[0] === "number") {
        const [lon, lat] = coordinates;
        const [w,s,e,n] = tile.bounds;
        assert.ok(lon >= w - 1e-12 && lon <= e + 1e-12 && lat >= s - 1e-12 && lat <= n + 1e-12,
          `${tile.id}: every coordinate inside tile`);
        const [nw,ns,ne,nn] = manifest.nearBounds;
        assert.ok(!(lon > nw + 1e-12 && lon < ne - 1e-12 && lat > ns + 1e-12 && lat < nn - 1e-12),
          `${tile.id}: near-detail interior excluded`);
        count++;
      } else coordinates.forEach(visit);
    };
    for (const feature of snapshot.features) {
      visit(feature.geometry.coordinates);
      const source = provenance.features[feature.id];
      assert.ok(source && Array.isArray(source.sources), `${feature.id}: shared upstream provenance`);
      if (feature.heightSource === "recorded") assert.equal(feature.height, source.height);
      if (feature.heightSource === "levels") assert.equal(feature.height, Math.round(source.num_floors * 3200) / 1000);
      if (feature.heightSource === "unknown") assert.equal(feature.height, undefined);
    }
    assert.equal(count, tile.vertices);
    features += tile.features; vertices += count;
  }
  assert.equal(features, manifest.statistics.features);
  assert.equal(vertices, manifest.statistics.vertices);
  assert.equal(manifest.tiles.length, manifest.statistics.tiles);
  assert.equal(Object.keys(provenance.features).length, manifest.statistics.uniqueFeatures);
  totalTiles += manifest.tiles.length; totalFeatures += features; totalVertices += vertices;
  console.log(`PASS ${area.id}: ${manifest.tiles.length} tiles, ${features} features, ${vertices} vertices, ${manifest.statistics.coverageSquareKilometres} km²`);
}
console.log(JSON.stringify({areas:areas.length,tiles:totalTiles,features:totalFeatures,vertices:totalVertices,
  checks:["runtime snapshot schema","tile byte budgets","source hashes","shared source attribution","recorded heights","unknown flat footprints","near interior exclusion","full manifests"]}));
