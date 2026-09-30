"use client";
/**
 * One interactive floor plate: structural slab + glass curtain wall + edge lines
 * + optional procedural furniture. Position, opacity and glow are eased every
 * frame so explode / select / dim transitions feel smooth.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { FloorPlate as Plate, ZONES } from "@/lib/building";
import { buildFurnitureGeometry, buildPlateGeometries } from "./geometry";

const GOLD = new THREE.Color("#d4af37");
const EDGE_IDLE = new THREE.Color("#5b6475");
const GOLD_DIM = new THREE.Color("#8f7626");
const SLAB_COLOR = new THREE.Color("#2a2f3a");
const GLASS_COLOR = new THREE.Color("#8fa3bf");

interface Props {
  plate: Plate;
  targetY: number;
  selected: boolean;
  dimmed: boolean;
  hovered: boolean;
  furnish: boolean;
  onSelect: (i: number) => void;
  onHover: (i: number | null) => void;
}

export default function FloorPlate({ plate, targetY, selected, dimmed, hovered, furnish, onSelect, onHover }: Props) {
  const group = useRef<THREE.Group>(null);
  const slabMat = useRef<THREE.MeshStandardMaterial>(null);
  const glassMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const edgeMat = useRef<THREE.LineBasicMaterial>(null);
  const furnMat = useRef<THREE.LineBasicMaterial>(null);

  const zoneColor = useMemo(() => new THREE.Color(ZONES[plate.zone].color), [plate.zone]);

  // Geometry is built once per plate and disposed on unmount.
  const geo = useMemo(() => buildPlateGeometries(plate), [plate]);
  const furniture = useMemo(() => buildFurnitureGeometry(plate), [plate]);
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      furniture?.dispose();
    },
    [geo, furniture]
  );

  // Per-frame easing of position & material state
  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.001, dt); // frame-rate independent damping
    const g = group.current;
    if (g) g.position.y = THREE.MathUtils.lerp(g.position.y, targetY, k * 0.9);

    const lit = selected || hovered;
    const glassOpacity = dimmed ? 0.05 : selected ? 0.35 : 0.5;
    const slabOpacity = dimmed ? 0.12 : 1;

    if (slabMat.current) {
      slabMat.current.opacity = THREE.MathUtils.lerp(slabMat.current.opacity, slabOpacity, k);
      slabMat.current.emissiveIntensity = THREE.MathUtils.lerp(slabMat.current.emissiveIntensity, lit ? 0.55 : 0, k);
    }
    if (glassMat.current) {
      glassMat.current.opacity = THREE.MathUtils.lerp(glassMat.current.opacity, glassOpacity, k);
      glassMat.current.emissiveIntensity = THREE.MathUtils.lerp(glassMat.current.emissiveIntensity, selected ? 0.25 : hovered ? 0.12 : 0, k);
    }
    if (edgeMat.current) {
      edgeMat.current.color.lerp(lit ? GOLD : dimmed ? SLAB_COLOR : plate.zone === "crown" ? GOLD_DIM : EDGE_IDLE, k);
      edgeMat.current.opacity = THREE.MathUtils.lerp(edgeMat.current.opacity, dimmed ? 0.18 : 1, k);
    }
    if (furnMat.current) {
      const target = furnish ? (dimmed ? 0.12 : 0.95) : 0;
      furnMat.current.opacity = THREE.MathUtils.lerp(furnMat.current.opacity, target, k);
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(plate.index);
  };
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(plate.index);
    document.body.style.cursor = "pointer";
  };
  const handleOut = () => {
    onHover(null);
    document.body.style.cursor = "";
  };

  return (
    <group ref={group} position={[0, plate.baseY, 0]} rotation={[0, plate.rotationY, 0]}>
      {/* Structural slab */}
      <mesh geometry={geo.slab} castShadow receiveShadow onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
        <meshStandardMaterial
          ref={slabMat}
          color={SLAB_COLOR}
          emissive={GOLD}
          emissiveIntensity={0}
          roughness={0.6}
          metalness={0.35}
          transparent
          opacity={1}
        />
      </mesh>
      <lineSegments geometry={geo.slabEdges}>
        <lineBasicMaterial color="#3a4150" transparent opacity={0.8} />
      </lineSegments>

      {/* Glass curtain wall volume */}
      <mesh geometry={geo.glass} castShadow onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
        <meshPhysicalMaterial
          ref={glassMat}
          color={GLASS_COLOR}
          emissive={zoneColor}
          emissiveIntensity={0}
          metalness={0.2}
          roughness={0.08}
          clearcoat={1}
          transparent
          opacity={0.5}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Mullion / edge lines */}
      <lineSegments geometry={geo.edges}>
        <lineBasicMaterial ref={edgeMat} color={EDGE_IDLE} transparent opacity={1} />
      </lineSegments>

      {/* Procedural low-poly furniture wireframe */}
      {furniture && (
        <lineSegments geometry={furniture} renderOrder={2}>
          <lineBasicMaterial ref={furnMat} color={zoneColor} transparent opacity={0} depthWrite={false} />
        </lineSegments>
      )}

      {/* Rooftop fin on the very top crown floor */}
      {plate.zone === "crown" && plate.zoneIndex === 1 && (
        <mesh position={[2, plate.height + 6, 0]} castShadow>
          <boxGeometry args={[0.6, 12, 7]} />
          <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.25} emissive="#5a4510" emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  );
}
