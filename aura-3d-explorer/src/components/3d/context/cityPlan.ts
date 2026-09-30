/**
 * City plan — a deterministic street grid of neighbouring blocks around the
 * site, in the screen frame (u across the view, w towards the viewer),
 * shaped by the active city preset (lib/cityPresets).
 *
 *   • Rows of blocks step back from the site (w decreasing) and continue to
 *     both sides. Any cell that overlaps the site, the main street or a
 *     landmark footprint is skipped, so the foreground stays open.
 *   • Block and street size come from the preset (long Manhattan blocks,
 *     small London blocks, wide Dubai superblocks…).
 *   • Each cell holds one to three lots. Heights grow with distance, and the
 *     preset's downtown clusters lift lots near their centre with a Gaussian
 *     falloff, so each city gets its own skyline silhouette; cluster cores
 *     sometimes hold a supertall.
 *   • Tall lots pick a form: full-lot podium with a set-back tower, slender
 *     point tower, round tower, wedding-cake setbacks, or a plain slab. Towers
 *     over 30 storeys get a narrower crown, and some over 35 carry a spire.
 *   • Facade kind follows the preset's material lottery, with a per-building
 *     tint from the preset palette (NYC brick, Miami pastel stucco…).
 *   • Tall buildings may step back in tiers (wedding-cake zoning), and low /
 *     mid-rise roofs may carry timber water tanks (New York).
 */
import type { FacadeKind } from "../textures";
import type { CityPreset } from "@/lib/cityPresets";
import { rng } from "./shared";

export interface CityBuilding {
  u: number;
  w: number;
  /** Base height (y) of this tier. */
  y: number;
  /** Footprint along u / w and height, scene units. */
  su: number;
  sw: number;
  h: number;
  kind: FacadeKind;
  /** Per-building tint (multiplied into the facade). */
  tint: string;
  /** Box or round (cylindrical) tower. */
  shape: "box" | "round";
}

export interface Spire {
  u: number;
  w: number;
  y: number;
  h: number;
  r: number;
}

export interface Street {
  u0: number;
  u1: number;
  w0: number;
  w1: number;
}

export interface RoofItem {
  u: number;
  w: number;
  y: number;
  su: number;
  sw: number;
  h: number;
}

export interface WaterTank {
  u: number;
  w: number;
  y: number;
  r: number;
}

export interface CityPlan {
  buildings: CityBuilding[];
  roof: RoofItem[];
  streets: Street[];
  tanks: WaterTank[];
  spires: Spire[];
}

/** Site rectangle (with a margin): no blocks here. */
const SITE = { u0: -58, u1: 58, w0: -46, w1: 18 };
const U_MIN = -190;
const U_MAX = 200;
const W_MIN = -290;
const STOREY = 0.9;

function pick<T>(r: () => number, list: T[]): T {
  return list[Math.floor(r() * list.length) % list.length];
}

/** Street-level materials (the curtain-wall "tower" facade is only for high-rise). */
type LotKind = Exclude<FacadeKind, "tower">;

function lottery(r: () => number, weights: Record<LotKind, number>): LotKind {
  const entries = Object.entries(weights) as [LotKind, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  let x = r() * total;
  for (const [k, v] of entries) {
    if ((x -= v) <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function build(preset: CityPreset): CityPlan {
  const r = rng(101);
  const { blockU, blockW, street } = preset.grid;
  const pitchU = blockU + street;
  const pitchW = blockW + street;
  const H = preset.heights;

  const rowTops: number[] = [];
  for (let top = 14; top - blockW > W_MIN; top -= pitchW) rowTops.push(top);
  const cols: number[] = [];
  for (let left = U_MIN; left < U_MAX; left += pitchU) cols.push(left);

  // Landmarks (except bridges, which stand on the water) clear their lot.
  const clear = landmarkRects(preset);
  const overlaps = (a: Street, b: Street) => a.u1 > b.u0 && a.u0 < b.u1 && a.w1 > b.w0 && a.w0 < b.w1;

  const buildings: CityBuilding[] = [];
  const roof: RoofItem[] = [];
  const tanks: WaterTank[] = [];
  const spires: Spire[] = [];

  for (const top of rowTops) {
    for (const left of cols) {
      const cell = { u0: left, u1: left + blockU, w0: top - blockW, w1: top };
      if (overlaps(cell, SITE) || clear.some((c) => overlaps(cell, c))) continue;

      // Split the cell into one to three lots along u (long blocks get more).
      const splits = blockU > 40 ? 1 + Math.floor(r() * 3) : r() < 0.45 ? 0 : 1;
      const cuts = Array.from({ length: splits }, () => cell.u0 + blockU * (0.2 + r() * 0.6)).sort((a, b) => a - b);
      const edges = [cell.u0, ...cuts, cell.u1];
      const lots = edges.slice(0, -1).map((u0, i) => ({ ...cell, u0: i === 0 ? u0 : u0 + 1.2, u1: i === edges.length - 2 ? edges[i + 1] : edges[i + 1] - 1.2 }));

      for (const lot of lots) {
        if (lot.u1 - lot.u0 < 5) continue;
        const setback = 0.8 + r() * 1.2;
        const su = lot.u1 - lot.u0 - setback * 2;
        const sw = lot.w1 - lot.w0 - setback * 2;
        const cu = (lot.u0 + lot.u1) / 2;
        const cw = (lot.w0 + lot.w1) / 2;
        // Base height by distance from the site, then raised by the city's downtown clusters.
        const dist = Math.hypot(cu / 1.4, cw + 10);
        let storeys = 2 + Math.round(Math.pow(r(), 1.6) * (dist < 80 ? H.near : dist < 150 ? H.mid : H.far));
        let peak = 0;
        let core = 0;
        for (const c of preset.skyline.clusters) {
          const g = Math.exp(-(((cu - c.u) / c.ru) ** 2) - ((cw - c.w) / c.rw) ** 2);
          if (g * c.storeys > peak) peak = g * c.storeys;
          core = Math.max(core, g);
        }
        // Clusters shape the silhouette but a share of lots stays low, so the skyline is not a solid wall.
        if (peak > 4 && r() < 0.35 + core * 0.6) storeys = Math.max(storeys, Math.round(peak * (0.45 + 0.6 * r())));
        if (core > 0.55 && r() < H.supertall) storeys += 25 + Math.round(r() * 25);
        const h = storeys * STOREY + 0.4;
        const tall = storeys > 14;
        const kind: FacadeKind = tall ? (r() < preset.tallGlass ? (storeys > 25 ? "tower" : "glass") : "stone") : lottery(r, preset.facades);
        const tint = pick(r, preset.tints[kind === "tower" ? "glass" : kind]);
        const push = (piece: Omit<CityBuilding, "kind" | "tint" | "shape"> & Partial<Pick<CityBuilding, "kind" | "tint" | "shape">>) =>
          buildings.push({ kind, tint, shape: "box", ...piece });

        // Tower form. `tier` tracks the topmost piece (for roof plant and crowns).
        let tier = { u: cu, w: cw, su, sw, y: 0, h, shape: "box" as CityBuilding["shape"] };
        const S = preset.skyline;
        const x = r();
        const form = storeys <= 18 ? "box" : x < S.round ? "round" : x < S.round + S.podium ? "podium" : x < S.round + S.podium + S.slender ? "slender" : "box";

        if (form === "round") {
          const d = Math.min(su, sw) * 0.92;
          tier = { ...tier, su: d, sw: d, shape: "round" };
        } else if (form === "slender") {
          tier = { ...tier, su: Math.max(5, su * 0.58), sw: Math.max(5, sw * 0.58) };
        } else if (form === "podium") {
          // Full-lot podium in a street-wall material, tower set back on top of it.
          const p = (3 + Math.floor(r() * 4)) * STOREY;
          const podiumKind = lottery(r, { ...preset.facades, glass: preset.facades.glass * 0.5 });
          push({ u: cu, w: cw, y: 0, su, sw, h: p, kind: podiumKind, tint: pick(r, preset.tints[podiumKind]) });
          roof.push({ u: cu + su * 0.35, w: cw + sw * 0.3, y: p, su: 1.6, sw: 1.4, h: 0.5 });
          tier = { ...tier, w: cw - sw * 0.1, su: su * 0.62, sw: sw * 0.6, y: p, h: h - p };
        } else if (tall && r() < preset.setbacks) {
          // Wedding-cake setbacks (NYC zoning): base, then 1–2 narrower tiers.
          const base = Math.min(h * (0.3 + r() * 0.2), 16 * STOREY);
          push({ u: cu, w: cw, y: 0, su, sw, h: base });
          roof.push({ u: cu + su * 0.3, w: cw, y: base, su: 1.6, sw: 1.4, h: 0.5 });
          let y = base;
          let sc = 0.78;
          const steps = 1 + Math.floor(r() * 2);
          for (let k = 0; k < steps; k++) {
            const th = k === steps - 1 ? h - y : (h - y) * (0.45 + r() * 0.2);
            tier = { ...tier, su: su * sc, sw: sw * sc, y, h: th };
            if (k < steps - 1) push({ u: cu, w: cw, y, su: tier.su, sw: tier.sw, h: th });
            y += th;
            sc *= 0.78;
          }
        }

        // Crown: towers above 30 storeys finish with a narrower top of 2–4 storeys.
        if (storeys > 30 && form !== "box") {
          const ch = (2 + Math.floor(r() * 3)) * STOREY;
          push({ u: tier.u, w: tier.w, y: tier.y, su: tier.su, sw: tier.sw, h: tier.h - ch, shape: tier.shape });
          tier = { ...tier, y: tier.y + tier.h - ch, h: ch, su: tier.su * 0.84, sw: tier.sw * 0.84 };
        }
        push({ u: tier.u, w: tier.w, y: tier.y, su: tier.su, sw: tier.sw, h: tier.h, shape: tier.shape });
        const tierTop = tier.y + tier.h;
        if (storeys > 35 && r() < S.spires) spires.push({ u: tier.u, w: tier.w, y: tierTop, h: 3 + r() * 5 + storeys * 0.08, r: 0.18 + r() * 0.2 });

        // Rooftop plant: 1–3 boxes plus an occasional stair bulkhead.
        const n = 1 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const bu = Math.min(0.8 + r() * 2.2, tier.su * 0.4);
          const bw = Math.min(0.8 + r() * 1.8, tier.sw * 0.4);
          roof.push({ u: tier.u + (r() - 0.5) * (tier.su - bu - 1) * (tier.shape === "round" ? 0.6 : 1), w: tier.w + (r() - 0.5) * (tier.sw - bw - 1) * (tier.shape === "round" ? 0.6 : 1), y: tierTop, su: bu, sw: bw, h: 0.3 + r() * 0.6 });
        }
        if (r() < 0.5) roof.push({ u: tier.u + (r() - 0.5) * (tier.su * 0.4), w: tier.w + (r() - 0.5) * (tier.sw * 0.4), y: tierTop, su: Math.min(2.2, tier.su * 0.4), sw: Math.min(2.0, tier.sw * 0.4), h: 1.0 });
        // Timber water tanks on 5–20 storey roofs.
        if (preset.waterTowers && storeys >= 5 && storeys <= 20 && r() < 0.6) {
          tanks.push({ u: cu + (r() - 0.5) * su * 0.5, w: cw + (r() - 0.5) * sw * 0.5, y: tierTop, r: 0.55 + r() * 0.25 });
        }
      }
    }
  }

  // Streets: one along each row gap and each column gap, behind the main street only.
  const streets: Street[] = [];
  const uMin = cols[0] - street;
  const uMax = cols[cols.length - 1] + blockU + street;
  const wMin = rowTops[rowTops.length - 1] - blockW - street;
  for (const top of rowTops.slice(1)) {
    const s = { u0: uMin, u1: uMax, w0: top, w1: top + street };
    if (s.w1 > SITE.w0 && s.w0 < SITE.w1) {
      // Beside the site: two segments, leaving the plinth untouched.
      streets.push({ ...s, u1: SITE.u0 }, { ...s, u0: SITE.u1 });
    } else streets.push(s);
  }
  for (const left of [...cols, cols[cols.length - 1] + pitchU]) {
    const u0 = left - street;
    const crossesSite = left > SITE.u0 && u0 < SITE.u1;
    streets.push({ u0, u1: left, w0: wMin, w1: crossesSite ? SITE.w0 : 17 });
  }

  return { buildings, roof, streets, tanks, spires };
}

/** Lots cleared for landmark towers (bridges stand on the water and clear nothing). */
export function landmarkRects(preset: CityPreset): Street[] {
  return preset.landmarks
    .filter((l) => l.kind !== "bridge")
    .map((l) => {
      const half = Math.max(14, l.h * 0.12);
      return { u0: l.u - half, u1: l.u + half, w0: l.w - half, w1: l.w + half };
    });
}

const cache = new Map<string, CityPlan>();

/** The city plan for a preset (built once per preset). */
export function cityPlan(preset: CityPreset): CityPlan {
  let plan = cache.get(preset.id);
  if (!plan) cache.set(preset.id, (plan = build(preset)));
  return plan;
}
