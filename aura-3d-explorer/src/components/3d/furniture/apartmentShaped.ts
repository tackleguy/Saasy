/**
 * Apartment recipe for non-rect plates (triangle, chamfer, ellipse, hexagon,
 * octagon, rounded, L, cross) — one residential unit per quadrant.
 * -----------------------------------------------------------------------------
 * The rect recipe (./apartment) uses fixed spots measured from the corner
 * (A, B); on shaped plates that corner is cut away, so the master suite (and
 * often living / kitchen) never fit. Here every main room is SEARCHED for
 * inside the quadrant's usable floor instead (the planner already knows the
 * outline, the core + gallery ring and the lift-lobby keep-out):
 *
 *   • The quadrant's facade is walked from the side facade (+u axis end) to
 *     the far facade (+v axis end) and parametrised by arc length t. Facade
 *     rooms are placed with their back (local −Z) against the glass, slid
 *     inwards until the footprint clears the outline, at the sample closest to
 *     a target t — the same running order as the rect plan:
 *       second bedroom (t ≈ 12%) · living (t ≈ 30%) ·
 *       master bed (t ≈ 50%, "the corner") · ensuite + WIR beside it ·
 *       kitchen (t ≈ 85%) with the dining table in front of it.
 *     Placed in priority order — master bed + ensuite, living, kitchen, then
 *     the second bedroom + bath, dining, WIR where they still fit (on tight
 *     plates the ensuite may also go after living + kitchen).
 *   • Bathrooms sit beside their bed on the facade, else inside the flat with
 *     their door facing the bed (so the room plan's bedroom box takes them).
 *   • Every placed room keeps a clearance strip in front of it free (a
 *     planner keep-out other pieces stay off).
 *   • When a facade is too tight, the demising walls (plate axes) and the
 *     corridor ring serve as backing too, and finally any orientation near
 *     the target is accepted.
 *   • If that order leaves rooms out (small, tapered or twisted plates), the
 *     other orders along the facade (ORDERS) are tried and the most complete
 *     kept (scored by FULL's weights). A point-grid prefilter (Occupancy)
 *     keeps the search cheap. A quadrant where no bed, living or kitchen fits
 *     (e.g. a triangle's apex half, eaten by the core) is left empty.
 * Pieces stay axis-aligned and inside their quadrant, so the room plan's
 * demising walls, bedroom boxes and service-room walls still apply as-is.
 * Service rooms (foyer, WC, coats, laundry, study) come from the shared
 * corridor-side recipe; the pantry is searched for beside the kitchen.
 */
import type { PieceId } from "./kit";
import type { Placement } from "./layouts";
import { pointInPolygon, type PlanPoint } from "@/lib/tower";
import { serviceRooms, type ApartmentPlanner } from "./apartment";

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

type Pt = [number, number];

const PI = Math.PI;
const ROTS = [0, PI / 2, PI, -PI / 2];
/** The planner's wall margin (layouts.ts), and the gap kept from the glass (a hair more). */
const WALL_MARGIN = 0.3;
const GLASS_GAP = 0.32;
/** Search steps (metres): sliding in from a wall, and the free-placement grid. */
const PUSH_STEP = 0.2;
const GRID_STEP = 0.3;
/** Pieces keep this far off the demising axes. */
const AXIS_GAP = 0.15;

/** A wall a piece can back onto: a point on it and its normal pointing OUT of the flat. */
interface WallSample {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Arc length along the quadrant's facade (metres), or −1 for an inner wall (demising axis / corridor ring). */
  t: number;
}

interface Placed {
  pl: Placement;
  r: Rect;
  c: Pt;
  /** Facade arc position of the wall it backs onto (−1: not on the facade). */
  t: number;
}

const front = (rot: number): Pt => [Math.sin(rot), Math.cos(rot)];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const centre = (r: Rect): Pt => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

/** Facade samples of quadrant (sx, sz), ordered from the +u axis end to the +v axis end. */
function facadeSamples(outline: PlanPoint[], sx: number, sz: number, step = 0.3): { samples: WallSample[]; length: number } {
  const raw: (WallSample & { ang: number })[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = outline[i];
    const [bx, bz] = outline[(i + 1) % n];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    let nx = (bz - az) / L;
    let nz = -(bx - ax) / L;
    // Make the normal point out of the plate whatever the winding.
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (pointInPolygon(outline, mx + nx * 0.05, mz + nz * 0.05)) {
      nx = -nx;
      nz = -nz;
    }
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) {
      const s = (j + 0.5) / k;
      const x = ax + (bx - ax) * s;
      const z = az + (bz - az) * s;
      const u = sx * x, v = sz * z;
      if (u < 0.3 || v < 0.3) continue;
      raw.push({ x, z, nx, nz, t: 0, ang: Math.atan2(v, u) });
    }
  }
  raw.sort((a, b) => a.ang - b.ang);
  let t = 0;
  raw.forEach((s, i) => {
    if (i) t += Math.hypot(s.x - raw[i - 1].x, s.z - raw[i - 1].z);
    s.t = t;
  });
  return { samples: raw, length: t };
}

/** Samples along the two demising axes bounding quadrant (sx, sz), normals pointing out of the quadrant. */
function axisSamples(sx: number, sz: number, A: number, B: number, step = 0.5): WallSample[] {
  const out: WallSample[] = [];
  for (let u = 0.3; u < A; u += step) out.push({ x: sx * u, z: 0, nx: 0, nz: -sz, t: -1 });
  for (let v = 0.3; v < B; v += step) out.push({ x: 0, z: sz * v, nx: -sx, nz: 0, t: -1 });
  return out;
}

const offsetCache = new Map<number, [number, number, number][]>();
/** Grid offsets within `radius`, nearest first (cached). */
function gridOffsets(radius: number): [number, number, number][] {
  const hit = offsetCache.get(radius);
  if (hit) return hit;
  const offs: [number, number, number][] = [];
  const n = Math.floor(radius / GRID_STEP);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const dx = i * GRID_STEP, dz = j * GRID_STEP;
    const dd = Math.hypot(dx, dz);
    if (dd <= radius) offs.push([dx, dz, dd]);
  }
  offs.sort((a, b) => a[2] - b[2]);
  offsetCache.set(radius, offs);
  return offs;
}

/** Samples along the corridor ring (core + gallery keep-out) inside quadrant (sx, sz), normals pointing at the core. */
function ringSamples(p: ApartmentPlanner, outline: PlanPoint[], sx: number, sz: number, step = 0.5): WallSample[] {
  const R = p.coreKeep;
  const U: Pt = [p.coreCos, p.coreSin];
  const V: Pt = [-p.coreSin, p.coreCos];
  const out: WallSample[] = [];
  for (const [ax, tg] of [[U, V], [V, U]] as [Pt, Pt][]) {
    for (const sg of [1, -1]) {
      for (let s = -R; s <= R; s += step) {
        const x = ax[0] * sg * R + tg[0] * s;
        const z = ax[1] * sg * R + tg[1] * s;
        if (sx * x < 0.3 || sz * z < 0.3 || !pointInPolygon(outline, x, z)) continue;
        out.push({ x, z, nx: -ax[0] * sg, nz: -ax[1] * sg, t: -1 });
      }
    }
  }
  return out;
}

/** Point-grid resolution of the occupancy prefilter, metres. */
const CELL = 0.2;

/**
 * Occupancy prefilter for one quadrant: a grid of points, each flagged when
 * it is definitely unusable (off the floor / too near the glass or a
 * demising axis, in the core + gallery, a keep-out, a placed piece). A
 * candidate footprint containing a flagged point cannot fit, so it is
 * rejected with two summed-area lookups; only the survivors go through the
 * planner's exact test. Exact-safe: it never rejects a spot that fits.
 */
class Occupancy {
  private readonly nx: number;
  private readonly nz: number;
  private readonly fixed: Uint8Array;
  private readonly hard: Uint8Array;
  private readonly soft: Uint8Array;
  /** Summed-area tables: everything (pieces), and hard obstacles only (clearance strips). */
  private readonly satAll: Int32Array;
  private readonly satHard: Int32Array;

  constructor(private p: ApartmentPlanner, outline: PlanPoint[], private x0: number, private z0: number, x1: number, z1: number, sx: number, sz: number) {
    this.nx = Math.max(1, Math.ceil((x1 - x0) / CELL));
    this.nz = Math.max(1, Math.ceil((z1 - z0) / CELL));
    const n = this.nx * this.nz;
    this.fixed = new Uint8Array(n);
    this.hard = new Uint8Array(n);
    this.soft = new Uint8Array(n);
    this.satAll = new Int32Array((this.nx + 1) * (this.nz + 1));
    this.satHard = new Int32Array((this.nx + 1) * (this.nz + 1));
    const hp = p.halfPlanes;
    const m = WALL_MARGIN;
    for (let j = 0; j < this.nz; j++) {
      const z = z0 + (j + 0.5) * CELL;
      // Convex outline: the usable x-interval of this row, straight from the edge half-planes.
      let lo = -Infinity;
      let hi = Infinity;
      if (hp) {
        for (const [nx, nz, c] of hp) {
          const room = c - nz * z - (Math.abs(nx) + Math.abs(nz)) * m;
          if (nx > 1e-12) hi = Math.min(hi, room / nx);
          else if (nx < -1e-12) lo = Math.max(lo, room / nx);
          else if (room < 0) lo = Infinity;
        }
      }
      for (let i = 0; i < this.nx; i++) {
        const x = x0 + (i + 0.5) * CELL;
        let bad = sx * x < AXIS_GAP || sz * z < AXIS_GAP;
        if (!bad) bad = hp ? x < lo || x > hi : !(pointInPolygon(outline, x - m, z - m) && pointInPolygon(outline, x + m, z - m) && pointInPolygon(outline, x - m, z + m) && pointInPolygon(outline, x + m, z + m));
        if (bad) this.fixed[j * this.nx + i] = 1;
      }
    }
    this.sync();
  }

  private range(a: number, b: number, o: number, n: number): [number, number] {
    return [Math.max(0, Math.ceil((a - o) / CELL - 0.5 + 1e-9)), Math.min(n - 1, Math.floor((b - o) / CELL - 0.5 - 1e-9))];
  }

  private mark(layer: Uint8Array, r: Rect, inside?: (x: number, z: number) => boolean) {
    const [i0, i1] = this.range(r.x0, r.x1, this.x0, this.nx);
    const [j0, j1] = this.range(r.z0, r.z1, this.z0, this.nz);
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * CELL;
      for (let i = i0; i <= i1; i++) if (!inside || inside(this.x0 + (i + 0.5) * CELL, z)) layer[j * this.nx + i] = 1;
    }
  }

  /** Re-read the planner's state (after a placement or a reset). */
  sync() {
    const { p } = this;
    this.hard.set(this.fixed);
    this.soft.fill(0);
    // Core + gallery (a square at the core's angle)
    const h = p.coreKeep;
    const c = p.coreCos;
    const s = p.coreSin;
    const ext = h * (Math.abs(c) + Math.abs(s));
    this.mark(this.hard, { x0: -ext, x1: ext, z0: -ext, z1: ext }, (x, z) => Math.abs(x * c + z * s) < h && Math.abs(-x * s + z * c) < h);
    for (const k of p.keepOuts) {
      const [ax, az] = k.ux;
      const ex = k.hx * Math.abs(ax) + k.hz * Math.abs(az);
      const ez = k.hx * Math.abs(az) + k.hz * Math.abs(ax);
      const inK = (x: number, z: number) => Math.abs((x - k.c[0]) * ax + (z - k.c[1]) * az) < k.hx && Math.abs(-(x - k.c[0]) * az + (z - k.c[1]) * ax) < k.hz;
      this.mark(k.clear ? this.soft : this.hard, { x0: k.c[0] - ex, x1: k.c[0] + ex, z0: k.c[1] - ez, z1: k.c[1] + ez }, inK);
    }
    for (const r of p.footprints) this.mark(this.hard, r);
    const W = this.nx + 1;
    for (let j = 0; j < this.nz; j++) {
      let rowAll = 0;
      let rowHard = 0;
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        rowHard += this.hard[k];
        rowAll += this.hard[k] | this.soft[k];
        this.satHard[(j + 1) * W + i + 1] = this.satHard[j * W + i + 1] + rowHard;
        this.satAll[(j + 1) * W + i + 1] = this.satAll[j * W + i + 1] + rowAll;
      }
    }
  }

  /**
   * Could a w × d footprint (either way round) fit anywhere? False only when
   * no window of free points that size exists — then nothing needs trying.
   */
  canFit(w: number, d: number): boolean {
    return this.window(w, d) || this.window(d, w);
  }

  private window(w: number, d: number): boolean {
    const kx = Math.ceil(w / CELL - 1e-9) - 1;
    const kz = Math.ceil(d / CELL - 1e-9) - 1;
    if (kx <= 0 || kz <= 0) return true;
    const S = this.satAll;
    const W = this.nx + 1;
    for (let j = 0; j + kz <= this.nz; j++) {
      for (let i = 0; i + kx <= this.nx; i++) {
        if (S[(j + kz) * W + i + kx] - S[j * W + i + kx] - S[(j + kz) * W + i] + S[j * W + i] === 0) return true;
      }
    }
    return false;
  }

  /** Any flagged point strictly inside x0..x1 × z0..z1? (`hardOnly`: ignore clearance strips.) */
  blockedXZ(x0: number, x1: number, z0: number, z1: number, hardOnly: boolean): boolean {
    const i0 = Math.max(0, Math.ceil((x0 - this.x0) / CELL - 0.5 + 1e-9));
    const i1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / CELL - 0.5 - 1e-9));
    const j0 = Math.max(0, Math.ceil((z0 - this.z0) / CELL - 0.5 + 1e-9));
    const j1 = Math.min(this.nz - 1, Math.floor((z1 - this.z0) / CELL - 0.5 - 1e-9));
    if (i0 > i1 || j0 > j1) return false;
    const S = hardOnly ? this.satHard : this.satAll;
    const W = this.nx + 1;
    return S[(j1 + 1) * W + i1 + 1] - S[j0 * W + i1 + 1] - S[(j1 + 1) * W + i0] + S[j0 * W + i0] > 0;
  }
}

/**
 * Facade targets (fractions of the quadrant's facade run, side facade → far
 * facade) for [master, living, kitchen, second bedroom]. The first is the
 * rect plan's order (second bed · living · master in the corner · kitchen);
 * the rest are tried only when it leaves rooms out.
 */
const ORDERS = [
  [0.5, 0.3, 0.85, 0.12],
  [0.5, 0.7, 0.15, 0.88],
  [0.15, 0.45, 0.75, 0.92],
  [0.85, 0.55, 0.25, 0.08],
  [0.65, 0.35, 0.08, 0.92],
  [0.35, 0.65, 0.92, 0.08],
] as const;
/**
 * Score of a complete flat: master 10 + ensuite 14 + living 12 + kitchen 12 +
 * dining 3 + second bedroom 5 + its bath 3 (the WIR adds 1 more) — a home
 * needs its bathroom first, then living and kitchen outrank the second
 * bedroom suite.
 */
const FULL = 59;

export function apartmentShaped(p: ApartmentPlanner, sx: 1 | -1, sz: 1 | -1, A: number, B: number, sizes: Record<string, { w: number; d: number }>) {
  const outline = p.outline;
  if (!outline) return;
  const { samples, length: L } = facadeSamples(outline, sx, sz);
  if (!samples.length) return;
  // Inner walls a room can back onto when the facade is too tight: the demising axes and the corridor ring.
  const inner = [...axisSamples(sx, sz, A, B), ...ringSamples(p, outline, sx, sz)];
  const occ = new Occupancy(p, outline, sx > 0 ? 0 : -A, sz > 0 ? 0 : -B, sx > 0 ? A : 0, sz > 0 ? B : 0, sx, sz);

  const inQuadrant = (r: Rect) => (sx > 0 ? r.x0 >= AXIS_GAP : r.x1 <= -AXIS_GAP) && (sz > 0 ? r.z0 >= AXIS_GAP : r.z1 <= -AXIS_GAP);

  /** Half extents (along x, along z) of a piece at an axis rotation. */
  const half = (piece: PieceId, rot: number): Pt => {
    const { w, d } = sizes[piece];
    return Math.abs(Math.sin(rot)) > 0.5 ? [d / 2, w / 2] : [w / 2, d / 2];
  };

  /** The walking strip in front of a piece (its +Z face), `depth` deep. */
  const frontZone = (r: Rect, rot: number, depth: number): Rect => {
    const [fx, fz] = front(rot);
    if (fx > 0.5) return { x0: r.x1, x1: r.x1 + depth, z0: r.z0 + 0.1, z1: r.z1 - 0.1 };
    if (fx < -0.5) return { x0: r.x0 - depth, x1: r.x0, z0: r.z0 + 0.1, z1: r.z1 - 0.1 };
    if (fz > 0.5) return { x0: r.x0 + 0.1, x1: r.x1 - 0.1, z0: r.z1, z1: r.z1 + depth };
    return { x0: r.x0 + 0.1, x1: r.x1 - 0.1, z0: r.z0 - depth, z1: r.z0 };
  };

  /** Is the clearance strip walkable: in the quadrant, on the floor, off the core / ring and every piece? */
  const zoneOk = (z: Rect) => {
    if (!inQuadrant(z) || !p.free(z) || p.blocked(z, 0, true)) return false;
    const mx = (z.x0 + z.x1) / 2, mz = (z.z0 + z.z1) / 2;
    return [[mx, mz], [z.x0, z.z0], [z.x1, z.z0], [z.x0, z.z1], [z.x1, z.z1]].every(([x, zz]) => pointInPolygon(outline, x, zz));
  };

  /**
   * Cheap necessary test (no allocation): in the quadrant, and no flagged
   * occupancy point under the footprint or its front strip.
   */
  const quick = (piece: PieceId, cx: number, cz: number, rot: number, clear: number): boolean => {
    const { w, d } = sizes[piece];
    const sideways = Math.abs(Math.sin(rot)) > 0.5;
    const hx = (sideways ? d : w) / 2;
    const hz = (sideways ? w : d) / 2;
    const x0 = cx - hx, x1 = cx + hx, z0 = cz - hz, z1 = cz + hz;
    if (!(sx > 0 ? x0 >= AXIS_GAP : x1 <= -AXIS_GAP) || !(sz > 0 ? z0 >= AXIS_GAP : z1 <= -AXIS_GAP)) return false;
    if (occ.blockedXZ(x0, x1, z0, z1, false)) return false;
    if (clear <= 0) return true;
    const fx = Math.sin(rot), fz = Math.cos(rot);
    if (fx > 0.5) return !occ.blockedXZ(x1, x1 + clear, z0 + 0.1, z1 - 0.1, true);
    if (fx < -0.5) return !occ.blockedXZ(x0 - clear, x0, z0 + 0.1, z1 - 0.1, true);
    if (fz > 0.5) return !occ.blockedXZ(x0 + 0.1, x1 - 0.1, z1, z1 + clear, true);
    return !occ.blockedXZ(x0 + 0.1, x1 - 0.1, z0 - clear, z0, true);
  };

  /** Full test of a candidate: fits, in the quadrant, front strip clear. Returns the footprint or null. */
  const test = (piece: PieceId, c: Pt, rot: number, clear: number): Rect | null => {
    if (!quick(piece, c[0], c[1], rot, clear)) return null;
    const r = p.fits(piece, c[0], c[1], rot);
    if (!r) return null;
    if (clear > 0 && !zoneOk(frontZone(r, rot, clear))) return null;
    return r;
  };

  const commit = (piece: PieceId, c: Pt, rot: number, r: Rect, clear: number, t: number): Placed | null => {
    if (!p.add(piece, c[0], c[1], rot)) return null;
    if (clear > 0) {
      const z = frontZone(r, rot, clear);
      p.keepOuts.push({ c: centre(z), ux: [1, 0], hx: (z.x1 - z.x0) / 2, hz: (z.z1 - z.z0) / 2, grows: false, clear: true });
    }
    occ.sync();
    return { pl: p.placements[p.placements.length - 1], r, c, t };
  };

  /**
   * Slide a fitting candidate along `dirs` until it touches something (a
   * piece, the glass, the ring) within `max` metres — the nearest contact
   * wins — so rooms pack together and leave one larger free area.
   */
  const snap = (piece: PieceId, c: Pt, rot: number, r: Rect, clear: number, dirs: Pt[], valid: (c: Pt) => boolean, max = 1.5): { c: Pt; r: Rect } => {
    let best: { c: Pt; r: Rect; s: number } | null = null;
    for (const [dx, dz] of dirs) {
      let prev: { c: Pt; r: Rect } = { c, r };
      for (let s = 0.1; s <= max + 1e-9; s += 0.1) {
        if (best && s > best.s) break;
        const c2: Pt = [c[0] + dx * s, c[1] + dz * s];
        const r2 = valid(c2) ? test(piece, c2, rot, clear) : null;
        if (!r2) {
          if (!best || s - 0.1 < best.s) best = { ...prev, s: s - 0.1 };
          break;
        }
        prev = { c: c2, r: r2 };
      }
    }
    return best ?? { c, r };
  };

  /**
   * Back a piece onto a wall: at each wall sample, for each rotation whose
   * back faces the wall, slide inwards from the glass until it fits; keep
   * the best by `score` (null = unacceptable) + a penalty for the slide.
   */
  const onWall = (
    piece: PieceId,
    walls: WallSample[],
    clear: number,
    score: (c: Pt, s: WallSample, rot: number) => number | null,
    maxPush = 3,
    /** Lower bound of `score` at a sample — samples are tried in that order and the search stops early. */
    bound?: (s: WallSample) => number
  ): Placed | null => {
    if (!occ.canFit(sizes[piece].w, sizes[piece].d)) return null;
    let best: { c: Pt; rot: number; r: Rect; s: WallSample; score: number } | null = null;
    const order = bound ? walls.map((s) => ({ s, lb: bound(s) })).sort((a, b) => a.lb - b.lb) : walls.map((s) => ({ s, lb: 0 }));
    for (const { s, lb } of order) {
      if (best && lb >= best.score) break;
      for (const rot of ROTS) {
        const [fx, fz] = front(rot);
        if (-(fx * s.nx + fz * s.nz) < 0.6) continue; // the back must face the wall
        const dHalf = sizes[piece].d / 2;
        for (let k = 0; k <= maxPush + 1e-9; k += PUSH_STEP) {
          const off = GLASS_GAP + dHalf + k;
          const cx = s.x + fx * off, cz = s.z + fz * off;
          if (best && 2 * k >= best.score) break;
          if (!quick(piece, cx, cz, rot, clear)) continue;
          const c: Pt = [cx, cz];
          const base = score(c, s, rot);
          if (base === null) break;
          const sc = base + 2 * k;
          if (best && sc >= best.score) break;
          const r = test(piece, c, rot, clear);
          if (r) {
            best = { c, rot, r, s, score: sc };
            break;
          }
        }
      }
    }
    if (!best) return null;
    const b = best;
    const [fx, fz] = front(b.rot);
    const sn = snap(piece, b.c, b.rot, b.r, clear, [[fz, -fx], [-fz, fx]], (c) => score(c, b.s, b.rot) !== null);
    return commit(piece, sn.c, b.rot, sn.r, clear, b.s.t);
  };

  /** Free placement near `target` (any of the four rotations), best by distance + `extra`. */
  const near = (piece: PieceId, target: Pt, radius: number, clear: number, extra: (c: Pt, rot: number) => number | null = () => 0): Placed | null => {
    if (!occ.canFit(sizes[piece].w, sizes[piece].d)) return null;
    let best: { c: Pt; rot: number; r: Rect; score: number } | null = null;
    const offs = gridOffsets(radius);
    for (const [dx, dz, dd] of offs) {
      if (best && dd >= best.score) break;
      const cx = target[0] + dx, cz = target[1] + dz;
      let c: Pt | null = null;
      for (const rot of ROTS) {
        if (!quick(piece, cx, cz, rot, clear)) continue;
        c ??= [cx, cz];
        const e = extra(c, rot);
        if (e === null) continue;
        const sc = dd + e;
        if (best && sc >= best.score) continue;
        const r = test(piece, c, rot, clear);
        if (r) best = { c, rot, r, score: sc };
      }
    }
    if (!best) return null;
    const b = best;
    const valid = (c: Pt) => dist(c, target) <= radius && extra(c, b.rot) !== null;
    const s1 = snap(piece, b.c, b.rot, b.r, clear, [[1, 0], [-1, 0]], valid, 1);
    const s2 = snap(piece, s1.c, b.rot, s1.r, clear, [[0, 1], [0, -1]], valid, 1);
    return commit(piece, s2.c, b.rot, s2.r, clear, -1);
  };

  /** Point on the facade at arc length t (for targets). */
  const facadePoint = (t: number): Pt => {
    let s = samples[0];
    for (const q of samples) if (Math.abs(q.t - t) < Math.abs(s.t - t)) s = q;
    return [s.x - s.nx * 2.5, s.z - s.nz * 2.5];
  };

  /** Facade first, then the demising walls, then anywhere near the facade target. */
  const facadeRoom = (piece: PieceId, tWant: number, clear: number, ok: (c: Pt) => boolean = () => true, faceAxisPenalty = 4): Placed | null => {
    const tp = facadePoint(tWant);
    const reach = sizes[piece].d / 2 + GLASS_GAP + 3;
    return (
      onWall(piece, samples, clear, (c, s) => (ok(c) ? Math.abs(s.t - tWant) : null), 3, (s) => Math.abs(s.t - tWant)) ??
      onWall(piece, inner, clear, (c) => (ok(c) ? faceAxisPenalty + dist(c, tp) * 0.5 : null), 3, (s) => faceAxisPenalty + Math.max(0, dist([s.x, s.z], tp) - reach) * 0.5) ??
      near(piece, tp, 4, clear, (c) => (ok(c) ? 0 : null))
    );
  };

  /** A bathroom for `bed`: beside it on the facade, else inside the flat with its door towards the bed. */
  const bathFor = (bed: Placed, ok: (c: Pt) => boolean, preferAfter: boolean): Placed | null =>
    onWall("bathroom", samples, 1.0, (c, s) => {
      const dd = dist(c, bed.c);
      if (dd > 4.6 || !ok(c)) return null;
      return dd + ((s.t < bed.t) === preferAfter ? 1.5 : 0);
    }, 1.2, (s) => Math.max(0, dist([s.x, s.z], bed.c) - 3)) ??
    near("bathroom", bed.c, 4.6, 0.9, (c, rot) => {
      if (!ok(c)) return null;
      const [fx, fz] = front(rot);
      // Door towards the bed (else at least not turned away from it, at a small penalty).
      const toward = fx * (bed.c[0] - c[0]) + fz * (bed.c[1] - c[1]);
      return toward > 0.3 ? 0 : toward > -0.3 ? 1.5 : null;
    });

  /**
   * The main rooms for one set of facade targets (arc fractions). Returns
   * a completeness score and the kitchen (for the pantry).
   */
  const mainRooms = ([tMaster, tLiving, tKitchen, tSecond]: readonly number[], ensuiteLate: boolean, beat = -1) => {
    // Running score; a trial that can no longer beat `beat` (the best order so far) stops early.
    let got = 0;
    let left = FULL + 1;
    const step = (ok: unknown, pts: number) => {
      if (ok) got += pts;
      left -= pts;
      return got + left <= beat;
    };
    const quit = { score: -1, kitchen: null as Placed | null, home: false };

    /* 1 · master bed against the glass, ensuite beside it */
    const master = facadeRoom("bed", L * tMaster, 0.6, () => true, 3);
    if (step(master, 10)) return quit;
    const ensuiteFor = () => (master ? bathFor(master, () => true, tKitchen > tMaster) : null);
    let ensuite: Placed | null = ensuiteLate ? null : ensuiteFor();
    if (!ensuiteLate && step(ensuite, 14)) return quit;

    /* 2 · living and kitchen — before the second bedroom, so a small or tapered plate keeps them */
    // (a tighter walkway in front when the plate is too small for the usual one)
    const living = facadeRoom("living", L * tLiving, 0.5) ?? facadeRoom("living", L * tLiving, 0.2);
    if (step(living, 12)) return quit;
    const kitchen = facadeRoom("kitchen", L * tKitchen, 0.7) ?? facadeRoom("kitchen", L * tKitchen, 0.35);
    if (step(kitchen, 12)) return quit;
    // (on tight plates the ensuite may go after living + kitchen, so it doesn't take their wall)
    if (ensuiteLate) {
      ensuite = ensuiteFor();
      if (step(ensuite, 14)) return quit;
    }

    /* 3 · second bedroom (where it fits), its bathroom beside it */
    const awayFromMaster = (c: Pt) => !master || dist(c, master.c) > 4.6;
    const second = facadeRoom("bedDouble", L * tSecond, 0.6, awayFromMaster) ?? facadeRoom("bedDouble", L * tSecond, 0.35, awayFromMaster);
    if (step(second, 5)) return quit;
    let bath2: Placed | null = null;
    if (second) {
      const ensuiteD = ensuite && master ? dist(ensuite.c, master.c) : 0;
      // The room plan gives each bed its nearest bathroom (master first), so stay clear of the master's.
      bath2 = bathFor(second, (c) => !master || dist(c, master.c) > ensuiteD + 0.2, tSecond > tMaster);
    }
    if (step(bath2, 3)) return quit;

    /* dining table in front of the kitchen (else the living) */
    const dineNear = kitchen ?? living;
    let dining: Placed | null = null;
    if (dineNear) {
      const [fx, fz] = front(dineNear.pl.rot);
      const reach = sizes[dineNear.pl.piece].d / 2 + 2.3;
      const target: Pt = [dineNear.c[0] + fx * reach, dineNear.c[1] + fz * reach];
      dining = near("dining4", target, 4.5, 0, (c, rot) => {
        const [hx, hz] = half("dining4", rot);
        const g = { x0: c[0] - hx - 0.45, x1: c[0] + hx + 0.45, z0: c[1] - hz - 0.45, z1: c[1] + hz + 0.45 };
        return p.free(g) ? 0 : null; // room to pull the chairs out
      });
    }
    if (step(dining, 3)) return quit;

    /* walk-in wardrobe off the master bedroom, a plant beside the sofa */
    let wir: Placed | null = null;
    if (master) {
      const anchor = ensuite ?? master;
      wir = near("wir", anchor.c, 4, 0.8, (c, rot) => {
        if (dist(c, master.c) > 5) return null;
        const [fx, fz] = front(rot);
        return fx * (master.c[0] - c[0]) + fz * (master.c[1] - c[1]) > 0.3 ? dist(c, master.c) * 0.3 : null; // door into the bedroom
      });
    }
    step(wir, 1);
    if (living) {
      onWall("plant", samples, 0, (c, s) => {
        const dd = dist(c, living.c);
        return dd < 2.3 || dd > 4 ? null : Math.abs(s.t - living.t);
      }, 0.6, (s) => (dist([s.x, s.z], living.c) > 5 ? 99 : 0));
    }
    return { score: got, kitchen, home: !!(master || living || kitchen) };
  };

  // The usual running order first; on plates where it leaves rooms out, try the other orders
  // along the facade and keep the most complete (ties: the earlier order).
  const start = p.mark();
  const trials = ORDERS.length * 2; // every order with the ensuite early, then late
  const run = (i: number, beat = -1) => mainRooms(ORDERS[i % ORDERS.length], i >= ORDERS.length, beat);
  let res = run(0);
  if (res.score < FULL) {
    let best = { i: 0, score: res.score };
    let lastRun = 0;
    for (let i = 1; i < trials && best.score < FULL; i++) {
      p.reset(start);
      occ.sync();
      const r = run(i, best.score);
      lastRun = i;
      if (r.score > best.score) {
        best = { i, score: r.score };
        res = r;
      }
    }
    if (lastRun !== best.i || res.score < 0) {
      p.reset(start);
      occ.sync();
      res = run(best.i);
    }
  }
  const kitchen = res.kitchen;
  if (!res.home) return; // no flat fits in this quadrant (e.g. a triangle's apex half): leave it empty

  /* 4 · service rooms on the corridor side, pantry beside the kitchen */
  serviceRooms(p, sx, sz, A, B, sizes, kitchen?.pl ?? null, false);
  occ.sync();
  if (kitchen) {
    near("pantry", kitchen.c, 4, 0.8, (c) => (dist(c, kitchen.c) < 4 ? 0 : null));
  }
}
