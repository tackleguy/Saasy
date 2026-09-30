/**
 * Lift — dimensions of the walk-in lift cab and its live door state.
 * -----------------------------------------------------------------------------
 * The main lift sits in the middle of the core's +Z face. The core never
 * twists, so these are building-local coordinates (x across the door, z out
 * of the door, y up from the floor group's origin), in scene units.
 *
 *         z ↑  (lobby)
 *   ──────┬───┬──────  z = core/2        front face
 *   jamb  │ ⇆ │  jamb  z = zFront        door leaves
 *         │cab│
 *   ──────┴───┴──────  z = zBack         cab back wall
 *
 * `liftState` is a plain mutable object (like walkInput) shared by the walk
 * controller, which decides when the doors open, and the core geometry, which
 * animates the door leaves — no React re-renders per frame.
 */
import { MODEL_SCALE } from "./tower";

export interface LiftDims {
  /** Core side length. */
  core: number;
  /** Door opening width. */
  opening: number;
  /** Cab inner width / depth / height. */
  cabW: number;
  cabD: number;
  cabH: number;
  /** Front wall (jamb) thickness. */
  jamb: number;
  /** z of the inner face of the front wall, and of the cab back wall. */
  zFront: number;
  zBack: number;
}

/** Lift geometry for a core of side `core` and a floor with `clearH` of clear height. */
export function liftDims(core: number, clearH: number): LiftDims {
  const s = MODEL_SCALE;
  const opening = Math.min(Math.max(core * 0.2, 1.1 * s), 1.3 * s); // 1.1 – 1.3 m doors
  const cabW = opening + 0.6 * s; // ~2.3 m wide cab
  const cabD = Math.min(2.1 * s, core * 0.4); // ~2.1 m deep
  const jamb = 0.18 * s;
  const cabH = Math.min(clearH - 0.02, 2.35 * s);
  const zFront = core / 2 - jamb;
  return { core, opening, cabW, cabD, cabH, jamb, zFront, zBack: zFront - cabD };
}

export const liftState = {
  /** 0 = doors shut, 1 = fully open (eased by the core geometry). */
  open: 0,
  /** What the doors should do this frame. */
  targetOpen: 0,
  /** True while the cab is travelling between floors. */
  riding: false,
};

export function resetLiftState() {
  liftState.open = 0;
  liftState.targetOpen = 0;
  liftState.riding = false;
}
