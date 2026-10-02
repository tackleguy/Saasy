"use client";
/**
 * Water — dynamic physical wave simulation, planar reflection, and buoyant
 * boat physics. Wave displacement undulating in real-time, matching boat
 * heave, pitch, roll, and harbor drift.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { LAYOUT, SITE_ROTATION_Y, uwToXZ } from "@/lib/siteLayout";
import { waterNormalTexture } from "../textures";
import { noRaycast, placeUW, rng } from "./shared";
import WaterReflector from "./WaterReflector";

const WATER_WIDTH = 1200;
const WATER_DEPTH = 480;
const WATER_SEG_X = 96;
const WATER_SEG_Y = 48;

/**
 * Computes physical wave elevation and surface normal slopes at screen-frame (u, w).
 * Directly drives both water 3D vertex displacement and boat buoyancy physics.
 */
export function sampleWaterWave(u: number, w: number, t: number): { y: number; du: number; dw: number } {
  // Wave 1: Primary deep-water ocean swell moving towards the waterfront (+w towards -w)
  const k1 = 0.042;
  const w1 = 1.25;
  const phase1 = w * k1 - t * w1 + u * 0.015;
  const amp1 = 0.075;
  const y1 = Math.sin(phase1) * amp1;
  const dw1 = Math.cos(phase1) * amp1 * k1;
  const du1 = Math.cos(phase1) * amp1 * 0.015;

  // Wave 2: Crossing harbor swell
  const k2 = 0.078;
  const w2 = 1.7;
  const phase2 = u * k2 * 0.85 + w * k2 * 0.55 - t * w2;
  const amp2 = 0.042;
  const y2 = Math.sin(phase2) * amp2;
  const du2 = Math.cos(phase2) * amp2 * k2 * 0.85;
  const dw2 = Math.cos(phase2) * amp2 * k2 * 0.55;

  // Wave 3: Wind-driven surface chop
  const k3 = 0.17;
  const w3 = 2.6;
  const phase3 = (w + u * 0.4) * k3 - t * w3;
  const amp3 = 0.018;
  const y3 = Math.sin(phase3) * amp3;
  const dw3 = Math.cos(phase3) * amp3 * k3;
  const du3 = Math.cos(phase3) * amp3 * k3 * 0.4;

  // Gentle dampening as waves reach the seawall (LAYOUT.waterStart = 32)
  const distFromShore = Math.max(0, w - 32);
  const shoreDamp = Math.min(1.0, 0.4 + distFromShore * 0.03);

  const y = (y1 + y2 + y3) * shoreDamp;
  const du = (du1 + du2 + du3) * shoreDamp;
  const dw = (dw1 + dw2 + dw3) * shoreDamp;

  return { y, du, dw };
}

function PhysicalWaterSurface({ quality, color }: { quality: "high" | "low"; color: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const normal = useMemo(() => {
    const t = waterNormalTexture().clone();
    t.repeat.set(220, 110);
    t.needsUpdate = true;
    return t;
  }, []);
  useEffect(() => () => normal.dispose(), [normal]);

  const reflectorNormalScale = useMemo(() => new THREE.Vector2(0.24, 0.24), []);

  // Subdivided plane: local X is across (width 1200), local Y is along (-depth -240..240)
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(WATER_WIDTH, WATER_DEPTH, WATER_SEG_X, WATER_SEG_Y);
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const [centerX, centerZ] = uwToXZ(0, LAYOUT.waterStart + WATER_DEPTH / 2);

  // Animate physical 3D wave displacement across vertices in real time
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    normal.offset.x += dt * 0.012;
    normal.offset.y += dt * 0.007;

    const posAttr = geometry.attributes.position;
    const count = posAttr.count;
    const centerW = LAYOUT.waterStart + WATER_DEPTH / 2;

    for (let i = 0; i < count; i++) {
      const lx = posAttr.getX(i);
      const ly = posAttr.getY(i);
      // In local coordinates: lx = u, ly = -(w - centerW) => w = centerW - ly
      const u = lx;
      const w = centerW - ly;
      const wave = sampleWaterWave(u, w, t);
      // Local +Z points along world +Y when rotated [-Math.PI/2, 0, SITE_ROTATION_Y]
      posAttr.setZ(i, wave.y);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      position={[centerX, 0.012, centerZ]}
      rotation={[-Math.PI / 2, 0, SITE_ROTATION_Y]}
      raycast={noRaycast}
    >
      {quality === "high" ? (
        <WaterReflector
          mesh={mesh}
          resolution={768}
          blur={[300, 80]}
          mixBlur={0.8}
          mixStrength={1.2}
          mirror={0.65}
          roughness={0.25}
          depthScale={0.5}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color={color}
          metalness={0.25}
          normalMap={normal}
          normalScale={reflectorNormalScale}
          distortion={0.35}
          distortionMap={normal}
        />
      ) : (
        <meshStandardMaterial
          color={color}
          roughness={0.16}
          metalness={0.45}
          envMapIntensity={1.3}
          normalMap={normal}
          normalScale={new THREE.Vector2(0.28, 0.28)}
        />
      )}
    </mesh>
  );
}

interface BoatState {
  u: number;
  w: number;
  baseHeading: number;
  len: number;
  beam: number;
  kind: "yacht" | "sailboat" | "taxi" | "speed";
  hullColor: string;
  cabinColor: string;
  driftSpeed: number;
  phase: number;
}

function BuoyantBoats() {
  const boats = useMemo<BoatState[]>(() => {
    const r = rng(108);
    const kinds: ("yacht" | "sailboat" | "taxi" | "speed")[] = ["yacht", "sailboat", "yacht", "taxi", "sailboat", "speed", "yacht", "speed"];
    const hullColors = ["#f8f9fa", "#f2eee5", "#ffffff", "#ffd13b", "#e9edf0", "#dbe3e8", "#f4f3ef", "#2a3642"];
    const cabinColors = ["#334150", "#45382e", "#25313d", "#1e242c", "#3c4854", "#2c3b48", "#384752", "#f4f1ea"];

    return kinds.map((kind, i) => {
      const u = -160 + (i / (kinds.length - 1)) * 320 + (r() - 0.5) * 25;
      const w = LAYOUT.waterStart + 16 + (i % 3) * 32 + r() * 15;
      const len = kind === "yacht" ? 3.8 + r() * 1.6 : kind === "sailboat" ? 3.2 + r() * 1.2 : kind === "taxi" ? 3.0 : 2.4 + r() * 0.8;
      const beam = len * 0.34;
      const baseHeading = (r() - 0.5) * 0.9;
      return {
        u,
        w,
        baseHeading,
        len,
        beam,
        kind,
        hullColor: hullColors[i],
        cabinColor: cabinColors[i],
        driftSpeed: 0.04 + r() * 0.03,
        phase: r() * Math.PI * 2,
      };
    });
  }, []);

  const hullsRef = useRef<THREE.InstancedMesh>(null);
  const cabinsRef = useRef<THREE.InstancedMesh>(null);
  const mastsRef = useRef<THREE.InstancedMesh>(null);

  const q = useMemo(() => new THREE.Quaternion(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);

  // Smooth buoyant lag memory
  const dynamicState = useMemo(() => {
    return boats.map(() => ({ y: 0.08, pitch: 0, roll: 0, headingOffset: 0 }));
  }, [boats]);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const clampedDt = Math.min(dt, 0.05);

    boats.forEach((b, i) => {
      // Harbor current drift
      const currentU = b.u + Math.sin(t * b.driftSpeed + b.phase) * 3.5;
      const currentW = b.w + Math.cos(t * b.driftSpeed * 0.7 + b.phase) * 1.2;

      // Sample physical water wave at boat center, bow, and stern
      const waveCenter = sampleWaterWave(currentU, currentW, t);

      // Pitch calculation from wave gradient along boat heading
      const forwardDu = Math.sin(SITE_ROTATION_Y + b.baseHeading);
      const forwardDw = Math.cos(SITE_ROTATION_Y + b.baseHeading);
      const rightDu = Math.cos(SITE_ROTATION_Y + b.baseHeading);
      const rightDw = -Math.sin(SITE_ROTATION_Y + b.baseHeading);

      const targetPitch = -(forwardDu * waveCenter.du + forwardDw * waveCenter.dw) * 1.4;
      const targetRoll = (rightDu * waveCenter.du + rightDw * waveCenter.dw) * 1.8;
      const targetY = 0.08 + waveCenter.y;

      // Damped buoyant response (simulates boat displacement inertia and water damping)
      const s = dynamicState[i];
      s.y += (targetY - s.y) * Math.min(1.0, clampedDt * 8);
      s.pitch += (targetPitch - s.pitch) * Math.min(1.0, clampedDt * 6);
      s.roll += (targetRoll - s.roll) * Math.min(1.0, clampedDt * 7);
      s.headingOffset = Math.sin(t * 0.15 + b.phase) * 0.04;

      const heading = SITE_ROTATION_Y + b.baseHeading + s.headingOffset;
      const euler = new THREE.Euler(s.pitch, heading, s.roll, "YXZ");
      q.setFromEuler(euler);

      // Place boat hull
      hullsRef.current?.setMatrixAt(
        i,
        placeUW(currentU, currentW, s.y, q, new THREE.Vector3(b.beam, 0.32, b.len), m)
      );

      // Place cabin / superstructure
      cabinsRef.current?.setMatrixAt(
        i,
        placeUW(currentU, currentW, s.y + 0.24, q, new THREE.Vector3(b.beam * 0.72, 0.28, b.len * 0.48), m)
      );

      // Place mast (for sailboats) or radar arch
      const mastHeight = b.kind === "sailboat" ? 2.8 : 0.6;
      mastsRef.current?.setMatrixAt(
        i,
        placeUW(currentU, currentW, s.y + 0.35 + mastHeight * 0.45, q, new THREE.Vector3(0.06, mastHeight, 0.06), m)
      );
    });

    if (hullsRef.current) hullsRef.current.instanceMatrix.needsUpdate = true;
    if (cabinsRef.current) cabinsRef.current.instanceMatrix.needsUpdate = true;
    if (mastsRef.current) mastsRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* Hulls */}
      <instancedMesh ref={hullsRef} args={[undefined, undefined, boats.length]} raycast={noRaycast} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f6f4ee" roughness={0.32} metalness={0.15} />
      </instancedMesh>
      {/* Cabins / Decks */}
      <instancedMesh ref={cabinsRef} args={[undefined, undefined, boats.length]} raycast={noRaycast} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#303b44" roughness={0.2} metalness={0.4} />
      </instancedMesh>
      {/* Masts / Aerials */}
      <instancedMesh ref={mastsRef} args={[undefined, undefined, boats.length]} raycast={noRaycast} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.5, 1, 6]} />
        <meshStandardMaterial color="#dbe0e5" roughness={0.25} metalness={0.8} />
      </instancedMesh>
    </group>
  );
}

export default function Water({ quality = "high", color = "#476b75" }: { quality?: "high" | "low"; color?: string }) {
  return (
    <group name="harbor-water">
      <PhysicalWaterSurface quality={quality} color={color} />
      <BuoyantBoats />
    </group>
  );
}
