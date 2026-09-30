"use client";
/**
 * useCameraTween — GSAP camera interpolation manager.
 * -----------------------------------------------------------------------------
 * Must be called from a component rendered INSIDE the R3F <Canvas>, with an
 * <OrbitControls makeDefault /> in the scene.
 *
 * Two kinds of goal are supported:
 *   • "focus"    — fly to an exact pose:  P_camera → target + offset,
 *                  T_target → target. Used when a floor is selected
 *                  (offset = [8, 4, 8]).
 *   • "overview" — frame a point from a given distance. On first load and
 *                  whenever `nonce` changes (e.g. "Reset view") the camera
 *                  swings to `resetDirection`; otherwise the user's current
 *                  orbit angle is preserved, so dragging the explosion slider
 *                  doesn't yank the view around.
 *
 * Whenever the goal changes (compared by value), any running tween is killed
 * and a new power3.inOut tween starts from wherever the camera currently is.
 */
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export type Vec3 = [number, number, number];

export type CameraGoal =
  | { kind: "focus"; target: Vec3; offset: Vec3 }
  | { kind: "overview"; target: Vec3; distance: number; resetDirection: Vec3 };

interface Options {
  /** Tween length in seconds. */
  duration?: number;
  /** Bump this number to force a re-run even if the goal is unchanged (e.g. "Reset view"). */
  nonce?: number;
}

// Keep tweens time-accurate on slow frames (no GSAP lag-smoothing slow-motion).
gsap.ticker.lagSmoothing(0);

export function useCameraTween(goal: CameraGoal, { duration = 1.2, nonce = 0 }: Options = {}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const tween = useRef<gsap.core.Tween | null>(null);
  const firstRun = useRef(true);
  const lastNonce = useRef(nonce);

  // Serialise the goal so the effect only fires on real changes.
  const goalKey = JSON.stringify(goal);

  useEffect(() => {
    if (!controls) return;
    const g = JSON.parse(goalKey) as CameraGoal;

    const toTarget = new THREE.Vector3(...g.target);
    let toCamera: THREE.Vector3;

    if (g.kind === "focus") {
      toCamera = toTarget.clone().add(new THREE.Vector3(...g.offset));
    } else {
      // Canonical angle on first load / reset, otherwise keep the user's orbit.
      const snap = firstRun.current || nonce !== lastNonce.current;
      const dir = snap ? new THREE.Vector3(...g.resetDirection) : camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0.6, 1);
      toCamera = toTarget.clone().add(dir.normalize().multiplyScalar(g.distance));
    }

    // Tween a single proxy (0 → 1) and lerp both vectors, so camera and
    // target always move in lock-step and can be killed as one unit.
    const fromCamera = camera.position.clone();
    const fromTarget = controls.target.clone();
    const proxy = { t: 0 };

    tween.current?.kill();
    tween.current = gsap.to(proxy, {
      t: 1,
      duration: firstRun.current ? 0 : duration,
      ease: "power3.inOut",
      onUpdate: () => {
        camera.position.lerpVectors(fromCamera, toCamera, proxy.t);
        controls.target.lerpVectors(fromTarget, toTarget, proxy.t);
        controls.update();
      },
    });
    firstRun.current = false;
    lastNonce.current = nonce;
  }, [goalKey, nonce, controls, camera, duration]);

  // Clean up on unmount.
  useEffect(() => () => void tween.current?.kill(), []);
}
