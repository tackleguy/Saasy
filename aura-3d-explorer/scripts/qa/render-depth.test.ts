import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { exteriorNearPlane, MAP_RENDER_ORDER, MAP_SURFACE_DEPTH } from "../../src/lib/renderDepth";

/** Float depth attachments also lose precision near 1.0 with a perspective
 * projection. Match the composer's FloatType depth and WebGL camera transform. */
function storedDepth(distance: number, near: number) {
  const camera = new THREE.PerspectiveCamera(38, 1, near, 5000);
  const ndc = new THREE.Vector3(0, 0, -distance).applyMatrix4(camera.projectionMatrix).z;
  return Math.fround((ndc + 1) / 2);
}

test("exterior camera separates close facade surfaces across the full overview orbit range", () => {
  let originalCollisions = 0;
  for (let distance = 80; distance <= 320; distance += .5) {
    // A 0.01 world-unit offset is 3.6 cm at the renderer's metre scale.
    if (storedDepth(distance, .1) === storedDepth(distance - .01, .1)) originalCollisions++;
    const near = exteriorNearPlane(distance, distance * .6);
    assert.ok(storedDepth(distance - .01, near) < storedDepth(distance, near), `distinct depth at ${distance}`);
  }
  assert.ok(originalCollisions > 100, "fixture reproduces the original facade depth collision");
});

test("near-plane precision remains conservative at street level and minimum zoom", () => {
  assert.equal(exteriorNearPlane(320, 100), 2);
  assert.equal(exteriorNearPlane(320, .35), .175);
  assert.equal(exteriorNearPlane(2, 100), .1);
  assert.equal(exteriorNearPlane(12, 60), .12);
  for (const distance of [-10, 0, 2, 100, 320, 10000, Number.NaN, Infinity]) {
    for (const height of [-10, 0, .35, 10, 10000, Number.NaN, Infinity]) {
      const near = exteriorNearPlane(distance, height);
      assert.ok(Number.isFinite(near) && near >= .1 && near <= 2);
    }
  }
});

test("map ground decals remain deterministic even when all surface depths round to the same value", () => {
  const layers = ["ground", "water", "parks", "footprints", "roads", "paving", "street", "markings"] as const;
  for (let i = 1; i < layers.length; i++) {
    assert.ok(MAP_RENDER_ORDER[layers[i - 1]] < MAP_RENDER_ORDER[layers[i]]);
  }
  assert.ok(MAP_RENDER_ORDER.markings < MAP_RENDER_ORDER.walls);
  assert.ok(MAP_RENDER_ORDER.markings < MAP_RENDER_ORDER.roofs);
  const overlay = new THREE.MeshStandardMaterial(MAP_SURFACE_DEPTH);
  assert.equal(overlay.depthTest, false, "ground cannot reject a map overlay after depth quantization");
  assert.equal(overlay.depthWrite, false, "overlays cannot reject later buildings or each other");
  assert.equal(overlay.transparent, false, "all map layers must render in the ordered opaque pass before buildings");
  overlay.dispose();
});
