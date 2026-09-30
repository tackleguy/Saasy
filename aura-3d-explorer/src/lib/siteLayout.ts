/**
 * Site layout — the urban context around a project, in one coordinate frame.
 * -----------------------------------------------------------------------------
 * The default hero camera looks at the site from the +X/+Z diagonal, so the
 * context is laid out in a rotated "screen" frame:
 *
 *   u — runs left → right across the view      (world direction (1, 0, −1)/√2)
 *   w — runs from the site towards the viewer   (world direction (1, 0,  1)/√2)
 *
 * From the site outwards along +w: paved plinth → sidewalk → road → sidewalk
 * → waterfront promenade → water. Neighbouring blocks sit behind the site
 * (−w) and to the sides, so the foreground stays open across the water.
 */

export const ROOT2 = Math.SQRT1_2;

/** Convert screen-frame (u, w) to world (x, z). */
export function uwToXZ(u: number, w: number): [number, number] {
  return [(u + w) * ROOT2, (w - u) * ROOT2];
}

/** Rotation (about Y) that aligns a plane's local X with u and local Z with w. */
export const SITE_ROTATION_Y = Math.PI / 4;

/** Distances along +w (scene units ≈ 3.57 m each). */
export const LAYOUT = {
  plinthHalfDepth: 17,
  /** The plinth extends further back to carry the supertall. */
  plinthBackDepth: 40,
  sidewalkNear: [17, 19] as const,
  road: [19, 27] as const,
  sidewalkFar: [27, 29] as const,
  promenade: [29, 32] as const,
  waterStart: 32,
  /** Half-length of the street / promenade along u. */
  streetHalfLength: 180,
};

/* ----------------------------------------------------------- site editing */

/** Convert world (x, z) to screen-frame (u, w). */
export function xzToUW(x: number, z: number): [number, number] {
  return [(x - z) * ROOT2, (x + z) * ROOT2];
}

/** Axis-aligned rectangle in the (u, w) frame. */
export interface UWRect {
  u0: number;
  u1: number;
  w0: number;
  w1: number;
}

export const rectsOverlap = (a: UWRect, b: UWRect) => a.u1 > b.u0 && a.u0 < b.u1 && a.w1 > b.w0 && a.w0 < b.w1;
export const pointInRect = (u: number, w: number, r: UWRect) => u > r.u0 && u < r.u1 && w > r.w0 && w < r.w1;

/** The project's paved plinth (the original plot). */
export const PLINTH: UWRect = { u0: -52, u1: 52, w0: -LAYOUT.plinthBackDepth, w1: LAYOUT.plinthHalfDepth };

/** Where a tower may stand: behind the near sidewalk, inside the modelled city. */
export const BUILDABLE: UWRect = { u0: -185, u1: 190, w0: -285, w1: LAYOUT.sidewalkNear[0] - 0.2 };

/** Plan-view extent of a building's plates (they may twist, so a radius). */
interface Footprinted {
  position: [number, number];
  zones: Record<string, { width: number; depth: number }>;
}

/** Radius that contains every plate of the building at any twist, scene units. */
export function buildingRadius(b: Footprinted): number {
  return Math.max(...Object.values(b.zones).map((z) => Math.hypot(z.width, z.depth) / 2));
}

/** A building's centre in the (u, w) frame. */
export const buildingUW = (b: Footprinted) => xzToUW(b.position[0], b.position[1]);

/** Square (u, w) area a building occupies, plus a margin — neighbours inside it are cleared. */
export function buildingClearing(b: Footprinted, margin = 1.5): UWRect {
  const [u, w] = buildingUW(b);
  const r = buildingRadius(b) + margin;
  return { u0: u - r, u1: u + r, w0: w - r, w1: w + r };
}
