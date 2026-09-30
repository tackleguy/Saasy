/**
 * AURA — shared TypeScript contracts.
 * -----------------------------------------------------------------------------
 * Every piece of data that crosses a component boundary (3D ⇄ UI ⇄ finance)
 * is typed here so the scene, the sidebar and the yield engine agree on shape.
 */

/* ------------------------------------------------------------------ 3D site */

/** The four architectural programmes stacked in every tower. */
export type ZoneId = "podium" | "office" | "residential" | "crown";

/** Identifier of a building within a project site (e.g. "meridian", "tower-a"). */
export type BuildingId = string;

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

/* -------------------------------------------------------------- plan shapes */

/**
 * Floor-plate plan shapes. Every outline is generated inside the plate's
 * width × depth bounding box (see `planOutline` in lib/tower.ts).
 *   rect      — plain rectangle (default)
 *   rounded   — rectangle with rounded corners
 *   ellipse   — ellipse (a circle when width = depth)
 *   hexagon   — six-sided, points on ±X
 *   octagon   — regular-looking octagon (a chamfer of ≈29%)
 *   triangle  — isosceles triangle with rounded corners, apex towards −Z
 *   l-shape   — rectangle with the +X / −Z quadrant notched out
 *   cross     — plus / cruciform plan
 *   chamfer   — rectangle with 45° cut corners
 */
export type PlanShapeKind = "rect" | "rounded" | "ellipse" | "hexagon" | "octagon" | "triangle" | "l-shape" | "cross" | "chamfer";

export interface PlanShape {
  kind: PlanShapeKind;
  /**
   * Shape parameter, 0 – 1, meaning depends on the kind:
   * rounded → corner radius (fraction of half the short side), triangle →
   * corner radius (fraction of the short side), chamfer → cut (fraction of
   * the short side), l-shape → notch size (fraction of each side), cross →
   * arm width (fraction of each side). Ignored by the others.
   */
  amount?: number;
}

/** Vertical profile modifiers applied on top of the per-zone plate sizes. */
export interface MassingProfile {
  /**
   * Wedding-cake setbacks: from floor fraction `at` (0 – 1 of the total floor
   * count) upward, office / residential plates are scaled by `scale` (≤ 1).
   * The last matching entry wins, so list them in ascending `at`.
   */
  setbacks: { at: number; scale: number }[];
  /** Easing of the residential taper (linear = the original straight taper). */
  taperCurve: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  /**
   * Belly profile over the office + residential shaft: 0 = straight; 0.2 =
   * the ends are 20% smaller than the zone plate at mid-height. The zone
   * width / depth is always the widest point, so plates stay in the box.
   */
  bulge: number;
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
  /** Plan shape of this zone's plates (width × depth is its bounding box). */
  shape: PlanShape;
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

/**
 * Shared residents' / tenants' amenity programmes. An amenity floor keeps its
 * zone (massing, facade family) but is not sold: see lib/amenities.
 */
export type AmenityKind =
  | "sky-lobby"
  | "gym"
  | "pool"
  | "spa"
  | "lounge"
  | "cinema"
  | "coworking"
  | "kids"
  | "sky-garden"
  | "observation"
  | "dining"
  | "golf-sim";

/** One amenity floor of a building. */
export interface AmenitySpec {
  /** 1-based storey number. */
  floor: number;
  kind: AmenityKind;
  /** Display name, e.g. "Infinity Pool" (defaults to the kind's label). */
  name?: string;
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
  /**
   * Plate scale at the top of the residential zone relative to its bottom
   * (1 = straight shaft, 0.6 = supertall taper). Crown floors keep their own size.
   */
  taper: number;
  /** Side length of the square lift & stair core, scene units. */
  coreSize: number;
  /** Setbacks, taper easing and bulge. */
  profile: MassingProfile;
  facade: FacadeSpec;
  zones: Record<ZoneId, ZoneGeometry>;
  /** Shared amenity floors (not sold). */
  amenities?: AmenitySpec[];
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
  /** Bounding-box width (X) of the plate outline, scene units. */
  width: number;
  /** Bounding-box depth (Z) of the plate outline, scene units. */
  depth: number;
  /** Plan shape; the outline is `planOutline(shape, width, depth)`. */
  shape: PlanShape;
  height: number;
  /** Y of the floor's underside when the tower is NOT exploded. */
  baseY: number;
  /** Rotation of the plate about the vertical axis, radians (the core never rotates). */
  rotationY: number;
  /** Plate footprint area, scene units² — the true outline area (≤ width × depth). */
  footprintM2: number;
  /** Shared amenity programme on this floor (not sold; keeps its zone). */
  amenity?: AmenityKind;
  /** Display name of the amenity floor. */
  amenityName?: string;
}

/** A building spec with its generated floors. */
export interface Building extends BuildingSpec {
  floors: FloorData[];
}

/* ------------------------------------------------------------ yield engine */

/** Preset that sets relative zone prices (the unit mix itself is fixed — see UNIT_MIX). */
export type UnitMixStrategy = "balanced" | "luxury_heavy" | "commercial_focus";

/** Developer pro-forma assumptions for one building. */
export interface YieldInputs {
  /** Total buildable (gross) area, sq ft. */
  totalBuildableSqFt: number;
  /** Land acquisition cost, $. */
  landCost: number;
  /** Hard construction cost, $ per sq ft. */
  hardCostPerSqFt: number;
  /** Soft costs (design, fees, permits, marketing) as % of hard cost. */
  softCostPct: number;
  /** Contingency as % of hard + soft cost. */
  contingencyPct: number;
  /** Construction loan as % of land + development cost (loan-to-cost). */
  ltcPct: number;
  /** Annual interest rate on the construction loan, %. */
  interestRatePct: number;
  /** Construction / loan term, months. */
  termMonths: number;
  /** Achieved sale price per sq ft for each programme zone, $. */
  pricePerSqFt: Record<ZoneId, number>;
  /** Units sold per month once sales launch. */
  absorptionUnitsPerMonth: number;
  /** Agency / broker commission, % of sales. */
  salesCommissionPct: number;
  /** AURA success fee, % of sales (1%). */
  auraFeePct: number;
  /** Target profit on cost used for the residual land value, %. */
  targetProfitOnCostPct: number;
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
  /** Share of total development cost, by area (amenity floors carry their fit-out premium). */
  cost: number;
  profit: number;
  /** Set on shared amenity floors (0 units, 0 revenue). */
  amenity?: AmenityKind;
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
  /** Share of GDV, 0 – 1. */
  share: number;
}

/** One month of the development cash flow. */
export interface CashflowMonth {
  month: number;
  /** Land + development spend this month (positive = outflow). */
  spend: number;
  /** Net sales receipts this month (after commission and fee). */
  receipts: number;
  equityIn: number;
  equityOut: number;
  /** Outstanding loan incl. capitalised interest, end of month. */
  debt: number;
  /** Cumulative equity position (distributions − contributions). */
  equityPosition: number;
}

/** Full pro-forma output for one building. */
export interface YieldMetrics {
  /** Gross development value (total sales). */
  gdv: number;
  landCost: number;
  hardCost: number;
  softCost: number;
  contingency: number;
  financeCost: number;
  salesCommission: number;
  /** AURA success fee (auraFeePct × GDV). */
  platformFee: number;
  totalDevelopmentCost: number;
  profit: number;
  /** Profit ÷ total development cost × 100. */
  profitOnCostPct: number;
  /** Profit ÷ GDV × 100. */
  marginOnGdvPct: number;
  /** Total equity contributed. */
  equityRequired: number;
  peakDebt: number;
  /** Annualised equity IRR, %, or null if it can't be computed. */
  irrPct: number | null;
  equityMultiple: number;
  /** Land value that hits the target profit on cost. */
  residualLandValue: number;
  /** Months from land purchase to last sale closing. */
  durationMonths: number;
  totalUnits: number;
  cashflow: CashflowMonth[];
  floors: FloorYield[];
  zones: ZoneYield[];
}

/** Site-wide roll-up across all buildings. */
export interface SiteMetrics {
  gdv: number;
  totalDevelopmentCost: number;
  profit: number;
  profitOnCostPct: number;
  marginOnGdvPct: number;
  platformFee: number;
  equityRequired: number;
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

/* ------------------------------------------------------------------ content */

export type ProjectStatus = "Concept" | "Approved" | "Under Construction" | "Selling";

export interface ProjectImage {
  /** Path under /public, e.g. /projects/seaform-hotel/hero-1.jpg */
  src: string;
  alt: string;
}
