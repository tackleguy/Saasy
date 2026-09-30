"use client";
/**
 * City — the neighbouring blocks from `cityPlan.ts`, drawn as one instanced
 * mesh per facade kind (glass / brick / plaster / stone) plus one for rooftop
 * plant and, in New York, timber water tanks. Facade tiles repeat per world
 * unit (see `tilePerUnit`) so windows keep a real storey height on every
 * block; roofs get a separate gravel material through the box's material
 * groups (+y face). Per-building tints come from the city preset.
 */
import { useMemo } from "react";
import * as THREE from "three";
import type { CityPreset } from "@/lib/cityPresets";
import { ALONG_U, noRaycast, placeUW, uploadInstances } from "./shared";
import { cityPlan, type CityBuilding } from "./cityPlan";
import { barkTexture, facadeTexture, roofTexture, tilePerUnit, type FacadeKind } from "../textures";

const KINDS: FacadeKind[] = ["glass", "brick", "plaster", "stone"];

/** Unit box with its base on y = 0 (scaled per instance). */
const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

function CityKind({ kind, buildings }: { kind: FacadeKind; buildings: CityBuilding[] }) {
  const items = useMemo(() => buildings.filter((b) => b.kind === kind), [buildings, kind]);
  const { matrices, colors } = useMemo(
    () => ({
      matrices: items.map((b) => placeUW(b.u, b.w, b.y, ALONG_U, new THREE.Vector3(b.su, b.h, b.sw))),
      colors: items.map((b) => new THREE.Color(b.tint)),
    }),
    [items]
  );

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

/** Timber water tanks on legs with a conical roof (New York). */
function WaterTanks({ preset }: { preset: CityPreset }) {
  const tanks = cityPlan(preset).tanks;
  const { barrels, roofs, legs } = useMemo(() => {
    const up = new THREE.Quaternion();
    const barrels: THREE.Matrix4[] = [];
    const roofs: THREE.Matrix4[] = [];
    const legs: THREE.Matrix4[] = [];
    for (const t of tanks) {
      const legH = t.r * 1.1;
      barrels.push(placeUW(t.u, t.w, t.y + legH + t.r * 0.9, up, new THREE.Vector3(t.r, t.r * 1.8, t.r)));
      roofs.push(placeUW(t.u, t.w, t.y + legH + t.r * 1.8 + t.r * 0.3, up, new THREE.Vector3(t.r * 1.08, t.r * 0.6, t.r * 1.08)));
      for (const [du, dw] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) legs.push(placeUW(t.u + du * t.r, t.w + dw * t.r, t.y + legH / 2, up, new THREE.Vector3(0.06, legH, 0.06)));
    }
    return { barrels, roofs, legs };
  }, [tanks]);
  const wood = useMemo(() => {
    const t = barkTexture().clone();
    t.repeat.set(6, 1);
    t.needsUpdate = true;
    return t;
  }, []);
  if (!tanks.length) return null;
  return (
    <group>
      <instancedMesh ref={(m) => uploadInstances(m, barrels)} args={[undefined, undefined, barrels.length]} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[1, 1, 1, 14]} />
        <meshStandardMaterial map={wood} color="#b7926a" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={(m) => uploadInstances(m, roofs)} args={[undefined, undefined, roofs.length]} castShadow raycast={noRaycast}>
        <coneGeometry args={[1, 1, 14]} />
        <meshStandardMaterial color="#3d3a36" roughness={0.7} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={(m) => uploadInstances(m, legs)} args={[BOX, undefined, legs.length]} raycast={noRaycast}>
        <meshStandardMaterial color="#4a4640" roughness={0.6} metalness={0.4} />
      </instancedMesh>
    </group>
  );
}

function RoofPlant({ preset }: { preset: CityPreset }) {
  const roof = cityPlan(preset).roof;
  const matrices = useMemo(() => roof.map((r) => placeUW(r.u, r.w, r.y, ALONG_U, new THREE.Vector3(r.su, r.h, r.sw))), [roof]);
  return (
    <instancedMesh ref={(m) => uploadInstances(m, matrices)} args={[BOX, undefined, matrices.length]} castShadow receiveShadow raycast={noRaycast}>
      <meshStandardMaterial color="#a9a49b" roughness={0.8} metalness={0.2} />
    </instancedMesh>
  );
}

export default function City({ preset }: { preset: CityPreset }) {
  const buildings = cityPlan(preset).buildings;
  return (
    <group>
      {KINDS.map((k) => (
        <CityKind key={k} kind={k} buildings={buildings} />
      ))}
      <RoofPlant preset={preset} />
      <WaterTanks preset={preset} />
    </group>
  );
}
