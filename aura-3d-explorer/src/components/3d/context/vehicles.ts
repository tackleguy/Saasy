/**
 * Vehicle geometry — low-poly but properly shaped cars, built once per type.
 * -----------------------------------------------------------------------------
 * Each type is an extruded side profile (bevelled, with wheel arches cut in)
 * and splits into three geometries so one car costs three instanced draws:
 *
 *   body    — paint (instance colour) × vertex colour, so bumpers, sills and
 *             the taxi roof sign keep their own shade under any paint
 *   glass   — greenhouse / window bands, dark and reflective
 *   details — tyres with silver rims, headlights and tail lights (vertex colour)
 *
 * Modelled in metres (local +x = forward, +y = up, z = width) and scaled to
 * scene units (1 unit ≈ 3.57 m) at the end.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type VehicleType = "sedan" | "suv" | "compact" | "taxi" | "bus" | "decker";

export interface VehicleGeometry {
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  details: THREE.BufferGeometry;
  /** Length in scene units (for spacing). */
  length: number;
}

const M = 1 / 3.57;

/** Give a geometry a flat vertex colour and make it non-indexed (so parts merge). */
function paint(g: THREE.BufferGeometry, c: number | [number, number, number]) {
  const geo = g.index ? g.toNonIndexed() : g;
  const [r, gg, b] = typeof c === "number" ? [c, c, c] : c;
  const n = geo.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([r, gg, b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.clearGroups();
  return geo;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Extrude a side profile across `width`, centred on z = 0, with soft edges. */
function extrude(points: [number, number][], width: number, bevel = 0.07, arches: { x: number; y: number; r: number }[] = []) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) s.lineTo(x, y);
  // The profile ends at the rear bottom corner: run the bottom edge rear → front
  // with a semicircular arch over each wheel (π → 0 clockwise passes over the top).
  const y0 = points[points.length - 1][1];
  for (const a of [...arches].sort((p, q) => p.x - q.x)) {
    s.lineTo(a.x - a.r, y0);
    s.absarc(a.x, y0, a.r, Math.PI, 0, true);
  }
  s.closePath();
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Four wheels: dark tyre with a silver rim poking out both sides. */
function wheels(xs: number[], track: number, r: number, tyreW = 0.24) {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of xs) {
    for (const side of [-1, 1]) {
      const z = side * (track / 2);
      parts.push(paint(new THREE.CylinderGeometry(r, r, tyreW, 16).rotateX(Math.PI / 2).translate(x, r, z), 0.07));
      parts.push(paint(new THREE.CylinderGeometry(r * 0.62, r * 0.62, tyreW + 0.02, 12).rotateX(Math.PI / 2).translate(x, r, z), 0.72));
    }
  }
  return parts;
}

/** Head- and tail-light pairs at the car's nose and tail. */
function lights(front: number, rear: number, y: number, half: number, size = 0.18) {
  const out: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    out.push(paint(box(0.06, size * 0.6, size * 1.6, front, y, side * (half - size)), [1, 0.97, 0.88]));
    out.push(paint(box(0.06, size * 0.6, size * 1.8, rear, y, side * (half - size)), [0.75, 0.05, 0.04]));
  }
  return out;
}

function finish(body: THREE.BufferGeometry[], glass: THREE.BufferGeometry[], details: THREE.BufferGeometry[], length: number): VehicleGeometry {
  const merge = (parts: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(parts.map((p) => (p.getAttribute("color") ? p : paint(p, 1))), false)!;
    g.scale(M, M, M);
    g.computeBoundingSphere();
    parts.forEach((p) => p.dispose());
    return g;
  };
  return { body: merge(body), glass: merge(glass), details: merge(details), length: length * M };
}

/* ------------------------------------------------------------------ types */

function sedan(taxi: boolean): VehicleGeometry {
  const W = 1.82;
  const arch = [{ x: 1.38, y: 0, r: 0.4 }, { x: -1.42, y: 0, r: 0.4 }];
  const lower = extrude(
    [[2.3, 0.34], [2.36, 0.56], [2.22, 0.76], [1.25, 0.9], [-1.3, 0.94], [-2.2, 0.9], [-2.34, 0.62], [-2.3, 0.34]],
    W,
    0.08,
    arch.map((a) => ({ ...a, y: 0.34 }))
  );
  const roof = extrude([[0.48, 1.37], [0.42, 1.44], [-0.74, 1.44], [-0.8, 1.36]], W - 0.28, 0.04);
  const body: THREE.BufferGeometry[] = [
    paint(lower, 1),
    paint(roof, 1),
    paint(box(0.12, 0.2, W - 0.1, 2.33, 0.42, 0), 0.22), // front bumper
    paint(box(0.12, 0.2, W - 0.1, -2.33, 0.42, 0), 0.22), // rear bumper
    paint(box(1.9, 0.08, W + 0.01, -0.02, 0.4, 0), 0.25), // sills
  ];
  if (taxi) body.push(paint(box(0.3, 0.16, 0.9, -0.2, 1.54, 0), [1.15, 1.15, 1.1]), paint(box(0.32, 0.03, 0.92, -0.2, 1.46, 0), 0.25));
  const glass = [extrude([[1.28, 0.9], [0.5, 1.37], [-0.8, 1.37], [-1.34, 0.93]], W - 0.24, 0.03)];
  const details = [...wheels([1.38, -1.42], W - 0.2, 0.33), ...lights(2.36, -2.36, 0.68, W / 2)];
  return finish(body, glass, details, 4.7);
}

function suv(): VehicleGeometry {
  const W = 1.95;
  const lower = extrude(
    [[2.35, 0.42], [2.42, 0.78], [2.25, 1.02], [1.45, 1.12], [-2.25, 1.14], [-2.38, 0.9], [-2.38, 0.42]],
    W,
    0.09,
    [{ x: 1.45, y: 0.42, r: 0.46 }, { x: -1.5, y: 0.42, r: 0.46 }]
  );
  const roof = extrude([[0.95, 1.74], [0.9, 1.82], [-2.2, 1.82], [-2.28, 1.72]], W - 0.24, 0.05);
  const body = [
    paint(lower, 1),
    paint(roof, 1),
    paint(extrude([[-2.2, 1.14], [-2.18, 1.74], [-2.3, 1.74], [-2.38, 1.14]], W - 0.2, 0.04), 1), // tailgate pillar
    paint(box(0.14, 0.28, W - 0.08, 2.4, 0.55, 0), 0.2),
    paint(box(0.14, 0.28, W - 0.08, -2.4, 0.55, 0), 0.2),
    paint(box(2.1, 0.12, W + 0.02, 0, 0.5, 0), 0.2),
    paint(box(2.6, 0.04, 0.06, -0.6, 1.86, 0.62), 0.3), // roof rails
    paint(box(2.6, 0.04, 0.06, -0.6, 1.86, -0.62), 0.3),
  ];
  const glass = [extrude([[1.5, 1.12], [0.95, 1.74], [-2.18, 1.74], [-2.2, 1.14]], W - 0.2, 0.03)];
  const details = [...wheels([1.45, -1.5], W - 0.18, 0.39, 0.28), ...lights(2.43, -2.4, 0.9, W / 2)];
  return finish(body, glass, details, 4.8);
}

function compact(): VehicleGeometry {
  const W = 1.76;
  const lower = extrude(
    [[1.95, 0.34], [2.02, 0.6], [1.85, 0.82], [1.05, 0.95], [-1.8, 1.0], [-1.98, 0.8], [-1.98, 0.34]],
    W,
    0.1,
    [{ x: 1.25, y: 0.34, r: 0.38 }, { x: -1.3, y: 0.34, r: 0.38 }]
  );
  const roof = extrude([[0.22, 1.46], [0.16, 1.53], [-1.7, 1.53], [-1.78, 1.44]], W - 0.26, 0.05);
  const body = [
    paint(lower, 1),
    paint(roof, 1),
    paint(extrude([[-1.72, 1.0], [-1.7, 1.46], [-1.82, 1.46], [-1.9, 1.0]], W - 0.22, 0.03), 1),
    paint(box(0.12, 0.2, W - 0.1, 2.0, 0.44, 0), 0.22),
    paint(box(0.12, 0.2, W - 0.1, -2.0, 0.44, 0), 0.22),
  ];
  const glass = [extrude([[1.1, 0.95], [0.22, 1.46], [-1.72, 1.46], [-1.74, 1.0]], W - 0.22, 0.03)];
  const details = [...wheels([1.25, -1.3], W - 0.2, 0.31), ...lights(2.03, -2.0, 0.72, W / 2, 0.16)];
  return finish(body, glass, details, 4.0);
}

function bus(decker: boolean): VehicleGeometry {
  const W = 2.55;
  const L = decker ? 11 : 12;
  const H = decker ? 4.35 : 3.1;
  const half = L / 2;
  const lower = extrude(
    [[half, 0.35], [half + 0.05, H - 0.25], [half - 0.25, H], [-half + 0.15, H], [-half, H - 0.2], [-half, 0.35]],
    W,
    0.1,
    [{ x: half - 2.4, y: 0.35, r: 0.55 }, { x: -half + 2.8, y: 0.35, r: 0.55 }]
  );
  const body = [paint(lower, 1), paint(box(0.14, 0.35, W - 0.1, half + 0.06, 0.5, 0), 0.25), paint(box(0.14, 0.35, W - 0.1, -half - 0.02, 0.5, 0), 0.25)];
  if (!decker) body.push(paint(box(L * 0.35, 0.3, W * 0.7, -1, H + 0.14, 0), 0.9)); // roof-mounted AC pod
  // Window bands stand slightly proud of the body so they read from the side.
  const band = (y0: number, y1: number, x0: number, x1: number) => box(x1 - x0, y1 - y0, W + 0.04, (x0 + x1) / 2, (y0 + y1) / 2, 0);
  const glass = decker
    ? [band(1.25, 2.05, -half + 0.4, half - 0.2), band(2.7, 3.7, -half + 0.3, half - 0.15), box(0.06, 1.4, W - 0.3, half + 0.08, 1.55, 0)]
    : [band(1.2, 2.55, -half + 0.4, half - 0.3), box(0.06, 1.7, W - 0.3, half + 0.08, 1.75, 0)];
  const details = [...wheels([half - 2.4, -half + 2.8], W - 0.3, 0.5, 0.32), ...lights(half + 0.08, -half - 0.02, 0.75, W / 2, 0.2)];
  return finish(body, glass, details, L);
}

const cache = new Map<VehicleType, VehicleGeometry>();

export function vehicleGeometry(type: VehicleType): VehicleGeometry {
  let g = cache.get(type);
  if (!g) {
    g = type === "sedan" ? sedan(false) : type === "taxi" ? sedan(true) : type === "suv" ? suv() : type === "compact" ? compact() : bus(type === "decker");
    cache.set(type, g);
  }
  return g;
}
