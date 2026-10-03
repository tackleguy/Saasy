import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMappedGeometry, createMappedGeometryBuilder } from "../../src/lib/mappedGeometry";
import { geographicToWorld, worldToGeographic, type MapFeature, type MapSnapshot, type ProjectLocation } from "../../src/lib/geographicContext";
import { MODEL_SCALE, pointInPolygon, type PlanPoint } from "../../src/lib/tower";
import type { Building } from "../../src/types";

const origin: ProjectLocation = { latitude: 40.7128, longitude: -74.006, label: "Test pin", example: true };
const ring = (points: PlanPoint[]) => [...points, points[0]].map(point => worldToGeographic(point, origin));
const rectangle = (x0: number, z0: number, x1: number, z1: number): PlanPoint[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const feature = (id: string, points: PlanPoint[], height?: number): MapFeature => ({ id, kind: "building", geometry: { type: "Polygon", coordinates: [ring(points)] }, ...(height === undefined ? {} : { height, heightSource: "recorded" }) });
const snapshot = (features: MapFeature[]): MapSnapshot => ({ id: "fixture", label: "Map fixture", capturedAt: "2026-10-02T00:00:00Z", bounds: [-74.1, 40.6, -73.9, 40.8], attribution: "Synthetic unit-test geometry", sourceUrl: "https://example.com/map", features });
const near = (actual: number, expected: number, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const proposal = (position: [number, number], width = 2, depth = 2, rotationY = 0): Building => ({ position, floors: [{ width, depth, rotationY, shape: { kind: "rect" } }] }) as Building;

test("mapped roofs preserve geographic position, metres, polygon holes and upward normals", () => {
  const outer = rectangle(10, -50, 20, -40), hole = rectangle(13, -47, 17, -43);
  const building: MapFeature = { id: "courtyard", kind: "building", geometry: { type: "Polygon", coordinates: [ring(outer), ring(hole)] }, height: 12, minHeight: 3, heightSource: "recorded" };
  const result = buildMappedGeometry(snapshot([building]), origin);
  const roof = result.batches.find(batch => batch.kind === "roofs")!.geometry;
  const position = roof.getAttribute("position"), normal = roof.getAttribute("normal");
  let area = 0;
  for (let i = 0; i < position.count; i += 3) {
    const ax = position.getX(i), az = position.getZ(i), bx = position.getX(i + 1), bz = position.getZ(i + 1), cx = position.getX(i + 2), cz = position.getZ(i + 2);
    area += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
    assert.equal(pointInPolygon(hole, (ax + bx + cx) / 3, (az + bz + cz) / 3), false);
  }
  near(area, 84);
  for (let i = 0; i < position.count; i++) { near(position.getY(i), 12 * MODEL_SCALE); near(normal.getY(i), 1); }
  near(roof.boundingBox!.min.x, 10); near(roof.boundingBox!.max.x, 20);
  near(roof.boundingBox!.min.z, -50); near(roof.boundingBox!.max.z, -40);
  const wall = result.batches.find(batch => batch.kind === "walls")!.geometry;
  near(wall.boundingBox!.min.y, 3 * MODEL_SCALE);
  near(wall.boundingBox!.max.y, 12 * MODEL_SCALE);
  result.dispose();
});

test("outer and courtyard wall normals face away from the building mass", () => {
  const outer = rectangle(0, 0, 10, 10), hole = rectangle(3, 3, 7, 7);
  const result = buildMappedGeometry(snapshot([{ id: "wall-normals", kind: "building", height: 10, heightSource: "recorded", geometry: { type: "Polygon", coordinates: [ring(outer), ring(hole)] } }]), origin);
  const wall = result.batches.find(batch => batch.kind === "walls")!.geometry;
  const p = wall.getAttribute("position"), normal = wall.getAttribute("normal");
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 + normal.getX(i) * 0.01;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 + normal.getZ(i) * 0.01;
    assert.equal(pointInPolygon(outer, x, z) && !pointInPolygon(hole, x, z), false);
  }
  result.dispose();
});

test("unknown heights stay flat even if a contradictory height value is supplied", () => {
  const unknown = { ...feature("unknown", rectangle(10, 10, 15, 15), 100), heightSource: "unknown" as const };
  const result = buildMappedGeometry(snapshot([unknown, feature("missing", rectangle(20, 20, 25, 25))]), origin);
  assert.deepEqual(result.batches.map(batch => batch.kind), ["footprints"]);
  assert.equal(result.unknownHeightFootprints, 2);
  near(result.batches[0].geometry.boundingBox!.min.y, 0.03);
  near(result.batches[0].geometry.boundingBox!.max.y, 0.03);
  result.dispose();
});

test("proposal clearing removes intersections only, preserves unrelated buildings and courtyard holes", () => {
  const courtyard: MapFeature = { id: "courtyard", kind: "building", height: 15, geometry: { type: "Polygon", coordinates: [ring(rectangle(-10, -10, 10, 10)), ring(rectangle(-3, -3, 3, 3))] } };
  const result = buildMappedGeometry(snapshot([feature("overlap", rectangle(-1, -1, 1, 1), 10), feature("unrelated-north", rectangle(-1, -30, 1, -28), 10), courtyard]), origin, [proposal([0, 0])]);
  assert.equal(result.hiddenBuildingPolygons, 1);
  assert.equal(result.buildingPolygons, 2);
  result.dispose();
});

test("a rotated proposal does not clear merely overlapping axis-aligned bounds", () => {
  const result = buildMappedGeometry(snapshot([feature("outside-diamond", rectangle(1.1, 1.1, 1.3, 1.3), 10), feature("inside-diamond", rectangle(-0.1, -0.1, 0.1, 0.1), 10)]), origin, [proposal([0, 0], 2, 2, Math.PI / 4)]);
  assert.equal(result.hiddenBuildingPolygons, 1);
  assert.equal(result.buildingPolygons, 1);
  result.dispose();
});

test("multipolygons preserve detached parts and clear only the part intersecting a proposal", () => {
  const result = buildMappedGeometry(snapshot([{ id: "multipart", kind: "building", height: 15, heightSource: "recorded", geometry: { type: "MultiPolygon", coordinates: [[ring(rectangle(-1, -1, 1, 1))], [ring(rectangle(20, 20, 22, 22))]] } }]), origin, [proposal([0, 0])]);
  assert.equal(result.hiddenBuildingPolygons, 1); assert.equal(result.buildingPolygons, 1);
  const roof = result.batches.find(batch => batch.kind === "roofs")!.geometry;
  near(roof.boundingBox!.min.x, 20); near(roof.boundingBox!.max.x, 22);
  result.dispose();
});

test("water, parks and road centerlines retain map coordinates without a site rotation", () => {
  const a = worldToGeographic([10, -20], origin), b = worldToGeographic([20, -30], origin);
  const result = buildMappedGeometry(snapshot([
    { id: "road", kind: "road", geometry: { type: "LineString", coordinates: [a, b] } },
    { id: "water", kind: "water", geometry: { type: "Polygon", coordinates: [ring(rectangle(30, -40, 40, -30))] } },
    { id: "park", kind: "park", geometry: { type: "Polygon", coordinates: [ring(rectangle(-40, 30, -30, 40))] } },
  ]), origin);
  assert.deepEqual(result.batches.map(batch => batch.kind), ["water", "parks", "roads"]);
  const road = result.batches.find(batch => batch.kind === "roads")!.geometry.getAttribute("position");
  assert.equal(road.count, 2); near(road.getX(0), 10); near(road.getZ(0), -20); near(road.getX(1), 20); near(road.getZ(1), -30);
  assert.ok(b[0] > a[0] && b[1] > a[1], "northeast must be +X, −Z");
  const [x, z] = geographicToWorld([origin.longitude, origin.latitude], origin); near(x, 0); near(z, 0);
  result.dispose();
});

test("large snapshots stay in at most six batches and owned geometry disposes once", () => {
  const features = Array.from({ length: 2000 }, (_, i) => feature(`building-${i}`, rectangle(i * 3 + 10, 10, i * 3 + 11, 11), 10));
  const builder = createMappedGeometryBuilder(snapshot(features), origin, []);
  builder.step(16); assert.equal(builder.complete, false); assert.throws(() => builder.finish(), /still being prepared/);
  while (!builder.complete) builder.step(32);
  const result = builder.finish();
  assert.equal(result.featureCount, 2000); assert.equal(result.buildingPolygons, 2000);
  assert.equal(result.batches.length, 2);
  const counts = result.batches.map(batch => { const count = { value: 0 }; batch.geometry.addEventListener("dispose", () => count.value++); return count; });
  result.dispose(); result.dispose(); assert.ok(counts.every(count => count.value === 1));
});

test("empty map data adds no synthetic buildings, parks, roads or water", () => {
  const result = buildMappedGeometry(snapshot([]), origin);
  assert.deepEqual(result.batches, []); assert.equal(result.featureCount, 0);
  result.dispose();
});
