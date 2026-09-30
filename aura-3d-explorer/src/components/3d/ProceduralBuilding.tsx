"use client";
/**
 * ProceduralBuilding — stacks the 20 floor plates into the AURA tower.
 * -----------------------------------------------------------------------------
 * The floor list comes from `lib/tower.ts` (pure data). This component only
 * wires selection / hover / explosion state into each <FloorPlate>, and adds
 * the non-interactive architectural extras: the rooftop crown spire and the
 * hover label.
 */
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { FloorData } from "@/types";
import { explodedY, TOWER, ZONES } from "@/lib/tower";
import FloorPlate from "./FloorPlate";

interface Props {
  explosion: number;
  selectedIndex: number | null;
  hoveredIndex: number | null;
  onSelect: (index: number) => void;
  onHover: (index: number | null) => void;
  floors?: FloorData[];
}

/** Gold architectural spire that rides on top of the last floor. */
function CrownSpire({ top, explosion, dimmed }: { top: FloorData; explosion: number; dimmed: boolean }) {
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

  return (
    <group ref={group} position={[0, top.baseY + top.height, 0]} rotation={[0, top.rotationY, 0]}>
      <mesh position={[0, 1.6, 0]} castShadow raycast={() => null}>
        <cylinderGeometry args={[0.02, 0.14, 3.2, 8]} />
        <meshStandardMaterial ref={mat} color="#d4af37" metalness={1} roughness={0.25} emissive="#5a4510" emissiveIntensity={0.5} transparent />
      </mesh>
      {/* Rooftop plant screen */}
      <mesh position={[0, 0.12, 0]} raycast={() => null}>
        <boxGeometry args={[3.4, 0.24, 3.4]} />
        <meshStandardMaterial color="#1a1d24" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

export default function ProceduralBuilding({ explosion, selectedIndex, hoveredIndex, onSelect, onHover, floors = TOWER }: Props) {
  const top = floors[floors.length - 1];
  const hovered = hoveredIndex !== null && hoveredIndex !== selectedIndex ? floors[hoveredIndex] : null;

  return (
    <group>
      {floors.map((floor) => (
        <FloorPlate
          key={floor.index}
          floor={floor}
          explosion={explosion}
          selected={selectedIndex === floor.index}
          dimmed={selectedIndex !== null && selectedIndex !== floor.index}
          hovered={hoveredIndex === floor.index}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}

      <CrownSpire top={top} explosion={explosion} dimmed={selectedIndex !== null && selectedIndex !== top.index} />

      {/* Hover label pinned beside the hovered floor */}
      {hovered && (
        <Html
          position={[hovered.width / 2 + 0.8, explodedY(hovered, explosion) + hovered.height / 2, 0]}
          style={{ pointerEvents: "none" }}
          zIndexRange={[20, 0]}
        >
          <div className="glass-card whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] text-white">
            <span className="font-serif text-sm">Floor {hovered.number}</span>
            <span className="ml-2 text-slate-400">{ZONES[hovered.zone].short}</span>
          </div>
        </Html>
      )}
    </group>
  );
}
