"use client";
/**
 * ImportedModel — an imported, normalised CAD / 3D model standing on a site plot.
 * -----------------------------------------------------------------------------
 * `object` comes from lib/importNormalize (Y-up, scene units, centred, base
 * at y = 0, archviz materials). It is placed at the building's ground
 * position [x, z] and rises in over ~1.6 s (scale-Y 0 → 1, ease-out) each
 * time it mounts. BuildingScene renders it in place of the procedural tower.
 */
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

const RISE_S = 1.6;

export default function ImportedModel({ object, position }: { object: THREE.Object3D; position: [x: number, z: number] }) {
  const group = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || t.current >= RISE_S) return;
    t.current = Math.min(RISE_S, t.current + Math.min(dt, 0.05));
    const k = t.current / RISE_S;
    const eased = 1 - Math.pow(1 - k, 3);
    g.scale.set(1, Math.max(eased, 0.001), 1);
  });

  return (
    <group ref={group} position={[position[0], 0, position[1]]} scale={[1, 0.001, 1]}>
      <primitive object={object} />
    </group>
  );
}
