"use client";
/**
 * ImportedFloorDesign — the project's floor plan, built on the plate.
 * -----------------------------------------------------------------------------
 * Replaces the procedural apartment recipe on residential and penthouse
 * floors once a plan has been imported. Geometry is in plate-local metres
 * (the same frame as the walk-through), scaled into the scene by MODEL_SCALE,
 * and it grows up from the slab the way the procedural furniture does.
 */
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MODEL_SCALE } from "@/lib/tower";
import type { FittedPlan } from "@/lib/projectFloorPlan";
import { AuraSceneContents } from "@/components/engine/EngineViewer";
import { SLAB_THICKNESS } from "./FurnitureOverlay";

export default function ImportedFloorDesign({ fitted }: { fitted: FittedPlan }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || g.scale.y >= MODEL_SCALE - 1e-4) return;
    const k = 1 - Math.pow(0.002, dt);
    g.scale.y = Math.min(MODEL_SCALE, THREE.MathUtils.lerp(g.scale.y, MODEL_SCALE, k) + 1e-4);
  });
  return (
    <group ref={group} position={[0, SLAB_THICKNESS + 0.04, 0]} scale={[MODEL_SCALE, 0.001, MODEL_SCALE]}>
      <AuraSceneContents scene={fitted.scene} openings={fitted.openings} cutaway={false} />
    </group>
  );
}
