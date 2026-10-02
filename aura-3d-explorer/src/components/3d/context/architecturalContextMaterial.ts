import * as THREE from "three";
import { MODEL_SCALE } from "@/lib/tower";

export interface FacadeOptions {
  night?: { value: number };
  defaultColor?: string;
  isGlassTower?: boolean;
}

const GLOBAL_NIGHT = { value: 0 };

export function setFacadeNight(val: number) {
  GLOBAL_NIGHT.value = val;
}

/**
 * Decorates a MeshStandardMaterial with realistic procedural architectural facade details:
 * vision glass window grid, slim mullions, floor slab spandrels, deep environmental reflections,
 * and warm interior office illumination at night. Works in world-space so it requires no UVs.
 */
export function applyArchitecturalFacade(material: THREE.MeshStandardMaterial, options: FacadeOptions = {}) {
  const night = options.night ?? GLOBAL_NIGHT;
  if (options.defaultColor && (!material.color || material.color.getHex() === 0xffffff)) {
    material.color.set(options.defaultColor);
  }
  material.roughness = Math.min(material.roughness, 0.75);
  material.envMapIntensity = Math.max(material.envMapIntensity || 0, 1.2);

  const prevOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
    shader.uniforms.auraNight = night;

    shader.vertexShader = `varying vec3 auraWorld; varying vec3 auraNormal;\n${shader.vertexShader}`
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
         auraWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
         auraNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = `varying vec3 auraWorld; varying vec3 auraNormal; uniform float auraNight;\n${shader.fragmentShader}`
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         vec3 metres = auraWorld / ${MODEL_SCALE.toFixed(3)};
         float isWall = step(abs(auraNormal.y), 0.68);
         float isRoof = step(0.68, auraNormal.y);

         if (isWall > 0.5) {
           float horiz = abs(auraNormal.x) > abs(auraNormal.z) ? metres.z : metres.x;
           // 1.6m wide bays, 3.4m tall storeys
           vec2 cell = vec2(horiz / 1.6, (metres.y + 0.15) / 3.4);
           vec2 pane = fract(cell);
           vec2 cellId = floor(cell);

           // Window vision glass mask
           float windowMask = step(0.12, pane.x) * step(pane.x, 0.88) * step(0.16, pane.y) * step(pane.y, 0.88) * step(0.8, metres.y);
           // Mullion frame mask
           float mullionMask = (step(0.05, pane.x) * step(pane.x, 0.95) * step(0.10, pane.y) * step(pane.y, 0.94) * step(0.8, metres.y)) - windowMask;

           float seed = fract(sin(dot(cellId, vec2(12.9898, 78.233))) * 43758.5453);
           vec3 glassTint = mix(vec3(0.06, 0.10, 0.14), vec3(0.14, 0.19, 0.23), seed);
           vec3 mullionTint = vec3(0.22, 0.25, 0.28);

           diffuseColor.rgb = mix(diffuseColor.rgb, mullionTint, max(0.0, mullionMask));
           diffuseColor.rgb = mix(diffuseColor.rgb, glassTint, windowMask);
         } else if (isRoof > 0.5) {
           // Architectural roof surface: subtle mechanical gravel texture
           float roofNoise = fract(sin(dot(floor(auraWorld.xz * 2.5), vec2(17.13, 43.71))) * 12345.6);
           diffuseColor.rgb = mix(diffuseColor.rgb * 0.85, diffuseColor.rgb * 1.05, roofNoise);
         }
        `
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
         if (abs(auraNormal.y) < 0.68) {
           float horiz = abs(auraNormal.x) > abs(auraNormal.z) ? metres.z : metres.x;
           vec2 cell = vec2(horiz / 1.6, (metres.y + 0.15) / 3.4);
           vec2 pane = fract(cell);
           float windowMask = step(0.12, pane.x) * step(pane.x, 0.88) * step(0.16, pane.y) * step(pane.y, 0.88) * step(0.8, metres.y);
           // Polished architectural vision glass with sharp environment reflections
           roughnessFactor = mix(roughnessFactor, 0.12, windowMask);
         } else if (auraNormal.y >= 0.68) {
           roughnessFactor = 0.92;
         }
        `
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
         if (abs(auraNormal.y) < 0.68) {
           float horiz = abs(auraNormal.x) > abs(auraNormal.z) ? metres.z : metres.x;
           vec2 cell = vec2(horiz / 1.6, (metres.y + 0.15) / 3.4);
           vec2 pane = fract(cell);
           float windowMask = step(0.12, pane.x) * step(pane.x, 0.88) * step(0.16, pane.y) * step(pane.y, 0.88) * step(0.8, metres.y);
           metalnessFactor = mix(metalnessFactor, 0.62, windowMask);
         } else if (auraNormal.y >= 0.68) {
           metalnessFactor = 0.05;
         }
        `
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         if (abs(auraNormal.y) < 0.68) {
           float horiz = abs(auraNormal.x) > abs(auraNormal.z) ? metres.z : metres.x;
           vec2 cell = vec2(horiz / 1.6, (metres.y + 0.15) / 3.4);
           vec2 pane = fract(cell);
           vec2 cellId = floor(cell);
           float windowMask = step(0.12, pane.x) * step(pane.x, 0.88) * step(0.16, pane.y) * step(pane.y, 0.88) * step(0.8, metres.y);
           float seed = fract(sin(dot(cellId, vec2(12.9898, 78.233))) * 43758.5453);
           vec3 warmLight = mix(vec3(1.0, 0.80, 0.50), vec3(0.88, 0.94, 1.0), fract(seed * 5.7));
           totalEmissiveRadiance += warmLight * windowMask * step(0.48, seed) * auraNight * 0.85;
         }
        `
      );
  };
  material.customProgramCacheKey = () => "aura-arch-facade-v2";
  material.needsUpdate = true;
  return material;
}

/** An illustrative facade finish over mapped envelopes. It never changes their footprint or height. */
export function contextFacadeMaterial() {
  const night = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ color: "#626c73", roughness: 0.76, metalness: 0.05, envMapIntensity: 1.15 });
  applyArchitecturalFacade(material, { night });
  return { material, night };
}

