/**
 * Furniture layouts — where each piece goes on a floor plate.
 * -----------------------------------------------------------------------------
 * Works in real metres in the plate's local (un-twisted) frame. A tiny
 * planner rejects any piece that would leave the plate, clip the lift core
 * (plus the gallery round it — lib/coreLayout `galleryWidthM`) or collide with a piece already placed, so
 * the same recipe adapts to every building's plate size. The core stays
 * square to the world while plates twist, so in the plate frame it is a
 * rotated square — tested exactly (separating axes), not by its bounding box.
 * The corridor ring's bump round the lift lobby is kept clear too (keepOuts).
 *
 * Unit mix (see UNIT_MIX in lib/tower):
 *   • residential floors: four corner residences, each 2 bed / 2 bath —
 *     master bed + ensuite + walk-in wardrobe, second bedroom + bathroom,
 *     living, kitchen, dining, and on the corridor side a foyer, guest WC,
 *     coat closet, laundry, study and pantry where they fit (./apartment)
 *   • crown: one 4 bed / 4 bath penthouse spread over the crown floors
 * Bedrooms and bathrooms are placed first (with fallback spots) so they win
 * the space on small or tapered plates.
 *
 * Non-rect plan shapes: the planner rejects any piece whose footprint (plus
 * the wall margin) is not fully inside the plan outline. Residential floors
 * on shaped plates use ./apartmentShaped, which searches each room's spot
 * along the quadrant's facade instead of fixed corner spots; the other
 * recipes still work on the bounding box and are furnished where there is floor.
 */
import type { PlanShape, ZoneId } from "@/types";
import { penthouseBedsOnFloor, planOutline, pointInPolygon, type PlanPoint } from "@/lib/tower";
import { PIECES, type PieceId } from "./kit";
import { amenityLayout } from "./amenities";
import { apartment } from "./apartment";
import { apartmentShaped } from "./apartmentShaped";
import { MODEL_SCALE } from "@/lib/tower";
import { galleryWidthM, LOBBY_DEPTH_M, lobbyHalfWidthM } from "@/lib/coreLayout";
import type { AmenityKind } from "@/types";
import { DEFAULT_FIT, type ApartmentScheme, type FloorFit, type FurnitureSet } from "@/lib/apartmentFit";

export interface Placement {
  piece: PieceId;
  x: number;
  z: number;
  rot: number;
}

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const WALL_MARGIN = 0.3;

class Planner {
  readonly placements: Placement[] = [];
  private rects: Rect[] = [];
  /** Keep-out half-size around the core (core + gallery), and its angle in the plate frame. */
  readonly coreKeep: number;
  readonly coreCos: number;
  readonly coreSin: number;

  /** Footprints (axis-aligned bounds) of the pieces placed so far. */
  get footprints(): readonly Rect[] {
    return this.rects;
  }

  constructor(
    private halfW: number,
    private halfD: number,
    coreHalf: number,
    coreAngle: number,
    readonly outline: PlanPoint[] | null = null,
    gallery = 1.2,
    /** Test convex outlines by their edge half-planes (exact, fast) — used by the searching residential recipe. */
    fastOutline = false
  ) {
    this.coreKeep = coreHalf + gallery;
    // The world-square core rotated by `coreAngle` in the plate frame: its +X
    // axis is (cos a, −sin a) in plate (x, z) — the same frame lib/roomPlan
    // and the walk-through use (building +X = (cos r, sin r) with r = −a).
    this.coreCos = Math.cos(coreAngle);
    this.coreSin = -Math.sin(coreAngle);
    this.halfPlanes = outline && fastOutline ? convexHalfPlanes(outline) : null;
  }

  /** Outward edge half-planes (n · p ≤ c) when the outline is convex — an exact, fast rect-inside test. */
  readonly halfPlanes: [nx: number, nz: number, c: number][] | null;

  /** Snapshot of everything placed so far, for `reset` (trial layouts). */
  mark(): [number, number, number] {
    return [this.placements.length, this.rects.length, this.keepOuts.length];
  }

  /** Undo everything placed since `mark`. */
  reset([n, r, k]: [number, number, number]) {
    this.placements.length = n;
    this.rects.length = r;
    this.keepOuts.length = k;
  }

  /** Extra keep-out zones (e.g. the lift lobby bump of the corridor ring): oriented rects. */
  keepOuts: {
    c: PlanPoint;
    ux: PlanPoint;
    hx: number;
    hz: number;
    /** false: `grow` doesn't apply (clearance zones). */ grows?: boolean;
    /** Walking space in front of a piece: other pieces keep off it, but clearances may overlap. */ clear?: boolean;
  }[] = [];

  /** Does an axis-aligned rect (grown by `grow`) hit the core corridor or a keep-out? */
  blocked(r: Rect, grow = 0, ignoreClear = false): boolean {
    const g = { x0: r.x0 - grow, x1: r.x1 + grow, z0: r.z0 - grow, z1: r.z1 + grow };
    return this.hitsCore(g) || this.keepOuts.some((k) => !(ignoreClear && k.clear) && rectHitsORect(k.grows === false ? r : g, k));
  }

  /** Is the rect clear of every piece placed so far? */
  free(r: Rect): boolean {
    return !this.rects.some((o) => overlaps(r, o));
  }

  /** Axis-aligned rect vs the rotated core square (separating-axis test). */
  private hitsCore(r: Rect): boolean {
    const h = this.coreKeep;
    const c = Math.abs(this.coreCos);
    const s = Math.abs(this.coreSin);
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const hw = (r.x1 - r.x0) / 2;
    const hd = (r.z1 - r.z0) / 2;
    const ext = h * (c + s); // the square's projection on the plate axes
    if (Math.abs(cx) >= hw + ext || Math.abs(cz) >= hd + ext) return false;
    // The square's own axes
    const pu = cx * this.coreCos + cz * this.coreSin;
    const pv = -cx * this.coreSin + cz * this.coreCos;
    if (Math.abs(pu) >= h + hw * c + hd * s) return false;
    if (Math.abs(pv) >= h + hw * s + hd * c) return false;
    return true;
  }

  /** Would the piece fit here (plate, core, keep-outs, other pieces, plan outline)? Returns its footprint, or null. */
  fits(piece: PieceId, x: number, z: number, rot = 0): Rect | null {
    const { w, d } = PIECES[piece];
    // Axis-aligned bounds of the rotated footprint
    const c = Math.abs(Math.cos(rot));
    const s = Math.abs(Math.sin(rot));
    const hw = (w * c + d * s) / 2;
    const hd = (w * s + d * c) / 2;
    const r: Rect = { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };

    const e = 1e-6; // spots are written as "A − x" so they land exactly on the margin
    const inside = r.x0 >= -this.halfW + WALL_MARGIN - e && r.x1 <= this.halfW - WALL_MARGIN + e && r.z0 >= -this.halfD + WALL_MARGIN - e && r.z1 <= this.halfD - WALL_MARGIN + e;
    if (!inside || this.rects.some((o) => overlaps(r, o)) || this.blocked(r)) return null;
    if (this.halfPlanes) {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const hw = (r.x1 - r.x0) / 2 + WALL_MARGIN, hd = (r.z1 - r.z0) / 2 + WALL_MARGIN;
      for (const [nx, nz, c] of this.halfPlanes) if (nx * cx + nz * cz + Math.abs(nx) * hw + Math.abs(nz) * hd > c) return null;
    } else if (this.outline && !rectInPolygon(r, this.outline, WALL_MARGIN)) return null;
    return r;
  }

  /** Try to place a piece; returns false (and places nothing) if it doesn't fit. */
  add(piece: PieceId, x: number, z: number, rot = 0): boolean {
    const r = this.fits(piece, x, z, rot);
    if (!r) return false;
    this.rects.push(r);
    this.placements.push({ piece, x, z, rot });
    return true;
  }

  /**
   * Place a piece in quadrant-local coordinates (u, v ≥ 0) mirrored into the
   * quadrant (sx, sz). Rotations are mirrored so pieces keep facing the same
   * way relative to the walls.
   */
  addMirrored(sx: 1 | -1, sz: 1 | -1, piece: PieceId, u: number, v: number, rot = 0) {
    const mirrored = Math.atan2(sx * Math.sin(rot), sz * Math.cos(rot));
    return this.add(piece, sx * u, sz * v, mirrored);
  }

  /** Try each quadrant-local candidate spot in turn until one fits. */
  addFirst(sx: 1 | -1, sz: 1 | -1, piece: PieceId, spots: [u: number, v: number, rot: number][]) {
    return spots.some(([u, v, rot]) => this.addMirrored(sx, sz, piece, u, v, rot));
  }
}

/** Outward unit normals and offsets of a convex polygon's edges (n · p ≤ c inside), or null if it isn't convex. */
function convexHalfPlanes(poly: PlanPoint[]): [number, number, number][] | null {
  const n = poly.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % n];
    const [cx, cz] = poly[(i + 2) % n];
    const cross = (bx - ax) * (cz - bz) - (bz - az) * (cx - bx);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return null;
    sign = Math.sign(cross);
  }
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % n];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-9) continue;
    // Right normal (dz, −dx) points out of a CCW (sign > 0) polygon.
    const nx = (sign > 0 ? bz - az : az - bz) / L;
    const nz = (sign > 0 ? ax - bx : bx - ax) / L;
    out.push([nx, nz, nx * ax + nz * az]);
  }
  return out;
}

/**
 * Rect (grown by `margin`) fully inside a simple polygon: its corners and
 * edge midpoints are inside, and no polygon vertex (e.g. the inner corner of
 * an L) falls within it.
 */
function rectInPolygon(r: Rect, poly: PlanPoint[], margin: number): boolean {
  const x0 = r.x0 - margin, x1 = r.x1 + margin, z0 = r.z0 - margin, z1 = r.z1 + margin;
  const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
  const probes: PlanPoint[] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [xm, z0], [xm, z1], [x0, zm], [x1, zm]];
  if (!probes.every(([x, z]) => pointInPolygon(poly, x, z))) return false;
  return !poly.some(([x, z]) => x > x0 && x < x1 && z > z0 && z < z1);
}

/** Axis-aligned rect vs an oriented rect (separating axes). */
function rectHitsORect(r: Rect, k: { c: PlanPoint; ux: PlanPoint; hx: number; hz: number }): boolean {
  const cx = (r.x0 + r.x1) / 2 - k.c[0];
  const cz = (r.z0 + r.z1) / 2 - k.c[1];
  const hw = (r.x1 - r.x0) / 2;
  const hd = (r.z1 - r.z0) / 2;
  const [ax, az] = k.ux; // oriented rect axes: ux and (−az, ax)
  const c = Math.abs(ax);
  const s = Math.abs(az);
  if (Math.abs(cx) >= hw + k.hx * c + k.hz * s) return false;
  if (Math.abs(cz) >= hd + k.hx * s + k.hz * c) return false;
  if (Math.abs(cx * ax + cz * az) >= k.hx + hw * c + hd * s) return false;
  if (Math.abs(-cx * az + cz * ax) >= k.hz + hw * s + hd * c) return false;
  return true;
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

const QUADRANTS: [1 | -1, 1 | -1][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

/* ------------------------------------------------------------------ recipes */

function office(p: Planner, A: number, B: number) {
  p.add("conference", 0, B - 2.2);
  p.add("lounge", -(A - 2.4), -(B - 2.2));
  p.add("kitchen", A - 2.4, -(B - 1.9));
  for (const [sx, sz] of QUADRANTS) p.add("plantLarge", sx * (A - 0.9), sz * (B - 0.9));
  // Fill the remaining floor with desk clusters on a regular grid
  for (let z = -B + 1.9; z <= B - 1.9; z += 3.3) {
    for (let x = -A + 1.7; x <= A - 1.7; x += 2.9) p.add("deskCluster", x, z);
  }
}

/**
 * A bedroom with its own bathroom in quadrant (sx, sz): king bed against the
 * outer corner, ensuite beside it with its door facing into the flat.
 */
function suite(p: Planner, sx: 1 | -1, sz: 1 | -1, A: number, B: number) {
  p.addFirst(sx, sz, "bed", [
    [A - 2.0, B - 1.5, Math.PI],
    [A - 1.5, B - 2.0, -Math.PI / 2],
  ]);
  p.addFirst(sx, sz, "bathroom", [
    [A - 5.1, B - 1.45, Math.PI],
    [A - 1.45, B - 5.1, -Math.PI / 2],
    [A - 5.1, B - 3.9, Math.PI],
  ]);
}

function residential(p: Planner, A: number, B: number, fit: FloorFit) {
  // Four corner residences, mirrored. Each is 2 bed / 2 bath plus foyer, WC,
  // laundry, coat closet and — where they fit — walk-in wardrobe, study, pantry.
  const sizes = Object.fromEntries(Object.entries(PIECES).map(([k, v]) => [k, { w: v.w, d: v.d }]));
  // Shaped plates search each room's spot inside the outline (./apartmentShaped) when the
  // floor still uses the original plan. A custom room plan uses the explicit recipe,
  // and the planner drops anything that falls outside the outline.
  const custom = fit.scheme !== "corner" || fit.furniture !== "standard";
  for (const [sx, sz] of QUADRANTS) {
    if (p.outline && !custom) apartmentShaped(p, sx, sz, A, B, sizes);
    else apartment(p, sx, sz, A, B, sizes, fit);
  }
}

/**
 * The crown is ONE 4 bed / 4 bath penthouse. On a single-floor crown every
 * quadrant is a bedroom suite around a central living / kitchen / dining
 * spine. With two or more crown floors, the lowest is the living level (with
 * a guest suite, pool and piano) and the bedrooms are spread over the floors
 * above (see penthouseBedsOnFloor).
 */
function crown(p: Planner, A: number, B: number, zoneIndex: number, crownFloors: number, furniture: FurnitureSet) {
  const beds = penthouseBedsOnFloor(zoneIndex, crownFloors);
  const dine: PieceId = furniture === "lounge" ? "lounge" : "dining6";
  if (crownFloors <= 1) {
    for (const [sx, sz] of QUADRANTS) suite(p, sx, sz, A, B);
    p.add("living", 0, B - 2.3, Math.PI);
    p.add("kitchen", 0, -(B - 1.8));
    p.add(dine, -(A - 2.6), 0, Math.PI / 2);
    if (furniture !== "lounge") p.add("piano", A - 2.2, 0, -Math.PI / 2);
  } else if (zoneIndex === 0) {
    // Living level + guest suite
    p.add("living", -(A - 2.3), B - 2.3, Math.PI);
    if (furniture !== "lounge") p.add("piano", A - 2.0, B - 2.0, -2.4);
    p.add(dine, A - 2.2, -(B - 2.5), Math.PI / 2);
    p.add("kitchen", 0, -(B - 1.8));
    const order: [1 | -1, 1 | -1][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    order.slice(0, beds).forEach(([sx, sz]) => suite(p, sx, sz, A, B));
    p.add("archWall", -(A - 2.1), -(B - 3.4));
    p.add("pool", A - 2.4, 0.4);
  } else {
    // Bedroom level(s)
    QUADRANTS.slice(0, beds).forEach(([sx, sz]) => suite(p, sx, sz, A, B));
    p.add(furniture === "formal" ? "living" : "lounge", 0, B - 2.2);
    p.add("lounge", 0, -(B - 2.2));
    if (furniture !== "lounge") p.add("piano", A - 2.0, -(B - 2.0), -0.8);
  }
  for (const [sx, sz] of QUADRANTS) p.add("plantLarge", sx * (A - 0.8), sz * (B - 0.8));
}

function podium(p: Planner, A: number, B: number) {
  p.add("reception", 0, B - 5.2);
  for (const [sx, sz] of QUADRANTS) p.add("lounge", sx * (A - 3.2), sz * (B - 3.0));
  for (let x = -A + 1.6; x <= A - 1.6; x += 2.4) p.add("cafe", x, -(B - 1.2));
  for (const sx of [-1, 1]) p.add("bench", sx * 4.2, B - 1.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add("plantLarge", sx * (A - 0.9), sz * 0.8);
  for (let x = -A + 3; x <= A - 3; x += 3.5) p.add("plant", x, B - 0.7);
}

/**
 * The corridor ring's bump round the lift lobby (in front of the core's +Z
 * face, building frame) as an oriented keep-out in the plate frame — the same
 * box lib/roomPlan draws the ring round, so furniture never forces a hole in it.
 */
function lobbyKeepOut(coreHalfM: number, coreAngle: number, gallery: number) {
  const R = coreHalfM + gallery;
  const hb = Math.min(lobbyHalfWidthM(coreHalfM * 2 * MODEL_SCALE) + 0.12, R - 0.3);
  const zb = Math.max(R + 0.3, coreHalfM + LOBBY_DEPTH_M + 0.12);
  const r = -coreAngle;
  const zc = (R - 0.2 + zb) / 2;
  return { c: [-zc * Math.sin(r), zc * Math.cos(r)] as PlanPoint, ux: [Math.cos(r), Math.sin(r)] as PlanPoint, hx: hb, hz: (zb - R + 0.2) / 2 };
}

/**
 * Lay out one floor.
 * @param widthM      plate width in metres
 * @param depthM      plate depth in metres
 * @param coreHalfM   half the core size in metres
 * @param coreAngle   rotation of the (world-square) core in the plate frame, radians
 * @param zoneIndex   floor's position within its zone
 * @param crownFloors number of crown floors (the penthouse spans them all)
 * @param shape       plan shape (outline fitted to widthM × depthM); rect = no extra test
 */
export function layoutFloor(
  zone: ZoneId,
  widthM: number,
  depthM: number,
  coreHalfM: number,
  coreAngle = 0,
  zoneIndex = 0,
  crownFloors = 2,
  shape?: PlanShape,
  /** Shared amenity programme (see ./amenities) — replaces the zone recipe. */
  amenity?: AmenityKind,
  /** Room plan and furniture. The default is the original apartment recipe. */
  fit: FloorFit = DEFAULT_FIT
): Placement[] {
  // Shaped residential floors search for their rooms (a few ms – tens of ms), and several views
  // (furniture, room plan, mini plan, viewpoints) ask for the same floor: memoise the result.
  const key = [zone, widthM, depthM, coreHalfM, coreAngle, zoneIndex, crownFloors, shape?.kind, shape?.amount, amenity ?? "", fit.scheme, fit.furniture].join(":");
  const hit = layoutCache.get(key);
  if (hit) return hit.slice();
  const out = planFloor(zone, widthM, depthM, coreHalfM, coreAngle, zoneIndex, crownFloors, shape, amenity, fit);
  if (layoutCache.size >= 512) layoutCache.clear();
  layoutCache.set(key, out);
  return out.slice();
}

const layoutCache = new Map<string, Placement[]>();

function mirrorCrown(ps: Placement[], scheme: ApartmentScheme): Placement[] {
  if (scheme === "corner") return ps;
  const mx = scheme === "living-out" || scheme === "studio" ? -1 : 1;
  const mz = scheme === "gallery" || scheme === "studio" ? -1 : 1;
  return ps.map((p) => ({
    ...p,
    x: p.x * mx,
    z: p.z * mz,
    rot: Math.atan2(mz * Math.sin(p.rot), mx * Math.cos(p.rot)),
  }));
}

function planFloor(zone: ZoneId, widthM: number, depthM: number, coreHalfM: number, coreAngle: number, zoneIndex: number, crownFloors: number, shape?: PlanShape, amenity?: AmenityKind, fit: FloorFit = DEFAULT_FIT): Placement[] {
  const A = widthM / 2;
  const B = depthM / 2;
  const outline = shape && shape.kind !== "rect" ? planOutline(shape, widthM, depthM) : null;
  // The gallery round the core widens on roomy plates (lib/coreLayout) — the room plan draws its ring there.
  const gallery = galleryWidthM(zone, A, B, coreHalfM);
  const p = new Planner(A, B, coreHalfM, coreAngle, outline, gallery, zone === "residential" && !amenity);
  if (zone !== "crown") p.keepOuts.push(lobbyKeepOut(coreHalfM, coreAngle, gallery));
  if (amenity) {
    amenityLayout(p, amenity, A, B);
    return p.placements;
  }
  if (zone === "office") office(p, A, B);
  else if (zone === "residential") residential(p, A, B, fit);
  else if (zone === "crown") crown(p, A, B, zoneIndex, crownFloors, fit.furniture);
  else podium(p, A, B);
  return zone === "crown" ? mirrorCrown(p.placements, fit.scheme) : p.placements;
}
