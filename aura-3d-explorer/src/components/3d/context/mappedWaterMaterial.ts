import * as THREE from "three";
import { MAP_SURFACE_DEPTH } from "@/lib/renderDepth";
import { perFragmentFog } from "./fragmentFog";

/** Light is reflected by the existing shoreline polygons; no water is added. */
export function mappedWaterMaterial() {
  const uniforms = { auraWaterTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ color: "#254956", roughness: .28, metalness: .25, envMapIntensity: 1.1, ...MAP_SURFACE_DEPTH });
  material.name = "mapped-water-ripples";
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vAuraWater;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvAuraWater = (modelMatrix * vec4(transformed,1.0)).xyz;");
    shader.fragmentShader = `varying vec3 vAuraWater; uniform float auraWaterTime;\n${shader.fragmentShader}`
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        vec2 p = vAuraWater.xz;
        float t = auraWaterTime;
        // Six short wind waves in different directions (scene units: 0.28 per metre).
        // Each fades to flat once its wavelength approaches a pixel, so distant
        // water reads as a calm reflective sheet instead of moire stripes.
        vec2 slope = vec2(0.0);
        const vec2 dirs[6] = vec2[6](vec2(.94,.34), vec2(-.42,.91), vec2(.71,-.70), vec2(-.97,-.24), vec2(.18,.98), vec2(.55,.83));
        const float freq[6] = float[6](3.1, 4.3, 5.9, 7.7, 10.3, 13.9);
        for (int i = 0; i < 6; i++) {
          float k = freq[i];
          float phase = dot(p, dirs[i]) * k + t * (0.9 + float(i) * 0.23);
          float fade = 1.0 - smoothstep(0.15, 0.7, fwidth(phase));
          slope += dirs[i] * cos(phase) * fade * (0.022 / sqrt(k));
        }
        vec3 ripple = normalize(vec3(slope.x, 1.0, slope.y));
        normal = normalize(mat3(viewMatrix)*ripple);
      `);
    perFragmentFog(shader);
  };
  material.customProgramCacheKey = () => "aura-map-water-v4";
  return { material, uniforms };
}
