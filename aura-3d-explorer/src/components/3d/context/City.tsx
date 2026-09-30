"use client";
/**
 * City — the neighbouring blocks from `cityPlan.ts`, drawn as instanced
 * meshes: per facade kind (glass / brick / plaster / stone / curtain-wall
 * tower) one mesh of boxes and one of round towers, plus rooftop plant,
 * spires and, in New York, timber water tanks. Facade tiles repeat per world
 * unit (see `tilePerUnit`) so windows keep a real storey height on every
 * block; roofs get a gravel material through the geometry's material groups.
 *
 * `clearings` are areas where the project's buildings have been moved on the
 * site map: neighbours inside them are hidden (scaled to zero, so instance
 * counts — and the meshes — stay the same while a tower is dragged).
 */
import { useMemo } from "react";
import * as THREE from "three";
import type { CityPreset } from "@/lib/cityPresets";
import { pointInRect, rectsOverlap, type UWRect } from "@/lib/siteLayout";
import { ALONG_U, noRaycast, placeUW, uploadInstances } from "./shared";
import { cityPlan, type CityBuilding } from "./cityPlan";
import { barkTexture, facadeTexture, roofTexture, tilePerUnit, type FacadeKind } from "../textures";

const KINDS: FacadeKind[] = ["glass", "tower", "brick", "plaster", "stone"];

/** Unit box / cylinder with their base on y = 0 (scaled per instance). */
const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 28).translate(0, 0.5, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

const pieceRect = (b: { u: number; w: number; su: number; sw: number }): UWRect => ({ u0: b.u - b.su / 2, u1: b.u + b.su / 2, w0: b.w - b.sw / 2, w1: b.w + b.sw / 2 });
const cleared = (clearings: UWRect[], b: { u: number; w: number; su: number; sw: number }) => clearings.some((c) => rectsOverlap(pieceRect(b), c));
const clearedPoint = (clearings: UWRect[], u: number, w: number) => clearings.some((c) => pointInRect(u, w, c));

function useFacadeMaterials(kind: FacadeKind, shape: CityBuilding["shape"]) {
  return useMemo(() => {
    const glassy = kind === "glass" || kind === "tower";
    // One storey ≈ 0.9 units → 1.1 tiles per unit vertically; bays ~1 per unit.
    const side = new THREE.MeshStandardMaterial({
      map: facadeTexture(kind),
      roughness: kind === "tower" ? 0.22 : glassy ? 0.35 : 0.85,
      metalness: kind === "tower" ? 0.45 : glassy ? 0.25 : 0,
      envMapIntensity: kind === "tower" ? 1.5 : glassy ? 1.2 : 0.4,
    });
    tilePerUnit(side, 1.1, shape === "round" ? "cylinder" : "box");
    const roof = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.95 });
    tilePerUnit(roof, 0.5, shape === "round" ? "cylinder" : "box");
    // BoxGeometry groups: +x, −x, +y (roof), −y, +z, −z. CylinderGeometry: side, top, bottom.
    return shape === "round" ? [side, roof, roof] : [side, side, roof, roof, side, side];
  }, [kind, shape]);
}

function CityKind({ kind, shape, buildings, clearings }: { kind: FacadeKind; shape: CityBuilding["shape"]; buildings: CityBuilding[]; clearings: UWRect[] }) {
  const items = useMemo(() => buildings.filter((b) => b.kind === kind && b.shape === shape), [buildings, kind, shape]);
  const colors = useMemo(() => items.map((b) => new THREE.Color(b.tint)), [items]);
  const matrices = useMemo(
    () => items.map((b) => (cleared(clearings, b) ? HIDDEN : placeUW(b.u, b.w, b.y, ALONG_U, new THREE.Vector3(b.su, b.h, b.sw)))),
    [items, clearings]
  );
  const materials = useFacadeMaterials(kind, shape);
  if (!items.length) return null;
  return (
    <instancedMesh
      ref={(m) => uploadInstances(m, matrices, colors)}
      args={[shape === "round" ? CYLINDER : BOX, materials, items.length]}
      castShadow
      receiveShadow
      raycast={noRaycast}
    />
  );
}

/** Timber water tanks on legs with a conical roof (New York). */
function WaterTanks({ preset, clearings }: { preset: CityPreset; clearings: UWRect[] }) {
  const tanks = cityPlan(preset).tanks;
  const { barrels, roofs, legs } = useMemo(() => {
    const up = new THREE.Quaternion();
    const barrels: THREE.Matrix4[] = [];
    const roofs: THREE.Matrix4[] = [];
    const legs: THREE.Matrix4[] = [];
    for (const t of tanks) {
      const hide = clearedPoint(clearings, t.u, t.w);
      const legH = t.r * 1.1;
      barrels.push(hide ? HIDDEN : placeUW(t.u, t.w, t.y + legH + t.r * 0.9, up, new THREE.Vector3(t.r, t.r * 1.8, t.r)));
      roofs.push(hide ? HIDDEN : placeUW(t.u, t.w, t.y + legH + t.r * 1.8 + t.r * 0.3, up, new THREE.Vector3(t.r * 1.08, t.r * 0.6, t.r * 1.08)));
      for (const [du, dw] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) legs.push(hide ? HIDDEN : placeUW(t.u + du * t.r, t.w + dw * t.r, t.y + legH / 2, up, new THREE.Vector3(0.06, legH, 0.06)));
    }
    return { barrels, roofs, legs };
  }, [tanks, clearings]);
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

/** Spires and masts on the tallest towers: a tapering steel needle. */
function Spires({ preset, clearings }: { preset: CityPreset; clearings: UWRect[] }) {
  const spires = cityPlan(preset).spires;
  const matrices = useMemo(
    () => spires.map((s) => (clearedPoint(clearings, s.u, s.w) ? HIDDEN : placeUW(s.u, s.w, s.y, new THREE.Quaternion(), new THREE.Vector3(s.r, s.h, s.r)))),
    [spires, clearings]
  );
  const geo = useMemo(() => new THREE.CylinderGeometry(0.08, 1, 1, 8).translate(0, 0.5, 0), []);
  if (!spires.length) return null;
  return (
    <instancedMesh ref={(m) => uploadInstances(m, matrices)} args={[geo, undefined, spires.length]} castShadow raycast={noRaycast}>
      <meshStandardMaterial color="#b9bec2" roughness={0.3} metalness={0.8} envMapIntensity={1.3} />
    </instancedMesh>
  );
}

function RoofPlant({ preset, clearings }: { preset: CityPreset; clearings: UWRect[] }) {
  const roof = cityPlan(preset).roof;
  const matrices = useMemo(
    () => roof.map((r) => (clearedPoint(clearings, r.u, r.w) ? HIDDEN : placeUW(r.u, r.w, r.y, ALONG_U, new THREE.Vector3(r.su, r.h, r.sw)))),
    [roof, clearings]
  );
  return (
    <instancedMesh ref={(m) => uploadInstances(m, matrices)} args={[BOX, undefined, matrices.length]} castShadow receiveShadow raycast={noRaycast}>
      <meshStandardMaterial color="#a9a49b" roughness={0.8} metalness={0.2} />
    </instancedMesh>
  );
}

export default function City({ preset, clearings = [] }: { preset: CityPreset; clearings?: UWRect[] }) {
  const buildings = cityPlan(preset).buildings;
  return (
    <group>
      {KINDS.flatMap((k) =>
        (["box", "round"] as const).map((shape) => <CityKind key={`${k}:${shape}`} kind={k} shape={shape} buildings={buildings} clearings={clearings} />)
      )}
      <RoofPlant preset={preset} clearings={clearings} />
      <Spires preset={preset} clearings={clearings} />
      <WaterTanks preset={preset} clearings={clearings} />
    </group>
  );
}
