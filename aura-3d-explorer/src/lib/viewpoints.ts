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
 */
import type { FloorData } from "@/types";
import { MODEL_SCALE } from "./tower";

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
export function viewpointsFor(floor: FloorData, crownFloors = 2): Viewpoint[] {
  const A = floor.width / MODEL_SCALE / 2;
  const B = floor.depth / MODEL_SCALE / 2;

  switch (floor.zone) {
    case "residential":
      return [
        { id: "living", label: "Living room", from: [A - 4.6, B - 8.4], look: [A - 1.0, B - 4.0] },
        { id: "kitchen", label: "Kitchen & dining", from: [A - 5.4, B - 5.6], look: [A - 8.8, B - 1.4] },
        { id: "bedroom", label: "Master bedroom", from: [A - 2.1, B - 4.4], look: [A - 2.0, B - 0.8] },
        { id: "bedroom2", label: "Second bedroom", from: [A - 4.4, 4.3], look: [A - 1.0, 1.6] },
        { id: "bath", label: "Bathroom", from: [A - 4.9, B - 4.2], look: [A - 4.9, B - 0.8] },
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
