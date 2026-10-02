/**
 * Apartment fit — which room plan and furniture set a floor is showing.
 * Stored per floor in the explorer. Apartments start unfurnished (corner
 * rooms, no pieces); the inspector or AURA adds a furniture set.
 */
export const APARTMENT_SCHEMES = ["corner", "living-out", "gallery", "studio"] as const;
export type ApartmentScheme = (typeof APARTMENT_SCHEMES)[number];

export const FURNITURE_SETS = ["none", "standard", "lounge", "formal"] as const;
export type FurnitureSet = (typeof FURNITURE_SETS)[number];
/** Sets that actually place furniture. */
export const FURNISHED_SETS: readonly FurnitureSet[] = FURNITURE_SETS.filter((s) => s !== "none");

export interface FloorFit {
  scheme: ApartmentScheme;
  furniture: FurnitureSet;
  /** Installed Sketchfab model IDs, replacing matching planner ensembles. */
  models?: string[];
}

export const DEFAULT_FIT: FloorFit = { scheme: "corner", furniture: "none" };

/** The fit the room planner lays out: an unfurnished floor gets the standard rooms. */
export function layoutFit(fit: FloorFit): FloorFit {
  return fit.furniture === "none" ? { ...fit, furniture: "standard" } : fit;
}

export const SCHEME_COPY: Record<ApartmentScheme, { label: string; blurb: string }> = {
  corner: { label: "Corner suites", blurb: "Master bedroom in the outer corner, living toward the hall." },
  "living-out": { label: "Living to the glass", blurb: "Living and dining on the facade, bedrooms toward the corridor." },
  gallery: { label: "Gallery", blurb: "Both bedrooms along the party wall, living room on the view." },
  studio: { label: "Open studio", blurb: "One bedroom and an open kitchen-living room." },
};

export const FURNITURE_COPY: Record<FurnitureSet, { label: string; blurb: string }> = {
  none: { label: "Empty", blurb: "Unfurnished — ask AURA to furnish it." },
  standard: { label: "Standard", blurb: "Sofa, galley kitchen and a four-seat table." },
  lounge: { label: "Lounge", blurb: "Deep lounge seating in place of the dining table." },
  formal: { label: "Formal", blurb: "Six-seat dining table and a piano." },
};

export function fitKey(buildingId: string, index: number) {
  return `${buildingId}:${index}`;
}

const SCHEME_ALIASES: Record<string, ApartmentScheme> = {
  corner: "corner",
  classic: "corner",
  default: "corner",
  suite: "corner",
  suites: "corner",
  "living-out": "living-out",
  living: "living-out",
  windows: "living-out",
  window: "living-out",
  facade: "living-out",
  glass: "living-out",
  gallery: "gallery",
  open: "gallery",
  party: "gallery",
  studio: "studio",
  "one-bed": "studio",
  onebed: "studio",
  compact: "studio",
};

const SET_ALIASES: Record<string, FurnitureSet> = {
  none: "none",
  empty: "none",
  unfurnished: "none",
  clear: "none",
  remove: "none",
  standard: "standard",
  furnished: "standard",
  add: "standard",
  default: "standard",
  classic: "standard",
  lounge: "lounge",
  casual: "lounge",
  sofa: "lounge",
  formal: "formal",
  dining: "formal",
  piano: "formal",
};

function alias(raw: string) {
  return raw.toLowerCase().replace(/[\s_]+/g, "-");
}

export function resolveScheme(raw: string | undefined): ApartmentScheme | "next" | null {
  if (!raw) return null;
  const key = alias(raw);
  if (key === "next" || key === "cycle" || key === "change") return "next";
  return SCHEME_ALIASES[key] ?? null;
}

export function resolveFurniture(raw: string | undefined): FurnitureSet | "next" | null {
  if (!raw) return null;
  const key = alias(raw);
  if (key === "next" || key === "cycle" || key === "change") return "next";
  return SET_ALIASES[key] ?? null;
}

export function nextScheme(current: ApartmentScheme): ApartmentScheme {
  return APARTMENT_SCHEMES[(APARTMENT_SCHEMES.indexOf(current) + 1) % APARTMENT_SCHEMES.length];
}

/** Next furnished set (an empty floor gets the standard set). */
export function nextFurniture(current: FurnitureSet): FurnitureSet {
  return FURNISHED_SETS[(FURNISHED_SETS.indexOf(current) + 1) % FURNISHED_SETS.length];
}
