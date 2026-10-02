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
 * Exterior glass uses ordinary reflective, depth-writing surfaces. Isolation,
 * walk-through and X-ray switch it to standard alpha fading (see ./glassBlend).
 *
 * Crown and amenity floors glow warm through an emissive ceiling (not a point
 * light each: every light is evaluated in every fragment shader on site).
 *
 * Per-frame easing sleeps once every eased value has settled (SETTLE_MS after
 * the last prop change), so 160 idle floors cost ~nothing per frame.
 *
 * Plan shapes: rectangular plates use the original box geometry. Any other
 * `floor.shape` (ellipse, hexagon, triangle, L, cross…) swaps in outline-based
 * geometry from facadeGeometry — extruded slab and curtain wall, fins walked
 * along the perimeter, balcony rings that follow the outline, arcade panels on
 * the straight runs, and outline-shaped ceiling / floor finish.
 *
 * All state changes (explode height, hover, dimming to 0.15, X-ray, walking)
 * are eased per frame with frame-rate-independent damping, without React
 * re-renders.
 */
import { memo, useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import type { FacadeSpec, FloorData, ZoneId } from "@/types";
import { explodedY } from "@/lib/tower";
import { DEFAULT_FIT, type FloorFit } from "@/lib/apartmentFit";
import { designForFloor } from "@/lib/projectFloorPlan";
import { useProjectFloorPlans } from "./floorPlanContext";
import ImportedFloorDesign from "./ImportedFloorDesign";
import FurnitureOverlay, { SLAB_THICKNESS } from "./FurnitureOverlay";
import LiftCore from "./LiftCore";
import { coreServiceOpen } from "@/lib/coreLayout";
import InteriorShell, { liftBankDoors } from "./interior";
import {
  arcadePanel,
  arcadeSpans,
  balconyBand,
  balustrade,
  finMatrices,
  outlineFinMatrices,
  plateEdges,
  plateFloor,
  plateSolid,
  shapedBalustrade,
  shapedBand,
  shapedEdges,
  UNIT_BOX,
} from "./facadeGeometry";
import { brushedMetalTexture, concreteBump, concreteTexture, marbleBump, marbleTexture, plasterBump, plasterTexture, repeatTexture, stoneBump, stoneTexture, woodBump, woodTexture } from "./textures";
import { DETAIL } from "./layers";
import { SETTLE_MS } from "./staticShadows";
import { mergeTag } from "./mergedStatics";
import { GLASS_BLEND, setGlass } from "./glassBlend";

// Parts batched per building while it is idle (see ./mergedStatics).
const TAG = {
  core: mergeTag("structure"),
  doors: mergeTag("doors"),
  slab: mergeTag("structure"),
  stone: mergeTag("stone"),
  fins: mergeTag("fins"),
  band: mergeTag("band"),
  balus: mergeTag("balus"),
  ceiling: mergeTag("ceiling"),
  ceilingGlow: mergeTag("ceiling", false, { emissiveIntensity: 0 }),
};
// Curtain wall: batched per zone look (+ amenity glow) in the hover group.
const GLASS_TAG = new Map<string, ReturnType<typeof mergeTag>>();
const glassTag = (zone: ZoneId, amenity: boolean) => {
  const key = "glass-curtain";
  if (!GLASS_TAG.has(key)) GLASS_TAG.set(key, mergeTag(key, true, { emissiveIntensity: 0 }));
  return GLASS_TAG.get(key)!;
};

/** Opacity of every non-selected floor while one floor is isolated. */
export const DIMMED_OPACITY = 0.15;
/** Glass opacity in X-ray (core) mode. */
const XRAY_OPACITY = 0.06;

const HIGHLIGHT = new THREE.Color("#9C7A52"); // oak
const WARM_GLOW = new THREE.Color("#f59e0b"); // crown / amenity interior light
const BRONZE = "#6E5537";

/* ------------------------------------------------------------ zone materials */

interface GlassLook {
  color: string;
  roughness: number;
  /** Mullion / fin spacing, thickness and projection (scene units). */
  fin: { spacing: number; thickness: number; depth: number } | null;
  /** Interior floor finish shown when the floor is isolated. */
  finish: string;
}

const LOOKS: Record<ZoneId, GlassLook> = {
  podium: { color: "#8fa4a7", roughness: 0.18, fin: null, finish: "#f0e9de" },
  office: { color: "#9fb6ba", roughness: 0.16, fin: { spacing: 0.84, thickness: 0.034, depth: 0.168 }, finish: "#cfcac2" },
  residential: { color: "#a9bec1", roughness: 0.2, fin: { spacing: 0.42, thickness: 0.014, depth: 0.022 }, finish: "#ffffff" },
  crown: { color: "#c6d6d8", roughness: 0.14, fin: { spacing: 0.42, thickness: 0.014, depth: 0.022 }, finish: "#ffffff" },
};

const lerp = THREE.MathUtils.lerp;
/** Emissive strength of the warm crown / amenity ceiling (stands in for a point light per floor). */
const CEILING_GLOW = 0.55;
/** Resting emissive of amenity-floor glass (lit shared spaces read from outside). */
const AMENITY_GLOW = 0.12;

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
  /** Ghost this slice of core so the continuous <CoreShaft> reads through it. */
  coreGhost?: boolean;
  /** Floors in the building's crown (the penthouse spans them all). */
  crownFloors?: number;
  /** Room plan and furniture, used when this floor is isolated. */
  fit?: FloorFit;
}

function FloorPlate({ floor, explosion, coreSize, facade, selected, dimmed, hovered, xray, walking, onSelect, onHover, coreGhost = false, crownFloors = 2, fit = DEFAULT_FIT }: Props) {
  const plans = useProjectFloorPlans();
  const fitted = useMemo(() => designForFloor(plans, floor), [plans, floor]);
  const look = LOOKS[floor.zone];
  const bodyH = floor.height - SLAB_THICKNESS;
  const doorH = Math.min(bodyH * 0.8, 0.62);
  // Non-rect plan shapes use outline geometry; rect keeps the original boxes.
  const shape = floor.shape;
  const shaped = !!shape && shape.kind !== "rect";
  // Curved plates (ellipse) have no straight runs for an arcade — they fall back to glazing + fins.
  const spans = shaped && floor.zone === "podium" && facade.arches ? arcadeSpans(shape, floor.width, floor.depth, 0.3) : [];
  const arcade = floor.zone === "podium" && facade.arches && (!shaped || spans.length > 0);
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
  // Amenity floors read as a recessed "sky terrace": glazing set back behind the slab edge and fins.
  const inset = arcade ? 0.7 : floor.amenity ? 0.5 : 0;

  const group = useRef<THREE.Group>(null);
  const glassMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const glassColor = useMemo(() => new THREE.Color("#BFD3D8"), [look.color]);
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
  const edgeMesh = useRef<THREE.LineSegments>(null);
  const glowing = floor.zone === "crown" || !!floor.amenity;
  // Easing sleeps once settled; any prop change wakes it for SETTLE_MS.
  const awakeUntil = useRef(Infinity);
  useEffect(() => {
    awakeUntil.current = performance.now() + SETTLE_MS;
  }, [explosion, dimmed, selected, hovered, xray, walking, coreGhost, floor]);

  // One stone material shared by the four arcade panels so they fade together.
  const stoneMat = useMemo(() => {
    // ExtrudeGeometry UVs are in scene units, so one stone tile ≈ 2 units.
    const map = stoneTexture().clone();
    const bump = stoneBump().clone();
    map.repeat.set(0.5, 0.5);
    bump.repeat.set(0.5, 0.5);
    map.needsUpdate = true;
    bump.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: "#B8AEA0", map, bumpMap: bump, bumpScale: 0.035, roughness: 0.8 });
  }, []);
  // Interior floor finish per zone: travertine, polished concrete, oak, marble.
  const finish = useMemo(() => {
    const src =
      floor.zone === "podium"
        ? { map: stoneTexture(), bump: stoneBump() }
        : floor.zone === "office"
          ? { map: concreteTexture(), bump: concreteBump() }
          : floor.zone === "residential"
            ? { map: woodTexture("#c9a57a", "#8b6a48"), bump: woodBump("#c9a57a", "#8b6a48") }
            : { map: marbleTexture(), bump: marbleBump() };
    const reps = floor.zone === "residential" ? 5 : 3;
    const rx = Math.max(1, Math.round(floor.width * reps * 0.35));
    const ry = Math.max(1, Math.round(floor.depth * reps * 0.35));
    return { map: repeatTexture(src.map, rx, ry), bump: repeatTexture(src.bump, rx, ry) };
  }, [floor.zone, floor.width, floor.depth]);
  const coreTex = useMemo(() => {
    const rx = Math.max(1, coreSize / 2);
    const ry = Math.max(1, floor.height / 2);
    return { map: repeatTexture(concreteTexture(), rx, ry), bump: repeatTexture(concreteBump(), rx, ry) };
  }, [coreSize, floor.height]);
  const slabTex = useMemo(() => {
    const rx = Math.max(1, floor.width / 3);
    const ry = Math.max(1, floor.depth / 3);
    return { map: repeatTexture(concreteTexture(), rx, ry), bump: repeatTexture(concreteBump(), rx, ry) };
  }, [floor.width, floor.depth]);
  const ceilTex = useMemo(() => {
    const rx = Math.max(1, (floor.width - inset) / 4);
    const ry = Math.max(1, (floor.depth - inset) / 4);
    return { map: repeatTexture(plasterTexture("#f3efe8"), rx, ry), bump: repeatTexture(plasterBump("#f3efe8"), rx, ry) };
  }, [floor.width, floor.depth, inset]);
  useEffect(() => () => { stoneMat.map?.dispose(); stoneMat.bumpMap?.dispose(); stoneMat.dispose(); }, [stoneMat]);
  useEffect(() => () => { [finish,coreTex,slabTex,ceilTex].forEach(t=>{t.map.dispose();t.bump.dispose();}); }, [finish,coreTex,slabTex,ceilTex]);

  const edges = shaped
    ? shapedEdges(shape, floor.width, floor.depth, -inset / 2, SLAB_THICKNESS, bodyH)
    : plateEdges(floor.width - inset, floor.depth - inset, SLAB_THICKNESS, bodyH);
  const doors = liftBankDoors(coreSize, SLAB_THICKNESS, doorH);
  const fins = fin
    ? shaped
      ? outlineFinMatrices(shape, floor.width, floor.depth, SLAB_THICKNESS, bodyH, fin.spacing, fin.thickness, fin.depth)
      : finMatrices(floor.width, floor.depth, SLAB_THICKNESS, bodyH, fin.spacing, fin.thickness, fin.depth)
    : null;

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
    if (awakeUntil.current === 0) return; // settled
    // Frame-rate independent damping; the last frame snaps every value to its target.
    const settle = performance.now() > awakeUntil.current;
    const k = settle ? 1 : 1 - Math.pow(0.0008, dt);
    if (settle) awakeUntil.current = 0;
    const g = group.current;
    if (g) g.position.y = lerp(g.position.y, explodedY(floor, explosion), k);

    const fade = dimmed ? DIMMED_OPACITY : 1;

    // Reflective exterior at rest; transparent only for inspection modes.
    const glass = glassMat.current;
    if (glass) {
      const target = dimmed ? DIMMED_OPACITY * 0.6 : walking ? 0.08 : selected ? 0.1 : xray ? XRAY_OPACITY : 1;
      setGlass(glass, glassColor, lerp(glass.opacity, target, k));
      // Amenity floors keep a faint warm glow (lit shared spaces) so they read from outside.
      glass.emissiveIntensity = lerp(glass.emissiveIntensity, hovered && !selected ? 0.18 : floor.amenity && !dimmed && !xray ? AMENITY_GLOW : 0, k);
    }

    fadeSolid(slabMat.current, fade, k);
    if (slabMesh.current) slabMesh.current.castShadow = !dimmed; // dimmed slabs must not shade the isolated floor
    // Fins/mullions stay as window frames when walking, but open up when looking down into the floor.
    fadeSolid(finMat.current, dimmed ? DIMMED_OPACITY : selected && !walking ? 0.2 : xray ? 0.35 : 1, k);
    if (arcade) fadeSolid(stoneMat, dimmed ? DIMMED_OPACITY : selected || xray ? 0.25 : 1, k);
    fadeSolid(bandMat.current, dimmed ? DIMMED_OPACITY : xray ? 0.4 : 1, k);
    if (balusMat.current) balusMat.current.opacity = lerp(balusMat.current.opacity, dimmed ? 0.05 : 0.3, k);
    const coreFade = coreGhost && !selected ? Math.min(fade, 0.18) : fade;
    fadeSolid(coreMat.current, coreFade, k);
    if (coreMat.current) coreMat.current.emissiveIntensity = lerp(coreMat.current.emissiveIntensity, xray && !dimmed ? 0.45 : 0, k);
    fadeSolid(doorMat.current, coreFade, k);

    // Ceiling hidden when looking down into an isolated floor (unless walking inside it).
    if (ceilMat.current && ceilMesh.current) {
      fadeSolid(ceilMat.current, selected && !walking ? 0 : dimmed || xray ? 0.05 : 1, k);
      ceilMesh.current.visible = ceilMat.current.opacity > 0.01;
      if (glowing) ceilMat.current.emissiveIntensity = lerp(ceilMat.current.emissiveIntensity, dimmed ? 0.05 : CEILING_GLOW, k);
    }

    // Outline: hidden outright (not drawn at opacity 0) when neither hovered nor isolated.
    if (edgeMat.current) {
      edgeMat.current.opacity = lerp(edgeMat.current.opacity, (selected && !walking) || hovered ? 0.9 : 0, k);
      if (edgeMesh.current) edgeMesh.current.visible = edgeMat.current.opacity > 0.005;
    }
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
      {/* ── Core: vertical lift & stair shaft (never twists). Walking a floor opens up its lift. ── */}
      {walking || (selected && coreServiceOpen(floor.zone)) ? (
        <LiftCore coreSize={coreSize} floorHeight={floor.height} slab={SLAB_THICKNESS} open={coreServiceOpen(floor.zone)} walking={walking} />
      ) : (
        <>
          <mesh position={[0, floor.height / 2, 0]} castShadow receiveShadow raycast={() => null} userData={TAG.core}>
            <boxGeometry args={[coreSize, floor.height, coreSize]} />
            <meshStandardMaterial ref={coreMat} map={coreTex.map} bumpMap={coreTex.bump} bumpScale={0.04} color="#efeae3" roughness={0.88} emissive={HIGHLIGHT} emissiveIntensity={0} />
          </mesh>
          <mesh geometry={doors} raycast={() => null} layers={DETAIL} userData={TAG.doors}>
            <meshStandardMaterial ref={doorMat} map={brushedMetalTexture("#c4b496")} metalness={0.78} roughness={0.32} envMapIntensity={0.9} />
          </mesh>
        </>
      )}

      {/* ── Twisted plate ── */}
      <group rotation={[0, floor.rotationY, 0]} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
        {/* Slab — light concrete */}
        <mesh
          ref={slabMesh}
          geometry={shaped ? plateSolid(shape, w, d, 0.05, SLAB_THICKNESS) : undefined}
          position={[0, shaped ? 0 : SLAB_THICKNESS / 2, 0]}
          castShadow
          receiveShadow
          userData={TAG.slab}
        >
          {!shaped && <boxGeometry args={[w + 0.1, SLAB_THICKNESS, d + 0.1]} />}
          <meshStandardMaterial ref={slabMat} map={slabTex.map} bumpMap={slabTex.bump} bumpScale={0.045} color="#f0ebe4" roughness={0.86} />
        </mesh>

        {/* Curtain wall (the main hit target) */}
        <mesh
          geometry={shaped ? plateSolid(shape, w, d, -inset / 2, bodyH) : undefined}
          position={[0, shaped ? SLAB_THICKNESS : SLAB_THICKNESS + bodyH / 2, 0]}
          receiveShadow
          userData={glassTag(floor.zone, !!floor.amenity)}
        >
          {!shaped && <boxGeometry args={[w - inset, bodyH, d - inset]} />}
          <meshPhysicalMaterial
            ref={glassMat as RefObject<THREE.MeshPhysicalMaterial>}
            {...GLASS_BLEND}
            color="#BFD3D8"
            transmission={0.85}
            thickness={0.6}
            attenuationColor="#9FC2CC"
            attenuationDistance={5}
            clearcoat={1}
            ior={1.52}
            roughness={0.04}
            metalness={0}
            envMapIntensity={1.3}
            specularIntensity={0.65}
            emissive={HIGHLIGHT}
            emissiveIntensity={0}
          />
        </mesh>

        {/* Stone arcade podium (4 panels with arched openings) */}
        {arcade && shaped && (
          <group>
            {spans.map((p, i) => (
              <mesh key={i} geometry={arcadePanel(+p.length.toFixed(3), bodyH, 0.3)} material={stoneMat} position={[p.x, SLAB_THICKNESS, p.z]} rotation={[0, p.rot, 0]} castShadow receiveShadow userData={TAG.stone} />
            ))}
          </group>
        )}
        {arcade && !shaped && (
          <group>
            {[
              { rot: 0, pos: [0, SLAB_THICKNESS, d / 2 - 0.3] as const, width: w },
              { rot: Math.PI, pos: [0, SLAB_THICKNESS, -d / 2 + 0.3] as const, width: w },
              { rot: Math.PI / 2, pos: [w / 2 - 0.3, SLAB_THICKNESS, 0] as const, width: d },
              { rot: -Math.PI / 2, pos: [-w / 2 + 0.3, SLAB_THICKNESS, 0] as const, width: d },
            ].map((p, i) => (
              <mesh key={i} geometry={arcadePanel(p.width, bodyH, 0.3)} material={stoneMat} position={p.pos} rotation={[0, p.rot, 0]} castShadow receiveShadow userData={TAG.stone} />
            ))}
          </group>
        )}

        {/* Bronze fins / mullions */}
        {fins && (
          <instancedMesh ref={finMesh} args={[UNIT_BOX, undefined, fins.length]} castShadow raycast={() => null} userData={TAG.fins}>
            <meshStandardMaterial ref={finMat} map={brushedMetalTexture(BRONZE)} metalness={0.85} roughness={0.3} envMapIntensity={0.85} />
          </instancedMesh>
        )}

        {/* Curved balcony band + glass balustrade */}
        {balconies && (
          <>
            <mesh geometry={shaped ? shapedBand(shape, w, d, 0.45, 0.07) : balconyBand(w, d, 0.45, 0.07)} position={[0, SLAB_THICKNESS - 0.07, 0]} castShadow receiveShadow raycast={() => null} userData={TAG.band}>
              <meshStandardMaterial ref={bandMat} map={concreteTexture()} bumpMap={concreteBump()} bumpScale={0.03} color="#f7f3ec" roughness={0.68} />
            </mesh>
            <mesh geometry={shaped ? shapedBalustrade(shape, w, d, 0.45, 0.28) : balustrade(w, d, 0.45, 0.28)} position={[0, SLAB_THICKNESS, 0]} raycast={() => null} layers={DETAIL} userData={TAG.balus}>
              <meshPhysicalMaterial ref={balusMat} color="#d7e3e5" roughness={0.1} transparent opacity={0.3} depthWrite={false} />
            </mesh>
          </>
        )}

        {/* Interior walls & doors (isolated) + balconies (always) */}
        <InteriorShell floor={floor} coreSize={coreSize} facade={facade} crownFloors={crownFloors} isolated={selected} dimmed={dimmed} xray={xray} fit={fit} rooms={!fitted} />

        {/* Hover / selection outline */}
        <lineSegments ref={edgeMesh} geometry={edges} raycast={() => null} layers={DETAIL} visible={false}>
          <lineBasicMaterial ref={edgeMat} color={HIGHLIGHT} transparent opacity={0} depthWrite={false} />
        </lineSegments>

        {/* Light plaster ceiling, visible through the glass */}
        <mesh
          ref={ceilMesh}
          geometry={shaped ? plateFloor(shape, w, d, -inset / 2 - 0.01) : undefined}
          rotation-x={shaped ? 0 : Math.PI / 2}
          position={[0, floor.height - 0.004, 0]}
          raycast={() => null}
          layers={DETAIL}
          userData={glowing ? TAG.ceilingGlow : TAG.ceiling}
        >
          {!shaped && <planeGeometry args={[w - inset - 0.02, d - inset - 0.02]} />}
          <meshStandardMaterial
            ref={ceilMat}
            map={ceilTex.map}
            bumpMap={ceilTex.bump}
            bumpScale={0.012}
            roughness={0.95}
            side={THREE.DoubleSide}
            emissive={glowing ? WARM_GLOW : undefined}
            emissiveIntensity={glowing ? CEILING_GLOW : 0}
          />
        </mesh>

        {/* Interior: floor finish and furniture — only when isolated (its warm light is <InteriorLight> in BuildingScene) */}
        {selected && fitted && <ImportedFloorDesign fitted={fitted} />}
        {selected && !fitted && (
          <>
            <mesh
              geometry={shaped ? plateFloor(shape, w, d, -inset / 2 - 0.01) : undefined}
              rotation-x={shaped ? 0 : -Math.PI / 2}
              position={[0, SLAB_THICKNESS + 0.034, 0]}
              receiveShadow
              raycast={() => null}
            >
              {!shaped && <planeGeometry args={[w - inset - 0.02, d - inset - 0.02]} />}
              <meshStandardMaterial map={finish.map} bumpMap={finish.bump} bumpScale={floor.zone === "residential" ? 0.03 : 0.02} color={look.finish} roughness={floor.zone === "crown" ? 0.16 : floor.zone === "office" ? 0.42 : 0.48} />
            </mesh>
            <FurnitureOverlay floor={floor} coreSize={coreSize} crownFloors={crownFloors} fit={fit} />
          </>
        )}
      </group>
    </group>
  );
}

/** Memoised: hovering one floor re-renders only the two floors whose `hovered` flips. */
export default memo(FloorPlate);
