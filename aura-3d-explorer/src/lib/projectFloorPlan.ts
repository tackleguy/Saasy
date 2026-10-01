/**
 * Project floor plans — a required import, designed by the Aura Engine.
 * -----------------------------------------------------------------------------
 * A project does not invent apartment layouts. The imported plan (DXF, CAD
 * JSON, or a blueprint image / PDF read by the engine) is the floor design:
 * room polygons, openings and staged furniture. `fitPlanToPlate` drops that
 * drawing onto a tower plate in the plate's local metres (origin at the
 * centre) so the explorer, the walk-through and the mini plan all share it.
 *
 * Residential and penthouse floors use the plan. Amenity floors keep their
 * own programme. The plan is only scaled down when it is larger than the
 * plate, so a real metre drawing stays at real size when it fits.
 */
import type { FloorData } from "@/types";
import { MODEL_SCALE } from "@/lib/tower";
import type { Collider } from "@/lib/roomPlan";
import { bounds, edges } from "@/lib/engine/geometry";
import type { AuraFurniture, AuraScene, EngineResult } from "@/lib/engine/types";

export interface ProjectFloorPlan {
  id: string;
  fileName: string;
  buildingId: string;
  result: EngineResult;
}

/** The imported plan, seated on one plate. */
export interface FittedPlan {
  fileName: string;
  scene: AuraScene;
  openings: [number, number, number, number][];
  /** Solid wall runs in plate-local metres (door gaps left out). */
  colliders: Collider[];
  /** 1 when the drawing already fits the plate. */
  scale: number;
}

const fitCache = new Map<string, FittedPlan>();

/** Apartment and penthouse floors are designed from the import. */
export function planDesignsFloor(floor: FloorData): boolean {
  return !floor.amenity && (floor.zone === "residential" || floor.zone === "crown");
}

export function planForBuilding(plans: readonly ProjectFloorPlan[], buildingId: string): ProjectFloorPlan | null {
  for (let i = plans.length - 1; i >= 0; i--) if (plans[i].buildingId === buildingId) return plans[i];
  return null;
}

/** Short line for the assistant and the inspector. */
export function planSummary(plan: ProjectFloorPlan): string {
  const rooms = plan.result.scene.rooms;
  const names = rooms.map((r) => r.name).slice(0, 8).join(", ");
  const more = rooms.length > 8 ? ` +${rooms.length - 8}` : "";
  const area = plan.result.scene.projectInfo.totalSquareFeet.toLocaleString("en-US");
  return `${rooms.length} rooms · ${area} sf · ${names}${more}`;
}

function mapFurniture(f: AuraFurniture, map: (x: number, z: number) => [number, number], scale: number): AuraFurniture {
  const [x, z] = map(f.position[0], f.position[2]);
  return {
    ...f,
    position: [x, f.position[1], z],
    scale: scale === 1 ? f.scale : [f.scale[0] * scale, f.scale[1], f.scale[2] * scale],
  };
}

function wallColliders(scene: AuraScene, openings: [number, number, number, number][]): Collider[] {
  const out: Collider[] = [];
  for (const room of scene.rooms) {
    for (const e of edges(room.polygon)) {
      if (e.length < 0.2) continue;
      const gaps: [number, number][] = [];
      for (const [x1, z1, x2, z2] of openings) {
        const off = (x: number, z: number) => Math.abs((x - e.a[0]) * e.n[0] + (z - e.a[1]) * e.n[1]);
        if (off(x1, z1) > 0.28 || off(x2, z2) > 0.28) continue;
        const u = (x: number, z: number) => (x - e.a[0]) * e.t[0] + (z - e.a[1]) * e.t[1];
        const a = Math.max(0, Math.min(u(x1, z1), u(x2, z2)));
        const b = Math.min(e.length, Math.max(u(x1, z1), u(x2, z2)));
        if (b - a > 0.3) gaps.push([a, b]);
      }
      gaps.sort((p, q) => p[0] - q[0]);
      let cur = 0;
      const push = (a: number, b: number) => {
        if (b - a < 0.2) return;
        out.push({
          a: [e.a[0] + e.t[0] * a, e.a[1] + e.t[1] * a],
          b: [e.a[0] + e.t[0] * b, e.a[1] + e.t[1] * b],
          r: 0.08,
        });
      };
      for (const [a, b] of gaps) {
        push(cur, a);
        cur = Math.max(cur, b);
      }
      push(cur, e.length);
    }
  }
  return out;
}

/** Seat an imported plan on a plate. Null when this floor is not designed from a plan. */
export function designForFloor(plans: readonly ProjectFloorPlan[], floor: FloorData): FittedPlan | null {
  if (!planDesignsFloor(floor)) return null;
  const plan = planForBuilding(plans, floor.buildingId);
  if (!plan || !plan.result.scene.rooms.length) return null;

  const widthM = floor.width / MODEL_SCALE;
  const depthM = floor.depth / MODEL_SCALE;
  const key = `${plan.id}:${widthM.toFixed(2)}:${depthM.toFixed(2)}`;
  const hit = fitCache.get(key);
  if (hit) return hit;

  const pts = plan.result.scene.rooms.flatMap((r) => r.polygon);
  const b = bounds(pts);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const fit = Math.min((widthM - 1.2) / Math.max(b.w, 0.5), (depthM - 1.2) / Math.max(b.d, 0.5));
  const scale = !Number.isFinite(fit) || fit >= 1 ? 1 : Math.max(0.35, fit);
  const map = (x: number, z: number): [number, number] => [(x - cx) * scale, (z - cz) * scale];

  const scene: AuraScene = {
    ...plan.result.scene,
    rooms: plan.result.scene.rooms.map((r) => ({
      ...r,
      polygon: r.polygon.map(([x, z]) => map(x, z)),
      furniture: r.furniture.map((f) => mapFurniture(f, map, scale)),
    })),
  };
  const openings = plan.result.report.openings.map(([x1, z1, x2, z2]) => {
    const a = map(x1, z1);
    const c = map(x2, z2);
    return [a[0], a[1], c[0], c[1]] as [number, number, number, number];
  });
  const fitted: FittedPlan = { fileName: plan.fileName, scene, openings, colliders: wallColliders(scene, openings), scale };
  fitCache.set(key, fitted);
  return fitted;
}
