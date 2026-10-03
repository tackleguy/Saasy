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
import { createMappedGeometryBuilder, type MapBatchKind, type MappedGeometry } from "@/lib/mappedGeometry";
import { MAP_RENDER_ORDER, MAP_SURFACE_DEPTH } from "@/lib/renderDepth";
import { invalidateShadows } from "../staticShadows";
import { noRaycast } from "./shared";

const IGNORE_DOWNTOWN_PROGRESS = (_progress: DowntownProgress) => {};
const FINISHES = { footprints: "#aaa28f", parks: "#506746" } as const;

/** Geographic envelopes preserve mapped skyline and waterfront. Facade, roof
 * and street finishes are illustrative. Missing map data
 * leaves a neutral ground plane; unknown building heights remain footprints. */
export default function MappedContext({ snapshot, location, buildings, preset, showGround = true, downtown = null, downtownRetry = 0, onDowntownProgress = IGNORE_DOWNTOWN_PROGRESS }: { snapshot: MapSnapshot | null; location: ProjectLocation; buildings: Building[]; preset: CityPreset; showGround?: boolean; downtown?: DowntownManifest | null; downtownRetry?: number; onDowntownProgress?: (progress: DowntownProgress) => void }) {
  const [prepared, setPrepared] = useState<{ snapshot: MapSnapshot; latitude: number; longitude: number; buildings: Building[]; data: MappedGeometry } | null>(null);
  const { time, tier } = useCinematic();
  const reduced = useRef(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reduced.current = media.matches; };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const { materials, facade, water } = useMemo(() => {
    const facade = contextFacadeMaterial(preset), water = mappedWaterMaterial();
    const surface = (kind: keyof typeof FINISHES) => new THREE.MeshStandardMaterial({ color: FINISHES[kind], roughness: .93, metalness: 0, envMapIntensity: .45, ...MAP_SURFACE_DEPTH });
    const materials: Record<MapBatchKind, THREE.Material> = { walls: facade.material, roofs: contextRoofMaterial(), footprints: surface("footprints"), water: water.material, parks: surface("parks"), roads: new THREE.LineBasicMaterial({ color: "#575750", ...MAP_SURFACE_DEPTH }) };
    return { materials, facade, water };
  }, [preset]);
  useEffect(() => () => Object.values(materials).forEach(material => material.dispose()), [materials]);
  useFrame(({ scene }, delta) => {
    // Three uses scene.environmentIntensity whenever material.envMap is null.
    // Bind the shared (externally owned) environment so individual finishes can
    // retain their reflective response while following the time-of-day exposure.
    for (const [material, strength] of [[materials.walls, 1.8], [materials.roofs, .5], [materials.water, 1.1]] as const) {
      const surface = material as THREE.MeshStandardMaterial;
      if (surface.envMap !== scene.environment) { surface.envMap = scene.environment; surface.needsUpdate = true; }
      surface.envMapIntensity = scene.environmentIntensity * strength;
    }
    facade.uniforms.auraNight.value = reduced.current ? SUN[time].night : THREE.MathUtils.damp(facade.uniforms.auraNight.value, SUN[time].night, 3, delta);
    if (!reduced.current && tier !== "low") water.uniforms.auraWaterTime.value += Math.min(delta, .05);
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
      <meshStandardMaterial color="#777a69" roughness={1} metalness={0} envMapIntensity={.35} />
    </mesh>}
    {current && snapshot && <MappedRoofDetails snapshot={snapshot} location={location} buildings={buildings} />}
    {snapshot && downtown?.id === snapshot.id && <DowntownContext manifest={downtown} location={location} buildings={buildings} materials={materials} retry={downtownRetry} onProgress={onDowntownProgress} />}
    {current?.batches.map(batch => batch.kind === "roads"
      ? <lineSegments key={batch.kind} name="mapped-roads" renderOrder={MAP_RENDER_ORDER.roads} geometry={batch.geometry} material={materials.roads} raycast={noRaycast} dispose={null} />
      : <mesh key={batch.kind} name={`mapped-${batch.kind}`} renderOrder={MAP_RENDER_ORDER[batch.kind]} geometry={batch.geometry} material={materials[batch.kind]} castShadow={batch.kind === "walls" || batch.kind === "roofs"} receiveShadow raycast={noRaycast} dispose={null} />)}
  </group>;
}
