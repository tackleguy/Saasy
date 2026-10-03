/** Draw the map as ordered ground decals before any above-ground geometry.
 * These layers do not compete for almost identical perspective depth values.
 * The base ground still writes depth for occlusion and post-processing. */
export const MAP_RENDER_ORDER = {
  ground: -30, water: -24, parks: -23, footprints: -22, roads: -21,
  paving: -19, street: -18, markings: -17, walls: 0, roofs: 0,
} as const;

export const MAP_SURFACE_DEPTH = { depthTest: false, depthWrite: false } as const;

/** Distant exterior views need more precision than the interior near plane.
 * Keep it conservative near the ground and when zoomed into a floor. Walking
 * and orthographic cameras own their projection and must not use this helper. */
export function exteriorNearPlane(targetDistance: number, elevation: number): number {
  if (!Number.isFinite(targetDistance) || !Number.isFinite(elevation)) return .1;
  return Math.max(.1, Math.min(2, targetDistance * .01, elevation * .5));
}
