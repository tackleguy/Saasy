"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { contextFacadeMaterial, contextRoofMaterial } from "./architecturalContextMaterial";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { CityPreset } from "@/lib/cityPresets";
import { SUN, useCinematic } from "../environment/settings";
import { mappedWaterMaterial } from "./mappedWaterMaterial";
import MappedRoofDetails from "./MappedRoofDetails";
import DowntownContext, { type DowntownProgress } from "./DowntownContext";
import type { DowntownManifest } from "@/lib/downtownContext";
import type { Building } from "@/types";
import type { MapSnapshot, ProjectLocation } from "@/lib/geographicContext";
import { createMappedGeometryBuilder, type MappedGeometry, type MappedMaterials } from "@/lib/mappedGeometry";
import { streetCarriagewayMaterial, streetPavingMaterial } from "./streetMaterial";
import { MAP_RENDER_ORDER, MAP_SURFACE_DEPTH } from "@/lib/renderDepth";
import { invalidateShadows } from "../staticShadows";
import { noRaycast } from "./shared";
import { perFragmentFog, withFragmentFog } from "./fragmentFog";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const IGNORE_DOWNTOWN_PROGRESS = (_progress: DowntownProgress) => {};
const FINISHES = { footprints: "#9c9585", parks: "#55703f" } as const;

/** Open ground between mapped features: lots, yards and plazas. A large-scale
 * world-space pattern breaks up the plane (paved, dusty and grassy patches) so
 * the city floor does not read as one flat sheet. Illustrative finish. */
function urbanGroundMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#87847a", roughness: 1, metalness: 0, envMapIntensity: .3 });
  material.name = "mapped-urban-ground";
  material.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec3 vAuraGround;\n" + shader.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvAuraGround = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = `varying vec3 vAuraGround;
float auraGroundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float auraGroundNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(auraGroundHash(i), auraGroundHash(i + vec2(1, 0)), f.x), mix(auraGroundHash(i + vec2(0, 1)), auraGroundHash(i + vec2(1, 1)), f.x), f.y);
}
` + shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec2 g = vAuraGround.xz;
      float broad = auraGroundNoise(g * 0.045) * 0.6 + auraGroundNoise(g * 0.13) * 0.4;
      float grain = auraGroundNoise(g * 1.7);
      float green = smoothstep(0.62, 0.8, auraGroundNoise(g * 0.06 + 17.0));
      diffuseColor.rgb *= mix(0.84, 1.08, broad) * mix(0.95, 1.03, grain);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.38, 0.26), green * 0.4);
    `);
    perFragmentFog(shader);
  };
  material.customProgramCacheKey = () => "aura-urban-ground-v2";
  return material;
}

/** Geographic envelopes preserve mapped skyline and waterfront. Facade, roof
 * and street finishes are illustrative. Missing map data
 * leaves a neutral ground plane; unknown building heights remain footprints. */
export default function MappedContext({ snapshot, location, buildings, preset, showGround = true, downtown = null, downtownRetry = 0, onDowntownProgress = IGNORE_DOWNTOWN_PROGRESS, details = true }: { snapshot: MapSnapshot | null; location: ProjectLocation; buildings: Building[]; preset: CityPreset; showGround?: boolean; downtown?: DowntownManifest | null; downtownRetry?: number; onDowntownProgress?: (progress: DowntownProgress) => void; /** Roof equipment and the outer downtown tiles (mounted after the first frames). */ details?: boolean }) {
  const [prepared, setPrepared] = useState<{ snapshot: MapSnapshot; latitude: number; longitude: number; buildings: Building[]; data: MappedGeometry } | null>(null);
  const { time, tier } = useCinematic();
  const { materials, facade, water, ground } = useMemo(() => {
    const facade = contextFacadeMaterial(preset), water = mappedWaterMaterial();
    const surface = (kind: keyof typeof FINISHES) => withFragmentFog(new THREE.MeshStandardMaterial({ color: FINISHES[kind], roughness: .93, metalness: 0, envMapIntensity: .45, ...MAP_SURFACE_DEPTH }), kind);
    const ground = urbanGroundMaterial();
    const materials: MappedMaterials = { walls: facade.material, roofs: contextRoofMaterial(), footprints: surface("footprints"), water: water.material, parks: surface("parks"), roads: streetPavingMaterial(), carriageway: streetCarriagewayMaterial() };
    return { materials, facade, water, ground };
  }, [preset]);
  useEffect(() => () => { Object.values(materials).forEach(material => material.dispose()); ground.dispose(); }, [materials, ground]);
  useFrame(({ scene }, delta) => {
    // Three uses scene.environmentIntensity whenever material.envMap is null.
    // Bind the shared (externally owned) environment so individual finishes can
    // retain their reflective response while following the time-of-day exposure.
    // Ground surfaces take little sky light, so the sun's shadows read on streets and lots.
    for (const [material, strength] of [[materials.walls, 1.8], [materials.roofs, .5], [materials.water, 1.1], [ground, .28], [materials.footprints, .3], [materials.parks, .25], [materials.roads, .3], [materials.carriageway, .3]] as const) {
      const surface = material as THREE.MeshStandardMaterial;
      if (surface.envMap !== scene.environment) { surface.envMap = scene.environment; surface.needsUpdate = true; }
      surface.envMapIntensity = scene.environmentIntensity * strength;
    }
    facade.uniforms.auraNight.value = prefersReducedMotion() ? SUN[time].night : THREE.MathUtils.damp(facade.uniforms.auraNight.value, SUN[time].night, 3, delta);
    if (!prefersReducedMotion() && tier !== "low") water.uniforms.auraWaterTime.value += Math.min(delta, .05);
  });

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false, owned: MappedGeometry | null = null;
    const builder = createMappedGeometryBuilder(snapshot, location, buildings);
    async function prepare() {
      while (!builder.complete && !cancelled) {
        const started = performance.now();
        do { builder.step(16); } while (!builder.complete && performance.now() - started < 8);
        if (!builder.complete) await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (cancelled) return;
      owned = builder.finish();
      setPrepared({ snapshot: snapshot!, latitude: location.latitude, longitude: location.longitude, buildings, data: owned });
      invalidateShadows();
    }
    void prepare();
    return () => { cancelled = true; owned?.dispose(); invalidateShadows(); };
  }, [snapshot, location.latitude, location.longitude, buildings]);

  const current = prepared?.snapshot === snapshot && prepared.latitude === location.latitude && prepared.longitude === location.longitude && prepared.buildings === buildings ? prepared.data : null;
  return <group name="mapped-context" userData={{ sourceId: snapshot?.id ?? null, featureCount: current?.featureCount ?? 0, buildingPolygons: current?.buildingPolygons ?? 0, hiddenBuildingPolygons: current?.hiddenBuildingPolygons ?? 0, unknownHeightFootprints: current?.unknownHeightFootprints ?? 0 }}>
    {showGround && <mesh name="mapped-ground" rotation-x={-Math.PI / 2} position-y={-0.015} renderOrder={MAP_RENDER_ORDER.ground} receiveShadow raycast={noRaycast}>
      <planeGeometry args={[1000000, 1000000]} />
      <primitive object={ground} attach="material" />
    </mesh>}
    {details && current && snapshot && <MappedRoofDetails snapshot={snapshot} location={location} buildings={buildings} />}
    {details && snapshot && downtown?.id === snapshot.id && <DowntownContext manifest={downtown} location={location} buildings={buildings} materials={materials} retry={downtownRetry} onProgress={onDowntownProgress} />}
    {current?.batches.map(batch => batch.kind === "roads"
      ? <group key={batch.kind}>
          <mesh name="mapped-roads" renderOrder={MAP_RENDER_ORDER.roads} geometry={batch.geometry} material={materials.roads} receiveShadow raycast={noRaycast} dispose={null} />
          <mesh name="mapped-carriageway" renderOrder={MAP_RENDER_ORDER.carriageway} geometry={batch.geometry} material={materials.carriageway} receiveShadow raycast={noRaycast} dispose={null} />
        </group>
      : <mesh key={batch.kind} name={`mapped-${batch.kind}`} renderOrder={MAP_RENDER_ORDER[batch.kind]} geometry={batch.geometry} material={materials[batch.kind]} castShadow={batch.kind === "walls" || batch.kind === "roofs"} receiveShadow raycast={noRaycast} dispose={null} />)}
  </group>;
}
