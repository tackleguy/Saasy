"use client";
/**
 * BuildingScene — the WebGL viewport for the whole site.
 * -----------------------------------------------------------------------------
 * Owns the R3F <Canvas>, OrbitControls and the camera rig. All app state
 * (active building, explosion, selection, X-ray) comes in as props from
 * `page.tsx`, so the scene is a pure view of that state. Hover is kept local —
 * nothing outside the canvas needs it — which avoids re-rendering the sidebar
 * on every mouse move.
 *
 * Only the active building explodes; the others stay stacked as context.
 * Loaded with `next/dynamic({ ssr: false })` because Three.js needs `window`.
 */
import { useCallback, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import type { BuildingId, FloorData } from "@/types";
import { buildingHeight, floorCentre, getBuilding, SITE } from "@/lib/tower";
import { useCameraTween, type CameraGoal, type Vec3 } from "@/hooks/useCameraTween";
import ProceduralBuilding from "./ProceduralBuilding";
import LightingEnvironment from "./LightingEnvironment";

/** Camera offset from a focused floor:  P_camera = P_floor + [8, 4, 8]. */
export const FOCUS_OFFSET: Vec3 = [8, 4, 8];

/** Default overview direction (front-right, slightly above). */
const OVERVIEW_DIRECTION: Vec3 = [1, 0.55, 1];

interface Props {
  activeBuildingId: BuildingId;
  explosion: number;
  selectedIndex: number | null;
  xray: boolean;
  /** Select a floor (in any building), or clear the selection with null. */
  onSelect: (floor: FloorData | null) => void;
  /** Increment to snap back to the default overview angle. */
  resetNonce: number;
}

/** Translates app state into a camera goal and hands it to the GSAP tween hook. */
function CameraRig({ activeBuildingId, explosion, selectedIndex, resetNonce }: Pick<Props, "activeBuildingId" | "explosion" | "selectedIndex" | "resetNonce">) {
  const building = getBuilding(activeBuildingId);
  let goal: CameraGoal;
  if (selectedIndex !== null) {
    goal = { kind: "focus", target: floorCentre(building, building.floors[selectedIndex], explosion), offset: FOCUS_OFFSET };
  } else {
    // Frame the active building, far enough back to keep its neighbours in view.
    const h = buildingHeight(building, explosion);
    goal = {
      kind: "overview",
      target: [building.position[0] * 0.6, h * 0.42, building.position[1] * 0.6],
      distance: Math.max(h * 1.5 + 40, 96),
      resetDirection: OVERVIEW_DIRECTION,
    };
  }
  useCameraTween(goal, { nonce: resetNonce });
  return null;
}

export default function BuildingScene({ activeBuildingId, explosion, selectedIndex, xray, onSelect, resetNonce }: Props) {
  const [hovered, setHovered] = useState<FloorData | null>(null);
  const [dpr, setDpr] = useState(1.5);

  // Clicking the selected floor again releases it.
  const handleSelect = useCallback(
    (floor: FloorData) => {
      const same = floor.buildingId === activeBuildingId && floor.index === selectedIndex;
      onSelect(same ? null : floor);
    },
    [onSelect, activeBuildingId, selectedIndex]
  );

  return (
    <Canvas
      shadows="percentage"
      dpr={dpr}
      camera={{ position: [60, 36, 60], fov: 40, near: 0.1, far: 1200 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, powerPreference: "high-performance" }}
      onPointerMissed={() => onSelect(null)}
      className="!absolute inset-0"
    >
      {/* Drop resolution on slow GPUs to hold 60 FPS, raise it on fast ones */}
      <PerformanceMonitor onIncline={() => setDpr(2)} onDecline={() => setDpr(1)} />
      <AdaptiveDpr pixelated={false} />

      <LightingEnvironment />
      {SITE.map((b) => {
        const active = b.id === activeBuildingId;
        return (
          <ProceduralBuilding
            key={b.id}
            building={b}
            active={active}
            explosion={active ? explosion : 0}
            selectedIndex={active ? selectedIndex : null}
            hovered={hovered}
            xray={xray}
            onSelect={handleSelect}
            onHover={setHovered}
          />
        );
      })}

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={6} maxDistance={260} maxPolarAngle={Math.PI / 2.05} />
      <CameraRig activeBuildingId={activeBuildingId} explosion={explosion} selectedIndex={selectedIndex} resetNonce={resetNonce} />
    </Canvas>
  );
}
