/**
 * Procedural stand-ins for the Aura Engine catalog (see lib/engine/catalog).
 * Each builder returns kit `Part`s in real metres, centred on the footprint,
 * facing +Z with the back at −d/2, standing on y = 0 — the same contract as
 * the .glb files the catalog's modelPath points at.
 */
import { KIT, place, type Part } from "@/components/3d/furniture/kit";
import { CATALOG, isModelId, type ModelId } from "@/lib/engine/catalog";

const { part, sofa, coffeeTable, floorLamp, plant, tableLamp, desk, monitor, taskChair, barStool, diningSet, wardrobe, tub, liftBy } = KIT;

function bed(w: number): Part[] {
  const d = 2.2;
  const back = -d / 2;
  return [
    part("rbox", "fabricGrey", 0, 0, back + 0.05, w, 1.05, 0.1), // headboard
    part("box", "walnut", 0, 0, back + 0.1 + 1.05, w - 0.05, 0.28, 2.1),
    part("rbox", "linen", 0, 0.28, back + 0.13 + 1.05, w - 0.15, 0.24, 2.0),
    part("rbox", "fabricCream", 0, 0.48, back + 1.5, w - 0.1, 0.07, 1.36),
    part("box", "fabricAccent", 0, 0.55, back + 1.92, w - 0.1, 0.02, 0.42),
    ...(w > 1.8 ? [-0.45, 0.45] : [-0.36, 0.36]).map((x) => part("rbox", "linen", x, 0.5, back + 0.35, w > 1.8 ? 0.64 : 0.56, 0.14, 0.38)),
  ];
}

const BUILD: Record<ModelId, () => Part[]> = {
  sofa_modern_01: () => sofa(2.4),
  armchair_01: () => sofa(0.95, "fabricCream"),
  coffee_table_01: () => coffeeTable(),
  media_console_01: () => [
    part("box", "walnut", 0, 0, 0, 1.8, 0.45, 0.45),
    part("box", "brass", 0, 0.45, 0, 1.82, 0.01, 0.46),
    part("box", "metalDark", 0, 0.46, -0.1, 0.3, 0.03, 0.18),
    part("box", "screen", 0, 0.62, -0.1, 1.45, 0.82, 0.04),
  ],
  rug_living_01: () => [part("box", "rug", 0, 0, 0, 3.0, 0.012, 2.2)],
  floor_lamp_01: () => floorLamp(),
  plant_01: () => plant(0.85),
  bed_king_02: () => bed(2.0),
  bed_queen_01: () => bed(1.7),
  nightstand_01: () => [part("box", "walnut", 0, 0, 0, 0.5, 0.45, 0.4), ...place(tableLamp(), 0, -0.04).map(liftBy(0.45))],
  wardrobe_01: () => wardrobe(),
  desk_workstation_01: () => [...place(desk(), 0, -0.25), ...place(monitor(), 0, -0.4).map(liftBy(0)), ...place(taskChair(), 0, 0.35, Math.PI)].map((p) =>
    // desk() is 1.2 wide — stretch the top to the 1.4 m footprint
    p.m === "oak" ? { ...p, s: [1.4, p.s[1], p.s[2]] as [number, number, number] } : p
  ),
  bookshelf_01: () => [
    part("box", "oak", -0.585, 0, 0, 0.03, 2.0, 0.35),
    part("box", "oak", 0.585, 0, 0, 0.03, 2.0, 0.35),
    part("box", "oak", 0, 0, -0.165, 1.2, 2.0, 0.02),
    ...[0, 0.4, 0.8, 1.2, 1.6, 1.97].map((y) => part("box", "oak", 0, y, 0, 1.14, 0.03, 0.33)),
    ...[0.03, 0.43, 0.83, 1.23].flatMap((y, i) => [
      part("box", i % 2 ? "fabricAccent" : "leather", -0.3 + i * 0.05, y, 0.0, 0.42, 0.28, 0.24),
      part("box", i % 2 ? "lacquer" : "walnut", 0.25, y, 0.0, 0.3, 0.24, 0.22),
    ]),
  ],
  kitchen_run_01: () => [
    part("box", "lacquer", 0, 0, 0, 3.0, 0.86, 0.62),
    part("box", "marble", 0, 0.86, 0, 3.02, 0.04, 0.65),
    part("box", "lacquer", 0, 1.5, -0.13, 3.0, 0.7, 0.36),
    part("box", "metalDark", 0.75, 0.9, 0.0, 0.6, 0.01, 0.5),
    part("box", "brushed", -0.7, 0.86, 0.02, 0.7, 0.045, 0.42),
    part("cyl", "brushed", -0.7, 0.9, -0.25, 0.03, 0.3, 0.03),
  ],
  kitchen_island_01: () => [
    part("box", "walnut", 0, 0, -0.3, 2.2, 0.86, 1.0),
    part("box", "marble", 0, 0.86, -0.3, 2.25, 0.04, 1.0),
    ...[-0.6, 0, 0.6].flatMap((x) => place(barStool(), x, 0.55)),
  ],
  dining_table_01: () => diningSet(4),
  dining_table_02: () => diningSet(6),
  sideboard_01: () => [
    part("box", "walnut", 0, 0.1, 0, 1.8, 0.65, 0.45),
    ...[-0.6, 0, 0.6].map((x) => part("box", "metalDark", x, 0, 0, 0.04, 0.1, 0.4)),
    part("box", "brass", 0, 0.42, 0.226, 1.2, 0.012, 0.01),
    part("cyl", "ceramic", 0.55, 0.75, 0, 0.16, 0.32, 0.16),
  ],
  vanity_01: () => [
    part("box", "walnut", 0, 0.12, 0, 1.0, 0.68, 0.5),
    part("box", "marble", 0, 0.8, 0, 1.03, 0.04, 0.55),
    part("cyl", "ceramic", 0, 0.84, 0.02, 0.42, 0.1, 0.32),
    part("cyl", "brushed", 0, 0.84, -0.19, 0.03, 0.22, 0.03),
    part("box", "brushed", 0, 1.1, -0.265, 0.9, 0.75, 0.02),
  ],
  toilet_01: () => [part("box", "ceramic", 0, 0.38, -0.26, 0.42, 0.38, 0.18), part("cyl", "ceramic", 0, 0, 0.05, 0.38, 0.4, 0.55), part("rbox", "lacquer", 0, 0.4, 0.05, 0.4, 0.04, 0.52)],
  shower_01: () => [
    part("box", "ceramic", 0, 0, 0, 0.9, 0.05, 0.9),
    part("box", "glass", -0.15, 0.05, 0.44, 0.6, 2.0, 0.02),
    part("cyl", "brushed", 0, 2.05, -0.2, 0.28, 0.02, 0.28),
    part("cyl", "brushed", 0, 0.1, -0.43, 0.02, 1.95, 0.02),
  ],
  bathtub_01: () => place(tub(), 0, 0, Math.PI / 2),
  bench_01: () => [part("box", "oak", 0, 0.4, 0, 1.6, 0.05, 0.45), part("box", "metalDark", -0.65, 0, 0, 0.05, 0.4, 0.4), part("box", "metalDark", 0.65, 0, 0, 0.05, 0.4, 0.4)],
};

/** Parts for any modelId; unknown ids become a labelled placeholder box. */
export function buildPiece(modelId: string): Part[] {
  if (isModelId(modelId)) return BUILD[modelId]();
  return [part("rbox", "lacquer", 0, 0, 0, 0.9, 0.8, 0.9)];
}

export const pieceSize = (modelId: string) => (isModelId(modelId) ? CATALOG[modelId] : { w: 0.9, d: 0.9, h: 0.8 });
