import { test } from "node:test";
import assert from "node:assert/strict";
import { geographicToWorld, worldToGeographic, isProjectLocation, snapshotContains, validateMapSnapshot, type MapSnapshot, type ProjectLocation, type LonLat } from "../../src/lib/geographicContext";
import { MODEL_SCALE } from "../../src/lib/tower";

const london: ProjectLocation = { latitude: 51.5074, longitude: -0.1278, label: "London example pin", example: true };
const ring: LonLat[] = [[-0.13, 51.5], [-0.12, 51.5], [-0.12, 51.51], [-0.13, 51.5]];
const snapshot = (): MapSnapshot => ({ id: "test-map", label: "Example map", bounds: [-0.2, 51.4, 0, 51.6], capturedAt: "2026-10-02T00:00:00Z", attribution: "Open map contributors", sourceUrl: "https://example.com/map", features: [{ id: "building/1", kind: "building", geometry: { type: "Polygon", coordinates: [ring] }, height: 30, minHeight: 2, heightSource: "recorded" }] });
const close = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);

test("WGS84 100-metre east/north displacements use the architectural scale and correct axes", () => {
  const equator: ProjectLocation = { latitude: 0, longitude: 0, label: "Scale test", example: true };
  // At the WGS84 equator: prime vertical radius a = 6378137 m;
  // meridional radius a(1-e²) = 6335439.3272928195 m.
  const east100 = 100 / 6378137 * 180 / Math.PI;
  const north100 = 100 / 6335439.3272928195 * 180 / Math.PI;
  const east = geographicToWorld([east100, 0], equator), north = geographicToWorld([0, north100], equator);
  close(east[0], 100 * MODEL_SCALE, 1e-6); close(east[1], 0);
  close(north[0], 0); close(north[1], -100 * MODEL_SCALE);
});

test("nearby WGS84 coordinates round-trip for London, New York and Dubai without axis reversal", () => {
  for (const location of [london, { latitude: 40.7128, longitude: -74.006, label: "New York example", example: true }, { latitude: 25.2048, longitude: 55.2708, label: "Dubai example", example: true }]) {
    for (const [dlon, dlat] of [[0, 0], [0.003, 0.002], [-0.004, -0.001]]) {
      const input: LonLat = [location.longitude + dlon, location.latitude + dlat];
      const projected = geographicToWorld(input, location), restored = worldToGeographic(projected, location);
      close(restored[0], input[0]); close(restored[1], input[1]);
      if (dlon) assert.equal(Math.sign(projected[0]), Math.sign(dlon));
      if (dlat) assert.equal(Math.sign(projected[1]), -Math.sign(dlat));
    }
  }
});

test("longitude wrap uses the local antimeridian direction without spanning the globe", () => {
  const origin = { ...london, latitude: 0, longitude: 179.999 };
  const projected = geographicToWorld([-179.999, 0], origin);
  assert.ok(projected[0] > 0 && projected[0] < 100);
  close(worldToGeographic(projected, origin)[0], -179.999);
});

test("project locations require finite coordinates, an explicit example flag and a bounded label", () => {
  assert.equal(isProjectLocation(london), true);
  for (const invalid of [null, [], {}, { ...london, latitude: NaN }, { ...london, latitude: 85.01 }, { ...london, longitude: Infinity }, { ...london, longitude: -180.01 }, { ...london, label: " " }, { ...london, label: "x".repeat(161) }, { ...london, example: "true" }]) assert.equal(isProjectLocation(invalid), false);
  assert.throws(() => geographicToWorld([Infinity, 0], london), RangeError);
  assert.throws(() => worldToGeographic([NaN, 0], london), RangeError);
  assert.throws(() => geographicToWorld([0, 0], { ...london, latitude: 90 }), RangeError);
});

test("snapshot coverage is inclusive and rejects invalid or wrapped bounds", () => {
  const map = snapshot();
  assert.equal(snapshotContains(map, london), true);
  assert.equal(snapshotContains(map, { ...london, longitude: map.bounds[0], latitude: map.bounds[1] }), true);
  assert.equal(snapshotContains(map, { ...london, longitude: 0.001 }), false);
  for (const bounds of [[0, 51.4, -0.2, 51.6], [-0.2, 51.6, 0, 51.4], [-0.2, 51.4, Infinity, 51.6]]) assert.equal(snapshotContains({ ...map, bounds } as MapSnapshot, london), false);
});

test("snapshot validation accepts all supported geometry shapes and preserves height provenance", () => {
  const map = snapshot();
  map.features.push(
    { id: "park/1", kind: "park", geometry: { type: "MultiPolygon", coordinates: [[ring]] } },
    { id: "road/1", kind: "road", geometry: { type: "LineString", coordinates: [ring[0], ring[1]] } },
    { id: "water/1", kind: "water", geometry: { type: "MultiLineString", coordinates: [[ring[0], ring[1]]] } },
  );
  const result = validateMapSnapshot(map);
  assert.deepEqual(result, map);
  assert.notEqual(result, map);
  assert.notEqual(result?.features[0].geometry, map.features[0].geometry);
});

test("malformed, nonfinite and impossible map data is rejected before geometry generation", () => {
  const feature = snapshot().features[0];
  for (const invalid of [null, [], {}, { ...snapshot(), sourceUrl: "javascript:alert(1)" }, { ...snapshot(), sourceUrl: "https://user:secret@example.com" }, { ...snapshot(), capturedAt: "not-a-date" }, { ...snapshot(), bounds: [-0.2, 51.4, NaN, 51.6] }, { ...snapshot(), features: [feature, feature] }]) assert.equal(validateMapSnapshot(invalid), null);
  for (const patch of [{ height: NaN }, { height: -1 }, { height: 1001 }, { minHeight: 31 }, { heightSource: "guessed" }, { geometry: { type: "Point", coordinates: [0, 0] } }, { geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1]]] } }, { geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [NaN, 1], [0, 0]]] } }, { geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]] } }]) assert.equal(validateMapSnapshot({ ...snapshot(), features: [{ ...feature, ...patch }] }), null);
});

test("untrusted text remains text and extra executable-looking fields are not copied", () => {
  const map = snapshot(), name = '<img src=x onerror="alert(1)">';
  const result = validateMapSnapshot({ ...map, onclick: "alert(1)", features: [{ ...map.features[0], name, properties: { __html: "<script>alert(1)</script>" } }] });
  assert.ok(result);
  assert.equal(result.features[0].name, name);
  assert.equal("onclick" in result, false);
  assert.equal("properties" in result.features[0], false);
});

test("snapshot feature and aggregate vertex budgets stop oversized map inputs", () => {
  const map = snapshot();
  assert.equal(validateMapSnapshot({ ...map, features: Array.from({ length: 12001 }, (_, i) => ({ ...map.features[0], id: String(i) })) }), null);
  const coordinates = Array.from({ length: 250001 }, () => [0, 0]);
  assert.equal(validateMapSnapshot({ ...map, features: [{ id: "road/huge", kind: "road", geometry: { type: "MultiLineString", coordinates: [coordinates, coordinates] } }] }), null);
});
