import type * as THREE from "three";

/**
 * Per-pixel fog for very large map surfaces.
 *
 * Three computes fog depth per vertex and interpolates it. The mapped ground is
 * one enormous quad and water / street / park polygons can span hundreds of
 * metres, so the fog depth at the camera's feet came out as the average of
 * vertices kilometres away: nearby pavement was fogged like the horizon. This
 * recomputes the fog distance per fragment from the world position.
 */
export function perFragmentFog(shader: THREE.WebGLProgramParametersWithUniforms) {
  if (shader.fragmentShader.includes("vAuraFogWorld")) return;
  shader.vertexShader = "varying vec3 vAuraFogWorld;\n" + shader.vertexShader.replace(
    "#include <fog_vertex>",
    "#include <fog_vertex>\nvAuraFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
  );
  shader.fragmentShader = "varying vec3 vAuraFogWorld;\n" + shader.fragmentShader.replace(
    "#include <fog_fragment>",
    `#ifdef USE_FOG
      float auraFogDepth = length(vAuraFogWorld - cameraPosition);
      #ifdef FOG_EXP2
        float auraFogFactor = 1.0 - exp(-fogDensity * fogDensity * auraFogDepth * auraFogDepth);
      #else
        float auraFogFactor = smoothstep(fogNear, fogFar, auraFogDepth);
      #endif
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, auraFogFactor);
    #endif`,
  );
}

/** Apply per-pixel fog to a plain material that has no shader patch of its own. */
export function withFragmentFog<T extends THREE.Material>(material: T, key: string): T {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    perFragmentFog(shader);
  };
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|fog-fragment|${key}`;
  return material;
}
