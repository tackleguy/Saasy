import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMappedGeometry, createMappedGeometryBuilder } from "../../src/lib/mappedGeometry";
import { worldToGeographic, type MapFeature, type MapSnapshot, type ProjectLocation } from "../../src/lib/geographicContext";
import { MODEL_SCALE, type PlanPoint } from "../../src/lib/tower";

const origin: ProjectLocation = { latitude: 40.7128, longitude: -74.006, label: "Test pin", example: true };
const ring = (points: PlanPoint[]) => [...points, points[0]].map(point => worldToGeographic(point, origin));
const rectangle = (x: number, z: number, width = 10, depth = 5): PlanPoint[] => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];
const building = (id: string, x = 10): MapFeature => ({ id, kind: "building", height: 21, minHeight: 3, heightSource: "recorded", geometry: { type: "Polygon", coordinates: [ring(rectangle(x, 10))] } });
const snapshot = (features: MapFeature[]): MapSnapshot => ({ id: "facade-fixture", label: "Facade fixture", capturedAt: "2026-10-02T00:00:00Z", bounds: [-74.1, 40.6, -73.9, 40.8], attribution: "Synthetic unit-test geometry", sourceUrl: "https://example.com/map", features });
const near = (actual: number, expected: number, tolerance = 1e-4) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test("rotated outer and courtyard walls have edge-local metre coordinates and constant face identity", () => {
  const feature = building("rotated-courtyard");
  feature.geometry = { type: "Polygon", coordinates: [
    ring([[10, 10], [18, 16], [15, 20], [7, 14]]),
    ring([[11, 13], [14, 15.25], [13, 16.5], [10, 14.25]]),
  ] };
  const result = buildMappedGeometry(snapshot([feature]), origin);
  const geometry = result.batches.find(batch => batch.kind === "walls")!.geometry;
  const p = geometry.getAttribute("position"), uv = geometry.getAttribute("auraFacade"), identity = geometry.getAttribute("auraBuilding");
  assert.equal(uv.count, p.count); assert.equal(identity.count, p.count);
  assert.equal(uv.itemSize, 2); assert.equal(identity.itemSize, 3);
  const seed = identity.getX(0);
  assert.ok(seed >= 0 && seed < 1);
  // Eight measured edges, six vertices each; the remaining vertices close the underside.
  for (let i = 0; i < 48; i += 6) {
    const width = Math.hypot(p.getX(i + 2) - p.getX(i), p.getZ(i + 2) - p.getZ(i)) / MODEL_SCALE;
    const expectedU = [0, 0, width, 0, width, width];
    for (let j = 0; j < 6; j++) {
      near(uv.getX(i + j), expectedU[j]);
      near(uv.getY(i + j), p.getY(i + j) / MODEL_SCALE);
      assert.equal(identity.getX(i + j), seed);
      assert.equal(identity.getY(i + j), 21);
      near(identity.getZ(i + j), width);
    }
    near(Math.min(...Array.from({ length: 6 }, (_, j) => uv.getY(i + j))), 3);
    near(Math.max(...Array.from({ length: 6 }, (_, j) => uv.getY(i + j))), 21);
  }
  result.dispose();
});

test("roof coordinates stay local in metres and underside caps cannot acquire a window pattern", () => {
  const result = buildMappedGeometry(snapshot([building("elevated")]), origin);
  const wall = result.batches.find(batch => batch.kind === "walls")!.geometry;
  const roof = result.batches.find(batch => batch.kind === "roofs")!.geometry;
  for (const geometry of [wall, roof]) {
    const p = geometry.getAttribute("position"), normal = geometry.getAttribute("normal"), uv = geometry.getAttribute("auraFacade"), identity = geometry.getAttribute("auraBuilding");
    assert.equal(uv.count, p.count); assert.equal(identity.count, p.count);
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(normal.getY(i)) < .5) continue;
      near(uv.getX(i), (p.getX(i) - 10) / MODEL_SCALE);
      near(uv.getY(i), (p.getZ(i) - 10) / MODEL_SCALE);
      near(identity.getZ(i), geometry === roof ? 10 / MODEL_SCALE : 0);
      near(p.getY(i), (geometry === roof ? 21 : 3) * MODEL_SCALE);
      near(normal.getY(i), geometry === roof ? 1 : -1);
    }
  }
  assert.equal(roof.getAttribute("auraBuilding").getX(0), wall.getAttribute("auraBuilding").getX(0));
  result.dispose();
});

test("building appearance remains stable when features reorder, preparation yields, or the pin moves", () => {
  const a = { ...building("stable-a"), minHeight: 0 }, b = { ...building("stable-b", 40), minHeight: 0 };
  const first = buildMappedGeometry(snapshot([a, b]), origin);
  const reverse = buildMappedGeometry(snapshot([b, a]), origin);
  const builder = createMappedGeometryBuilder(snapshot([a, b]), origin, []);
  builder.step(1); assert.equal(builder.complete, false); builder.step(1);
  const chunked = builder.finish();
  const shifted = buildMappedGeometry(snapshot([a, b]), { ...origin, longitude: origin.longitude + .002 });
  for (const kind of ["walls", "roofs"] as const) {
    const before = first.batches.find(batch => batch.kind === kind)!.geometry;
    const reordered = reverse.batches.find(batch => batch.kind === kind)!.geometry;
    const verticesPerBuilding = before.getAttribute("position").count / 2;
    const ids = before.getAttribute("auraBuilding"), reversedIds = reordered.getAttribute("auraBuilding");
    assert.notEqual(ids.getX(0), ids.getX(verticesPerBuilding));
    assert.equal(ids.getX(0), reversedIds.getX(verticesPerBuilding));
    assert.equal(ids.getX(verticesPerBuilding), reversedIds.getX(0));
    for (const attribute of ["position", "normal", "auraFacade", "auraBuilding"]) {
      assert.deepEqual(before.getAttribute(attribute).array, chunked.batches.find(batch => batch.kind === kind)!.geometry.getAttribute(attribute).array);
    }
    for (const attribute of ["auraFacade", "auraBuilding"]) {
      const original = before.getAttribute(attribute).array;
      const moved = shifted.batches.find(batch => batch.kind === kind)!.geometry.getAttribute(attribute).array;
      assert.equal(original.length, moved.length);
      for (let i = 0; i < original.length; i++) near(original[i], moved[i]);
    }
  }
  [first, reverse, chunked, shifted].forEach(result => result.dispose());
});

test("multipart buildings share identity while unknown heights and landscape add no facade attributes or batches", () => {
  const feature = building("multipart");
  feature.geometry = { type: "MultiPolygon", coordinates: [[ring(rectangle(10, 10))], [ring(rectangle(40, 10, 4, 4))]] };
  const result = buildMappedGeometry(snapshot([
    feature,
    { ...building("unknown", 60), heightSource: "unknown" },
    { id: "water", kind: "water", geometry: { type: "Polygon", coordinates: [ring(rectangle(-30, -30))] } },
    { id: "park", kind: "park", geometry: { type: "Polygon", coordinates: [ring(rectangle(-50, -50))] } },
    { id: "road", kind: "road", geometry: { type: "LineString", coordinates: ring(rectangle(-70, -70)).slice(0, 2) } },
  ]), origin);
  assert.equal(result.batches.length, 6);
  const seeds = new Set<number>();
  for (const batch of result.batches) {
    const identity = batch.geometry.getAttribute("auraBuilding");
    if (batch.kind !== "walls" && batch.kind !== "roofs") {
      assert.equal(identity, undefined);
      assert.equal(batch.geometry.getAttribute("auraFacade"), undefined);
      continue;
    }
    assert.equal(identity.count, batch.geometry.getAttribute("position").count);
    for (let i = 0; i < identity.count; i++) seeds.add(identity.getX(i));
    for (const attribute of ["auraFacade", "auraBuilding"]) assert.ok(Array.from(batch.geometry.getAttribute(attribute).array).every(Number.isFinite));
  }
  assert.equal(seeds.size, 1);
  let disposed = 0;
  result.batches.forEach(batch => batch.geometry.addEventListener("dispose", () => disposed++));
  result.dispose(); result.dispose();
  assert.equal(disposed, 6);
});

test("repeated source vertices do not create invalid facade coordinates", () => {
  const feature = building("duplicate-point");
  feature.geometry = { type: "Polygon", coordinates: [ring([[10, 10], [20, 10], [20, 10], [20, 20], [10, 20]])] };
  const result = buildMappedGeometry(snapshot([feature]), origin);
  for (const batch of result.batches) {
    for (const attribute of ["auraFacade", "auraBuilding"]) {
      const values = batch.geometry.getAttribute(attribute);
      assert.equal(values.count, batch.geometry.getAttribute("position").count);
      assert.ok(Array.from(values.array).every(Number.isFinite));
    }
  }
  result.dispose();
});
