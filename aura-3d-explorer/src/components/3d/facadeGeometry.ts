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
 */
import * as THREE from "three";

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
export function liftDoors(core: number, y0: number, doorH: number): THREE.BufferGeometry {
  return cached(`doors:${core}:${y0}:${doorH}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const sz of [-1, 1]) {
      for (const x of [-core * 0.28, 0, core * 0.28]) {
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
