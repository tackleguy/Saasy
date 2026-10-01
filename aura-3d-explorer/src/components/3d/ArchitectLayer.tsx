"use client";
/**
 * ArchitectLayer — the Studio's Architect-mode tools inside the 3D scene.
 * -----------------------------------------------------------------------------
 *   • Drawing views — plan and four elevations through a true orthographic
 *     camera framed on the whole site (north = −Z, east = +X). Pan and zoom
 *     stay on; rotation is off (BuildingScene disables it).
 *   • Measure — click two points (building plates or the ground) for a
 *     dimension in metres with its height difference; hold Shift on the
 *     second click for a plumb (vertical) measurement; Esc cancels.
 *   • Level markers — a height dimension beside the active building with a
 *     tick and level label at each zone boundary.
 *   • Zoning envelope — the height limit as a translucent plane over the site.
 *   • Clay — a white massing-model render: every standard material is
 *     swapped for a matte clay clone (and restored when turned off).
 *
 * Overlays carry `userData.keepMaterial` (clay leaves them alone) and never
 * raycast, so they do not get in the way of floor picking or measuring.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import type { Building } from "@/types";
import { buildingHeight, explodedY, MODEL_SCALE, ZONE_ORDER, ZONES } from "@/lib/tower";
import { buildingRadius, buildingUW, PLINTH, uwToXZ, SITE_ROTATION_Y } from "@/lib/siteLayout";
import type { ArchitectSceneState, Vec3 } from "@/lib/architecture";
import { DETAIL_LAYER, RAYCAST_LAYER } from "./layers";
import { invalidateShadows } from "./staticShadows";

const noRaycast = () => null;
const INK = "#1c1b19";
const MEASURE = "#b5541c";
const LIMIT = "#b23a2a";

const fmtM = (units: number) => `${(units / MODEL_SCALE).toFixed(units / MODEL_SCALE < 100 ? 1 : 0)} m`;

/* --------------------------------------------------------------- overlays */

const SEGMENT_GEO = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2);

/** A line segment drawn as a thin always-on-top cylinder. */
function Segment({ a, b, color = INK, width = 0.12 }: { a: Vec3; b: Vec3; color?: string; width?: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), len > 1e-6 ? dir.normalize() : new THREE.Vector3(0, 0, 1));
    return { position: va, quaternion: q, length: Math.max(len, 1e-4) };
  }, [a, b]);
  return (
    <mesh geometry={SEGMENT_GEO} position={position} quaternion={quaternion} scale={[width, width, length]} renderOrder={999} raycast={noRaycast} userData={{ keepMaterial: true }}>
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent toneMapped={false} />
    </mesh>
  );
}

function Dot({ at, color = MEASURE }: { at: Vec3; color?: string }) {
  return (
    <mesh position={at} renderOrder={999} raycast={noRaycast} userData={{ keepMaterial: true }}>
      <sphereGeometry args={[0.28, 12, 8]} />
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent toneMapped={false} />
    </mesh>
  );
}

function Label({ at, children, tone = "ink" }: { at: Vec3; children: ReactNode; tone?: "ink" | "measure" | "limit" }) {
  return (
    <Html position={at} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <span
        className={
          "whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums shadow-sm " +
          (tone === "measure" ? "bg-[#b5541c] text-white" : tone === "limit" ? "bg-[#b23a2a] text-white" : "bg-paper/90 text-ink ring-1 ring-plaster")
        }
      >
        {children}
      </span>
    </Html>
  );
}

/* --------------------------------------------------------- drawing views */

function siteBounds(buildings: Building[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let h = 0;
  for (const b of buildings) {
    const r = buildingRadius(b);
    minX = Math.min(minX, b.position[0] - r);
    maxX = Math.max(maxX, b.position[0] + r);
    minZ = Math.min(minZ, b.position[1] - r);
    maxZ = Math.max(maxZ, b.position[1] + r);
    h = Math.max(h, buildingHeight(b, 0));
  }
  // Some context around the scheme.
  const pad = 25;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad, h };
}

function DrawingCamera({ state, buildings }: { state: ArchitectSceneState; buildings: Building[] }) {
  const cam = useRef<THREE.OrthographicCamera>(null);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const size = useThree((s) => s.size);

  useEffect(() => {
    const c = cam.current;
    if (!c) return;
    const { minX, maxX, minZ, maxZ, h } = siteBounds(buildings);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const far = 1200;
    let pos: Vec3;
    let target: Vec3;
    let visW: number;
    let visH: number;
    /** Half the depth kept in view for elevations: the scheme and its immediate neighbours, not the city behind. */
    let depth = 0;
    c.up.set(0, 1, 0);
    switch (state.view) {
      case "plan":
        pos = [cx, far, cz];
        target = [cx, 0, cz];
        c.up.set(0, 0, -1); // north at the top of the drawing
        visW = maxX - minX;
        visH = maxZ - minZ;
        break;
      case "north":
        pos = [cx, h / 2, cz - far];
        target = [cx, h / 2, cz];
        visW = maxX - minX;
        visH = h * 1.15;
        depth = (maxZ - minZ) / 2;
        break;
      case "south":
        pos = [cx, h / 2, cz + far];
        target = [cx, h / 2, cz];
        visW = maxX - minX;
        visH = h * 1.15;
        depth = (maxZ - minZ) / 2;
        break;
      case "east":
        pos = [cx + far, h / 2, cz];
        target = [cx, h / 2, cz];
        visW = maxZ - minZ;
        visH = h * 1.15;
        depth = (maxX - minX) / 2;
        break;
      default: // west
        pos = [cx - far, h / 2, cz];
        target = [cx, h / 2, cz];
        visW = maxZ - minZ;
        visH = h * 1.15;
        depth = (maxX - minX) / 2;
    }
    c.position.set(...pos);
    // Elevations clip to a slab around the site (like a drawing's cut depth); the plan sees down to grade.
    c.near = depth ? far - depth : 1;
    c.far = depth ? far + depth : far * 3;
    c.zoom = Math.max(0.05, Math.min(size.width / visW, size.height / visH) * 0.92);
    c.lookAt(...target);
    c.updateProjectionMatrix();
    if (controls) {
      controls.target.set(...target);
      controls.update();
    }
    invalidateShadows();
    // Re-frame on view changes and explicit requests, not on every resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.view, state.viewNonce, controls]);

  return <OrthographicCamera ref={cam} makeDefault />;
}

/* ---------------------------------------------------------------- measure */

function MeasureTool({ state }: { state: ArchitectSceneState }) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const [pending, setPendingState] = useState<Vec3 | null>(null);
  // Mirrors `pending` for the event handlers (no side effects inside state updaters).
  const pendingRef = useRef<Vec3 | null>(null);
  const setPending = (p: Vec3 | null) => {
    pendingRef.current = p;
    setPendingState(p);
  };
  const [hover, setHover] = useState<Vec3 | null>(null);
  const shift = useRef(false);
  // Same layers as pointer picking: batched buildings keep their pickable glass on RAYCAST_LAYER (see mergedStatics).
  const ray = useMemo(() => {
    const r = new THREE.Raycaster();
    r.layers.enable(RAYCAST_LAYER);
    r.layers.enable(DETAIL_LAYER);
    return r;
  }, []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const moveEvent = useRef<PointerEvent | null>(null);

  /** First surface under the pointer: a building plate or the ground catcher. */
  const pick = (e: PointerEvent): Vec3 | null => {
    const { camera, scene } = get();
    const r = gl.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // Skip the sky dome (it would catch clicks aimed above the skyline).
    const hit = ray.intersectObjects(scene.children, true).find((h) => !(h.object as THREE.Object3D & { isSky?: boolean }).isSky && h.distance < 3000);
    return hit ? [hit.point.x, hit.point.y, hit.point.z] : null;
  };
  const constrain = (p: Vec3): Vec3 => (pending && shift.current ? [pending[0], p[1], pending[2]] : p);

  useEffect(() => {
    if (!state.measuring) {
      setPending(null);
      setHover(null);
      return;
    }
    const el = gl.domElement;
    const prevCursor = el.style.cursor;
    el.style.cursor = "crosshair";
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      // A click, not an orbit/pan drag.
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      down = null;
      shift.current = e.shiftKey;
      const p = pick(e);
      if (!p) return;
      const a = pendingRef.current;
      if (!a) {
        setPending(p);
      } else {
        state.onMeasure(a, shift.current ? [a[0], p[1], a[2]] : p);
        setPending(null);
        setHover(null);
      }
    };
    const onMove = (e: PointerEvent) => {
      moveEvent.current = e;
      shift.current = e.shiftKey;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null);
      if (e.key === "Shift") shift.current = e.type === "keydown";
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      el.style.cursor = prevCursor;
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.measuring, state.onMeasure, gl]);

  // Live preview from the pending point to the cursor (one raycast per frame at most).
  useFrame(() => {
    const e = moveEvent.current;
    if (!e || !pending) return;
    moveEvent.current = null;
    const p = pick(e);
    if (p) setHover(constrain(p));
  });

  return (
    <group>
      {/* Invisible ground catcher so the street, plaza and open ground can be measured. */}
      {state.measuring && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02} userData={{ keepMaterial: true }}>
          <planeGeometry args={[2400, 2400]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
      {state.measurements.map((m) => (
        <MeasureLine key={m.id} a={m.a} b={m.b} />
      ))}
      {pending && <Dot at={pending} />}
      {pending && hover && <MeasureLine a={pending} b={hover} preview />}
    </group>
  );
}

function MeasureLine({ a, b, preview = false }: { a: Vec3; b: Vec3; preview?: boolean }) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const dh = b[1] - a[1];
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const plumb = Math.abs(dh) > d * 0.999;
  return (
    <group>
      <Segment a={a} b={b} color={MEASURE} width={preview ? 0.08 : 0.12} />
      <Dot at={a} />
      <Dot at={b} />
      <Label at={mid} tone="measure">
        {fmtM(d)}
        {!plumb && Math.abs(dh) / MODEL_SCALE >= 0.5 && ` · Δh ${dh > 0 ? "+" : "−"}${fmtM(Math.abs(dh))}`}
      </Label>
    </group>
  );
}

/* ---------------------------------------------------------- level markers */

function LevelMarkers({ building, explosion }: { building: Building; explosion: number }) {
  const r = buildingRadius(building);
  // Beside the building, on the corner that faces the default camera.
  const off = (r + 3) * Math.SQRT1_2;
  const x = building.position[0] + off;
  const z = building.position[1] + off;
  const top = buildingHeight(building, explosion);
  const ticks = useMemo(() => {
    const out: { y: number; label: string }[] = [{ y: 0, label: "±0.00 Grade" }];
    for (const zone of ZONE_ORDER) {
      const fl = building.floors.filter((f) => f.zone === zone);
      if (!fl.length) continue;
      const last = fl[fl.length - 1];
      const y = explodedY(last, explosion) + last.height;
      out.push({ y, label: `${ZONES[zone].short} · L${last.number} · +${(y / MODEL_SCALE).toFixed(1)} m` });
    }
    return out;
  }, [building, explosion]);

  return (
    <group>
      <Segment a={[x, 0, z]} b={[x, top, z]} />
      {ticks.map((t, i) => (
        <group key={i}>
          <Segment a={[x - 1.2, t.y, z - 1.2]} b={[x + 1.2, t.y, z + 1.2]} />
          <Label at={[x + 2.2, t.y, z + 2.2]}>{t.label}</Label>
        </group>
      ))}
      <Label at={[x, top + 3, z]}>{`H ${fmtM(top)}${explosion > 0 ? " (exploded)" : ""}`}</Label>
    </group>
  );
}

/* --------------------------------------------------------- zoning envelope */

function HeightLimit({ limitM, buildings }: { limitM: number; buildings: Building[] }) {
  const y = limitM * MODEL_SCALE;
  // The plot, grown to take in any building moved off it on the site map.
  const rect = useMemo(() => {
    let { u0, u1, w0, w1 } = PLINTH;
    for (const b of buildings) {
      const [u, w] = buildingUW(b);
      const r = buildingRadius(b) + 3;
      u0 = Math.min(u0, u - r);
      u1 = Math.max(u1, u + r);
      w0 = Math.min(w0, w - r);
      w1 = Math.max(w1, w + r);
    }
    return { u0, u1, w0, w1 };
  }, [buildings]);
  const [cx, cz] = uwToXZ((rect.u0 + rect.u1) / 2, (rect.w0 + rect.w1) / 2);
  const corners = ([[rect.u0, rect.w0], [rect.u1, rect.w0], [rect.u1, rect.w1], [rect.u0, rect.w1]] as [number, number][]).map(([u, w]) => {
    const [px, pz] = uwToXZ(u, w);
    return [px, y, pz] as Vec3;
  });
  return (
    <group>
      <mesh position={[cx, y, cz]} rotation={[-Math.PI / 2, 0, SITE_ROTATION_Y]} raycast={noRaycast} renderOrder={5} userData={{ keepMaterial: true }}>
        <planeGeometry args={[rect.u1 - rect.u0, rect.w1 - rect.w0]} />
        <meshBasicMaterial color={LIMIT} transparent opacity={0.13} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      {corners.map((c, i) => (
        <Segment key={i} a={c} b={corners[(i + 1) % 4]} color={LIMIT} width={0.1} />
      ))}
      <Label at={corners[2]} tone="limit">{`Height limit +${limitM} m`}</Label>
    </group>
  );
}

/* ------------------------------------------------------------------- clay */

const CLAY = new THREE.Color("#eeebe5");

function ClayModel({ enabled }: { enabled: boolean }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!enabled) return;
    const clones = new Map<THREE.Material, THREE.Material>();
    const clayOf = (m: THREE.Material) => {
      if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial)) return m;
      let c = clones.get(m);
      if (!c) {
        c = new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.9, metalness: 0, side: m.side, clippingPlanes: m.clippingPlanes });
        clones.set(m, c);
      }
      return c;
    };
    const apply = () => {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.keepMaterial || mesh.userData.clayOriginal) return;
        mesh.userData.clayOriginal = mesh.material;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clayOf) : clayOf(mesh.material);
      });
      invalidateShadows();
    };
    apply();
    // Meshes that mount later (furniture, a new city) are swapped on the next pass.
    const t = setInterval(apply, 700);
    return () => {
      clearInterval(t);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.userData.clayOriginal) {
          mesh.material = mesh.userData.clayOriginal;
          delete mesh.userData.clayOriginal;
        }
      });
      clones.forEach((c) => c.dispose());
      invalidateShadows();
    };
  }, [enabled, scene]);
  return null;
}

/* ------------------------------------------------------------------ layer */

interface Props {
  state: ArchitectSceneState;
  buildings: Building[];
  building: Building;
  explosion: number;
}

export default function ArchitectLayer({ state, buildings, building, explosion }: Props) {
  return (
    <group>
      {state.view !== "perspective" && <DrawingCamera state={state} buildings={buildings} />}
      <MeasureTool state={state} />
      {/* Level markers read in perspective and elevations; seen from above they would stack up. */}
      {state.dimensions && state.view !== "plan" && <LevelMarkers building={building} explosion={explosion} />}
      {state.heightLimitM !== null && <HeightLimit limitM={state.heightLimitM} buildings={buildings} />}
      <ClayModel enabled={state.clay} />
    </group>
  );
}
