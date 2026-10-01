/**
 * Core layout — what is inside the building core, shared by every view.
 * -----------------------------------------------------------------------------
 * Building-local SCENE UNITS (like lib/lift): x across the lift doors, z out
 * of the lift face (+Z), origin at the core centre. The core never twists.
 *
 *   z ↑ (lift lobby)
 *   ┌──┬──┬───┬──┬──┐  z = +h
 *   │  │L │ M │L │  │  lift bank (main walk-in lift M in the middle)
 *   ├──┴──┴───┴──┴──┤  z = passage.z1
 *   ═  service passage ═   open on BOTH ±X faces into the corridor ring
 *   ├────┬───┬──╥─┬─╥─┤  z = passage.z0 (doors off the passage)
 *   │stair│ W │EL│ REF │  stair · walkway · electrical / riser closet · refuse room
 *   │     │ ↕ │  │▣ ▣  │  ▣ = refuse + recycling chutes (continuous, full height)
 *   └─────┘   └──┴─────┘  z = −h   (W opens onto the −Z face)
 *
 * The passage and the walkway W make a T through the core: from the
 * gallery you can cross it east–west, or walk in from the back (−Z) face
 * and out either side. W is dropped when the core is too small for it.
 *
 * On residential and office floors the passage and rooms are walkable
 * (`coreServiceOpen`); elsewhere that band is solid core. When the core is
 * too small to fit everything, `service` is null and the stair fills the
 * band behind the lifts (the previous layout).
 *
 * `coreBlocks` gives the concrete to draw (with heights) and `coreColliders`
 * the 2D solids the walk-through can't enter (the main cab + its doorway
 * are left open; WalkControls handles them with the lift doors).
 */
import type { ZoneId } from "@/types";
import { MODEL_SCALE } from "./tower";
import { liftBank, liftDims } from "./lift";

/** Depth of the lift lobby kept clear in front of the bank, metres. */
export const LOBBY_DEPTH_M = 1.8;

/** Narrowest gallery (corridor ring) between the core and the units, metres. */
export const GALLERY_MIN_M = 1.2;

/**
 * Width of the gallery round the core, metres — the walkway between the core
 * and the residences (or office floor). Roomy plates get a generous
 * lobby-gallery (up to 2.6 m on residential floors, like the supertall plans
 * it is modelled on); small or tapered plates keep the 1.2 m minimum so the
 * apartments still fit. Shared by the furniture planner, the room plan and
 * the mini plan so walls, furniture and drawings agree.
 */
export function galleryWidthM(zone: ZoneId | string, halfWM: number, halfDM: number, coreHalfM: number): number {
  if (zone === "crown") return GALLERY_MIN_M; // one home: no ring
  const reach = Math.min(halfWM, halfDM) - coreHalfM; // core face → facade
  const max = zone === "residential" ? 2.6 : 2.2;
  return Math.round(Math.min(max, Math.max(GALLERY_MIN_M, reach * 0.24)) * 100) / 100;
}

export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Box3 extends Box {
  y0: number;
  y1: number;
}

export interface ChuteSpec {
  kind: "refuse" | "recycling";
  /** Enclosure centre and half sizes; the pipe (radius r) runs up its middle. */
  x: number;
  z: number;
  hw: number;
  hd: number;
  r: number;
}

export interface CoreService {
  /** Through passage behind the lift bank (x0 = −h, x1 = +h). */
  passage: Box;
  /** Walkway from the passage out through the −Z face (z0 = −h), or null on small cores. */
  walk: Box | null;
  refuse: Box;
  electrical: Box;
  /** Door openings (x ranges) in the wall z ∈ [wall.z0, wall.z1] between the rooms and the passage. */
  refuseDoor: [number, number];
  electricalDoor: [number, number];
  wall: { z0: number; z1: number };
  chutes: ChuteSpec[];
  risers: { x: number; z: number }[];
  riserR: number;
}

export interface CoreLayout {
  core: number;
  half: number;
  stair: Box & { doorX: number; doorW: number };
  service: CoreService | null;
}

/** Residential and office floors open the service passage; elsewhere it is solid core. */
export function coreServiceOpen(zone: ZoneId | string): boolean {
  return zone === "residential" || zone === "office";
}

const cache = new Map<number, CoreLayout>();

export function coreLayout(core: number): CoreLayout {
  const hit = cache.get(core);
  if (hit) return hit;
  const s = MODEL_SCALE;
  const h = core / 2;
  const L = liftDims(core, 10);
  const pad = 0.25 * s; // outer wall
  const wT = 0.2 * s; // inner walls
  const xa = -h + pad;
  const xb = h - pad;
  const innerW = xb - xa;
  const z0 = -h + pad;

  const pz1 = L.zBack - wT;
  const pz0 = pz1 - 1.4 * s;
  const rz1 = pz0 - wT;
  const D = rz1 - z0;
  const Rw = Math.min(Math.max(innerW * 0.3, 2.1 * s), 2.8 * s);
  const Ew = Math.min(Math.max(innerW * 0.17, 1.2 * s), 1.6 * s);
  const Sw = innerW - Rw - Ew - 2 * wT;
  const doorW = Math.min(0.95 * s, core * 0.3);
  // Walkway through the back of the core, between the stair and the riser closet.
  const Ww = 1.5 * s;
  const withWalk = Sw - Ww - wT >= 2.2 * s;
  const stairW = withWalk ? Sw - Ww - wT : Sw;

  let out: CoreLayout;
  if (D >= 2.2 * s && Sw >= 2.2 * s) {
    const stair = { x0: xa, x1: xa + stairW, z0, z1: rz1 };
    const walk = withWalk ? { x0: stair.x1 + wT, x1: stair.x1 + wT + Ww, z0: -h, z1: pz0 } : null;
    const elX = walk ? walk.x1 + wT : stair.x1 + wT;
    const electrical = { x0: elX, x1: elX + Ew, z0, z1: rz1 };
    const refuse = { x0: electrical.x1 + wT, x1: xb, z0, z1: rz1 };
    const dw = 0.9 * s;
    const ex = (electrical.x0 + electrical.x1) / 2;
    const rdx = refuse.x0 + 0.15 * s;
    // Two chute enclosures on the refuse room's back wall, at its far (+X) end.
    const hw = 0.36 * s;
    const hd = 0.33 * s;
    const cz = refuse.z0 + hd;
    const c1 = refuse.x1 - 0.08 * s - hw;
    const c2 = c1 - 2 * hw - 0.1 * s;
    const riserR = Math.min(0.14 * s, Ew / 8);
    out = {
      core,
      half: h,
      stair: { ...stair, doorX: (stair.x0 + stair.x1) / 2, doorW },
      service: {
        passage: { x0: -h, x1: h, z0: pz0, z1: pz1 },
        walk,
        refuse,
        electrical,
        refuseDoor: [rdx, rdx + dw],
        electricalDoor: [ex - dw / 2, ex + dw / 2],
        wall: { z0: rz1, z1: pz0 },
        chutes: [
          { kind: "refuse", x: c1, z: cz, hw, hd, r: 0.28 * s },
          { kind: "recycling", x: c2, z: cz, hw, hd, r: 0.28 * s },
        ],
        risers: [0, 1, 2].map((i) => ({ x: electrical.x0 + riserR * (1.6 + i * 2.6), z: z0 + riserR * 1.5 })),
        riserR,
      },
    };
  } else {
    out = { core, half: h, stair: { x0: xa, x1: xb, z0, z1: L.zBack - wT, doorX: 0, doorW }, service: null };
  }
  cache.set(core, out);
  return out;
}

/** Concrete blocks of a core slice (lift shell + service band), y from 0 to the floor height. */
export function coreBlocks(core: number, floorH: number, slab: number, open: boolean): Box3[] {
  const lay = coreLayout(core);
  const L = liftDims(core, floorH - slab);
  const h = lay.half;
  const cw = L.cabW / 2;
  const ow = L.opening / 2;
  const top = slab + L.cabH;
  const sv = open ? lay.service : null;
  const zb = sv ? sv.passage.z1 : -h; // bottom of the lift band
  const b = (x0: number, x1: number, z0: number, z1: number, y0 = 0, y1 = floorH): Box3 => ({ x0, x1, z0, z1, y0, y1 });
  const out: Box3[] = [
    b(-h, -cw, zb, h),
    b(cw, h, zb, h),
    b(-cw, cw, zb, L.zBack),
    b(-cw, cw, L.zBack, h, top, floorH),
    b(-cw, -ow, L.zFront, h, slab, top),
    b(ow, cw, L.zFront, h, slab, top),
  ];
  if (sv) {
    const { refuse: r, electrical: e, wall } = sv;
    const doorTop = slab + Math.min(2.05 * MODEL_SCALE, floorH - slab - 0.2 * MODEL_SCALE);
    const w = sv.walk;
    if (w) {
      // Back wall and stair block stop at the walkway; a wall separates it from the riser closet.
      out.push(b(-h, w.x0, -h, r.z0), b(w.x1, h, -h, r.z0), b(-h, w.x0, r.z0, wall.z1), b(w.x1, e.x0, r.z0, wall.z1));
    } else {
      out.push(b(-h, h, -h, r.z0), b(-h, e.x0, r.z0, wall.z1));
    }
    out.push(b(e.x1, r.x0, r.z0, wall.z1), b(r.x1, h, r.z0, wall.z1));
    for (const [room, [d0, d1]] of [
      [e, sv.electricalDoor],
      [r, sv.refuseDoor],
    ] as [Box, [number, number]][]) {
      out.push(b(room.x0, d0, wall.z0, wall.z1), b(d1, room.x1, wall.z0, wall.z1), b(d0, d1, wall.z0, wall.z1, doorTop, floorH));
    }
  }
  return out;
}

/**
 * 2D solids of the core for the walk-through (building-local scene units):
 * the full-height blocks and jambs, plus the chute enclosures. The main cab
 * and its doorway are NOT included (WalkControls gates them on the doors).
 */
export function coreColliders(core: number, floorH: number, slab: number, open: boolean): Box[] {
  const blocks = coreBlocks(core, floorH, slab, open).filter((k) => k.y0 <= slab + 0.01);
  const out: Box[] = blocks.map(({ x0, x1, z0, z1 }) => ({ x0, x1, z0, z1 }));
  const sv = open ? coreLayout(core).service : null;
  if (sv) for (const c of sv.chutes) out.push({ x0: c.x - c.hw, x1: c.x + c.hw, z0: c.z - c.hd, z1: c.z + c.hd });
  return out;
}

/** Push a point out of a set of boxes, keeping `r` clearance (3 passes settle corners). */
export function pushOutOfBoxes(x: number, z: number, boxes: Box[], r: number): [number, number] {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const k of boxes) {
      if (x < k.x0 - r || x > k.x1 + r || z < k.z0 - r || z > k.z1 + r) continue;
      const cx = Math.min(Math.max(x, k.x0), k.x1);
      const cz = Math.min(Math.max(z, k.z0), k.z1);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      moved = true;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // Centre inside the box: leave by the nearest side.
        const pen = [x - k.x0, k.x1 - x, z - k.z0, k.z1 - z];
        const i = pen.indexOf(Math.min(...pen));
        if (i === 0) x = k.x0 - r;
        else if (i === 1) x = k.x1 + r;
        else if (i === 2) z = k.z0 - r;
        else z = k.z1 + r;
      }
    }
    if (!moved) break;
  }
  return [x, z];
}

/** Lift lobby half width (metres) in front of the bank — shared by the room plan and the furniture planner. */
export function lobbyHalfWidthM(core: number): number {
  return liftBank(core).halfWidth / MODEL_SCALE + 0.35;
}
