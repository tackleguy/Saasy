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
 * An `importedModel` (normalised CAD import) replaces the procedural tower on
 * the plot it was imported onto, and the hero camera frames its real height.
 * Loaded with `next/dynamic({ ssr: false })` because Three.js needs `window`.
 */
import { Suspense, useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import type { Building, BuildingId, FloorData } from "@/types";
import { buildingHeight, explodedY, floorCentre } from "@/lib/tower";
import type { PhotoAngle, Quality } from "@/lib/explorer";
import { uwToXZ } from "@/lib/siteLayout";
import { getCityPreset, type CityId } from "@/lib/cityPresets";
import { DEFAULT_FIT, type FloorFit } from "@/lib/apartmentFit";
import { useCinematicCamera as useCameraTween, type CameraGoal, type Vec3 } from "./environment/useCinematicCamera";
import { CinematicContext, SUN, type SunPreset, type Tier } from "./environment/settings";
import Telemetry from "./environment/Telemetry";
import ProceduralBuilding from "./ProceduralBuilding";
import LightingEnvironment from "./LightingEnvironment";
import SiteContext, { type SiteEdits } from "./SiteContext";
import PostEffects from "./PostEffects";
import WalkControls, { type LiftLink } from "./WalkControls";
import ImportedModel from "./ImportedModel";
import LibraryModel from "./LibraryModel";
import SketchfabCityCredits from "./SketchfabCityCredits";
import { libraryModel } from "@/lib/modelLibrary";
import { MODEL_SCALE } from "@/lib/tower";
import ArchitectLayer from "./ArchitectLayer";
import type { ArchitectSceneState } from "@/lib/architecture";
import { consumeShadowUpdate, invalidateShadows, SHADOW_SETTLE_MS } from "./staticShadows";
import { DETAIL_LAYER, RAYCAST_LAYER } from "./layers";

/** Camera offset from a focused floor:  P_camera = P_floor + [8, 4, 8]. */
export const FOCUS_OFFSET: Vec3 = [8, 4, 8];

/** Hero overview direction: across the water, from a slightly low angle. */
const OVERVIEW_DIRECTION: Vec3 = [1, 0.22, 1];


/** Screen-frame (u, w) of a building from its world position. */
function buildingUW(b: Building): [number, number] {
  const [x, z] = b.position;
  return [(x - z) * Math.SQRT1_2, (x + z) * Math.SQRT1_2];
}

/** Camera pose for a photo-angle preset, relative to the active building; `siteH` = tallest building on site. */
function photoPose(angle: PhotoAngle | "crown", b: Building, explosion: number, siteH: number): { position: Vec3; target: Vec3 } {
  const [bu, bw] = buildingUW(b);
  const h = buildingHeight(b, explosion);
  const at = (u: number, w: number, y: number): Vec3 => {
    const [x, z] = uwToXZ(u, w);
    return [x, y, z];
  };
  const target = (y: number): Vec3 => [b.position[0], y, b.position[1]];
  switch (angle) {
    case "crown":
      return { position: at(bu + 14, bw + 19, h + 5), target: target(h - 2) };
    case "street": // pedestrian across the road on the far sidewalk, looking up at the podium and tower
      return { position: at(bu - 26, 28.5, 0.5), target: target(h * 0.5) };
    case "waterfront": // from a boat on the water (a supertall behind may crop — that's the photo)
      return { position: at(bu + 8, Math.max(90,h*2.4), 2.2), target: target(h * 0.42) };
    case "aerial":
      return { position: at(bu - h*.7 - 25, bw + h*1.4 + 25, h*1.4 + 15), target: target(h * 0.22) };
    case "podium": // close to the arcade
      return { position: at(bu + 5, bw + 13.5, 0.55), target: target(1.1) };
    case "skyline": // far out on the water, the whole skyline (tallest tower included) in frame
      return { position: at(bu * 0.5 + 40, 120 + siteH * 1.6, 2.5), target: [0, siteH * 0.4, 0] };
    case "drone": // high oblique over the city
      return { position: at(-120, 110 + siteH * 0.6, 60 + siteH * 1.1), target: [0, siteH * 0.25, 0] };
  }
}

interface Props {
  showPresentationControls?: boolean;
  contextModel?: string | null;
  buildings: Building[];
  activeBuildingId: BuildingId;
  explosion: number;
  selectedIndex: number | null;
  xray: boolean;
  /** Section cutaway through the active building. */
  section?: boolean;
  /** Select a floor (in any building), or clear the selection with null. */
  onSelect: (floor: FloorData | null) => void;
  /** Increment to snap back to the default hero view. */
  resetNonce: number;
  /** First-person walk-through of the selected floor. */
  walking: boolean;
  viewIndex: number;
  viewNonce: number;
  /** Lift plumbing for the walk-through (useExplorer().lift). */
  lift?: LiftLink;
  quality: Quality;
  /** Called when the frame rate stays low, so the parent can drop to Low. */
  onPerformanceDecline?: () => void;
  photoAngle: PhotoAngle | "crown" | null;
  photoNonce: number;
  /** Receives a function that exports the current view as a 2× PNG. */
  captureRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** Play the eye-level dolly-out opening shot. */
  intro?: boolean;
  /** City backdrop (lib/cityPresets). */
  city?: CityId;
  /** Context edits for buildings moved on the site map. */
  siteEdits?: SiteEdits;
  /** Freeze the camera goal (a building is being dragged on the site map). */
  cameraHold?: boolean;
  /** Imported CAD model (lib/importNormalize) shown in place of its building's procedural tower. */
  importedModel?: THREE.Object3D | null;
  /** Studio Architect mode: drawing views, measure, levels, sun study, zoning, clay (see ArchitectLayer). */
  architect?: ArchitectSceneState;
  /** Room plan and furniture of the isolated floor. */
  fit?: FloorFit;
}

/** Translates app state into a camera goal and hands it to the GSAP tween hook. */
function CameraRig({
  building,
  siteH,
  explosion,
  selectedIndex,
  resetNonce,
  walking,
  photoAngle,
  photoNonce,
  intro,
  heightOverride,
  hold = false,
}: {
  building: Building;
  /** Height of the tallest building on the site (un-exploded). */
  siteH: number;
  explosion: number;
  selectedIndex: number | null;
  resetNonce: number;
  walking: boolean;
  photoAngle: PhotoAngle | "crown" | null;
  photoNonce: number;
  intro: boolean;
  /** Frame this height instead of the procedural tower's (imported model). */
  heightOverride?: number;
  /** Keep the current goal (a building is being dragged on the site map); ease to the new one on release. */
  hold?: boolean;
}) {
  const h = heightOverride ?? buildingHeight(building, explosion);
  let goal: CameraGoal;
  if (selectedIndex !== null) {
    goal = { kind: "focus", target: floorCentre(building, building.floors[selectedIndex], explosion), offset: FOCUS_OFFSET };
  } else if (photoAngle) {
    goal = { kind: "pose", ...photoPose(photoAngle, building, explosion, siteH) };
  } else {
    // Hero view: across the water, far enough back to keep the neighbours in frame.
    goal = {
      kind: "overview",
      target: [building.position[0] * 0.6, h * 0.42, building.position[1] * 0.6],
      distance: Math.max(h * 1.25 + 40, 96),
      resetDirection: OVERVIEW_DIRECTION,
    };
  }
  const held = useRef<CameraGoal | null>(null);
  if (hold && held.current) goal = held.current;
  else held.current = goal;
  // Opening shot: eye height (1.6 m) at the water's edge, then dolly out.
  const [ix, iz] = uwToXZ(20, Math.max(150, h * 2));
  useCameraTween(goal, {
    nonce: resetNonce + photoNonce * 1000,
    enabled: !walking,
    intro: intro ? { position: [ix, 0.45, iz], target: [building.position[0], h * 0.55, building.position[1]], duration: 4 } : undefined,
  });
  return null;
}

/**
 * Keeps the orbit camera above the ground. OrbitControls' polar-angle clamp
 * would instead lift any camera placed below its target (every eye-level
 * photo angle), so the polar limit is left open and the height is clamped.
 */
function GroundClamp() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (camera.position.y < 0.35) camera.position.y = 0.35;
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
    let capturing = false;
    captureRef.current = async () => {
      if (capturing) return;
      capturing = true;
      const prev = gl.getPixelRatio();
      try {
      setDpr(Math.min(prev * 2, 4));
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      for (let i = 0; i < 4; i++) await frame();
      const canvas = document.createElement("canvas");
      canvas.width = gl.domElement.width; canvas.height = gl.domElement.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(gl.domElement, 0, 0);
      ctx.font = `${Math.max(18, canvas.width * 0.013)}px Georgia`;
      ctx.fillStyle = "#C7A66C"; ctx.textAlign = "right";
      ctx.fillText("A U R A", canvas.width - 36, canvas.height - 32);
      const url = canvas.toDataURL("image/png");
      setDpr(prev);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aura-render-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      a.click();
      } finally { setDpr(prev); capturing = false; }
    };
    return () => {
      captureRef.current = null;
    };
  }, [gl, setDpr, captureRef]);
  return null;
}

/**
 * Static shadow map (see ./staticShadows): turns off per-frame shadow
 * rendering and redraws the map only on the main camera's render when
 * something that casts shadows changed. Every value in `deps` that can move a
 * shadow caster re-arms a SHADOW_SETTLE_MS window so eased transitions shadow
 * correctly while they move.
 */
function StaticShadows({ deps }: { deps: unknown[] }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const get = useThree((s) => s.get);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    invalidateShadows(SHADOW_SETTLE_MS);
    const prev = scene.onBeforeRender;
    // Runs inside gl.render() just before three draws the shadow maps.
    scene.onBeforeRender = function (...args) {
      prev.apply(this, args);
      if (args[2] === get().camera && consumeShadowUpdate()) gl.shadowMap.needsUpdate = true;
    };
    return () => {
      scene.onBeforeRender = prev;
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl, scene, get]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => invalidateShadows(SHADOW_SETTLE_MS), deps);
  return null;
}

/**
 * The main camera also sees DETAIL_LAYER (small per-floor parts: lift doors,
 * ceilings, balcony furniture, outlines…). Off-screen cameras — the water's
 * planar reflection — only see layer 0, so they skip those draws.
 */
function CameraLayers() {
  const camera = useThree((s) => s.camera);
  const raycaster = useThree((s) => s.raycaster);
  useEffect(() => {
    camera.layers.enable(DETAIL_LAYER);
  }, [camera]);
  // Pointer picking also hits glass parked on RAYCAST_LAYER while its building is batched.
  useEffect(() => {
    raycaster.layers.enable(RAYCAST_LAYER);
  }, [raycaster]);
  return null;
}

/**
 * The isolated floor's warm indirect light. One light, always mounted (at
 * intensity 0 when nothing is isolated): adding or removing a light changes
 * every shader's light count, which recompiles all programs on site.
 */
function InteriorLight({ building, floor, explosion }: { building: Building; floor: FloorData | null; explosion: number }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((_, dt) => {
    const l = light.current;
    if (!l) return;
    const k = 1 - Math.pow(0.0008, dt);
    l.intensity = THREE.MathUtils.lerp(l.intensity, floor ? 3 : 0, k);
    if (l.intensity < 1e-3) l.intensity = 0;
    if (!floor) return;
    l.distance = Math.max(floor.width, floor.depth);
    const y = explodedY(floor, explosion) + floor.height * 0.85;
    l.position.set(building.position[0], THREE.MathUtils.lerp(l.position.y, y, k), building.position[1]);
  });
  return <pointLight ref={light} color="#ffd9a8" intensity={0} decay={1.6} />;
}

function Dock({host,focused,timeLabel,children}:{host:HTMLElement|null;focused:boolean;timeLabel:string;children:import("react").ReactNode}) {
  if(focused) return <details style={{position:"absolute",right:12,bottom:16,zIndex:30,maxWidth:"calc(100% - 24px)",background:"#111620",color:"#E8DCC6",border:"1px solid #5c503c",borderRadius:6}}><summary aria-label="Scene presentation settings" style={{cursor:"pointer",padding:"10px 12px",fontSize:12}}>Sun · {timeLabel}</summary>{children}</details>;
  return host ? createPortal(children,host) : children;
}
function LoadingSignal({onChange}:{onChange:(loading:boolean)=>void}) {
  useEffect(()=>{onChange(true);return()=>onChange(false);},[onChange]);
  return null;
}
function SceneReady({onChange}:{onChange:(loading:boolean)=>void}) {
  useEffect(()=>onChange(false),[onChange]);return null;
}
function PreparingSite() {
  return <div role="status" style={{position:"absolute",inset:0,display:"grid",placeContent:"center",gap:12,color:"#D6B87C",background:"#10141D",textAlign:"center",pointerEvents:"none"}}><svg className="animate-spin motion-reduce:animate-none" style={{margin:"auto"}} width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="#35312A" strokeWidth="2"/><circle cx="16" cy="16" r="13" fill="none" stroke="#D6B87C" strokeWidth="2" strokeDasharray="55 82"/></svg><p>Preparing site…</p></div>;
}
function IdleOrbit({enabled}:{enabled:boolean}) {
  const controls = useThree(s=>s.controls) as import("three-stdlib").OrbitControls | null;
  const last = useRef(performance.now());
  const down = useRef(false);
  useEffect(()=>{
    const wake=()=>{last.current=performance.now();if(controls)controls.autoRotate=false;};
    const start=()=>{down.current=true;wake();}; const end=()=>{down.current=false;wake();};
    window.addEventListener("pointerdown",start);window.addEventListener("pointerup",end);window.addEventListener("pointercancel",end);
    window.addEventListener("wheel",wake,{passive:true});window.addEventListener("keydown",wake);
    return ()=>{window.removeEventListener("pointerdown",start);window.removeEventListener("pointerup",end);window.removeEventListener("pointercancel",end);window.removeEventListener("wheel",wake);window.removeEventListener("keydown",wake);if(controls)controls.autoRotate=false;};
  },[controls]);
  useFrame(()=>{if(controls){controls.autoRotate=enabled&&!down.current&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&performance.now()-last.current>20000;controls.autoRotateSpeed=0.12;}});
  return null;
}

/** Default when a caller doesn't wire the lift (no rides, no-op callbacks). */
const NO_LIFT: LiftLink = { ride: { target: -1, nonce: 0 }, arrival: { index: -1, nonce: 0 }, onInside: () => {}, onFloor: () => {}, onArrive: () => {} };

export default function BuildingScene({
  buildings,
  activeBuildingId,
  explosion,
  selectedIndex,
  xray,
  section = false,
  onSelect,
  resetNonce,
  walking,
  viewIndex,
  viewNonce,
  lift = NO_LIFT,
  quality,
  onPerformanceDecline,
  photoAngle,
  photoNonce,
  captureRef,
  intro = true,
  city = "generic",
  siteEdits,
  cameraHold = false,
  importedModel = null,
  architect,
  fit = DEFAULT_FIT,
  contextModel,
  showPresentationControls = true,
}: Props) {
  const [loading, setLoading] = useState(true);
  const dockAnchor = useRef<HTMLSpanElement>(null);
  const [dockHost, setDockHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setDockHost(dockAnchor.current?.closest("section")?.querySelector('button[aria-label="Site map"]')?.closest<HTMLElement>(".overlay") ?? null);
  }, [showPresentationControls, walking]);
  const [time, setTime] = useState<SunPreset>(() => {
    const q = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("sun");
    return q && q in SUN ? q as SunPreset : "golden";
  });
  const [override, setOverride] = useState<Tier | "auto">("auto");
  const [automatic, setAutomatic] = useState<Tier>(quality);
  const tier = override === "auto" ? automatic : override;
  const [legacy, setLegacy] = useState(false);
  const [localAngle, setLocalAngle] = useState<PhotoAngle | "crown" | null>(null);
  const [localNonce, setLocalNonce] = useState(0);
  useEffect(()=>{setLocalAngle(null);},[photoNonce,resetNonce]);
  useEffect(()=>{setAutomatic(quality);},[quality]);
  const asset = contextModel ? libraryModel(contextModel) : undefined;
  const [hovered, setHovered] = useState<FloorData | null>(null);
  // Ignore frame-rate dips during the first seconds (shader compile, HDR decode).
  const mountedAt = useRef(0);
  useEffect(() => void (mountedAt.current = performance.now()), []);
  const handleDecline = useCallback(() => {
    if (performance.now() - mountedAt.current > 10000 && override === "auto") setAutomatic(t => t === "high" ? "medium" : "low");
  }, [override]);
  const building = buildings.find((b) => b.id === activeBuildingId) ?? buildings[0];
  const high = tier === "high";
  const preset = getCityPreset(city);
  // The imported model stands on the plot it was imported onto (tagged by useExplorer).
  const importedOn: BuildingId | null = importedModel ? (importedModel.userData.buildingId as BuildingId | undefined) ?? activeBuildingId : null;
  const importedBuilding = importedOn ? buildings.find((b) => b.id === importedOn) ?? null : null;

  // Architect mode: orthographic drawing views take over the camera; the measure tool takes clicks.
  const drawingView = !!architect && architect.view !== "perspective";
  const measuring = !!architect?.measuring;

  // Clicking the selected floor again releases it.
  const handleSelect = useCallback(
    (floor: FloorData) => {
      if (walking) return; // clicks while walking are look-drags, not selections
      if (measuring) return; // clicks place measure points
      const same = floor.buildingId === activeBuildingId && floor.index === selectedIndex;
      onSelect(same ? null : floor);
    },
    [onSelect, activeBuildingId, selectedIndex, walking, measuring]
  );

  // Depth of field focuses on the isolated floor (not while walking inside it).
  const focus = selectedIndex !== null && !walking ? floorCentre(building, building.floors[selectedIndex], explosion) : null;

  return (
    <CinematicContext.Provider value={{time,tier,legacy}}>
    <span ref={dockAnchor} hidden />
    <Canvas
      shadows="percentage"
      dpr={high ? [1, 2] : tier === "medium" ? 1.5 : 1}
      camera={{ position: [70, 22, 70], fov: 38, near: 0.1, far: 5000 }}
      gl={{
        localClippingEnabled: true,
        antialias: !high, // the composer does its own multisampling
        preserveDrawingBuffer: true, // lets "Capture render" read the last frame
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
        powerPreference: "high-performance",
      }}
      onPointerMissed={() => !walking && !measuring && onSelect(null)}
      className="!absolute inset-0"
    >
      {/* Auto-detect weak devices: sustained low FPS asks the parent to drop to Low */}
      <PerformanceMonitor onDecline={handleDecline} />
      <Suspense fallback={<LoadingSignal onChange={setLoading} />} >
      <SceneReady onChange={setLoading} />
      <CameraLayers />
      <Telemetry tier={tier} />
      <StaticShadows
        deps={[buildings, activeBuildingId, explosion, selectedIndex, xray, section, walking, quality, tier, city, siteEdits, importedModel, lift.ride.nonce, lift.arrival.nonce]}
      />

      <LightingEnvironment quality={quality} preset={preset} sun={architect?.sun ?? null} noFog={drawingView} extent={Math.max(45,...buildings.map(b=>buildingHeight(b,explosion)+Math.hypot(...b.position)))} />
      <SiteContext quality={quality} preset={preset} edits={siteEdits} buildings={buildings} />
      {asset && <group position={asset.category === "skylines" ? [0, 0, -180] : [30, 0, -30]} scale={MODEL_SCALE}>
        <LibraryModel model={asset} />
      </group>}
      {importedModel && importedBuilding && <ImportedModel object={importedModel} position={importedBuilding.position} />}
      {buildings.map((b) => {
        const active = b.id === activeBuildingId;
        if (importedBuilding && b.id === importedBuilding.id) return null;
        return (
          <ProceduralBuilding
            key={b.id}
            building={b}
            active={active}
            explosion={active ? explosion : 0}
            selectedIndex={active ? selectedIndex : null}
            hovered={hovered}
            xray={xray}
            section={section && active}
            walking={walking && active}
            onSelect={handleSelect}
            onHover={setHovered}
            fit={active ? fit : DEFAULT_FIT}
          />
        );
      })}

      <InteriorLight
        building={building}
        floor={selectedIndex !== null && !(importedOn && importedOn === building.id) ? building.floors[selectedIndex] ?? null : null}
        explosion={explosion}
      />
      {walking && selectedIndex !== null && (
        <WalkControls building={building} floor={building.floors[selectedIndex]} explosion={explosion} viewIndex={viewIndex} viewNonce={viewNonce} lift={lift} fit={fit} />
      )}
      <OrbitControls enabled={!walking} enableRotate={!drawingView} makeDefault enableDamping dampingFactor={0.08} minDistance={2} maxDistance={drawingView ? 5000 : 320} maxPolarAngle={Math.PI - 0.08} />
      <IdleOrbit enabled={!walking && !drawingView && selectedIndex === null && !cameraHold} />
      {!walking && <GroundClamp />}
      <CameraRig
        building={building}
        siteH={Math.max(...buildings.map((b) => buildingHeight(b, 0)))}
        explosion={explosion}
        selectedIndex={selectedIndex}
        resetNonce={resetNonce}
        walking={walking || drawingView}
        photoAngle={localAngle ?? photoAngle}
        photoNonce={photoNonce + localNonce}
        intro={intro}
        heightOverride={importedModel && importedOn === building.id ? (importedModel.userData.heightUnits as number | undefined) : undefined}
        hold={cameraHold}
      />
      {architect && <ArchitectLayer state={architect} buildings={buildings} building={building} explosion={explosion} />}
      {captureRef && <CaptureBridge captureRef={captureRef} />}
      {tier !== "low" && <PostEffects focus={high ? focus : null} />}
      </Suspense>
    </Canvas>
    {loading && <PreparingSite />}
    {(showPresentationControls || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("graphics")==="1")) && !walking && <Dock host={dockHost} focused={selectedIndex!==null} timeLabel={SUN[time].label}><div data-cinematic-dock role="group" aria-label="Scene presentation" style={{position:dockHost||selectedIndex!==null?"relative":"absolute",right:dockHost||selectedIndex!==null?undefined:12,top:dockHost||selectedIndex!==null?undefined:12,zIndex:dockHost?undefined:30,display:"flex",flexWrap:"wrap",gap:8,maxWidth:dockHost||selectedIndex!==null?"100%":"min(560px,calc(100% - 24px))",padding:"8px 10px",background:"#111620ee",border:"1px solid #5c503c",borderRadius:6,color:"#E8DCC6",fontSize:11}}>
      <label>Sun <select aria-label="Sun" value={time} onChange={e=>setTime(e.target.value as SunPreset)} style={{background:"#111620",color:"#E8DCC6",border:0,padding:5}}>{Object.entries(SUN).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select></label>
      <label>Quality <select aria-label="Scene quality" value={override} onChange={e=>setOverride(e.target.value as Tier|"auto")} style={{background:"#111620",color:"#E8DCC6",border:0,padding:5}}><option value="auto">Auto · {tier}</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
      <label>Context <select aria-label="Site context" value={legacy?"existing":"cinematic"} onChange={e=>setLegacy(e.target.value==="existing")} style={{background:"#111620",color:"#E8DCC6",border:0,padding:5}}><option value="cinematic">Cinematic</option><option value="existing">Existing city</option></select></label>
      <label>Photo <select aria-label="Photo angle" value={localAngle??""} onChange={e=>{onSelect(null);setLocalAngle(e.target.value as PhotoAngle|"crown");setLocalNonce(n=>n+1);}} style={{background:"#111620",color:"#E8DCC6",border:0,padding:5}}><option value="" disabled>Choose angle</option>{["street","waterfront","aerial","podium","crown"].map(a=><option key={a} value={a}>{a[0].toUpperCase()+a.slice(1)}</option>)}</select></label>
      {captureRef&&<button onClick={()=>void captureRef.current?.()} style={{color:"#D6B87C",padding:5}} aria-label="Capture cinematic PNG">Capture</button>}
      {!legacy&&<SketchfabCityCredits/>}
    </div></Dock>}
    </CinematicContext.Provider>
  );
}
