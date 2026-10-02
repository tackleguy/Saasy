import * as THREE from "three";

/** Reflective exterior glazing. Standard depth-tested surfaces avoid additive
 * reflections and interior layers accumulating through overlapping floor batches. */
export const GLASS_BLEND = {
  transparent: false,
  depthWrite: true,
  premultipliedAlpha: false,
  blending: THREE.NormalBlending,
} as const;

/** Keep isolation, walk-through and X-ray fades while exterior glass stays solid. */
export function setGlass(m: THREE.MeshPhysicalMaterial, base: THREE.Color, opacity: number) {
  const faded = opacity < 0.995;
  if (m.transparent !== faded) {
    m.transparent = faded;
    m.needsUpdate = true;
  }
  m.depthWrite = !faded;
  m.opacity = opacity;
  m.color.copy(base);
}
