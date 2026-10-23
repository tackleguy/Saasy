import * as THREE from "three";
import { MAP_SURFACE_DEPTH } from "@/lib/renderDepth";
import { CARRIAGEWAY_WIDTH_M, STREET_WIDTH_M } from "@/lib/mappedGeometry";

/**
 * Street finishes for the mapped street ribbons (see mappedGeometry.streetRibbon).
 * Both read the `auraRoad` attribute: x = across the corridor (−1…1),
 * y = metres along the piece, z = piece length in metres.
 *
 *   paving      — the whole 16 m corridor: concrete pavement slabs and a kerb.
 *   carriageway — drawn after every paving piece, so junctions read as one
 *                 continuous asphalt surface: worn asphalt, edge lines and a
 *                 dashed centre line that stops short of junctions.
 *
 * Both are ordered ground decals (no depth test), like the other map surfaces.
 * Markings fade out where they are smaller than a pixel instead of shimmering.
 */
const KERB = (CARRIAGEWAY_WIDTH_M / STREET_WIDTH_M).toFixed(4);

const VERTEX_HEADER = "attribute vec3 auraRoad; varying vec3 vAuraRoad; varying vec3 vAuraStreetWorld;\n";
const VERTEX_BODY = "#include <begin_vertex>\nvAuraRoad = auraRoad; vAuraStreetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;";
const FRAGMENT_HEADER = `varying vec3 vAuraRoad; varying vec3 vAuraStreetWorld;
float auraStreetHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float auraStreetNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(auraStreetHash(i), auraStreetHash(i + vec2(1, 0)), f.x), mix(auraStreetHash(i + vec2(0, 1)), auraStreetHash(i + vec2(1, 1)), f.x), f.y);
}
float auraBand(float x, float lo, float hi, float aa) { return smoothstep(lo - aa, lo + aa, x) * (1.0 - smoothstep(hi - aa, hi + aa, x)); }
`;

function decorate(material: THREE.MeshStandardMaterial, body: string, key: string) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = VERTEX_HEADER + shader.vertexShader.replace("#include <begin_vertex>", VERTEX_BODY);
    shader.fragmentShader = FRAGMENT_HEADER + shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>\n${body}`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

export function streetPavingMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#a7a397", roughness: 0.92, metalness: 0, envMapIntensity: 0.4, ...MAP_SURFACE_DEPTH });
  material.name = "mapped-street-paving";
  return decorate(material, `
    float across = abs(vAuraRoad.x);
    vec2 slab = vec2(vAuraRoad.y / 1.5, across * ${(STREET_WIDTH_M / 2).toFixed(1)} / 1.5);
    vec2 aa = max(fwidth(slab), vec2(0.002));
    vec2 edge = min(fract(slab), 1.0 - fract(slab));
    float joint = (1.0 - smoothstep(0.03, 0.03 + aa.x * 1.5, edge.x)) * (1.0 - smoothstep(0.35, 0.8, aa.x));
    float kerb = auraBand(across, ${KERB} - 0.012, ${KERB} + 0.035, max(fwidth(across), 0.002));
    float stain = auraStreetNoise(vAuraStreetWorld.xz * 0.9);
    diffuseColor.rgb *= mix(0.9, 1.04, stain) * (1.0 - joint * 0.12);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.76, 0.71), kerb * 0.85);
  `, "aura-street-paving-v1");
}

export function streetCarriagewayMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#3d3e3e", roughness: 0.86, metalness: 0, envMapIntensity: 0.55, ...MAP_SURFACE_DEPTH });
  material.name = "mapped-street-carriageway";
  return decorate(material, `
    float across = abs(vAuraRoad.x);
    if (across > ${KERB}) discard;
    float wear = auraStreetNoise(vAuraStreetWorld.xz * 0.35) * 0.6 + auraStreetNoise(vAuraStreetWorld.xz * 2.7) * 0.4;
    diffuseColor.rgb *= mix(0.82, 1.12, wear);
    // Tyre tracks: slightly polished bands in each lane.
    float lane = across / ${KERB};
    diffuseColor.rgb *= 1.0 - 0.06 * auraBand(lane, 0.32, 0.46, 0.05) - 0.06 * auraBand(lane, 0.62, 0.76, 0.05);
    float pixel = max(fwidth(vAuraRoad.y), 0.001);
    float readable = 1.0 - smoothstep(0.25, 0.9, pixel);
    float aa = max(fwidth(across), 0.0015);
    float edgeLine = auraBand(across, ${KERB} * 0.9, ${KERB} * 0.9 + 0.012, aa);
    // Dashes stop 9 m before each end, so they never cross a junction.
    float inside = step(9.0, vAuraRoad.y) * step(vAuraRoad.y, vAuraRoad.z - 9.0);
    float dash = auraBand(fract(vAuraRoad.y / 9.0), 0.0, 0.34, pixel / 9.0);
    float centre = (1.0 - smoothstep(0.009, 0.009 + aa, across)) * dash * inside;
    vec3 paint = vec3(0.86, 0.85, 0.80);
    diffuseColor.rgb = mix(diffuseColor.rgb, paint, clamp(edgeLine * 0.75 + centre * 0.85, 0.0, 1.0) * readable);
  `, "aura-street-carriageway-v1");
}
