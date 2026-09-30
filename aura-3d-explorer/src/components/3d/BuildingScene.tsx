"use client";
/**
 * BuildingScene — the WebGL viewport for a project site.
 * -----------------------------------------------------------------------------
 * Owns the R3F <Canvas>, OrbitControls, the camera rig, the daylight context
 * and (in High quality) the post-processing stack. All app state comes in as
 * props, so the scene is a pure view of it. Hover stays local — nothing
 * outside the canvas needs it — so the sidebar never re-renders on mouse move.
 *
 * Only the active building explodes; the others stay stacked as context.
 * Loaded with `next/dynamic({ ssr: false })` because Three.js needs `window`.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import type { Building, BuildingId, FloorData } from "@/types";
import { buildingHeight, floorCentre } from "@/lib/tower";
import type { PhotoAngle, Quality } from "@/lib/explorer";
import { uwToXZ } from "@/lib/siteLayout";
import { useCameraTween, type CameraGoal, type Vec3 } from "@/hooks/useCameraTween";
import ProceduralBuilding from "./ProceduralBuilding";
import LightingEnvironment from "./LightingEnvironment";
import SiteContext from "./SiteContext";
import PostEffects from "./PostEffects";
import WalkControls from "./WalkControls";

/** Camera offset from a focused floor:  P_camera = P_floor + [8, 4, 8]. */
export const FOCUS_OFFSET: Vec3 = [8, 4, 8];

/** Hero overview direction: across the water, from a slightly low angle. */
const OVERVIEW_DIRECTION: Vec3 = [1, 0.22, 1];


/** Screen-frame (u, w) of a building from its world position. */
function buildingUW(b: Building): [number, number] {
  const [x, z] = b.position;
  return [(x - z) * Math.SQRT1_2, (x + z) * Math.SQRT1_2];
}

/** Camera pose for a photo-angle preset, relative to the active building. */
function photoPose(angle: PhotoAngle, b: Building, explosion: number): { position: Vec3; target: Vec3 } {
  const [bu, bw] = buildingUW(b);
  const h = buildingHeight(b, explosion);
  const at = (u: number, w: number, y: number): Vec3 => {
    const [x, z] = uwToXZ(u, w);
    return [x, y, z];
  };
  const target = (y: number): Vec3 => [b.position[0], y, b.position[1]];
  switch (angle) {
    case "street": // pedestrian on the near sidewalk, looking up
      return { position: at(bu - 15, 17.8, 0.5), target: target(h * 0.55) };
    case "waterfront": // from a boat on the water
      return { position: at(bu + 8, 72, 1.1), target: target(h * 0.42) };
    case "aerial":
      return { position: at(bu - 48, bw + 58, 66), target: target(h * 0.22) };
    case "podium": // close to the arcade
      return { position: at(bu + 5, bw + 13.5, 0.55), target: target(1.1) };
  }
}

interface Props {
  buildings: Building[];
  activeBuildingId: BuildingId;
  explosion: number;
  selectedIndex: number | null;
  xray: boolean;
  /** Select a floor (in any building), or clear the selection with null. */
  onSelect: (floor: FloorData | null) => void;
  /** Increment to snap back to the default hero view. */
  resetNonce: number;
  /** First-person walk-through of the selected floor. */
  walking: boolean;
  viewIndex: number;
  viewNonce: number;
  quality: Quality;
  /** Called when the frame rate stays low, so the parent can drop to Low. */
  onPerformanceDecline?: () => void;
  photoAngle: PhotoAngle | null;
  photoNonce: number;
  /** Receives a function that exports the current view as a 2× PNG. */
  captureRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** Play the eye-level dolly-out opening shot. */
  intro?: boolean;
}

/** Translates app state into a camera goal and hands it to the GSAP tween hook. */
function CameraRig({
  building,
  explosion,
  selectedIndex,
  resetNonce,
  walking,
  photoAngle,
  photoNonce,
  intro,
}: {
  building: Building;
  explosion: number;
  selectedIndex: number | null;
  resetNonce: number;
  walking: boolean;
  photoAngle: PhotoAngle | null;
  photoNonce: number;
  intro: boolean;
}) {
  const h = buildingHeight(building, explosion);
  let goal: CameraGoal;
  if (selectedIndex !== null) {
    goal = { kind: "focus", target: floorCentre(building, building.floors[selectedIndex], explosion), offset: FOCUS_OFFSET };
  } else if (photoAngle) {
    goal = { kind: "pose", ...photoPose(photoAngle, building, explosion) };
  } else {
    // Hero view: across the water, far enough back to keep the neighbours in frame.
    goal = {
      kind: "overview",
      target: [building.position[0] * 0.6, h * 0.42, building.position[1] * 0.6],
      distance: Math.max(h * 1.5 + 40, 96),
      resetDirection: OVERVIEW_DIRECTION,
    };
  }
  // Opening shot: eye height (1.6 m) at the water's edge, then dolly out.
  const [ix, iz] = uwToXZ(0, 33.5);
  useCameraTween(goal, {
    nonce: resetNonce + photoNonce * 1000,
    enabled: !walking,
    intro: intro ? { position: [ix, 0.45, iz], target: [building.position[0], h * 0.55, building.position[1]], duration: 3.6 } : undefined,
  });
  return null;
}

/**
 * Registers a capture function: renders at 2× pixel ratio for a few frames,
 * reads the canvas (preserveDrawingBuffer keeps the last frame readable),
 * downloads it as PNG, then restores the resolution.
 */
function CaptureBridge({ captureRef }: { captureRef: MutableRefObject<(() => Promise<void>) | null> }) {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    captureRef.current = async () => {
      const prev = gl.getPixelRatio();
      setDpr(Math.min(prev * 2, 4));
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      for (let i = 0; i < 4; i++) await frame();
      const url = gl.domElement.toDataURL("image/png");
      setDpr(prev);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aura-render-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      a.click();
    };
    return () => {
      captureRef.current = null;
    };
  }, [gl, setDpr, captureRef]);
  return null;
}

export default function BuildingScene({
  buildings,
  activeBuildingId,
  explosion,
  selectedIndex,
  xray,
  onSelect,
  resetNonce,
  walking,
  viewIndex,
  viewNonce,
  quality,
  onPerformanceDecline,
  photoAngle,
  photoNonce,
  captureRef,
  intro = true,
}: Props) {
  const [hovered, setHovered] = useState<FloorData | null>(null);
  // Ignore frame-rate dips during the first seconds (shader compile, HDR decode).
  const mountedAt = useRef(0);
  useEffect(() => void (mountedAt.current = performance.now()), []);
  const handleDecline = useCallback(() => {
    if (performance.now() - mountedAt.current > 5000) onPerformanceDecline?.();
  }, [onPerformanceDecline]);
  const building = buildings.find((b) => b.id === activeBuildingId) ?? buildings[0];
  const high = quality === "high";

  // Clicking the selected floor again releases it.
  const handleSelect = useCallback(
    (floor: FloorData) => {
      if (walking) return; // clicks while walking are look-drags, not selections
      const same = floor.buildingId === activeBuildingId && floor.index === selectedIndex;
      onSelect(same ? null : floor);
    },
    [onSelect, activeBuildingId, selectedIndex, walking]
  );

  // Depth of field focuses on the isolated floor (not while walking inside it).
  const focus = selectedIndex !== null && !walking ? floorCentre(building, building.floors[selectedIndex], explosion) : null;

  return (
    <Canvas
      shadows="percentage"
      dpr={high ? [1, 1.75] : 1}
      camera={{ position: [70, 22, 70], fov: 38, near: 0.1, far: 5000 }}
      gl={{
        antialias: !high, // the composer does its own multisampling
        preserveDrawingBuffer: true, // lets "Capture render" read the last frame
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        powerPreference: "high-performance",
      }}
      onPointerMissed={() => !walking && onSelect(null)}
      className="!absolute inset-0"
    >
      {/* Auto-detect weak devices: sustained low FPS asks the parent to drop to Low */}
      <PerformanceMonitor onDecline={handleDecline} />

      <LightingEnvironment quality={quality} />
      <SiteContext quality={quality} />
      {buildings.map((b) => {
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
            walking={walking && active}
            onSelect={handleSelect}
            onHover={setHovered}
          />
        );
      })}

      {walking && selectedIndex !== null && (
        <WalkControls building={building} floor={building.floors[selectedIndex]} explosion={explosion} viewIndex={viewIndex} viewNonce={viewNonce} />
      )}
      <OrbitControls enabled={!walking} makeDefault enableDamping dampingFactor={0.08} minDistance={2} maxDistance={320} maxPolarAngle={Math.PI / 2.02} />
      <CameraRig
        building={building}
        explosion={explosion}
        selectedIndex={selectedIndex}
        resetNonce={resetNonce}
        walking={walking}
        photoAngle={photoAngle}
        photoNonce={photoNonce}
        intro={intro}
      />
      {captureRef && <CaptureBridge captureRef={captureRef} />}
      {high && <PostEffects focus={focus} />}
    </Canvas>
  );
}
