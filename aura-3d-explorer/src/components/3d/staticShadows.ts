/**
 * Static shadows — the sun's shadow map is rendered on demand, not every frame.
 * -----------------------------------------------------------------------------
 * The site is ~160 floors of slabs, cores, fins and balconies; re-rendering
 * all of it into a 4096² shadow map each frame cost more than the main view.
 * The sun and its shadow camera never move, so the map only has to be redrawn
 * when something that casts a shadow changes: explosion, selection, X-ray /
 * section, walking, city preset, site edits, imported model, quality…
 *
 * Anything that changes shadow casters calls `invalidateShadows(holdMs)`:
 * the map is redrawn on the next main-camera render and, for `holdMs`, on
 * every frame after it (so eased animations — floors exploding, furniture
 * growing — shadow correctly while they move, then the map freezes).
 *
 * Moving context (traffic, walking people, boats, lift cars) doesn't cast
 * shadows, so nothing needs a periodic refresh.
 *
 * The map is only ever drawn during a render from the MAIN camera (see
 * <StaticShadows> in BuildingScene): an off-screen pass (the water's planar
 * reflection) renders with its own camera and layers, and would otherwise
 * consume the update with the wrong layer mask.
 */

/** How long eased transitions take to settle completely (all use 1 − 0.0008^dt or slower damping). */
export const SETTLE_MS = 3000;
/**
 * How long the shadow map keeps redrawing after a change: by then every eased
 * caster is within ~0.01 % of its target (and the CAD import has risen).
 */
export const SHADOW_SETTLE_MS = 1800;

let pending = true;
let dirtyUntil = 0;

/** Redraw the shadow map on the next frame, and every frame for `holdMs`. */
export function invalidateShadows(holdMs = 0) {
  pending = true;
  if (holdMs > 0) dirtyUntil = Math.max(dirtyUntil, performance.now() + holdMs);
}

/** True when the shadow map should be redrawn this frame (consumes a one-shot request). */
export function consumeShadowUpdate(now = performance.now()): boolean {
  if (pending || now < dirtyUntil) {
    pending = false;
    return true;
  }
  return false;
}
