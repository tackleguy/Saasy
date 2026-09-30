"use client";
/**
 * Traffic — low-poly cars on the main road: two lanes of moving traffic
 * (one each way) plus parked cars along both kerbs.
 *
 * A car is three instanced meshes — body (per-car colour), cabin glass and
 * wheels (four per car) — so 60 cars cost three draw calls. Moving cars are
 * re-positioned every frame and wrap at the ends of the street.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { LAYOUT } from "@/lib/siteLayout";
import { ALONG_MINUS_U, ALONG_U, noRaycast, placeUW, rng } from "./shared";

interface Car {
  u: number;
  w: number;
  /** +1 drives towards +u, −1 towards −u, 0 parked. */
  dir: -1 | 0 | 1;
  speed: number;
  color: THREE.Color;
  len: number;
}

const PALETTE = ["#e9e6df", "#d9d4cb", "#2b2d31", "#6b7078", "#8a8f96", "#b9b3a6", "#3b4a5c", "#9c7a52", "#c9c9c9", "#1f2a33"];
/** Real car ≈ 4.6 m × 1.8 m × 1.45 m → scene units at 1 : 3.57. */
const LEN = 1.29;
const WID = 0.5;
const HALF = LAYOUT.streetHalfLength;

function layout(): Car[] {
  const r = rng(71);
  const out: Car[] = [];
  const color = () => new THREE.Color(PALETTE[Math.floor(r() * PALETTE.length)]);
  // Moving traffic: right-hand lanes, ~14 cars each way
  for (let i = 0; i < 14; i++) out.push({ u: -HALF + i * ((HALF * 2) / 14) + r() * 8, w: LAYOUT.road[0] + 2.2, dir: 1, speed: 3.2 + r() * 1.6, color: color(), len: LEN * (0.9 + r() * 0.25) });
  for (let i = 0; i < 14; i++) out.push({ u: -HALF + i * ((HALF * 2) / 14) + r() * 8, w: LAYOUT.road[1] - 2.2, dir: -1, speed: 3.2 + r() * 1.6, color: color(), len: LEN * (0.9 + r() * 0.25) });
  // Parked along both kerbs, with gaps
  for (let u = -160; u <= 160; u += 3.2) {
    if (r() < 0.45) out.push({ u, w: LAYOUT.road[0] + 0.55, dir: 0, speed: 0, color: color(), len: LEN * (0.9 + r() * 0.25) });
    if (r() < 0.4) out.push({ u: u + 1.2, w: LAYOUT.road[1] - 0.55, dir: 0, speed: 0, color: color(), len: LEN * (0.9 + r() * 0.25) });
  }
  return out;
}

export default function Traffic() {
  const cars = useMemo(layout, []);
  const body = useRef<THREE.InstancedMesh>(null);
  const cabin = useRef<THREE.InstancedMesh>(null);
  const wheels = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), s: new THREE.Vector3() }), []);
  const first = useRef(true);

  useFrame((_, dt) => {
    const { m, s } = tmp;
    cars.forEach((c, i) => {
      if (c.dir !== 0) {
        c.u += c.dir * c.speed * Math.min(dt, 0.05);
        if (c.u > HALF + 4) c.u = -HALF - 4;
        if (c.u < -HALF - 4) c.u = HALF + 4;
      } else if (!first.current) return; // parked cars never move after the first upload
      const q = c.dir === -1 ? ALONG_MINUS_U : ALONG_U;
      body.current?.setMatrixAt(i, placeUW(c.u, c.w, 0.24, q, s.set(c.len, 0.3, WID), m));
      cabin.current?.setMatrixAt(i, placeUW(c.u - c.dir * 0.05, c.w, 0.5, q, s.set(c.len * 0.52, 0.24, WID * 0.92), m));
      // Wheels: 4 per car, cylinders lying along the car's local z
      for (let k = 0; k < 4; k++) {
        const du = (k < 2 ? -0.32 : 0.32) * c.len;
        const dw = k % 2 === 0 ? -WID * 0.42 : WID * 0.42;
        wheels.current?.setMatrixAt(i * 4 + k, placeUW(c.u + du, c.w + dw, 0.11, q, s.set(0.22, 0.08, 0.22), m));
      }
    });
    for (const ref of [body, cabin, wheels]) if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (first.current && body.current) {
      cars.forEach((c, i) => body.current!.setColorAt(i, c.color));
      body.current.instanceColor!.needsUpdate = true;
      first.current = false;
    }
  });

  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, cars.length]} castShadow raycast={noRaycast} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.3} metalness={0.4} envMapIntensity={1.2} />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[undefined, undefined, cars.length]} raycast={noRaycast} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#26313a" roughness={0.1} metalness={0.5} envMapIntensity={1.4} />
      </instancedMesh>
      <instancedMesh ref={wheels} args={[undefined, undefined, cars.length * 4]} raycast={noRaycast} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.5, 1, 10]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
