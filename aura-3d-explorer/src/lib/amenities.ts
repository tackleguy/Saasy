/**
 * Amenity floors — shared residents' / tenants' programmes (pure data).
 * -----------------------------------------------------------------------------
 * A building can declare `amenities: [{ floor, kind, name? }]` on its
 * massing. The floor keeps its zone (plate size, twist, facade family) but:
 *   • finance — it is not sold: 0 units, 0 revenue; it still carries its share
 *     of the build cost plus an amenity fit-out premium (FIT_OUT_PREMIUM of
 *     its hard cost), so a tower with more amenity floors costs a little more
 *   • 3D — furniture comes from components/3d/furniture/amenities.ts, the room
 *     planner treats it as open plan (no apartment demising) and the facade
 *     reads as a recessed, warmly lit "sky terrace" band
 *   • UI — inspector, stacking bar / plan and legend show it as "Amenity"
 */
import type { AmenityKind, Building, FloorData } from "@/types";

export interface AmenityMeta {
  kind: AmenityKind;
  /** Default display name. */
  label: string;
  /** One-line description for the inspector. */
  description: string;
}

/** Accent colour of amenity floors in legends and stacking diagrams. */
export const AMENITY_ACCENT = "#10b981";

/**
 * Amenity fit-out premium: extra hard cost on an amenity floor as a fraction
 * of that floor's base hard cost (pools, spa wet areas, cinema acoustics…).
 */
export const FIT_OUT_PREMIUM = 0.2;

export const AMENITIES: Record<AmenityKind, AmenityMeta> = {
  "sky-lobby": { kind: "sky-lobby", label: "Sky Lobby", description: "Transfer lobby with concierge desk, lounge seating and planting — residents change lifts here." },
  gym: { kind: "gym", label: "Fitness Club", description: "Cardio row facing the glass, free weights and racks on rubber flooring, mirrored studio wall." },
  pool: { kind: "pool", label: "Infinity Pool", description: "25 m lap pool along the facade with sun loungers and parasols on a timber deck." },
  spa: { kind: "spa", label: "Spa & Wellness", description: "Treatment rooms behind glass, sauna, cold plunge pool and a quiet relaxation lounge." },
  lounge: { kind: "lounge", label: "Residents' Lounge", description: "Library lounge with sofa groups on rugs and a cocktail bar with stools." },
  cinema: { kind: "cinema", label: "Private Cinema", description: "Tiered screening room with lounge seating, enclosed behind acoustic glass." },
  coworking: { kind: "coworking", label: "Co-working Club", description: "Bookable desks, phone booths and a meeting table for residents working from home." },
  kids: { kind: "kids", label: "Kids' Club", description: "Soft play mats, craft tables and a supervised play zone with city views." },
  "sky-garden": { kind: "sky-garden", label: "Sky Garden", description: "Double-height garden of trees and planters with benches along winding paths." },
  observation: { kind: "observation", label: "Observation Lounge", description: "Lounge chairs and telescopes turned to the glass — the highest public view in the tower." },
  dining: { kind: "dining", label: "Private Dining", description: "Chef's table for twelve beside an open show kitchen, bookable by residents." },
  "golf-sim": { kind: "golf-sim", label: "Golf Simulator", description: "Full-swing simulator bay with impact screen, tee mat and a lounge for waiting players." },
};

/** Display name of an amenity floor ("Infinity Pool"), or null for an ordinary floor. */
export const amenityName = (floor: Pick<FloorData, "amenity" | "amenityName">): string | null =>
  floor.amenity ? floor.amenityName ?? AMENITIES[floor.amenity].label : null;

/** Every amenity floor of a building, bottom → top. */
export const amenityFloors = (building: Pick<Building, "floors">): FloorData[] => building.floors.filter((f) => !!f.amenity);
