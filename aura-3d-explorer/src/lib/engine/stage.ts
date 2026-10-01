/**
 * Procedural staging — classify a room, then furnish it.
 * -----------------------------------------------------------------------------
 * Every piece is placed as an oriented box (OBB) in the room's own polygon:
 *   • against a wall: back to the wall, front (+Z) along the wall's inward
 *     normal, so its Y rotation follows the wall angle
 *   • centred: nearest free spot to a target point, aligned to the room
 * A placement is accepted only when the body (and its walkway clearance)
 * lies fully inside the polygon — concave rooms included — and overlaps no
 * other body or clearance. Rugs are the only pieces allowed underneath others.
 *
 * Recipes follow the brief:
 *   Living   sofa on the primary wall, coffee table in front, media console
 *            on the facing wall; rug, armchair, lamp, plant
 *   Bedroom  headboard on a solid wall with a nightstand each side, walkway
 *            at the foot; wardrobe on another wall
 *   Kitchen  counter run on the longest wall; island (or table) centred in
 *            the kitchen / dining zone
 *   Bathroom shower or tub in a corner, vanity, WC
 *   Office   desk + chair, bookshelf, plant
 */
import { CATALOG, isModelId, modelPath, type ModelId } from "./catalog";
import {
  add,
  area,
  bounds,
  centroid,
  corners,
  dist,
  dot,
  edges as polyEdges,
  facing,
  inflate,
  mul,
  norm,
  obbInPolygon,
  obbOverlap,
  rayToBoundary,
  round,
  sub,
  axes,
  type Edge,
  type OBB,
  type Poly,
  type Vec,
} from "./geometry";
import type { AuraFurniture, FlooringType } from "./types";

/* ------------------------------------------------------------ classification */

export type RoomType = "living" | "kitchen" | "dining" | "bedroom" | "master" | "bathroom" | "office" | "hall" | "utility" | "outdoor";

export interface RoomClass {
  /** Main use, plus a secondary use for combined rooms ("Kitchen / Dining"). */
  type: RoomType;
  also?: RoomType;
}

const RULES: [RegExp, RoomType][] = [
  [/\b(master|primary|main)\s*(bed|bedroom|suite|br)\b|\bmaster\b/i, "master"],
  [/\b(bath|bathroom|ensuite|en-suite|wc|toilet|powder|shower|lav|lavatory)\b/i, "bathroom"],
  [/\b(bed|bedroom|bdrm|br|guest|nursery|kids)\s*\d*\b/i, "bedroom"],
  [/\b(kitchen|kit|kitchenette|pantry)\b/i, "kitchen"],
  [/\b(dining|dinette|breakfast|eat-in)\b/i, "dining"],
  [/\b(living|lounge|family|great\s*room|sitting|salon|den|media|tv)\b/i, "living"],
  [/\b(office|study|work|library)\b/i, "office"],
  [/\b(hall|hallway|corridor|entry|entrance|foyer|vestibule|gallery|lobby|stair)\b/i, "hall"],
  [/\b(closet|wic|walk-in|storage|store|laundry|utility|mech|plant room|mudroom|garage)\b/i, "utility"],
  [/\b(balcony|terrace|patio|deck|loggia|porch|garden)\b/i, "outdoor"],
];

/** Classify by name; unnamed rooms fall back on their size and shape. */
export function classifyRoom(name: string, poly: Poly): RoomClass {
  const hits: RoomType[] = [];
  for (const [re, t] of RULES) if (re.test(name) && !hits.includes(t)) hits.push(t);
  // "Master" wins over the generic bedroom / bath words it travels with.
  if (hits.includes("master") && /\b(bath|ensuite|en-suite|wc)\b/i.test(name)) return { type: "bathroom" };
  const primary = hits.filter((t) => !(t === "bedroom" && hits.includes("master")));
  if (primary.length) {
    // Combined rooms: living/dining, kitchen/dining, kitchen/living …
    const order: RoomType[] = ["master", "bedroom", "bathroom", "living", "kitchen", "office", "dining", "hall", "utility", "outdoor"];
    primary.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return { type: primary[0], also: primary[1] };
  }
  const a = area(poly);
  const b = bounds(poly);
  const narrow = Math.min(b.w, b.d);
  if (narrow < 1.4) return { type: a < 4 ? "utility" : "hall" };
  if (a < 3) return { type: "utility" };
  if (a < 6.5) return { type: "bathroom" };
  if (a < 17) return { type: "bedroom" };
  return { type: "living", also: a > 30 ? "dining" : undefined };
}

export const TYPE_LABEL: Record<RoomType, string> = {
  living: "Living Room",
  kitchen: "Kitchen",
  dining: "Dining Room",
  bedroom: "Bedroom",
  master: "Master Bedroom",
  bathroom: "Bathroom",
  office: "Office",
  hall: "Hallway",
  utility: "Utility",
  outdoor: "Terrace",
};

export function flooringFor(c: RoomClass): FlooringType {
  switch (c.type) {
    case "bathroom":
      return "marble";
    case "kitchen":
      return c.also === "living" || c.also === "dining" ? "hardwood" : "tile";
    case "utility":
    case "outdoor":
      return "tile";
    case "bedroom":
      return "carpet";
    default:
      return "hardwood";
  }
}

/* ------------------------------------------------------------------- stager */

interface Placed {
  body: OBB;
  clear: OBB;
  rug: boolean;
}

/** A group of pieces placed (and collision-tested) as one box. */
interface Group {
  w: number;
  d: number;
  clear?: { front?: number; sides?: number };
}

const GAP = 0.03; // off the wall

export class Stager {
  readonly poly: Poly;
  readonly edges: Edge[];
  readonly out: AuraFurniture[] = [];
  private placed: Placed[] = [];

  constructor(poly: Poly) {
    this.poly = poly;
    this.edges = polyEdges(poly);
  }

  /** Can a body (with its clearance) go here? */
  fits(body: OBB, clear: OBB, rug = false): boolean {
    if (!obbInPolygon(body, this.poly)) return false;
    // Clearance must stay in the room too (shrink a hair so wall-flush zones pass).
    const c2 = { ...clear, hw: Math.max(clear.hw - 0.02, 0.01), hd: Math.max(clear.hd - 0.02, 0.01) };
    if (!obbInPolygon(c2, this.poly)) return false;
    if (rug) return true;
    for (const p of this.placed) {
      if (p.rug) continue;
      if (obbOverlap(body, p.body) || obbOverlap(body, p.clear) || obbOverlap(clear, p.body)) return false;
    }
    return true;
  }

  /** Reserve space without emitting furniture (e.g. a group's footprint). */
  reserve(body: OBB, clear: OBB, rug = false) {
    this.placed.push({ body, clear, rug });
  }

  emit(id: ModelId | string, c: Vec, r: number, scale: [number, number, number] = [1, 1, 1]) {
    this.out.push({
      modelId: id,
      modelPath: modelPath(id),
      position: [round(c[0]), 0, round(c[1])],
      rotation: [0, round(normAngle(r), 4), 0],
      scale: [round(scale[0]), round(scale[1]), round(scale[2])],
    });
  }

  /** Place a single catalog piece (or group) and reserve it; returns its box. */
  commit(id: ModelId, body: OBB, sx = 1) {
    const it = CATALOG[id];
    const rug = !!it.rug;
    this.reserve(body, inflate(body, { front: it.clear?.front, sides: it.clear?.sides }), rug);
    this.emit(id, body.c, body.r, [sx, 1, 1]);
  }

  /** Free depth in front of a wall, measured from its midpoint. */
  depth(e: Edge) {
    return rayToBoundary(add(e.mid, mul(e.n, 0.01)), e.n, this.poly);
  }

  /**
   * Back-to-wall placement. Tries each edge in `order`, sliding along it from
   * `prefer` (centre or the ends); returns the first box that fits.
   */
  againstWall(g: Group, order: Edge[], prefer: "center" | "ends" | number = "center"): OBB | null {
    for (const e of order) {
      if (e.length < g.w + 0.02) continue;
      const r = facing(e.n);
      const lo = g.w / 2 + 0.01;
      const hi = e.length - g.w / 2 - 0.01;
      for (const u of slideOrder(lo, hi, prefer)) {
        const c = add(add(e.a, mul(e.t, u)), mul(e.n, g.d / 2 + GAP));
        const body: OBB = { c, hw: g.w / 2, hd: g.d / 2, r };
        const clear = inflate(body, { front: g.clear?.front, sides: g.clear?.sides });
        if (this.fits(body, clear)) return body;
      }
    }
    return null;
  }

  /** Nearest free spot to `target` (spiral search), trying `r` then r + 90°. */
  centered(g: Group, target: Vec, r: number, maxR = 4): OBB | null {
    for (const rot of [r, r + Math.PI / 2]) {
      for (let rad = 0; rad <= maxR; rad += 0.1) {
        const steps = rad === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * rad) / 0.1));
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          const c: Vec = [target[0] + Math.cos(a) * rad, target[1] + Math.sin(a) * rad];
          const body: OBB = { c, hw: g.w / 2, hd: g.d / 2, r: rot };
          const clear = inflate(body, { front: g.clear?.front, back: g.clear?.front, sides: g.clear?.sides });
          if (this.fits(body, clear)) return body;
        }
      }
    }
    return null;
  }

  /** A small piece tucked into a free corner. */
  corner(id: ModelId): boolean {
    const it = CATALOG[id];
    const order = [...this.edges].sort((a, b) => b.length - a.length);
    const body = this.againstWall({ w: it.w, d: it.d }, order, "ends");
    if (!body) return false;
    this.commit(id, body);
    return true;
  }
}

/** Positions along [lo, hi] in preference order, 0.1 m apart. */
function slideOrder(lo: number, hi: number, prefer: "center" | "ends" | number): number[] {
  if (hi < lo) return [];
  const step = 0.1;
  const all: number[] = [];
  for (let u = lo; u <= hi + 1e-9; u += step) all.push(u);
  if (all[all.length - 1] < hi - 1e-6) all.push(hi);
  const target = prefer === "center" ? (lo + hi) / 2 : prefer === "ends" ? lo : Math.min(hi, Math.max(lo, prefer));
  if (prefer === "ends") return all.sort((a, b) => Math.min(a - lo, hi - a) - Math.min(b - lo, hi - b));
  return all.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
}

function normAngle(r: number) {
  let a = r % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Point `along` the box's local axes from its centre. */
const local = (b: OBB, x: number, z: number): Vec => {
  const { ax, az } = axes(b.r);
  return add(b.c, add(mul(ax, x), mul(az, z)));
};

/** Edges sorted by usable wall: long, with plenty of room in front. */
function wallsBy(s: Stager, minDepth: number, minLen = 0) {
  return s.edges
    .map((e) => ({ e, depth: s.depth(e) }))
    .filter((x) => x.depth >= minDepth && x.e.length >= minLen)
    .sort((a, b) => Math.min(b.e.length, 5) + Math.min(b.depth, 5) * 0.5 - (Math.min(a.e.length, 5) + Math.min(a.depth, 5) * 0.5))
    .map((x) => x.e);
}

/** The room's main axis: the angle of its longest wall. */
const mainAngle = (s: Stager) => {
  const e = [...s.edges].sort((a, b) => b.length - a.length)[0];
  return facing(e.n);
};

/* ------------------------------------------------------------------ recipes */

function living(s: Stager, withDining: boolean) {
  const sofa = CATALOG.sofa_modern_01;
  const table = CATALOG.coffee_table_01;
  // Sofa + coffee table move as one: sofa 0.95 deep, 0.45 m knee gap, table 0.6.
  let placedSofa: OBB | null = null;
  for (const sx of [1, 0.85, 0.7]) {
    const w = sofa.w * sx;
    const groupD = sofa.d + 0.45 + table.d;
    const g = s.againstWall({ w, d: groupD, clear: { front: 0.6 } }, wallsBy(s, 2.6, w));
    if (!g) continue;
    s.reserve(g, inflate(g, { front: 0.6 }));
    const back = local(g, 0, -groupD / 2);
    const { az } = axes(g.r);
    const sofaBox: OBB = { c: add(back, mul(az, sofa.d / 2)), hw: w / 2, hd: sofa.d / 2, r: g.r };
    s.emit("sofa_modern_01", sofaBox.c, g.r, [sx, 1, 1]);
    s.emit("coffee_table_01", add(back, mul(az, sofa.d + 0.45 + table.d / 2)), g.r);
    placedSofa = sofaBox;
    break;
  }
  if (!placedSofa) {
    s.corner("armchair_01");
    s.corner("plant_01");
    return;
  }
  const { ax, az } = axes(placedSofa.r);

  // Media console on the facing wall, centred on the sofa's line of sight.
  const facingWalls = s.edges
    .filter((e) => dot(e.n, az) < -0.9)
    .map((e) => {
      const toWall = dot(sub(e.mid, placedSofa!.c), az);
      return { e, toWall };
    })
    .filter((x) => x.toWall >= 2.2 && x.toWall <= 6.5)
    .sort((a, b) => a.toWall - b.toWall)
    .map((x) => x.e);
  let consoleBox: OBB | null = null;
  for (const e of facingWalls) {
    const u = dot(sub(placedSofa.c, e.a), e.t);
    consoleBox = s.againstWall({ w: CATALOG.media_console_01.w, d: CATALOG.media_console_01.d, clear: CATALOG.media_console_01.clear }, [e], u);
    if (consoleBox) {
      s.commit("media_console_01", consoleBox);
      break;
    }
  }

  // Rug under the seating, centred between sofa and coffee table front.
  const rugC = add(placedSofa.c, mul(az, 1.0));
  for (const k of [1, 0.85, 0.7]) {
    const rug: OBB = { c: rugC, hw: (CATALOG.rug_living_01.w * k) / 2, hd: (CATALOG.rug_living_01.d * k) / 2, r: placedSofa.r };
    if (obbInPolygon(rug, s.poly)) {
      s.reserve(rug, rug, true);
      s.emit("rug_living_01", rug.c, rug.r, [k, 1, k]);
      break;
    }
  }

  // Armchair beside the coffee table, turned towards it.
  const tableC = add(placedSofa.c, mul(az, sofa.d / 2 + 0.45 + table.d / 2));
  for (const side of [1, -1]) {
    const c = add(tableC, mul(ax, side * (Math.max(table.w / 2 + 0.35, placedSofa.hw + 0.1) + CATALOG.armchair_01.w / 2)));
    const r = facing(mul(ax, -side));
    const body: OBB = { c, hw: CATALOG.armchair_01.w / 2, hd: CATALOG.armchair_01.d / 2, r };
    if (s.fits(body, body)) {
      s.commit("armchair_01", body);
      break;
    }
  }

  // Floor lamp at a sofa end, plant in a corner.
  for (const side of [1, -1]) {
    const c = add(placedSofa.c, add(mul(ax, side * (placedSofa.hw + 0.3)), mul(az, -0.2)));
    const body: OBB = { c, hw: 0.175, hd: 0.175, r: placedSofa.r };
    if (s.fits(body, body)) {
      s.commit("floor_lamp_01", body);
      break;
    }
  }
  s.corner("plant_01");

  if (withDining) dining(s, { awayFrom: placedSofa.c, sideboard: false });
}

function dining(s: Stager, opts: { awayFrom?: Vec; sideboard?: boolean } = {}) {
  const c = centroid(s.poly);
  const target = opts.awayFrom ? add(c, mul(norm(sub(c, opts.awayFrom)), Math.min(2.2, dist(c, opts.awayFrom) * 0.9 + 0.8))) : c;
  const r = mainAngle(s);
  // Full clearance first; a compact kitchen / dinette still gets a 4-seater.
  const tries = [
    { id: "dining_table_02" as const, clear: CATALOG.dining_table_02.clear },
    { id: "dining_table_01" as const, clear: CATALOG.dining_table_01.clear },
    { id: "dining_table_01" as const, clear: { front: 0.15, sides: 0.15 } },
  ];
  for (const t of tries) {
    const it = CATALOG[t.id];
    const body = s.centered({ w: it.w, d: it.d, clear: t.clear }, target, r);
    if (body) {
      s.commit(t.id, body);
      break;
    }
  }
  if (opts.sideboard !== false) {
    const sb = CATALOG.sideboard_01;
    const body = s.againstWall({ w: sb.w, d: sb.d, clear: sb.clear }, wallsBy(s, 1.5, sb.w));
    if (body) s.commit("sideboard_01", body);
  }
}

function kitchen(s: Stager, also?: RoomType) {
  const run = CATALOG.kitchen_run_01;
  const order = [...s.edges].filter((e) => s.depth(e) >= 1.9).sort((a, b) => b.length - a.length);
  let runBox: OBB | null = null;
  for (const e of order) {
    const w = Math.min(4.8, Math.max(1.8, e.length - 0.15));
    for (const ww of [w, w * 0.8, 1.8]) {
      const body = s.againstWall({ w: ww, d: run.d, clear: run.clear }, [e]);
      if (body) {
        runBox = body;
        s.commit("kitchen_run_01", body, ww / run.w);
        break;
      }
    }
    if (runBox) break;
  }

  const combined = also === "dining" || also === "living";
  if (runBox) {
    // Island parallel to the run, centred in the kitchen zone in front of it.
    const { az } = axes(runBox.r);
    const target = add(runBox.c, mul(az, run.d / 2 + 1.1 + CATALOG.kitchen_island_01.d / 2));
    const isl = CATALOG.kitchen_island_01;
    let island = false;
    for (const k of [1, 0.8]) {
      const body = s.centered({ w: isl.w * k, d: isl.d, clear: isl.clear }, target, runBox.r, 1.2);
      if (body) {
        s.commit("kitchen_island_01", body, k);
        island = true;
        break;
      }
    }
    if (combined || !island) dining(s, { awayFrom: runBox.c, sideboard: false });
  } else if (combined || area(s.poly) >= 8) {
    dining(s, { sideboard: false });
  }
  if (also === "living") living(s, false);
}

function bedroom(s: Stager, master: boolean) {
  const bedId = master ? "bed_king_02" : "bed_queen_01";
  const ns = CATALOG.nightstand_01;
  let placed = false;
  for (const id of master ? (["bed_king_02", "bed_queen_01"] as const) : (["bed_queen_01"] as const)) {
    const bed = CATALOG[id];
    for (const withStands of [2, 1, 0]) {
      const gw = bed.w + withStands * (ns.w + 0.05);
      const g = s.againstWall({ w: gw, d: bed.d, clear: { front: 0.7 } }, wallsBy(s, bed.d + 0.7, gw));
      if (!g) continue;
      s.reserve(g, inflate(g, { front: 0.7 }));
      const back = local(g, 0, -bed.d / 2);
      const { ax, az } = axes(g.r);
      const off = withStands === 1 ? -(ns.w + 0.05) / 2 : 0; // one stand: shift the bed over
      const bedC = add(add(back, mul(az, bed.d / 2)), mul(ax, -off));
      s.emit(id, bedC, g.r);
      const standX = bed.w / 2 + 0.05 + ns.w / 2;
      const sides = withStands === 2 ? [-1, 1] : withStands === 1 ? [-1] : [];
      for (const side of sides) s.emit("nightstand_01", add(add(back, mul(az, ns.d / 2)), mul(ax, side * standX - off)), g.r);
      placed = true;
      break;
    }
    if (placed) break;
  }
  if (!placed) {
    void bedId;
    s.corner("plant_01");
    return;
  }

  // Wardrobe on another wall, with room to open its doors.
  const wd = CATALOG.wardrobe_01;
  for (const k of [1, 0.8, 0.6]) {
    const body = s.againstWall({ w: wd.w * k, d: wd.d, clear: wd.clear }, wallsBy(s, wd.d + 0.8, wd.w * k), "ends");
    if (body) {
      s.commit("wardrobe_01", body, k);
      break;
    }
  }
  if (master) {
    const body = s.againstWall({ w: CATALOG.armchair_01.w, d: CATALOG.armchair_01.d, clear: { front: 0.4 } }, wallsBy(s, 1.6), "ends");
    if (body) s.commit("armchair_01", body);
  }
  s.corner("plant_01");
}

function bathroom(s: Stager) {
  const a = area(s.poly);
  const walls = [...s.edges].sort((x, y) => y.length - x.length);
  // Wet zone first, tucked into a corner.
  let wet = false;
  if (a >= 6.5) {
    const tub = CATALOG.bathtub_01;
    const body = s.againstWall({ w: tub.w, d: tub.d, clear: tub.clear }, walls, "ends");
    if (body) {
      s.commit("bathtub_01", body);
      wet = true;
    }
  }
  if (!wet || a >= 9) {
    const sh = CATALOG.shower_01;
    const body = s.againstWall({ w: sh.w, d: sh.d }, walls, "ends");
    if (body) s.commit("shower_01", body);
  }
  const v = CATALOG.vanity_01;
  for (const k of a >= 8 ? [1.5, 1] : [1, 0.8]) {
    const body = s.againstWall({ w: v.w * k, d: v.d, clear: v.clear }, wallsBy(s, 1.1, v.w * k));
    if (body) {
      s.commit("vanity_01", body, k);
      break;
    }
  }
  const wc = CATALOG.toilet_01;
  const body = s.againstWall({ w: wc.w, d: wc.d, clear: wc.clear }, wallsBy(s, 1.2), "ends");
  if (body) s.commit("toilet_01", body);
}

function office(s: Stager) {
  const d = CATALOG.desk_workstation_01;
  const body = s.againstWall({ w: d.w, d: d.d, clear: d.clear }, wallsBy(s, 1.8, d.w));
  if (body) s.commit("desk_workstation_01", body);
  const b = CATALOG.bookshelf_01;
  const shelf = s.againstWall({ w: b.w, d: b.d, clear: b.clear }, wallsBy(s, 1.2, b.w), "ends");
  if (shelf) s.commit("bookshelf_01", shelf);
  if (area(s.poly) > 10) {
    const chair = s.againstWall({ w: CATALOG.armchair_01.w, d: CATALOG.armchair_01.d, clear: { front: 0.4 } }, wallsBy(s, 1.6), "ends");
    if (chair) s.commit("armchair_01", chair);
  }
  s.corner("plant_01");
}

function hall(s: Stager) {
  if (area(s.poly) < 4) return;
  const b = CATALOG.bench_01;
  const body = s.againstWall({ w: b.w, d: b.d, clear: b.clear }, wallsBy(s, 1.4, b.w));
  if (body) s.commit("bench_01", body);
  s.corner("plant_01");
}

function outdoor(s: Stager) {
  const b = CATALOG.bench_01;
  const body = s.againstWall({ w: b.w, d: b.d, clear: b.clear }, wallsBy(s, 1.2, b.w));
  if (body) s.commit("bench_01", body);
  s.corner("plant_01");
  s.corner("plant_01");
}

/** Furnish one room polygon (metres, CCW). */
export function stageRoom(poly: Poly, cls: RoomClass): AuraFurniture[] {
  const s = new Stager(poly);
  switch (cls.type) {
    case "living":
      living(s, cls.also === "dining" || cls.also === "kitchen");
      if (cls.also === "kitchen") kitchen(s);
      break;
    case "kitchen":
      kitchen(s, cls.also);
      break;
    case "dining":
      dining(s);
      if (cls.also === "kitchen") kitchen(s);
      if (cls.also === "living") living(s, false);
      break;
    case "master":
    case "bedroom":
      bedroom(s, cls.type === "master" || area(poly) >= 16);
      break;
    case "bathroom":
      bathroom(s);
      break;
    case "office":
      office(s);
      break;
    case "hall":
      hall(s);
      break;
    case "outdoor":
      outdoor(s);
      break;
    case "utility":
      break;
  }
  return s.out;
}

/**
 * Check furniture someone else placed (e.g. a vision model): every non-rug
 * piece must sit inside the room and clear of the others.
 */
export function furnitureProblems(poly: Poly, items: AuraFurniture[]): string[] {
  const problems: string[] = [];
  const boxes: { id: string; b: OBB }[] = [];
  for (const f of items) {
    const it = isModelId(f.modelId) ? CATALOG[f.modelId] : { w: 1, d: 1 };
    const rug = isModelId(f.modelId) && !!CATALOG[f.modelId].rug;
    const b: OBB = { c: [f.position[0], f.position[2]], hw: (it.w * (f.scale?.[0] ?? 1)) / 2, hd: (it.d * (f.scale?.[2] ?? 1)) / 2, r: f.rotation?.[1] ?? 0 };
    if (!obbInPolygon({ ...b, hw: b.hw - 0.02, hd: b.hd - 0.02 }, poly)) problems.push(`${f.modelId} extends outside the room`);
    if (rug) continue;
    for (const o of boxes) if (obbOverlap({ ...b, hw: b.hw - 0.01, hd: b.hd - 0.01 }, o.b)) problems.push(`${f.modelId} overlaps ${o.id}`);
    boxes.push({ id: f.modelId, b });
  }
  return problems;
}

/** Corners of every staged piece — handy for debugging overlays. */
export const footprintCorners = (f: AuraFurniture): Vec[] => {
  const it = isModelId(f.modelId) ? CATALOG[f.modelId] : { w: 1, d: 1 };
  return corners({ c: [f.position[0], f.position[2]], hw: (it.w * f.scale[0]) / 2, hd: (it.d * f.scale[2]) / 2, r: f.rotation[1] });
};
