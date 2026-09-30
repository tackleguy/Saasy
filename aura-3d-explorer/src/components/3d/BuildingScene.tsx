"use client";
/**
 * BuildingScene — the WebGL viewport.
 * -----------------------------------------------------------------------------
 * Owns the R3F <Canvas>, OrbitControls and the camera rig. All app state
 * (explosion, selection) comes in as props from `page.tsx`, so the scene is a
 * pure view of that state. Hover is kept local — nothing outside the canvas
 * needs it — which avoids re-rendering the sidebar on every mouse move.
 *
 * Loaded with `next/dynamic({ ssr: false })` because Three.js needs `window`.
 */
import { useCallback, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { floorCentre, TOWER, towerHeight } from "@/lib/tower";
import { useCameraTween, type CameraGoal, type Vec3 } from "@/hooks/useCameraTween";
import ProceduralBuilding from "./ProceduralBuilding";
import LightingEnvironment from "./LightingEnvironment";

/** Camera offset from a focused floor:  P_camera = P_floor + [8, 4, 8]. */
export const FOCUS_OFFSET: Vec3 = [8, 4, 8];

/** Default overview direction (front-right, slightly above). */
const OVERVIEW_DIRECTION: Vec3 = [1, 0.55, 1];

interface Props {
  explosion: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  /** Increment to snap back to the default overview angle. */
  resetNonce: number;
}

/** Translates app state into a camera goal and hands it to the GSAP tween hook. */
function CameraRig({ explosion, selectedIndex, resetNonce }: Omit<Props, "onSelect">) {
  let goal: CameraGoal;
  if (selectedIndex !== null) {
    goal = { kind: "focus", target: floorCentre(TOWER[selectedIndex], explosion), offset: FOCUS_OFFSET };
  } else {
    const h = towerHeight(TOWER, explosion);
    goal = {
      kind: "overview",
      target: [0, h * 0.45, 0],
      distance: h * 1.6 + 26,
      resetDirection: OVERVIEW_DIRECTION,
    };
  }
  useCameraTween(goal, { nonce: resetNonce });
  return null;
}

export default function BuildingScene({ explosion, selectedIndex, onSelect, resetNonce }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [dpr, setDpr] = useState(1.5);

  // Clicking the selected floor again releases it.
  const handleSelect = useCallback((i: number) => onSelect(selectedIndex === i ? null : i), [onSelect, selectedIndex]);

  return (
    <Canvas
      shadows="percentage"
      dpr={dpr}
      camera={{ position: [34, 22, 34], fov: 40, near: 0.1, far: 1200 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, powerPreference: "high-performance" }}
      onPointerMissed={() => onSelect(null)}
      className="!absolute inset-0"
    >
      {/* Drop resolution on slow GPUs to hold 60 FPS, raise it on fast ones */}
      <PerformanceMonitor onIncline={() => setDpr(2)} onDecline={() => setDpr(1)} />
      <AdaptiveDpr pixelated={false} />

      <LightingEnvironment />
      <ProceduralBuilding
        explosion={explosion}
        selectedIndex={selectedIndex}
        hoveredIndex={hovered}
        onSelect={handleSelect}
        onHover={setHovered}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={220}
        maxPolarAngle={Math.PI / 2.05}
      />
      <CameraRig explosion={explosion} selectedIndex={selectedIndex} resetNonce={resetNonce} />
    </Canvas>
  );
}
