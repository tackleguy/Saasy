"use client";
/**
 * CoreService — the walkable service band of the core: passage (+ the walkway
 * out through the −Z face), refuse room
 * with its chutes, electrical / riser closet.
 * -----------------------------------------------------------------------------
 * Building-local scene units (the core never twists), mounted by LiftCore on
 * the walked / isolated floor. Layout from lib/coreLayout:
 *   • coreShell(…)  — the core's concrete as ONE merged, cached geometry
 *                     (lift shell + walls round the passage and rooms, with
 *                     lintels over the doors); LiftCore draws it
 *   • <CoreService> — floors (stone passage, grey resin rooms), the two chute
 *                     enclosures in brushed stainless with hopper doors and
 *                     REFUSE / RECYCLING signs, bins, the riser pipes and
 *                     distribution board, walnut doors (interior Doors), and
 *                     plaques beside each door on the passage side.
 * Open-topped like the apartment walls: from above (isolated floor, ceiling
 * hidden) you look down into the passage; walking, the plate ceiling closes it.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MODEL_SCALE } from "@/lib/tower";
import { coreBlocks, coreLayout } from "@/lib/coreLayout";
import type { DoorSpec } from "@/lib/roomPlan";
import Doors from "./Doors";
import { interiorMaterials } from "./materials";

const noRaycast = () => null;
const S = MODEL_SCALE;

const shellCache = new Map<string, THREE.BufferGeometry>();

/** Concrete of one core slice, merged (cached per core / height / passage state). */
export function coreShell(core: number, floorH: number, slab: number, open: boolean): THREE.BufferGeometry {
  const key = `${core}:${floorH}:${slab}:${open}`;
  const hit = shellCache.get(key);
  if (hit) return hit;
  const parts = coreBlocks(core, floorH, slab, open).map((b) => {
    const g = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
    g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    return g;
  });
  const g = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  parts.forEach((p) => p.dispose());
  shellCache.set(key, g);
  return g;
}

/* -------------------------------------------------------------- materials */

let mats: Record<"steel" | "hopper" | "resin" | "bin" | "binGreen" | "pipe" | "board", THREE.Material> | null = null;
function serviceMaterials() {
  if (!mats)
    mats = {
      steel: new THREE.MeshStandardMaterial({ color: "#c9cfd5", metalness: 0.9, roughness: 0.3 }),
      hopper: new THREE.MeshStandardMaterial({ color: "#9aa3ab", metalness: 0.95, roughness: 0.22 }),
      resin: new THREE.MeshStandardMaterial({ color: "#8e8c88", roughness: 0.55 }),
      bin: new THREE.MeshStandardMaterial({ color: "#2f3a44", roughness: 0.7 }),
      binGreen: new THREE.MeshStandardMaterial({ color: "#3f6b4a", roughness: 0.7 }),
      pipe: new THREE.MeshStandardMaterial({ color: "#5b6168", metalness: 0.6, roughness: 0.45 }),
      board: new THREE.MeshStandardMaterial({ color: "#d9d6cf", roughness: 0.6 }),
    };
  return mats;
}

const signCache = new Map<string, THREE.Material>();
/** A small enamel sign: white text on a coloured plate (canvas texture, cached). */
function signMaterial(text: string, bg: string): THREE.Material {
  const key = `${text}|${bg}`;
  const hit = signCache.get(key);
  if (hit) return hit;
  let map: THREE.Texture | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const x = c.getContext("2d");
    if (x) {
      x.fillStyle = bg;
      x.fillRect(0, 0, 256, 64);
      x.fillStyle = "#ffffff";
      x.font = "600 30px 'Helvetica Neue', Arial, sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(text, 128, 34);
      map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
    }
  }
  const m = new THREE.MeshStandardMaterial({ map, color: map ? "#ffffff" : bg, roughness: 0.4, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 0.25 });
  signCache.set(key, m);
  return m;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const PLANE = new THREE.PlaneGeometry(1, 1);

function Box({ x0, x1, y0, y1, z0, z1, material }: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; material: THREE.Material }) {
  return <mesh geometry={BOX} material={material} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} scale={[x1 - x0, y1 - y0, z1 - z0]} castShadow receiveShadow raycast={noRaycast} />;
}

/** Sign plate centred at (x, y, z) facing ±Z. */
function Sign({ text, bg, x, y, z, facing, w = 0.42 * S }: { text: string; bg: string; x: number; y: number; z: number; facing: 1 | -1; w?: number }) {
  return <mesh geometry={PLANE} material={signMaterial(text, bg)} position={[x, y, z]} rotation-y={facing > 0 ? 0 : Math.PI} scale={[w, w / 4, 1]} raycast={noRaycast} />;
}

interface Props {
  coreSize: number;
  floorHeight: number;
  slab: number;
}

export default function CoreService({ coreSize, floorHeight, slab }: Props) {
  const lay = coreLayout(coreSize);
  const sv = lay.service;
  const doors = useMemo<DoorSpec[]>(() => {
    if (!sv) return [];
    const zc = (sv.wall.z0 + sv.wall.z1) / 2 / S;
    const t = (sv.wall.z1 - sv.wall.z0) / S;
    // Left normal of a → b (+X) is +Z (the passage); −1 swings the leaf into the room.
    return [sv.refuseDoor, sv.electricalDoor].map(([x0, x1]) => ({ a: [x0 / S, zc], b: [x1 / S, zc], kind: "door", swing: -1, hinge: "a", height: 2.05, wallThickness: t, glass: false, leaves: 1 }));
  }, [sv]);
  if (!sv) return null;
  const m = serviceMaterials();
  const im = interiorMaterials();
  const y0 = slab + 0.036; // flush with the plate floor finish
  const { passage: p, refuse: r, electrical: e, wall } = sv;
  const face = wall.z1 + 0.004; // passage face of the door wall
  return (
    <group>
      {/* Floors: stone passage, grey resin rooms */}
      <Box x0={p.x0} x1={p.x1} y0={slab} y1={y0} z0={p.z0} z1={p.z1} material={im.lobby} />
      {sv.walk && <Box x0={sv.walk.x0} x1={sv.walk.x1} y0={slab} y1={y0} z0={sv.walk.z0} z1={sv.walk.z1} material={im.lobby} />}
      <Box x0={r.x0} x1={r.x1} y0={slab} y1={y0} z0={r.z0} z1={r.z1} material={m.resin} />
      <Box x0={e.x0} x1={e.x1} y0={slab} y1={y0} z0={e.z0} z1={e.z1} material={m.resin} />
      {/* Door-wall openings get the stone too, so the thresholds read */}
      {[sv.refuseDoor, sv.electricalDoor].map(([a, b], i) => (
        <Box key={i} x0={a} x1={b} y0={slab} y1={y0} z0={wall.z0} z1={wall.z1} material={im.lobby} />
      ))}

      {/* Chutes: stainless enclosures to the ceiling, hopper door at waist height, sign above */}
      {sv.chutes.map((c) => {
        const front = c.z + c.hd;
        const hop = 0.5 * S;
        return (
          <group key={c.kind}>
            <Box x0={c.x - c.hw} x1={c.x + c.hw} y0={slab} y1={floorHeight} z0={c.z - c.hd} z1={front} material={m.steel} />
            <Box x0={c.x - hop / 2} x1={c.x + hop / 2} y0={slab + 0.82 * S} y1={slab + 1.26 * S} z0={front} z1={front + 0.03 * S} material={m.hopper} />
            <Box x0={c.x - hop * 0.35} x1={c.x + hop * 0.35} y0={slab + 1.18 * S} y1={slab + 1.21 * S} z0={front + 0.03 * S} z1={front + 0.07 * S} material={m.pipe} />
            <Sign text={c.kind === "refuse" ? "REFUSE" : "RECYCLING"} bg={c.kind === "refuse" ? "#3a3f45" : "#2f6b45"} x={c.x} y={slab + 1.52 * S} z={front + 0.004} facing={1} w={0.5 * S} />
          </group>
        );
      })}
      {/* Wheelie bins for the overflow */}
      <Box x0={r.x0 + 0.15 * S} x1={r.x0 + 0.75 * S} y0={slab} y1={slab + 1.0 * S} z0={r.z0 + 0.15 * S} z1={r.z0 + 0.85 * S} material={m.bin} />
      <Box x0={r.x0 + 0.15 * S} x1={r.x0 + 0.75 * S} y0={slab} y1={slab + 1.0 * S} z0={r.z0 + 0.95 * S} z1={r.z0 + 1.65 * S} material={m.binGreen} />

      {/* Electrical / riser closet: risers to the ceiling, distribution board */}
      {sv.risers.map((q, i) => (
        <mesh key={i} geometry={CYL} material={m.pipe} position={[q.x, (slab + floorHeight) / 2, q.z]} scale={[sv.riserR, floorHeight - slab, sv.riserR]} raycast={noRaycast} />
      ))}
      <Box x0={e.x1 - 0.06 * S} x1={e.x1} y0={slab + 0.9 * S} y1={slab + 1.9 * S} z0={e.z0 + 0.9 * S} z1={Math.min(e.z1 - 0.1 * S, e.z0 + 1.7 * S)} material={m.board} />

      {/* Plaques beside the doors (passage side) */}
      <Sign text="REFUSE ROOM" bg="#3a3f45" x={sv.refuseDoor[1] + 0.32 * S} y={slab + 1.5 * S} z={face} facing={1} />
      <Sign text="ELECTRICAL" bg="#a8442f" x={sv.electricalDoor[0] - 0.32 * S} y={slab + 1.5 * S} z={face} facing={1} w={0.38 * S} />

      {/* Walnut doors, in metres like the apartment doors */}
      <group position={[0, y0, 0]} scale={S}>
        <Doors doors={doors} />
      </group>
    </group>
  );
}
