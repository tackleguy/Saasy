"use client";
/**
 * FloorPlate — one individually addressable floor of the tower.
 * -----------------------------------------------------------------------------
 * Anatomy (bottom → top, in the floor's local space):
 *   1. Slab     — thin brushed-aluminium plate that reads as the edge trim.
 *   2. Body     — the floor volume in its zone material (basalt / glass).
 *   3. Edges    — crisp outline of the body for architectural legibility.
 *   4. Mullions — vertical curtain-wall lines on glazed zones.
 *   5. Extras   — warm interior light + glow on crown penthouses.
 *   6. FurnitureOverlay — grows in when the floor is isolated.
 *
 * Every visual state (explode position, hover glow, selection, dimming to 0.15)
 * is eased per-frame with frame-rate-independent damping, so transitions stay
 * smooth at 60 FPS without triggering React re-renders.
 */
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import type { FloorData, ZoneId } from "@/types";
import { explodedY } from "@/lib/tower";
import FurnitureOverlay, { SLAB_THICKNESS } from "./FurnitureOverlay";

/** Opacity of every non-selected floor while one floor is isolated. */
export const DIMMED_OPACITY = 0.15;

const GOLD = new THREE.Color("#d4af37");
const CROWN_LIGHT = "#f59e0b";

/* ------------------------------------------------------------ zone materials */

interface ZoneLook {
  kind: "standard" | "physical";
  color: string;
  metalness: number;
  roughness: number;
  /** Resting opacity of the body (1 = opaque). */
  opacity: number;
  clearcoat?: number;
  edgeColor: string;
  /** Spacing of vertical mullions in metres; 0 = none. */
  mullionSpacing: number;
}

const LOOKS: Record<ZoneId, ZoneLook> = {
  // Dark basalt marble podium
  podium: { kind: "standard", color: "#12151c", metalness: 0.9, roughness: 0.1, opacity: 1, edgeColor: "#6b6250", mullionSpacing: 1.5 },
  // Double-glazed curtain wall
  office: { kind: "physical", color: "#38bdf8", metalness: 0.1, roughness: 0.1, opacity: 0.65, clearcoat: 1, edgeColor: "#7dd3fc", mullionSpacing: 1.25 },
  // Frosted architectural glass (brushed-aluminium trims come from the slab + edges)
  residential: { kind: "physical", color: "#a9b8ca", metalness: 0.15, roughness: 0.5, opacity: 0.5, edgeColor: "#d6dbe2", mullionSpacing: 1.0625 },
  // Ultra-clear penthouse glass
  crown: { kind: "physical", color: "#e0f2fe", metalness: 0.05, roughness: 0.02, opacity: 0.28, clearcoat: 1, edgeColor: "#f3e5ab", mullionSpacing: 0.8125 },
};

/* ----------------------------------------------------------------- geometry */

const mullionCache = new Map<string, THREE.BufferGeometry>();

/** Vertical line segments around the perimeter of a w × d box of height h (base at y0). */
function mullionGeometry(w: number, d: number, y0: number, h: number, spacing: number): THREE.BufferGeometry {
  const key = [w, d, y0, h, spacing].join(":");
  const hit = mullionCache.get(key);
  if (hit) return hit;

  const pts: number[] = [];
  const x = w / 2 + 0.004;
  const z = d / 2 + 0.004;
  const push = (px: number, pz: number) => pts.push(px, y0, pz, px, y0 + h, pz);
  for (let t = -w / 2 + spacing; t < w / 2 - 1e-3; t += spacing) {
    push(t, z);
    push(t, -z);
  }
  for (let t = -d / 2 + spacing; t < d / 2 - 1e-3; t += spacing) {
    push(x, t);
    push(-x, t);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  mullionCache.set(key, geo);
  return geo;
}

/* ---------------------------------------------------------------- component */

interface Props {
  floor: FloorData;
  /** Explosion factor 0 – 2.5. */
  explosion: number;
  selected: boolean;
  /** True when ANOTHER floor is isolated. */
  dimmed: boolean;
  hovered: boolean;
  onSelect: (index: number) => void;
  onHover: (index: number | null) => void;
}

export default function FloorPlate({ floor, explosion, selected, dimmed, hovered, onSelect, onHover }: Props) {
  const look = LOOKS[floor.zone];
  const bodyH = floor.height - SLAB_THICKNESS;

  const group = useRef<THREE.Group>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const slabMat = useRef<THREE.MeshStandardMaterial>(null);
  const edgeMat = useRef<THREE.LineBasicMaterial>(null);
  const mullionMat = useRef<THREE.LineBasicMaterial>(null);
  const glowMat = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);

  const edgeIdle = useMemo(() => new THREE.Color(look.edgeColor), [look.edgeColor]);

  // Body outline — memoised per floor, shared box dims per zone.
  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(floor.width, bodyH, floor.depth);
    box.translate(0, SLAB_THICKNESS + bodyH / 2, 0);
    const e = new THREE.EdgesGeometry(box);
    box.dispose();
    return e;
  }, [floor.width, floor.depth, bodyH]);

  const mullions = useMemo(
    () => (look.mullionSpacing > 0 ? mullionGeometry(floor.width, floor.depth, SLAB_THICKNESS, bodyH, look.mullionSpacing) : null),
    [floor.width, floor.depth, bodyH, look.mullionSpacing]
  );

  /* Per-frame easing of position and material state. */
  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.0008, dt); // frame-rate independent damping factor

    const g = group.current;
    if (g) g.position.y = THREE.MathUtils.lerp(g.position.y, explodedY(floor, explosion), k);

    const fade = dimmed ? DIMMED_OPACITY : 1;

    const body = bodyMat.current;
    if (body) {
      const target = dimmed ? DIMMED_OPACITY * (look.opacity < 1 ? 0.6 : 1) : look.opacity;
      body.opacity = THREE.MathUtils.lerp(body.opacity, target, k);
      // An opaque body should write depth; a faded one must not, or it hides floors behind it.
      body.depthWrite = look.opacity >= 1 && body.opacity > 0.95;
      // Dark opaque basalt shows emissive far more strongly than glass, so scale it down.
      const glow = (selected ? 0.22 : hovered ? 0.14 : 0) * (look.opacity < 1 ? 1 : 0.3);
      body.emissiveIntensity = THREE.MathUtils.lerp(body.emissiveIntensity, glow, k);
    }
    if (slabMat.current) {
      slabMat.current.opacity = THREE.MathUtils.lerp(slabMat.current.opacity, fade, k);
      slabMat.current.depthWrite = slabMat.current.opacity > 0.95;
    }
    if (edgeMat.current) {
      edgeMat.current.color.lerp(selected || hovered ? GOLD : edgeIdle, k);
      edgeMat.current.opacity = THREE.MathUtils.lerp(edgeMat.current.opacity, dimmed ? DIMMED_OPACITY : 0.9, k);
    }
    if (mullionMat.current) {
      mullionMat.current.opacity = THREE.MathUtils.lerp(mullionMat.current.opacity, dimmed ? 0.04 : 0.35, k);
    }
    if (glowMat.current) {
      glowMat.current.emissiveIntensity = THREE.MathUtils.lerp(glowMat.current.emissiveIntensity, dimmed ? 0.05 : 0.35, k);
    }
    if (light.current) {
      light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, dimmed ? 0.4 : 5, k);
    }
  });

  /* Pointer handlers — stopPropagation so only the nearest floor reacts. */
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(floor.index);
  };
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(floor.index);
    document.body.style.cursor = "pointer";
  };
  const handleOut = () => {
    onHover(null);
    document.body.style.cursor = "";
  };

  // Shared props for the body material (standard for basalt, physical for glass).
  const bodyProps = {
    color: look.color,
    metalness: look.metalness,
    roughness: look.roughness,
    envMapIntensity: 1.2,
    emissive: GOLD,
    emissiveIntensity: 0,
    transparent: true,
    opacity: look.opacity,
    depthWrite: look.opacity >= 1,
  };

  return (
    <group ref={group} position={[0, floor.baseY, 0]} rotation={[0, floor.rotationY, 0]}>
      {/* 1 — Structural slab / brushed-aluminium edge trim */}
      <mesh position={[0, SLAB_THICKNESS / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[floor.width + 0.12, SLAB_THICKNESS, floor.depth + 0.12]} />
        <meshStandardMaterial ref={slabMat} color="#aeb4bd" metalness={0.85} roughness={0.35} transparent opacity={1} />
      </mesh>

      {/* 2 — Floor volume (the interactive hit target) */}
      <mesh
        position={[0, SLAB_THICKNESS + bodyH / 2, 0]}
        castShadow={floor.zone === "podium"}
        receiveShadow
        onClick={handleClick}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        <boxGeometry args={[floor.width, bodyH, floor.depth]} />
        {look.kind === "physical" ? (
          <meshPhysicalMaterial
            ref={bodyMat as RefObject<THREE.MeshPhysicalMaterial>}
            {...bodyProps}
            clearcoat={look.clearcoat ?? 0}
            clearcoatRoughness={0.1}
          />
        ) : (
          <meshStandardMaterial ref={bodyMat} {...bodyProps} />
        )}
      </mesh>

      {/* 3 — Outline */}
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial ref={edgeMat} color={look.edgeColor} transparent opacity={0.9} depthWrite={false} />
      </lineSegments>

      {/* 4 — Curtain-wall mullions */}
      {mullions && (
        <lineSegments geometry={mullions} raycast={() => null}>
          <lineBasicMaterial ref={mullionMat} color={look.edgeColor} transparent opacity={0.35} depthWrite={false} />
        </lineSegments>
      )}

      {/* 5 — Crown: warm golden interior */}
      {floor.zone === "crown" && (
        <>
          <mesh position={[0, SLAB_THICKNESS + 0.01, 0]} raycast={() => null}>
            <boxGeometry args={[floor.width * 0.92, 0.02, floor.depth * 0.92]} />
            <meshStandardMaterial ref={glowMat} color="#1a1408" emissive={CROWN_LIGHT} emissiveIntensity={0.35} roughness={0.6} transparent opacity={0.9} />
          </mesh>
          <pointLight ref={light} position={[0, floor.height * 0.6, 0]} color={CROWN_LIGHT} intensity={5} distance={9} decay={2} />
        </>
      )}

      {/* 6 — Procedural furniture when isolated */}
      <FurnitureOverlay floor={floor} visible={selected} />
    </group>
  );
}
