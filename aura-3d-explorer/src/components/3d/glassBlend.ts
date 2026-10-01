import * as THREE from "three";

/**
 * Curtain-wall glass without three's transmission pass.
 * -----------------------------------------------------------------------------
 * A transmissive MeshPhysicalMaterial makes three re-render every opaque
 * object into a transmission buffer each frame (and again inside the water
 * reflection). For flat, near-clear façade glass that buffer only ever shows
 * "what's behind, tinted by the glass colour", which the blend unit can do for
 * free with a constant blend colour:
 *
 *   framebuffer = src·1 + dst·K          (premultiplied src, K = blendColor)
 *
 *   src = α · ((1 − t)·lit diffuse + specular/env reflection + emissive)
 *   K   = α · t · 0.96 · glassColour  +  (1 − α)
 *
 * With t = transmission and α = opacity this matches three's transmissive
 * shading at rest (α = 1: totalDiffuse = mix(diffuse, colour·behind, t), the
 * 0.96 standing in for 1 − Fresnel at normal incidence), and plain alpha
 * fading once t has eased to 0 (dimmed / isolated / X-ray), with a smooth
 * blend in between. Multiplicative-plus-additive blending is also order
 * independent, so overlapping panes need no sorting.
 *
 * K must match the framebuffer's encoding: linear for render targets (the
 * composer, the water reflection), sRGB when three draws straight to the
 * canvas (Low quality) — chosen per draw in `glassOnBeforeRender`.
 */

/** Material props for glass using this blend (spread onto <meshPhysicalMaterial>). */
export const GLASS_BLEND = {
  transparent: true,
  depthWrite: false,
  premultipliedAlpha: true,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.ConstantColorFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

const FRESNEL_0 = 0.96;

/**
 * Set the glass state: `base` is the glass colour, `t` the current
 * transmission (0–1), `opacity` the current opacity (material.opacity is set).
 * Results live in material.color and userData (plain arrays, so they survive
 * Material.clone() for the merged batches).
 */
export function setGlass(m: THREE.MeshPhysicalMaterial, base: THREE.Color, t: number, opacity: number) {
  m.opacity = opacity;
  m.color.copy(base).multiplyScalar(1 - t);
  const lin = (m.userData.tintLinear ??= [0, 0, 0]) as number[];
  const srgb = (m.userData.tintSRGB ??= [0, 0, 0]) as number[];
  const rgb = [base.r, base.g, base.b];
  for (let c = 0; c < 3; c++) {
    lin[c] = opacity * t * FRESNEL_0 * rgb[c] + (1 - opacity);
    srgb[c] = Math.pow(lin[c], 1 / 2.2);
  }
}

/** Mesh.onBeforeRender for glass: picks the blend colour for the target being drawn. */
export function glassOnBeforeRender(this: THREE.Object3D, renderer: THREE.WebGLRenderer, _s: THREE.Scene, _c: THREE.Camera, _g: THREE.BufferGeometry, material: THREE.Material) {
  const tint = (renderer.getRenderTarget() ? material.userData.tintLinear : material.userData.tintSRGB) as number[] | undefined;
  if (tint) material.blendColor.setRGB(tint[0], tint[1], tint[2]);
}
