import { test } from "node:test";
import assert from "node:assert/strict";
import { createMappedStreetPlacement, streetDetailFootprint, STREET_DETAIL_BUDGET } from "../../src/lib/mappedStreetPlacement";
import { worldToGeographic, type MapFeature, type MapSnapshot, type ProjectLocation } from "../../src/lib/geographicContext";
import type { PlanPoint } from "../../src/lib/tower";
import type { Building } from "../../src/types";

const origin: ProjectLocation = { latitude: 40.7, longitude: -74, label: "Test pin", example: true };
const rectangle = (x0: number, z0: number, x1: number, z1: number): PlanPoint[] => [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const ring = (points: PlanPoint[]) => [...points, points[0]].map(point => worldToGeographic(point, origin));
const polygon = (id: string, kind: "building"|"water", outer: PlanPoint[], holes: PlanPoint[][]=[]): MapFeature => ({ id, kind, geometry: { type: "Polygon", coordinates: [outer,...holes].map(ring) } });
const snapshot = (features: MapFeature[]): MapSnapshot => ({ id: "street-fixture", label: "Street fixture", capturedAt: "2026-10-02T00:00:00Z", bounds: [-74.1,40.6,-73.9,40.8], attribution: "Synthetic geometry", sourceUrl: "https://example.com", features });

test("street objects reject full footprint overlaps with buildings and water, not just their centres", () => {
  const guard=createMappedStreetPlacement(snapshot([
    polygon("building","building",rectangle(10,10,20,20)),
    polygon("water","water",rectangle(-20,-20,-10,-10)),
  ]),origin,[]);
  assert.equal(guard.isClear(streetDetailFootprint(15,15,1)),false);
  assert.equal(guard.isClear(streetDetailFootprint(9.5,15,2)),false,"centre on land but canopy crosses wall");
  assert.equal(guard.isClear(streetDetailFootprint(-9.5,-15,2)),false,"centre on land but vehicle crosses shoreline");
  assert.equal(guard.isClear(streetDetailFootprint(8,15,2)),true);
  assert.equal(guard.isClear(streetDetailFootprint(0,0,1)),true);
});

test("courtyards and islands are clear only when the whole detail stays inside the polygon hole", () => {
  for(const kind of ["building","water"] as const) {
    const guard=createMappedStreetPlacement(snapshot([polygon(kind,kind,rectangle(-10,-10,10,10),[rectangle(-3,-3,3,3)])]),origin,[]);
    assert.equal(guard.isClear(streetDetailFootprint(0,0,4)),true);
    assert.equal(guard.isClear(streetDetailFootprint(2.8,0,1)),false);
    assert.equal(guard.isClear(streetDetailFootprint(0,0,30)),false,"a detail surrounding an obstacle is still an overlap");
  }
});

test("rotated proposal outlines and multipolygon parts are respected without a circular exclusion zone", () => {
  const building={position:[0,0],floors:[{width:2,depth:2,rotationY:Math.PI/4,shape:{kind:"rect"}}]} as Building;
  const map=snapshot([{id:"multipart",kind:"building",geometry:{type:"MultiPolygon",coordinates:[[ring(rectangle(10,10,12,12))],[ring(rectangle(20,20,22,22))]]}}]);
  const guard=createMappedStreetPlacement(map,origin,[building]);
  assert.equal(guard.isClear(streetDetailFootprint(0,0,.1)),false);
  assert.equal(guard.isClear(streetDetailFootprint(1.2,1.2,.1)),true);
  assert.equal(guard.isClear(streetDetailFootprint(21,21,.5)),false);
  assert.equal(guard.isClear(streetDetailFootprint(11,11,.5)),false);
});

test("reserved details do not overlap one another or alter source-map clearance", () => {
  const guard=createMappedStreetPlacement(snapshot([]),origin,[]);
  const car=streetDetailFootprint(0,0,4.8,2.05,Math.PI/4);
  assert.equal(guard.reserve(car),true);
  assert.equal(guard.reserve(streetDetailFootprint(.5,.5,1)),false);
  assert.equal(guard.isClear(car),true,"occupation must not erase source roads");
  assert.equal(guard.reserve(streetDetailFootprint(20,20,1)),true);
  assert.equal(guard.isClear(streetDetailFootprint(220,0,2)),false);
  assert.equal(guard.isClear(streetDetailFootprint(Number.NaN,0,1)),false);
});

test("placement is deterministic and quality tiers keep cars sparse and low quality free of car draws", () => {
  const map=snapshot([polygon("water","water",rectangle(-2,-2,2,2))]);
  const candidates=Array.from({length:40},(_,i)=>streetDetailFootprint(i-20,5,1.2));
  const run=()=>{const guard=createMappedStreetPlacement(map,origin,[]);return candidates.map(candidate=>guard.reserve(candidate));};
  assert.deepEqual(run(),run());
  assert.equal(STREET_DETAIL_BUDGET.low.cars,0);
  assert.equal(STREET_DETAIL_BUDGET.high.cars,36);
  assert.ok(STREET_DETAIL_BUDGET.low.trees < STREET_DETAIL_BUDGET.medium.trees);
  assert.ok(STREET_DETAIL_BUDGET.medium.trees < STREET_DETAIL_BUDGET.high.trees);
  assert.ok(STREET_DETAIL_BUDGET.high.trees <=72);
});
