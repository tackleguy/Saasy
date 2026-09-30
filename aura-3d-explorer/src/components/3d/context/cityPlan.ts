/**
 * City plan — a deterministic street grid of neighbouring blocks around the
 * site, in the screen frame (u across the view, w towards the viewer).
 *
 *   • Rows of blocks step back from the site (w decreasing) and continue to
 *     both sides. Any cell that overlaps the site or the main street is
 *     skipped, so the foreground across the water stays open.
 *   • Each cell holds one or two buildings with a small setback. Heights grow
 *     with distance: low-rise near the site, a glass "downtown" far behind.
 *   • Facade kind (glass / brick / plaster / stone) follows height and a
 *     seeded lottery, and each building gets a few rooftop plant boxes.
 */
import type { FacadeKind } from "../textures";
import { rng } from "./shared";

export interface CityBuilding {
  u: number;
  w: number;
  /** Footprint along u / w and height, scene units. */
  su: number;
  sw: number;
  h: number;
  kind: FacadeKind;
  /** Subtle per-building tint (multiplied into the facade). */
  tint: number;
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

const BLOCK_U = 24;
const BLOCK_W = 22;
const STREET = 7;
const PITCH_U = BLOCK_U + STREET;
const PITCH_W = BLOCK_W + STREET;
/** Top edges (w) of block rows: two beside the site, then rows stepping back. */
const ROW_TOPS = [14, -16, ...Array.from({ length: 8 }, (_, k) => -48 - k * PITCH_W)];
const COLS = Array.from({ length: 13 }, (_, i) => -186 + i * PITCH_U); // left edges (u)
/** Site rectangle (with a margin): no blocks here. */
const SITE = { u0: -58, u1: 58, w0: -46, w1: 18 };

const STOREY = 0.9;

function build() {
  const r = rng(101);
  const buildings: CityBuilding[] = [];
  const roof: RoofItem[] = [];

  for (const top of ROW_TOPS) {
    for (const left of COLS) {
      const cell = { u0: left, u1: left + BLOCK_U, w0: top - BLOCK_W, w1: top };
      const overlapsSite = cell.u1 > SITE.u0 && cell.u0 < SITE.u1 && cell.w1 > SITE.w0 && cell.w0 < SITE.w1;
      if (overlapsSite) continue;

      // Split the cell into one or two lots along u.
      const lots = r() < 0.45 ? [cell] : (() => {
        const split = cell.u0 + BLOCK_U * (0.35 + r() * 0.3);
        return [
          { ...cell, u1: split - 1.5 },
          { ...cell, u0: split + 1.5 },
        ];
      })();

      for (const lot of lots) {
        const setback = 1.2 + r() * 1.2;
        const su = lot.u1 - lot.u0 - setback * 2;
        const sw = lot.w1 - lot.w0 - setback * 2;
        const cu = (lot.u0 + lot.u1) / 2;
        const cw = (lot.w0 + lot.w1) / 2;
        // Height by distance from the site centre; a glass downtown far behind.
        const dist = Math.hypot(cu / 1.4, cw + 10);
        const downtown = cw < -120 ? 1 : 0;
        let storeys = 2 + Math.round(Math.pow(r(), 1.6) * (dist < 80 ? 5 : dist < 150 ? 12 : 22 + downtown * 40));
        if (downtown && r() < 0.08) storeys += 25; // a few supertalls in the distance
        const h = storeys * STOREY + 0.4;
        const kind: FacadeKind = storeys > 14 ? (r() < 0.75 ? "glass" : "stone") : r() < 0.3 ? "brick" : r() < 0.6 ? "plaster" : r() < 0.85 ? "stone" : "glass";
        buildings.push({ u: cu, w: cw, su, sw, h, kind, tint: 0.88 + r() * 0.16 });

        // Rooftop plant: 1–3 boxes plus an occasional stair bulkhead.
        const n = 1 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const bu = 0.8 + r() * 2.2;
          const bw = 0.8 + r() * 1.8;
          roof.push({ u: cu + (r() - 0.5) * (su - bu - 1), w: cw + (r() - 0.5) * (sw - bw - 1), y: h, su: bu, sw: bw, h: 0.3 + r() * 0.6 });
        }
        if (r() < 0.5) roof.push({ u: cu + (r() - 0.5) * (su * 0.5), w: cw + (r() - 0.5) * (sw * 0.5), y: h, su: 2.2, sw: 2.0, h: 1.0 });
      }
    }
  }

  // Streets: one along each row gap and each column gap, behind the main street only.
  const streets: Street[] = [];
  const uMin = COLS[0] - STREET;
  const uMax = COLS[COLS.length - 1] + BLOCK_U + STREET;
  const wMin = ROW_TOPS[ROW_TOPS.length - 1] - BLOCK_W - STREET;
  for (const top of ROW_TOPS.slice(1)) {
    if (top > SITE.w0) {
      // Beside the site: two segments, leaving the plinth untouched.
      streets.push({ u0: uMin, u1: SITE.u0, w0: top, w1: top + STREET }, { u0: SITE.u1, u1: uMax, w0: top, w1: top + STREET });
    } else streets.push({ u0: uMin, u1: uMax, w0: top, w1: top + STREET });
  }
  for (const left of [...COLS, COLS[COLS.length - 1] + PITCH_U]) {
    const u0 = left - STREET;
    const crossesSite = left > SITE.u0 && u0 < SITE.u1;
    streets.push({ u0, u1: left, w0: wMin, w1: crossesSite ? SITE.w0 : 17 });
  }

  return { buildings, roof, streets };
}

const PLAN = build();
export const CITY_BUILDINGS = PLAN.buildings;
export const CITY_ROOF = PLAN.roof;
export const CITY_STREETS = PLAN.streets;
