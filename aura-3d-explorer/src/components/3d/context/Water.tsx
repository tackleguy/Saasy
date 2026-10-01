"use client";
/**
 * Water — a planar-reflection surface with a scrolling procedural normal map
 * (ripples), plus a few motor boats that bob gently.
 *
 * High quality uses a planar reflection (./WaterReflector: drei's
 * MeshReflectorMaterial shader, re-rendered from a mirrored camera into a
 * blurred target every other frame, without the small per-floor details);
 * Low uses a glossy standard material with the same normal map, which still
 * catches the HDR sky.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { LAYOUT, SITE_ROTATION_Y, uwToXZ } from "@/lib/siteLayout";
import { waterNormalTexture } from "../textures";
import { ALONG_U, noRaycast, placeUW, rng, uploadInstances } from "./shared";
import WaterReflector from "./WaterReflector";

function Surface({ quality, color }: { quality: "high" | "low"; color: string }) {
  const depth = 460;
  const [x, z] = uwToXZ(0, LAYOUT.waterStart + depth / 2);
  const normal = useMemo(() => {
    const t = waterNormalTexture().clone();
    t.repeat.set(210, 110); // ~5 units per ripple tile across the 1100 × 460 plane
    t.needsUpdate = true;
    return t;
  }, []);
  const mesh = useRef<THREE.Mesh>(null);
  const reflectorNormalScale = useMemo(() => new THREE.Vector2(0.22, 0.22), []);
  // Scroll the ripples slowly; two speeds would need two maps, one is enough at this scale.
  useFrame((_, dt) => {
    normal.offset.x += dt * 0.012;
    normal.offset.y += dt * 0.007;
  });

  return (
    <mesh ref={mesh} position={[x, 0.008, z]} rotation={[-Math.PI / 2, 0, SITE_ROTATION_Y]} raycast={noRaycast}>
      {/* Wide enough (u ±550) that bridges at the ends of the street stand on water. */}
      <planeGeometry args={[1100, depth]} />
      {quality === "high" ? (
        <WaterReflector
          mesh={mesh}
          resolution={768}
          blur={[300, 80]}
          mixBlur={0.8}
          mixStrength={1.1}
          mirror={0.6}
          roughness={0.3}
          depthScale={0.5}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color={color}
          metalness={0.2}
          normalMap={normal}
          normalScale={reflectorNormalScale}
          distortion={0.35}
          distortionMap={normal}
        />
      ) : (
        <meshStandardMaterial color={color} roughness={0.12} metalness={0.3} envMapIntensity={1.2} normalMap={normal} normalScale={new THREE.Vector2(0.3, 0.3)} />
      )}
    </mesh>
  );
}

interface Boat {
  u: number;
  w: number;
  len: number;
  heading: number;
  phase: number;
}

function Boats() {
  const boats = useMemo<Boat[]>(() => {
    const r = rng(53);
    return Array.from({ length: 7 }, () => ({ u: -150 + r() * 300, w: LAYOUT.waterStart + 14 + r() * 90, len: 2.2 + r() * 2.4, heading: (r() - 0.5) * 1.2, phase: r() * 6.28 }));
  }, []);
  const hull = useRef<THREE.InstancedMesh>(null);
  const cabin = useRef<THREE.InstancedMesh>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    boats.forEach((b, i) => {
      const bob = Math.sin(t * 0.9 + b.phase) * 0.03;
      const roll = Math.sin(t * 0.7 + b.phase) * 0.03;
      q.setFromEuler(new THREE.Euler(roll, SITE_ROTATION_Y + b.heading, 0));
      hull.current?.setMatrixAt(i, placeUW(b.u + Math.sin(t * 0.05 + b.phase) * 2, b.w, 0.12 + bob, q, new THREE.Vector3(b.len, 0.32, b.len * 0.36), m));
      cabin.current?.setMatrixAt(i, placeUW(b.u + Math.sin(t * 0.05 + b.phase) * 2, b.w, 0.36 + bob, q, new THREE.Vector3(b.len * 0.42, 0.26, b.len * 0.3), m));
    });
    for (const ref of [hull, cabin]) if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={hull} args={[undefined, undefined, boats.length]} raycast={noRaycast} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.35} />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[undefined, undefined, boats.length]} raycast={noRaycast} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4c5a63" roughness={0.2} metalness={0.3} />
      </instancedMesh>
    </group>
  );
}

export default function Water({ quality, color }: { quality: "high" | "low"; color: string }) {
  return (
    <group>
      <Surface quality={quality} color={color} />
      <Boats />
    </group>
  );
}
