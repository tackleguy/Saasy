"use client";
/**
 * LiftBank — the core as a bank of 2–4 lifts plus a stair, on every floor.
 * -----------------------------------------------------------------------------
 * Drawn from `liftBank` (lib/lift): the walk-in main lift in the middle of
 * the core's +Z face with the other cars beside it on the same face, and the
 * stair behind them opening onto the −Z face. Building-local scene units
 * (the core never twists).
 *
 *   • liftBankDoors   — merged door geometry for a core slice: two closed
 *                       leaves + a slim surround per car, and the stair door.
 *                       Drop-in replacement for facadeGeometry's `liftDoors`
 *                       (same signature) in FloorPlate's plain core and in
 *                       LiftCore (with skipMain, which models the main lift).
 *   • LiftBankSignals — call buttons and floor indicators for the other cars
 *                       (LiftCore draws the main lift's own).
 *   • bankCoreLayout  — CoreShaft's plan of the core contents, rebuilt from
 *                       the bank so the X-ray shafts sit behind the real doors.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { liftBank, liftDims } from "@/lib/lift";
import { coreLayout } from "@/lib/coreLayout";

const noRaycast = () => null;
const cache = new Map<string, THREE.BufferGeometry>();

/** Lift-bank doors (+Z face) and the stair door (−Z face) of one core slice, merged. */
export function liftBankDoors(core: number, y0: number, doorH: number, skipMain = false): THREE.BufferGeometry {
  const key = `${core}:${y0}:${doorH}:${skipMain}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const bank = liftBank(core);
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    parts.push(g);
  };
  const face = core / 2;
  const f = Math.max(0.008, core * 0.008); // surround width
  for (const car of bank.cars) {
    if (skipMain && car.main) continue;
    const ow = car.opening;
    for (const s of [-1, 1]) box(ow / 2 - 0.002, doorH, 0.012, car.x + (s * ow) / 4, y0 + doorH / 2, face + 0.006);
    for (const s of [-1, 1]) box(f, doorH + f, 0.02, car.x + s * (ow / 2 + f / 2), y0 + (doorH + f) / 2, face + 0.01);
    box(ow + f * 2, f, 0.02, car.x, y0 + doorH + f / 2, face + 0.01);
  }
  const sh = doorH * 0.95;
  const stair = coreLayout(core).stair;
  box(stair.doorW, sh, 0.012, stair.doorX, y0 + sh / 2, -(face + 0.006));
  const g = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  parts.forEach((p) => p.dispose());
  cache.set(key, g);
  return g;
}

/** Call buttons + floor indicators beside / above the other cars (walked floor). */
export function LiftBankSignals({ coreSize, floorHeight, slab }: { coreSize: number; floorHeight: number; slab: number }) {
  const L = liftDims(coreSize, floorHeight - slab);
  const bank = liftBank(coreSize, floorHeight - slab);
  const top = slab + L.cabH;
  const half = coreSize / 2;
  return (
    <group>
      {bank.cars
        .filter((c) => !c.main)
        .map((c) => (
          <group key={c.x.toFixed(4)}>
            <mesh position={[c.x + c.opening / 2 + Math.min(0.03, (c.cabW - c.opening) / 4), slab + 0.3, half + 0.003]} raycast={noRaycast}>
              <planeGeometry args={[0.03, 0.06]} />
              <meshStandardMaterial color="#1c1b19" emissive="#f5c07a" emissiveIntensity={0.8} />
            </mesh>
            <mesh position={[c.x, top + 0.05, half + 0.003]} raycast={noRaycast}>
              <planeGeometry args={[c.opening * 0.5, 0.035]} />
              <meshStandardMaterial color="#1c1b19" emissive="#f5c07a" emissiveIntensity={0.6} />
            </mesh>
          </group>
        ))}
    </group>
  );
}

/**
 * CoreShaft's core layout (shafts, stair, risers, refuse chutes) from the
 * lift bank and lib/coreLayout, so the X-ray shafts sit behind the real doors
 * and the chutes run up through every floor's refuse room.
 */
export function bankCoreLayout(c: number) {
  const bank = liftBank(c);
  const lay = coreLayout(c);
  const shafts = bank.cars.map((car) => ({ x: car.x, z: (bank.zBack + bank.zFront) / 2, w: car.cabW, d: bank.zFront - bank.zBack }));
  const { x0, x1, z0, z1 } = lay.stair;
  const stair = lay.service ? { x0, x1, z0, z1 } : { x0, x1: x0 + (x1 - x0) * 0.64, z0, z1 };
  const sv = lay.service;
  const riserR = sv ? sv.riserR : c * 0.04;
  const pad = c * 0.07;
  const risers = sv ? sv.risers : [0, 1, 2].map((i) => ({ x: c / 2 - pad - riserR * (1.4 + i * 2.6), z: -c / 2 + pad + riserR * 1.6 }));
  const chutes = sv ? sv.chutes.map((k) => ({ kind: k.kind, x: k.x, z: k.z, r: k.r })) : [];
  return { shafts, stair, risers, riserR, chutes };
}
