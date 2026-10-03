"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { ModelCut } from "./presentationContext";
import { invalidateShadows } from "./staticShadows";
export default function ImportedModel({ object, position, cut }: { object: THREE.Object3D; position: [number, number]; cut?: ModelCut }) {
  const prepared = useMemo(() => {
    const copy = clone(object);
    const materials = new Map<THREE.Material, THREE.Material>();
    copy.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const get = (m: THREE.Material) => { if (!materials.has(m)) materials.set(m, m.clone()); return materials.get(m)!; };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(get) : get(mesh.material);
    });
    return { copy, materials: [...materials.values()] };
  }, [object]);
  useEffect(() => () => prepared.materials.forEach(m => m.dispose()), [prepared]);
  useEffect(() => {
    const height = Number(object.userData.heightUnits) || 1;
    const planes = !cut || cut.mode === "exterior" ? [] : [cut.mode === "floor"
      ? new THREE.Plane(new THREE.Vector3(0, -1, 0), height * cut.fraction)
      : new THREE.Plane(new THREE.Vector3(0, 0, -1), position[1])];
    for (const material of prepared.materials) { material.clippingPlanes = planes; material.clipShadows = true; material.needsUpdate = true; }
    invalidateShadows();
  }, [prepared, cut?.mode, cut?.fraction, object, position]);
  return <group position={[position[0], 0, position[1]]}><primitive object={prepared.copy} dispose={null}/></group>;
}
