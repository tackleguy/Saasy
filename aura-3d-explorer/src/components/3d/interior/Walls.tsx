"use client";
/**
 * Walls — the partition plan of an isolated floor, drawn as instanced boxes.
 * -----------------------------------------------------------------------------
 * Plate-local METRES (render inside a group scaled by MODEL_SCALE, inside the
 * twisted plate group — the same frame FurnitureOverlay uses).
 *   • plaster walls (demising + partitions): crisp white boxes with flat cut
 *     tops, split into solid runs around every opening, with a lintel above
 *     each door; a slim skirting on both faces
 *   • glass partitions: a thin transmissive pane with dark bronze head and
 *     sill channels; openings get a glass transom
 * Walls stop at the plan height (2.4 – 2.6 m, below the ceiling) so rooms
 * read from above, like the kit bathrooms.
 * Everything is 4–5 InstancedMeshes, whatever the number of walls.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Pt, RoomPlan, WallSegment } from "@/lib/roomPlan";
import { DOOR_H } from "@/lib/roomPlan";
import { interiorMaterials, UNIT_BOX, type InteriorMatKey } from "./materials";

const noRaycast = () => null;

/** Instance matrix for a box running a → b, from y0 to y1, `t` thick. */
export function runMatrix(a: Pt, b: Pt, y0: number, y1: number, t: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L = Math.hypot(dx, dz);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dz, dx));
  return out.compose(new THREE.Vector3((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2), q, new THREE.Vector3(L, y1 - y0, t));
}

const lerpPt = (a: Pt, b: Pt, s: number, L: number): Pt => [a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L];

interface Batches {
  wall: THREE.Matrix4[];
  skirting: THREE.Matrix4[];
  glass: THREE.Matrix4[];
  bronze: THREE.Matrix4[];
}

const SKIRT_H = 0.08;
const CHANNEL = 0.05;

function build(plan: RoomPlan): Batches {
  const out: Batches = { wall: [], skirting: [], glass: [], bronze: [] };
  const doorTop = (w: WallSegment) => Math.min(DOOR_H, w.height - 0.2);
  for (const w of plan.walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (L < 1e-3) continue;
    // Solid runs between openings, lintels over them.
    const runs: [number, number][] = [];
    let s = 0;
    for (const o of w.openings) {
      if (o.t0 > s) runs.push([s, o.t0]);
      s = Math.max(s, o.t1);
    }
    if (L > s) runs.push([s, L]);
    const glass = w.kind === "glass";
    for (const [s0, s1] of runs) {
      if (s1 - s0 < 0.01) continue;
      const a = lerpPt(w.a, w.b, s0, L);
      const b = lerpPt(w.a, w.b, s1, L);
      if (glass) {
        out.glass.push(runMatrix(a, b, CHANNEL, w.height - CHANNEL, w.thickness * 0.4));
        out.bronze.push(runMatrix(a, b, 0, CHANNEL, w.thickness));
        out.bronze.push(runMatrix(a, b, w.height - CHANNEL, w.height, w.thickness));
      } else {
        out.wall.push(runMatrix(a, b, 0, w.height, w.thickness));
        out.skirting.push(runMatrix(a, b, 0, SKIRT_H, w.thickness + 0.018));
      }
    }
    for (const o of w.openings) {
      const a = lerpPt(w.a, w.b, o.t0, L);
      const b = lerpPt(w.a, w.b, o.t1, L);
      const top = doorTop(w);
      if (glass) {
        out.glass.push(runMatrix(a, b, top + CHANNEL, w.height - CHANNEL, w.thickness * 0.4));
        out.bronze.push(runMatrix(a, b, top, top + CHANNEL, w.thickness));
        out.bronze.push(runMatrix(a, b, w.height - CHANNEL, w.height, w.thickness));
      } else {
        out.wall.push(runMatrix(a, b, top, w.height, w.thickness));
      }
    }
  }
  return out;
}

function Batch({ matrices, mat, shadows = true }: { matrices: THREE.Matrix4[]; mat: InteriorMatKey; shadows?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  if (!matrices.length) return null;
  return <instancedMesh ref={ref} args={[UNIT_BOX, interiorMaterials()[mat], matrices.length]} castShadow={shadows} receiveShadow raycast={noRaycast} />;
}

export default function Walls({ plan }: { plan: RoomPlan }) {
  const b = useMemo(() => build(plan), [plan]);
  return (
    <group>
      <Batch key={`w${b.wall.length}`} matrices={b.wall} mat="wall" />
      <Batch key={`s${b.skirting.length}`} matrices={b.skirting} mat="skirting" shadows={false} />
      <Batch key={`g${b.glass.length}`} matrices={b.glass} mat="glass" shadows={false} />
      <Batch key={`b${b.bronze.length}`} matrices={b.bronze} mat="bronze" />
    </group>
  );
}
