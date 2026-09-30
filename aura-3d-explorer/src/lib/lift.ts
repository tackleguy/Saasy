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

/** One car of the lift bank on the core's +Z face. */
export interface LiftCar {
  /** Centre of the car / door across the face (building-local x). */
  x: number;
  cabW: number;
  opening: number;
  /** The walk-in lift (middle of the face) that LiftCore hollows out. */
  main: boolean;
}

export interface LiftBank {
  cars: LiftCar[];
  /** Half the width of the whole bank (outer cab walls), for the lift lobby in front. */
  halfWidth: number;
  /** Shared cab depth line (all cars align with the main one). */
  zFront: number;
  zBack: number;
  /** Stair enclosure behind the lifts (core-local x/z) and its door on the −Z face. */
  stair: { x0: number; x1: number; z0: number; z1: number; doorX: number; doorW: number };
}

/**
 * The lift bank: the walk-in main lift in the middle of the +Z face plus up
 * to three more cars beside it (same depth, slimmer cabs when the core is
 * small), and a stair behind them opening onto the −Z face. Everything is in
 * building-local scene units, like `liftDims`. CoreShaft, LiftCore and the
 * plain core slices all draw from this so the core reads the same everywhere.
 */
export function liftBank(core: number, clearH = 10): LiftBank {
  const s = MODEL_SCALE;
  const L = liftDims(core, clearH);
  const wall = 0.2 * s; // between cars
  const end = 0.25 * s; // outer wall at the core corner
  const avail = core / 2 - L.cabW / 2 - wall - end;
  const cars: LiftCar[] = [{ x: 0, cabW: L.cabW, opening: L.opening, main: true }];
  const sideW = Math.min(L.cabW, avail);
  if (sideW >= 0.8 * s) {
    const perSide = Math.max(1, Math.floor((avail + wall) / (sideW + wall)));
    const make = (sign: 1 | -1, i: number): LiftCar => ({
      x: sign * (L.cabW / 2 + wall + sideW / 2 + i * (sideW + wall)),
      cabW: sideW,
      opening: Math.min(L.opening, sideW - 0.3 * s),
      main: false,
    });
    cars.push(make(1, 0), make(-1, 0));
    if (perSide >= 2) cars.push(make(1, 1));
  }
  cars.sort((a, b) => a.x - b.x);
  const halfWidth = Math.max(...cars.map((c) => Math.abs(c.x) + c.cabW / 2));
  const pad = 0.2 * s;
  const z1 = L.zBack - wall;
  const doorW = Math.min(0.95 * s, core * 0.3);
  return {
    cars,
    halfWidth,
    zFront: L.zFront,
    zBack: L.zBack,
    stair: { x0: -core / 2 + pad, x1: core / 2 - pad, z0: -core / 2 + pad, z1, doorX: 0, doorW },
  };
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
