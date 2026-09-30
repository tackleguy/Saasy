"use client";
/**
 * FurnitureOverlay — procedural low-poly wireframe furniture.
 * -----------------------------------------------------------------------------
 * Spawned inside a floor plate when that floor is isolated (selected).
 * Layouts are generated per zone in the floor's LOCAL coordinates (the parent
 * group already carries the floor's twist), then merged into one geometry:
 *
 *   • Office       — 4 desk clusters (each 4 × 1.2 m × 0.8 m desks + chairs)
 *                    around a central conference table.
 *   • Residential  — L-shaped living-room sofa arrangement, master bed frame,
 *                    kitchen island with stools.
 *   • Crown        — penthouse set: lounge, king bed, island, plunge pool.
 *   • Podium       — reception desk, lift core and lobby lounge seating.
 *
 * Footprints are real metres. Heights are expressed as a fraction of the
 * floor's clear height, because the tower's storeys are stylised (0.85–1.8 m)
 * and true furniture heights would fill the plate.
 *
 * Geometry is cached per zone and shared by every floor of that zone.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FloorData, ZoneId } from "@/types";

/** Thickness of the structural slab under each floor (shared with FloorPlate). */
export const SLAB_THICKNESS = 0.08;

/** An axis-aligned furniture block: centre x/z, footprint w×d (m), height as a fraction of clear height. */
interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

/* ------------------------------------------------------------------ layouts */

/** Four desks (1.2 × 0.8 m) facing each other in a 2 × 2 cluster, with a chair on each. */
function deskCluster(cx: number, cz: number): Block[] {
  const out: Block[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = cx + sx * 0.62;
      const z = cz + sz * 0.41;
      out.push({ x, z, w: 1.2, d: 0.8, h: 0.36 }); // desk
      out.push({ x, z: z + sz * 0.72, w: 0.45, d: 0.45, h: 0.44 }); // chair
    }
  }
  return out;
}

function officeLayout(): Block[] {
  const blocks: Block[] = [];
  for (const [cx, cz] of [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9]]) {
    blocks.push(...deskCluster(cx, cz));
  }
  // Central conference table with six chairs
  blocks.push({ x: 0, z: 0, w: 2.6, d: 1.1, h: 0.36 });
  for (const x of [-0.85, 0, 0.85]) {
    blocks.push({ x, z: -0.85, w: 0.45, d: 0.45, h: 0.44 });
    blocks.push({ x, z: 0.85, w: 0.45, d: 0.45, h: 0.44 });
  }
  return blocks;
}

function residentialLayout(): Block[] {
  return [
    // Living room: L-shaped sofa + coffee table + media console
    { x: -2.0, z: 3.1, w: 2.4, d: 0.8, h: 0.4 },
    { x: -3.5, z: 2.0, w: 0.8, d: 1.6, h: 0.4 },
    { x: -2.0, z: 1.8, w: 1.1, d: 0.65, h: 0.22 },
    { x: -2.0, z: -0.2, w: 2.0, d: 0.4, h: 0.3 },
    // Master bedroom: bed frame, headboard, nightstands
    { x: 2.4, z: -2.3, w: 1.8, d: 2.1, h: 0.28 },
    { x: 2.4, z: -3.45, w: 1.9, d: 0.12, h: 0.62 },
    { x: 1.2, z: -3.2, w: 0.45, d: 0.45, h: 0.32 },
    { x: 3.6, z: -3.2, w: 0.45, d: 0.45, h: 0.32 },
    // Kitchen: island block, rear counter run, stools
    { x: 2.2, z: 1.6, w: 2.2, d: 0.9, h: 0.45 },
    { x: 2.2, z: 3.5, w: 3.0, d: 0.6, h: 0.45 },
    { x: 1.6, z: 0.7, w: 0.4, d: 0.4, h: 0.38 },
    { x: 2.8, z: 0.7, w: 0.4, d: 0.4, h: 0.38 },
  ];
}

function crownLayout(): Block[] {
  return [
    { x: 1.4, z: -1.4, w: 2.0, d: 2.2, h: 0.2 }, // king bed
    { x: 1.4, z: -2.6, w: 2.1, d: 0.12, h: 0.45 }, // headboard
    { x: -1.2, z: 2.3, w: 2.6, d: 0.85, h: 0.25 }, // lounge sofa
    { x: -1.2, z: 1.2, w: 1.1, d: 0.7, h: 0.15 }, // coffee table
    { x: 1.6, z: 1.6, w: 1.8, d: 0.8, h: 0.3 }, // kitchen island
    { x: -2.2, z: -1.3, w: 1.2, d: 2.4, h: 0.06 }, // plunge pool
  ];
}

function podiumLayout(): Block[] {
  return [
    { x: 0, z: -1.5, w: 3.0, d: 2.4, h: 1 }, // lift & stair core
    { x: 0, z: 3.4, w: 3.6, d: 0.8, h: 0.25 }, // reception desk
    ...[[-4, 3.5], [4, 3.5], [-4, -3.5], [4, -3.5]].flatMap(([x, z]) => [
      { x, z, w: 2.2, d: 0.8, h: 0.15 }, // lounge sofa
      { x, z: z - Math.sign(z) * 1.1, w: 0.9, d: 0.9, h: 0.1 }, // side table
    ]),
  ];
}

const LAYOUTS: Record<ZoneId, () => Block[]> = {
  office: officeLayout,
  residential: residentialLayout,
  crown: crownLayout,
  podium: podiumLayout,
};

/* ----------------------------------------------------------------- geometry */

interface FurnitureGeometry {
  edges: THREE.BufferGeometry;
  fill: THREE.BufferGeometry;
}

const cache = new Map<string, FurnitureGeometry>();

/** Build (or fetch from cache) the merged wireframe + ghost-fill geometry for a zone. */
function furnitureFor(zone: ZoneId, floorHeight: number): FurnitureGeometry {
  const key = `${zone}:${floorHeight}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const clear = floorHeight - SLAB_THICKNESS;
  const boxes = LAYOUTS[zone]().map((b) => {
    const h = Math.max(0.02, b.h * clear * 0.95);
    const g = new THREE.BoxGeometry(b.w, h, b.d);
    g.translate(b.x, SLAB_THICKNESS + h / 2 + 0.002, b.z);
    return g;
  });
  const fill = mergeGeometries(boxes, false)!;
  boxes.forEach((g) => g.dispose());
  const result = { fill, edges: new THREE.EdgesGeometry(fill) };
  cache.set(key, result);
  return result;
}

/* ---------------------------------------------------------------- component */

const noRaycast = () => null;

interface Props {
  floor: FloorData;
  /** When true the furniture grows in; when false it retracts and hides. */
  visible: boolean;
}

export default function FurnitureOverlay({ floor, visible }: Props) {
  const geo = useMemo(() => furnitureFor(floor.zone, floor.height), [floor.zone, floor.height]);
  const group = useRef<THREE.Group>(null);
  const lineMat = useRef<THREE.LineBasicMaterial>(null);
  const fillMat = useRef<THREE.MeshBasicMaterial>(null);

  // Ease the "spawn": scale up from the slab and fade in; reverse when hidden.
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || !lineMat.current || !fillMat.current) return;
    const k = 1 - Math.pow(0.0005, dt);
    const target = visible ? 1 : 0;
    g.scale.y = THREE.MathUtils.lerp(g.scale.y, Math.max(target, 0.001), k);
    lineMat.current.opacity = THREE.MathUtils.lerp(lineMat.current.opacity, target * 0.95, k);
    fillMat.current.opacity = THREE.MathUtils.lerp(fillMat.current.opacity, target * 0.1, k);
    g.visible = lineMat.current.opacity > 0.01;
  });

  return (
    <group ref={group} scale={[1, 0.001, 1]} visible={false}>
      <lineSegments geometry={geo.edges} raycast={noRaycast} renderOrder={3}>
        <lineBasicMaterial ref={lineMat} color="#f3e5ab" transparent opacity={0} depthWrite={false} />
      </lineSegments>
      <mesh geometry={geo.fill} raycast={noRaycast} renderOrder={2}>
        <meshBasicMaterial ref={fillMat} color="#d4af37" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
