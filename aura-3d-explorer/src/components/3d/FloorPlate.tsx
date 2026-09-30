"use client";
/**
 * FloorPlate — one individually addressable floor of a tower.
 * -----------------------------------------------------------------------------
 * Anatomy (in the floor's local space):
 *   • Core     — light-concrete lift & stair core with lift doors. Lives
 *                OUTSIDE the twisted group, so it stays vertical while the
 *                plates rotate around it.
 *   • Slab     — light concrete (#D9D4CB).
 *   • Envelope — per zone:
 *       podium       stone arcade of arched openings + recessed lobby glazing
 *       office       transmissive curtain wall + deep bronze vertical fins
 *       residential  curtain wall + slim mullions + curved balcony band with
 *                    a glass balustrade
 *       crown        ultra-clear glass + slim mullions + warm interior light
 *   • Ceiling  — light plaster, seen through the glass (and when walking).
 *   • Interior — floor finish, warm indirect light and real furniture,
 *                mounted only when the floor is isolated.
 *
 * Glass is a MeshPhysicalMaterial with transmission — three renders all
 * opaque objects into a transmission buffer once per frame, then refracts it
 * through every transmissive mesh. When a floor is dimmed, isolated or in
 * X-ray, transmission is eased to 0 and plain opacity takes over so the glass
 * can fade (transmissive surfaces can't be see-through-and-faded at once).
 *
 * All state changes (explode height, hover, dimming to 0.15, X-ray, walking)
 * are eased per frame with frame-rate-independent damping, without React
 * re-renders.
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import type { FacadeSpec, FloorData, ZoneId } from "@/types";
import { explodedY } from "@/lib/tower";
import FurnitureOverlay, { SLAB_THICKNESS } from "./FurnitureOverlay";
import { arcadePanel, balconyBand, balustrade, finMatrices, liftDoors, plateEdges, UNIT_BOX } from "./facadeGeometry";
import { concreteTexture, marbleTexture, plasterTexture, stoneTexture, woodTexture } from "./textures";

/** Opacity of every non-selected floor while one floor is isolated. */
export const DIMMED_OPACITY = 0.15;
/** Glass opacity in X-ray (core) mode. */
const XRAY_OPACITY = 0.06;

const HIGHLIGHT = new THREE.Color("#9C7A52"); // oak
const BRONZE = "#8B6B44";

/* ------------------------------------------------------------ zone materials */

interface GlassLook {
  color: string;
  roughness: number;
  transmission: number;
  /** Mullion / fin spacing, thickness and projection (scene units). */
  fin: { spacing: number; thickness: number; depth: number } | null;
  /** Interior floor finish shown when the floor is isolated. */
  finish: string;
}

const LOOKS: Record<ZoneId, GlassLook> = {
  podium: { color: "#8fa4a7", roughness: 0.06, transmission: 0.85, fin: null, finish: "#f0e9de" },
  office: { color: "#9fb6ba", roughness: 0.05, transmission: 0.9, fin: { spacing: 1.0, thickness: 0.06, depth: 0.3 }, finish: "#cfcac2" },
  residential: { color: "#a9bec1", roughness: 0.08, transmission: 0.9, fin: { spacing: 1.0625, thickness: 0.04, depth: 0.06 }, finish: "#ffffff" },
  crown: { color: "#c6d6d8", roughness: 0.03, transmission: 0.95, fin: { spacing: 0.8125, thickness: 0.035, depth: 0.05 }, finish: "#ffffff" },
};

const lerp = THREE.MathUtils.lerp;

/**
 * Ease an opaque material's opacity. It is only flagged `transparent` while
 * actually faded: transparent objects are excluded from the transmission
 * buffer, so a permanently-transparent slab or core would vanish behind glass.
 * Toggling `transparent` changes the shader program, hence `needsUpdate`.
 */
function fadeSolid(m: THREE.Material | null, target: number, k: number) {
  if (!m) return;
  m.opacity = lerp(m.opacity, target, k);
  const faded = m.opacity < 0.995;
  if (m.transparent !== faded) {
    m.transparent = faded;
    m.needsUpdate = true;
  }
  m.depthWrite = !faded;
}

/* ---------------------------------------------------------------- component */

interface Props {
  floor: FloorData;
  /** Explosion factor 0 – 2.5 (0 for buildings that aren't active). */
  explosion: number;
  coreSize: number;
  facade: FacadeSpec;
  selected: boolean;
  /** True when ANOTHER floor is isolated. */
  dimmed: boolean;
  hovered: boolean;
  /** X-ray mode: glass fades so the cores read through the whole site. */
  xray: boolean;
  /** First-person walk-through of this (selected) floor. */
  walking: boolean;
  onSelect: (floor: FloorData) => void;
  onHover: (floor: FloorData | null) => void;
}

export default function FloorPlate({ floor, explosion, coreSize, facade, selected, dimmed, hovered, xray, walking, onSelect, onHover }: Props) {
  const look = LOOKS[floor.zone];
  const bodyH = floor.height - SLAB_THICKNESS;
  const doorH = Math.min(bodyH * 0.8, 0.62);
  const arcade = floor.zone === "podium" && facade.arches;
  const balconies = floor.zone === "residential" && facade.balconies;
  // Office fins follow the building's fin density; other zones use slim mullions.
  const fin =
    floor.zone === "office" && look.fin
      ? facade.finSpacing > 0
        ? { ...look.fin, spacing: facade.finSpacing }
        : null
      : floor.zone === "podium" && !arcade
        ? { spacing: 1.2, thickness: 0.06, depth: 0.2 }
        : look.fin;
  // The arcade glazing is recessed behind the stone.
  const inset = arcade ? 0.7 : 0;

  const group = useRef<THREE.Group>(null);
  const glassMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const slabMat = useRef<THREE.MeshStandardMaterial>(null);
  const slabMesh = useRef<THREE.Mesh>(null);
  const edgeMat = useRef<THREE.LineBasicMaterial>(null);
  const finMat = useRef<THREE.MeshStandardMaterial>(null);
  const finMesh = useRef<THREE.InstancedMesh>(null);
  const bandMat = useRef<THREE.MeshStandardMaterial>(null);
  const balusMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const doorMat = useRef<THREE.MeshStandardMaterial>(null);
  const ceilMat = useRef<THREE.MeshStandardMaterial>(null);
  const ceilMesh = useRef<THREE.Mesh>(null);
  const crownLight = useRef<THREE.PointLight>(null);

  // One stone material shared by the four arcade panels so they fade together.
  const stoneMat = useMemo(() => {
    // ExtrudeGeometry UVs are in scene units, so one stone tile ≈ 2 units.
    const map = stoneTexture().clone();
    map.repeat.set(0.5, 0.5);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: "#f2ece2", map, roughness: 0.8 });
  }, []);
  // Interior floor finish per zone: travertine, polished concrete, oak, marble.
  const finishMap = useMemo(() => {
    const src = floor.zone === "podium" ? stoneTexture() : floor.zone === "office" ? concreteTexture() : floor.zone === "residential" ? woodTexture("#c9a57a", "#8b6a48") : marbleTexture();
    const t = src.clone();
    const reps = floor.zone === "residential" ? 5 : 3;
    t.repeat.set(Math.max(1, Math.round(floor.width * reps * 0.35)), Math.max(1, Math.round(floor.depth * reps * 0.35)));
    t.needsUpdate = true;
    return t;
  }, [floor.zone, floor.width, floor.depth]);
  useEffect(() => () => stoneMat.dispose(), [stoneMat]);

  const edges = plateEdges(floor.width - inset, floor.depth - inset, SLAB_THICKNESS, bodyH);
  const doors = liftDoors(coreSize, SLAB_THICKNESS, doorH);
  const fins = fin ? finMatrices(floor.width, floor.depth, SLAB_THICKNESS, bodyH, fin.spacing, fin.thickness, fin.depth) : null;

  // Upload fin transforms once per geometry change.
  useEffect(() => {
    const m = finMesh.current;
    if (!m || !fins) return;
    fins.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [fins]);

  // Seen from inside while walking, the glazing must render its back faces.
  useEffect(() => {
    const m = glassMat.current;
    if (!m) return;
    m.side = walking ? THREE.DoubleSide : THREE.FrontSide;
    m.needsUpdate = true;
  }, [walking]);

  /* Per-frame easing of position and material state. */
  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.0008, dt); // frame-rate independent damping factor
    const g = group.current;
    if (g) g.position.y = lerp(g.position.y, explodedY(floor, explosion), k);

    const fade = dimmed ? DIMMED_OPACITY : 1;

    // Glass: clear transmission at rest; plain fading opacity otherwise.
    const glass = glassMat.current;
    if (glass) {
      const faded = dimmed || selected || walking || xray;
      glass.transmission = lerp(glass.transmission, faded ? 0 : look.transmission, k);
      const target = dimmed ? DIMMED_OPACITY * 0.6 : walking ? 0.08 : selected ? 0.1 : xray ? XRAY_OPACITY : 1;
      glass.opacity = lerp(glass.opacity, target, k);
      glass.emissiveIntensity = lerp(glass.emissiveIntensity, hovered && !selected ? 0.18 : 0, k);
    }

    fadeSolid(slabMat.current, fade, k);
    if (slabMesh.current) slabMesh.current.castShadow = !dimmed; // dimmed slabs must not shade the isolated floor
    // Fins/mullions stay as window frames when walking, but open up when looking down into the floor.
    fadeSolid(finMat.current, dimmed ? DIMMED_OPACITY : selected && !walking ? 0.2 : xray ? 0.35 : 1, k);
    if (arcade) fadeSolid(stoneMat, dimmed ? DIMMED_OPACITY : selected || xray ? 0.25 : 1, k);
    fadeSolid(bandMat.current, dimmed ? DIMMED_OPACITY : xray ? 0.4 : 1, k);
    if (balusMat.current) balusMat.current.opacity = lerp(balusMat.current.opacity, dimmed ? 0.05 : 0.3, k);
    fadeSolid(coreMat.current, fade, k);
    if (coreMat.current) coreMat.current.emissiveIntensity = lerp(coreMat.current.emissiveIntensity, xray && !dimmed ? 0.45 : 0, k);
    fadeSolid(doorMat.current, fade, k);

    // Ceiling hidden when looking down into an isolated floor (unless walking inside it).
    if (ceilMat.current && ceilMesh.current) {
      fadeSolid(ceilMat.current, selected && !walking ? 0 : dimmed || xray ? 0.05 : 1, k);
      ceilMesh.current.visible = ceilMat.current.opacity > 0.01;
    }

    if (edgeMat.current) edgeMat.current.opacity = lerp(edgeMat.current.opacity, (selected && !walking) || hovered ? 0.9 : 0, k);
    if (crownLight.current) crownLight.current.intensity = lerp(crownLight.current.intensity, dimmed ? 0.2 : 2.2, k);
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

  const w = floor.width;
  const d = floor.depth;

  return (
    <group ref={group} position={[0, floor.baseY, 0]}>
      {/* ── Core: vertical lift & stair shaft (never twists) ── */}
      <mesh position={[0, floor.height / 2, 0]} castShadow receiveShadow raycast={() => null}>
        <boxGeometry args={[coreSize, floor.height, coreSize]} />
        <meshStandardMaterial ref={coreMat} map={concreteTexture()} color="#e2dcd1" roughness={0.9} emissive={HIGHLIGHT} emissiveIntensity={0} />
      </mesh>
      <mesh geometry={doors} raycast={() => null}>
        <meshStandardMaterial ref={doorMat} color="#b9a78a" metalness={0.85} roughness={0.3} />
      </mesh>

      {/* ── Twisted plate ── */}
      <group rotation={[0, floor.rotationY, 0]} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
        {/* Slab — light concrete */}
        <mesh ref={slabMesh} position={[0, SLAB_THICKNESS / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w + 0.1, SLAB_THICKNESS, d + 0.1]} />
          <meshStandardMaterial ref={slabMat} map={concreteTexture()} color="#e6e1d8" roughness={0.9} />
        </mesh>

        {/* Curtain wall (the main hit target) */}
        <mesh position={[0, SLAB_THICKNESS + bodyH / 2, 0]} receiveShadow>
          <boxGeometry args={[w - inset, bodyH, d - inset]} />
          <meshPhysicalMaterial
            ref={glassMat as RefObject<THREE.MeshPhysicalMaterial>}
            color={look.color}
            transmission={look.transmission}
            thickness={0.5}
            ior={1.5}
            roughness={look.roughness}
            metalness={0}
            envMapIntensity={1.2}
            specularIntensity={1}
            emissive={HIGHLIGHT}
            emissiveIntensity={0}
            transparent
            depthWrite={false}
          />
        </mesh>

        {/* Stone arcade podium (4 panels with arched openings) */}
        {arcade && (
          <group>
            {[
              { rot: 0, pos: [0, SLAB_THICKNESS, d / 2 - 0.3] as const, width: w },
              { rot: Math.PI, pos: [0, SLAB_THICKNESS, -d / 2 + 0.3] as const, width: w },
              { rot: Math.PI / 2, pos: [w / 2 - 0.3, SLAB_THICKNESS, 0] as const, width: d },
              { rot: -Math.PI / 2, pos: [-w / 2 + 0.3, SLAB_THICKNESS, 0] as const, width: d },
            ].map((p, i) => (
              <mesh key={i} geometry={arcadePanel(p.width, bodyH, 0.3)} material={stoneMat} position={p.pos} rotation={[0, p.rot, 0]} castShadow receiveShadow />
            ))}
          </group>
        )}

        {/* Bronze fins / mullions */}
        {fins && (
          <instancedMesh ref={finMesh} args={[UNIT_BOX, undefined, fins.length]} castShadow raycast={() => null}>
            <meshStandardMaterial ref={finMat} color={BRONZE} metalness={0.6} roughness={0.35} roughnessMap={concreteTexture()} />
          </instancedMesh>
        )}

        {/* Curved balcony band + glass balustrade */}
        {balconies && (
          <>
            <mesh geometry={balconyBand(w, d, 0.45, 0.07)} position={[0, SLAB_THICKNESS - 0.07, 0]} castShadow receiveShadow raycast={() => null}>
              <meshStandardMaterial ref={bandMat} map={concreteTexture()} color="#f4f0e9" roughness={0.7} />
            </mesh>
            <mesh geometry={balustrade(w, d, 0.45, 0.28)} position={[0, SLAB_THICKNESS, 0]} raycast={() => null}>
              <meshPhysicalMaterial ref={balusMat} color="#d7e3e5" roughness={0.1} transparent opacity={0.3} depthWrite={false} />
            </mesh>
          </>
        )}

        {/* Hover / selection outline */}
        <lineSegments geometry={edges} raycast={() => null}>
          <lineBasicMaterial ref={edgeMat} color={HIGHLIGHT} transparent opacity={0} depthWrite={false} />
        </lineSegments>

        {/* Light plaster ceiling, visible through the glass */}
        <mesh ref={ceilMesh} rotation-x={Math.PI / 2} position={[0, floor.height - 0.004, 0]} raycast={() => null}>
          <planeGeometry args={[w - inset - 0.02, d - inset - 0.02]} />
          <meshStandardMaterial ref={ceilMat} map={plasterTexture()} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>

        {/* Crown: warm interior glow */}
        {floor.zone === "crown" && (
          <pointLight ref={crownLight} position={[0, floor.height * 0.6, 0]} color="#f59e0b" intensity={2.2} distance={8} decay={2} />
        )}

        {/* Interior: floor finish, warm indirect light and furniture — only when isolated */}
        {selected && (
          <>
            <mesh rotation-x={-Math.PI / 2} position={[0, SLAB_THICKNESS + 0.034, 0]} receiveShadow raycast={() => null}>
              <planeGeometry args={[w - inset - 0.02, d - inset - 0.02]} />
              <meshStandardMaterial map={finishMap} color={look.finish} roughness={floor.zone === "crown" ? 0.2 : 0.55} />
            </mesh>
            <pointLight position={[0, floor.height * 0.85, 0]} color="#ffd9a8" intensity={3} distance={Math.max(w, d)} decay={1.6} />
            <FurnitureOverlay floor={floor} coreSize={coreSize} />
          </>
        )}
      </group>
    </group>
  );
}
