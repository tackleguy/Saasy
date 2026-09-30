"use client";
/**
 * FloorPlate — one individually addressable floor of a tower.
 * -----------------------------------------------------------------------------
 * Anatomy (in the floor's local space):
 *   • Core     — concrete lift & stair core with lift doors. Lives OUTSIDE the
 *                twisted group, so it stays vertical while plates rotate.
 *   • Slab     — thin brushed-aluminium plate that reads as the edge trim.
 *   • Body     — the floor volume in its zone material (basalt / glass).
 *   • Edges    — crisp outline + vertical curtain-wall mullions.
 *   • Extras   — warm light and glow in crown penthouses.
 *   • Interior — floor finish + real furniture, mounted only when isolated.
 *
 * Every visual state (explode position, hover glow, selection, dimming to 0.15,
 * X-ray) is eased per frame with frame-rate-independent damping, so
 * transitions stay smooth at 60 FPS without React re-renders.
 */
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import type { FloorData, ZoneId } from "@/types";
import { explodedY } from "@/lib/tower";
import FurnitureOverlay, { SLAB_THICKNESS } from "./FurnitureOverlay";

/** Opacity of every non-selected floor while one floor is isolated. */
export const DIMMED_OPACITY = 0.15;
/** Facade opacity in X-ray (core) mode. */
const XRAY_OPACITY = 0.08;

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
  /** Spacing of vertical mullions in scene units. */
  mullionSpacing: number;
  /** Interior floor finish shown when the floor is isolated. */
  finish: { color: string; roughness: number };
}

const LOOKS: Record<ZoneId, ZoneLook> = {
  // Dark basalt marble podium; travertine lobby floor
  podium: { kind: "standard", color: "#12151c", metalness: 0.9, roughness: 0.1, opacity: 1, edgeColor: "#6b6250", mullionSpacing: 1.5, finish: { color: "#d8cfc1", roughness: 0.25 } },
  // Double-glazed curtain wall; polished concrete floor
  office: { kind: "physical", color: "#38bdf8", metalness: 0.1, roughness: 0.1, opacity: 0.65, clearcoat: 1, edgeColor: "#7dd3fc", mullionSpacing: 1.25, finish: { color: "#9a9ea4", roughness: 0.45 } },
  // Frosted architectural glass; oak floor
  residential: { kind: "physical", color: "#a9b8ca", metalness: 0.15, roughness: 0.5, opacity: 0.45, edgeColor: "#d6dbe2", mullionSpacing: 1.0625, finish: { color: "#b58d66", roughness: 0.55 } },
  // Ultra-clear penthouse glass; white marble floor
  crown: { kind: "physical", color: "#e0f2fe", metalness: 0.05, roughness: 0.02, opacity: 0.28, clearcoat: 1, edgeColor: "#f3e5ab", mullionSpacing: 0.8125, finish: { color: "#ece7df", roughness: 0.15 } },
};

/* ----------------------------------------------------------------- geometry */

const geoCache = new Map<string, THREE.BufferGeometry>();
const cached = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
};

/** Vertical line segments around the perimeter of a w × d box of height h (base at y0). */
function mullionGeometry(w: number, d: number, y0: number, h: number, spacing: number) {
  return cached(`mull:${w}:${d}:${y0}:${h}:${spacing}`, () => {
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
    return geo;
  });
}

/** Outline of the floor body. */
function edgeGeometry(w: number, d: number, bodyH: number) {
  return cached(`edge:${w}:${d}:${bodyH}`, () => {
    const box = new THREE.BoxGeometry(w, bodyH, d);
    box.translate(0, SLAB_THICKNESS + bodyH / 2, 0);
    const e = new THREE.EdgesGeometry(box);
    box.dispose();
    return e;
  });
}

/** Three lift doors on each of two opposite core faces, merged into one geometry. */
function liftDoorGeometry(core: number, doorH: number) {
  return cached(`doors:${core}:${doorH}`, () => {
    const w = core * 0.2;
    const positions: number[] = [];
    const indices: number[] = [];
    const template = new THREE.BoxGeometry(w, doorH, 0.012);
    const tp = template.getAttribute("position");
    const ti = template.getIndex()!;
    for (const sz of [-1, 1]) {
      for (const x of [-core * 0.28, 0, core * 0.28]) {
        const offset = positions.length / 3;
        for (let i = 0; i < tp.count; i++) positions.push(tp.getX(i) + x, tp.getY(i) + SLAB_THICKNESS + doorH / 2, tp.getZ(i) + sz * (core / 2 + 0.006));
        for (let i = 0; i < ti.count; i++) indices.push(ti.getX(i) + offset);
      }
    }
    template.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  });
}

/* ---------------------------------------------------------------- component */

interface Props {
  floor: FloorData;
  /** Explosion factor 0 – 2.5 (0 for buildings that aren't active). */
  explosion: number;
  coreSize: number;
  selected: boolean;
  /** True when ANOTHER floor is isolated. */
  dimmed: boolean;
  hovered: boolean;
  /** X-ray mode: facades fade so the cores read through the whole site. */
  xray: boolean;
  onSelect: (floor: FloorData) => void;
  onHover: (floor: FloorData | null) => void;
}

export default function FloorPlate({ floor, explosion, coreSize, selected, dimmed, hovered, xray, onSelect, onHover }: Props) {
  const look = LOOKS[floor.zone];
  const bodyH = floor.height - SLAB_THICKNESS;
  const doorH = Math.min(bodyH * 0.8, 0.62);

  const group = useRef<THREE.Group>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const slabMat = useRef<THREE.MeshStandardMaterial>(null);
  const slabMesh = useRef<THREE.Mesh>(null);
  const edgeMat = useRef<THREE.LineBasicMaterial>(null);
  const mullionMat = useRef<THREE.LineBasicMaterial>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const doorMat = useRef<THREE.MeshStandardMaterial>(null);
  const glowMat = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);

  const edgeIdle = useMemo(() => new THREE.Color(look.edgeColor), [look.edgeColor]);
  const edges = edgeGeometry(floor.width, floor.depth, bodyH);
  const mullions = mullionGeometry(floor.width, floor.depth, SLAB_THICKNESS, bodyH, look.mullionSpacing);
  const doors = liftDoorGeometry(coreSize, doorH);

  /* Per-frame easing of position and material state. */
  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.0008, dt); // frame-rate independent damping factor
    const lerp = THREE.MathUtils.lerp;

    const g = group.current;
    if (g) g.position.y = lerp(g.position.y, explodedY(floor, explosion), k);

    const fade = dimmed ? DIMMED_OPACITY : 1;

    const body = bodyMat.current;
    if (body) {
      let target = look.opacity;
      if (dimmed) target = DIMMED_OPACITY * (look.opacity < 1 ? 0.6 : 1);
      else if (selected) target = 0.12; // open the facade to reveal the interior
      else if (xray) target = XRAY_OPACITY;
      body.opacity = lerp(body.opacity, target, k);
      // An opaque body should write depth; a faded one must not, or it hides what's behind it.
      body.depthWrite = look.opacity >= 1 && body.opacity > 0.95;
      // Dark opaque basalt shows emissive far more strongly than glass, so scale it down.
      const glow = (selected ? 0.1 : hovered ? 0.14 : 0) * (look.opacity < 1 ? 1 : 0.3);
      body.emissiveIntensity = lerp(body.emissiveIntensity, glow, k);
    }
    if (slabMat.current) {
      slabMat.current.opacity = lerp(slabMat.current.opacity, fade, k);
      slabMat.current.depthWrite = slabMat.current.opacity > 0.95;
    }
    // Dimmed slabs must not shade the isolated floor beneath them.
    if (slabMesh.current) slabMesh.current.castShadow = !dimmed;
    if (edgeMat.current) {
      edgeMat.current.color.lerp(selected || hovered ? GOLD : edgeIdle, k);
      edgeMat.current.opacity = lerp(edgeMat.current.opacity, dimmed ? DIMMED_OPACITY : xray ? 0.35 : 0.9, k);
    }
    if (mullionMat.current) mullionMat.current.opacity = lerp(mullionMat.current.opacity, dimmed || xray || selected ? 0.04 : 0.35, k);
    if (coreMat.current) {
      coreMat.current.opacity = lerp(coreMat.current.opacity, dimmed ? DIMMED_OPACITY : 1, k);
      coreMat.current.depthWrite = coreMat.current.opacity > 0.95;
      coreMat.current.emissiveIntensity = lerp(coreMat.current.emissiveIntensity, xray && !dimmed ? 0.3 : 0, k);
    }
    if (doorMat.current) doorMat.current.opacity = lerp(doorMat.current.opacity, fade, k);
    if (glowMat.current) glowMat.current.emissiveIntensity = lerp(glowMat.current.emissiveIntensity, dimmed || selected ? 0.03 : 0.35, k);
    if (light.current) light.current.intensity = lerp(light.current.intensity, dimmed ? 0.4 : 5, k);
  });

  /* Pointer handlers — stopPropagation so only the nearest floor reacts. */
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(floor);
  };
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(floor);
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
    <group ref={group} position={[0, floor.baseY, 0]}>
      {/* ── Core: vertical concrete lift & stair shaft (never twists) ── */}
      <mesh position={[0, floor.height / 2, 0]} castShadow receiveShadow raycast={() => null}>
        <boxGeometry args={[coreSize, floor.height, coreSize]} />
        <meshStandardMaterial ref={coreMat} color="#8e9196" roughness={0.92} emissive={GOLD} emissiveIntensity={0} transparent opacity={1} />
      </mesh>
      <mesh geometry={doors} raycast={() => null}>
        <meshStandardMaterial ref={doorMat} color="#c3c8cf" metalness={0.9} roughness={0.28} transparent opacity={1} />
      </mesh>

      {/* ── Twisted plate ── */}
      <group rotation={[0, floor.rotationY, 0]}>
        {/* Structural slab / brushed-aluminium edge trim */}
        <mesh ref={slabMesh} position={[0, SLAB_THICKNESS / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[floor.width + 0.12, SLAB_THICKNESS, floor.depth + 0.12]} />
          <meshStandardMaterial ref={slabMat} color="#aeb4bd" metalness={0.85} roughness={0.35} transparent opacity={1} />
        </mesh>

        {/* Floor volume (the interactive hit target) */}
        <mesh
          position={[0, SLAB_THICKNESS + bodyH / 2, 0]}
          castShadow={floor.zone === "podium" && !selected}
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

        {/* Outline + curtain-wall mullions */}
        <lineSegments geometry={edges} raycast={() => null}>
          <lineBasicMaterial ref={edgeMat} color={look.edgeColor} transparent opacity={0.9} depthWrite={false} />
        </lineSegments>
        <lineSegments geometry={mullions} raycast={() => null}>
          <lineBasicMaterial ref={mullionMat} color={look.edgeColor} transparent opacity={0.35} depthWrite={false} />
        </lineSegments>

        {/* Crown: warm golden interior */}
        {floor.zone === "crown" && (
          <>
            <mesh position={[0, SLAB_THICKNESS + 0.01, 0]} raycast={() => null}>
              <boxGeometry args={[floor.width * 0.92, 0.02, floor.depth * 0.92]} />
              <meshStandardMaterial ref={glowMat} color="#1a1408" emissive={CROWN_LIGHT} emissiveIntensity={0.35} roughness={0.6} transparent opacity={0.9} />
            </mesh>
            <pointLight ref={light} position={[0, floor.height * 0.6, 0]} color={CROWN_LIGHT} intensity={5} distance={9} decay={2} />
          </>
        )}

        {/* Interior: floor finish + real furniture, only when isolated */}
        {selected && (
          <>
            <mesh rotation-x={-Math.PI / 2} position={[0, SLAB_THICKNESS + 0.034, 0]} receiveShadow raycast={() => null}>
              <planeGeometry args={[floor.width - 0.02, floor.depth - 0.02]} />
              <meshStandardMaterial color={look.finish.color} roughness={look.finish.roughness} />
            </mesh>
            <FurnitureOverlay floor={floor} coreSize={coreSize} />
          </>
        )}
      </group>
    </group>
  );
}
