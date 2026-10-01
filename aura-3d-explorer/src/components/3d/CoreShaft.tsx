"use client";
/**
 * CoreShaft — the building core as one continuous vertical element.
 * -----------------------------------------------------------------------------
 * Each FloorPlate carries its own slice of concrete core, which breaks apart
 * when the stack is exploded. This component draws the core as a single tall
 * translucent shaft (in the CORE_ACCENT colour) threading through every
 * plate, with its anatomy readable inside:
 *   • N lift shafts (outlined) with lift cars gently travelling up and down
 *   • a scissor stair — one flight per floor, re-spaced as the stack explodes
 *   • service risers (in the electrical closet)
 *   • the refuse + recycling chutes — continuous stainless tubes from the
 *     ground to the roof, through every floor's refuse room
 *
 * It is shown for the active building in X-ray, Section and exploded views
 * (softened while a floor is isolated) and fades out otherwise. Everything
 * is raycast-transparent so clicks still reach the floor plates. Height and
 * opacity are eased per frame like the plates, without React re-renders.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Building } from "@/types";
import { buildingHeight, explodedY } from "@/lib/tower";
import { bankCoreLayout } from "./interior/LiftBank";
import { brushedMetalTexture, concreteTexture } from "./textures";

/** Distinct accent for everything "core" (shaft, lift cars, section poché edges). */
export const CORE_ACCENT = "#c8553d";

const noRaycast = () => null;
const lerp = THREE.MathUtils.lerp;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX);
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 10);

interface Props {
  building: Building;
  explosion: number;
  active: boolean;
  xray: boolean;
  section: boolean;
  /** A floor of this building is isolated (the shaft steps back). */
  focused: boolean;
}

export default function CoreShaft({ building, explosion, active, xray, section, focused }: Props) {
  const c = building.coreSize;
  const floors = building.floors;
  const layout = useMemo(() => bankCoreLayout(c), [c]);
  const carH = Math.min(...floors.map((f) => f.height)) * 0.6;

  const root = useRef<THREE.Group>(null);
  const scaled = useRef<THREE.Group>(null);
  const flights = useRef<THREE.InstancedMesh>(null);
  const cars = useRef<(THREE.Mesh | null)[]>([]);
  const eased = useRef<{ e: number; vis: number; flightE: number; flightFloors: unknown }>({ e: explosion, vis: 0, flightE: 0, flightFloors: null });

  // Materials owned here so a single master opacity can drive them all.
  const mats = useMemo(
    () => ({
      shell: new THREE.MeshStandardMaterial({ color: CORE_ACCENT, emissive: CORE_ACCENT, emissiveIntensity: 0.25, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6 }),
      edge: new THREE.LineBasicMaterial({ color: CORE_ACCENT, transparent: true, opacity: 0 }),
      shaftEdge: new THREE.LineBasicMaterial({ color: CORE_ACCENT, transparent: true, opacity: 0 }),
      car: new THREE.MeshStandardMaterial({ map: brushedMetalTexture("#f4efe6"), color: "#fffaf4", emissive: CORE_ACCENT, emissiveIntensity: 0.55, transparent: true, opacity: 0, roughness: 0.32, metalness: 0.45 }),
      stair: new THREE.MeshStandardMaterial({ map: concreteTexture(), color: "#8a8178", transparent: true, opacity: 0, roughness: 0.86 }),
      riser: new THREE.MeshStandardMaterial({ color: CORE_ACCENT, transparent: true, opacity: 0, roughness: 0.5, metalness: 0.4 }),
      chute: new THREE.MeshStandardMaterial({ color: "#c3cad1", emissive: "#5d6a75", emissiveIntensity: 0.35, transparent: true, opacity: 0, roughness: 0.28, metalness: 0.9 }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // Per-lift motion: different periods and phases so the cars never move in lockstep.
  const motion = useMemo(() => layout.shafts.map((_, i) => ({ period: 16 + i * 3.7, phase: (i * 0.37) % 1 })), [layout]);

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), eu: new THREE.Euler() }), []);

  useFrame((state, dt) => {
    const st = eased.current;
    const k = 1 - Math.pow(0.0008, dt);
    st.e = lerp(st.e, explosion, k);
    const show = active && (xray || section || explosion > 0.05);
    st.vis = lerp(st.vis, show ? (focused ? 0.45 : 1) : 0, 1 - Math.pow(0.002, dt));
    const v = st.vis;
    if (root.current) root.current.visible = v > 0.01;
    if (v <= 0.01) return;

    const H = buildingHeight(building, st.e);
    if (scaled.current) scaled.current.scale.y = H;

    mats.shell.opacity = 0.13 * v;
    mats.edge.opacity = 0.9 * v;
    mats.shaftEdge.opacity = 0.55 * v;
    mats.car.opacity = v;
    mats.stair.opacity = 0.75 * v;
    mats.riser.opacity = 0.85 * v;
    mats.chute.opacity = 0.95 * v;

    // Lift cars: smoothed ping-pong between ground and roof.
    const t = state.clock.elapsedTime;
    layout.shafts.forEach((_, i) => {
      const car = cars.current[i];
      if (!car) return;
      const { period, phase } = motion[i];
      const tri = Math.abs(((t / period + phase) % 1) * 2 - 1);
      const u = tri * tri * (3 - 2 * tri);
      car.position.y = carH / 2 + u * Math.max(0, H - carH);
    });

    // Stair flights: one per floor, re-laid only while the explosion is moving.
    const fl = flights.current;
    if (fl && (st.flightFloors !== floors || Math.abs(st.flightE - st.e) > 1e-4)) {
      st.flightE = st.e;
      st.flightFloors = floors;
      const { x0, x1, z0, z1 } = layout.stair;
      const run = (x1 - x0) * 0.8;
      const halfZ = (z1 - z0) / 2;
      floors.forEach((f, i) => {
        const y0 = explodedY(f, st.e);
        const y1 = y0 + f.height;
        const rise = y1 - y0;
        const len = Math.hypot(run, rise);
        const dir = i % 2 === 0 ? 1 : -1;
        const zc = z0 + halfZ * (i % 2 === 0 ? 0.5 : 1.5);
        tmp.p.set((x0 + x1) / 2, (y0 + y1) / 2, zc);
        tmp.eu.set(0, 0, dir * Math.atan2(rise, run));
        tmp.q.setFromEuler(tmp.eu);
        tmp.s.set(len, 0.035, halfZ * 0.85);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        fl.setMatrixAt(i, tmp.m);
      });
      fl.instanceMatrix.needsUpdate = true;
      fl.computeBoundingSphere();
    }
  });

  return (
    <group ref={root} visible={false}>
      {/* Height-normalised parts: y ∈ [0, 1], scaled to the (exploded) tower height */}
      <group ref={scaled} scale={[1, 1, 1]}>
        <mesh geometry={UNIT_BOX} material={mats.shell} position={[0, 0.5, 0]} scale={[c * 1.03, 1, c * 1.03]} raycast={noRaycast} renderOrder={2} />
        <lineSegments geometry={UNIT_EDGES} material={mats.edge} position={[0, 0.5, 0]} scale={[c * 1.03, 1, c * 1.03]} raycast={noRaycast} />
        {layout.shafts.map((s, i) => (
          <lineSegments key={i} geometry={UNIT_EDGES} material={mats.shaftEdge} position={[s.x, 0.5, s.z]} scale={[s.w, 1, s.d]} raycast={noRaycast} />
        ))}
        <lineSegments
          geometry={UNIT_EDGES}
          material={mats.shaftEdge}
          position={[(layout.stair.x0 + layout.stair.x1) / 2, 0.5, (layout.stair.z0 + layout.stair.z1) / 2]}
          scale={[layout.stair.x1 - layout.stair.x0, 1, layout.stair.z1 - layout.stair.z0]}
          raycast={noRaycast}
        />
        {layout.chutes.map((k, i) => (
          <mesh key={`c${i}`} geometry={UNIT_CYL} material={mats.chute} position={[k.x, 0.5, k.z]} scale={[k.r, 1, k.r]} raycast={noRaycast} />
        ))}
        {layout.risers.map((r, i) => (
          <mesh key={i} geometry={UNIT_CYL} material={mats.riser} position={[r.x, 0.5, r.z]} scale={[layout.riserR, 1, layout.riserR]} raycast={noRaycast} />
        ))}
      </group>

      {/* Scissor stair — one flight per storey */}
      <instancedMesh ref={flights} args={[UNIT_BOX, mats.stair, floors.length]} raycast={noRaycast} frustumCulled={false} />

      {/* Lift cars */}
      {layout.shafts.map((s, i) => (
        <mesh
          key={i}
          ref={(m) => void (cars.current[i] = m)}
          geometry={UNIT_BOX}
          material={mats.car}
          position={[s.x, carH / 2, s.z]}
          scale={[s.w * 0.8, carH, s.d * 0.8]}
          raycast={noRaycast}
        />
      ))}
    </group>
  );
}
