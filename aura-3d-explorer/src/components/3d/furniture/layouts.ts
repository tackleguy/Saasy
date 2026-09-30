/**
 * Furniture layouts — where each piece goes on a floor plate.
 * -----------------------------------------------------------------------------
 * Works in real metres in the plate's local (un-twisted) frame. A tiny
 * planner rejects any piece that would leave the plate, clip the lift core
 * (plus a circulation corridor) or collide with a piece already placed, so
 * the same recipe adapts to every building's plate size.
 */
import type { ZoneId } from "@/types";
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
  private core: Rect;

  constructor(private halfW: number, private halfD: number, coreHalf: number) {
    const c = coreHalf + CORRIDOR;
    this.core = { x0: -c, x1: c, z0: -c, z1: c };
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
    if (!inside || overlaps(r, this.core) || this.rects.some((o) => overlaps(r, o))) return false;

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

function residential(p: Planner, A: number, B: number) {
  // One apartment per quadrant around the core, mirrored.
  for (const [sx, sz] of QUADRANTS) {
    p.addMirrored(sx, sz, "bed", A - 2.0, B - 1.5, Math.PI); // headboard against the facade
    p.addMirrored(sx, sz, "archWall", A - 2.1, B - 3.0); // arched doorway into the bedroom
    p.addMirrored(sx, sz, "wardrobe", A - 4.9, B - 0.65, Math.PI);
    p.addMirrored(sx, sz, "living", A - 2.2, B - 5.1, -Math.PI / 2); // sofa backs onto the window
    p.addMirrored(sx, sz, "kitchen", A - 8.3, B - 1.9, Math.PI);
    p.addMirrored(sx, sz, "dining4", A - 8.3, B - 5.0, Math.PI / 2);
    p.addMirrored(sx, sz, "plant", A - 0.7, B - 7.6);
    p.addMirrored(sx, sz, "plant", A - 6.1, B - 2.9);
  }
}

function crown(p: Planner, A: number, B: number, variant: number) {
  if (variant % 2 === 0) {
    // Private penthouse
    p.add("living", -(A - 2.3), B - 2.3, Math.PI);
    p.add("piano", A - 2.0, B - 2.0, -2.4);
    p.add("dining6", A - 2.2, -(B - 2.5), Math.PI / 2);
    p.add("kitchen", 0, -(B - 1.8));
    p.add("bed", -(A - 2.0), -(B - 1.6));
    p.add("archWall", -(A - 2.1), -(B - 3.4));
    p.add("tub", -(A - 4.8), -(B - 1.5));
    p.add("pool", A - 2.4, 0.4);
  } else {
    // Sky lounge
    p.add("lounge", -(A - 2.4), B - 2.2);
    p.add("lounge", -(A - 2.4), -(B - 2.2));
    p.add("kitchen", 0, B - 1.8, Math.PI);
    p.add("piano", A - 2.0, -(B - 2.0), -0.8);
    for (let z = -B + 1.5; z <= B - 1.5; z += 1.8) p.add("cafe", A - 1.4, z);
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
 * @param widthM   plate width in metres
 * @param depthM   plate depth in metres
 * @param coreHalfM half the core size in metres
 * @param variant  per-floor variation (e.g. zone index)
 */
export function layoutFloor(zone: ZoneId, widthM: number, depthM: number, coreHalfM: number, variant = 0): Placement[] {
  const A = widthM / 2;
  const B = depthM / 2;
  const p = new Planner(A, B, coreHalfM);
  if (zone === "office") office(p, A, B);
  else if (zone === "residential") residential(p, A, B);
  else if (zone === "crown") crown(p, A, B, variant);
  else podium(p, A, B);
  return p.placements;
}
