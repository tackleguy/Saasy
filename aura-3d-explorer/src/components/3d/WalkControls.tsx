"use client";
/**
 * WalkControls — first-person walk-through of the isolated floor.
 * -----------------------------------------------------------------------------
 *   • Look:   drag anywhere on the canvas (mouse or touch).
 *   • Move:   W A S D / arrow keys (Shift to run), or the on-screen pad,
 *             which writes to the shared `walkInput` object.
 *   • Views:  when `viewIndex` / `viewNonce` change, the camera glides to
 *             that curated viewpoint (see `lib/viewpoints.ts`); LIFT_VIEW
 *             stands you in the lift lobby facing the doors.
 *   • Lift:   the main lift doors open as you approach; step into the cab
 *             and pick a floor (WalkHud → `lift.ride`). The doors close, the
 *             cab travels (you ride inside a moving cab), and on arrival the
 *             explorer switches to the new floor and the doors open again.
 *
 * The walker has weight: speed eases toward the stick and coasts to a stop,
 * and a surface sheds only the into-surface part of that velocity so you
 * slide along walls, core blocks and the glass. Eye height stays at 1.6 m,
 * with a light step. The body can't leave the plate through the glass
 * (the real outline, not the bounding box) and can't walk through the
 * core's walls, shafts, stair or chute enclosures (lib/coreLayout
 * `coreColliders`). On residential / office floors the service passage
 * behind the lift bank is open at both ends, and the refuse room and riser
 * closet are entered through their door openings. The lift cab is entered
 * through its doors only while they are open. Furniture is not solid, so
 * every viewpoint is reachable.
 *
 * Mounted only while walk mode is on; OrbitControls are disabled meanwhile.
 * On unmount the camera's FOV / near plane are restored and the regular
 * camera rig flies back out to the floor overview.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import type { Building, FloorData } from "@/types";
import { crownFloorCount, explodedY, MODEL_SCALE, planOutline } from "@/lib/tower";
import { EYE_HEIGHT_M, LIFT_VIEW, viewpointsFor } from "@/lib/viewpoints";
import { walkInput, resetWalkInput } from "@/lib/walkInput";
import { liftDims, liftState, resetLiftState } from "@/lib/lift";
import { coreColliders, coreServiceOpen, separateFromBoxes } from "@/lib/coreLayout";
import { SLAB_THICKNESS } from "./FurnitureOverlay";
import { wallCollidersFor } from "./interior/plan";
import { containInOutline, separateFromWalls } from "@/lib/roomPlan";

/** Walking speed, metres per second (×2.2 with Shift). */
const WALK_SPEED_M = 1.8;
const RUN_MUL = 2.2;
/** Walker radius against interior walls, metres. */
const WALKER_RADIUS_M = 0.22;
const LOOK_SENSITIVITY = 0.0035;
const WALK_FOV = 64;
const EYE = EYE_HEIGHT_M * MODEL_SCALE;
/** How fast velocity catches the input, and how fast it dies when you let go (1/seconds). */
const MOVE_RESPONSE = 14;
const STOP_RESPONSE = 20;
/** Longest collision step, metres — a sprint must not skip a door jamb. */
const STEP_M = 0.08;
/** Stride and camera bob, metres. Small on purpose: this is a walk-through. */
const STRIDE_M = 0.74;
const BOB_M = 0.035;
const SWAY_M = 0.016;

type Contact = { x: number; z: number };

/** Exponential chase, frame-rate independent. Component-wise this is a vector chase. */
function approach(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Drop the part of a planar velocity that points into any contact. Two passes settle corners. */
function clipPlanar(vx: number, vz: number, normals: Contact[]) {
  for (let pass = 0; pass < 2; pass++) {
    for (const n of normals) {
      const into = vx * n.x + vz * n.z;
      if (into < 0) {
        vx -= into * n.x;
        vz -= into * n.z;
      }
    }
  }
  return { x: vx, z: vz };
}

/** Lift plumbing between the explorer state and the walker. */
export interface LiftLink {
  /** Latest ride request: target floor index + a nonce so repeats re-trigger. */
  ride: { target: number; nonce: number };
  /** Latest arrival (set by the explorer when a ride ends). */
  arrival: { index: number; nonce: number };
  /** The walker stepped into / out of the cab. */
  onInside: (inside: boolean) => void;
  /** Floor number passing by while riding (null when stopped). */
  onFloor: (floorNumber: number | null) => void;
  /** The ride reached `index`: switch the walked floor. */
  onArrive: (index: number) => void;
}

interface Props {
  building: Building;
  floor: FloorData;
  explosion: number;
  viewIndex: number;
  /** Bump to re-fly to the same view. */
  viewNonce: number;
  lift: LiftLink;
}

export default function WalkControls({ building, floor, explosion, viewIndex, viewNonce, lift }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);

  const yaw = useRef(0);
  const pitch = useRef(0);
  const pos = useRef(new THREE.Vector2()); // world x / z
  const vel = useRef(new THREE.Vector2()); // world x / z, scene units per second
  const bobPhase = useRef(0);
  const gait = useRef(0);
  const eyeSmooth = useRef<number | null>(null);
  const contacts = useRef<Contact[]>([]);
  const keys = useRef(new Set<string>());
  const tween = useRef<gsap.core.Tween | gsap.core.Timeline | null>(null);
  const inside = useRef(false);
  const holdDoorsUntil = useRef(0);
  const handledRide = useRef(lift.ride.nonce);
  const handledArrival = useRef(lift.arrival.nonce);
  const lastFloorShown = useRef<number | null>(null);
  const cab = useRef<THREE.Group>(null);
  /** True once the doors have shut and the cab is moving (the travelling cab is shown). */
  const travelling = useRef(false);
  // Keep the latest callbacks without re-running effects.
  const liftRef = useRef(lift);
  liftRef.current = lift;

  const [bx, bz] = building.position;
  const cos = Math.cos(floor.rotationY);
  const sin = Math.sin(floor.rotationY);
  const L = useMemo(() => liftDims(building.coreSize, floor.height - SLAB_THICKNESS), [building.coreSize, floor.height]);
  const cabCentreZ = (L.zBack + L.zFront) / 2;
  // Interior walls (door openings stay passable; the lift lobby has no colliders).
  const walls = useMemo(() => wallCollidersFor(floor, building.coreSize, crownFloorCount(building)), [floor, building]);
  // Core solids (building-local scene units) — the lift doorway is added while the doors are shut.
  const coreSolids = useMemo(() => {
    const solids = coreColliders(building.coreSize, floor.height, SLAB_THICKNESS, coreServiceOpen(floor.zone));
    const leaf = { x0: -L.opening / 2, x1: L.opening / 2, z0: L.zFront, z1: building.coreSize / 2 };
    return { open: solids, shut: [...solids, leaf] };
  }, [building.coreSize, floor.height, floor.zone, L]);

  /** Plate-local (scene units) → world x/z. */
  const toWorld = useMemo(() => (lx: number, lz: number) => new THREE.Vector2(bx + lx * cos + lz * sin, bz - lx * sin + lz * cos), [bx, bz, cos, sin]);

  /**
   * Keep a world x/z point inside the glass line and outside the core —
   * except inside the lift cab, which you can enter through open doors.
   */
  const resolve = useMemo(
    () => (p: THREE.Vector2) => {
      let x = p.x - bx;
      let z = p.y - bz;
      const ch = building.coreSize / 2 + 0.12;
      const m = 0.06;
      const inCab = Math.abs(x) < L.cabW / 2 && z > L.zBack && z < L.zFront;
      const inDoorway = Math.abs(x) < L.opening / 2 && z >= L.zFront && z < ch;
      if (inCab || (inDoorway && liftState.open > 0.6)) {
        if (z < L.zFront) {
          x = THREE.MathUtils.clamp(x, -(L.cabW / 2 - m), L.cabW / 2 - m);
          z = Math.max(z, L.zBack + m);
        } else {
          x = THREE.MathUtils.clamp(x, -(L.opening / 2 - m / 2), L.opening / 2 - m / 2);
        }
        if (liftState.open < 0.6) z = Math.min(z, L.zFront - m); // doors shut: stay in the cab
      } else if (Math.abs(x) < ch + 0.1 && Math.abs(z) < ch + 0.1) {
        // Core (square to the world): solid blocks, shafts and chutes; the passage and service rooms stay open.
        [x, z] = pushOutOfBoxes(x, z, liftState.open > 0.6 ? coreSolids.open : coreSolids.shut, WALKER_RADIUS_M * MODEL_SCALE);
      }
      // Glass line (in the twisted plate frame)
      const margin = 0.12;
      let lx = x * cos - z * sin;
      let lz = x * sin + z * cos;
      const [wx, wz] = pushOutOfWalls(lx / MODEL_SCALE, lz / MODEL_SCALE, walls, WALKER_RADIUS_M);
      lx = wx * MODEL_SCALE;
      lz = wz * MODEL_SCALE;
      lx = THREE.MathUtils.clamp(lx, -floor.width / 2 + margin, floor.width / 2 - margin);
      lz = THREE.MathUtils.clamp(lz, -floor.depth / 2 + margin, floor.depth / 2 - margin);
      p.set(bx + lx * cos + lz * sin, bz - lx * sin + lz * cos);
      return p;
    },
    [bx, bz, cos, sin, building.coreSize, floor.width, floor.depth, L, walls, coreSolids]
  );

  const eyeY = explodedY(floor, explosion) + SLAB_THICKNESS + EYE;

  /* Enter / leave: widen the lens and pull the near plane in for interiors. */
  useEffect(() => {
    const prev = { fov: camera.fov, near: camera.near };
    camera.fov = WALK_FOV;
    camera.near = 0.02;
    camera.rotation.order = "YXZ";
    camera.updateProjectionMatrix();
    return () => {
      tween.current?.kill();
      resetWalkInput();
      resetLiftState();
      liftRef.current.onInside(false);
      liftRef.current.onFloor(null);
      camera.fov = prev.fov;
      camera.near = prev.near;
      camera.rotation.order = "XYZ";
      camera.updateProjectionMatrix();
    };
  }, [camera]);

  /* Seed yaw from the current camera direction so the first glide is smooth. */
  useEffect(() => {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    yaw.current = Math.atan2(-dir.x, -dir.z);
    pitch.current = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }, [camera]);

  /* Glide to the requested viewpoint — or, after a lift ride, stand in the cab. */
  useEffect(() => {
    // Arrived by lift on this floor: appear inside the cab, doors open shortly.
    if (lift.arrival.index === floor.index && lift.arrival.nonce !== handledArrival.current) {
      handledArrival.current = lift.arrival.nonce;
      tween.current?.kill();
      tween.current = null;
      pos.current.set(bx, bz + cabCentreZ);
      camera.position.set(pos.current.x, eyeY, pos.current.y);
      // Turn to face the doors (+Z), ready to step out.
      yaw.current = Math.PI;
      pitch.current = -0.04;
      camera.rotation.set(pitch.current, yaw.current, 0);
      liftState.riding = false;
      travelling.current = false;
      liftState.open = 0;
      liftState.targetOpen = 0;
      holdDoorsUntil.current = performance.now() + 450;
      lastFloorShown.current = null;
      liftRef.current.onFloor(null);
      return;
    }
    if (liftState.riding) return;

    let from: THREE.Vector2;
    let look: THREE.Vector2;
    if (viewIndex === LIFT_VIEW) {
      // Lift lobby: just outside the doors, facing them.
      from = new THREE.Vector2(bx, bz + building.coreSize / 2 + 0.32);
      look = new THREE.Vector2(bx, bz);
    } else {
      const views = viewpointsFor(floor, crownFloorCount(building), building.coreSize);
      const v = views[Math.min(Math.max(viewIndex, 0), views.length - 1)];
      const s = MODEL_SCALE;
      from = resolve(toWorld(v.from[0] * s, v.from[1] * s));
      look = toWorld(v.look[0] * s, v.look[1] * s);
    }
    const targetYaw = Math.atan2(-(look.x - from.x), -(look.y - from.y));

    const startPos = new THREE.Vector2(camera.position.x, camera.position.z);
    const startY = camera.position.y;
    const startPitch = pitch.current;
    // Shortest way round
    const startYaw = yaw.current;
    const dYaw = Math.atan2(Math.sin(targetYaw - startYaw), Math.cos(targetYaw - startYaw));
    const p = { t: 0 };

    tween.current?.kill();
    tween.current = gsap.to(p, {
      t: 1,
      duration: 1.6,
      ease: "power2.inOut",
      onUpdate: () => {
        pos.current.lerpVectors(startPos, from, p.t);
        yaw.current = startYaw + dYaw * p.t;
        pitch.current = THREE.MathUtils.lerp(startPitch, -0.04, p.t);
        camera.position.set(pos.current.x, THREE.MathUtils.lerp(startY, eyeY, p.t), pos.current.y);
        camera.rotation.set(pitch.current, yaw.current, 0);
      },
      onComplete: () => void (tween.current = null),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewIndex, viewNonce, floor, building, lift.arrival.nonce]);

  /* Ride the lift to another floor. */
  useEffect(() => {
    const { target, nonce } = lift.ride;
    if (nonce === handledRide.current) return;
    handledRide.current = nonce;
    if (!inside.current || liftState.riding || target === floor.index || target < 0 || target >= building.floors.length) return;

    const dest = building.floors[target];
    const destEye = explodedY(dest, explosion) + SLAB_THICKNESS + EYE;
    const floorsToGo = Math.abs(target - floor.index);
    const travel = THREE.MathUtils.clamp(1.4 + floorsToGo * 0.06, 1.6, 7);
    const y = { v: camera.position.y };

    // Centre the rider in the cab, close the doors, travel, then hand over to the new floor.
    tween.current?.kill();
    liftState.riding = true;
    liftState.targetOpen = 0;
    pos.current.set(bx, bz + cabCentreZ);
    const tl = gsap.timeline({ onComplete: () => liftRef.current.onArrive(target) });
    tl.to(y, { v: y.v, duration: 0.9 }); // doors closing
    tl.to(y, {
      v: destEye,
      duration: travel,
      ease: "power2.inOut",
      onStart: () => void (travelling.current = true),
      onUpdate: () => {
        camera.position.y = y.v;
        // Floor passing by: the highest floor whose slab is below the cab floor.
        const cabFloor = y.v - EYE - SLAB_THICKNESS + 1e-3;
        let n = building.floors[0].number;
        for (const f of building.floors) if (explodedY(f, explosion) <= cabFloor) n = f.number;
        if (n !== lastFloorShown.current) {
          lastFloorShown.current = n;
          liftRef.current.onFloor(n);
        }
      },
    });
    tween.current = tl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lift.ride.nonce]);

  /* Drag to look (also while riding). */
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      if (tween.current && !liftState.riding) {
        tween.current.kill();
        tween.current = null;
      }
      yaw.current += (e.clientX - lx) * LOOK_SENSITIVITY;
      pitch.current = THREE.MathUtils.clamp(pitch.current + (e.clientY - ly) * LOOK_SENSITIVITY, -1.2, 1.2);
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = "grab";
    };
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.style.cursor = "";
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl]);

  /* Keyboard movement. */
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest?.("input, textarea");
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
        keys.current.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  /* Per-frame: lift doors, moving cab, movement. */
  useFrame((_, dt) => {
    // Where are we relative to the lift? (building-local; the core never twists)
    const x = camera.position.x - bx;
    const z = camera.position.z - bz;
    const nowInside = Math.abs(x) < L.cabW / 2 && z > L.zBack && z < L.zFront + L.jamb * 0.5;
    const near = Math.abs(x) < L.cabW && z >= L.zFront && z < building.coreSize / 2 + 1.6 * MODEL_SCALE;
    if (nowInside !== inside.current) {
      inside.current = nowInside;
      liftRef.current.onInside(nowInside);
    }
    liftState.targetOpen = liftState.riding || performance.now() < holdDoorsUntil.current ? 0 : nowInside || near ? 1 : 0;

    // The moving cab encloses the rider between floors.
    const g = cab.current;
    if (g) {
      g.visible = liftState.riding && travelling.current;
      if (g.visible) g.position.set(bx, camera.position.y - EYE + L.cabH / 2, bz + cabCentreZ);
    }

    if (liftState.riding) {
      camera.position.x = pos.current.x;
      camera.position.z = pos.current.y;
      camera.rotation.set(pitch.current, yaw.current, 0);
      return;
    }
    if (tween.current) return; // gliding to a viewpoint

    const k = keys.current;
    let f = walkInput.forward + (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    let r = walkInput.strafe + (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    f = THREE.MathUtils.clamp(f, -1, 1);
    r = THREE.MathUtils.clamp(r, -1, 1);

    if (f || r) {
      const len = Math.hypot(f, r);
      const speed = WALK_SPEED_M * MODEL_SCALE * (k.has("shift") ? 2.2 : 1) * Math.min(dt, 0.05);
      const sy = Math.sin(yaw.current);
      const cy = Math.cos(yaw.current);
      // forward = (−sin yaw, −cos yaw); right = (cos yaw, −sin yaw)
      pos.current.x += ((-sy * f + cy * r) / len) * speed;
      pos.current.y += ((-cy * f - sy * r) / len) * speed;
      resolve(pos.current);
    }

    camera.position.set(pos.current.x, THREE.MathUtils.lerp(camera.position.y, eyeY, 0.2), pos.current.y);
    camera.rotation.set(pitch.current, yaw.current, 0);
  });

  // Travelling cab: seen from inside (back faces), steel walls and a light panel.
  return (
    <group ref={cab} visible={false}>
      <mesh raycast={() => null}>
        <boxGeometry args={[L.cabW, L.cabH, L.cabD]} />
        <meshStandardMaterial color="#c7ccd2" metalness={0.85} roughness={0.32} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, L.cabH / 2 - 0.004, 0]} rotation-x={Math.PI / 2} raycast={() => null}>
        <planeGeometry args={[L.cabW * 0.7, L.cabD * 0.7]} />
        <meshStandardMaterial color="#fff6e6" emissive="#fff1d6" emissiveIntensity={1.4} />
      </mesh>
      <pointLight position={[0, L.cabH / 2 - 0.05, 0]} color="#fff1d6" intensity={0.6} distance={1.2} decay={2} />
    </group>
  );
}
