import { test } from "node:test";
import assert from "node:assert/strict";
import { planCityTrees, STREET_TREE_OFFSET_M } from "../../src/lib/mappedVegetation";
import { worldToGeographic, type MapFeature, type MapSnapshot, type ProjectLocation } from "../../src/lib/geographicContext";
import { CARRIAGEWAY_WIDTH_M, STREET_WIDTH_M } from "../../src/lib/mappedGeometry";
import { MODEL_SCALE, pointInPolygon, type PlanPoint } from "../../src/lib/tower";

const origin: ProjectLocation = { latitude: 40.72, longitude: -74.03, label: "Test", example: true };
const rect = (x0: number, z0: number, x1: number, z1: number): PlanPoint[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const geo = (ring: PlanPoint[]) => [...ring, ring[0]].map(p => worldToGeographic(p, origin));
const snapshot = (features: MapFeature[]): MapSnapshot => ({ id: "veg", label: "Veg", bounds: [-75, 40, -73, 41], capturedAt: "2026-10-23T00:00:00Z", attribution: "Test", sourceUrl: "https://example.com", features });
const budget = { park: 5000, street: 5000 };

test("park trees fill the park, avoid mapped buildings inside it and never overlap", () => {
  const park = rect(-40, -40, 40, 40), house = rect(-10, -10, 10, 10);
  const trees = planCityTrees(snapshot([
    { id: "park", kind: "park", geometry: { type: "Polygon", coordinates: [geo(park)] } },
    { id: "house", kind: "building", height: 10, heightSource: "recorded", geometry: { type: "Polygon", coordinates: [geo(house)] } },
  ]), origin, [], budget);
  assert.ok(trees.length > 20, `only ${trees.length} trees`);
  for (const t of trees) {
    assert.ok(pointInPolygon(park, t.x, t.z), "tree outside park");
    assert.ok(!(Math.abs(t.x) < 10 + t.height * 0.28 && Math.abs(t.z) < 10 + t.height * 0.28), "tree inside building");
  }
  for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) assert.ok(Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z) > 0.5, "trees overlap");
});

test("street trees stand on the pavement band, outside the carriageway, on both sides", () => {
  const a: PlanPoint = [-100, 0], b: PlanPoint = [100, 0];
  const trees = planCityTrees(snapshot([{ id: "road", kind: "road", geometry: { type: "LineString", coordinates: [a, b].map(p => worldToGeographic(p, origin)) } }]), origin, [], budget);
  assert.ok(trees.length >= 20);
  const offsets = new Set(trees.map(t => Math.sign(t.z)));
  assert.deepEqual([...offsets].sort(), [-1, 1]);
  for (const t of trees) {
    const metres = Math.abs(t.z) / MODEL_SCALE;
    assert.ok(Math.abs(metres - STREET_TREE_OFFSET_M) < 0.01);
    assert.ok(metres > CARRIAGEWAY_WIDTH_M / 2 && metres < STREET_WIDTH_M / 2, "tree must be on the pavement");
  }
});

test("budget, determinism and an empty map", () => {
  const park = rect(-200, -200, 200, 200);
  const map = snapshot([{ id: "park", kind: "park", geometry: { type: "Polygon", coordinates: [geo(park)] } }]);
  const small = planCityTrees(map, origin, [], { park: 50, street: 0 });
  assert.equal(small.length, 50);
  assert.deepEqual(planCityTrees(map, origin, [], { park: 50, street: 0 }), small);
  assert.deepEqual(planCityTrees(null, origin, [], budget), []);
  assert.deepEqual(planCityTrees(snapshot([]), origin, [], budget), []);
});
