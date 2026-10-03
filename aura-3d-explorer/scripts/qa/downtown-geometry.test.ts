import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createDowntownGeometryBuilder } from "../../src/lib/downtownGeometry";
import { buildMappedGeometry, type MappedGeometry } from "../../src/lib/mappedGeometry";
import { worldToGeographic, type MapFeature, type MapSnapshot, type ProjectLocation } from "../../src/lib/geographicContext";
import type { Building } from "../../src/types";

const origin: ProjectLocation = { latitude: 40.7128, longitude: -74.006, label: "Test downtown", example: true };
const ring = (points: [number, number][]) => [...points, points[0]].map(point => worldToGeographic(point, origin));
const box = (x: number, z: number, width = 10, depth = 10) => ring([[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]);
const building = (i: number): MapFeature => ({ id: `source-building-${i}`, kind: "building", height: 12 + i % 100, minHeight: i % 7 === 0 ? 4 : 0, heightSource: "recorded", geometry: { type: "Polygon", coordinates: [box((i % 100) * 15, Math.floor(i / 100) * 15)] } });
const snapshot = (features: MapFeature[]): MapSnapshot => ({ id: "downtown-fixture", label: "Downtown fixture", bounds: [-74.1, 40.6, -73.9, 40.8], capturedAt: "2026-10-02T00:00:00Z", attribution: "Synthetic test geometry", sourceUrl: "https://example.com/geometry", features });
const prepare = (data: MapSnapshot, buildings: Building[] = [], chunk = 64) => {
  const builder = createDowntownGeometryBuilder(data, origin, buildings);
  while (!builder.complete) builder.step(chunk);
  return builder.finish();
};
const bytes = (result: MappedGeometry) => result.batches.reduce((total, { geometry }) => total + Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + (geometry.index?.array.byteLength ?? 0), 0);
const expanded = (geometry: THREE.BufferGeometry, name: string) => {
  const attribute = geometry.getAttribute(name);
  const result: number[] = [];
  for (let i = 0; i < (geometry.index?.count ?? attribute.count); i++) {
    const vertex = geometry.index ? geometry.index.getX(i) : i;
    for (let component = 0; component < attribute.itemSize; component++) result.push(attribute.array[vertex * attribute.itemSize + component]);
  }
  return result;
};

test("downtown indexing preserves every source triangle, hole, height and facade identity across chunks", () => {
  const features: MapFeature[] = [
    ...Array.from({ length: 140 }, (_, i) => building(i)),
    { ...building(1000), id: "courtyard", geometry: { type: "Polygon", coordinates: [box(-40, -40, 20, 20), box(-35, -35, 10, 10)] } },
    { ...building(1001), id: "unknown", heightSource: "unknown" },
    { id: "water", kind: "water", geometry: { type: "Polygon", coordinates: [box(-100, 0, 30, 90), box(-90, 10, 5, 5)] } },
    { id: "park", kind: "park", geometry: { type: "MultiPolygon", coordinates: [[box(0, -100)], [box(40, -100)]] } },
    { id: "street", kind: "road", geometry: { type: "LineString", coordinates: [[0, -10], [10, -10], [20, -10]].map(point => worldToGeographic(point as [number, number], origin)) } },
  ];
  const data = snapshot(features), before = JSON.stringify(data);
  const baseline = buildMappedGeometry(data, origin), compact = prepare(data);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(compact.batches.map(batch => batch.kind), baseline.batches.map(batch => batch.kind));
  assert.equal(compact.batches.length, 6);
  assert.equal(compact.featureCount, features.length);
  assert.equal(compact.buildingPolygons, baseline.buildingPolygons);
  assert.equal(compact.unknownHeightFootprints, 1);
  for (let i = 0; i < baseline.batches.length; i++) {
    const original = baseline.batches[i].geometry, result = compact.batches[i].geometry;
    for (const name of Object.keys(original.attributes).filter(name => name !== "normal")) assert.deepEqual(expanded(result, name), expanded(original, name), `${compact.batches[i].kind}:${name}`);
    assert.ok(result.boundingBox!.equals(original.boundingBox!));
    const position = result.getAttribute("position");
    for (let vertex = 0; vertex < position.count; vertex++) assert.ok(result.boundingSphere!.containsPoint(new THREE.Vector3().fromBufferAttribute(position, vertex)));
  }
  baseline.dispose(); compact.dispose();
});

test("quantized distant normals stay within 0.4 degrees of their original face directions", () => {
  const features = Array.from({ length: 128 }, (_, i): MapFeature => {
    const angle = i * Math.PI / 127, c = Math.cos(angle), s = Math.sin(angle);
    const shape = (half: number) => ring(([[0, 0], [half, 0], [half, half], [0, half]] as [number, number][]).map(([x, z]) => [x * c - z * s + i * 20, x * s + z * c]));
    return { ...building(i), geometry: { type: "Polygon", coordinates: [shape(10)] } };
  });
  const data = snapshot(features), baseline = buildMappedGeometry(data, origin), compact = prepare(data);
  for (let b = 0; b < baseline.batches.length; b++) {
    const original = baseline.batches[b].geometry.getAttribute("normal"), geometry = compact.batches[b].geometry, normal = geometry.getAttribute("normal");
    assert.ok(normal.array instanceof Int8Array);
    assert.equal(normal.normalized, true);
    for (let i = 0; i < original.count; i++) {
      const vertex = geometry.index ? geometry.index.getX(i) : i;
      const a = new THREE.Vector3().fromBufferAttribute(original, i).normalize(), b = new THREE.Vector3().fromBufferAttribute(normal, vertex).normalize();
      assert.ok(a.angleTo(b) * 180 / Math.PI < 0.4);
    }
  }
  assert.ok(bytes(compact) < bytes(baseline) * 0.65, `${bytes(compact)} should save at least 35% of ${bytes(baseline)}`);
  baseline.dispose(); compact.dispose();
});

test("large merged batches use 32-bit indices without wrapping or dropping buildings", () => {
  const data = snapshot(Array.from({ length: 4500 }, (_, i) => building(i)));
  const result = prepare(data, [], 128);
  assert.equal(result.buildingPolygons, 4500);
  const walls = result.batches.find(batch => batch.kind === "walls")!.geometry;
  assert.ok(walls.getAttribute("position").count > 65535);
  assert.ok(walls.index!.array instanceof Uint32Array);
  let max = 0;
  for (const index of walls.index!.array) max = Math.max(max, index);
  assert.equal(max, walls.getAttribute("position").count - 1);
  assert.ok(walls.boundingBox!.max.z >= 670);
  result.dispose();
});

test("custom projects clear exact proposal intersections outside the near snapshot", () => {
  const data = snapshot(Array.from({ length: 160 }, (_, i) => building(i)));
  const proposal = { position: [300, 0], floors: [{ width: 2, depth: 2, rotationY: 0, shape: { kind: "rect" } }] } as Building;
  const baseline = buildMappedGeometry(data, origin, [proposal]), compact = prepare(data, [proposal]);
  assert.equal(compact.hiddenBuildingPolygons, 1);
  assert.equal(compact.buildingPolygons, 159);
  for (const { kind, geometry } of compact.batches) assert.deepEqual(expanded(geometry, "position"), expanded(baseline.batches.find(batch => batch.kind === kind)!.geometry, "position"));
  baseline.dispose(); compact.dispose();
});

test("cancellation releases partially prepared geometry once and prevents use afterward", t => {
  const disposed = new Map<THREE.BufferGeometry, number>();
  const original = THREE.BufferGeometry.prototype.dispose;
  t.mock.method(THREE.BufferGeometry.prototype, "dispose", function (this: THREE.BufferGeometry) { disposed.set(this, (disposed.get(this) ?? 0) + 1); original.call(this); });
  const builder = createDowntownGeometryBuilder(snapshot(Array.from({ length: 1000 }, (_, i) => building(i))), origin);
  builder.step(); builder.step();
  assert.equal(builder.complete, false);
  assert.throws(() => builder.finish(), /still being prepared/);
  builder.cancel(); builder.cancel();
  assert.equal(builder.complete, true);
  assert.equal(builder.cancelled, true);
  assert.ok(disposed.size > 0);
  assert.ok([...disposed.values()].every(count => count === 1));
  assert.throws(() => builder.step(), /cancelled/);
  assert.throws(() => builder.finish(), /cancelled/);
});

test("finished geometry transfers disposal ownership and empty maps create no synthetic context", () => {
  const builder = createDowntownGeometryBuilder(snapshot([building(0)]), origin);
  assert.throws(() => builder.step(0), /positive integer/);
  assert.throws(() => builder.step(Infinity), /positive integer/);
  while (!builder.complete) builder.step();
  const result = builder.finish();
  assert.equal(builder.finish(), result);
  let count = 0;
  result.batches.forEach(batch => batch.geometry.addEventListener("dispose", () => count++));
  builder.cancel();
  assert.equal(count, 0);
  result.dispose(); result.dispose();
  assert.equal(count, result.batches.length);
  const empty = prepare(snapshot([]));
  assert.deepEqual(empty.batches, []);
  assert.equal(empty.featureCount, 0);
  empty.dispose();
});
