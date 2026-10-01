/**
 * Apartment recipe — one residential corner unit, quadrant by quadrant.
 * -----------------------------------------------------------------------------
 * Quadrant-local coordinates: u ≥ 0 runs from the plate's z-axis (demising
 * wall) out to the side facade at u = A, v ≥ 0 from the x-axis out to v = B;
 * (sx, sz) mirror them into the quadrant. Facade rooms first, so they win the
 * space on small plates:
 *
 *   1. master bed + ensuite (corner), walk-in wardrobe beside the ensuite
 *   2. second bedroom + its bathroom (side facade, towards the neighbour)
 *   3. arch into the master bedroom, living, kitchen, dining, plants
 *   4. service rooms on the corridor side, slid out from the corridor ring
 *      (works for any core twist — the ring is tested exactly):
 *        · entry: foyer just inside the front door (the room plan puts the
 *          door in the ring opposite the foyer), WC beside it on the
 *          demising wall, coat closet along the ring wall, laundry closet
 *        · study along the other demising wall, pantry beside the kitchen
 *
 * Every service room is optional — if it doesn't fit (small, tapered or
 * oddly shaped plates) it is simply skipped. Pieces keep 0.25 m off the
 * corridor ring so the ring wall never has to be cut around them.
 */
import type { PieceId } from "./kit";
import type { Placement } from "./layouts";

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** The bits of the furniture planner this recipe uses. */
export interface ApartmentPlanner {
  readonly placements: Placement[];
  /** Plan outline of a non-rect plate (null on rect plates). */
  readonly outline: [number, number][] | null;
  /** Edge half-planes (n · p ≤ c) of a convex outline, else null. */
  readonly halfPlanes: [number, number, number][] | null;
  /** Core + gallery keep-out: half-size and its axis (cos, sin) in the plate frame. */
  readonly coreKeep: number;
  readonly coreCos: number;
  readonly coreSin: number;
  readonly footprints: readonly Rect[];
  mark(): [number, number, number];
  reset(m: [number, number, number]): void;
  add(piece: PieceId, x: number, z: number, rot?: number): boolean;
  fits(piece: PieceId, x: number, z: number, rot?: number): Rect | null;
  free(r: Rect): boolean;
  addMirrored(sx: 1 | -1, sz: 1 | -1, piece: PieceId, u: number, v: number, rot?: number): boolean;
  addFirst(sx: 1 | -1, sz: 1 | -1, piece: PieceId, spots: [u: number, v: number, rot: number][]): boolean;
  blocked(r: Rect, grow?: number, ignoreClear?: boolean): boolean;
  keepOuts: { c: [number, number]; ux: [number, number]; hx: number; hz: number; grows?: boolean; clear?: boolean }[];
}

type Dir = [number, number];
const U: Dir = [1, 0];
const V: Dir = [0, 1];
const neg = (d: Dir): Dir => [-d[0], -d[1]];

/** Clearance kept from the corridor ring (and the lift-lobby bump). */
const RING_GAP = 0.25;
const PI = Math.PI;

/** Quadrant-local rect of a placement (u/v ranges), or null if it isn't in the quadrant. */
function qRect(p: Placement, w: number, d: number, sx: number, sz: number) {
  const c = Math.abs(Math.cos(p.rot));
  const s = Math.abs(Math.sin(p.rot));
  const hw = (w * c + d * s) / 2;
  const hd = (w * s + d * c) / 2;
  const u = p.x * sx;
  const v = p.z * sz;
  return { u0: u - hw, u1: u + hw, v0: v - hd, v1: v + hd };
}

/** Quadrant-local placing helpers shared by the rect recipe and the service rooms. */
function quadrantTools(p: ApartmentPlanner, sx: 1 | -1, sz: 1 | -1, A: number, B: number, sizes: Record<string, { w: number; d: number }>) {
  const world = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const xs = [sx * u0, sx * u1].sort((a, b) => a - b);
    const zs = [sz * v0, sz * v1].sort((a, b) => a - b);
    return { x0: xs[0], x1: xs[1], z0: zs[0], z1: zs[1] };
  };
  const last = () => p.placements[p.placements.length - 1];

  /**
   * Place a room piece whose quadrant-local box is u0..u1 × v0..v1, with its
   * local +Z (door side) along `zDir` and its local +X along `xDir` (picks
   * the mirrored twin when a rotation can't achieve that).
   */
  const put = (piece: PieceId, twin: PieceId | null, u0: number, u1: number, v0: number, v1: number, zDir: Dir, xDir: Dir) => {
    const Zw: Dir = [sx * zDir[0], sz * zDir[1]];
    const th = Math.atan2(Zw[0], Zw[1]);
    const Xw: Dir = [sx * xDir[0], sz * xDir[1]];
    const flip = Math.cos(th) * Xw[0] - Math.sin(th) * Xw[1] < 0;
    return p.add(flip && twin ? twin : piece, (sx * (u0 + u1)) / 2, (sz * (v0 + v1)) / 2, th);
  };

  /** Footprint extents (along u, along v) of a piece whose +Z points along u or v. */
  const ext = (piece: PieceId, zDir: Dir): [number, number] => {
    const { w, d } = sizes[piece];
    return zDir[0] !== 0 ? [d, w] : [w, d];
  };

  /**
   * Slide a room outwards along u (fixed v range) or v (fixed u range) from
   * `from` until it clears the ring (+ RING_GAP), then try a few steps
   * further if furniture is in the way.
   */
  const slide = (piece: PieceId, twin: PieceId | null, axis: "u" | "v", fixed0: number, from: number, zDir: Dir, xDir: Dir, maxExtra = 0.8) => {
    const [eu, ev] = ext(piece, zDir);
    const span = axis === "u" ? eu : ev;
    const box = (o: number) => (axis === "u" ? ([o, o + eu, fixed0, fixed0 + ev] as const) : ([fixed0, fixed0 + eu, o, o + ev] as const));
    const limit = Math.max(A, B);
    let o = from;
    while (o + span < limit && p.blocked(world(...box(o)), RING_GAP)) o += 0.05;
    if (o + span >= limit) return null;
    for (const end = o + maxExtra; o <= end; o += 0.1) {
      const [u0, u1, v0, v1] = box(o);
      if (put(piece, twin, u0, u1, v0, v1, zDir, xDir)) return { u0, u1, v0, v1 };
    }
    return null;
  };

  return { world, last, put, ext, slide };
}

export function apartment(p: ApartmentPlanner, sx: 1 | -1, sz: 1 | -1, A: number, B: number, sizes: Record<string, { w: number; d: number }>) {
  const { last, put, ext } = quadrantTools(p, sx, sz, A, B, sizes);

  /* 1 · master bedroom + ensuite (top corner), walk-in wardrobe beside the ensuite */
  p.addFirst(sx, sz, "bed", [
    [A - 2.0, B - 1.5, PI],
    [A - 1.5, B - 2.0, -PI / 2],
  ]);
  const bedAt = p.placements.length;
  p.addFirst(sx, sz, "bathroom", [
    [A - 5.1, B - 1.45, PI],
    [A - 1.45, B - 5.1, -PI / 2],
    [A - 5.1, B - 3.9, PI],
  ]);
  let wirRect: { u0: number } | null = null;
  const ens = p.placements.length > bedAt ? last() : null;
  if (ens && ens.piece === "bathroom" && Math.abs(ens.z * sz - (B - 1.45)) < 1e-6) {
    const e = qRect(ens, sizes.bathroom.w, sizes.bathroom.d, sx, sz);
    const [eu, ev] = ext("wir", neg(V));
    if (put("wir", null, e.u0 - 0.1 - eu, e.u0 - 0.1, B - 0.3 - ev, B - 0.3, neg(V), U)) wirRect = { u0: e.u0 - 0.1 - eu };
  }

  /* 2 · second bedroom + bathroom (along the side facade, towards the neighbour) */
  p.addFirst(sx, sz, "bedDouble", [
    [A - 1.5, 1.6, -PI / 2],
    [A - 1.5, 4.4, -PI / 2],
    [1.7, B - 1.5, PI],
  ]);
  p.addFirst(sx, sz, "bathroom", [
    [A - 4.6, 1.55, -PI / 2],
    [A - 4.6, 4.2, -PI / 2],
    [4.4, B - 1.45, PI],
  ]);

  /* 3 · living, kitchen, dining */
  p.addMirrored(sx, sz, "archWall", A - 2.1, B - 3.35); // arched doorway into the master bedroom
  p.addMirrored(sx, sz, "living", A - 2.2, B - 5.5, -PI / 2); // sofa backs onto the window
  const kitchenSpots: [number, number, number][] = [[A - 8.3, B - 1.9, PI]];
  if (wirRect) kitchenSpots.push([wirRect.u0 - 0.1 - sizes.kitchen.w / 2, B - 1.9, PI]);
  const kAt = p.placements.length;
  const hasKitchen = p.addFirst(sx, sz, "kitchen", kitchenSpots) && p.placements.length > kAt;
  const kitchen = hasKitchen ? last() : null;
  const ku = kitchen ? kitchen.x * sx : A - 8.3;
  p.addMirrored(sx, sz, "dining4", ku, B - 5.0, PI / 2);
  p.addMirrored(sx, sz, "plant", A - 0.7, B - 7.6);
  p.addMirrored(sx, sz, "plant", ku + 1.5, B - 5.0);

  /* 4 · service rooms on the corridor side */
  serviceRooms(p, sx, sz, A, B, sizes, kitchen, true);
}

/**
 * Service rooms on the corridor side of quadrant (sx, sz): foyer, WC, coat
 * closet, laundry, study — and, with `pantryBesideKitchen`, a pantry beside a
 * kitchen backed onto the +v facade (the rect recipe; the shaped recipe
 * places its own pantry).
 */
export function serviceRooms(p: ApartmentPlanner, sx: 1 | -1, sz: 1 | -1, A: number, B: number, sizes: Record<string, { w: number; d: number }>, kitchen: Placement | null, pantryBesideKitchen: boolean) {
  const { put, ext, slide } = quadrantTools(p, sx, sz, A, B, sizes);
  // Keep the floor in front of every bathroom door clear (kit doorway: local x −0.65…0.2 on its +Z wall).
  for (const b of p.placements) {
    if (b.piece !== "bathroom" || Math.sign(b.x || 1) !== sx || Math.sign(b.z || 1) !== sz) continue;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const lx = -0.225;
    const lz = 1.15 + 0.55;
    p.keepOuts.push({ c: [b.x + lx * c + lz * s, b.z - lx * s + lz * c], ux: [c, -s], hx: 0.6, hz: 0.55, grows: false });
  }
  // Entry: foyer opposite the front door, WC on the demising wall beside it, coat closet along the ring wall.
  const foyer = slide("foyer", "foyerM", "u", 2.05, 0, U, V, 0.4);
  const wc = slide("wc", "wcM", "u", 0.15, 0, V, U, 0.4);
  if (!wc) slide("wc", "wcM", "v", 0.15, 0, U, V, 1.0); // else off the other demising wall
  if (foyer) slide("coat", null, "u", foyer.v1 + 0.1, 0, U, V, 0.3);
  // Laundry beside the WC on the same wall, else along the other demising wall.
  if (!(wc && slide("laundry", null, "u", 0.15, wc.u1 + 0.1, V, U, 0.3))) slide("laundry", null, "v", 0.15, 0, U, neg(V), 1.5);
  // Study along the other demising wall (big plates only — it's skipped when it doesn't fit).
  slide("study", "studyM", "v", 0.15, 0, U, V, 1.2);
  // Pantry beside the kitchen, on its demising-wall side.
  if (kitchen && pantryBesideKitchen) {
    const k = qRect(kitchen, sizes.kitchen.w, sizes.kitchen.d, sx, sz);
    const [eu, ev] = ext("pantry", neg(V));
    if (k.u0 - 0.1 - eu > 0.15) put("pantry", null, k.u0 - 0.1 - eu, k.u0 - 0.1, k.v1 - ev, k.v1, neg(V), U);
  }
}
