/**
 * Amenity fit-outs — furniture pieces and layout recipes for amenity floors.
 * -----------------------------------------------------------------------------
 * Same conventions as kit.ts / layouts.ts: pieces are lists of `Part`s in
 * REAL METRES, facing +Z (the side you sit on / walk up to), sitting on y = 0;
 * recipes place them in the plate's local frame (A = half width, B = half
 * depth) through the furniture planner, which rejects anything that leaves
 * the plate outline, clips the core + corridor or collides.
 *
 * This module only imports TYPES from kit.ts (no runtime cycle): kit.ts
 * spreads `AMENITY_PIECES` into its registry, and layouts.ts calls
 * `amenityLayout` when a floor has `amenity` set.
 *
 * "Recessed" water: the slab can't be cut, so pools sit inside a raised
 * timber deck with the water plane just below the deck top — it reads as a
 * sunken pool from the walk-through and from above.
 */
import type { AmenityKind } from "@/types";
import type { GeoKey, MatKey, Part } from "./kit";

/* --------------------------------------------------------------- helpers */

const part = (g: GeoKey, m: MatKey, x: number, y0: number, z: number, sx: number, sy: number, sz: number, r = 0): Part => ({
  g,
  m,
  p: [x, y0 + sy / 2, z],
  s: [sx, sy, sz],
  r,
});

/** Rotate parts about Y and translate (same maths as kit `place`). */
function put(parts: Part[], x: number, z: number, rot = 0): Part[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return parts.map((p) => ({ ...p, p: [x + p.p[0] * c + p.p[2] * s, p.p[1], z - p.p[0] * s + p.p[2] * c], r: (p.r ?? 0) + rot }));
}

const lift = (dy: number) => (p: Part): Part => ({ ...p, p: [p.p[0], p.p[1] + dy, p.p[2]] });

/* ---------------------------------------------------------- single items */

function treadmill(): Part[] {
  return [
    part("box", "metalDark", 0, 0, 0.1, 0.8, 0.18, 1.9),
    part("box", "rubber", 0, 0.18, 0.2, 0.55, 0.02, 1.5),
    ...[-0.36, 0.36].map((x) => part("box", "brushed", x, 0.18, -0.7, 0.05, 1.1, 0.05)),
    part("box", "metalDark", 0, 1.2, -0.72, 0.8, 0.06, 0.12),
    part("box", "screen", 0, 1.26, -0.72, 0.4, 0.26, 0.03, 0),
  ];
}

function bike(): Part[] {
  return [
    part("box", "metalDark", 0, 0, 0, 0.5, 0.06, 1.1),
    part("box", "brushed", 0, 0.06, 0.25, 0.08, 0.72, 0.08),
    part("rbox", "leather", 0, 0.78, 0.25, 0.26, 0.07, 0.34),
    part("box", "brushed", 0, 0.06, -0.35, 0.08, 1.0, 0.08),
    part("box", "metalDark", 0, 1.04, -0.38, 0.5, 0.04, 0.08),
    part("cyl", "metalDark", 0, 0.12, -0.1, 0.06, 0.5, 0.5),
  ];
}

function weightBench(): Part[] {
  return [
    part("box", "metalDark", 0, 0, 0, 0.1, 0.38, 1.2),
    part("rbox", "leather", 0, 0.38, 0, 0.3, 0.08, 1.25),
  ];
}

/** Squat rack with a loaded bar (parts only rotate about Y, so bar and plates are thin boxes). */
function squatRack(): Part[] {
  return [
    ...[-0.6, 0.6].flatMap((x) => [-0.5, 0.5].map((z) => part("box", "metalDark", x, 0, z, 0.07, 2.3, 0.07))),
    ...[-0.5, 0.5].map((z) => part("box", "metalDark", 0, 2.25, z, 1.3, 0.06, 0.06)),
    part("box", "brushed", 0, 1.35, 0.3, 2.1, 0.03, 0.03),
    ...[-0.9, 0.9].map((x) => part("box", "rubber", x, 1.12, 0.3, 0.06, 0.48, 0.48)),
  ];
}

function dumbbellRack(): Part[] {
  const out: Part[] = [part("box", "metalDark", 0, 0, 0, 1.8, 0.7, 0.45), part("box", "metalDark", 0, 0.7, -0.1, 1.8, 0.05, 0.3)];
  for (let i = 0; i < 6; i++) out.push(part("rbox", "rubber", -0.75 + i * 0.3, 0.72, -0.1, 0.18, 0.12, 0.26));
  return out;
}

function lounger(): Part[] {
  return [
    part("box", "oak", 0, 0, 0, 0.7, 0.3, 1.9),
    part("rbox", "linen", 0, 0.3, 0.2, 0.64, 0.07, 1.35),
    part("rbox", "linen", 0, 0.34, -0.62, 0.64, 0.5, 0.2, 0),
  ];
}

function parasol(): Part[] {
  return [part("cyl", "stone", 0, 0, 0, 0.45, 0.1, 0.45), part("cyl", "oak", 0, 0.1, 0, 0.05, 2.1, 0.05), part("cone", "linen", 0, 2.0, 0, 2.3, 0.35, 2.3)];
}

function recliner(): Part[] {
  return [
    part("rbox", "leather", 0, 0, 0, 0.8, 0.45, 0.85),
    part("rbox", "leather", 0, 0.3, -0.36, 0.8, 0.75, 0.2),
    ...[-0.42, 0.42].map((x) => part("rbox", "leather", x, 0.2, 0, 0.12, 0.45, 0.85)),
  ];
}

function treatmentBed(): Part[] {
  return [
    part("box", "walnut", 0, 0, 0, 0.7, 0.62, 1.9),
    part("rbox", "linen", 0, 0.62, 0, 0.72, 0.1, 1.95),
    part("rbox", "linen", 0, 0.72, -0.7, 0.4, 0.08, 0.25),
  ];
}

function tree(size = 1): Part[] {
  return [
    part("cyl", "walnut", 0, 0, 0, 0.18 * size, 1.4 * size, 0.18 * size),
    part("sphere", "leaf", 0, 1.1 * size, 0, 1.6 * size, 1.2 * size, 1.6 * size),
    part("sphere", "leaf", 0.35 * size, 1.55 * size, -0.2 * size, 1.1 * size, 0.9 * size, 1.1 * size),
  ];
}

function kidsStool(): Part[] {
  return [part("cyl", "play", 0, 0, 0, 0.3, 0.3, 0.3)];
}

/* ------------------------------------------------------------- ensembles */

/** Three treadmills side by side, users facing +Z (the glass), on rubber. */
function cardioRow(): Part[] {
  return [part("box", "rubber", 0, 0, 0, 3.9, 0.015, 2.2), ...[-1.25, 0, 1.25].flatMap((x) => put(treadmill(), x, 0, Math.PI))];
}

/** Four spin bikes facing +Z. */
function bikeRow(): Part[] {
  return [part("box", "rubber", 0, 0, 0, 3.2, 0.015, 1.4), ...[-1.2, -0.4, 0.4, 1.2].flatMap((x) => put(bike(), x, 0, Math.PI))];
}

/** Free-weights zone: rubber floor, two racks + benches, dumbbells, mirror wall at −Z. */
function weightsZone(): Part[] {
  return [
    part("box", "rubber", 0, 0, 0, 4.4, 0.02, 3.4),
    part("box", "brushed", 0, 0, -1.65, 4.4, 2.3, 0.04), // mirror wall
    ...[-1.2, 1.2].flatMap((x) => put(squatRack(), x, -0.6)),
    ...[-1.2, 1.2].flatMap((x) => put(weightBench(), x, 0.9)),
    ...put(dumbbellRack(), 0, 1.35),
  ];
}

/** Lap pool: water plane sunk into a raised timber deck with stone coping. */
function lapPool(): Part[] {
  const L = 10;
  const W = 2.6;
  const deck = 0.3;
  return [
    part("box", "oak", 0, 0, -(W / 2 + 0.25), L + 1.2, deck, 0.5),
    part("box", "oak", 0, 0, W / 2 + 0.25, L + 1.2, deck, 0.5),
    part("box", "oak", -(L / 2 + 0.3), 0, 0, 0.6, deck, W),
    part("box", "oak", L / 2 + 0.3, 0, 0, 0.6, deck, W),
    part("box", "stone", 0, deck, -(W / 2 + 0.06), L, 0.03, 0.12),
    part("box", "stone", 0, deck, W / 2 + 0.06, L, 0.03, 0.12),
    part("box", "ceramic", 0, 0, 0, L, 0.1, W),
    part("box", "water", 0, 0.1, 0, L, 0.14, W),
    ...[-0.9, 0.9].map((z) => part("box", "brushed", L / 2 - 0.4, deck, z * 0.6, 0.05, 0.9, 0.05)),
  ];
}

/** Parasol over two loungers. */
function parasolSet(): Part[] {
  return [...put(lounger(), -0.5, 0), ...put(lounger(), 0.5, 0), ...put(parasol(), 0, -1.1)];
}

/** Treatment bed with a stool and side cabinet. */
function treatment(): Part[] {
  return [
    part("box", "rugLight", 0, 0, 0, 1.9, 0.012, 2.6),
    ...put(treatmentBed(), 0, 0),
    part("cyl", "leather", 0.7, 0, -0.5, 0.4, 0.5, 0.4),
    part("box", "walnut", -0.75, 0, -0.9, 0.4, 0.8, 0.5),
    ...put([part("cone", "lamp", 0, 0, 0, 0.3, 0.22, 0.3)], -0.75, -0.9).map(lift(0.8)),
  ];
}

/** Timber sauna cabin with a glass door on +Z and tiered benches. */
function sauna(): Part[] {
  const H = 2.2;
  return [
    part("box", "walnut", 0, 0, -1.0, 2.4, H, 0.1),
    part("box", "walnut", -1.15, 0, 0, 0.1, H, 2.0),
    part("box", "walnut", 1.15, 0, 0, 0.1, H, 2.0),
    part("box", "walnut", -0.7, 0, 1.0, 1.0, H, 0.1),
    part("box", "glass", 0.5, 0, 1.0, 1.3, H, 0.04),
    part("box", "oak", 0, 0, -0.6, 2.2, 0.45, 0.7),
    part("box", "oak", 0, 0, -0.85, 2.2, 0.9, 0.3),
    part("box", "stone", 0.8, 0, 0.5, 0.4, 0.5, 0.4),
  ];
}

/** Cold plunge pool, sunk into a stone plinth, with steps. */
function plungePool(): Part[] {
  return [
    part("box", "stone", 0, 0, -1.0, 2.0, 0.5, 0.3),
    part("box", "stone", 0, 0, 1.0, 2.0, 0.5, 0.3),
    part("box", "stone", -0.85, 0, 0, 0.3, 0.5, 1.7),
    part("box", "stone", 0.85, 0, 0, 0.3, 0.5, 1.7),
    part("box", "ceramic", 0, 0, 0, 1.4, 0.15, 1.7),
    part("box", "water", 0, 0.15, 0, 1.4, 0.28, 1.7),
    part("box", "stone", 0, 0, 1.35, 0.9, 0.25, 0.4),
  ];
}

/** Cocktail bar: counter with marble top and stools on +Z, back bar shelf. */
function bar(): Part[] {
  return [
    part("rbox", "walnut", 0, 0, 0, 3.4, 1.05, 0.7),
    part("box", "marble", 0, 1.05, 0, 3.6, 0.05, 0.8),
    part("box", "brass", 0, 0.12, 0.36, 3.2, 0.04, 0.02),
    part("box", "walnut", 0, 0, -1.05, 3.4, 0.9, 0.45),
    part("box", "glass", 0, 1.2, -1.15, 3.2, 0.9, 0.25),
    ...[-1.2, -0.4, 0.4, 1.2].flatMap((x) => [part("cyl", "brushed", x, 0, 0.75, 0.04, 0.72, 0.04), part("cyl", "leather", x, 0.72, 0.75, 0.38, 0.06, 0.38)]),
    ...[-0.8, 0.8].flatMap((x) => put([part("sphere", "lamp", 0, 0, 0, 0.28, 0.28, 0.28)], x, 0).map(lift(2.0))),
  ];
}

/** One row of four recliners (facing +Z) on a riser of `rise` metres. */
function cinemaRow(rise: number): Part[] {
  const out: Part[] = rise > 0 ? [part("box", "walnut", 0, 0, 0, 4.4, rise, 1.2)] : [];
  for (const x of [-1.5, -0.5, 0.5, 1.5]) out.push(...put(recliner(), x, 0.05).map(lift(rise)));
  out.push(part("box", "rug", 0, rise, 0, 4.4, 0.012, 1.2));
  return out;
}

/** Projection screen facing +Z with a low stage and acoustic panels. */
function cinemaScreen(): Part[] {
  return [
    part("box", "walnut", 0, 0, 0, 4.8, 0.3, 0.6),
    part("box", "screenBright", 0, 0.45, -0.15, 4.2, 1.9, 0.04),
    part("box", "metalDark", 0, 0.4, -0.2, 4.4, 2.0, 0.03),
    ...[-2.3, 2.3].map((x) => part("box", "fabricGrey", x, 0, -0.1, 0.2, 2.4, 0.3)),
  ];
}

/** Phone booth: acoustic box, glass front on +Z, stool and shelf. */
function phoneBooth(): Part[] {
  return [
    part("box", "fabricAccent", 0, 0, -0.55, 1.1, 2.2, 0.08),
    part("box", "fabricAccent", -0.52, 0, 0, 0.06, 2.2, 1.1),
    part("box", "fabricAccent", 0.52, 0, 0, 0.06, 2.2, 1.1),
    part("box", "lacquer", 0, 2.2, 0, 1.1, 0.06, 1.1),
    part("box", "glass", 0, 0, 0.55, 1.1, 2.2, 0.03),
    part("box", "oak", 0, 0.95, -0.35, 0.9, 0.04, 0.35),
    part("cyl", "leather", 0, 0, 0.05, 0.4, 0.6, 0.4),
  ];
}

/** Soft play mat with blocks and a little slide. */
function playMat(): Part[] {
  return [
    part("box", "fabricAccent", 0, 0, 0, 3.0, 0.05, 3.0),
    part("box", "play", -0.75, 0.05, -0.75, 1.5, 0.02, 1.5),
    part("box", "rugLight", 0.75, 0.05, 0.75, 1.5, 0.02, 1.5),
    part("rbox", "play", -0.9, 0.05, 0.7, 0.4, 0.4, 0.4),
    part("rbox", "lacquer", -0.4, 0.05, 0.9, 0.35, 0.35, 0.35),
    part("rbox", "fabricAccent", -0.65, 0.45, 0.8, 0.3, 0.3, 0.3),
    part("box", "lacquer", 0.9, 0.05, -0.9, 0.7, 0.8, 0.7),
    part("box", "play", 0.9, 0.35, -0.2, 0.5, 0.06, 1.0, 0),
  ];
}

/** Low round craft table with four stools. */
function kidsTable(): Part[] {
  return [
    part("cyl", "oak", 0, 0.45, 0, 1.0, 0.04, 1.0),
    part("cyl", "lacquer", 0, 0, 0, 0.12, 0.45, 0.12),
    ...[0, 1, 2, 3].flatMap((i) => put(kidsStool(), Math.cos((i * Math.PI) / 2) * 0.7, Math.sin((i * Math.PI) / 2) * 0.7)),
  ];
}

/** Planted island: turf, a tree in the middle, shrubs around the rim. */
function gardenIsland(): Part[] {
  return [
    part("cyl", "stone", 0, 0, 0, 3.8, 0.35, 3.8),
    part("cyl", "turf", 0, 0.35, 0, 3.6, 0.02, 3.6),
    ...put(tree(1.2), 0, 0).map(lift(0.35)),
    ...[0.6, 2.2, 3.8, 5.3].map((a) => part("sphere", "leaf", Math.cos(a) * 1.3, 0.3, Math.sin(a) * 1.3, 0.7, 0.6, 0.7)),
  ];
}

/** Long planter trough with shrubs and a bench in front (+Z). */
function planterBench(): Part[] {
  return [
    part("box", "stone", 0, 0, -0.45, 3.0, 0.55, 0.8),
    part("box", "turf", 0, 0.55, -0.45, 2.9, 0.02, 0.7),
    ...[-1.0, 0, 1.0].map((x) => part("sphere", "leaf", x, 0.45, -0.45, 0.8, 0.7, 0.6)),
    part("box", "oak", 0, 0.42, 0.35, 2.4, 0.06, 0.5),
    ...[-1.0, 1.0].map((x) => part("box", "stone", x, 0, 0.35, 0.2, 0.42, 0.45)),
  ];
}

/** Stepping-stone path on turf, running along Z. */
function gardenPath(): Part[] {
  const out: Part[] = [part("box", "turf", 0, 0, 0, 1.4, 0.02, 5.0)];
  for (let i = 0; i < 6; i++) out.push(part("cyl", "stone", (i % 2 ? 0.12 : -0.12), 0.02, -2.1 + i * 0.84, 0.6, 0.03, 0.5));
  return out;
}

/** Two lounge chairs and a side table, facing +Z (the glass). */
function viewChairs(): Part[] {
  const chair = (x: number) => [
    part("rbox", "fabricCream", x, 0, 0, 0.8, 0.4, 0.8),
    part("rbox", "fabricCream", x, 0.3, -0.33, 0.8, 0.55, 0.16, 0),
  ];
  return [part("box", "rugLight", 0, 0, 0, 2.0, 0.012, 1.3), ...chair(-0.55), ...chair(0.55), part("cyl", "brass", 0, 0, -0.35, 0.35, 0.5, 0.35)];
}

/** Brass telescope on a tripod, pointing +Z. */
function telescope(): Part[] {
  return [
    ...[0, 2.1, 4.2].map((a) => part("box", "metalDark", Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, 0.03, 1.2, 0.03)),
    part("cyl", "brass", 0, 1.2, 0.1, 0.14, 0.14, 0.9),
    part("cyl", "metalDark", 0, 1.2, 0.58, 0.18, 0.18, 0.06),
  ];
}

/** Chef's table for twelve with pendants. */
function chefTable(): Part[] {
  const out: Part[] = [
    part("box", "walnut", 0, 0.72, 0, 4.6, 0.05, 1.1),
    ...[-2.0, 2.0].map((x) => part("box", "metalDark", x, 0, 0, 0.1, 0.72, 0.9)),
  ];
  const chair = (): Part[] => [part("rbox", "leather", 0, 0.42, 0, 0.46, 0.07, 0.46), part("rbox", "leather", 0, 0.48, -0.21, 0.44, 0.44, 0.05), part("box", "metalDark", 0, 0, 0, 0.3, 0.42, 0.3)];
  for (const x of [-1.8, -0.9, 0, 0.9, 1.8]) out.push(...put(chair(), x, 0.8, Math.PI), ...put(chair(), x, -0.8));
  out.push(...put(chair(), 2.65, 0, -Math.PI / 2), ...put(chair(), -2.65, 0, Math.PI / 2));
  for (const x of [-1.5, 0, 1.5]) out.push(part("cyl", "metalDark", x, 1.9, 0, 0.01, 0.6, 0.01), part("sphere", "lamp", x, 1.75, 0, 0.35, 0.3, 0.35));
  return out;
}

/** Golf simulator bay: turf, tee mat at +Z, impact screen at −Z, side netting. */
function golfBay(): Part[] {
  return [
    part("box", "turf", 0, 0, 0, 4.4, 0.03, 5.8),
    part("box", "screenBright", 0, 0.03, -2.85, 4.2, 2.35, 0.05),
    part("box", "metalDark", 0, 2.38, -1.4, 4.4, 0.05, 3.0),
    ...[-2.2, 2.2].map((x) => part("box", "glass", x, 0.03, -1.4, 0.03, 2.35, 3.0)),
    part("box", "rubber", 0, 0.03, 1.4, 1.6, 0.03, 1.6),
    part("box", "turf", 0.2, 0.06, 1.2, 0.7, 0.02, 0.7),
    part("sphere", "ceramic", 0.2, 0.08, 1.05, 0.05, 0.05, 0.05),
    part("cyl", "metalDark", -1.5, 0.03, 2.2, 0.1, 1.0, 0.1),
    part("box", "screen", -1.5, 1.0, 2.2, 0.5, 0.35, 0.05),
    ...put([part("cyl", "leather", 0, 0, 0, 0.3, 0.9, 0.3), part("box", "metalDark", 0.2, 0.2, 0, 0.1, 0.9, 0.1)], 1.7, 2.3),
  ];
}

/* --------------------------------------------------------------- registry */

export type AmenityPieceId =
  | "cardioRow"
  | "bikeRow"
  | "weightsZone"
  | "lapPool"
  | "parasolSet"
  | "lounger"
  | "treatment"
  | "sauna"
  | "plungePool"
  | "bar"
  | "cinemaRow0"
  | "cinemaRow1"
  | "cinemaRow2"
  | "cinemaScreen"
  | "phoneBooth"
  | "playMat"
  | "kidsTable"
  | "gardenIsland"
  | "planterBench"
  | "gardenPath"
  | "viewChairs"
  | "telescope"
  | "chefTable"
  | "golfBay"
  | "tree";

/** Amenity pieces (footprints in metres), spread into kit.ts's PIECES. */
export const AMENITY_PIECES: Record<AmenityPieceId, { build: () => Part[]; w: number; d: number }> = {
  cardioRow: { build: cardioRow, w: 3.9, d: 2.2 },
  bikeRow: { build: bikeRow, w: 3.2, d: 1.4 },
  weightsZone: { build: weightsZone, w: 4.4, d: 3.4 },
  lapPool: { build: lapPool, w: 11.2, d: 3.6 },
  parasolSet: { build: parasolSet, w: 2.3, d: 2.4 },
  lounger: { build: lounger, w: 0.7, d: 1.9 },
  treatment: { build: treatment, w: 1.9, d: 2.6 },
  sauna: { build: sauna, w: 2.4, d: 2.1 },
  plungePool: { build: plungePool, w: 2.0, d: 3.0 },
  bar: { build: bar, w: 3.6, d: 2.6 },
  cinemaRow0: { build: () => cinemaRow(0), w: 4.4, d: 1.2 },
  cinemaRow1: { build: () => cinemaRow(0.25), w: 4.4, d: 1.2 },
  cinemaRow2: { build: () => cinemaRow(0.5), w: 4.4, d: 1.2 },
  cinemaScreen: { build: cinemaScreen, w: 4.8, d: 0.6 },
  phoneBooth: { build: phoneBooth, w: 1.1, d: 1.1 },
  playMat: { build: playMat, w: 3.0, d: 3.0 },
  kidsTable: { build: kidsTable, w: 1.8, d: 1.8 },
  gardenIsland: { build: gardenIsland, w: 3.8, d: 3.8 },
  planterBench: { build: planterBench, w: 3.0, d: 1.7 },
  gardenPath: { build: gardenPath, w: 1.4, d: 5.0 },
  viewChairs: { build: viewChairs, w: 2.0, d: 1.3 },
  telescope: { build: telescope, w: 0.6, d: 0.8 },
  chefTable: { build: chefTable, w: 5.8, d: 2.6 },
  golfBay: { build: golfBay, w: 4.4, d: 5.8 },
  tree: { build: () => tree(1.3), w: 2.1, d: 2.1 },
};

/* ---------------------------------------------------------------- recipes */

/** Kit pieces the amenity recipes reuse (a subset of kit PieceId). */
type CorePiece = "lounge" | "reception" | "plantLarge" | "plant" | "bench" | "deskCluster" | "conference" | "kitchen" | "dining6" | "cafe";

/** The furniture planner (layouts.ts) as seen by the recipes. */
export interface AmenityPlanner {
  add(piece: AmenityPieceId | CorePiece, x: number, z: number, rot?: number): boolean;
}

type P = AmenityPlanner;
type Piece = AmenityPieceId | CorePiece;

/** Facing rotations: the piece's +Z side points at that facade. */
const FACE = { pz: 0, px: Math.PI / 2, nz: Math.PI, nx: -Math.PI / 2 } as const;

/**
 * Spots along the four facades, `inset` metres in from the glass, `step`
 * apart, each facing that facade (or facing inwards with `inward`).
 */
function ring(A: number, B: number, inset: number, step: number, inward = false): [number, number, number][] {
  const out: [number, number, number][] = [];
  const along = (half: number) => {
    const n = Math.max(0, Math.floor((half * 2 - 2) / step));
    return Array.from({ length: n + 1 }, (_, i) => -((n * step) / 2) + i * step);
  };
  for (const t of along(A)) out.push([t, B - inset, inward ? FACE.nz : FACE.pz], [-t, -(B - inset), inward ? FACE.pz : FACE.nz]);
  for (const t of along(B)) out.push([A - inset, -t, inward ? FACE.nx : FACE.px], [-(A - inset), t, inward ? FACE.px : FACE.nx]);
  return out;
}

/** Try spots in turn until one fits; returns whether any did. */
const first = (p: P, piece: Piece, spots: [number, number, number][]) => spots.some(([x, z, r]) => p.add(piece, x, z, r));
/** Place a piece at as many of the spots as fit (up to `max`). */
function many(p: P, piece: Piece, spots: [number, number, number][], max = Infinity) {
  let n = 0;
  for (const [x, z, r] of spots) {
    if (n >= max) break;
    if (p.add(piece, x, z, r)) n++;
  }
  return n;
}
/** Regular grid fill (like the office desk grid). */
function grid(p: P, piece: Piece, A: number, B: number, sx: number, sz: number, margin: number, rot = 0) {
  for (let z = -B + margin; z <= B - margin; z += sz) for (let x = -A + margin; x <= A - margin; x += sx) p.add(piece, x, z, rot);
}
/** The four facade mid-points at `inset`, facing out, starting with +Z. */
const sides = (A: number, B: number, inset: number): [number, number, number][] => [
  [0, B - inset, FACE.pz],
  [0, -(B - inset), FACE.nz],
  [A - inset, 0, FACE.px],
  [-(A - inset), 0, FACE.nx],
];
const corners = (A: number, B: number, inset: number): [number, number, number][] => [
  [A - inset, B - inset, 0],
  [-(A - inset), B - inset, 0],
  [-(A - inset), -(B - inset), 0],
  [A - inset, -(B - inset), 0],
];

function skyLobby(p: P, A: number, B: number) {
  first(p, "reception", [[0, B - 2.6, FACE.nz], [A - 2.6, 0, FACE.nx], [0, -(B - 2.6), FACE.pz]]);
  many(p, "lounge", [...sides(A, B, 3.4).slice(1), ...corners(A, B, 4.2)], 5);
  many(p, "plantLarge", corners(A, B, 1.6));
  many(p, "bench", ring(A, B, 0.9, 5.5), 6);
  many(p, "plant", ring(A, B, 0.8, 3.1), 10);
}

function gym(p: P, A: number, B: number) {
  // Cardio faces the view; free weights against the core side.
  many(p, "cardioRow", [...ring(A, B, 1.5, 4.4)], 8);
  many(p, "weightsZone", ring(A, B, 5.0, 5.0, true), 3);
  many(p, "bikeRow", ring(A, B, 4.4, 3.6), 3);
  many(p, "plantLarge", corners(A, B, 1.2));
}

function pool(p: P, A: number, B: number) {
  first(p, "lapPool", sides(A, B, 2.3));
  many(p, "parasolSet", ring(A, B, 1.7, 3.0, true).filter(([, , r]) => r !== FACE.nz), 8);
  many(p, "parasolSet", ring(A, B, 4.6, 3.0, true), 4);
  many(p, "plantLarge", corners(A, B, 1.3));
  many(p, "bar", sides(A, B, 5.4).slice(1), 1);
}

function spa(p: P, A: number, B: number) {
  many(p, "treatment", ring(A, B, 1.6, 2.6, true).filter(([x]) => x > 0), 4);
  first(p, "sauna", [[-(A - 1.4), -(B / 3), FACE.px], [-(A - 1.4), B / 3, FACE.px], [0, -(B - 1.4), FACE.pz]]);
  first(p, "plungePool", [[-(A - 1.8), B / 3 + 2.8, FACE.px], [-(A - 1.8), -(B / 3) - 3, FACE.px], [-3.2, -(B - 1.8), FACE.pz]]);
  first(p, "lounge", [[0, B - 2.2, 0], [-(A - 2.4), 0, 0], [0, -(B - 2.2), 0]]);
  many(p, "lounger", ring(A, B, 1.3, 1.0, true).filter(([x, z]) => z > 0 && x < 0), 4);
  many(p, "plantLarge", corners(A, B, 1.2));
  many(p, "plant", ring(A, B, 0.8, 3.3), 8);
}

function lounge(p: P, A: number, B: number) {
  first(p, "bar", [[0, B - 1.6, FACE.nz], [0, -(B - 1.6), FACE.pz], [A - 1.6, 0, FACE.nx]]);
  many(p, "lounge", [...ring(A, B, 2.2, 4.2)], 8);
  many(p, "plantLarge", corners(A, B, 1.2));
  many(p, "plant", ring(A, B, 0.8, 3.7), 8);
}

function cinema(p: P, A: number, B: number) {
  // Screen on the −Z facade; rows step up away from it (seats face the screen).
  if (p.add("cinemaScreen", 0, -(B - 0.7), FACE.pz)) {
    const rows: AmenityPieceId[] = ["cinemaRow0", "cinemaRow1", "cinemaRow2"];
    rows.forEach((r, i) => {
      const z = -(B - 3.4 - i * 1.3);
      if (!p.add(r, 0, z, FACE.nz)) first(p, r, [[-4.6, z, FACE.nz], [4.6, z, FACE.nz]]);
    });
  }
  // Foyer on the other side.
  first(p, "bar", [[0, B - 1.6, FACE.nz], [A - 1.6, 0, FACE.nx]]);
  many(p, "lounge", ring(A, B, 2.2, 4.2).filter(([, z]) => z > -B / 3), 4);
  many(p, "plantLarge", corners(A, B, 1.2));
}

function coworking(p: P, A: number, B: number) {
  first(p, "conference", [[0, B - 2.2, 0], [0, -(B - 2.2), 0]]);
  many(p, "phoneBooth", ring(A, B, 0.9, 1.4, true).filter(([x]) => x < -A / 2), 6);
  first(p, "cafe", [[A - 1.3, -(B / 2), FACE.nx], [A - 1.3, B / 2, FACE.nx]]);
  grid(p, "deskCluster", A, B, 2.9, 3.3, 1.9);
  many(p, "plantLarge", corners(A, B, 0.9));
}

function kids(p: P, A: number, B: number) {
  many(p, "playMat", ring(A, B, 2.0, 4.2), 4);
  many(p, "kidsTable", ring(A, B, 4.6, 3.4, true), 4);
  many(p, "lounge", ring(A, B, 2.2, 4.4), 2);
  many(p, "playMat", ring(A, B, 2.0, 3.3), 2);
  many(p, "plantLarge", corners(A, B, 1.2));
}

function skyGarden(p: P, A: number, B: number) {
  // Paths cross the plate on the axes; islands and trees fill the quadrants.
  many(p, "gardenPath", [[0, B - 3.0, 0], [0, -(B - 3.0), 0], [A - 3.0, 0, Math.PI / 2], [-(A - 3.0), 0, Math.PI / 2]]);
  grid(p, "gardenIsland", A, B, 5.0, 5.0, 2.4);
  many(p, "planterBench", ring(A, B, 1.1, 3.4, true), 10);
  grid(p, "tree", A, B, 3.2, 3.2, 1.4);
  many(p, "bench", ring(A, B, 3.2, 3.0), 6);
}

function observation(p: P, A: number, B: number) {
  many(p, "viewChairs", ring(A, B, 1.0, 3.0));
  many(p, "telescope", ring(A, B, 0.7, 1.5));
  many(p, "plant", ring(A, B, 0.7, 2.2), 8);
}

function dining(p: P, A: number, B: number) {
  first(p, "chefTable", [[0, B - 4.3, 0], [0, -(B - 4.3), 0]]);
  first(p, "kitchen", [[0, B - 1.6, FACE.nz], [0, -(B - 1.6), FACE.pz]]);
  first(p, "bar", [[0, -(B - 1.6), FACE.pz], [A - 1.6, 0, FACE.nx]]);
  many(p, "dining6", ring(A, B, 1.7, 3.6), 4);
  many(p, "lounge", ring(A, B, 2.2, 4.4), 2);
  many(p, "plantLarge", corners(A, B, 1.2));
}

function golf(p: P, A: number, B: number) {
  // Tee towards the core, screen towards the glass.
  many(p, "golfBay", [
    [-(A / 2 - 0.5), B - 3.3, FACE.nz],
    [A / 2 - 0.5, B - 3.3, FACE.nz],
    [0, B - 3.3, FACE.nz],
    [0, -(B - 3.3), FACE.pz],
    [A - 3.3, 0, FACE.nx],
  ], 2);
  first(p, "bar", [[0, -(B - 1.6), FACE.pz], [-(A - 1.6), 0, FACE.px]]);
  many(p, "lounge", ring(A, B, 2.2, 4.4), 3);
  many(p, "plantLarge", corners(A, B, 1.2));
}

const RECIPES: Record<AmenityKind, (p: P, A: number, B: number) => void> = {
  "sky-lobby": skyLobby,
  gym,
  pool,
  spa,
  lounge,
  cinema,
  coworking,
  kids,
  "sky-garden": skyGarden,
  observation,
  dining,
  "golf-sim": golf,
};

/** Furnish an amenity floor (A, B = half plate width / depth, metres). */
export function amenityLayout(p: AmenityPlanner, kind: AmenityKind, A: number, B: number) {
  RECIPES[kind](p, A, B);
}

/** Pieces the room planner encloses in glass (spa treatment rooms, sauna, cinema). */
export const GLASS_ROOM_PIECES: Partial<Record<AmenityKind, string[][]>> = {
  spa: [["treatment"]],
  cinema: [["cinemaScreen", "cinemaRow0", "cinemaRow1", "cinemaRow2"]],
};
