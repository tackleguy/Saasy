"use client";
/**
 * City — the neighbouring blocks from `cityPlan.ts`, drawn as one instanced
 * mesh per facade kind (glass / brick / plaster / stone) plus one for rooftop
 * plant. Facade tiles repeat per world unit (see `tilePerUnit`) so windows
 * keep a real storey height on every block; roofs get a separate gravel
 * material through the box's material groups (+y face).
 */
import { useMemo } from "react";
import * as THREE from "three";
import { ALONG_U, noRaycast, placeUW, uploadInstances } from "./shared";
import { CITY_BUILDINGS, CITY_ROOF } from "./cityPlan";
import { facadeTexture, roofTexture, tilePerUnit, type FacadeKind } from "../textures";

const KINDS: FacadeKind[] = ["glass", "brick", "plaster", "stone"];

/** Unit box with its base on y = 0 (scaled per instance). */
const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

function CityKind({ kind }: { kind: FacadeKind }) {
  const items = useMemo(() => CITY_BUILDINGS.filter((b) => b.kind === kind), [kind]);
  const { matrices, colors } = useMemo(() => {
    const c = new THREE.Color();
    return {
      matrices: items.map((b) => placeUW(b.u, b.w, 0, ALONG_U, new THREE.Vector3(b.su, b.h, b.sw))),
      colors: items.map((b) => c.clone().setScalar(b.tint)),
    };
  }, [items]);

  const materials = useMemo(() => {
    // One storey ≈ 0.9 units → 1.1 tiles per unit vertically; bays ~1 per unit.
    const side = new THREE.MeshStandardMaterial({
      map: facadeTexture(kind),
      roughness: kind === "glass" ? 0.35 : 0.85,
      metalness: kind === "glass" ? 0.25 : 0,
      envMapIntensity: kind === "glass" ? 1.2 : 0.4,
    });
    tilePerUnit(side, 1.1);
    const roof = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.95 });
    tilePerUnit(roof, 0.5);
    // BoxGeometry groups: +x, −x, +y (roof), −y, +z, −z
    return [side, side, roof, roof, side, side];
  }, [kind]);

  if (!items.length) return null;
  return <instancedMesh ref={(m) => uploadInstances(m, matrices, colors)} args={[BOX, materials, items.length]} castShadow receiveShadow raycast={noRaycast} />;
}

function RoofPlant() {
  const matrices = useMemo(() => CITY_ROOF.map((r) => placeUW(r.u, r.w, r.y, ALONG_U, new THREE.Vector3(r.su, r.h, r.sw))), []);
  return (
    <instancedMesh ref={(m) => uploadInstances(m, matrices)} args={[BOX, undefined, matrices.length]} castShadow receiveShadow raycast={noRaycast}>
      <meshStandardMaterial color="#a9a49b" roughness={0.8} metalness={0.2} />
    </instancedMesh>
  );
}

export default function City() {
  return (
    <group>
      {KINDS.map((k) => (
        <CityKind key={k} kind={k} />
      ))}
      <RoofPlant />
    </group>
  );
}
