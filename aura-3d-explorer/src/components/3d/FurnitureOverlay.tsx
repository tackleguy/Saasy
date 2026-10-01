"use client";
/**
 * FurnitureOverlay — real-size procedural furniture for the isolated floor.
 * -----------------------------------------------------------------------------
 * 1. `layoutFloor` places ensembles (desk clusters, living rooms, kitchens,
 *    beds, pools…) on the plate in real metres, avoiding the core.
 * 2. Each ensemble expands into primitive `Part`s from the furniture kit.
 * 3. Parts are grouped by (geometry, material) into InstancedMeshes, so a
 *    fully furnished floor costs ~20 draw calls however many chairs it has.
 * 4. The whole set is scaled by MODEL_SCALE into scene units and "grows" up
 *    from the slab when it mounts.
 *
 * Only the selected floor mounts this component, so the rest of the site
 * pays nothing for furniture.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { FloorData } from "@/types";
import { MODEL_SCALE } from "@/lib/tower";
import { getGeometries, getMaterials, PIECES, type GeoKey, type MatKey, type Part } from "./furniture/kit";
import { layoutFloor } from "./furniture/layouts";
import { DEFAULT_FIT, type FloorFit } from "@/lib/apartmentFit";
import { place } from "./furniture/kit";

/** Thickness of the structural slab under each floor (shared with FloorPlate). */
export const SLAB_THICKNESS = 0.08;

interface Batch {
  key: string;
  geo: GeoKey;
  mat: MatKey;
  matrices: THREE.Matrix4[];
}

const batchCache = new Map<string, Batch[]>();

/** Expand a floor's layout into instanced batches (cached per plate shape). */
function batchesFor(floor: FloorData, coreSize: number, crownFloors: number, fit: FloorFit): Batch[] {
  // The core stays square to the world while the plate twists, so in the
  // plate's local frame it is rotated by −rotationY (tested exactly by the planner).
  const coreHalfM = coreSize / 2 / MODEL_SCALE;
  const coreAngle = -floor.rotationY;
  const zoneIndex = floor.zone === "crown" ? floor.zoneIndex : 0;
  const key = [floor.zone, floor.width, floor.depth, coreHalfM.toFixed(2), coreAngle.toFixed(3), zoneIndex, crownFloors, floor.shape?.kind, floor.shape?.amount, floor.amenity ?? "", fit.scheme, fit.furniture].join(":");
  const hit = batchCache.get(key);
  if (hit) return hit;

  const placements = layoutFloor(floor.zone, floor.width / MODEL_SCALE, floor.depth / MODEL_SCALE, coreHalfM, coreAngle, zoneIndex, crownFloors, floor.shape, floor.amenity, fit);
  const parts: Part[] = placements.flatMap((pl) => place(PIECES[pl.piece].build(), pl.x, pl.z, pl.rot));

  const map = new Map<string, Batch>();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const p of parts) {
    const k = `${p.g}|${p.m}`;
    let b = map.get(k);
    if (!b) map.set(k, (b = { key: k, geo: p.g, mat: p.m, matrices: [] }));
    q.setFromAxisAngle(up, p.r ?? 0);
    b.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(...p.p), q, new THREE.Vector3(...p.s)));
  }
  const batches = [...map.values()];
  batchCache.set(key, batches);
  return batches;
}

/** One InstancedMesh for a (geometry, material) batch. */
function BatchMesh({ batch }: { batch: Batch }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = getGeometries()[batch.geo];
  const material = getMaterials()[batch.mat];

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    batch.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch]);

  const transparent = batch.mat === "water" || batch.mat === "glass";
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, batch.matrices.length]}
      castShadow={!transparent && batch.mat !== "lamp"}
      receiveShadow
      raycast={() => null}
    />
  );
}

interface Props {
  floor: FloorData;
  coreSize: number;
  /** Floors in the building's crown (the penthouse spans them all). */
  crownFloors: number;
  fit?: FloorFit;
}

export default function FurnitureOverlay({ floor, coreSize, crownFloors, fit = DEFAULT_FIT }: Props) {
  const empty = fit.furniture === "none" && (floor.zone === "residential" || floor.zone === "crown") && !floor.amenity;
  const batches = useMemo(() => (empty ? [] : batchesFor(floor, coreSize, crownFloors, fit)), [empty, floor, coreSize, crownFloors, fit]);
  const group = useRef<THREE.Group>(null);

  // Grow up from the slab on mount.
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || g.scale.y >= MODEL_SCALE - 1e-4) return;
    const k = 1 - Math.pow(0.002, dt);
    g.scale.y = Math.min(MODEL_SCALE, THREE.MathUtils.lerp(g.scale.y, MODEL_SCALE, k) + 1e-4);
  });

  return (
    <group ref={group} position={[0, SLAB_THICKNESS + 0.036, 0]} scale={[MODEL_SCALE, 0.001, MODEL_SCALE]}>
      {batches.map((b) => (
        <BatchMesh key={`${b.key}:${b.matrices.length}`} batch={b} />
      ))}
    </group>
  );
}
