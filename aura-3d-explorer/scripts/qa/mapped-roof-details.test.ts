import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMappedRoofDetails, ROOF_DETAIL_BUDGET, type RoofDetailInstance } from "../../src/lib/mappedRoofDetails";
import { worldToGeographic, type LonLat, type MapFeature, type MapSnapshot, type ProjectLocation } from "../../src/lib/geographicContext";
import { MODEL_SCALE, pointInPolygon, type PlanPoint } from "../../src/lib/tower";
import type { Building } from "../../src/types";

const origin: ProjectLocation = { latitude: 51.5, longitude: -.1, label: "Roof test", example: true };
const geo = (points: PlanPoint[]): LonLat[] => [...points, points[0]].map(([x, z]) => worldToGeographic([x * MODEL_SCALE, z * MODEL_SCALE], origin));
const box = (x: number, z: number, w: number, d: number): PlanPoint[] => [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];
const feature = (id: string, rings: PlanPoint[][], height = 30, heightSource: MapFeature["heightSource"] = "recorded"): MapFeature => ({ id, kind: "building", height, heightSource, geometry: { type: "Polygon", coordinates: rings.map(geo) } });
const snapshot = (features: MapFeature[]): MapSnapshot => ({ id: "roof-fixture", label: "Roof fixture", bounds: [-.2, 51.4, 0, 51.6], capturedAt: "2026-10-02", sourceUrl: "https://example.com", attribution: "Test data", features });
function corners(instance: RoofDetailInstance): PlanPoint[] {
  const [x, , z] = instance.position, [width, , depth] = instance.size, cosine = Math.cos(instance.rotationY), sine = Math.sin(instance.rotationY);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dz]) => [(x + dx * width / 2 * cosine + dz * depth / 2 * sine) / MODEL_SCALE, (z - dx * width / 2 * sine + dz * depth / 2 * cosine) / MODEL_SCALE]);
}

test("roof equipment is deterministic by feature ID and independent of input feature order", () => {
  const a = feature("way/a", [box(80, 80, 40, 40)]), b = feature("way/b", [box(-110, 80, 30, 30)]);
  const first = buildMappedRoofDetails(snapshot([a, b]), origin, [], "high");
  assert.ok(first.units > 0);
  assert.deepEqual(first, buildMappedRoofDetails(snapshot([b, a]), origin, [], "high"));
  assert.equal(first.batches.pads.length, first.batches.housings.length);
  assert.equal(first.batches.pads.length, first.batches.vents.length);
  for (const housing of first.batches.housings) assert.ok(housing.size[1] / MODEL_SCALE < 1);
});

test("all pads remain inside a concave footprint and outside its courtyard", () => {
  const outer: PlanPoint[] = [[80, 80], [140, 80], [140, 100], [110, 100], [110, 140], [80, 140]];
  const hole = box(85, 105, 16, 20);
  const plan = buildMappedRoofDetails(snapshot([feature("way/concave", [outer, hole])]), origin, [], "high");
  assert.ok(plan.units > 0);
  for (const pad of plan.batches.pads) for (const point of corners(pad)) {
    assert.equal(pointInPolygon(outer, ...point), true);
    assert.equal(pointInPolygon(hole, ...point), false);
  }
});

test("no equipment appears under a higher overlapping building part", () => {
  const lower = feature("lower", [box(80, 80, 50, 40)], 20), upper = feature("upper", [box(105, 80, 25, 40)], 60, "levels");
  const plan = buildMappedRoofDetails(snapshot([lower, upper]), origin, [], "high");
  assert.ok(plan.units > 0);
  assert.ok(plan.batches.pads.every(pad => pad.roofId === "lower:0"));
  for (const pad of plan.batches.pads) assert.ok(corners(pad).every(([x]) => x < 105));
  const covered = buildMappedRoofDetails(snapshot([lower, feature("cover", [box(79, 79, 52, 42)], 80, "levels")]), origin);
  assert.equal(covered.units, 0);
});

test("a small enclosed hole and a thin crossing upper part cannot slip between pad corners", () => {
  const outer = box(80, 80, 40, 40), original = feature("tiny-hole", [outer]);
  const first = buildMappedRoofDetails(snapshot([original]), origin, [], "high").batches.pads[0];
  const x = first.position[0] / MODEL_SCALE, z = first.position[2] / MODEL_SCALE;
  const excludes = (plan: ReturnType<typeof buildMappedRoofDetails>, minX: number, minZ: number, maxX: number, maxZ: number) => {
    assert.ok(plan.units > 0);
    for (const pad of plan.batches.pads) {
      const points = corners(pad), xs = points.map(p => p[0]), zs = points.map(p => p[1]);
      assert.ok(Math.max(...xs) < minX || Math.min(...xs) > maxX || Math.max(...zs) < minZ || Math.min(...zs) > maxZ);
    }
  };
  excludes(buildMappedRoofDetails(snapshot([feature("tiny-hole", [outer, box(x - .05, z - .05, .1, .1)])]), origin, [], "high"), x - .05, z - .05, x + .05, z + .05);
  excludes(buildMappedRoofDetails(snapshot([original, feature("crossing-part", [box(x - .05, 80, .1, 40)], 60, "levels")]), origin, [], "high"), x - .05, 80, x + .05, 120);
});

test("estimated, unknown and distant roofs receive no invented equipment", () => {
  const plan = buildMappedRoofDetails(snapshot([
    feature("estimated", [box(80, 80, 40, 40)], 30, "levels"),
    feature("unknown", [box(-120, 80, 30, 30)], 0, "unknown"),
    feature("far", [box(400, 400, 40, 40)]),
  ]), origin, [], "high");
  assert.equal(plan.units, 0);
});

test("intersecting proposal removes details from the whole hidden context roof", () => {
  const map = snapshot([feature("removed", [box(80, 80, 40, 40)])]);
  const proposal = { position: [80 * MODEL_SCALE, 80 * MODEL_SCALE], floors: [{ width: 4 * MODEL_SCALE, depth: 4 * MODEL_SCALE, rotationY: 0, shape: { kind: "rect" } }] } as Building;
  assert.ok(buildMappedRoofDetails(map, origin).units > 0);
  assert.equal(buildMappedRoofDetails(map, origin, [proposal]).units, 0);
});

test("quality budgets are bounded to three shared batches and every part stays within 300 metres", () => {
  const features = Array.from({ length: 196 }, (_, i) => feature(`roof/${i}`, [box(-180 + (i % 14) * 26, -180 + Math.floor(i / 14) * 26, 22, 22)]));
  for (const tier of ["high", "medium", "low"] as const) {
    const plan = buildMappedRoofDetails(snapshot(features), origin, [], tier);
    assert.ok(plan.units > 0 && plan.units <= ROOF_DETAIL_BUDGET[tier]);
    assert.equal(Object.keys(plan.batches).length, 3);
    for (const pad of plan.batches.pads) for (const [x, z] of corners(pad)) assert.ok(Math.hypot(x, z) <= 300);
  }
});
