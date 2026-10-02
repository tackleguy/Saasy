import * as THREE from "three";
import { MODEL_SCALE } from "@/lib/tower";

/** An illustrative facade finish over mapped envelopes. It never changes their footprint or height. */
export function contextFacadeMaterial() {
  const night = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ color: "#626c73", roughness: .76, metalness: .05, envMapIntensity: 1.15 });
  material.onBeforeCompile = shader => {
    shader.uniforms.auraNight = night;
    shader.vertexShader = `varying vec3 auraWorld; varying vec3 auraNormal;\n${shader.vertexShader}`
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nauraWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; auraNormal = normalize(mat3(modelMatrix) * objectNormal);");
    shader.fragmentShader = `varying vec3 auraWorld; varying vec3 auraNormal; uniform float auraNight;\n${shader.fragmentShader}`
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 metres = auraWorld / ${MODEL_SCALE.toFixed(2)};
        float horizontal = abs(auraNormal.x) > abs(auraNormal.z) ? metres.z : metres.x;
        vec2 cell = vec2(horizontal / 1.5, metres.y / 3.2);
        vec2 pane = fract(cell);
        float windowMask = step(.13, pane.x) * step(pane.x, .87) * step(.24, pane.y) * step(pane.y, .9) * step(1.0, metres.y);
        float seed = fract(sin(dot(floor(cell), vec2(12.9898,78.233))) * 43758.5453);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(.075,.10,.12), vec3(.15,.20,.23), seed), windowMask);
      `)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .16, windowMask);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, .6, windowMask);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0,.69,.36) * windowMask * step(.58,seed) * auraNight * .6;");
  };
  material.customProgramCacheKey = () => "aura-mapped-facade-v1";
  return { material, night };
}
