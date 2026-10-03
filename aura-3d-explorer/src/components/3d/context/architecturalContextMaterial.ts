import * as THREE from "three";
import type { CityPreset } from "@/lib/cityPresets";

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
