/**
 * Furniture layouts — where each piece goes on a floor plate.
 * -----------------------------------------------------------------------------
 * Works in real metres in the plate's local (un-twisted) frame. A tiny
 * planner rejects any piece that would leave the plate, clip the lift core
 * (plus a circulation corridor) or collide with a piece already placed, so
 * the same recipe adapts to every building's plate size. The core stays
 * square to the world while plates twist, so in the plate frame it is a
 * rotated square — tested exactly (separating axes), not by its bounding box.
 *
 * Unit mix (see UNIT_MIX in lib/tower):
 *   • residential floors: four corner residences, each 2 bed / 2 bath —
 *     master bed + ensuite, second bedroom + bathroom, living, kitchen, dining
 *   • crown: one 4 bed / 4 bath penthouse spread over the crown floors
 * Bedrooms and bathrooms are placed first (with fallback spots) so they win
 * the space on small or tapered plates.
 *
 * Non-rect plan shapes: the recipes still work on the bounding box, but the
 * planner also rejects any piece whose footprint (plus the wall margin) is
 * not fully inside the plan outline, so ellipses, triangles, L's and crosses
 * are furnished only where there is floor.
 */
import type { PlanShape, ZoneId } from "@/types";
import { penthouseBedsOnFloor, planOutline, pointInPolygon, type PlanPoint } from "@/lib/tower";
import { PIECES, type PieceId } from "./kit";

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
const CORRIDOR = 1.2;

class Planner {
  readonly placements: Placement[] = [];
  private rects: Rect[] = [];
  /** Keep-out half-size around the core (core + corridor), and its angle in the plate frame. */
  private coreKeep: number;
  private coreCos: number;
  private coreSin: number;

  constructor(private halfW: number, private halfD: number, coreHalf: number, coreAngle: number, private outline: PlanPoint[] | null = null) {
    this.coreKeep = coreHalf + CORRIDOR;
    this.coreCos = Math.cos(coreAngle);
    this.coreSin = Math.sin(coreAngle);
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

  /** Try to place a piece; returns false (and places nothing) if it doesn't fit. */
  add(piece: PieceId, x: number, z: number, rot = 0): boolean {
    const { w, d } = PIECES[piece];
    // Axis-aligned bounds of the rotated footprint
    const c = Math.abs(Math.cos(rot));
    const s = Math.abs(Math.sin(rot));
    const hw = (w * c + d * s) / 2;
    const hd = (w * s + d * c) / 2;
    const r: Rect = { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };

    const inside = r.x0 >= -this.halfW + WALL_MARGIN && r.x1 <= this.halfW - WALL_MARGIN && r.z0 >= -this.halfD + WALL_MARGIN && r.z1 <= this.halfD - WALL_MARGIN;
    if (!inside || this.hitsCore(r) || this.rects.some((o) => overlaps(r, o))) return false;
    if (this.outline && !rectInPolygon(r, this.outline, WALL_MARGIN)) return false;

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

function residential(p: Planner, A: number, B: number) {
  // Four corner residences, mirrored. Each is 2 bed / 2 bath.
  for (const [sx, sz] of QUADRANTS) {
    // 1 · master bedroom + ensuite (top corner)
    suite(p, sx, sz, A, B);
    // 2 · second bedroom + bathroom (along the side facade, towards the neighbour)
    p.addFirst(sx, sz, "bedDouble", [
      [A - 1.5, 1.6, -Math.PI / 2],
      [A - 1.5, 4.4, -Math.PI / 2],
      [1.7, B - 1.5, Math.PI],
    ]);
    p.addFirst(sx, sz, "bathroom", [
      [A - 4.6, 1.55, -Math.PI / 2],
      [A - 4.6, 4.2, -Math.PI / 2],
      [4.4, B - 1.45, Math.PI],
    ]);
    // 3 · living, kitchen, dining
    p.addMirrored(sx, sz, "archWall", A - 2.1, B - 3.0); // arched doorway into the master bedroom
    p.addMirrored(sx, sz, "living", A - 2.2, B - 5.1, -Math.PI / 2); // sofa backs onto the window
    p.addMirrored(sx, sz, "kitchen", A - 8.3, B - 1.9, Math.PI);
    p.addMirrored(sx, sz, "dining4", A - 8.3, B - 5.0, Math.PI / 2);
    p.addMirrored(sx, sz, "plant", A - 0.7, B - 7.6);
    p.addMirrored(sx, sz, "plant", A - 6.8, B - 5.0);
  }
}

/**
 * The crown is ONE 4 bed / 4 bath penthouse. On a single-floor crown every
 * quadrant is a bedroom suite around a central living / kitchen / dining
 * spine. With two or more crown floors, the lowest is the living level (with
 * a guest suite, pool and piano) and the bedrooms are spread over the floors
 * above (see penthouseBedsOnFloor).
 */
function crown(p: Planner, A: number, B: number, zoneIndex: number, crownFloors: number) {
  const beds = penthouseBedsOnFloor(zoneIndex, crownFloors);
  if (crownFloors <= 1) {
    for (const [sx, sz] of QUADRANTS) suite(p, sx, sz, A, B);
    p.add("living", 0, B - 2.3, Math.PI);
    p.add("kitchen", 0, -(B - 1.8));
    p.add("dining6", -(A - 2.6), 0, Math.PI / 2);
    p.add("piano", A - 2.2, 0, -Math.PI / 2);
  } else if (zoneIndex === 0) {
    // Living level + guest suite
    p.add("living", -(A - 2.3), B - 2.3, Math.PI);
    p.add("piano", A - 2.0, B - 2.0, -2.4);
    p.add("dining6", A - 2.2, -(B - 2.5), Math.PI / 2);
    p.add("kitchen", 0, -(B - 1.8));
    const order: [1 | -1, 1 | -1][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    order.slice(0, beds).forEach(([sx, sz]) => suite(p, sx, sz, A, B));
    p.add("archWall", -(A - 2.1), -(B - 3.4));
    p.add("pool", A - 2.4, 0.4);
  } else {
    // Bedroom level(s)
    QUADRANTS.slice(0, beds).forEach(([sx, sz]) => suite(p, sx, sz, A, B));
    p.add("lounge", 0, B - 2.2);
    p.add("lounge", 0, -(B - 2.2));
    p.add("piano", A - 2.0, -(B - 2.0), -0.8);
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
  shape?: PlanShape
): Placement[] {
  const A = widthM / 2;
  const B = depthM / 2;
  const outline = shape && shape.kind !== "rect" ? planOutline(shape, widthM, depthM) : null;
  const p = new Planner(A, B, coreHalfM, coreAngle, outline);
  if (zone === "office") office(p, A, B);
  else if (zone === "residential") residential(p, A, B);
  else if (zone === "crown") crown(p, A, B, zoneIndex, crownFloors);
  else podium(p, A, B);
  return p.placements;
}
