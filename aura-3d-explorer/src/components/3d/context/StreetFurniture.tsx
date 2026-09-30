"use client";
/**
 * StreetFurniture — lamp posts along the promenade and near sidewalk, and
 * benches facing the water. All instanced.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { LAYOUT } from "@/lib/siteLayout";
import { woodTexture } from "../textures";
import { ALONG_U, noRaycast, placeUW, uploadInstances } from "./shared";

export default function StreetFurniture() {
  const { poles, heads, seats, legs } = useMemo(() => {
    const poles: THREE.Matrix4[] = [];
    const heads: THREE.Matrix4[] = [];
    const seats: THREE.Matrix4[] = [];
    const legs: THREE.Matrix4[] = [];
    const up = new THREE.Quaternion();
    // Lamps: promenade edge every 12 units, near sidewalk every 14 (offset)
    for (let u = -168; u <= 168; u += 12) {
      poles.push(placeUW(u, LAYOUT.promenade[1] - 0.35, 0.75, up, new THREE.Vector3(0.05, 1.5, 0.05)));
      heads.push(placeUW(u, LAYOUT.promenade[1] - 0.35, 1.5, ALONG_U, new THREE.Vector3(0.22, 0.08, 0.3)));
    }
    for (let u = -161; u <= 161; u += 14) {
      poles.push(placeUW(u, LAYOUT.sidewalkNear[0] + 0.3, 0.75, up, new THREE.Vector3(0.05, 1.5, 0.05)));
      heads.push(placeUW(u, LAYOUT.sidewalkNear[0] + 0.3, 1.5, ALONG_U, new THREE.Vector3(0.22, 0.08, 0.3)));
    }
    // Benches on the promenade, facing the water
    for (let u = -150; u <= 150; u += 18) {
      seats.push(placeUW(u, LAYOUT.promenade[0] + 1.9, 0.14, ALONG_U, new THREE.Vector3(0.6, 0.04, 0.16)));
      seats.push(placeUW(u, LAYOUT.promenade[0] + 1.98, 0.26, ALONG_U, new THREE.Vector3(0.6, 0.16, 0.03)));
      legs.push(placeUW(u - 0.22, LAYOUT.promenade[0] + 1.9, 0.06, ALONG_U, new THREE.Vector3(0.04, 0.12, 0.14)));
      legs.push(placeUW(u + 0.22, LAYOUT.promenade[0] + 1.9, 0.06, ALONG_U, new THREE.Vector3(0.04, 0.12, 0.14)));
    }
    return { poles, heads, seats, legs };
  }, []);

  return (
    <group>
      <instancedMesh ref={(m) => uploadInstances(m, poles)} args={[undefined, undefined, poles.length]} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.5, 0.6, 1, 8]} />
        <meshStandardMaterial color="#3d3f43" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={(m) => uploadInstances(m, heads)} args={[undefined, undefined, heads.length]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e8e1d0" emissive="#f5e6c8" emissiveIntensity={0.25} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={(m) => uploadInstances(m, seats)} args={[undefined, undefined, seats.length]} castShadow raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={woodTexture("#b08d63", "#7b5b3f")} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={(m) => uploadInstances(m, legs)} args={[undefined, undefined, legs.length]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3d3f43" metalness={0.6} roughness={0.5} />
      </instancedMesh>
    </group>
  );
}
