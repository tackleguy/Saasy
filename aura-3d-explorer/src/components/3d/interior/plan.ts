/**
 * Interior plan glue — feeds the pure room planner (lib/roomPlan) with the
 * furniture that FurnitureOverlay actually places, and the lift bank.
 * -----------------------------------------------------------------------------
 * Calls `layoutFloor` with exactly the arguments FurnitureOverlay uses, so the
 * walls are planned around the same placements. Results are cached per plate
 * (shape, size, twist, zone position), like the furniture batches.
 *
 * Units: plans and colliders are plate-local METRES; multiply by MODEL_SCALE
 * for scene units (or render inside a group scaled by MODEL_SCALE).
 */
import type { FacadeSpec, FloorData } from "@/types";
import { MODEL_SCALE } from "@/lib/tower";
import { liftBank } from "@/lib/lift";
import { balconyPlan, roomPlan, type BalconySpec, type Collider, type RoomPlan } from "@/lib/roomPlan";
import { layoutFloor } from "../furniture/layouts";
import { PIECES } from "../furniture/kit";
import { SLAB_THICKNESS } from "../FurnitureOverlay";

/** Depth of the lift lobby kept clear in front of the bank, metres. */
export const LOBBY_DEPTH_M = 1.8;

const planCache = new Map<string, RoomPlan>();

/** Interior wall / door plan of a floor (cached). */
export function interiorPlanFor(floor: FloorData, coreSize: number, crownFloors: number): RoomPlan {
  const coreHalfM = coreSize / 2 / MODEL_SCALE;
  const coreAngle = -floor.rotationY;
  const zoneIndex = floor.zone === "crown" ? floor.zoneIndex : 0;
  const key = [floor.zone, floor.width, floor.depth, floor.height, coreSize, coreAngle.toFixed(4), zoneIndex, crownFloors, floor.shape?.kind, floor.shape?.amount].join(":");
  const hit = planCache.get(key);
  if (hit) return hit;

  const widthM = floor.width / MODEL_SCALE;
  const depthM = floor.depth / MODEL_SCALE;
  const placements = layoutFloor(floor.zone, widthM, depthM, coreHalfM, coreAngle, zoneIndex, crownFloors, floor.shape);
  const bank = liftBank(coreSize, floor.height - SLAB_THICKNESS);
  const plan = roomPlan({
    zone: floor.zone,
    widthM,
    depthM,
    shape: floor.shape,
    coreHalfM,
    rotationY: floor.rotationY,
    zoneIndex,
    crownFloors,
    pieces: placements.map((p) => ({ piece: p.piece, x: p.x, z: p.z, rot: p.rot, w: PIECES[p.piece].w, d: PIECES[p.piece].d })),
    lobby: { halfWidthM: bank.halfWidth / MODEL_SCALE + 0.35, depthM: LOBBY_DEPTH_M },
    clearHeightM: (floor.height - SLAB_THICKNESS) / MODEL_SCALE,
  });
  planCache.set(key, plan);
  return plan;
}

/**
 * Solid wall runs of a floor for the walk-through: capsules in plate-local
 * METRES (openings removed; kit bathroom and arch walls included). Use with
 * `pushOutOfWalls` from lib/roomPlan.
 */
export function wallCollidersFor(floor: FloorData, coreSize: number, crownFloors: number): Collider[] {
  return interiorPlanFor(floor, coreSize, crownFloors).colliders;
}

const balconyCache = new Map<string, BalconySpec[]>();

/** Balconies of a floor (cached per zone, plate size and shape). */
export function balconiesFor(floor: FloorData, facade: Pick<FacadeSpec, "balconies">): BalconySpec[] {
  const band = floor.zone === "residential" && facade.balconies;
  const key = [floor.zone, floor.width, floor.depth, floor.shape?.kind, floor.shape?.amount, band].join(":");
  const hit = balconyCache.get(key);
  if (hit) return hit;
  const specs = balconyPlan(floor.zone, floor.width / MODEL_SCALE, floor.depth / MODEL_SCALE, floor.shape, band);
  balconyCache.set(key, specs);
  return specs;
}
