"use client";
/**
 * Traffic — cars, taxis and buses on the main road: two lanes of moving
 * traffic (one each way) plus parked cars along both kerbs. The city preset
 * sets the paint palette, taxi colour and share (NYC yellow cabs, London
 * black cabs), bus colour (London red double-deckers), density and which
 * side of the road people drive on.
 *
 * Vehicles come from `vehicles.ts` (sedan / SUV / compact / taxi / bus /
 * double-decker). Each type draws as three instanced meshes (paint, glass,
 * tyres + lights), all sharing the same per-car matrix. Moving vehicles are
 * re-positioned every frame and wrap at the ends of the street.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { LAYOUT } from "@/lib/siteLayout";
import type { CityPreset } from "@/lib/cityPresets";
import { ALONG_MINUS_U, ALONG_U, noRaycast, placeUW, rng } from "./shared";
import { vehicleGeometry, type VehicleType } from "./vehicles";

interface Car {
  type: VehicleType;
  u: number;
  w: number;
  /** +1 drives towards +u, −1 towards −u, 0 parked. */
  dir: -1 | 0 | 1;
  /** Parked cars face either way along the kerb. */
  facing: -1 | 1;
  speed: number;
  color: THREE.Color;
  scale: number;
}

const TYPES: VehicleType[] = ["sedan", "suv", "compact", "taxi", "bus", "decker"];
const HALF = LAYOUT.streetHalfLength;

function layout(preset: CityPreset): Car[] {
  const r = rng(71);
  const t = preset.traffic;
  const out: Car[] = [];
  const paint = () => new THREE.Color(t.palette[Math.floor(r() * t.palette.length)]);
  const privateType = (): VehicleType => {
    const x = r();
    return x < 0.45 ? "sedan" : x < 0.8 ? "suv" : "compact";
  };
  const make = (u: number, w: number, dir: -1 | 0 | 1): Car => {
    let type = privateType();
    let color = paint();
    if (dir !== 0 && r() < t.bus.share) {
      type = t.bus.decker ? "decker" : "bus";
      color = new THREE.Color(t.bus.color);
    } else if (t.taxi && r() < t.taxi.share) {
      type = "taxi";
      color = new THREE.Color(t.taxi.color);
    }
    return { type, u, w, dir, facing: dir === 0 ? (r() < 0.8 ? 1 : -1) : dir, speed: 3.2 + r() * 1.6, color, scale: 0.94 + r() * 0.1 };
  };

  // Moving traffic: one lane each way. Right-hand traffic keeps +u on the
  // near-site lane; left-hand (London) swaps the lanes.
  const nearLane = LAYOUT.road[0] + 2.2;
  const farLane = LAYOUT.road[1] - 2.2;
  const perLane = Math.round(14 * t.density);
  const lanes: [number, 1 | -1][] = t.driveLeft ? [[farLane, 1], [nearLane, -1]] : [[nearLane, 1], [farLane, -1]];
  for (const [w, dir] of lanes) {
    for (let i = 0; i < perLane; i++) out.push(make(-HALF + i * ((HALF * 2) / perLane) + r() * 6, w, dir));
  }
  // Parked along both kerbs, with gaps
  const parkChance = Math.min(0.75, 0.42 * t.density);
  for (let u = -160; u <= 160; u += 1.55) {
    if (r() < parkChance) out.push(make(u, LAYOUT.road[0] + 0.62, 0));
    if (r() < parkChance * 0.9) out.push(make(u + 0.6, LAYOUT.road[1] - 0.62, 0));
    u += 1.6 * (0.4 + r() * 0.8);
  }
  return out;
}

function VehicleFleet({ type, cars }: { type: VehicleType; cars: Car[] }) {
  const geo = vehicleGeometry(type);
  const body = useRef<THREE.InstancedMesh>(null);
  const glass = useRef<THREE.InstancedMesh>(null);
  const details = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4() }), []);
  const first = useRef(true);

  useFrame((_, dt) => {
    const { m } = tmp;
    const step = Math.min(dt, 0.05);
    cars.forEach((c, i) => {
      if (c.dir !== 0) {
        c.u += c.dir * c.speed * step;
        if (c.u > HALF + 4) c.u = -HALF - 4;
        if (c.u < -HALF - 4) c.u = HALF + 4;
      } else if (!first.current) return; // parked cars never move after the first upload
      placeUW(c.u, c.w, 0, c.facing === -1 ? ALONG_MINUS_U : ALONG_U, c.scale, m);
      body.current?.setMatrixAt(i, m);
      glass.current?.setMatrixAt(i, m);
      details.current?.setMatrixAt(i, m);
    });
    for (const ref of [body, glass, details]) if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (first.current && body.current) {
      cars.forEach((c, i) => body.current!.setColorAt(i, c.color));
      body.current.instanceColor!.needsUpdate = true;
      first.current = false;
    }
  });

  return (
    <group>
      <instancedMesh ref={body} args={[geo.body, undefined, cars.length]} castShadow raycast={noRaycast} frustumCulled={false}>
        <meshPhysicalMaterial vertexColors roughness={0.32} metalness={0.35} clearcoat={0.8} clearcoatRoughness={0.12} envMapIntensity={1.1} />
      </instancedMesh>
      <instancedMesh ref={glass} args={[geo.glass, undefined, cars.length]} raycast={noRaycast} frustumCulled={false}>
        <meshStandardMaterial color="#1d252c" roughness={0.06} metalness={0.6} envMapIntensity={1.6} />
      </instancedMesh>
      <instancedMesh ref={details} args={[geo.details, undefined, cars.length]} raycast={noRaycast} frustumCulled={false}>
        <meshStandardMaterial vertexColors roughness={0.45} metalness={0.4} />
      </instancedMesh>
    </group>
  );
}

export default function Traffic({ preset }: { preset: CityPreset }) {
  const byType = useMemo(() => {
    const cars = layout(preset);
    return TYPES.map((type) => ({ type, cars: cars.filter((c) => c.type === type) })).filter((g) => g.cars.length);
  }, [preset]);
  return (
    <group>
      {byType.map((g) => (
        <VehicleFleet key={`${preset.id}:${g.type}`} type={g.type} cars={g.cars} />
      ))}
    </group>
  );
}
