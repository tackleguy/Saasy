/**
 * Furniture kit — real-size procedural furniture, no external model files.
 * -----------------------------------------------------------------------------
 * Every piece is described in REAL METRES as a list of `Part`s: a unit
 * primitive (box, rounded box, cylinder, sphere…) with a material, a centre
 * position, a size and an optional Y rotation. Pieces face +Z (the side you
 * sit on / walk up to) and sit on y = 0.
 *
 * Parts are later batched by (geometry, material) into InstancedMeshes, so a
 * fully furnished office floor with hundreds of chairs is ~20 draw calls.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { fabricTexture, marbleTexture, plasterTexture, tilePerUnit, woodTexture } from "../textures";
import { AMENITY_PIECES, type AmenityPieceId } from "./amenities";

/* ------------------------------------------------------------------ geometry */

export type GeoKey = "box" | "rbox" | "cyl" | "cone" | "sphere" | "arch";

/** Arch wall size (metres) — built at true size, so its parts use scale 1. */
const ARCH = { w: 3.2, h: 2.5, t: 0.15 };

/**
 * A plaster wall with a round-headed doorway, centred on the origin.
 * The opening is a notch cut up from the bottom edge (one simple polygon).
 */
function archWallGeometry(): THREE.BufferGeometry {
  const { w, h, t } = ARCH;
  const r = 0.62;
  const spring = 1.55;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-r, 0);
  s.lineTo(-r, spring);
  s.absarc(0, spring, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, -h / 2, -t / 2);
  return g;
}

/** Unit-sized shared geometries (scaled per instance). */
let geos: Record<GeoKey, THREE.BufferGeometry> | null = null;
export function getGeometries() {
  if (!geos) {
    geos = {
      box: new THREE.BoxGeometry(1, 1, 1),
      rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.16),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
      cone: new THREE.CylinderGeometry(0.28, 0.5, 1, 20, 1, true),
      sphere: new THREE.SphereGeometry(0.5, 18, 12),
      arch: archWallGeometry(),
    };
  }
  return geos;
}

/* ----------------------------------------------------------------- materials */

export type MatKey =
  | "oak"
  | "walnut"
  | "lacquer"
  | "fabricGrey"
  | "fabricCream"
  | "fabricAccent"
  | "leather"
  | "metalDark"
  | "brushed"
  | "brass"
  | "marble"
  | "screen"
  | "leaf"
  | "stone"
  | "water"
  | "rug"
  | "rugLight"
  | "linen"
  | "piano"
  | "lamp"
  | "plaster"
  | "ceramic"
  | "glass"
  // amenity fit-outs (./amenities)
  | "rubber"
  | "turf"
  | "screenBright"
  | "play";

/** PBR materials shared by every furniture instance. */
let mats: Record<MatKey, THREE.Material> | null = null;
export function getMaterials() {
  if (!mats) {
    const std = (color: string, roughness: number, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    // Textured materials tile per real metre (parts are instanced and scaled in metres).
    const textured = (map: THREE.Texture, roughness: number, perMetre: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const m = new THREE.MeshStandardMaterial({ map, roughness, ...extra });
      tilePerUnit(m, perMetre);
      return m;
    };
    mats = {
      oak: textured(woodTexture("#c9a57a", "#8b6a48"), 0.55, 0.8),
      walnut: textured(woodTexture("#8a6748", "#4a3324", 31), 0.5, 0.8),
      lacquer: std("#ece6dc", 0.4),
      fabricGrey: textured(fabricTexture("#d8d0c2"), 0.97, 3), // warm oatmeal
      fabricCream: textured(fabricTexture("#F1EBE0"), 0.98, 3), // boucle
      fabricAccent: textured(fabricTexture("#A9B39B"), 0.9, 3), // sage
      leather: std("#6e4a33", 0.55),
      metalDark: std("#26292e", 0.35, 0.8),
      brushed: std("#b9bec5", 0.3, 0.9),
      brass: std("#c9a24a", 0.28, 1),
      marble: textured(marbleTexture(), 0.18, 0.6),
      screen: std("#0a0c10", 0.2, 0.2, { emissive: new THREE.Color("#1d3b5c"), emissiveIntensity: 0.5 }),
      leaf: std("#6f8a62", 0.8),
      stone: std("#cfc6b7", 0.75),
      water: new THREE.MeshPhysicalMaterial({ color: "#4fb3d6", roughness: 0.05, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1 }),
      rug: textured(fabricTexture("#c8bba5"), 1, 2),
      rugLight: textured(fabricTexture("#e2d8c7"), 1, 2),
      linen: textured(fabricTexture("#f6f2ea"), 0.9, 4),
      plaster: textured(plasterTexture("#E7DFD2"), 0.95, 0.5),
      ceramic: std("#f7f6f2", 0.12, 0, { envMapIntensity: 1.2 }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#dfeef0", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }),
      piano: std("#0d0e11", 0.12, 0.3, { envMapIntensity: 1.5 }),
      lamp: std("#fff1d6", 0.6, 0, { emissive: new THREE.Color("#ffcf8a"), emissiveIntensity: 1.2, side: THREE.DoubleSide }),
      rubber: std("#2b2d30", 0.95),
      turf: textured(fabricTexture("#6f9a58"), 1, 4),
      screenBright: std("#dfe8f0", 0.4, 0, { emissive: new THREE.Color("#9cc4e8"), emissiveIntensity: 0.9 }),
      play: std("#e08a6a", 0.7),
    };
  }
  return mats;
}

/* --------------------------------------------------------------------- parts */

export interface Part {
  g: GeoKey;
  m: MatKey;
  /** Centre position, metres. */
  p: [number, number, number];
  /** Size, metres. */
  s: [number, number, number];
  /** Rotation about Y, radians. */
  r?: number;
}

/** A part whose `y` is given as its BOTTOM (much easier to read than centres). */
const part = (g: GeoKey, m: MatKey, x: number, y0: number, z: number, sx: number, sy: number, sz: number, r = 0): Part => ({
  g,
  m,
  p: [x, y0 + sy / 2, z],
  s: [sx, sy, sz],
  r,
});

/** Rotate a set of parts about Y by `rot` and translate them to (x, z). */
export function place(parts: Part[], x: number, z: number, rot = 0): Part[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return parts.map((p) => ({
    ...p,
    p: [x + p.p[0] * c + p.p[2] * s, p.p[1], z - p.p[0] * s + p.p[2] * c],
    r: (p.r ?? 0) + rot,
  }));
}

/* -------------------------------------------------------------- single items */

function desk(): Part[] {
  return [
    part("box", "oak", 0, 0.72, 0, 1.2, 0.03, 0.8),
    part("box", "metalDark", -0.56, 0, 0, 0.04, 0.72, 0.7),
    part("box", "metalDark", 0.56, 0, 0, 0.04, 0.72, 0.7),
  ];
}

function monitor(): Part[] {
  return [
    part("box", "metalDark", 0, 0.75, -0.05, 0.22, 0.012, 0.16),
    part("box", "metalDark", 0, 0.75, -0.08, 0.04, 0.26, 0.03),
    part("box", "screen", 0, 0.86, -0.05, 0.58, 0.34, 0.025),
  ];
}

function taskChair(): Part[] {
  return [
    part("cyl", "metalDark", 0, 0, 0, 0.62, 0.04, 0.62),
    part("cyl", "brushed", 0, 0.04, 0, 0.05, 0.4, 0.05),
    part("rbox", "fabricGrey", 0, 0.44, 0, 0.5, 0.08, 0.48),
    part("rbox", "fabricGrey", 0, 0.55, -0.23, 0.46, 0.52, 0.07),
  ];
}

function diningChair(mat: MatKey = "fabricCream"): Part[] {
  const legs = [-0.19, 0.19].flatMap((x) => [-0.19, 0.19].map((z) => part("box", "walnut", x, 0, z, 0.035, 0.45, 0.035)));
  return [...legs, part("rbox", mat, 0, 0.44, 0, 0.46, 0.07, 0.46), part("rbox", mat, 0, 0.5, -0.21, 0.44, 0.44, 0.05)];
}

function barStool(): Part[] {
  return [
    part("cyl", "brushed", 0, 0, 0, 0.36, 0.02, 0.36),
    part("cyl", "brushed", 0, 0.02, 0, 0.04, 0.7, 0.04),
    part("cyl", "leather", 0, 0.72, 0, 0.38, 0.06, 0.38),
  ];
}

function sofa(w = 2.2, mat: MatKey = "fabricGrey"): Part[] {
  const inner = w - 0.4;
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => part("cyl", "metalDark", sx * (w / 2 - 0.12), 0, sz * 0.35, 0.04, 0.1, 0.04)));
  const cushions = inner > 1.2 ? 2 : 1;
  const cw = inner / cushions - 0.02;
  return [
    ...legs,
    part("rbox", mat, 0, 0.1, 0, w, 0.24, 0.9),
    ...Array.from({ length: cushions }, (_, i) => part("rbox", mat, -inner / 2 + cw / 2 + i * (cw + 0.02), 0.32, 0.06, cw, 0.15, 0.7)),
    part("rbox", mat, 0, 0.32, -0.35, w - 0.36, 0.44, 0.2),
    part("rbox", mat, -(w / 2 - 0.09), 0.1, 0, 0.18, 0.4, 0.9),
    part("rbox", mat, w / 2 - 0.09, 0.1, 0, 0.18, 0.4, 0.9),
    part("rbox", "fabricAccent", -(inner / 2 - 0.3), 0.45, -0.17, 0.42, 0.36, 0.12, 0.15),
  ];
}

function coffeeTable(w = 1.1, d = 0.6): Part[] {
  return [
    part("box", "walnut", 0, 0.36, 0, w, 0.04, d),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => part("box", "metalDark", sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), 0.03, 0.36, 0.03))),
  ];
}

function floorLamp(): Part[] {
  return [
    part("cyl", "metalDark", 0, 0, 0, 0.3, 0.02, 0.3),
    part("cyl", "brass", 0, 0.02, 0, 0.025, 1.4, 0.025),
    part("cone", "lamp", 0, 1.35, 0, 0.42, 0.3, 0.42),
  ];
}

function plant(size = 1): Part[] {
  return [
    part("cyl", "stone", 0, 0, 0, 0.42 * size, 0.45 * size, 0.42 * size),
    part("sphere", "leaf", 0, 0.38 * size, 0, 0.7 * size, 0.85 * size, 0.7 * size),
    part("sphere", "leaf", 0.14 * size, 0.85 * size, -0.06 * size, 0.5 * size, 0.6 * size, 0.5 * size),
  ];
}

function tableLamp(): Part[] {
  return [part("cyl", "brass", 0, 0, 0, 0.12, 0.28, 0.12), part("cone", "lamp", 0, 0.24, 0, 0.3, 0.22, 0.3)];
}

function pendant(y: number): Part[] {
  return [part("cyl", "metalDark", 0, y + 0.3, 0, 0.01, 0.5, 0.01), part("sphere", "lamp", 0, y, 0, 0.3, 0.3, 0.3)];
}

/* ---------------------------------------------------------------- ensembles */

/** Four facing desks with monitors, task chairs and a privacy screen. */
function deskCluster(): Part[] {
  const out: Part[] = [];
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const x = sx * 0.6;
      const z = sz * 0.4;
      const facing = sz > 0 ? 0 : Math.PI; // the sitter is on the outside of the cluster
      out.push(...place(desk(), x, z));
      out.push(...place(monitor(), x, sz * 0.2, facing));
      out.push(...place(taskChair(), x, sz * 1.15, facing + Math.PI));
    }
  }
  out.push(part("box", "fabricGrey", 0, 0.75, 0, 2.4, 0.36, 0.03));
  return out;
}

function conferenceSet(): Part[] {
  const out: Part[] = [
    part("box", "walnut", 0, 0.72, 0, 3.6, 0.05, 1.2),
    part("box", "metalDark", -1.1, 0, 0, 0.3, 0.72, 0.8),
    part("box", "metalDark", 1.1, 0, 0, 0.3, 0.72, 0.8),
  ];
  for (const x of [-1.35, -0.45, 0.45, 1.35]) {
    out.push(...place(taskChair(), x, 0.95, Math.PI));
    out.push(...place(taskChair(), x, -0.95, 0));
  }
  out.push(...place(taskChair(), 2.2, 0, -Math.PI / 2), ...place(taskChair(), -2.2, 0, Math.PI / 2));
  out.push(...place(pendant(2.1), -0.9, 0), ...place(pendant(2.1), 0.9, 0));
  return out;
}

/** Sofa, armchairs, coffee table, rug, TV console, lamp and plant. */
function livingSet(): Part[] {
  return [
    part("box", "rug", 0, 0, -0.35, 3.4, 0.012, 2.8),
    ...place(sofa(2.4), 0, -1.4),
    ...place(coffeeTable(), 0, -0.3),
    ...place(sofa(0.95, "fabricCream"), -1.55, -0.3, Math.PI / 2),
    ...place(sofa(0.95, "fabricCream"), 1.55, -0.3, -Math.PI / 2),
    part("box", "walnut", 0, 0, 1.55, 1.8, 0.45, 0.4),
    part("box", "screen", 0, 0.75, 1.6, 1.4, 0.8, 0.04),
    ...place(floorLamp(), 1.45, -1.55),
    ...place(plant(), -1.55, -1.55),
  ];
}

/** Two sofas facing across a coffee table on a rug. */
function loungeGroup(): Part[] {
  return [
    part("box", "rugLight", 0, 0, 0, 3.8, 0.012, 3.2),
    ...place(sofa(2.2), 0, -1.1),
    ...place(sofa(2.2, "fabricCream"), 0, 1.1, Math.PI),
    ...place(coffeeTable(1.4, 0.8), 0, 0),
    ...place(plant(1.2), 1.65, -1.35),
  ];
}

function bedSet(): Part[] {
  return [
    part("box", "rugLight", 0, 0, 0.5, 2.6, 0.012, 1.8),
    part("box", "walnut", 0, 0, 0, 1.95, 0.28, 2.15),
    part("rbox", "linen", 0, 0.28, 0.03, 1.85, 0.24, 2.02),
    part("rbox", "fabricCream", 0, 0.48, 0.34, 1.9, 0.07, 1.38),
    part("box", "fabricAccent", 0, 0.55, 0.78, 1.9, 0.02, 0.42),
    part("rbox", "linen", -0.45, 0.5, -0.72, 0.64, 0.14, 0.38),
    part("rbox", "linen", 0.45, 0.5, -0.72, 0.64, 0.14, 0.38),
    part("rbox", "fabricGrey", 0, 0, -1.1, 2.1, 1.05, 0.1),
    ...[-1, 1].flatMap((sx) => [part("box", "walnut", sx * 1.35, 0, -0.85, 0.5, 0.45, 0.4), ...place(tableLamp(), sx * 1.35, -0.85).map(liftBy(0.45))]),
  ];
}

/** Second bedroom: 1.5 m double bed, one nightstand with lamp, rug. */
function bedDouble(): Part[] {
  return [
    part("box", "rugLight", 0.1, 0, 0.45, 2.2, 0.012, 1.6),
    part("box", "oak", 0.1, 0, 0, 1.6, 0.28, 2.1),
    part("rbox", "linen", 0.1, 0.28, 0.03, 1.5, 0.22, 1.98),
    part("rbox", "fabricAccent", 0.1, 0.46, 0.34, 1.55, 0.07, 1.34),
    part("rbox", "linen", -0.26, 0.48, -0.7, 0.56, 0.13, 0.36),
    part("rbox", "linen", 0.46, 0.48, -0.7, 0.56, 0.13, 0.36),
    part("rbox", "fabricCream", 0.1, 0, -1.08, 1.7, 0.95, 0.09),
    part("box", "oak", -1.05, 0, -0.85, 0.45, 0.45, 0.4),
    ...place(tableLamp(), -1.05, -0.85).map(liftBy(0.45)),
  ];
}

/**
 * Bathroom (2.6 × 2.3 m) with partition walls and a doorway on the +Z side:
 * vanity with basin and mirror, WC, walk-in shower behind a glass screen,
 * tiled floor. Walls stop at 2.4 m so the room reads from above.
 */
function bathroom(): Part[] {
  const H = 2.4;
  return [
    // Walls: back, sides, and a front wall split by a 0.85 m doorway (x −0.65 … 0.2)
    part("box", "plaster", 0, 0, -1.1, 2.6, H, 0.1),
    part("box", "plaster", -1.25, 0, 0, 0.1, H, 2.3),
    part("box", "plaster", 1.25, 0, 0, 0.1, H, 2.3),
    part("box", "plaster", -0.975, 0, 1.1, 0.65, H, 0.1),
    part("box", "plaster", 0.75, 0, 1.1, 1.1, H, 0.1),
    part("box", "plaster", -0.225, 2.05, 1.1, 0.85, H - 2.05, 0.1), // lintel over the door
    // Tiled floor
    part("box", "stone", 0, 0, 0, 2.4, 0.012, 2.1),
    // Vanity, basin, tap, mirror
    part("box", "walnut", -0.65, 0.12, -0.8, 1.0, 0.68, 0.5),
    part("box", "marble", -0.65, 0.8, -0.8, 1.05, 0.04, 0.55),
    part("cyl", "ceramic", -0.65, 0.84, -0.78, 0.42, 0.1, 0.32),
    part("cyl", "brushed", -0.65, 0.84, -0.99, 0.03, 0.22, 0.03),
    part("box", "brushed", -0.65, 1.1, -1.04, 0.9, 0.75, 0.02),
    // WC: tank, bowl, seat
    part("box", "ceramic", 0.2, 0.38, -0.97, 0.42, 0.38, 0.18),
    part("cyl", "ceramic", 0.2, 0, -0.68, 0.38, 0.4, 0.52),
    part("rbox", "lacquer", 0.2, 0.4, -0.68, 0.4, 0.04, 0.5),
    // Walk-in shower: tray, glass screen, rain head, towel rail
    part("box", "ceramic", 0.75, 0, 0.35, 0.9, 0.05, 1.3),
    part("box", "glass", 0.28, 0.05, 0.35, 0.02, 2.0, 1.3),
    part("cyl", "brushed", 0.75, 2.05, 0.35, 0.28, 0.02, 0.28),
    part("cyl", "brushed", 1.18, 0.1, 0.35, 0.02, 1.95, 0.02),
    part("box", "brushed", -1.18, 1.1, 0.2, 0.03, 0.03, 0.6),
    part("box", "linen", -1.16, 0.75, 0.2, 0.04, 0.36, 0.5),
  ];
}

function wardrobe(): Part[] {
  return [part("box", "lacquer", 0, 0, 0, 2.0, 2.2, 0.6), part("box", "brass", -0.02, 0.9, 0.305, 0.02, 0.4, 0.02), part("box", "brass", 0.02, 0.9, 0.305, 0.02, 0.4, 0.02)];
}

/** Island with stools, back counter run with upper cabinets, pendants. */
function kitchenSet(): Part[] {
  return [
    // back counter run
    part("box", "lacquer", 0, 0, -1.15, 3.6, 0.86, 0.62),
    part("box", "marble", 0, 0.86, -1.15, 3.64, 0.04, 0.66),
    part("box", "lacquer", 0, 1.5, -1.28, 3.6, 0.7, 0.36),
    part("box", "brushed", 0.6, 0.9, -1.2, 0.6, 0.02, 0.4),
    // island
    part("box", "walnut", 0, 0, 0.45, 2.4, 0.86, 1.0),
    part("box", "marble", 0, 0.86, 0.45, 2.5, 0.04, 1.05),
    ...[-0.7, 0, 0.7].flatMap((x) => place(barStool(), x, 1.2)),
    ...place(pendant(1.95), -0.6, 0.45),
    ...place(pendant(1.95), 0.6, 0.45),
  ];
}

function diningSet(seats: 4 | 6): Part[] {
  const w = seats === 6 ? 2.4 : 1.6;
  const out: Part[] = [
    part("box", "oak", 0, 0.72, 0, w, 0.04, 0.95),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => part("box", "walnut", sx * (w / 2 - 0.08), 0, sz * 0.38, 0.06, 0.72, 0.06))),
    ...place(pendant(1.85), 0, 0),
  ];
  const xs = seats === 6 ? [-0.8, 0, 0.8] : [-0.4, 0.4];
  for (const x of xs) {
    out.push(...place(diningChair(), x, 0.72, Math.PI), ...place(diningChair(), x, -0.72, 0));
  }
  return out;
}

function grandPiano(): Part[] {
  return [
    ...[
      [-0.55, -0.7],
      [0.55, -0.7],
      [0, 0.75],
    ].map(([x, z]) => part("cyl", "piano", x, 0, z, 0.1, 0.62, 0.1)),
    part("rbox", "piano", 0, 0.62, 0, 1.5, 0.32, 1.9),
    part("box", "lacquer", 0, 0.7, 1.02, 1.42, 0.06, 0.18),
    part("box", "piano", 0, 0.76, 1.0, 1.46, 0.02, 0.22),
    part("rbox", "piano", 0, 0.44, 1.6, 0.8, 0.06, 0.36),
    ...[-0.35, 0.35].map((x) => part("box", "piano", x, 0, 1.6, 0.05, 0.44, 0.3)),
  ];
}

/** Plunge pool with marble coping and two loungers. */
function poolSet(): Part[] {
  const w = 2.0;
  const l = 4.4;
  return [
    part("box", "water", 0, 0, 0, w, 0.12, l),
    part("box", "marble", 0, 0, l / 2 + 0.125, w + 0.5, 0.15, 0.25),
    part("box", "marble", 0, 0, -(l / 2 + 0.125), w + 0.5, 0.15, 0.25),
    part("box", "marble", w / 2 + 0.125, 0, 0, 0.25, 0.15, l),
    part("box", "marble", -(w / 2 + 0.125), 0, 0, 0.25, 0.15, l),
    ...[-0.9, 0.9].flatMap((z) => [
      part("box", "lacquer", -(w / 2 + 0.75), 0, z, 0.65, 0.28, 1.8),
      part("rbox", "linen", -(w / 2 + 0.75), 0.28, z + 0.1, 0.6, 0.08, 1.5),
    ]),
  ];
}

function receptionDesk(): Part[] {
  return [
    part("rbox", "walnut", 0, 0, 0, 4.2, 1.05, 0.8),
    part("box", "marble", 0, 1.05, 0, 4.4, 0.04, 0.95),
    part("box", "brass", 0, 0.1, 0.405, 4.0, 0.06, 0.01),
    ...[-1, 1].flatMap((sx) => place(taskChair(), sx * 1.0, -0.95, 0)),
    ...[-1, 1].flatMap((sx) => place(monitor(), sx * 1.0, -0.2, Math.PI).map(liftBy(0.3))),
  ];
}

function cafeSet(): Part[] {
  return [
    part("cyl", "brushed", 0, 0, 0, 0.45, 0.02, 0.45),
    part("cyl", "brushed", 0, 0.02, 0, 0.06, 0.7, 0.06),
    part("cyl", "marble", 0, 0.72, 0, 0.8, 0.03, 0.8),
    ...place(diningChair("leather"), -0.65, 0, Math.PI / 2),
    ...place(diningChair("leather"), 0.65, 0, -Math.PI / 2),
  ];
}

/** Plaster partition with an arched doorway (true size — scale 1). */
function archWall(): Part[] {
  return [{ g: "arch", m: "plaster", p: [0, ARCH.h / 2, 0], s: [1, 1, 1] }];
}

/** Freestanding oval bathtub. */
function tub(): Part[] {
  return [
    part("cyl", "lacquer", 0, 0, 0, 0.82, 0.58, 1.7),
    part("cyl", "water", 0, 0.5, 0, 0.68, 0.03, 1.54),
    part("cyl", "brass", 0.3, 0.58, -0.72, 0.04, 0.16, 0.04),
  ];
}

function bench(): Part[] {
  return [part("box", "oak", 0, 0.4, 0, 2.0, 0.06, 0.5), part("box", "metalDark", -0.8, 0, 0, 0.06, 0.4, 0.45), part("box", "metalDark", 0.8, 0, 0, 0.06, 0.4, 0.45)];
}

/** Raise a set of parts by `dy` metres (e.g. a lamp standing on a nightstand). */
function liftBy(dy: number) {
  return (p: Part): Part => ({ ...p, p: [p.p[0], p.p[1] + dy, p.p[2]] });
}

/* ----------------------------------------------------------------- registry */

export type PieceId =
  | "deskCluster"
  | "conference"
  | "living"
  | "lounge"
  | "bed"
  | "wardrobe"
  | "kitchen"
  | "dining4"
  | "dining6"
  | "piano"
  | "pool"
  | "reception"
  | "cafe"
  | "bench"
  | "plant"
  | "plantLarge"
  | "archWall"
  | "tub"
  | "bedDouble"
  | "bathroom"
  | AmenityPieceId;

interface PieceDef {
  build: () => Part[];
  /** Footprint (w along X, d along Z) in metres, used for collision-free layout. */
  w: number;
  d: number;
}

export const PIECES: Record<PieceId, PieceDef> = {
  deskCluster: { build: deskCluster, w: 2.5, d: 2.9 },
  conference: { build: conferenceSet, w: 5.0, d: 2.9 },
  living: { build: livingSet, w: 4.0, d: 3.7 },
  lounge: { build: loungeGroup, w: 3.9, d: 3.4 },
  bed: { build: bedSet, w: 3.3, d: 2.4 },
  wardrobe: { build: wardrobe, w: 2.0, d: 0.6 },
  kitchen: { build: kitchenSet, w: 3.7, d: 3.0 },
  dining4: { build: () => diningSet(4), w: 1.8, d: 2.3 },
  dining6: { build: () => diningSet(6), w: 2.6, d: 2.4 },
  piano: { build: grandPiano, w: 1.6, d: 2.4 },
  pool: { build: poolSet, w: 4.4, d: 4.9 },
  reception: { build: receptionDesk, w: 4.5, d: 2.2 },
  cafe: { build: cafeSet, w: 2.0, d: 0.9 },
  bench: { build: bench, w: 2.0, d: 0.5 },
  plant: { build: () => plant(), w: 0.7, d: 0.7 },
  plantLarge: { build: () => plant(1.6), w: 1.1, d: 1.1 },
  archWall: { build: archWall, w: ARCH.w, d: ARCH.t },
  tub: { build: tub, w: 0.9, d: 1.8 },
  bedDouble: { build: bedDouble, w: 2.8, d: 2.4 },
  bathroom: { build: bathroom, w: 2.6, d: 2.3 },
  ...AMENITY_PIECES,
};

/** Single items and helpers, for other planners (e.g. the Aura Engine catalog). */
export const KIT = { part, sofa, coffeeTable, floorLamp, plant, tableLamp, pendant, desk, monitor, taskChair, diningChair, barStool, diningSet, wardrobe, tub, bench, liftBy };
