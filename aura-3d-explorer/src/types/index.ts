/**
 * AURA — shared TypeScript contracts.
 * -----------------------------------------------------------------------------
 * Every piece of data that crosses a component boundary (3D ⇄ UI ⇄ finance)
 * is typed here so the scene, the sidebar and the yield engine agree on shape.
 */

/* ------------------------------------------------------------------ 3D site */

/** The four architectural programmes stacked in every tower. */
export type ZoneId = "podium" | "office" | "residential" | "crown";

/** The three buildings on the development site. */
export type BuildingId = "meridian" | "spire" | "lofts";

/** Programme metadata shared by every building (look, economics, copy). */
export interface ZoneMeta {
  id: ZoneId;
  /** Long display name, e.g. "Podium & Grand Lobby". */
  label: string;
  /** Compact name for legends and chart axes. */
  short: string;
  /** Accent colour for legends, charts and selection glow. */
  accent: string;
  /** Average saleable unit size in sq ft — drives the unit count. */
  avgUnitSqFt: number;
  /** Plural noun for a unit in this zone ("residences", "office suites"…). */
  unitNoun: string;
  /** One-line architectural description for the inspector card. */
  description: string;
}

/** Physical massing of one zone within a specific building. */
export interface ZoneGeometry {
  /** 1-based floor range covered by this zone (inclusive). */
  floors: [first: number, last: number];
  /** Plate width (X), scene units. */
  width: number;
  /** Plate depth (Z), scene units. */
  depth: number;
  /** Floor-to-floor height, scene units. */
  height: number;
}

/** Facade articulation for a building. */
export interface FacadeSpec {
  /** Spacing of vertical bronze fins on office floors, scene units (0 = none). */
  finSpacing: number;
  /** Curved horizontal balcony bands on residential floors. */
  balconies: boolean;
  /** Stone-clad podium with an arcade of arched openings. */
  arches: boolean;
}

/** Static definition of one building on the site. */
export interface BuildingSpec {
  id: BuildingId;
  name: string;
  /** One-word label for chips and legends. */
  short: string;
  tagline: string;
  /** Ground-plane position of the tower's centre [x, z]. */
  position: [x: number, z: number];
  /** Degrees of twist added per floor from the first residential floor up (0 = none). */
  twistDeg: number;
  /** Side length of the square lift & stair core, scene units. */
  coreSize: number;
  facade: FacadeSpec;
  zones: Record<ZoneId, ZoneGeometry>;
}

/** One individually addressable floor plate. */
export interface FloorData {
  buildingId: BuildingId;
  /** 0-based index from the ground up — used by the explosion formula. */
  index: number;
  /** 1-based floor number shown to users ("Floor 1" is the lobby). */
  number: number;
  zone: ZoneId;
  /** 0-based position of this floor within its zone. */
  zoneIndex: number;
  width: number;
  depth: number;
  height: number;
  /** Y of the floor's underside when the tower is NOT exploded. */
  baseY: number;
  /** Rotation of the plate about the vertical axis, radians (the core never rotates). */
  rotationY: number;
  /** Plate footprint area, scene units² (width × depth). */
  footprintM2: number;
}

/** A building spec with its generated floors. */
export interface Building extends BuildingSpec {
  floors: FloorData[];
}

/* ------------------------------------------------------------ yield engine */

/** How the value of the scheme is distributed across programmes. */
export type UnitMixStrategy = "balanced" | "luxury_heavy" | "commercial_focus";

/** User-controlled financial assumptions (one set per building). */
export interface YieldInputs {
  /** Total buildable (gross) area, 50,000 – 300,000 sq ft. */
  totalBuildableSqFt: number;
  /** Average achieved sale price, $800 – $2,500 per sq ft. */
  avgPricePerSqFt: number;
  /** Hard construction cost, $400 – $1,200 per sq ft. */
  buildCostPerSqFt: number;
  unitMixStrategy: UnitMixStrategy;
}

/** Min / max / step for each numeric slider. */
export interface InputRange {
  min: number;
  max: number;
  step: number;
}

/** Yield attributed to a single floor plate. */
export interface FloorYield {
  index: number;
  zone: ZoneId;
  /** Gross area allocated to this floor, sq ft. */
  sqFt: number;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
}

/** Yield rolled up to a programme zone. */
export interface ZoneYield {
  zone: ZoneId;
  label: string;
  accent: string;
  floorCount: number;
  sqFt: number;
  units: number;
  revenue: number;
  /** Share of gross revenue, 0 – 1. */
  share: number;
}

/** Full output of the yield engine for one building. */
export interface YieldMetrics {
  grossProjectRevenue: number;
  totalConstructionCost: number;
  grossProfit: number;
  /** Gross profit ÷ gross revenue × 100. */
  grossMarginPct: number;
  /** Revenue × 0.99 − construction cost. */
  developerNetRevenue: number;
  /** Revenue × 0.01. */
  platformSuccessFee: number;
  totalUnits: number;
  floors: FloorYield[];
  zones: ZoneYield[];
}

/** Site-wide roll-up across all buildings. */
export interface SiteMetrics {
  grossProjectRevenue: number;
  totalConstructionCost: number;
  grossProfit: number;
  grossMarginPct: number;
  developerNetRevenue: number;
  platformSuccessFee: number;
  totalUnits: number;
  totalFloors: number;
  totalSqFt: number;
}

/* ------------------------------------------------------------- view state */

/** Viewport presets exposed in the header. */
export type ViewMode = "massing" | "exploded" | "interior";

/** One stage of the simulated CAD ingestion pipeline. */
export interface IngestionStage {
  label: string;
  /** Progress (0 – 100) at which this stage starts. */
  from: number;
  /** Progress (0 – 100) at which this stage completes. */
  to: number;
}
