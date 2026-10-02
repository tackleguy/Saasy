"use client";
import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useCinematic, SUN } from "../environment/settings";
import { contextFacadeMaterial } from "./architecturalContextMaterial";
import * as THREE from "three";
import type { Building } from "@/types";
import type { MapSnapshot, ProjectLocation } from "@/lib/geographicContext";
import { createMappedGeometryBuilder, type MapBatchKind, type MappedGeometry } from "@/lib/mappedGeometry";
import { invalidateShadows } from "../staticShadows";
import { noRaycast } from "./shared";

const FINISHES = { walls: "#515a61", roofs: "#858982", footprints: "#989a91", water: "#223d49", parks: "#586948" } as const;

/** Geographic context has no invented skyline or waterfront. Missing map data
 * leaves a neutral ground plane; unknown building heights remain footprints. */
export default function MappedContext({ snapshot, location, buildings, showGround = false }: { snapshot: MapSnapshot | null; location: ProjectLocation; buildings: Building[]; showGround?: boolean }) {
  const [prepared, setPrepared] = useState<{ snapshot: MapSnapshot; latitude: number; longitude: number; buildings: Building[]; data: MappedGeometry } | null>(null);
  const { time } = useCinematic();
  const facade = useMemo(contextFacadeMaterial, []);
  useFrame(() => { facade.night.value = SUN[time].night; });
  const materials = useMemo<Record<MapBatchKind, THREE.Material>>(() => {
    const surface = (kind: keyof typeof FINISHES) => new THREE.MeshStandardMaterial({ color: FINISHES[kind], roughness: kind === "water" ? 0.18 : 0.88, metalness: kind === "water" ? .45 : 0, envMapIntensity: kind === "water" ? 1.5 : .8 });
    return { walls: facade.material, roofs: surface("roofs"), footprints: surface("footprints"), water: surface("water"), parks: surface("parks"), roads: new THREE.LineBasicMaterial({ color: "#8d8b85" }) };
  }, [facade]);
  useEffect(() => () => Object.values(materials).forEach(material => material.dispose()), [materials]);

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
    {showGround && <mesh name="mapped-ground" rotation-x={-Math.PI / 2} position-y={-0.015} receiveShadow raycast={noRaycast}>
      <planeGeometry args={[10000, 10000]} />
      <meshStandardMaterial color="#9b9d92" roughness={1} metalness={0} />
    </mesh>}
    {current?.batches.map(batch => batch.kind === "roads"
      ? <lineSegments key={batch.kind} name="mapped-roads" geometry={batch.geometry} material={materials.roads} raycast={noRaycast} dispose={null} />
      : <mesh key={batch.kind} name={`mapped-${batch.kind}`} geometry={batch.geometry} material={materials[batch.kind]} castShadow={batch.kind === "walls" || batch.kind === "roofs"} receiveShadow raycast={noRaycast} dispose={null} />)}
  </group>;
}
