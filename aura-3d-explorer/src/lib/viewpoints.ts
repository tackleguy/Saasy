/**
 * Walk-through viewpoints — curated "example views" for each floor type.
 * -----------------------------------------------------------------------------
 * Positions are in REAL METRES in the plate's local (un-twisted) frame and
 * mirror the furniture recipes in `components/3d/furniture/layouts.ts`
 * (A = half plate width, B = half plate depth). Residential views are taken
 * in the +X/+Z corner residence. The walk controller converts them to world
 * space and nudges any point that lands inside the core back out.
 *
 * `LIFT_VIEW` is a special index: stand in the lift lobby facing the doors
 * (the controller computes it from the core, which doesn't twist).
 *
 * With `coreSize`, residential views are taken from the furniture the
 * planner actually placed (foyer, WC, laundry, study, walk-in wardrobe… are
 * optional rooms that only exist where they fit), and residential / office
 * floors add a "Refuse room" view through the core's service passage
 * (lib/coreLayout). Pass the same arguments everywhere the indices are
 * shared (WalkControls, WalkHud, FloorPlanMini).
 */
import type { AmenityKind, FloorData } from "@/types";
import { MODEL_SCALE, planOutline, pointInPolygon } from "./tower";
import { coreLayout, coreServiceOpen } from "./coreLayout";
import { layoutFloor, type Placement } from "@/components/3d/furniture/layouts";

export interface Viewpoint {
  id: string;
  label: string;
  /** Standing position [x, z], metres, plate-local. */
  from: [number, number];
  /** Point looked at [x, z], metres, plate-local (at eye level). */
  look: [number, number];
}

/** Standing eye height, metres. */
export const EYE_HEIGHT_M = 1.6;

/** View index meaning "the lift lobby, facing the doors". */
export const LIFT_VIEW = -1;

/**
 * @param crownFloors floors in the building's crown — the penthouse layout
 *                    (and so its views) differs for single- and multi-level crowns
 */
/**
 * Amenity floors — mirrors the recipes in components/3d/furniture/amenities.ts
 * (same A / B half sizes, metres, plate-local).
 */
function amenityViewpoints(kind: AmenityKind, A: number, B: number): Viewpoint[] {
  const view: Viewpoint = { id: "view", label: "Sky view", from: [A - 1.2, 0.8], look: [A + 30, 6] };
  const v = (id: string, label: string, from: [number, number], look: [number, number]): Viewpoint => ({ id, label, from, look });
  switch (kind) {
    case "sky-lobby":
      return [v("arrival", "Sky lobby arrival", [0, B * 0.45], [0, B - 2.6]), v("lounge", "Lobby lounge", [A - 7.5, 3], [A - 3.4, 0]), view];
    case "gym":
      return [v("cardio", "Cardio row", [-2, B - 4.4], [0, B + 20]), v("weights", "Free weights", [A - 9.5, B - 9.5], [A - 5, B - 5]), view];
    case "pool":
      return [v("pool", "Pool deck", [-8, B - 6.2], [6, B - 2.3]), v("loungers", "Sun loungers", [A - 6, 1.5], [A - 1.7, 0]), view];
    case "spa":
      return [
        v("treatment", "Treatment rooms", [A - 5.2, 1], [A - 1.6, 0]),
        v("sauna", "Sauna & plunge pool", [-(A - 6), 0], [-(A - 1.4), -(B / 3)]),
        v("relax", "Relaxation lounge", [0, B - 6.4], [0, B - 1.2]),
      ];
    case "lounge":
      return [v("bar", "Cocktail bar", [0, B - 6.2], [0, B - 1.6]), v("lounge", "Lounge", [A - 7.2, 1], [A - 2.2, 0]), view];
    case "cinema":
      return [v("cinema", "Screening room", [0, -(B - 7.4)], [0, -B]), v("foyer", "Foyer bar", [0, B - 6.2], [0, B - 1.6]), view];
    case "coworking":
      return [v("desks", "Work club", [-(A - 1.2), -(B - 5.6)], [A - 4, B - 6]), v("meeting", "Meeting table", [4.2, B - 6.2], [0, B - 2.2]), view];
    case "kids":
      return [v("play", "Play zone", [0, B - 6.2], [0, B - 2]), v("craft", "Craft tables", [A - 8.4, 0], [A - 4.6, 0]), view];
    case "sky-garden":
      return [v("path", "Garden path", [0, B - 0.9], [0, B - 6]), v("garden", "Planted islands", [A - 1.2, B - 1.2], [0, 0]), view];
    case "observation":
      return [v("lounge", "Observation lounge", [A - 2.6, 0.5], [A + 40, 0]), v("telescopes", "Telescopes", [0, B - 2.4], [0, B + 40])];
    case "dining":
      return [v("table", "Chef's table", [-4, B - 7.4], [0, B - 3]), v("kitchen", "Show kitchen", [3, B - 5.2], [0, B - 1.2]), view];
    case "golf-sim":
      return [v("bay", "Simulator bay", [A / 2 - 0.5, B - 7], [A / 2 - 0.5, B]), v("lounge", "Players' lounge", [-(A - 7.2), 0], [-(A - 2.2), 0]), view];
  }
}

/** Kit-local point of a placed piece → plate (same convention as kit `place`). */
function at(p: Placement, lx: number, lz: number): [number, number] {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}

/** Stand in the service passage at the refuse room door, looking at the chutes (plate-local metres). */
function refuseView(floor: FloorData, coreSize: number): Viewpoint | null {
  const sv = coreLayout(coreSize).service;
  if (!sv || !coreServiceOpen(floor.zone)) return null;
  const c = Math.cos(floor.rotationY);
  const s = Math.sin(floor.rotationY);
  const toPlate = (x: number, z: number): [number, number] => [(x * c - z * s) / MODEL_SCALE, (x * s + z * c) / MODEL_SCALE];
  const dx = (sv.refuseDoor[0] + sv.refuseDoor[1]) / 2;
  const chute = sv.chutes[sv.chutes.length - 1];
  return { id: "refuse", label: "Refuse room", from: toPlate(dx, (sv.passage.z0 + sv.passage.z1) / 2), look: toPlate((dx + chute.x) / 2, chute.z) };
}

const resCache = new Map<string, Viewpoint[]>();

/** Residential views of the +X/+Z apartment, from the placed furniture. */
function residentialViews(floor: FloorData, crownFloors: number, coreSize: number, A: number, B: number): Viewpoint[] {
  const key = [floor.width, floor.depth, floor.rotationY.toFixed(4), coreSize, floor.shape?.kind, floor.shape?.amount, floor.zone].join(":");
  const hit = resCache.get(key);
  if (hit) return hit;
  const all = layoutFloor("residential", A * 2, B * 2, coreSize / 2 / MODEL_SCALE, -floor.rotationY, 0, crownFloors, floor.shape);
  const q = all.filter((p) => p.x > 0 && p.z > 0);
  const find = (...ids: string[]) => q.find((p) => ids.includes(p.piece));
  const off = (p: Placement, dx: number, dz: number): [number, number] => [p.x + dx, p.z + dz];
  const out: Viewpoint[] = [];
  const v = (id: string, label: string, from: [number, number], look: [number, number]) => out.push({ id, label, from, look });

  // Shaped plates place rooms by search (furniture/apartmentShaped), in any of four orientations,
  // so their views are taken in each piece's own frame; rect plates keep the recipe's fixed offsets.
  const shaped = !!floor.shape && floor.shape.kind !== "rect";
  const outline = shaped ? planOutline(floor.shape, A * 2, B * 2) : null;
  /** Shaped plates: a standing spot in the piece's frame, mirrored / centred if it would fall outside the glass. */
  const stand = (p: Placement, lx: number, lz: number): [number, number] => {
    for (const [x, z] of [[lx, lz], [-lx, lz], [0, lz], [0, lz * 0.6]]) {
      const pt = at(p, x, z);
      if (!outline || pointInPolygon(outline, pt[0], pt[1])) return pt;
    }
    return at(p, 0, lz * 0.6);
  };
  const foyer = find("foyer", "foyerM");
  if (foyer) v("foyer", "Entrance foyer", at(foyer, 0, -0.55), at(foyer, 0.2, 4));
  const living = find("living");
  if (living) v("living", "Living room", shaped ? stand(living, -1.6, 2.6) : off(living, -2.4, -3.3), shaped ? at(living, 0.8, -1.0) : off(living, 1.2, 1.1));
  const kitchen = find("kitchen");
  if (kitchen) v("kitchen", "Kitchen & dining", shaped ? stand(kitchen, -1.5, 3.2) : off(kitchen, 2.9, -3.7), shaped ? at(kitchen, 0.5, -0.5) : off(kitchen, -0.5, 0.5));
  const bed = find("bed");
  const arch = find("archWall");
  if (bed) v("bedroom", "Master bedroom", arch ? off(arch, 0, -1.2) : shaped ? stand(bed, 0, 2.6) : off(bed, 0, -2.6), shaped ? at(bed, 0, -0.6) : off(bed, 0, 0.6));
  const wir = find("wir");
  if (wir) v("wir", "Walk-in wardrobe", at(wir, 0, 1.15), at(wir, 0, -0.6));
  const baths = q.filter((p) => p.piece === "bathroom");
  const ens = bed ? [...baths].sort((a, b) => Math.hypot(a.x - bed.x, a.z - bed.z) - Math.hypot(b.x - bed.x, b.z - bed.z))[0] : undefined;
  if (ens) v("bath", "Ensuite", at(ens, -0.225, 1.55), at(ens, -0.2, -0.6));
  const bed2 = find("bedDouble");
  if (bed2) v("bedroom2", "Second bedroom", shaped ? stand(bed2, 1.0, 2.6) : off(bed2, -2.9, 2.7), shaped ? at(bed2, 0, -0.5) : off(bed2, 0.5, 0));
  const bath2 = baths.find((b) => b !== ens);
  if (bath2) v("bath2", "Second bathroom", at(bath2, -0.225, 1.55), at(bath2, -0.2, -0.6));
  const study = find("study", "studyM");
  if (study) v("study", "Study", at(study, study.piece === "study" ? 0.55 : -0.55, 0.6), at(study, 0, -1.3));
  const wc = find("wc", "wcM");
  if (wc) v("wc", "Guest WC", at(wc, 0, 1.35), at(wc, 0, -0.6));
  const laundry = find("laundry");
  if (laundry) v("laundry", "Laundry", at(laundry, 0, 1.4), at(laundry, 0, 0));
  if (shaped && living) v("view", "City view", at(living, 0, 2.2), at(living, 0, -40)); // over the sofa, out of the window
  else v("view", "City view", [A - 1.2, B - 11.2], [A + 30, B - 6]);
  resCache.set(key, out);
  return out;
}

export function viewpointsFor(floor: FloorData, crownFloors = 2, coreSize?: number): Viewpoint[] {
  const A = floor.width / MODEL_SCALE / 2;
  const B = floor.depth / MODEL_SCALE / 2;
  if (floor.amenity) return amenityViewpoints(floor.amenity, A, B);
  if (coreSize !== undefined && (floor.zone === "residential" || floor.zone === "office")) {
    const base = floor.zone === "residential" ? residentialViews(floor, crownFloors, coreSize, A, B) : viewpointsFor(floor, crownFloors);
    const refuse = refuseView(floor, coreSize);
    return refuse ? [...base, refuse] : base;
  }

  switch (floor.zone) {
    case "residential":
      return [
        { id: "living", label: "Living room", from: [A - 4.6, B - 8.8], look: [A - 1.0, B - 4.4] },
        { id: "kitchen", label: "Kitchen & dining", from: [A - 5.4, B - 5.6], look: [A - 8.8, B - 1.4] },
        { id: "bedroom", label: "Master bedroom", from: [A - 2.1, B - 4.6], look: [A - 2.0, B - 0.8] },
        { id: "bedroom2", label: "Second bedroom", from: [A - 4.4, 4.3], look: [A - 1.0, 1.6] },
        { id: "bath", label: "Bathroom", from: [A - 4.9, B - 3.0], look: [A - 4.9, B - 0.8] },
        { id: "view", label: "City view", from: [A - 1.2, B - 11.2], look: [A + 30, B - 6] },
      ];
    case "office":
      return [
        { id: "workspace", label: "Open-plan workspace", from: [-(A - 1.2), -(B - 5.6)], look: [A - 4, B - 6] },
        { id: "conference", label: "Conference suite", from: [4.2, B - 6.2], look: [0, B - 2.2] },
        { id: "lounge", label: "Break-out lounge", from: [-(A - 6.8), -(B - 6.4)], look: [-(A - 2.4), -(B - 2.2)] },
        { id: "view", label: "Skyline view", from: [A - 1.1, 0.8], look: [A + 30, 10] },
      ];
    case "crown":
      if (crownFloors <= 1)
        return [
          { id: "living", label: "Penthouse living", from: [0, B - 6.4], look: [0, B - 1.2] },
          { id: "kitchen", label: "Kitchen", from: [0, -(B - 6.2)], look: [0, -(B - 1.2)] },
          { id: "suite", label: "Master suite", from: [A - 4.4, B - 4.6], look: [A - 2.0, B - 1.2] },
          { id: "bath", label: "Ensuite", from: [A - 4.9, B - 4.2], look: [A - 4.9, B - 0.8] },
          { id: "view", label: "Sky view", from: [A - 1.0, B - 4.8], look: [A + 40, B + 12] },
        ];
      return floor.zoneIndex === 0
        ? [
            { id: "lounge", label: "Penthouse lounge", from: [-(A - 5.8), B - 6.8], look: [-(A - 2.3), B - 1.0] },
            { id: "pool", label: "Pool terrace", from: [A - 5.2, -(B - 4.6)], look: [A - 2.4, 1.6] },
            { id: "suite", label: "Guest suite", from: [-(A - 4.4), -(B - 4.6)], look: [-(A - 2), -(B - 1.2)] },
            { id: "view", label: "Sky view", from: [A - 1.0, B - 4.8], look: [A + 40, B + 12] },
          ]
        : [
            { id: "suite", label: "Master suite", from: [A - 4.4, B - 4.6], look: [A - 2.0, B - 1.2] },
            { id: "bath", label: "Ensuite", from: [A - 4.9, B - 4.2], look: [A - 4.9, B - 0.8] },
            { id: "lounge", label: "Upper lounge", from: [0, -(B - 6.4)], look: [0, -(B - 1.6)] },
            { id: "view", label: "Sky view", from: [A - 2.6, 0.2], look: [A + 40, -6] },
          ];
    default:
      return [
        { id: "arrival", label: "Arrival", from: [0, B - 0.9], look: [0, 0] },
        { id: "concierge", label: "Concierge", from: [0, B - 9.2], look: [0, B - 5.2] },
        { id: "lounge", label: "Lobby lounge", from: [A - 7.5, B - 7.5], look: [A - 3.2, B - 3.0] },
        { id: "cafe", label: "Café", from: [2, -(B - 6.2)], look: [-(A / 2), -(B - 1.2)] },
      ];
  }
}
