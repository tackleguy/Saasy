import * as THREE from "three";
import { MODEL_SCALE } from "@/lib/tower";
import type { CityPreset } from "@/lib/cityPresets";

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

const HEADER = `
varying vec2 vAuraFacade;
varying vec3 vAuraBuilding;
uniform float auraNight;
uniform vec3 auraFamilies;
float auraHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float auraPane(vec2 p, vec2 lo, vec2 hi, vec2 aa) {
  vec2 e = smoothstep(lo-aa,lo+aa,p) * (1.0-smoothstep(hi-aa,hi+aa,p));
  return e.x*e.y;
}
`;
const VERTEX = `attribute vec2 auraFacade; attribute vec3 auraBuilding;
varying vec2 vAuraFacade; varying vec3 vAuraBuilding;\n`;

/** Illustrative architectural finishes on measured envelopes. Local metre
 * coordinates preserve scale, identity and orientation when a map pin moves. */
export function contextFacadeMaterial(preset?: CityPreset) {
  const weights = preset?.facades ?? { brick: .35, stone: .3, plaster: .2, glass: .15 };
  const sum = weights.brick + weights.stone + weights.plaster + weights.glass;
  const uniforms = {
    auraNight: { value: 0 },
    auraFamilies: { value: new THREE.Vector3(weights.brick / sum, (weights.brick + weights.stone) / sum, preset?.tallGlass ?? .8) },
  };
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .65, metalness: .06, envMapIntensity: 1.8 });
  material.name = "mapped-architectural-facades";
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvAuraFacade = auraFacade; vAuraBuilding = auraBuilding;");
    shader.fragmentShader = HEADER + shader.fragmentShader
      .replace("#include <color_fragment>", `#include <color_fragment>
        float seed = vAuraBuilding.x;
        float heightM = vAuraBuilding.y;
        float validWall = step(.1,vAuraBuilding.z);
        float family = fract(seed*17.371);
        float glassTower = step(36.0,heightM) * step(1.0-auraFamilies.z,fract(seed*7.13));
        float brick = (1.0-step(auraFamilies.x,family))*(1.0-glassTower);
        float stone = step(auraFamilies.x,family)*(1.0-step(auraFamilies.y,family))*(1.0-glassTower);
        vec3 masonry = mix(vec3(.61,.55,.44),vec3(.24,.13,.085),brick);
        masonry = mix(masonry,vec3(.40,.36,.28),stone);
        masonry *= mix(.78,1.12,fract(seed*31.71));
        float floorM = mix(3.05,3.8,glassTower);
        float bays = max(1.0,floor(vAuraBuilding.z / mix(2.65,1.8,glassTower)));
        vec2 cell = vec2(vAuraFacade.x / max(vAuraBuilding.z,0.1) * bays,vAuraFacade.y/floorM);
        vec2 footprint = fwidth(cell);
        vec2 aa = max(footprint*.7,vec2(.007));
        vec2 f = fract(cell);
        float readable = 1.0-smoothstep(.22,.8,max(footprint.x,footprint.y));
        vec2 lo = mix(vec2(.23,.21),vec2(.045,.09),glassTower);
        vec2 hi = mix(vec2(.77,.84),vec2(.955,.87),glassTower);
        float pane = auraPane(f,lo,hi,aa);
        float coverage = (hi.x-lo.x)*(hi.y-lo.y);
        float glazing = mix(coverage,pane,readable)*validWall;
        float room = auraHash(floor(cell)+seed*143.1);
        float grouped = auraHash(vec2(floor(cell.x/3.0),floor(cell.y))+seed*59.7);
        float glassTone = mix(.75,1.25,room*.4+grouped*.6);
        vec3 glass = mix(vec3(.045,.092,.115),vec3(.095,.16,.19),fract(seed*29.1))*glassTone;
        // Broad vertical reflection variation and restrained spandrels survive at a distance.
        glass *= mix(.72,1.18,smoothstep(0.0,heightM,vAuraFacade.y));
        glass *= .94+.06*sin(cell.x*.27+seed*9.0);
        vec3 cladding = mix(masonry,vec3(.12,.17,.19),glassTower);
        float sill = auraPane(f,vec2(lo.x-.035,hi.y),vec2(hi.x+.035,hi.y+.035),aa)*readable*(1.0-glassTower);
        cladding *= 1.0+sill*.18;
        float base = smoothstep(0.0,4.0,vAuraFacade.y);
        float crown = smoothstep(heightM-.8,heightM-.18,vAuraFacade.y)*validWall;
        diffuseColor.rgb *= mix(cladding,glass,glazing) * mix(.7,1.0,base);
        diffuseColor.rgb = mix(diffuseColor.rgb,masonry*.82,crown*.8);
        float occupied = step(.8,room*.75+grouped*.25);
        float auraGlow = mix(.07,occupied,readable)*glazing*auraNight;
      `)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(.82,.2,glazing);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(.015,.48,glazing);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0,.62,.29)*auraGlow*1.7;");
  };
  material.customProgramCacheKey = () => "aura-local-architecture-v4";
  return { material, uniforms };
}

/** Roof membranes remain at their recorded height. The scale is in metres. */
export function contextRoofMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#a39b8a", roughness: .9, metalness: .03, envMapIntensity: .5 });
  material.name = "mapped-roof-membrane";
  material.onBeforeCompile = shader => {
    shader.vertexShader = VERTEX + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvAuraFacade = auraFacade; vAuraBuilding = auraBuilding;");
    shader.fragmentShader = `varying vec2 vAuraFacade; varying vec3 vAuraBuilding;\n` + shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec2 tile = vAuraFacade/6.0;
      vec2 aa = max(fwidth(tile),vec2(.003));
      vec2 edge = min(fract(tile),1.0-fract(tile));
      float seam = 1.0-min(smoothstep(vec2(.008)-aa,vec2(.018)+aa,edge).x,smoothstep(vec2(.008)-aa,vec2(.018)+aa,edge).y);
      float readable = 1.0-smoothstep(.12,.5,max(aa.x,aa.y));
      float seed = vAuraBuilding.x;
      diffuseColor.rgb *= mix(.52,1.06,fract(seed*23.73))*(1.0-seam*.16*readable);
    `);
  };
  material.customProgramCacheKey = () => "aura-roof-membrane-v1";
  return material;
}
