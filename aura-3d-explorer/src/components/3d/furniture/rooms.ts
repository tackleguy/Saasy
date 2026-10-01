/**
 * Apartment service rooms — foyer, coat closet, WC, laundry, pantry, walk-in
 * wardrobe and study.
 * -----------------------------------------------------------------------------
 * Same conventions as kit.ts: REAL METRES, pieces face +Z, sit on y = 0.
 * Unlike the kit bathroom these pieces carry only their CONTENTS: the
 * footprint (w × d) is the whole room including its walls, and the room plan
 * (lib/roomPlan) draws the walls (white partitions, T = 0.13 m, inset inside
 * the footprint) and the door on the piece's +Z face from `SERVICE_ROOMS`.
 * Contents stay inside the inner face of those walls.
 *
 * Pieces whose contents are not symmetric come with a mirrored twin (`…M`,
 * local x flipped) so the planner can keep e.g. the WC pan away from the door
 * in every quadrant (a rotation alone cannot mirror).
 *
 * Only imports TYPES from kit.ts (no runtime cycle); kit.ts spreads
 * `ROOM_PIECES` into its registry.
 */
import type { GeoKey, MatKey, Part } from "./kit";

const part = (g: GeoKey, m: MatKey, x: number, y0: number, z: number, sx: number, sy: number, sz: number, r = 0): Part => ({
  g,
  m,
  p: [x, y0 + sy / 2, z],
  s: [sx, sy, sz],
  r,
});

/** Partition thickness the room plan uses for these rooms (contents stay inside). */
const T = 0.13;

/* ------------------------------------------------------------------ rooms */

/** Entry foyer (open, no walls): runner rug, console with mirror + lamp along −X, coat stand. */
function foyer(): Part[] {
  return [
    part("box", "rug", 0.1, 0, 0.0, 0.95, 0.012, 1.55),
    // console against the −X edge
    part("box", "walnut", -0.5, 0.74, 0.2, 0.3, 0.04, 1.0),
    part("box", "walnut", -0.5, 0, -0.25, 0.28, 0.74, 0.04),
    part("box", "walnut", -0.5, 0, 0.65, 0.28, 0.74, 0.04),
    part("box", "walnut", -0.5, 0.18, 0.2, 0.26, 0.03, 0.9),
    part("box", "brushed", -0.63, 1.0, 0.2, 0.015, 0.75, 0.6),
    part("cyl", "brass", -0.5, 0.78, 0.5, 0.1, 0.24, 0.1),
    part("cone", "lamp", -0.5, 1.0, 0.5, 0.24, 0.18, 0.24),
    part("sphere", "leaf", -0.5, 0.78, -0.1, 0.2, 0.22, 0.2),
    // coat stand in the far corner
    part("cyl", "metalDark", 0.45, 0, 0.66, 0.32, 0.02, 0.32),
    part("cyl", "walnut", 0.45, 0.02, 0.66, 0.035, 1.72, 0.035),
    part("rbox", "fabricAccent", 0.45, 0.85, 0.54, 0.36, 0.78, 0.1, 0.2),
    part("rbox", "leather", 0.54, 1.0, 0.7, 0.3, 0.62, 0.09, -1.2),
  ];
}

/** Coat closet (1.6 × 0.8): hanging rail, hat shelf, coats, shoes. Bifold doors on +Z. */
function coatCloset(): Part[] {
  const coats: MatKey[] = ["fabricGrey", "leather", "fabricAccent", "fabricCream", "fabricGrey"];
  return [
    part("box", "oak", 0, 1.78, -0.05, 1.32, 0.025, 0.4),
    part("cyl", "brushed", 0, 1.62, -0.02, 1.3, 0.025, 0.025),
    ...coats.map((m, i) => part("rbox", m, -0.5 + i * 0.25, 0.75, -0.02, 0.09, 0.85, 0.44, (i % 2 ? 0.15 : -0.12))),
    part("box", "oak", 0, 0.18, -0.05, 1.32, 0.02, 0.38),
    part("box", "leather", -0.35, 0.2, -0.05, 0.26, 0.09, 0.3),
    part("box", "metalDark", 0.1, 0.2, -0.05, 0.26, 0.09, 0.3),
    part("box", "lacquer", 0, 1.81, -0.08, 0.36, 0.22, 0.3),
  ];
}

/** Powder room (1.5 × 1.9): WC on the back wall, small vanity on the +X wall, tiles. Door on +Z at x ≈ +0.2. */
function wc(): Part[] {
  return [
    part("box", "stone", 0, 0, 0, 1.5 - 2 * T, 0.012, 1.9 - 2 * T),
    // WC (back wall, −X side)
    part("box", "ceramic", -0.22, 0.36, -0.73, 0.4, 0.42, 0.16),
    part("cyl", "ceramic", -0.22, 0, -0.46, 0.36, 0.4, 0.5),
    part("rbox", "lacquer", -0.22, 0.4, -0.46, 0.38, 0.04, 0.48),
    part("box", "brushed", -0.22, 0.8, -0.8, 0.12, 0.02, 0.02),
    // wall-hung vanity, basin, mirror (+X wall)
    part("box", "walnut", 0.43, 0.5, -0.3, 0.36, 0.3, 0.6),
    part("box", "marble", 0.43, 0.8, -0.3, 0.38, 0.03, 0.62),
    part("cyl", "ceramic", 0.42, 0.83, -0.3, 0.28, 0.08, 0.36),
    part("cyl", "brushed", 0.58, 0.83, -0.3, 0.025, 0.18, 0.025),
    part("box", "brushed", 0.61, 1.05, -0.3, 0.015, 0.6, 0.5),
    part("cyl", "brass", 0.6, 1.2, 0.25, 0.04, 0.2, 0.04),
    part("cyl", "lamp", 0, 2.25, -0.1, 0.25, 0.03, 0.25),
  ];
}

/** Laundry closet (1.9 × 0.95): stacked washer + dryer, shelving, basket. Bifold doors on +Z. */
function laundry(): Part[] {
  const appliance = (y0: number): Part[] => [
    part("rbox", "lacquer", -0.45, y0, -0.05, 0.6, 0.84, 0.6),
    part("sphere", "metalDark", -0.45, y0 + 0.26, 0.25, 0.4, 0.4, 0.04),
    part("sphere", "glass", -0.45, y0 + 0.28, 0.27, 0.3, 0.3, 0.04),
    part("box", "screen", -0.6, y0 + 0.72, 0.25, 0.18, 0.06, 0.012),
  ];
  return [
    part("box", "stone", 0, 0, 0, 1.9 - 2 * T, 0.012, 0.95 - 2 * T),
    ...appliance(0.02),
    ...appliance(0.88),
    // open shelving to the side + worktop
    part("box", "marble", 0.36, 0.88, -0.07, 0.86, 0.035, 0.55),
    part("box", "oak", 0.36, 0, -0.07, 0.86, 0.88, 0.55),
    part("box", "oak", 0.36, 1.45, -0.17, 0.86, 0.025, 0.32),
    part("box", "oak", 0.36, 1.85, -0.17, 0.86, 0.025, 0.32),
    part("cyl", "ceramic", 0.15, 1.475, -0.17, 0.1, 0.24, 0.1),
    part("cyl", "fabricAccent", 0.3, 1.475, -0.17, 0.1, 0.2, 0.1),
    part("box", "linen", 0.55, 1.475, -0.17, 0.3, 0.12, 0.25),
    part("cyl", "fabricGrey", 0.55, 0.915, -0.07, 0.36, 0.3, 0.36),
  ];
}

/** Walk-in pantry (1.7 × 1.8): U of oak shelves stocked with jars and boxes. Door on +Z. */
function pantry(): Part[] {
  const out: Part[] = [part("box", "stone", 0, 0, 0, 1.7 - 2 * T, 0.012, 1.8 - 2 * T)];
  const ix = 0.85 - T;
  const iz = 0.9 - T;
  const sd = 0.34;
  const goods: MatKey[] = ["ceramic", "glass", "brass", "lacquer", "fabricAccent", "oak"];
  [0.4, 0.85, 1.3, 1.75].forEach((y, k) => {
    out.push(part("box", "oak", 0, y, -iz + sd / 2, 2 * ix, 0.025, sd));
    for (const sx of [-1, 1]) out.push(part("box", "oak", sx * (ix - sd / 2), y, sd / 2 - 0.1, sd, 0.025, 2 * iz - sd - 0.35));
    for (let i = 0; i < 5; i++) {
      const m = goods[(i + k) % goods.length];
      out.push(part(i % 2 ? "cyl" : "box", m, -ix + 0.2 + i * 0.27, y + 0.025, -iz + 0.17, 0.12, 0.18 + ((i + k) % 3) * 0.05, 0.12));
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) out.push(part("cyl", goods[(i + k + 2) % goods.length], sx * (ix - 0.17), y + 0.025, -0.3 + i * 0.3, 0.11, 0.2, 0.11));
  });
  out.push(part("cyl", "fabricGrey", 0, 0, -0.1, 0.4, 0.35, 0.4));
  return out;
}

/** Walk-in wardrobe (2.0 × 1.8): hanging rails down both sides, shoe shelves at the back, ottoman. Door on +Z. */
function wir(): Part[] {
  const ix = 1.0 - T;
  const iz = 0.9 - T;
  const out: Part[] = [part("box", "rugLight", 0, 0, 0.1, 0.7, 0.012, 1.0)];
  const clothes: MatKey[] = ["linen", "fabricGrey", "fabricAccent", "fabricCream", "leather", "linen"];
  for (const sx of [-1, 1]) {
    const x = sx * (ix - 0.28);
    out.push(part("box", "walnut", sx * (ix - 0.02), 0, -0.2, 0.04, 2.2, 1.1));
    out.push(part("box", "walnut", x, 1.95, -0.2, 0.56, 0.025, 1.1));
    out.push(part("cyl", "brass", x, 1.82, -0.2, 0.025, 0.025, 1.05));
    out.push(part("box", "walnut", x, 0.05, -0.2, 0.56, 0.3, 1.1));
    for (let i = 0; i < 6; i++) out.push(part("rbox", clothes[(i + (sx > 0 ? 2 : 0)) % clothes.length], x, 0.8 + (i % 2) * 0.12, -0.68 + i * 0.19, 0.46, 0.98 - (i % 2) * 0.12, 0.07));
  }
  // shoe shelves on the back wall
  for (const y of [0.15, 0.45, 0.75, 1.05]) {
    out.push(part("box", "walnut", 0, y, -iz + 0.16, 0.86, 0.025, 0.32));
    for (const x of [-0.27, 0, 0.27]) out.push(part("box", y > 0.6 ? "leather" : "metalDark", x, y + 0.025, -iz + 0.16, 0.12, 0.1, 0.26));
  }
  out.push(part("box", "brushed", 0, 1.3, -iz + 0.01, 0.6, 0.9, 0.015));
  out.push(part("rbox", "leather", 0, 0, 0.15, 0.55, 0.42, 0.45));
  return out;
}

/** Study (2.9 × 2.9): desk + chair on the back wall, bookcase along −X, armchair + lamp, rug. Door on +Z at x ≈ +0.7. */
function study(): Part[] {
  const i = 1.45 - T;
  const out: Part[] = [
    part("box", "rug", 0.1, 0, -0.1, 1.9, 0.012, 1.6),
    // desk on the back wall
    part("box", "oak", 0.1, 0.72, -i + 0.37, 1.5, 0.035, 0.72),
    part("box", "metalDark", -0.6, 0, -i + 0.37, 0.04, 0.72, 0.66),
    part("box", "metalDark", 0.8, 0, -i + 0.37, 0.04, 0.72, 0.66),
    part("box", "metalDark", 0.1, 0.755, -i + 0.18, 0.2, 0.012, 0.14),
    part("box", "metalDark", 0.1, 0.755, -i + 0.17, 0.04, 0.26, 0.03),
    part("box", "screen", 0.1, 0.86, -i + 0.19, 0.6, 0.36, 0.025),
    part("cyl", "brass", 0.68, 0.755, -i + 0.25, 0.1, 0.3, 0.1),
    part("cone", "lamp", 0.68, 1.0, -i + 0.25, 0.22, 0.16, 0.22),
    // task chair (sitter faces the wall)
    part("cyl", "metalDark", 0.1, 0, -i + 1.0, 0.6, 0.04, 0.6),
    part("cyl", "brushed", 0.1, 0.04, -i + 1.0, 0.05, 0.4, 0.05),
    part("rbox", "leather", 0.1, 0.44, -i + 1.0, 0.5, 0.08, 0.48),
    part("rbox", "leather", 0.1, 0.55, -i + 1.23, 0.46, 0.55, 0.07),
    // bookcase along −X
    part("box", "walnut", -i + 0.18, 0, -0.2, 0.36, 2.05, 2.0),
  ];
  const books: MatKey[] = ["fabricAccent", "leather", "linen", "fabricGrey", "lacquer", "piano"];
  [0.35, 0.75, 1.15, 1.55].forEach((y, k) => {
    for (let b = 0; b < 7; b++) out.push(part("box", books[(b + k) % books.length], -i + 0.2, y, -1.05 + b * 0.27 + (k % 2) * 0.05, 0.26, 0.24 + ((b + k) % 3) * 0.04, 0.16));
  });
  // reading chair + floor lamp (clear of the door swing on +X)
  out.push(part("rbox", "fabricCream", 0.35, 0.1, 0.55, 0.78, 0.36, 0.78, 0.5));
  out.push(part("rbox", "fabricCream", 0.25, 0.4, 0.35, 0.72, 0.42, 0.16, 0.5));
  out.push(part("cyl", "metalDark", -0.35, 0, 0.75, 0.3, 0.02, 0.3), part("cyl", "brass", -0.35, 0.02, 0.75, 0.025, 1.4, 0.025), part("cone", "lamp", -0.35, 1.35, 0.75, 0.4, 0.28, 0.4));
  return out;
}

/** Flip a part list in local x (for the mirrored twins). */
const mirrorX = (parts: Part[]): Part[] => parts.map((p) => ({ ...p, p: [-p.p[0], p.p[1], p.p[2]], r: -(p.r ?? 0) }));

/* --------------------------------------------------------------- registry */

export type RoomPieceId = "foyer" | "foyerM" | "coat" | "wc" | "wcM" | "laundry" | "pantry" | "wir" | "study" | "studyM";

export const ROOM_PIECES: Record<RoomPieceId, { build: () => Part[]; w: number; d: number }> = {
  foyer: { build: foyer, w: 1.3, d: 1.75 },
  foyerM: { build: () => mirrorX(foyer()), w: 1.3, d: 1.75 },
  coat: { build: coatCloset, w: 1.6, d: 0.8 },
  wc: { build: wc, w: 1.5, d: 1.9 },
  wcM: { build: () => mirrorX(wc()), w: 1.5, d: 1.9 },
  laundry: { build: laundry, w: 1.9, d: 0.95 },
  pantry: { build: pantry, w: 1.7, d: 1.8 },
  wir: { build: wir, w: 2.0, d: 1.8 },
  study: { build: study, w: 2.9, d: 2.9 },
  studyM: { build: () => mirrorX(study()), w: 2.9, d: 2.9 },
};

/**
 * How the room plan encloses each piece: door kind, clear width, door centre
 * (local x on the +Z face), which way a hinged leaf opens, floor finish and
 * plan label. `null` door = open area (no walls).
 */
export interface ServiceRoomSpec {
  door: "door" | "bifold" | null;
  doorW: number;
  doorAt: number;
  swing: "in" | "out";
  floor: "tile" | "stone" | null;
  label: string;
}

const spec = (door: ServiceRoomSpec["door"], doorW: number, doorAt: number, swing: ServiceRoomSpec["swing"], floor: ServiceRoomSpec["floor"], label: string): ServiceRoomSpec => ({
  door,
  doorW,
  doorAt,
  swing,
  floor,
  label,
});

export const SERVICE_ROOMS: Record<RoomPieceId, ServiceRoomSpec> = {
  foyer: spec(null, 0, 0, "in", "stone", "Foyer"),
  foyerM: spec(null, 0, 0, "in", "stone", "Foyer"),
  coat: spec("bifold", 1.3, 0, "out", null, "Coats"),
  wc: spec("door", 0.8, 0.2, "out", "tile", "WC"),
  wcM: spec("door", 0.8, -0.2, "out", "tile", "WC"),
  laundry: spec("bifold", 1.5, 0, "out", "tile", "Laundry"),
  pantry: spec("door", 0.8, 0, "in", "tile", "Pantry"),
  wir: spec("door", 0.85, 0, "in", null, "WIR"),
  study: spec("door", 0.9, 0.7, "in", null, "Study"),
  studyM: spec("door", 0.9, -0.7, "in", null, "Study"),
};

export const isServiceRoom = (piece: string): piece is RoomPieceId => piece in SERVICE_ROOMS;
