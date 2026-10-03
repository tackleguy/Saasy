"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Building } from "@/types";
import type { MapSnapshot, ProjectLocation } from "@/lib/geographicContext";
import { buildMappedRoofDetails, type RoofDetailKind } from "@/lib/mappedRoofDetails";
import { useCinematic } from "../environment/settings";
import { invalidateShadows } from "../staticShadows";
import { noRaycast } from "./shared";

/** Three shared geometry batches. Equipment is illustrative, never a map survey. */
export default function MappedRoofDetails({ snapshot, location, buildings }: { snapshot: MapSnapshot; location: ProjectLocation; buildings: Building[] }) {
  const { tier } = useCinematic();
  const host = useRef<THREE.Group>(null);
  const detail = useMemo(() => buildMappedRoofDetails(snapshot, location, buildings, tier), [snapshot, location.latitude, location.longitude, buildings, tier]);
  useLayoutEffect(() => {
    const group = host.current;
    if (!group || !detail.units) return;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials: Record<RoofDetailKind, THREE.MeshStandardMaterial> = {
      pads: new THREE.MeshStandardMaterial({ color: "#a2a59b", roughness: .94, metalness: 0 }),
      housings: new THREE.MeshStandardMaterial({ color: "#aab0ad", roughness: .68, metalness: .22 }),
      vents: new THREE.MeshStandardMaterial({ color: "#4b575a", roughness: .8, metalness: .16 }),
    };
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
    const meshes = (Object.keys(detail.batches) as RoofDetailKind[]).map(kind => {
      const instances = detail.batches[kind], mesh = new THREE.InstancedMesh(geometry, materials[kind], instances.length);
      mesh.name = `mapped-roof-${kind}`;
      mesh.raycast = noRaycast;
      mesh.castShadow = kind === "housings" && tier !== "low";
      mesh.receiveShadow = true;
      instances.forEach((instance, index) => {
        matrix.makeRotationY(instance.rotationY).scale(scale.set(...instance.size)).setPosition(...instance.position);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      group.add(mesh);
      return mesh;
    });
    invalidateShadows();
    return () => {
      for (const mesh of meshes) { group.remove(mesh); mesh.dispose(); }
      geometry.dispose();
      Object.values(materials).forEach(material => material.dispose());
      invalidateShadows();
    };
  }, [detail, tier]);
  return <group ref={host} name="mapped-roof-details" dispose={null} userData={{ illustrative: true, roofs: detail.decoratedRoofs, units: detail.units, batches: detail.units ? 3 : 0 }} />;
}
