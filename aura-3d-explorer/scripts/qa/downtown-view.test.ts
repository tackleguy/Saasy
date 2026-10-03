import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import areas from "../../src/content/downtown-areas.json";
import { downtownCameraPose, downtownFarPlane, downtownNearPlane, downtownFogDensity, downtownWorldBounds, DOWNTOWN_MAX_DISTANCE, DOWNTOWN_SKY_SIZE } from "../../src/lib/downtownView";
import { geographicToWorld, type MapSnapshot, type ProjectLocation } from "../../src/lib/geographicContext";

const data = (id: string, bounds: number[]): MapSnapshot => ({ id, label: id, bounds: bounds as MapSnapshot["bounds"], capturedAt: "2026-10-02T00:00:00Z", attribution: "Test coverage", sourceUrl: "https://example.com/map", features: [] });
const pin = (bounds: number[]): ProjectLocation => ({ longitude: (bounds[0] + bounds[2]) / 2, latitude: (bounds[1] + bounds[3]) / 2, label: "Test pin", example: true });

test("every whole downtown fits phone and desktop frames clear of the title and presentation toolbar", () => {
  for (const area of areas) for (const [width, height] of [[390, 844], [768, 1024], [1280, 900], [1440, 1000], [1920, 1080]]) {
    const origin = pin(area.bounds);
    const bounds = downtownWorldBounds(data(area.id, [-1, -1, 1, 1]), origin)!;
    const pose = downtownCameraPose(bounds, width / height);
    const distance = Math.hypot(...pose.position.map((value, i) => value - pose.target[i]));
    const elevation = Math.asin((pose.position[1] - pose.target[1]) / distance) * 180 / Math.PI;
    assert.ok(elevation > 40 && elevation < 45, "whole-city composition must reveal streets and blocks rather than flattening them");
    const camera = new THREE.PerspectiveCamera(38, width / height, 2, downtownFarPlane(distance));
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
    assert.ok(distance < DOWNTOWN_MAX_DISTANCE, `${area.id} ${width}px must stay within orbit range`);
    for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
      const ndc = new THREE.Vector3(x, y, z).project(camera);
      assert.ok(Math.abs(ndc.x) <= .880001 && Math.abs(ndc.y) <= .880001, `${area.id} ${width}px clipped ${JSON.stringify(ndc)}`);
      const screenY = (1 - ndc.y) / 2;
      assert.ok(screenY * height >= 140, `${area.id} ${width}px overlaps the title`);
      assert.ok(screenY <= (width === 390 ? .700001 : .820001), `${area.id} ${width}px overlaps the presentation toolbar`);
      assert.ok(ndc.z > -1 && ndc.z < 1, `${area.id} must fit near and far clip planes`);
    }
    assert.ok(pose.position.every(value => Math.abs(value) < DOWNTOWN_SKY_SIZE / 2), `${area.id} camera escaped sky enclosure`);
  }
});

test("downtown bounds preserve project-relative geographic positions and use complete area coverage", () => {
  const area = areas.find(area => area.id === "jersey-city")!;
  const origin: ProjectLocation = { longitude: -74.034, latitude: 40.723, label: "Waterfront pin", example: true };
  const bounds = downtownWorldBounds(data(area.id, [-74.04, 40.72, -74.03, 40.73]), origin)!;
  const northwest = geographicToWorld([area.bounds[0], area.bounds[3]], origin), southeast = geographicToWorld([area.bounds[2], area.bounds[1]], origin);
  assert.equal(bounds.min[0], northwest[0]);
  assert.equal(bounds.min[2], northwest[1]);
  assert.equal(bounds.max[0], southeast[0]);
  assert.equal(bounds.max[2], southeast[1]);
  assert.ok(bounds.max[0] - bounds.min[0] > 2500);
  assert.ok(bounds.max[2] - bounds.min[2] > 3000);
  const pose = downtownCameraPose(bounds, 1.44);
  assert.notEqual(pose.target[0], 0, "the camera centres the complete downtown, not the project plot");
});

test("custom map coverage and unavailable maps have explicit finite camera fallbacks", () => {
  const coverage = [-118.28, 34.02, -118.22, 34.06], origin = pin(coverage);
  const bounds = downtownWorldBounds(data("custom-import", coverage), origin, 400)!;
  assert.equal(bounds.max[1], 400);
  assert.deepEqual(downtownCameraPose(bounds, NaN, Infinity), downtownCameraPose(bounds, 1, 38));
  assert.equal(downtownWorldBounds(null, origin), null);
});

test("near atmosphere and clipping stay unchanged while downtown visibility expands continuously", () => {
  for (const distance of [0, 20, 100, 320, 600]) assert.equal(downtownFogDensity(distance), .00075);
  assert.equal(downtownFarPlane(320), 5000);
  assert.equal(downtownFarPlane(600), 5000);
  assert.ok(Math.abs(downtownFarPlane(600.0001) - 5000) < .001);
  assert.equal(downtownFarPlane(NaN), 5000);
  assert.equal(downtownFogDensity(NaN), .00075);
  assert.ok(Math.abs(downtownFogDensity(600) - downtownFogDensity(600.0001)) < 1e-9);
  let previousDensity = .00075, previousFar = 5000;
  for (const distance of [1000, 3000, 10000, DOWNTOWN_MAX_DISTANCE]) {
    const density = downtownFogDensity(distance), far = downtownFarPlane(distance);
    assert.ok(density > 0 && density < previousDensity);
    assert.ok(far >= previousFar && far > distance * 2);
    assert.ok(far >= distance * 10 + 1500);
    assert.ok(Math.exp(-((density * far) ** 2)) < 1e-8, "ground reaches essentially complete haze before the far clip plane");
    // The city centre stays legible rather than disappearing into full haze.
    assert.ok(1 - Math.exp(-((density * distance) ** 2)) < .2);
    previousDensity = density; previousFar = far;
  }
});

test("city near planes improve depth precision while ground and near-building views stay conservative", () => {
  assert.equal(downtownNearPlane(100, 50), 1);
  assert.equal(downtownNearPlane(300, 100), 2);
  assert.equal(downtownNearPlane(12000, .5), .25);
  assert.equal(downtownNearPlane(12000, 200), 2);
  assert.equal(downtownNearPlane(NaN, 200), .1);
  for (const [distance, elevation] of [[5000, 1400], [12000, 3500], [30000, 8500]]) {
    const near = downtownNearPlane(distance, elevation);
    assert.ok(near >= 80);
    assert.ok(near <= (elevation - 280) * .1, "near plane uses only a fraction of air above the tallest supported mapped buildings");
    const depthStep = distance * distance / (2 ** 24 * near);
    assert.ok(depthStep < .4, "24-bit depth precision must remain sub-metre at the city centre");
  }
});
