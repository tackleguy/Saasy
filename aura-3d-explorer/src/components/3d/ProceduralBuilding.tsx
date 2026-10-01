"use client";
/**
 * ProceduralBuilding — stacks one building's floor plates on the site.
 * -----------------------------------------------------------------------------
 * Floor data comes from `lib/tower.ts` (pure data). This component positions
 * the tower, wires selection / hover / explosion state into each <FloorPlate>,
 * and adds the non-interactive extras: rooftop spire + plant screen, the oak
 * ground ring marking the active building, and the hover label.
 */
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Building, FloorData } from "@/types";
import { crownFloorCount, explodedY, ZONES } from "@/lib/tower";
import FloorPlate from "./FloorPlate";
import CoreShaft from "./CoreShaft";
import SectionCut from "./SectionCut";
import FloorAnnotations from "./FloorAnnotations";
import { useMergedStatics } from "./mergedStatics";
import { brushedMetalTexture, concreteBump, concreteTexture } from "./textures";

interface Props {
  building: Building;
  /** Explosion factor for this building (non-active buildings get 0). */
  explosion: number;
  active: boolean;
  /** Selected floor index, if the selection is in this building. */
  selectedIndex: number | null;
  hovered: FloorData | null;
  xray: boolean;
  /** Walk-through active on this building's selected floor. */
  walking: boolean;
  onSelect: (floor: FloorData) => void;
  onHover: (floor: FloorData | null) => void;
  /** Section cutaway through this (active) building. */
  section?: boolean;
}

/** Gold spire + rooftop plant screen that ride on top of the last floor. */
function RoofCrown({ top, explosion, dimmed, tall }: { top: FloorData; explosion: number; dimmed: boolean; tall: boolean }) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.0008, dt);
    if (group.current) {
      const y = explodedY(top, explosion) + top.height + explosion * 1.2;
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, y, k);
    }
    if (mat.current) mat.current.opacity = THREE.MathUtils.lerp(mat.current.opacity, dimmed ? 0.15 : 1, k);
  });

  const spireH = tall ? 4.2 : 1.6;
  return (
    <group ref={group} position={[0, top.baseY + top.height, 0]}>
      <mesh position={[0, spireH / 2, 0]} castShadow raycast={() => null}>
        <cylinderGeometry args={[0.02, 0.14, spireH, 8]} />
        <meshStandardMaterial ref={mat} map={brushedMetalTexture("#8B6B44")} metalness={0.72} roughness={0.3} envMapIntensity={0.9} transparent />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[0, top.rotationY, 0]} raycast={() => null}>
        <boxGeometry args={[Math.min(top.width, top.depth) * 0.5, 0.24, Math.min(top.width, top.depth) * 0.5]} />
        <meshStandardMaterial map={concreteTexture()} bumpMap={concreteBump()} bumpScale={0.03} color="#e8e2d6" roughness={0.82} />
      </mesh>
    </group>
  );
}

/** Soft oak ring on the ground marking the active building. */
function ActiveRing({ radius, active }: { radius: number; active: boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, dt) => {
    if (mat.current) mat.current.opacity = THREE.MathUtils.lerp(mat.current.opacity, active ? 0.45 : 0.08, 1 - Math.pow(0.002, dt));
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.012} raycast={() => null}>
      <ringGeometry args={[radius, radius + 0.1, 96]} />
      <meshBasicMaterial ref={mat} color="#9C7A52" transparent opacity={0.08} />
    </mesh>
  );
}

export default function ProceduralBuilding({ building, explosion, active, selectedIndex, hovered, xray, walking, onSelect, onHover, section = false }: Props) {
  const floors = building.floors;
  const top = floors[floors.length - 1];
  const podium = floors[0];
  const hoveredHere = hovered && hovered.buildingId === building.id && hovered.index !== selectedIndex ? hovered : null;

  // Idle (nothing moves or fades): batch the per-floor parts into a few meshes.
  const root = useRef<THREE.Group>(null);
  const idle = explosion === 0 && selectedIndex === null && !xray && !section && !walking;
  useMergedStatics(root, building.id, floors, idle, hovered?.buildingId === building.id);

  return (
    <group ref={root} position={[building.position[0], 0, building.position[1]]}>
      {floors.map((floor) => (
        <FloorPlate
          key={floor.index}
          floor={floor}
          explosion={explosion}
          coreSize={building.coreSize}
          facade={building.facade}
          selected={selectedIndex === floor.index}
          dimmed={selectedIndex !== null && selectedIndex !== floor.index}
          hovered={hovered?.buildingId === building.id && hovered.index === floor.index}
          xray={xray}
          walking={walking && selectedIndex === floor.index}
          onSelect={onSelect}
          onHover={onHover}
          coreGhost={active && (xray || section || explosion > 0.05)}
          crownFloors={crownFloorCount(building)}
        />
      ))}

      <RoofCrown top={top} explosion={explosion} dimmed={selectedIndex !== null && selectedIndex !== top.index} tall={floors.length >= 20} />
      <ActiveRing radius={Math.hypot(podium.width, podium.depth) / 2 + 1.5} active={active} />

      {/* Core as one continuous shaft, section cutaway, level labels + isolated-floor outline */}
      <CoreShaft building={building} explosion={explosion} active={active && !walking} xray={xray} section={section && active} focused={selectedIndex !== null} />
      {section && active && !walking && <SectionCut building={building} explosion={explosion} />}
      {active && (
        <FloorAnnotations
          building={building}
          explosion={explosion}
          selectedIndex={selectedIndex}
          labels={explosion > 0.25 && !walking}
          outline={!walking}
          onSelect={onSelect}
        />
      )}

      {/* Hover label pinned beside the hovered floor */}
      {hoveredHere && !walking && (
        <Html
          position={[hoveredHere.width / 2 + 0.8, explodedY(hoveredHere, explosion) + hoveredHere.height / 2, 0]}
          style={{ pointerEvents: "none" }}
          zIndexRange={[20, 0]}
        >
          <div className="overlay whitespace-nowrap rounded-[3px] px-2.5 py-1.5 text-[11px] text-ink">
            <span className="text-ash">{building.short} · </span>
            <span className="font-serif text-sm">Floor {hoveredHere.number}</span>
            <span className="ml-2 text-ash">{ZONES[hoveredHere.zone].short}</span>
          </div>
        </Html>
      )}
    </group>
  );
}
