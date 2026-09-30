/**
 * Facade geometry builders — pure Three.js, cached by shape key.
 * -----------------------------------------------------------------------------
 *   • arcadePanel   — a stone wall with a row of round-headed arches cut from
 *                     its bottom edge (for the podium "Broadway" arcade).
 *   • balconyBand   — a horizontal slab ring with rounded corners around a
 *                     plate (the "Seaform" curved balcony bands).
 *   • balustrade    — a thin glass ring standing on that band.
 *   • finMatrices   — instance transforms for vertical fins / mullions on all
 *                     four faces of a plate.
 *   • liftDoors     — six lift-door panels on the core, merged.
 *   • plateEdges    — outline used for the hover / selection highlight.
 *
 * Shaped plates (any PlanShape other than rect — the rect path above is left
 * untouched so rectangular towers render exactly as before):
 *   • plateSolid          — the plan outline (offset in/out) extruded upwards:
 *                           slab and curtain wall.
 *   • plateFloor          — flat outline for the ceiling / interior finish.
 *   • shapedBand /
 *     shapedBalustrade    — balcony ring + glass rail following the outline.
 *   • outlineFinMatrices  — fins / mullions walked along the perimeter at a
 *                           fixed spacing, one at every sharp corner, each
 *                           turned to face its edge's outward normal.
 *   • arcadeSpans         — straight runs long enough for an arched arcade.
 *   • shapedEdges         — hover / selection outline of a shaped plate.
 */
import * as THREE from "three";
import type { PlanShape } from "@/types";
import { edgeNormal, offsetOutline, planOutline, type PlanPoint } from "@/lib/tower";

const cache = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

/**
 * Extrude a 2D shape upwards: ExtrudeGeometry extrudes along +Z, so rotate
 * −90° about X, which maps shape (x, y) → world (x, depth, −y).
 */
function extrudeUp(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Rounded rectangle centred on the origin. */
function roundedRect(path: THREE.Shape | THREE.Path, w: number, d: number, r: number) {
  const x = w / 2;
  const y = d / 2;
  r = Math.min(r, x, y);
  path.moveTo(-x + r, -y);
  path.lineTo(x - r, -y);
  path.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x, y - r);
  path.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  path.lineTo(-x + r, y);
  path.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(-x, -y + r);
  path.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

/**
 * Stone arcade panel, width × height × thickness, lying in the XY plane
 * (thickness along +Z, base at y = 0, centred on x = 0).
 *
 * Arches are notches cut up from the bottom edge, so the outline is a single
 * simple polygon (ShapeGeometry holes can't touch the boundary): walk along
 * the base, and at each arch go up the jamb, round the semicircular head
 * (clockwise, from 180° to 0°) and back down.
 */
export function arcadePanel(width: number, height: number, thickness: number): THREE.BufferGeometry {
  return cached(`arcade:${width}:${height}:${thickness}`, () => {
    const count = Math.max(3, Math.round(width / 2.3));
    const pitch = width / count;
    const opening = pitch * 0.64;
    const r = opening / 2;
    const spring = Math.min(height * 0.58, height - r - 0.12);

    const s = new THREE.Shape();
    s.moveTo(-width / 2, 0);
    for (let i = 0; i < count; i++) {
      const cx = -width / 2 + pitch * (i + 0.5);
      s.lineTo(cx - r, 0);
      s.lineTo(cx - r, spring);
      s.absarc(cx, spring, r, Math.PI, 0, true);
      s.lineTo(cx + r, 0);
    }
    s.lineTo(width / 2, 0);
    s.lineTo(width / 2, height);
    s.lineTo(-width / 2, height);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 16 });
  });
}

/** Horizontal balcony slab ring with rounded outer corners (thickness t). */
export function balconyBand(w: number, d: number, overhang: number, t: number): THREE.BufferGeometry {
  return cached(`band:${w}:${d}:${overhang}:${t}`, () => {
    const outer = roundedRect(new THREE.Shape(), w + overhang * 2, d + overhang * 2, overhang * 2.2) as THREE.Shape;
    const hole = new THREE.Path();
    hole.moveTo(-w / 2 + 0.01, -d / 2 + 0.01);
    hole.lineTo(-w / 2 + 0.01, d / 2 - 0.01);
    hole.lineTo(w / 2 - 0.01, d / 2 - 0.01);
    hole.lineTo(w / 2 - 0.01, -d / 2 + 0.01);
    hole.closePath();
    outer.holes.push(hole);
    return extrudeUp(outer, t);
  });
}

/** Thin glass balustrade ring standing on the balcony band edge. */
export function balustrade(w: number, d: number, overhang: number, h: number): THREE.BufferGeometry {
  return cached(`balus:${w}:${d}:${overhang}:${h}`, () => {
    const ow = w + overhang * 2;
    const od = d + overhang * 2;
    const outer = roundedRect(new THREE.Shape(), ow, od, overhang * 2.2) as THREE.Shape;
    const inner = roundedRect(new THREE.Path(), ow - 0.04, od - 0.04, overhang * 2.2 - 0.02);
    outer.holes.push(inner);
    return extrudeUp(outer, h);
  });
}

/**
 * Instance matrices for vertical fins around a w × d plate.
 * Each fin is a unit box scaled to (thickness, height, depth), placed on the
 * glass line and projecting `depth` outwards, every `spacing` units.
 */
export function finMatrices(w: number, d: number, y0: number, h: number, spacing: number, thickness: number, depth: number): THREE.Matrix4[] {
  return cached(`fins:${w}:${d}:${y0}:${h}:${spacing}:${thickness}:${depth}`, () => {
    const out: THREE.Matrix4[] = [];
    const q0 = new THREE.Quaternion();
    const q90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const scale = new THREE.Vector3(thickness, h, depth);
    const y = y0 + h / 2;
    const off = depth / 2 - 0.01;
    // Faces along X (±Z)
    for (let t = -w / 2; t <= w / 2 + 1e-3; t += spacing) {
      out.push(new THREE.Matrix4().compose(new THREE.Vector3(t, y, d / 2 + off), q0, scale));
      out.push(new THREE.Matrix4().compose(new THREE.Vector3(t, y, -d / 2 - off), q0, scale));
    }
    // Faces along Z (±X), corners already covered
    for (let t = -d / 2 + spacing; t < d / 2 - 1e-3; t += spacing) {
      out.push(new THREE.Matrix4().compose(new THREE.Vector3(w / 2 + off, y, t), q90, scale));
      out.push(new THREE.Matrix4().compose(new THREE.Vector3(-w / 2 - off, y, t), q90, scale));
    }
    return out;
  });
}

/** Three lift doors on each of two opposite core faces, merged into one geometry. */
export function liftDoors(core: number, y0: number, doorH: number, skipMain = false): THREE.BufferGeometry {
  return cached(`doors:${core}:${y0}:${doorH}:${skipMain}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const sz of [-1, 1]) {
      for (const x of [-core * 0.28, 0, core * 0.28]) {
        // The walk-in lift (middle of +Z) is modelled separately by LiftCore.
        if (skipMain && sz === 1 && x === 0) continue;
        const g = new THREE.BoxGeometry(core * 0.2, doorH, 0.012);
        g.translate(x, y0 + doorH / 2, sz * (core / 2 + 0.006));
        parts.push(g);
      }
    }
    const positions: number[] = [];
    const indices: number[] = [];
    for (const g of parts) {
      const offset = positions.length / 3;
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) positions.push(p.getX(i), p.getY(i), p.getZ(i));
      const idx = g.getIndex()!;
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  });
}

/** Outline of a plate volume, for the hover / selection highlight. */
export function plateEdges(w: number, d: number, y0: number, h: number): THREE.BufferGeometry {
  return cached(`edges:${w}:${d}:${y0}:${h}`, () => {
    const box = new THREE.BoxGeometry(w, h, d);
    box.translate(0, y0 + h / 2, 0);
    const e = new THREE.EdgesGeometry(box);
    box.dispose();
    return e;
  });
}

/** Shared unit box for instanced fins. */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/* ------------------------------------------------------------ shaped plates */

const shapeKey = (shape: PlanShape, w: number, d: number) => `${shape.kind}:${shape.amount ?? ""}:${w}:${d}`;

/** Plan outline offset by `offset` (outwards > 0). */
const outline = (shape: PlanShape, w: number, d: number, offset: number): PlanPoint[] => offsetOutline(planOutline(shape, w, d), offset);

/** Plan points → THREE.Shape. Plan z is stored as −y so `extrudeUp` maps it back to world +z. */
function toThreeShape(pts: PlanPoint[], target: THREE.Shape | THREE.Path = new THREE.Shape()) {
  pts.forEach(([x, z], i) => (i === 0 ? target.moveTo(x, -z) : target.lineTo(x, -z)));
  target.closePath();
  return target;
}

/** Outline offset by `offset`, extruded from y = 0 to y = h. */
export function plateSolid(shape: PlanShape, w: number, d: number, offset: number, h: number): THREE.BufferGeometry {
  return cached(`solid:${shapeKey(shape, w, d)}:${offset}:${h}`, () => extrudeUp(toThreeShape(outline(shape, w, d, offset)) as THREE.Shape, h));
}

/** Flat, upward-facing outline at y = 0 with UVs normalised to the bounding box (like a plane). */
export function plateFloor(shape: PlanShape, w: number, d: number, offset: number): THREE.BufferGeometry {
  return cached(`floor:${shapeKey(shape, w, d)}:${offset}`, () => {
    const g = new THREE.ShapeGeometry(toThreeShape(outline(shape, w, d, offset)) as THREE.Shape);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, 0.5 - p.getZ(i) / d);
    uv.needsUpdate = true;
    return g;
  });
}

/** Balcony slab ring following the outline (overhang outwards, thickness t). */
export function shapedBand(shape: PlanShape, w: number, d: number, overhang: number, t: number): THREE.BufferGeometry {
  return cached(`sband:${shapeKey(shape, w, d)}:${overhang}:${t}`, () => {
    const outer = toThreeShape(outline(shape, w, d, overhang)) as THREE.Shape;
    outer.holes.push(toThreeShape(outline(shape, w, d, -0.01), new THREE.Path()) as THREE.Path);
    return extrudeUp(outer, t);
  });
}

/** Thin glass balustrade on the balcony edge. */
export function shapedBalustrade(shape: PlanShape, w: number, d: number, overhang: number, h: number): THREE.BufferGeometry {
  return cached(`sbalus:${shapeKey(shape, w, d)}:${overhang}:${h}`, () => {
    const outer = toThreeShape(outline(shape, w, d, overhang)) as THREE.Shape;
    outer.holes.push(toThreeShape(outline(shape, w, d, overhang - 0.02), new THREE.Path()) as THREE.Path);
    return extrudeUp(outer, h);
  });
}

/** Corners turning more than this get their own fin. */
const SHARP = (25 * Math.PI) / 180;

/**
 * Instance matrices for fins / mullions along a shaped plate's perimeter
 * (glass line = the outline). Same unit-box convention as `finMatrices`:
 * scaled (thickness, h, depth), local +Z turned to the outward normal.
 */
export function outlineFinMatrices(shape: PlanShape, w: number, d: number, y0: number, h: number, spacing: number, thickness: number, depth: number): THREE.Matrix4[] {
  return cached(`sfins:${shapeKey(shape, w, d)}:${y0}:${h}:${spacing}:${thickness}:${depth}`, () => {
    const pts = planOutline(shape, w, d);
    const n = pts.length;
    const out: THREE.Matrix4[] = [];
    const scale = new THREE.Vector3(thickness, h, depth);
    const up = new THREE.Vector3(0, 1, 0);
    const y = y0 + h / 2;
    const off = depth / 2 - 0.01;
    const push = (x: number, z: number, nx: number, nz: number) => {
      const q = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(nx, nz));
      out.push(new THREE.Matrix4().compose(new THREE.Vector3(x + nx * off, y, z + nz * off), q, scale));
    };
    const normals = pts.map((p, i) => edgeNormal(p[0], p[1], pts[(i + 1) % n][0], pts[(i + 1) % n][1]));
    const sharp = pts.map((_, i) => {
      const a = normals[(i + n - 1) % n];
      const b = normals[i];
      return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) > SHARP;
    });
    // Distance walked since the last fin; start "due" so smooth outlines get a fin at vertex 0.
    let acc = sharp[0] ? 0 : spacing;
    for (let i = 0; i < n; i++) {
      const [px, pz] = pts[i];
      const [qx, qz] = pts[(i + 1) % n];
      if (sharp[i]) {
        const a = normals[(i + n - 1) % n];
        const b = normals[i];
        const bl = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
        push(px, pz, (a[0] + b[0]) / bl, (a[1] + b[1]) / bl);
        acc = 0;
      }
      const len = Math.hypot(qx - px, qz - pz);
      if (len < 1e-6) continue;
      const dx = (qx - px) / len;
      const dz = (qz - pz) / len;
      // Leave room before a sharp corner so fins don't bunch up against it.
      const stop = sharp[(i + 1) % n] ? len - spacing * 0.4 : len - 1e-4;
      let pos = spacing - acc;
      let last = -acc;
      for (; pos <= stop; pos += spacing) {
        push(px + dx * pos, pz + dz * pos, normals[i][0], normals[i][1]);
        last = pos;
      }
      acc = len - last;
    }
    return out;
  });
}

/** Straight outline runs long enough to carry an arcade panel. */
export interface ArcadeSpan {
  /** Midpoint of the run, pulled `inset` inwards (plan x, z). */
  x: number;
  z: number;
  /** Rotation about Y turning the panel's +Z to the outward normal. */
  rot: number;
  length: number;
}

export function arcadeSpans(shape: PlanShape, w: number, d: number, inset: number, minLength = 2.5): ArcadeSpan[] {
  return cached(`spans:${shapeKey(shape, w, d)}:${inset}:${minLength}`, () => {
    if (shape.kind === "ellipse") return [];
    const pts = planOutline(shape, w, d);
    const spans: ArcadeSpan[] = [];
    pts.forEach(([ax, az], i) => {
      const [bx, bz] = pts[(i + 1) % pts.length];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < minLength) return;
      const [nx, nz] = edgeNormal(ax, az, bx, bz);
      spans.push({ x: (ax + bx) / 2 - nx * inset, z: (az + bz) / 2 - nz * inset, rot: Math.atan2(nx, nz), length });
    });
    return spans;
  });
}

/** Hover / selection outline of a shaped plate volume (feature edges only). */
export function shapedEdges(shape: PlanShape, w: number, d: number, offset: number, y0: number, h: number): THREE.BufferGeometry {
  return cached(`sedges:${shapeKey(shape, w, d)}:${offset}:${y0}:${h}`, () => {
    const solid = extrudeUp(toThreeShape(outline(shape, w, d, offset)) as THREE.Shape, h);
    solid.translate(0, y0, 0);
    const e = new THREE.EdgesGeometry(solid, 30);
    solid.dispose();
    return e;
  });
}
