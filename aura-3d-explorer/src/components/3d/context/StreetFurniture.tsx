"use client";
/**
 * StreetFurniture — lamp posts along the promenade and near sidewalk, and
 * benches facing the water. All instanced.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { LAYOUT } from "@/lib/siteLayout";
import { brushedMetalTexture, woodBump, woodTexture } from "../textures";
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
        <meshStandardMaterial map={brushedMetalTexture("#4a4e54")} metalness={0.72} roughness={0.38} envMapIntensity={0.8} />
      </instancedMesh>
      <instancedMesh ref={(m) => uploadInstances(m, heads)} args={[undefined, undefined, heads.length]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f3ecdc" emissive="#f5e6c8" emissiveIntensity={0.35} roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={(m) => uploadInstances(m, seats)} args={[undefined, undefined, seats.length]} castShadow raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={woodTexture("#c4a06a", "#7a5538", 29)} bumpMap={woodBump("#c4a06a", "#7a5538", 29)} bumpScale={0.04} roughness={0.62} />
      </instancedMesh>
      <instancedMesh ref={(m) => uploadInstances(m, legs)} args={[undefined, undefined, legs.length]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={brushedMetalTexture("#4a4e54")} metalness={0.72} roughness={0.38} />
      </instancedMesh>
    </group>
  );
}
