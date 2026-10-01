/**
 * Room plan — interior walls, doors and balconies for a floor plate.
 * -----------------------------------------------------------------------------
 * Pure maths (no React, no Three.js). Everything is in REAL METRES in the
 * plate's local (un-twisted) frame — the same frame the furniture planner
 * (`components/3d/furniture/layouts.ts`) works in — so walls line up with the
 * furniture on every plate size, shape and twist.
 *
 * The plan is derived from the furniture that was actually placed (the
 * planner drops pieces that don't fit, and uses fallback spots), not from the
 * recipes, so rooms follow what is on the floor:
 *
 *   residential  • a corridor ring around the core (demising construction),
 *                  as wide as the gallery (lib/coreLayout `galleryWidthM`)
 *                  with a bump that encloses the lift lobby in front of the
 *                  core's +Z face (building frame — the core never twists)
 *                • four demising walls on the plate axes, core → facade,
 *                  splitting the four apartments. They have NO openings: if
 *                  a piece of furniture straddles an axis the wall jogs round
 *                  it (into the neighbour) instead of leaving a gap, so units
 *                  only connect through the corridor.
 *                • one front door per apartment in the corridor ring
 *                • per apartment, a master suite (bed + ensuite) and a second
 *                  bedroom (bed + bathroom) enclosed by partitions. The arch
 *                  wall piece, when present, becomes the bedroom's doorway
 *                  (it gets a pair of arched door leaves); bathrooms keep
 *                  their own kit walls and get a real door leaf, plus a
 *                  cased opening only where the strip in front of their
 *                  doorway is too narrow to walk. The walk-in wardrobe joins
 *                  the master suite.
 *                • service rooms (furniture/rooms: WC, laundry, coat closet,
 *                  pantry, WIR, study): partitions drawn inside the piece's
 *                  footprint (none on a side backed by a demising axis, the
 *                  corridor ring or the facade), a walnut door or closet
 *                  bifold on its +Z face, tiled floors in wet rooms and a
 *                  stone foyer patch. The front door goes in the ring opposite
 *                  the unit's foyer.
 *   crown        • a partitioned suite around every bed (+ nearest bath) and
 *                  a glass screen round the plunge pool. No ring (one home).
 *   office       • glass lobby screen round the core with two glass sliders,
 *                  a glass meeting room around the conference table and a
 *                  pantry partition with a door.
 *   podium       • glass lobby screens round the core with two sliders.
 *
 * Every wall is clipped to the plate outline (inset a hair from the glass),
 * to the core, the corridor ring, and the lift lobby, which is kept clear of
 * walls and doors. Partition walls are also clipped against the furniture
 * footprints (grown by a small clearance) so they never cut through a piece;
 * leftover stubs shorter than MIN_PIECE are dropped.
 *
 * Wall segments carry their openings as distances (metres) along a → b.
 * `swing` is the side a leaf opens into: +1 = the left normal of a → b,
 * n = (−dz, dx); `hinge` is the jamb the leaf hangs on.
 *
 * `wallColliders` / `pushOutOfWalls` give the walk-through a solid version of
 * the plan (wall runs minus their openings, plus the kit bathroom walls and
 * arch walls).
 *
 * Balconies (`balconyPlan`) are planned here too: a strip of facade per
 * apartment (per penthouse terrace on the crown) walked along the outline,
 * so curved plates get an arc.
 */
import type { PlanShape, ZoneId } from "@/types";
import { edgeNormal, offsetOutline, planOutline, pointInPolygon, type PlanPoint } from "@/lib/tower";
import { isServiceRoom, SERVICE_ROOMS } from "@/components/3d/furniture/rooms";
import { galleryWidthM } from "@/lib/coreLayout";

export type Pt = PlanPoint;

/* -------------------------------------------------------------------- types */

export type WallKind = "demising" | "partition" | "glass";
export type OpeningKind = "door" | "slider" | "passage" | "bifold";

export interface Opening {
  /** Start / end of the opening along the wall, metres from `a`. */
  t0: number;
  t1: number;
  /** door = hinged leaf, slider = glass sliding leaf, passage = cased opening without a leaf. */
  kind: OpeningKind;
  /** Side the leaf opens into: +1 = left normal of a → b. */
  swing: 1 | -1;
  /** Jamb the leaf hangs on. */
  hinge: "t0" | "t1";
}

export interface WallSegment {
  a: Pt;
  b: Pt;
  thickness: number;
  height: number;
  kind: WallKind;
  openings: Opening[];
  /** What the wall is for (ring, demising, room:…, meeting, pantry, pool). */
  role: string;
}

/** A door to draw: an opening in a planned wall or in a furniture-kit wall. */
export interface DoorSpec {
  /** Jambs of the opening (plate-local metres). */
  a: Pt;
  b: Pt;
  kind: OpeningKind;
  swing: 1 | -1;
  hinge: "a" | "b";
  /** Clear opening height (the arch spring + radius for arched doors). */
  height: number;
  wallThickness: number;
  /** Glass leaves (sliders / glass partitions). */
  glass: boolean;
  /** 2 = a pair of leaves meeting in the middle. */
  leaves: 1 | 2;
  /** Round-headed opening (kit arch wall): no frame, half-arch leaves. */
  arch?: { spring: number; radius: number };
}

/** A solid wall run for collision: a capsule of half-width `r` around a → b. */
export interface Collider {
  a: Pt;
  b: Pt;
  r: number;
}

export interface LobbyPatch {
  /** Centre, plate-local metres. */
  center: Pt;
  halfW: number;
  halfD: number;
  /** Y rotation to apply inside the twisted plate group (= −floor.rotationY). */
  rotY: number;
}

export interface RoomPlan {
  walls: WallSegment[];
  doors: DoorSpec[];
  colliders: Collider[];
  /** Lift lobby floor patch in front of the lift bank. */
  lobby: LobbyPatch;
  /** Pale tile floor patches (kitchens), plate-local metres. */
  tiles: { x0: number; x1: number; z0: number; z1: number }[];
  /** Stone floor patches (apartment foyers), plate-local metres. */
  stone?: { x0: number; x1: number; z0: number; z1: number }[];
  /** Wall height, metres. */
  height: number;
}

/** A placed furniture piece (from layoutFloor + the kit footprints). */
export interface PlacedPiece {
  piece: string;
  x: number;
  z: number;
  rot: number;
  /** Footprint (unrotated), metres. */
  w: number;
  d: number;
}

export interface RoomPlanInput {
  zone: ZoneId;
  widthM: number;
  depthM: number;
  shape?: PlanShape;
  /** Half the core side, metres. */
  coreHalfM: number;
  /** Plate twist (floor.rotationY). The core and lift stay square to the building. */
  rotationY: number;
  zoneIndex: number;
  crownFloors: number;
  pieces: PlacedPiece[];
  /** Lift lobby in front of the core's +Z face (building frame), kept clear of walls and doors. */
  lobby: { halfWidthM: number; depthM: number };
  /** Clear floor-to-ceiling height, metres. */
  clearHeightM: number;
  /**
   * Amenity floors (open plan — pass zone "podium"): glass rooms to enclose.
   * Each entry lists piece ids; a single id gets one room per piece (spa
   * treatment rooms), several ids share one room (cinema screen + rows).
   */
  glassRooms?: string[][];
}

/* ---------------------------------------------------------------- constants */

export const DOOR_W = 0.9;
export const DOOR_H = 2.05;
/** Leaves are drawn open by this much (radians) so every opening reads clearly from above. */
export const DOOR_OPEN = (75 * Math.PI) / 180;

const T_DEMISING = 0.22;
const T_PARTITION = 0.13;
const T_GLASS = 0.05;
/** Gap left between a wall and furniture. */
const CLEAR = 0.03;
/** Room boxes grow this much around their furniture. */
const GROW = 0.15;
/** A room side this close to a facade / plate axis snaps onto it (no wall). */
const SNAP = 0.7;
/** Wall stubs shorter than this are dropped. */
const MIN_PIECE = 0.45;
/** The outline is inset this much so walls stop at the inside of the glass. */
const GLASS_INSET = 0.04;

/* Kit geometry (mirrors components/3d/furniture/kit.ts) */
/** Bathroom: 2.6 × 2.3 m box, 0.1 m walls, doorway x ∈ [−0.65, 0.2] on its +Z wall. */
const BATH = { hw: 1.3, hd: 1.15, wallZ: 1.1, doorX0: -0.65, doorX1: 0.2, t: 0.1 };
/** Arch wall: 3.2 m long, 0.15 m thick, round-headed opening r 0.62 springing at 1.55 m. */
export const ARCH = { w: 3.2, t: 0.15, r: 0.62, spring: 1.55 };

/* ------------------------------------------------------------------ vectors */

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** Left normal of a direction. */
const leftN = (d: Pt): Pt => [-d[1], d[0]];

/** Furniture-kit local point → plate (same convention as kit `place`). */
function local(p: { x: number; z: number; rot: number }, lx: number, lz: number): Pt {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}
/** Kit-local direction → plate. */
function localDir(rot: number, lx: number, lz: number): Pt {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [lx * c + lz * s, -lx * s + lz * c];
}

/* -------------------------------------------------------------- rectangles */

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** An oriented rectangle: centre, unit axes, half sizes. */
interface ORect {
  c: Pt;
  ux: Pt;
  uz: Pt;
  hx: number;
  hz: number;
}

/** Axis-aligned footprint of a placed piece (same maths as the furniture planner). */
export function pieceRect(p: PlacedPiece): Rect {
  const c = Math.abs(Math.cos(p.rot));
  const s = Math.abs(Math.sin(p.rot));
  const hw = (p.w * c + p.d * s) / 2;
  const hd = (p.w * s + p.d * c) / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd };
}

const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const union = (a: Rect, b: Rect): Rect => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) });
const rectToO = (r: Rect): ORect => ({ c: [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2], ux: [1, 0], uz: [0, 1], hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2 });

/**
 * Parameter range [t0, t1] ⊂ [0, 1] of segment a → b inside an oriented
 * rectangle grown by `m` (Liang–Barsky in the rectangle's frame), or null.
 */
function segRectRange(a: Pt, b: Pt, r: ORect, m: number): [number, number] | null {
  const pa = sub(a, r.c);
  const pb = sub(b, r.c);
  const x0 = dot(pa, r.ux), z0 = dot(pa, r.uz);
  const dx = dot(pb, r.ux) - x0, dz = dot(pb, r.uz) - z0;
  const hx = r.hx + m, hz = r.hz + m;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (clip(-dx, x0 + hx) && clip(dx, hx - x0) && clip(-dz, z0 + hz) && clip(dz, hz - z0) && t1 > t0) return [t0, t1];
  return null;
}

/* ---------------------------------------------------------------- intervals */

type Iv = [number, number];

function subtractIv(ivs: Iv[], [c0, c1]: Iv): Iv[] {
  const out: Iv[] = [];
  for (const [s0, s1] of ivs) {
    if (c1 <= s0 || c0 >= s1) out.push([s0, s1]);
    else {
      if (c0 > s0) out.push([s0, c0]);
      if (c1 < s1) out.push([c1, s1]);
    }
  }
  return out;
}

/** Parameter intervals (t ∈ [0, 1]) of segment a → b inside a simple polygon. */
function insideIntervals(poly: Pt[], a: Pt, b: Pt): Iv[] {
  const d = sub(b, a);
  const ts = [0, 1];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const e = sub(q, p);
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const ap = sub(p, a);
    const t = (ap[0] * e[1] - ap[1] * e[0]) / den;
    const u = (ap[0] * d[1] - ap[1] * d[0]) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out: Iv[] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i], t1 = ts[i + 1];
    if (t1 - t0 < 1e-6) continue;
    const m = add(a, mul(d, (t0 + t1) / 2));
    if (!pointInPolygon(poly, m[0], m[1])) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - t0) < 1e-6) last[1] = t1;
    else out.push([t0, t1]);
  }
  return out;
}

/* ------------------------------------------------------------ plan context */

interface RawWall {
  a: Pt;
  b: Pt;
  kind: WallKind;
  thickness: number;
  role: string;
  /** Clip against furniture footprints. */
  clipFurniture: boolean;
}

interface Ctx {
  outline: Pt[];
  ring: Pt[] | null;
  lobby: ORect;
  core: ORect;
  obstacles: Rect[];
  height: number;
}

/** Clip a raw wall into solid pieces (no openings yet). */
function clipWall(w: RawWall, ctx: Ctx): WallSegment[] {
  const L = len(sub(w.b, w.a));
  if (L < MIN_PIECE) return [];
  const h = w.thickness / 2;
  let ivs: Iv[] = insideIntervals(ctx.outline, w.a, w.b);
  if (ctx.ring && w.role !== "ring") for (const iv of insideIntervals(ctx.ring, w.a, w.b)) ivs = subtractIv(ivs, iv);
  const cut = (r: [number, number] | null) => {
    if (r) ivs = subtractIv(ivs, r);
  };
  cut(segRectRange(w.a, w.b, ctx.lobby, h));
  cut(segRectRange(w.a, w.b, ctx.core, h));
  if (w.clipFurniture) for (const o of ctx.obstacles) cut(segRectRange(w.a, w.b, rectToO(o), h + CLEAR));
  const u = unit(sub(w.b, w.a));
  return ivs
    .map(([t0, t1]) => [t0 * L, t1 * L] as Iv)
    .filter(([s0, s1]) => s1 - s0 >= MIN_PIECE)
    .map(([s0, s1]) => ({
      a: add(w.a, mul(u, s0)),
      b: add(w.a, mul(u, s1)),
      thickness: w.thickness,
      height: ctx.height,
      kind: w.kind,
      openings: [],
      role: w.role,
    }));
}

/** Does an ajar door leaf (hinge → tip) stay clear of the furniture? */
function leafClear(hinge: Pt, tip: Pt, ctx: Ctx): boolean {
  return !ctx.obstacles.some((o) => segRectRange(hinge, tip, rectToO(o), 0.02));
}

/** Free stretches of a wall piece for a new opening of width `w` (metres along a → b). */
function freeSpans(seg: WallSegment, w: number, endMargin = 0.18): Iv[] {
  const L = len(sub(seg.b, seg.a));
  let ivs: Iv[] = [[endMargin, L - endMargin]];
  for (const o of seg.openings) ivs = subtractIv(ivs, [o.t0 - 0.15, o.t1 + 0.15]);
  return ivs.filter(([s0, s1]) => s1 - s0 >= w);
}

/**
 * Put a door in the first piece (in order) with room for it, nearest to
 * `target`; prefer a leaf that swings into `inside` and clears furniture.
 */
function placeDoor(pieces: WallSegment[], target: Pt, inside: Pt, kind: OpeningKind, ctx: Ctx, width = DOOR_W): boolean {
  for (const seg of pieces) {
    const d = sub(seg.b, seg.a);
    const L = len(d);
    const u = unit(d);
    const n = leftN(u);
    const want = dot(sub(target, seg.a), u);
    let best: number | null = null;
    for (const [s0, s1] of freeSpans(seg, width)) {
      const c = Math.min(Math.max(want, s0 + width / 2), s1 - width / 2);
      if (best === null || Math.abs(c - want) < Math.abs(best - want)) best = c;
    }
    if (best === null || L < width) continue;
    const t0 = best - width / 2;
    const t1 = best + width / 2;
    const mid = add(seg.a, mul(u, best));
    const into: 1 | -1 = dot(sub(inside, mid), n) >= 0 ? 1 : -1;
    // Try: swing in (either hinge), then swing out.
    const combos: [1 | -1, "t0" | "t1"][] = [
      [into, "t0"],
      [into, "t1"],
      [-into as 1 | -1, "t0"],
      [-into as 1 | -1, "t1"],
    ];
    let pick = combos[0];
    if (kind === "door") {
      for (const [sw, hg] of combos) {
        const hingeP = add(seg.a, mul(u, hg === "t0" ? t0 : t1));
        const closed = hg === "t0" ? u : mul(u, -1);
        const open = add(mul(closed, Math.cos(DOOR_OPEN)), mul(n, sw * Math.sin(DOOR_OPEN)));
        if (leafClear(hingeP, add(hingeP, mul(open, width - 0.06)), ctx)) {
          pick = [sw, hg];
          break;
        }
      }
    }
    seg.openings.push({ t0, t1, kind, swing: pick[0], hinge: pick[1] });
    seg.openings.sort((p, q) => p.t0 - q.t0);
    return true;
  }
  return false;
}

/* -------------------------------------------------------------------- rooms */

interface RoomSide {
  a: Pt;
  b: Pt;
  /** Outward normal (away from the room). */
  n: Pt;
  arch: boolean;
}

/**
 * A room box around some furniture: grown, sides near a facade (or a plate
 * axis when `axes`) snap to it and get no wall, and a side next to a
 * parallel arch wall snaps onto the arch (the arch is then its doorway).
 */
function roomSides(core: Rect, A: number, B: number, axes: boolean, arches: PlacedPiece[]): { box: Rect; sides: RoomSide[] } {
  const box = { ...core };
  const facade = { x0: false, x1: false, z0: false, z1: false };
  if (box.x1 > A - SNAP) {
    box.x1 = A;
    facade.x1 = true;
  }
  if (box.x0 < -A + SNAP) {
    box.x0 = -A;
    facade.x0 = true;
  }
  if (box.z1 > B - SNAP) {
    box.z1 = B;
    facade.z1 = true;
  }
  if (box.z0 < -B + SNAP) {
    box.z0 = -B;
    facade.z0 = true;
  }
  if (axes) {
    // The demising walls on the axes close these sides.
    if (box.x0 >= -SNAP && box.x0 < SNAP && box.x1 > SNAP) {
      box.x0 = 0;
      facade.x0 = true;
    }
    if (box.x1 <= SNAP && box.x1 > -SNAP && box.x0 < -SNAP) {
      box.x1 = 0;
      facade.x1 = true;
    }
    if (box.z0 >= -SNAP && box.z0 < SNAP && box.z1 > SNAP) {
      box.z0 = 0;
      facade.z0 = true;
    }
    if (box.z1 <= SNAP && box.z1 > -SNAP && box.z0 < -SNAP) {
      box.z1 = 0;
      facade.z1 = true;
    }
  }
  const arch = { x0: false, x1: false, z0: false, z1: false };
  for (const p of arches) {
    const alongX = Math.abs(Math.sin(p.rot)) < 0.3; // arch runs along x
    if (alongX) {
      const inRange = p.x > box.x0 - 0.5 && p.x < box.x1 + 0.5;
      if (!inRange) continue;
      if (!facade.z0 && Math.abs(p.z - box.z0) < 0.6) {
        box.z0 = p.z;
        arch.z0 = true;
      } else if (!facade.z1 && Math.abs(p.z - box.z1) < 0.6) {
        box.z1 = p.z;
        arch.z1 = true;
      }
    } else {
      const inRange = p.z > box.z0 - 0.5 && p.z < box.z1 + 0.5;
      if (!inRange) continue;
      if (!facade.x0 && Math.abs(p.x - box.x0) < 0.6) {
        box.x0 = p.x;
        arch.x0 = true;
      } else if (!facade.x1 && Math.abs(p.x - box.x1) < 0.6) {
        box.x1 = p.x;
        arch.x1 = true;
      }
    }
  }
  // Extend each wall by half a partition so corners close.
  const e = T_PARTITION / 2;
  const sides: RoomSide[] = [];
  if (!facade.z0) sides.push({ a: [box.x0 - e, box.z0], b: [box.x1 + e, box.z0], n: [0, -1], arch: arch.z0 });
  if (!facade.z1) sides.push({ a: [box.x0 - e, box.z1], b: [box.x1 + e, box.z1], n: [0, 1], arch: arch.z1 });
  if (!facade.x0) sides.push({ a: [box.x0, box.z0 - e], b: [box.x0, box.z1 + e], n: [-1, 0], arch: arch.x0 });
  if (!facade.x1) sides.push({ a: [box.x1, box.z0 - e], b: [box.x1, box.z1 + e], n: [1, 0], arch: arch.x1 });
  return { box, sides };
}

/** Kit bathroom doorway: jambs, and the outward direction of the door. */
function bathDoorway(p: PlacedPiece) {
  return {
    a: local(p, BATH.doorX0, BATH.wallZ),
    b: local(p, BATH.doorX1, BATH.wallZ),
    out: localDir(p.rot, 0, 1),
  };
}

/**
 * If a room wall piece stands just in front of a bathroom doorway, cut a
 * matching cased opening in it so the bathroom stays reachable.
 */
function alignPassage(pieces: WallSegment[], bath: PlacedPiece) {
  const { a, b, out } = bathDoorway(bath);
  const centre = mul(add(a, b), 0.5);
  for (const seg of pieces) {
    const u = unit(sub(seg.b, seg.a));
    const n = leftN(u);
    const dn = dot(out, n);
    if (Math.abs(dn) < 0.9) continue;
    const t = dot(sub(seg.a, centre), n) / dn; // distance along `out` to the wall line
    if (t <= 0 || t > 0.75) continue; // wider strips are walkable inside the room
    const s = dot(sub(add(centre, mul(out, t)), seg.a), u);
    const L = len(sub(seg.b, seg.a));
    const t0 = s - DOOR_W / 2;
    const t1 = s + DOOR_W / 2;
    if (t0 < 0.1 || t1 > L - 0.1) continue;
    if (seg.openings.some((o) => o.t1 > t0 - 0.1 && o.t0 < t1 + 0.1)) continue;
    seg.openings.push({ t0, t1, kind: "passage", swing: 1, hinge: "t0" });
    seg.openings.sort((p, q) => p.t0 - q.t0);
    return;
  }
}

/* ------------------------------------------------------------ demising jogs */

/**
 * Demising wall along a plate axis from the origin outwards (direction `dir`,
 * axis-aligned). Furniture straddling the axis would force a gap, so the
 * wall jogs round each such piece on the side away from the piece's centre.
 */
function demisingRun(dir: Pt, reach: number, obstacles: Rect[]): RawWall[] {
  const along = (p: Pt) => dot(p, dir);
  const perp: Pt = leftN(dir);
  const m = T_DEMISING / 2 + CLEAR;
  // Blocking intervals along the axis, with the jog offset (perpendicular).
  const blocks: { s0: number; s1: number; off: number }[] = [];
  for (const r of obstacles) {
    const g = grow(r, m);
    const corners: Pt[] = [
      [g.x0, g.z0],
      [g.x1, g.z0],
      [g.x1, g.z1],
      [g.x0, g.z1],
    ];
    const ps = corners.map((c) => dot(c, perp));
    const lo = Math.min(...ps), hi = Math.max(...ps);
    if (lo >= 0 || hi <= 0) continue; // doesn't straddle the axis
    const ss = corners.map(along);
    const s0 = Math.min(...ss), s1 = Math.max(...ss);
    if (s1 <= 0) continue;
    const centre = dot([(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2], perp);
    blocks.push({ s0: Math.max(0.01, s0), s1, off: centre >= 0 ? lo : hi });
  }
  blocks.sort((p, q) => p.s0 - q.s0);
  // Merge overlapping blocks (take the larger detour on the same side).
  const merged: typeof blocks = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && b.s0 <= last.s1) {
      last.s1 = Math.max(last.s1, b.s1);
      last.off = Math.abs(b.off) > Math.abs(last.off) && Math.sign(b.off) === Math.sign(last.off) ? b.off : last.off;
    } else merged.push({ ...b });
  }
  const P = (s: number, o = 0): Pt => add(mul(dir, s), mul(perp, o));
  const out: RawWall[] = [];
  const wall = (a: Pt, b: Pt): RawWall => ({ a, b, kind: "demising", thickness: T_DEMISING, role: "demising", clipFurniture: false });
  let s = 0;
  const e = T_DEMISING / 2;
  for (const b of merged) {
    if (b.s0 > s) out.push(wall(P(s), P(b.s0 + e)));
    out.push(wall(P(b.s0), P(b.s0, b.off + Math.sign(b.off) * e)));
    out.push(wall(P(b.s0 - e, b.off), P(b.s1 + e, b.off)));
    out.push(wall(P(b.s1, b.off + Math.sign(b.off) * e), P(b.s1)));
    s = b.s1 - e;
  }
  out.push(wall(P(s), P(reach)));
  return out;
}

/* --------------------------------------------------------------------- plan */

const QUADRANTS: [1 | -1, 1 | -1][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

/** Derive the interior partition plan of one floor. */
export function roomPlan(inp: RoomPlanInput): RoomPlan {
  const A = inp.widthM / 2;
  const B = inp.depthM / 2;
  const outline0 = planOutline(inp.shape ?? { kind: "rect" }, inp.widthM, inp.depthM);
  const outline = offsetOutline(outline0, -GLASS_INSET);
  const height = Math.min(inp.zone === "residential" ? 2.4 : 2.6, Math.max(2.2, inp.clearHeightM - 0.35));
  const doorH = Math.min(DOOR_H, height - 0.2);

  // Building frame (core / lift, never twisted) → plate frame.
  const cr = Math.cos(inp.rotationY);
  const sr = Math.sin(inp.rotationY);
  const toPlate = ([x, z]: Pt): Pt => [x * cr - z * sr, x * sr + z * cr];
  const bx: Pt = [cr, sr]; // building +X in the plate frame
  const bz: Pt = [-sr, cr]; // building +Z (lift face) in the plate frame

  const ch = inp.coreHalfM;
  const lobbyHW = inp.lobby.halfWidthM;
  const lobbyD = inp.lobby.depthM;
  const lobby: ORect = { c: toPlate([0, ch + lobbyD / 2 - 0.05]), ux: bx, uz: bz, hx: lobbyHW, hz: lobbyD / 2 + 0.05 };
  const core: ORect = { c: [0, 0], ux: bx, uz: bz, hx: ch + 0.02, hz: ch + 0.02 };

  const pieces = inp.pieces;
  const obstacles = pieces.map(pieceRect);

  // Corridor ring (building frame) with a bump enclosing the lift lobby. Its
  // width is the gallery the furniture planner keeps clear (lib/coreLayout).
  const withRing = inp.zone !== "crown";
  const R = ch + galleryWidthM(inp.zone, A, B, ch);
  const hb = Math.min(lobbyHW + 0.12, R - 0.3);
  const zb = Math.max(R + 0.3, ch + lobbyD + 0.12);
  const ringB: Pt[] = [
    [-R, -R],
    [R, -R],
    [R, R],
    [hb, R],
    [hb, zb],
    [-hb, zb],
    [-hb, R],
    [-R, R],
  ];
  const ring = withRing ? ringB.map(toPlate) : null;

  const ctx: Ctx = { outline, ring, lobby, core, obstacles, height };

  const walls: WallSegment[] = [];
  const doors: DoorSpec[] = [];
  const extraColliders: Collider[] = [];

  /* ---- corridor ring ---- */
  const ringKind: WallKind = inp.zone === "residential" ? "demising" : "glass";
  const ringT = ringKind === "glass" ? T_GLASS : T_DEMISING;
  const ringPieces: WallSegment[] = [];
  if (ring) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const u = unit(sub(b, a));
      const e = ringT / 2;
      ringPieces.push(...clipWall({ a: sub(a, mul(u, e)), b: add(b, mul(u, e)), kind: ringKind, thickness: ringT, role: "ring", clipFurniture: true }, ctx));
    }
    walls.push(...ringPieces);
  }

  /* ---- demising walls (residential): plate axes, core → facade, no doors ---- */
  if (inp.zone === "residential") {
    const reach = Math.hypot(A, B) + 1;
    for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Pt[]) {
      for (const raw of demisingRun(dir, reach, obstacles)) walls.push(...clipWall(raw, ctx));
    }
  }

  /* ---- front doors: one per apartment (residential) / two lobby sliders ---- */
  if (ring) {
    const want = inp.zone === "residential" ? [0, 1, 2, 3] : [0, 2];
    const best = new Map<number, { seg: WallSegment; s0: number; s1: number; score: number }>();
    // Residential: the front door goes in the ring opposite the unit's foyer (furniture/apartment).
    const foyers = pieces.filter((p) => p.piece === "foyer" || p.piece === "foyerM");
    const foyerIn = (q: number) => foyers.find((f) => Math.sign(f.x || 1) === QUADRANTS[q][0] && Math.sign(f.z || 1) === QUADRANTS[q][1]);
    for (const seg of ringPieces) {
      const d = sub(seg.b, seg.a);
      const L = len(d);
      // Split the piece where it crosses the plate axes (apartment boundaries).
      const ts = [0, L];
      for (const k of [0, 1]) {
        if (Math.abs(d[k]) > 1e-9) {
          const t = (-seg.a[k] / d[k]) * L;
          if (t > 0 && t < L) ts.push(t);
        }
      }
      ts.sort((p, q) => p - q);
      for (let i = 0; i + 1 < ts.length; i++) {
        const s0 = ts[i] + T_DEMISING, s1 = ts[i + 1] - T_DEMISING;
        if (s1 - s0 < DOOR_W + 0.4) continue;
        const m = add(seg.a, mul(d, (s0 + s1) / 2 / L));
        const q = QUADRANTS.findIndex(([sx, sz]) => Math.sign(m[0] || 1) === sx && Math.sign(m[1] || 1) === sz);
        if (!want.includes(q)) continue;
        const f = foyerIn(q);
        const uu = unit(d);
        // Score: distance from the foyer to this span (smaller wins), else the longest span.
        const score = f
          ? len(sub([f.x, f.z], add(seg.a, mul(uu, Math.min(Math.max(dot(sub([f.x, f.z], seg.a), uu), s0), s1)))))
          : -(s1 - s0);
        const cur = best.get(q);
        if (!cur || score < cur.score) best.set(q, { seg, s0, s1, score });
      }
    }
    for (const [q, { seg, s0, s1 }] of best) {
      const u = unit(sub(seg.b, seg.a));
      const f = foyerIn(q);
      const c = f ? Math.min(Math.max(dot(sub([f.x, f.z], seg.a), u), s0 + DOOR_W / 2), s1 - DOOR_W / 2) : (s0 + s1) / 2;
      const mid = add(seg.a, mul(u, c));
      const out: 1 | -1 = dot(leftN(u), mid) >= 0 ? 1 : -1; // into the apartment
      seg.openings.push({ t0: c - DOOR_W / 2, t1: c + DOOR_W / 2, kind: inp.zone === "residential" ? "door" : "slider", swing: out, hinge: "t0" });
      seg.openings.sort((p, q) => p.t0 - q.t0);
    }
  }

  /* ---- rooms ---- */
  const arches = pieces.filter((p) => p.piece === "archWall");
  const baths = pieces.filter((p) => p.piece === "bathroom");
  const claimed = new Set<PlacedPiece>();
  const nearestBath = (p: PlacedPiece) => {
    let best: PlacedPiece | null = null;
    let bd = 5.5;
    for (const b of baths) {
      if (claimed.has(b)) continue;
      const dd = Math.hypot(b.x - p.x, b.z - p.z);
      if (dd < bd) {
        bd = dd;
        best = b;
      }
    }
    if (best) claimed.add(best);
    return best;
  };

  /** Enclose furniture in a room; door towards `target` (the arch serves as door if present). */
  const room = (id: string, members: PlacedPiece[], target: Pt, opts: { kind?: WallKind; door?: OpeningKind; grow?: number; axes?: boolean; baths?: PlacedPiece[] } = {}) => {
    const kind = opts.kind ?? "partition";
    const t = kind === "glass" ? T_GLASS : T_PARTITION;
    const r0 = grow(members.map(pieceRect).reduce(union), opts.grow ?? GROW);
    const nearArches = arches.filter((a) => a.x > r0.x0 - 1 && a.x < r0.x1 + 1 && a.z > r0.z0 - 1 && a.z < r0.z1 + 1);
    const { box, sides } = roomSides(r0, A, B, opts.axes ?? false, nearArches);
    if (!sides.length) return;
    const centre: Pt = [(box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2];
    const bySide: WallSegment[][] = [];
    for (const s of sides) {
      const pcs = clipWall({ a: s.a, b: s.b, kind, thickness: t, role: `room:${id}`, clipFurniture: true }, ctx);
      bySide.push(pcs);
      walls.push(...pcs);
    }
    for (const bth of opts.baths ?? []) alignPassage(bySide.flat(), bth);
    if (sides.some((s) => s.arch)) return; // the arch is the doorway
    // Door on the side facing the target, else the next best.
    const toT = unit(sub(target, centre));
    const order = sides.map((s, i) => ({ i, score: dot(s.n, toT) })).sort((p, q) => q.score - p.score);
    for (const { i } of order) {
      const pcs = [...bySide[i]].sort((p, q) => len(sub(mul(add(p.a, p.b), 0.5), target)) - len(sub(mul(add(q.a, q.b), 0.5), target)));
      if (placeDoor(pcs, target, centre, opts.door ?? "door", ctx)) return;
    }
  };

  /* ---- amenity glass rooms (spa treatment rooms / sauna, cinema) ---- */
  for (const [gi, ids] of (inp.glassRooms ?? []).entries()) {
    const members = pieces.filter((p) => ids.includes(p.piece));
    const groups = ids.length === 1 ? members.map((m) => [m]) : members.length ? [members] : [];
    groups.forEach((g, i) => room(`amenity${gi}-${i}`, g, [0, 0], { kind: "glass", door: "slider", grow: 0.3 }));
  }

  if (inp.zone === "residential") {
    for (const [sx, sz] of QUADRANTS) {
      const inQ = pieces.filter((p) => Math.sign(p.x || 1) === sx && Math.sign(p.z || 1) === sz);
      const living = inQ.find((p) => p.piece === "living");
      const target: Pt = living ? [living.x, living.z] : [(sx * A) / 2, (sz * B) / 2];
      for (const bedKind of ["bed", "bedDouble"]) {
        const bed = inQ.find((p) => p.piece === bedKind);
        if (!bed) continue;
        const bath = nearestBath(bed);
        const wir = bedKind === "bed" ? inQ.find((p) => p.piece === "wir" && Math.hypot(p.x - bed.x, p.z - bed.z) < 6) : undefined;
        room(`${bedKind}${sx}${sz}`, [bed, ...(bath ? [bath] : []), ...(wir ? [wir] : [])], target, { axes: true, baths: bath ? [bath] : [] });
      }
    }
  } else if (inp.zone === "crown") {
    for (const bed of pieces.filter((p) => p.piece === "bed")) {
      const bath = nearestBath(bed);
      room(`suite${bed.x.toFixed(1)}${bed.z.toFixed(1)}`, bath ? [bed, bath] : [bed], [0, 0], { baths: bath ? [bath] : [] });
    }
    const pool = pieces.find((p) => p.piece === "pool");
    if (pool) room("pool", [pool], [0, 0], { kind: "glass", door: "slider", grow: 0.4 });
  } else if (inp.zone === "office") {
    const conf = pieces.find((p) => p.piece === "conference");
    if (conf) room("meeting", [conf], [0, 0], { kind: "glass", door: "slider", grow: 0.35 });
    const pantry = pieces.find((p) => p.piece === "kitchen");
    if (pantry) room("pantry", [pantry], [0, 0], { grow: 0.45 });
  }

  /* ---- service rooms (furniture/rooms): walls inside the footprint, door on the piece's +Z face ---- */
  const tiles: Rect[] = [];
  const stone: Rect[] = [];
  if (inp.zone === "residential") {
    pieces.forEach((p, i) => {
      if (!isServiceRoom(p.piece)) return;
      const sp = SERVICE_ROOMS[p.piece];
      const r = pieceRect(p);
      if (sp.floor === "tile") tiles.push(grow(r, -T_PARTITION));
      if (sp.floor === "stone") stone.push(r);
      if (!sp.door) return;
      // Other furniture only: the room's own contents sit inside its walls.
      const sctx: Ctx = { ...ctx, obstacles: obstacles.filter((_, j) => j !== i) };
      const e = T_PARTITION / 2;
      const bx = { x0: r.x0 + e, x1: r.x1 - e, z0: r.z0 + e, z1: r.z1 - e };
      const dd = localDir(p.rot, 0, 1);
      const doorN: Pt = Math.abs(dd[0]) > Math.abs(dd[1]) ? [Math.sign(dd[0]), 0] : [0, Math.sign(dd[1])];
      type Side = { n: Pt; a: Pt; b: Pt; back: number | null };
      const sides: Side[] = [
        { n: [0, -1], a: [bx.x0, bx.z0], b: [bx.x1, bx.z0], back: null },
        { n: [0, 1], a: [bx.x0, bx.z1], b: [bx.x1, bx.z1], back: null },
        { n: [-1, 0], a: [bx.x0, bx.z0], b: [bx.x0, bx.z1], back: null },
        { n: [1, 0], a: [bx.x1, bx.z0], b: [bx.x1, bx.z1], back: null },
      ];
      // A side backed by a demising axis, the corridor ring or the facade gets no wall of its own.
      for (const sd of sides) {
        if (sd.n[0] === doorN[0] && sd.n[1] === doorN[1]) continue;
        const mid = mul(add(sd.a, sd.b), 0.5);
        const k = sd.n[0] !== 0 ? 0 : 1;
        const toAxis = -mid[k] * (sd.n[k] as number); // distance to the axis, outwards
        if (toAxis > 0 && toAxis < 0.45) sd.back = toAxis + T_DEMISING / 2;
        else {
          const probe = add(mid, mul(sd.n, 0.45));
          if ((ring && pointInPolygon(ring, probe[0], probe[1])) || !pointInPolygon(outline, probe[0], probe[1])) sd.back = 0.5;
        }
      }
      const extOf = (n: Pt) => sides.find((x) => x.n[0] === n[0] && x.n[1] === n[1])!.back ?? e;
      for (const sd of sides) {
        if (sd.back !== null) continue;
        const dir = unit(sub(sd.b, sd.a));
        const n0: Pt = sd.n[0] === 0 ? [-1, 0] : [0, -1]; // side at the start of a → b
        const n1: Pt = sd.n[0] === 0 ? [1, 0] : [0, 1];
        const a = sub(sd.a, mul(dir, extOf(n0)));
        const b = add(sd.b, mul(dir, extOf(n1)));
        const pcs = clipWall({ a, b, kind: "partition", thickness: T_PARTITION, role: `room:${p.piece}`, clipFurniture: true }, sctx);
        walls.push(...pcs);
        if (sd.n[0] !== doorN[0] || sd.n[1] !== doorN[1]) continue;
        // The door: centred on the spec's local x, on whichever clipped piece holds it.
        const want = local(p, sp.doorAt, 0);
        const W = sp.doorW;
        for (const seg of pcs) {
          const L = len(sub(seg.b, seg.a));
          const u = unit(sub(seg.b, seg.a));
          const sAt = dot(sub(want, seg.a), u);
          if (L < W + 0.16 || sAt < -0.3 || sAt > L + 0.3) continue;
          const c = Math.min(Math.max(sAt, W / 2 + 0.08), L - W / 2 - 0.08);
          const ln = leftN(u);
          const outSide: 1 | -1 = dot(ln, sd.n) >= 0 ? 1 : -1;
          let swing: 1 | -1 = sp.swing === "out" || sp.door === "bifold" ? outSide : (-outSide as 1 | -1);
          let hinge: "t0" | "t1" = "t0";
          if (sp.door === "door") {
            const centre: Pt = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
            // Hang the leaf on the jamb nearer the room's side wall, so it folds back against it.
            hinge = dot(sub(centre, seg.a), u) > c ? "t0" : "t1";
            if (sp.swing === "out") {
              const ok = (sw: 1 | -1, hg: "t0" | "t1") => {
                const hp = add(seg.a, mul(u, hg === "t0" ? c - W / 2 : c + W / 2));
                const closed = hg === "t0" ? u : mul(u, -1);
                const open = add(mul(closed, Math.cos(DOOR_OPEN)), mul(ln, sw * Math.sin(DOOR_OPEN)));
                return leafClear(hp, add(hp, mul(open, W - 0.06)), sctx);
              };
              const alt: "t0" | "t1" = hinge === "t0" ? "t1" : "t0";
              if (!ok(swing, hinge)) {
                if (ok(swing, alt)) hinge = alt;
                else swing = -swing as 1 | -1; // nothing clear outside: open inwards
              }
            }
          }
          seg.openings.push({ t0: c - W / 2, t1: c + W / 2, kind: sp.door, swing, hinge });
          break;
        }
      }
    });
  }

  /* ---- door specs: planned openings ---- */
  for (const w of walls) {
    const u = unit(sub(w.b, w.a));
    for (const o of w.openings) {
      doors.push({
        a: add(w.a, mul(u, o.t0)),
        b: add(w.a, mul(u, o.t1)),
        kind: o.kind,
        swing: o.swing,
        hinge: o.hinge === "t0" ? "a" : "b",
        height: doorH,
        wallThickness: w.thickness,
        glass: w.kind === "glass" || o.kind === "slider",
        leaves: 1,
      });
    }
  }

  /* ---- kit walls: a real door in every bathroom doorway and arched pair in every arch ---- */
  for (const b of baths) {
    const { a, b: bb } = bathDoorway(b);
    // Left normal of a → b is the bathroom's outside, so −1 swings the leaf into the bathroom.
    doors.push({ a, b: bb, kind: "door", swing: -1, hinge: "a", height: DOOR_H, wallThickness: BATH.t, glass: false, leaves: 1 });
    const seg = (x0: number, z0: number, x1: number, z1: number) => extraColliders.push({ a: local(b, x0, z0), b: local(b, x1, z1), r: BATH.t / 2 });
    seg(-BATH.hw, -BATH.wallZ, BATH.hw, -BATH.wallZ);
    seg(-BATH.hw + 0.05, -BATH.hd, -BATH.hw + 0.05, BATH.hd);
    seg(BATH.hw - 0.05, -BATH.hd, BATH.hw - 0.05, BATH.hd);
    seg(-BATH.hw, BATH.wallZ, BATH.doorX0, BATH.wallZ);
    seg(BATH.doorX1, BATH.wallZ, BATH.hw, BATH.wallZ);
  }
  for (const ar of arches) {
    const a = local(ar, -ARCH.r, 0);
    const b = local(ar, ARCH.r, 0);
    const n = leftN(unit(sub(b, a)));
    // Swing into the bedroom behind the arch (the nearest bed), else away from the core.
    const bed = pieces
      .filter((p) => p.piece === "bed" || p.piece === "bedDouble")
      .sort((p, q) => Math.hypot(p.x - ar.x, p.z - ar.z) - Math.hypot(q.x - ar.x, q.z - ar.z))[0];
    const towards: Pt = bed && Math.hypot(bed.x - ar.x, bed.z - ar.z) < 4.5 ? sub([bed.x, bed.z], [ar.x, ar.z]) : [ar.x, ar.z];
    doors.push({
      a,
      b,
      kind: "door",
      swing: dot(towards, n) >= 0 ? 1 : -1,
      hinge: "a",
      height: ARCH.spring + ARCH.r,
      wallThickness: ARCH.t,
      glass: false,
      leaves: 2,
      arch: { spring: ARCH.spring, radius: ARCH.r },
    });
    extraColliders.push({ a: local(ar, -ARCH.w / 2, 0), b: local(ar, -ARCH.r, 0), r: ARCH.t / 2 });
    extraColliders.push({ a: local(ar, ARCH.r, 0), b: local(ar, ARCH.w / 2, 0), r: ARCH.t / 2 });
  }

  /* ---- colliders: solid runs between openings ---- */
  const colliders: Collider[] = [...extraColliders];
  for (const w of walls) {
    const u = unit(sub(w.b, w.a));
    const L = len(sub(w.b, w.a));
    let s = 0;
    for (const o of w.openings) {
      if (o.t0 - s > 0.02) colliders.push({ a: add(w.a, mul(u, s)), b: add(w.a, mul(u, o.t0)), r: w.thickness / 2 });
      s = o.t1;
    }
    if (L - s > 0.02) colliders.push({ a: add(w.a, mul(u, s)), b: w.b, r: w.thickness / 2 });
  }

  return {
    walls,
    doors,
    colliders,
    lobby: { center: lobby.c, halfW: lobbyHW, halfD: lobbyD / 2, rotY: -inp.rotationY },
    tiles: [
      ...pieces
        .filter((p) => p.piece === "kitchen")
        .map((p) => {
          const r = grow(pieceRect(p), 0.35);
          return { x0: Math.max(r.x0, -A), x1: Math.min(r.x1, A), z0: Math.max(r.z0, -B), z1: Math.min(r.z1, B) };
        }),
      ...tiles,
    ],
    stone,
    height,
  };
}

/* ------------------------------------------------------------- walk-through */

/** Solid wall runs (openings removed) for collision. */
export const wallColliders = (plan: RoomPlan): Collider[] => plan.colliders;

/**
 * Push a point (plate-local metres) out of every wall capsule it overlaps,
 * keeping `radius` of clearance. Two passes settle corners.
 */
export function pushOutOfWalls(x: number, z: number, colliders: Collider[], radius: number): Pt {
  let px = x, pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - c.a[0]) * dx + (pz - c.a[1]) * dz) / l2));
      const qx = c.a[0] + dx * t, qz = c.a[1] + dz * t;
      let ox = px - qx, oz = pz - qz;
      const dist = Math.hypot(ox, oz);
      const min = c.r + radius;
      if (dist >= min) continue;
      if (dist < 1e-6) {
        // Exactly on the wall line: step out along its normal.
        const l = Math.sqrt(l2);
        ox = -dz / l;
        oz = dx / l;
      } else {
        ox /= dist;
        oz /= dist;
      }
      px = qx + ox * min;
      pz = qz + oz * min;
    }
  }
  return [px, pz];
}

/* ---------------------------------------------------------------- balconies */

export interface BalconySpec {
  /** Facade line of the balcony (along the outline, CCW order), metres. */
  inner: Pt[];
  /** Outer edge (inner offset outwards by `depth`). */
  outer: Pt[];
  depth: number;
  /** Sliding door in the curtain wall: jambs on the glass line and outward normal. */
  door: { a: Pt; b: Pt; n: Pt };
  /** Bistro set: table centre and two chairs facing it. */
  table: Pt;
  chairs: { p: Pt; rot: number }[];
  /** Draw a slab + balustrade (false when the facade balcony band already provides them). */
  slab: boolean;
}

export const BALCONY_DEPTH = 1.5;
const BALCONY_LEN = 5.2;
/** Stop walking the outline at corners sharper than this. */
const BALCONY_CORNER = (32 * Math.PI) / 180;

/** Arc-length walk along a CCW outline from point P on edge i, forwards (+1) or backwards (−1). */
function walkOutline(poly: Pt[], i: number, P: Pt, dirSign: 1 | -1, maxLen: number, ok: (p: Pt) => boolean): Pt[] {
  const n = poly.length;
  const pts: Pt[] = [];
  let cur = P;
  let edge = i;
  let left = maxLen;
  let prevDir: Pt | null = null;
  const step = 0.1;
  for (let guard = 0; guard < n + 2 && left > 1e-6; guard++) {
    const end = dirSign > 0 ? poly[(edge + 1) % n] : poly[edge];
    const d = sub(end, cur);
    const L = len(d);
    const u: Pt = L > 1e-9 ? mul(d, 1 / L) : (prevDir ?? [1, 0]);
    if (prevDir && Math.acos(Math.max(-1, Math.min(1, dot(prevDir, u)))) > BALCONY_CORNER) break;
    // March along this edge in small steps, checking the constraint.
    const go = Math.min(L, left);
    let s = 0;
    let stopped = false;
    while (s < go - 1e-9) {
      const ns = Math.min(go, s + step);
      if (!ok(add(cur, mul(u, ns)))) {
        stopped = true;
        break;
      }
      s = ns;
    }
    cur = add(cur, mul(u, s));
    left -= s;
    pts.push(cur);
    if (stopped || s < L - 1e-9) break;
    prevDir = u;
    edge = dirSign > 0 ? (edge + 1) % n : (edge + n - 1) % n;
  }
  return pts;
}

/** First hit of the ray origin → dir with the outline: point + edge index. */
function rayHit(poly: Pt[], dir: Pt): { P: Pt; i: number } | null {
  let best: { P: Pt; i: number; t: number } | null = null;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const e = sub(poly[(i + 1) % poly.length], p);
    const den = dir[0] * e[1] - dir[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const t = (p[0] * e[1] - p[1] * e[0]) / den;
    const u = (p[0] * dir[1] - p[1] * dir[0]) / den;
    if (t > 0 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { P: mul(dir, t), i, t };
  }
  return best;
}

/**
 * Balconies for a floor: residential → one per apartment on its side facade,
 * in front of the living room; crown → two penthouse terraces on the ±Z
 * facades. `bandAsSlab`: the building already has a continuous balcony band
 * (facade.balconies), so only doors and furniture are added on top of it.
 */
export function balconyPlan(zone: ZoneId, widthM: number, depthM: number, shape: PlanShape | undefined, bandAsSlab: boolean): BalconySpec[] {
  if (zone !== "residential" && zone !== "crown") return [];
  const A = widthM / 2;
  const B = depthM / 2;
  const poly = planOutline(shape ?? { kind: "rect" }, widthM, depthM);
  const depth = bandAsSlab ? 1.6 : BALCONY_DEPTH;
  const targets: { dir: Pt; ok: (p: Pt) => boolean; len: number }[] = [];
  if (zone === "residential") {
    for (const [sx, sz] of QUADRANTS) {
      const v = Math.min(Math.max(B - 5.4, B * 0.35), B * 0.7);
      targets.push({
        dir: unit([sx * A, sz * v]),
        ok: (p) => Math.sign(p[0]) === sx && Math.sign(p[1]) === sz && Math.abs(p[0]) > 0.9 && Math.abs(p[1]) > 0.9,
        len: Math.min(BALCONY_LEN, B * 0.8),
      });
    }
  } else {
    for (const sz of [1, -1]) targets.push({ dir: [0, sz], ok: (p) => Math.abs(p[0]) < A * 0.6, len: Math.min(BALCONY_LEN + 1, A * 1.1) });
  }
  const out: BalconySpec[] = [];
  for (const t of targets) {
    const hit = rayHit(poly, t.dir);
    if (!hit) continue;
    const fwd = walkOutline(poly, hit.i, hit.P, 1, t.len / 2, t.ok);
    const back = walkOutline(poly, hit.i, hit.P, -1, t.len / 2, t.ok);
    const inner: Pt[] = [...back.reverse(), hit.P, ...fwd].filter((p, k, arr) => k === 0 || len(sub(p, arr[k - 1])) > 0.05);
    let total = 0;
    for (let k = 1; k < inner.length; k++) total += len(sub(inner[k], inner[k - 1]));
    if (inner.length < 2 || total < 2.4) continue;
    // Vertex normals (outward for a CCW outline).
    const normals = inner.map((_, k) => {
      const a = inner[Math.max(0, k - 1)];
      const b = inner[Math.min(inner.length - 1, k + 1)];
      const nn = edgeNormal(a[0], a[1], b[0], b[1]);
      return unit(nn);
    });
    const outer = inner.map((p, k) => add(p, mul(normals[k], depth)));
    // Mid-point along the arc, tangent and normal there.
    let acc = 0;
    let mid = inner[0];
    let tan: Pt = unit(sub(inner[1], inner[0]));
    for (let k = 1; k < inner.length; k++) {
      const seg = len(sub(inner[k], inner[k - 1]));
      if (acc + seg >= total / 2) {
        const f = (total / 2 - acc) / seg;
        mid = add(inner[k - 1], mul(sub(inner[k], inner[k - 1]), f));
        tan = unit(sub(inner[k], inner[k - 1]));
        break;
      }
      acc += seg;
    }
    const nrm: Pt = [tan[1], -tan[0]]; // outward (CCW)
    const doorW = Math.min(1.8, total - 0.6);
    const door = { a: add(mid, mul(tan, -doorW / 2)), b: add(mid, mul(tan, doorW / 2)), n: nrm };
    // Bistro set to one side of the door, so the doorway stays clear.
    const side = Math.min(total / 4, 1.3);
    const table = add(add(mid, mul(tan, side)), mul(nrm, depth * 0.55));
    const faceTable = (p: Pt) => Math.atan2(table[0] - p[0], table[1] - p[1]); // kit pieces face +Z
    const chairs = [-0.62, 0.62].map((o) => {
      const p = add(table, mul(tan, o));
      return { p, rot: faceTable(p) };
    });
    out.push({ inner, outer, depth, door, table, chairs, slab: !bandAsSlab });
  }
  return out;
}
