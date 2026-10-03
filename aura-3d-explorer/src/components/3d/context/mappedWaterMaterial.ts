import * as THREE from "three";
import { MAP_SURFACE_DEPTH } from "@/lib/renderDepth";

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
        // Frequencies are in scene units (0.28 units per metre). Keep every
        // octave sub-metre to a few metres, and fade unresolved ripples to flat.
        vec2 phase = vec2(dot(p,vec2(5.2,3.4)),dot(p,vec2(9.7,-6.1)));
        vec2 visible = 1.0-smoothstep(vec2(.3),vec2(1.5),fwidth(phase));
        vec2 wave = sin(phase+vec2(t*.4,-t*.32))*visible;
        vec3 ripple = normalize(vec3(.015*wave.x+.006*wave.y,1.0,.011*wave.y));
        normal = normalize(mat3(viewMatrix)*ripple);
      `);
  };
  material.customProgramCacheKey = () => "aura-map-water-v2";
  return { material, uniforms };
}
