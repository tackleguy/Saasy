/**
 * Plan geometry — polygons, oriented boxes and the fit tests used by staging.
 * Everything is 2D on the ground plane: a point is [x, z] in metres.
 */

export type Vec = [number, number];
export type Poly = Vec[];

export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec) => Math.hypot(a[0], a[1]);
export const dist = (a: Vec, b: Vec) => len(sub(a, b));
export const norm = (a: Vec): Vec => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};

/** Signed area (shoelace, x/z): positive when counter-clockwise in x→z axes. */
export function signedArea(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export const area = (p: Poly) => Math.abs(signedArea(p));

export function perimeter(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += dist(p[i], p[(i + 1) % p.length]);
  return s;
}

/** Area centroid. */
export function centroid(p: Poly): Vec {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i];
    const [x1, z1] = p[(i + 1) % p.length];
    const f = x0 * z1 - x1 * z0;
    a += f;
    cx += (x0 + x1) * f;
    cz += (z0 + z1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = p.length || 1;
    return [p.reduce((s, v) => s + v[0], 0) / n, p.reduce((s, v) => s + v[1], 0) / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

/** Drop repeated / collinear vertices and make the ring counter-clockwise. */
export function cleanPolygon(p: Poly, eps = 1e-3): Poly {
  let out: Poly = [];
  for (const v of p) if (!out.length || dist(out[out.length - 1], v) > eps) out.push(v);
  if (out.length > 1 && dist(out[0], out[out.length - 1]) <= eps) out.pop();
  // Remove collinear points
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      if (Math.abs(cross(sub(b, a), sub(c, b))) < eps * Math.max(dist(a, b), dist(b, c), 1e-6)) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (signedArea(out) < 0) out = out.reverse();
  return out;
}

export function pointInPolygon(pt: Vec, p: Poly): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i];
    const [xj, zj] = p[j];
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Proper intersection of segments ab and cd (touching endpoints don't count). */
export function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
}

/** Closest point on segment ab to p, and the parameter t ∈ [0, 1]. */
export function closestOnSegment(p: Vec, a: Vec, b: Vec): { pt: Vec; t: number; d: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1e-12;
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2));
  const pt = add(a, mul(ab, t));
  return { pt, t, d: dist(p, pt) };
}

/* ------------------------------------------------------------ oriented box */

/** An oriented rectangle: centre, half sizes along its local x / z, rotation about Y. */
export interface OBB {
  c: Vec;
  hw: number;
  hd: number;
  /** Rotation about Y (three.js convention: local +Z → (sin r, cos r)). */
  r: number;
}

/** Local axes of a box: ax = local +X, az = local +Z, in plan x/z. */
export function axes(r: number): { ax: Vec; az: Vec } {
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { ax: [c, -s], az: [s, c] };
}

export function corners(b: OBB): Poly {
  const { ax, az } = axes(b.r);
  const out: Poly = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    out.push(add(b.c, add(mul(ax, sx * b.hw), mul(az, sz * b.hd))));
  }
  return out;
}

/** Separating-axis overlap test for two oriented boxes. */
export function obbOverlap(a: OBB, b: OBB): boolean {
  const ca = corners(a);
  const cb = corners(b);
  const test = [axes(a.r).ax, axes(a.r).az, axes(b.r).ax, axes(b.r).az];
  for (const n of test) {
    let amin = Infinity;
    let amax = -Infinity;
    let bmin = Infinity;
    let bmax = -Infinity;
    for (const v of ca) {
      const d = dot(v, n);
      amin = Math.min(amin, d);
      amax = Math.max(amax, d);
    }
    for (const v of cb) {
      const d = dot(v, n);
      bmin = Math.min(bmin, d);
      bmax = Math.max(bmax, d);
    }
    if (amax <= bmin + 1e-6 || bmax <= amin + 1e-6) return false;
  }
  return true;
}

/** True when the box lies fully inside the (possibly concave) polygon. */
export function obbInPolygon(b: OBB, p: Poly): boolean {
  const cs = corners(b);
  if (!cs.every((v) => pointInPolygon(v, p))) return false;
  // No polygon edge may cut through the box (concave rooms)…
  for (let i = 0; i < 4; i++) {
    const a = cs[i];
    const c = cs[(i + 1) % 4];
    for (let j = 0; j < p.length; j++) if (segmentsCross(a, c, p[j], p[(j + 1) % p.length])) return false;
  }
  // …and no reflex corner may poke into it.
  const { ax, az } = axes(b.r);
  for (const v of p) {
    const d = sub(v, b.c);
    if (Math.abs(dot(d, ax)) < b.hw - 1e-6 && Math.abs(dot(d, az)) < b.hd - 1e-6) return false;
  }
  return true;
}

/** Grow a box by margins (front = local +Z, back = −Z, sides = ±X). */
export function inflate(b: OBB, m: { front?: number; back?: number; sides?: number }): OBB {
  const f = m.front ?? 0;
  const k = m.back ?? 0;
  const s = m.sides ?? 0;
  const { az } = axes(b.r);
  return { c: add(b.c, mul(az, (f - k) / 2)), hw: b.hw + s, hd: b.hd + (f + k) / 2, r: b.r };
}

/** Rotation that makes a piece's front (+Z) face along direction n. */
export const facing = (n: Vec) => Math.atan2(n[0], n[1]);

/** Edges of a CCW polygon with their inward normals. */
export interface Edge {
  i: number;
  a: Vec;
  b: Vec;
  /** Unit direction a → b. */
  t: Vec;
  /** Unit inward normal. */
  n: Vec;
  length: number;
  mid: Vec;
}

export function edges(p: Poly): Edge[] {
  const ccw = signedArea(p) > 0;
  return p.map((a, i) => {
    const b = p[(i + 1) % p.length];
    const t = norm(sub(b, a));
    // For a CCW ring in x/z, the interior is to the left: (−t.z, t.x)… in a right-handed x→z frame.
    const left: Vec = [-t[1], t[0]];
    const n: Vec = ccw ? left : [t[1], -t[0]];
    return { i, a, b, t, n, length: dist(a, b), mid: mul(add(a, b), 0.5) };
  });
}

/** Distance from p along direction n to the polygon boundary (ray cast). */
export function rayToBoundary(p: Vec, n: Vec, poly: Poly): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const e = sub(b, a);
    const den = cross(n, e);
    if (Math.abs(den) < 1e-12) continue;
    const ap = sub(a, p);
    const t = cross(ap, e) / den;
    const u = cross(ap, n) / den;
    if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
}

/** Axis-aligned bounds of a set of points. */
export function bounds(pts: Vec[]) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of pts) {
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minZ, maxX, maxZ, w: maxX - minX, d: maxZ - minZ };
}

export const round = (v: number, dp = 3) => {
  const k = 10 ** dp;
  return Math.round(v * k) / k || 0;
};
