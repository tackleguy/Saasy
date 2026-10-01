import * as THREE from "three";

/**
 * Render layers.
 *   0            — everything (default)
 *   DETAIL_LAYER — small per-floor details that only the main camera draws
 *                  (lift doors, ceilings, balcony furniture and glass, hover
 *                  outlines, balustrades). The water's planar reflection
 *                  renders with a layer-0-only camera, so it skips them: they
 *                  are invisible in a blurred, rippled reflection anyway.
 * Shadow casting is unaffected (the shadow map is drawn from the main camera,
 * see ./staticShadows).
 */
export const DETAIL_LAYER = 1;

/**
 * Picked by the pointer (R3F's raycaster enables it) but drawn by no camera:
 * per-floor glass parked here while its building's glass is batched
 * (see ./mergedStatics).
 */
export const RAYCAST_LAYER = 2;

/** Pass as `layers={DETAIL}` — R3F copies the mask onto the object's layers. */
export const DETAIL = new THREE.Layers();
DETAIL.set(DETAIL_LAYER);
