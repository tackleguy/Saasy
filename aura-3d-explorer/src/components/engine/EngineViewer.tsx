"use client";
/**
 * EngineViewer — renders an AuraScene in React Three Fiber.
 * -----------------------------------------------------------------------------
 *   • Floors   one shape per room polygon, textured by flooring type
 *   • Walls    each room edge as a slab inset into the room (neighbouring rooms
 *              meet back-to-back), split around door openings; cutaway or
 *              full ceiling height
 *   • Furniture  catalog stand-ins, batched into InstancedMeshes by
 *              (geometry, material) — a furnished apartment is ~25 draw calls
 * Click a floor to select its room.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Environment, Html, OrbitControls } from "@react-three/drei";
import type { AuraScene, FlooringType } from "@/lib/engine/types";
import { centroid, edges as polyEdges, type Poly } from "@/lib/engine/geometry";
import { getGeometries, getMaterials, type GeoKey, type MatKey } from "@/components/3d/furniture/kit";
import { fabricTexture, marbleTexture, plasterTexture, stoneTexture, woodTexture } from "@/components/3d/textures";
import { buildPiece } from "./pieces";

const WALL_T = 0.1;
const CUTAWAY_H = 1.15;
const DOOR_H = 2.1;

interface Props {
  scene: AuraScene;
  openings: [number, number, number, number][];
  cutaway: boolean;
  labels: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

/* ------------------------------------------------------------------ floors */

const floorMats = new Map<FlooringType, THREE.MeshStandardMaterial>();
function floorMaterial(t: FlooringType): THREE.MeshStandardMaterial {
  let m = floorMats.get(t);
  if (m) return m;
  const tex = (src: THREE.Texture, perMetre: number) => {
    const c = src.clone();
    c.needsUpdate = true;
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(perMetre, perMetre);
    return c;
  };
  switch (t) {
    case "hardwood":
      m = new THREE.MeshStandardMaterial({ map: tex(woodTexture("#c9a57a", "#8b6a48", 7), 0.45), roughness: 0.55 });
      break;
    case "carpet":
      m = new THREE.MeshStandardMaterial({ map: tex(fabricTexture("#d9cfc0"), 1.5), roughness: 1 });
      break;
    case "marble":
      m = new THREE.MeshStandardMaterial({ map: tex(marbleTexture(), 0.5), roughness: 0.2 });
      break;
    case "tile":
      m = new THREE.MeshStandardMaterial({ map: tex(stoneTexture(), 0.6), color: "#efe9df", roughness: 0.45 });
      break;
  }
  floorMats.set(t, m);
  return m;
}

function shapeOf(poly: Poly) {
  // ShapeGeometry lies in XY; rotated −90° about X, shape (x, y) → world (x, 0, −y).
  const s = new THREE.Shape();
  poly.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function Floor({ poly, type, selected, onClick }: { poly: Poly; type: FlooringType; selected: boolean; onClick: () => void }) {
  const geo = useMemo(() => shapeOf(poly), [poly]);
  const mat = useMemo(() => {
    const base = floorMaterial(type);
    if (!selected) return base;
    const m = base.clone();
    m.emissive = new THREE.Color("#c9a24a");
    m.emissiveIntensity = 0.28;
    return m;
  }, [type, selected]);
  return (
    <mesh
      geometry={geo}
      material={mat}
      rotation-x={-Math.PI / 2}
      position-y={0.001}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
}

/* ------------------------------------------------------------------- walls */

interface WallPiece {
  c: [number, number, number];
  len: number;
  h: number;
  rot: number;
}

/** Wall slabs for one room, with gaps where openings run along an edge. */
function roomWalls(poly: Poly, height: number, cutaway: boolean, openings: [number, number, number, number][]): WallPiece[] {
  const out: WallPiece[] = [];
  const h = cutaway ? Math.min(CUTAWAY_H, height) : height;
  for (const e of polyEdges(poly)) {
    // Openings lying on this edge → [u0, u1] intervals along it.
    const gaps: [number, number][] = [];
    for (const [x1, z1, x2, z2] of openings) {
      const off = (x: number, z: number) => Math.abs((x - e.a[0]) * e.n[0] + (z - e.a[1]) * e.n[1]);
      if (off(x1, z1) > 0.25 || off(x2, z2) > 0.25) continue;
      const u = (x: number, z: number) => (x - e.a[0]) * e.t[0] + (z - e.a[1]) * e.t[1];
      const a = Math.max(0, Math.min(u(x1, z1), u(x2, z2)));
      const b = Math.min(e.length, Math.max(u(x1, z1), u(x2, z2)));
      if (b - a > 0.3) gaps.push([a, b]);
    }
    gaps.sort((p, q) => p[0] - q[0]);
    const solid: [number, number][] = [];
    let cur = 0;
    for (const [a, b] of gaps) {
      if (a > cur + 0.01) solid.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < e.length - 0.01) solid.push([cur, e.length]);
    const rot = Math.atan2(-e.t[1], e.t[0]);
    const at = (u: number, y: number, hh: number, l: number): WallPiece => ({
      c: [e.a[0] + e.t[0] * u + e.n[0] * (WALL_T / 2), y + hh / 2, e.a[1] + e.t[1] * u + e.n[1] * (WALL_T / 2)],
      len: l,
      h: hh,
      rot,
    });
    for (const [a, b] of solid) out.push(at((a + b) / 2, 0, h, b - a));
    // Door heads over openings when the walls are full height.
    if (!cutaway && height > DOOR_H + 0.05) for (const [a, b] of gaps) out.push(at((a + b) / 2, DOOR_H, height - DOOR_H, b - a));
  }
  return out;
}

function Walls({ scene, openings, cutaway }: { scene: AuraScene; openings: Props["openings"]; cutaway: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const pieces = useMemo(() => scene.rooms.flatMap((r) => roomWalls(r.polygon, r.ceilingHeight, cutaway, openings)), [scene, openings, cutaway]);
  const material = useMemo(() => {
    const w = scene.materials.defaultWall;
    return new THREE.MeshStandardMaterial({ color: w.color, roughness: w.roughness, map: plasterTexture(w.color) });
  }, [scene.materials.defaultWall]);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    pieces.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(...p.c), q, new THREE.Vector3(p.len, p.h, WALL_T)));
    });
    m.count = pieces.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [pieces]);

  if (!pieces.length) return null;
  return <instancedMesh key={pieces.length} ref={ref} args={[geometry, material, pieces.length]} castShadow receiveShadow raycast={() => null} />;
}

/* --------------------------------------------------------------- furniture */

interface Batch {
  key: string;
  geo: GeoKey;
  mat: MatKey;
  matrices: THREE.Matrix4[];
}

function furnitureBatches(scene: AuraScene): Batch[] {
  const map = new Map<string, Batch>();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const room of scene.rooms) {
    for (const f of room.furniture) {
      const item = new THREE.Matrix4().compose(
        new THREE.Vector3(f.position[0], f.position[1], f.position[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(f.rotation[0], f.rotation[1], f.rotation[2])),
        new THREE.Vector3(f.scale[0], f.scale[1], f.scale[2])
      );
      for (const p of buildPiece(f.modelId)) {
        const k = `${p.g}|${p.m}`;
        let b = map.get(k);
        if (!b) map.set(k, (b = { key: k, geo: p.g, mat: p.m, matrices: [] }));
        q.setFromAxisAngle(up, p.r ?? 0);
        const local = new THREE.Matrix4().compose(new THREE.Vector3(...p.p), q, new THREE.Vector3(...p.s));
        b.matrices.push(item.clone().multiply(local));
      }
    }
  }
  return [...map.values()];
}

function BatchMesh({ batch }: { batch: Batch }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    batch.matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [batch]);
  const transparent = batch.mat === "glass" || batch.mat === "water";
  return (
    <instancedMesh
      ref={ref}
      args={[getGeometries()[batch.geo], getMaterials()[batch.mat], batch.matrices.length]}
      castShadow={!transparent && batch.mat !== "lamp"}
      receiveShadow
      raycast={() => null}
    />
  );
}

function Furniture({ scene }: { scene: AuraScene }) {
  const batches = useMemo(() => furnitureBatches(scene), [scene]);
  return (
    <group>
      {batches.map((b) => (
        <BatchMesh key={`${b.key}:${b.matrices.length}`} batch={b} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------- scene */

function planBounds(scene: AuraScene) {
  const pts = scene.rooms.flatMap((r) => r.polygon);
  if (!pts.length) return { cx: 0, cz: 0, size: 10 };
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, size: Math.max(maxX - minX, maxZ - minZ, 4) };
}

export default function EngineViewer({ scene, openings, cutaway, labels, selected, onSelect }: Props) {
  const b = useMemo(() => planBounds(scene), [scene]);
  const camPos: [number, number, number] = [b.cx + b.size * 0.6, b.size * 1.3, b.cz + b.size * 1.2];
  const shadowExtent = b.size * 0.8;

  return (
    <Canvas
      key={`${b.cx.toFixed(2)}:${b.cz.toFixed(2)}:${b.size.toFixed(2)}`}
      shadows
      dpr={[1, 2]}
      camera={{ position: camPos, fov: 40, near: 0.05, far: b.size * 20 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#f4f1ea"]} />
      <hemisphereLight args={["#fffaf0", "#d8cfc0", 0.55]} />
      <directionalLight
        position={[b.cx + b.size * 0.6, b.size * 1.4, b.cz + b.size * 0.4]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={0.1}
        shadow-camera-far={b.size * 4}
      >
        <object3D attach="target" position={[b.cx, 0, b.cz]} />
      </directionalLight>
      <Environment files="/hdri/potsdamer_platz_1k.hdr" environmentIntensity={0.55} />

      {/* Ground */}
      <mesh rotation-x={-Math.PI / 2} position={[b.cx, -0.01, b.cz]} receiveShadow raycast={() => null}>
        <planeGeometry args={[b.size * 6, b.size * 6]} />
        <meshStandardMaterial color="#e9e3d8" roughness={1} />
      </mesh>

      {scene.rooms.map((r) => (
        <Floor key={r.id} poly={r.polygon} type={r.flooring.type} selected={selected === r.id} onClick={() => onSelect(selected === r.id ? null : r.id)} />
      ))}
      <Walls scene={scene} openings={openings} cutaway={cutaway} />
      <Furniture scene={scene} />

      {labels &&
        scene.rooms.map((r) => {
          const [x, z] = centroid(r.polygon);
          return (
            <Html key={r.id} position={[x, Math.min(CUTAWAY_H, r.ceilingHeight) + 0.35, z]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div
                className={
                  "whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur " +
                  (selected === r.id ? "border-oak bg-oak text-paper" : "border-plaster bg-paper/85 text-ink")
                }
              >
                {r.name}
              </div>
            </Html>
          );
        })}

      <OrbitControls makeDefault target={[b.cx, 0, b.cz]} maxPolarAngle={Math.PI / 2.1} minDistance={2} maxDistance={b.size * 4} enableDamping />
    </Canvas>
  );
}
