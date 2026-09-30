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
 *   • Each cell holds one or two buildings with a small setback. Heights grow
 *     with distance; the preset sets how tall the near / mid / downtown rows
 *     get, and how often a downtown lot becomes a supertall.
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

function lottery(r: () => number, weights: Record<FacadeKind, number>): FacadeKind {
  const entries = Object.entries(weights) as [FacadeKind, number][];
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
  const clear = preset.landmarks
    .filter((l) => l.kind !== "bridge")
    .map((l) => {
      const half = Math.max(14, l.h * 0.12);
      return { u0: l.u - half, u1: l.u + half, w0: l.w - half, w1: l.w + half };
    });
  const overlaps = (a: Street, b: Street) => a.u1 > b.u0 && a.u0 < b.u1 && a.w1 > b.w0 && a.w0 < b.w1;

  const buildings: CityBuilding[] = [];
  const roof: RoofItem[] = [];
  const tanks: WaterTank[] = [];

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
        // Height by distance from the site centre; a taller downtown far behind.
        const dist = Math.hypot(cu / 1.4, cw + 10);
        const downtown = cw < -120 ? 1 : 0;
        let storeys = 2 + Math.round(Math.pow(r(), 1.6) * (dist < 80 ? H.near : dist < 150 ? H.mid : H.far + downtown * H.downtown));
        if (downtown && r() < H.supertall) storeys += 25 + Math.round(r() * 20);
        const h = storeys * STOREY + 0.4;
        const tall = storeys > 14;
        const kind: FacadeKind = tall ? (r() < preset.tallGlass ? "glass" : "stone") : lottery(r, preset.facades);
        const tint = pick(r, preset.tints[kind]);

        // Tiers: tall masonry (and some glass) towers step back like NYC zoning.
        let tierTop = h;
        let tier = { su, sw, y: 0, h };
        if (tall && r() < preset.setbacks) {
          const base = Math.min(h * (0.3 + r() * 0.2), 16 * STOREY);
          buildings.push({ u: cu, w: cw, y: 0, su, sw, h: base, kind, tint });
          roof.push({ u: cu + su * 0.3, w: cw, y: base, su: 1.6, sw: 1.4, h: 0.5 });
          let y = base;
          let s = 0.78;
          const steps = 1 + Math.floor(r() * 2);
          for (let k = 0; k < steps; k++) {
            const last = k === steps - 1;
            const th = last ? h - y : (h - y) * (0.45 + r() * 0.2);
            tier = { su: su * s, sw: sw * s, y, h: th };
            buildings.push({ u: cu, w: cw, y, su: tier.su, sw: tier.sw, h: th, kind, tint });
            y += th;
            s *= 0.78;
          }
          tierTop = y;
        } else {
          buildings.push({ u: cu, w: cw, y: 0, su, sw, h, kind, tint });
        }

        // Rooftop plant: 1–3 boxes plus an occasional stair bulkhead.
        const n = 1 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const bu = Math.min(0.8 + r() * 2.2, tier.su * 0.4);
          const bw = Math.min(0.8 + r() * 1.8, tier.sw * 0.4);
          roof.push({ u: cu + (r() - 0.5) * (tier.su - bu - 1), w: cw + (r() - 0.5) * (tier.sw - bw - 1), y: tierTop, su: bu, sw: bw, h: 0.3 + r() * 0.6 });
        }
        if (r() < 0.5) roof.push({ u: cu + (r() - 0.5) * (tier.su * 0.5), w: cw + (r() - 0.5) * (tier.sw * 0.5), y: tierTop, su: Math.min(2.2, tier.su * 0.4), sw: Math.min(2.0, tier.sw * 0.4), h: 1.0 });
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

  return { buildings, roof, streets, tanks };
}

const cache = new Map<string, CityPlan>();

/** The city plan for a preset (built once per preset). */
export function cityPlan(preset: CityPreset): CityPlan {
  let plan = cache.get(preset.id);
  if (!plan) cache.set(preset.id, (plan = build(preset)));
  return plan;
}
