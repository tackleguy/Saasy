"use client";
/**
 * WalkControls — first-person walk-through of the isolated floor.
 * -----------------------------------------------------------------------------
 *   • Look:   drag anywhere on the canvas (mouse or touch).
 *   • Move:   W A S D / arrow keys (Shift to run), or the on-screen pad,
 *             which writes to the shared `walkInput` object.
 *   • Views:  when `viewIndex` / `viewNonce` change, the camera glides to
 *             that curated viewpoint (see `lib/viewpoints.ts`).
 *
 * The walker stays at standing eye height (1.6 m), can't leave the plate
 * through the glass and can't walk through the lift core. Furniture is not
 * solid — visitors can walk through it to reach any viewpoint.
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
import { explodedY, MODEL_SCALE } from "@/lib/tower";
import { EYE_HEIGHT_M, viewpointsFor } from "@/lib/viewpoints";
import { walkInput, resetWalkInput } from "@/lib/walkInput";
import { SLAB_THICKNESS } from "./FurnitureOverlay";

/** Walking speed, metres per second (×2.2 with Shift). */
const WALK_SPEED_M = 1.8;
const LOOK_SENSITIVITY = 0.0035;
const WALK_FOV = 64;

interface Props {
  building: Building;
  floor: FloorData;
  explosion: number;
  viewIndex: number;
  /** Bump to re-fly to the same view. */
  viewNonce: number;
}

export default function WalkControls({ building, floor, explosion, viewIndex, viewNonce }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);

  const yaw = useRef(0);
  const pitch = useRef(0);
  const pos = useRef(new THREE.Vector2()); // world x / z
  const keys = useRef(new Set<string>());
  const tween = useRef<gsap.core.Tween | null>(null);

  const [bx, bz] = building.position;
  const cos = Math.cos(floor.rotationY);
  const sin = Math.sin(floor.rotationY);

  /** Plate-local (scene units) → world x/z. */
  const toWorld = useMemo(() => (lx: number, lz: number) => new THREE.Vector2(bx + lx * cos + lz * sin, bz - lx * sin + lz * cos), [bx, bz, cos, sin]);

  /** Keep a world x/z point inside the glass line and outside the core. */
  const resolve = useMemo(
    () => (p: THREE.Vector2) => {
      let x = p.x - bx;
      let z = p.y - bz;
      // Core (square to the world)
      const ch = building.coreSize / 2 + 0.12;
      if (Math.abs(x) < ch && Math.abs(z) < ch) {
        const px = ch - Math.abs(x);
        const pz = ch - Math.abs(z);
        if (px < pz) x = Math.sign(x || 1) * ch;
        else z = Math.sign(z || 1) * ch;
      }
      // Glass line (in the twisted plate frame)
      const margin = 0.12;
      let lx = x * cos - z * sin;
      let lz = x * sin + z * cos;
      lx = THREE.MathUtils.clamp(lx, -floor.width / 2 + margin, floor.width / 2 - margin);
      lz = THREE.MathUtils.clamp(lz, -floor.depth / 2 + margin, floor.depth / 2 - margin);
      p.set(bx + lx * cos + lz * sin, bz - lx * sin + lz * cos);
      return p;
    },
    [bx, bz, cos, sin, building.coreSize, floor.width, floor.depth]
  );

  const eyeY = explodedY(floor, explosion) + SLAB_THICKNESS + EYE_HEIGHT_M * MODEL_SCALE;

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

  /* Glide to the requested viewpoint. */
  useEffect(() => {
    const views = viewpointsFor(floor);
    const v = views[Math.min(viewIndex, views.length - 1)];
    const s = MODEL_SCALE;
    const from = resolve(toWorld(v.from[0] * s, v.from[1] * s));
    const look = toWorld(v.look[0] * s, v.look[1] * s);
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
  }, [viewIndex, viewNonce, floor, building]);

  /* Drag to look. */
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
      if (tween.current) {
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

  /* Per-frame movement. */
  useFrame((_, dt) => {
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

  return null;
}
