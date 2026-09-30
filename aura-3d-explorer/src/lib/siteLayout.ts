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
  sidewalkNear: [17, 19] as const,
  road: [19, 27] as const,
  sidewalkFar: [27, 29] as const,
  promenade: [29, 32] as const,
  waterStart: 32,
  /** Half-length of the street / promenade along u. */
  streetHalfLength: 180,
};
