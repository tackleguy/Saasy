/**
 * Aura Engine furniture catalog — ids, real-size footprints and asset paths.
 * -----------------------------------------------------------------------------
 * Pure data (no three.js) so the API route and the stager can share it.
 * Footprints are metres; every piece faces +Z (the side you sit on / walk up
 * to) and its back is at −Z. `clear` is the walkway kept free around it.
 *
 * `modelPath` / `texturePath` point at the asset CDN
 * (NEXT_PUBLIC_AURA_ASSET_CDN, default "/cdn/aura"). Until real .glb files are
 * published there, the viewer draws each id with procedural stand-ins from
 * the furniture kit at the same size.
 */
import type { FlooringType } from "./types";

export const ASSET_BASE = (process.env.NEXT_PUBLIC_AURA_ASSET_CDN ?? "/cdn/aura").replace(/\/$/, "");

export interface CatalogItem {
  label: string;
  category: "living" | "bedroom" | "kitchen" | "dining" | "bath" | "office" | "decor";
  /** Width (local X), depth (local Z), height — metres. */
  w: number;
  d: number;
  h: number;
  /** Walkway kept free in front / at the sides, metres. */
  clear?: { front?: number; sides?: number };
  /** Rugs lie under other pieces and don't collide. */
  rug?: boolean;
}

const ITEMS = {
  sofa_modern_01: { label: "Modern sofa", category: "living", w: 2.4, d: 0.95, h: 0.85 },
  armchair_01: { label: "Lounge armchair", category: "living", w: 0.95, d: 0.95, h: 0.85 },
  coffee_table_01: { label: "Coffee table", category: "living", w: 1.1, d: 0.6, h: 0.4 },
  media_console_01: { label: "Media console + TV", category: "living", w: 1.8, d: 0.45, h: 1.15, clear: { front: 0.6 } },
  rug_living_01: { label: "Area rug", category: "decor", w: 3.0, d: 2.2, h: 0.01, rug: true },
  floor_lamp_01: { label: "Floor lamp", category: "decor", w: 0.35, d: 0.35, h: 1.7 },
  plant_01: { label: "Potted plant", category: "decor", w: 0.6, d: 0.6, h: 1.3 },
  bed_king_02: { label: "King bed", category: "bedroom", w: 2.0, d: 2.2, h: 1.1, clear: { front: 0.7 } },
  bed_queen_01: { label: "Queen bed", category: "bedroom", w: 1.7, d: 2.2, h: 1.0, clear: { front: 0.7 } },
  nightstand_01: { label: "Nightstand + lamp", category: "bedroom", w: 0.5, d: 0.4, h: 0.75 },
  wardrobe_01: { label: "Wardrobe", category: "bedroom", w: 2.0, d: 0.6, h: 2.2, clear: { front: 0.8 } },
  desk_workstation_01: { label: "Desk, chair + monitor", category: "office", w: 1.4, d: 1.3, h: 1.2, clear: { front: 0.3 } },
  bookshelf_01: { label: "Bookshelf", category: "office", w: 1.2, d: 0.35, h: 2.0, clear: { front: 0.6 } },
  kitchen_run_01: { label: "Kitchen counter run", category: "kitchen", w: 3.0, d: 0.65, h: 2.2, clear: { front: 1.0 } },
  kitchen_island_01: { label: "Island + stools", category: "kitchen", w: 2.2, d: 1.6, h: 0.9, clear: { front: 0.6, sides: 0.9 } },
  dining_table_01: { label: "Dining table (4)", category: "dining", w: 1.6, d: 1.9, h: 0.76, clear: { front: 0.4, sides: 0.4 } },
  dining_table_02: { label: "Dining table (6)", category: "dining", w: 2.4, d: 1.9, h: 0.76, clear: { front: 0.4, sides: 0.4 } },
  sideboard_01: { label: "Sideboard", category: "dining", w: 1.8, d: 0.45, h: 0.8, clear: { front: 0.6 } },
  vanity_01: { label: "Vanity + mirror", category: "bath", w: 1.0, d: 0.55, h: 1.9, clear: { front: 0.6 } },
  toilet_01: { label: "WC", category: "bath", w: 0.45, d: 0.7, h: 0.8, clear: { front: 0.5, sides: 0.15 } },
  shower_01: { label: "Walk-in shower", category: "bath", w: 0.9, d: 0.9, h: 2.1 },
  bathtub_01: { label: "Bathtub", category: "bath", w: 1.7, d: 0.8, h: 0.6, clear: { front: 0.5 } },
  bench_01: { label: "Bench", category: "decor", w: 1.6, d: 0.45, h: 0.45, clear: { front: 0.5 } },
} satisfies Record<string, CatalogItem>;

export type ModelId = keyof typeof ITEMS;
export const CATALOG: Record<ModelId, CatalogItem> = ITEMS;

export const isModelId = (id: string): id is ModelId => id in CATALOG;

export const modelPath = (id: string) => {
  const cat = isModelId(id) ? CATALOG[id].category : "misc";
  return `${ASSET_BASE}/models/${cat}/${id}.glb`;
};

/** Footprint for any id — unknown ids (e.g. from a model) get a 1 m box. */
export const footprint = (id: string): CatalogItem =>
  isModelId(id) ? CATALOG[id] : { label: id, category: "decor", w: 1, d: 1, h: 1 };

export const FLOORING: Record<FlooringType, { file: string; label: string }> = {
  hardwood: { file: "oak_hardwood_01", label: "Oak hardwood" },
  tile: { file: "porcelain_tile_01", label: "Porcelain tile" },
  carpet: { file: "wool_carpet_01", label: "Wool carpet" },
  marble: { file: "calacatta_marble_01", label: "Calacatta marble" },
};

export const texturePath = (t: FlooringType) => `${ASSET_BASE}/textures/flooring/${FLOORING[t].file}.jpg`;
