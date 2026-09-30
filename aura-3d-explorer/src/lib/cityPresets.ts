/**
 * City presets — the urban backdrop a project is rendered in.
 * -----------------------------------------------------------------------------
 * Each preset tunes the procedural context (see components/3d/context/*) to
 * read as a real city: light and haze, water colour, block grid, building
 * heights and materials, street trees, vehicle mix (yellow cabs, red buses,
 * left-hand traffic), how people dress, and a few generic landmark
 * silhouettes on the skyline. Pure data, no Three.js, so UI code can import
 * it without pulling in the WebGL bundle.
 *
 * Units: 1 scene unit ≈ 3.57 m. Heights below are in storeys (0.9 units).
 */

export type CityId =
  | "generic"
  | "new-york"
  | "miami"
  | "los-angeles"
  | "chicago"
  | "san-francisco"
  | "seattle"
  | "boston"
  | "toronto"
  | "london"
  | "dubai";

export type FacadeKind = "glass" | "brick" | "plaster" | "stone";

/**
 * Generic landmark silhouettes (no branding, just massing):
 *   deco      stepped art-deco tower with a mast
 *   obelisk   chamfered tapering glass tower with a spire
 *   pyramid   tall four-sided pyramid
 *   needle    slender concrete shaft with an observation pod and antenna
 *   saucer    three-legged tower with a saucer top
 *   stepped   Y-plan supertall that steps back in rings, with a long spire
 *   shard     faceted glass spire
 *   bullet    rounded glass "egg" tower
 *   bundled   cluster of dark tubes of different heights, twin antennas
 *   tapered   dark tapering box with twin antennas
 *   crown     cylinder with a stepped glass crown
 *   slab      thin mirror-glass slab
 *   bridge    suspension bridge crossing the water (u = position, runs along w)
 */
export type LandmarkKind = "deco" | "obelisk" | "pyramid" | "needle" | "saucer" | "stepped" | "shard" | "bullet" | "bundled" | "tapered" | "crown" | "slab" | "bridge";

export interface Landmark {
  kind: LandmarkKind;
  /** Screen-frame position (u across the view, w towards the viewer; negative w = behind the site). */
  u: number;
  w: number;
  /** Height in scene units (for a bridge: tower height). */
  h: number;
  /** Main colour (glass tint, stone, paint). */
  color: string;
}

/** A downtown: centre (u, w), Gaussian radii along u / w, and peak height in storeys. */
export interface SkylineCluster {
  u: number;
  w: number;
  ru: number;
  rw: number;
  storeys: number;
}

export interface CityPreset {
  id: CityId;
  label: string;
  /** One line shown under the picker. */
  blurb: string;

  sky: {
    /** Sun elevation above the horizon, degrees. */
    elevation: number;
    turbidity: number;
    rayleigh: number;
    sunColor: string;
    sunIntensity: number;
    /** Background / fog colour. */
    haze: string;
    fogNear: number;
    fogFar: number;
    hemiSky: string;
    hemiGround: string;
    envIntensity: number;
  };

  /** Far ground, promenade paving, water. */
  ground: string;
  promenade: string;
  water: string;

  /** Street grid: block size along u / w and street width, scene units. */
  grid: { blockU: number; blockW: number; street: number };

  heights: {
    /** Max extra storeys near the site / mid distance / far away. */
    near: number;
    mid: number;
    far: number;
    /** Chance a lot in a downtown core becomes a supertall. */
    supertall: number;
  };

  /**
   * Skyline shape. Downtown clusters raise heights with a Gaussian falloff
   * from their centre, so each city gets its own silhouette (Midtown and
   * Downtown Manhattan, the Loop, Brickell's waterfront strip…). Tall
   * towers then pick a form from the lottery below.
   */
  skyline: {
    clusters: SkylineCluster[];
    /** Share of tall towers that are round, sit on a full-lot podium, or are slender point towers. */
    round: number;
    podium: number;
    slender: number;
    /** Chance a 35+ storey tower carries a spire or mast. */
    spires: number;
  };

  /** Low/mid-rise facade lottery (weights), and the glass share above 14 storeys. */
  facades: Record<FacadeKind, number>;
  tallGlass: number;
  /** Multiplied into each facade kind; one picked per building. */
  tints: Record<FacadeKind, string[]>;
  /** Chance a tall building steps back in tiers (wedding-cake zoning). */
  setbacks: number;
  /** Timber water tanks on low/mid-rise roofs. */
  waterTowers: boolean;
  landmarks: Landmark[];

  trees: {
    /** Share of street trees that are palms. */
    palms: number;
    hues: string[];
    /** Multiplier on the number of trees. */
    density: number;
  };

  traffic: {
    palette: string[];
    taxi: { color: string; share: number } | null;
    bus: { color: string; share: number; decker: boolean };
    /** Drive on the left (London). */
    driveLeft: boolean;
    density: number;
  };

  people: {
    tops: string[];
    bottoms: string[];
    density: number;
  };
}

/* ------------------------------------------------------------ shared bits */

const NEUTRAL_CARS = ["#e9e6df", "#d9d4cb", "#2b2d31", "#6b7078", "#8a8f96", "#b9b3a6", "#3b4a5c", "#9c7a52", "#c9c9c9", "#1f2a33"];
const US_CARS = ["#f2f1ee", "#1d1e21", "#8a8f96", "#5d6269", "#c9c9c9", "#23344d", "#7a1f24", "#e9e6df", "#3c3f44", "#b0b4b8"];
const CITY_TOPS = ["#1c1b19", "#2a2c30", "#6e6a63", "#e9e6df", "#3b4a5c", "#8e9e86", "#9c7a52", "#d9d4cb", "#7a4a3a", "#44505c"];
const CITY_BOTTOMS = ["#1c1b19", "#2d3440", "#3b4a5c", "#55504a", "#8a8175", "#23262b", "#c9c1b2"];
const GREENS = ["#7d8f6c", "#6f8a5e", "#8c9a6a", "#728b66", "#9aa470"];

const DEFAULT_SKY: CityPreset["sky"] = {
  elevation: 28,
  turbidity: 5,
  rayleigh: 1.4,
  sunColor: "#FFE8C8",
  sunIntensity: 2.6,
  haze: "#dfe2e1",
  fogNear: 160,
  fogFar: 520,
  hemiSky: "#cfdcea",
  hemiGround: "#b8ab97",
  envIntensity: 0.55,
};

const DEFAULT_TINTS: CityPreset["tints"] = {
  glass: ["#f0f0f0", "#e2e2e2", "#fafafa"],
  brick: ["#f0f0f0", "#e2e2e2", "#fafafa"],
  plaster: ["#f0f0f0", "#e2e2e2", "#fafafa"],
  stone: ["#f0f0f0", "#e2e2e2", "#fafafa"],
};

/* ---------------------------------------------------------------- presets */

export const CITY_PRESETS: CityPreset[] = [
  {
    id: "generic",
    label: "Neutral",
    blurb: "Placeless waterfront context, soft afternoon light",
    sky: DEFAULT_SKY,
    ground: "#CFC8BB",
    promenade: "#c9b596",
    water: "#5f7f84",
    grid: { blockU: 24, blockW: 22, street: 7 },
    heights: { near: 5, mid: 12, far: 22, supertall: 0.08 },
    skyline: { clusters: [{ u: 0, w: -210, ru: 110, rw: 60, storeys: 40 }], round: 0.15, podium: 0.3, slender: 0.2, spires: 0.2 },
    facades: { glass: 0.15, brick: 0.3, plaster: 0.3, stone: 0.25 },
    tallGlass: 0.75,
    tints: DEFAULT_TINTS,
    setbacks: 0,
    waterTowers: false,
    landmarks: [],
    trees: { palms: 0, hues: GREENS, density: 1 },
    traffic: { palette: NEUTRAL_CARS, taxi: null, bus: { color: "#e9e6df", share: 0.04, decker: false }, driveLeft: false, density: 1 },
    people: { tops: CITY_TOPS, bottoms: CITY_BOTTOMS, density: 1 },
  },
  {
    id: "new-york",
    label: "New York",
    blurb: "Hudson waterfront, brick walk-ups, deco setbacks, yellow cabs",
    sky: { ...DEFAULT_SKY, elevation: 26, turbidity: 6, haze: "#d9dde0", fogNear: 180, fogFar: 640, hemiSky: "#c8d6e6" },
    ground: "#c6c0b6",
    promenade: "#bfb3a0",
    water: "#4f6a6e",
    grid: { blockU: 62, blockW: 17, street: 6 },
    heights: { near: 7, mid: 22, far: 40, supertall: 0.14 },
    skyline: { clusters: [{ u: 40, w: -215, ru: 90, rw: 55, storeys: 70 }, { u: -120, w: -160, ru: 60, rw: 45, storeys: 60 }], round: 0.08, podium: 0.45, slender: 0.3, spires: 0.35 },
    facades: { glass: 0.12, brick: 0.5, plaster: 0.05, stone: 0.33 },
    tallGlass: 0.55,
    tints: {
      glass: ["#e4ebee", "#d0d9de", "#f2f4f4"],
      brick: ["#f4d9cc", "#e6c0ae", "#fff0e4", "#d8b8a8"],
      plaster: ["#f4f0e8"],
      stone: ["#f8f1e4", "#ece2d0", "#dcd4c6"],
    },
    setbacks: 0.55,
    waterTowers: true,
    landmarks: [
      { kind: "deco", u: 70, w: -230, h: 124, color: "#d8cfbf" },
      { kind: "obelisk", u: -95, w: -250, h: 150, color: "#b9cbd4" },
      { kind: "slab", u: 150, w: -200, h: 90, color: "#a9b8c0" },
      { kind: "bridge", u: -225, w: 0, h: 38, color: "#b7ab98" },
    ],
    trees: { palms: 0, hues: ["#6f8a5e", "#7d8f6c", "#65805a", "#859466"], density: 0.8 },
    traffic: { palette: US_CARS, taxi: { color: "#f2c318", share: 0.28 }, bus: { color: "#e8ecef", share: 0.06, decker: false }, driveLeft: false, density: 1.3 },
    people: { tops: ["#1c1b19", "#23262b", "#2a2c30", "#6e6a63", "#3b4a5c", "#e9e6df", "#44505c", "#7a4a3a", "#8a8175"], bottoms: ["#1c1b19", "#23262b", "#2d3440", "#3b4a5c", "#55504a"], density: 1.5 },
  },
  {
    id: "miami",
    label: "Miami",
    blurb: "Turquoise bay, white condo towers, pastel stucco and palms",
    sky: { ...DEFAULT_SKY, elevation: 42, turbidity: 3.2, rayleigh: 1.1, sunColor: "#fff3de", sunIntensity: 3.0, haze: "#dbe8ee", fogNear: 200, fogFar: 700, hemiSky: "#c4dcef", hemiGround: "#d6c9ae", envIntensity: 0.65 },
    ground: "#ddd3bd",
    promenade: "#e3d3b0",
    water: "#3f9a9c",
    grid: { blockU: 30, blockW: 24, street: 7 },
    heights: { near: 6, mid: 20, far: 45, supertall: 0.1 },
    skyline: { clusters: [{ u: 140, w: -60, ru: 45, rw: 70, storeys: 55 }, { u: -140, w: -50, ru: 40, rw: 60, storeys: 45 }, { u: 0, w: -230, ru: 120, rw: 40, storeys: 40 }], round: 0.15, podium: 0.6, slender: 0.45, spires: 0.1 },
    facades: { glass: 0.25, brick: 0, plaster: 0.65, stone: 0.1 },
    tallGlass: 0.8,
    tints: {
      glass: ["#f3f8f8", "#e6f1f2", "#ffffff", "#dcecef"],
      brick: ["#ffffff"],
      plaster: ["#ffffff", "#fde6d8", "#dff3ec", "#fbf3d6", "#e3eef8", "#f8dfe4"],
      stone: ["#fbf6ec", "#f2ead8"],
    },
    setbacks: 0.15,
    waterTowers: false,
    landmarks: [
      { kind: "slab", u: 110, w: -210, h: 85, color: "#e9f2f2" },
      { kind: "obelisk", u: -120, w: -240, h: 95, color: "#dbe9ec" },
      { kind: "crown", u: 40, w: -260, h: 75, color: "#eef3f2" },
    ],
    trees: { palms: 0.8, hues: ["#7fa05a", "#6f9a55", "#8aa864", "#6d8f4e"], density: 1.1 },
    traffic: { palette: ["#ffffff", "#f2f1ee", "#1d1e21", "#c9c9c9", "#8a8f96", "#2f6f9f", "#b02a2a", "#e9e6df", "#3aa0a0"], taxi: { color: "#f0f0f0", share: 0.04 }, bus: { color: "#f4f4f2", share: 0.05, decker: false }, driveLeft: false, density: 1 },
    people: { tops: ["#ffffff", "#f6e7c8", "#7fc8d6", "#f29c8a", "#f7d154", "#9ad0a8", "#e9e6df", "#1c1b19", "#e46f8f"], bottoms: ["#f2eee6", "#2d3440", "#c9b89a", "#6f93b6", "#1c1b19"], density: 1.1 },
  },
  {
    id: "los-angeles",
    label: "Los Angeles",
    blurb: "Warm haze, low stucco sprawl, a glass downtown and tall palms",
    sky: { ...DEFAULT_SKY, elevation: 22, turbidity: 8, rayleigh: 1.2, sunColor: "#ffdcb0", sunIntensity: 2.8, haze: "#e6ddce", fogNear: 150, fogFar: 560, hemiSky: "#d6dfe6", hemiGround: "#c8b590", envIntensity: 0.6 },
    ground: "#d4c7ad",
    promenade: "#dccaa4",
    water: "#4b8190",
    grid: { blockU: 34, blockW: 28, street: 9 },
    heights: { near: 3, mid: 5, far: 16, supertall: 0.07 },
    skyline: { clusters: [{ u: 20, w: -235, ru: 45, rw: 35, storeys: 55 }], round: 0.2, podium: 0.3, slender: 0.1, spires: 0.15 },
    facades: { glass: 0.12, brick: 0.05, plaster: 0.68, stone: 0.15 },
    tallGlass: 0.85,
    tints: {
      glass: ["#e2ecef", "#d3e2e8", "#eef3f3"],
      brick: ["#f1d7c8"],
      plaster: ["#fbf1df", "#f4e2c8", "#ffffff", "#f2d9c6", "#e8e2d2"],
      stone: ["#f4ead6", "#e8dcc4"],
    },
    setbacks: 0,
    waterTowers: false,
    landmarks: [
      { kind: "crown", u: -60, w: -250, h: 86, color: "#c9d2d6" },
      { kind: "obelisk", u: 40, w: -240, h: 94, color: "#a9c2cf" },
      { kind: "slab", u: 110, w: -265, h: 70, color: "#b7c7cf" },
    ],
    trees: { palms: 0.65, hues: ["#8a9a5e", "#7d8f5a", "#96a066", "#6f8656"], density: 1 },
    traffic: { palette: US_CARS, taxi: null, bus: { color: "#e9d27a", share: 0.03, decker: false }, driveLeft: false, density: 1.4 },
    people: { tops: ["#ffffff", "#1c1b19", "#e9e6df", "#c9b89a", "#7fa0b8", "#d98c6a", "#6e6a63", "#9ad0a8"], bottoms: ["#2d3440", "#3b4a5c", "#c9b89a", "#1c1b19", "#e9e6df"], density: 0.7 },
  },
  {
    id: "chicago",
    label: "Chicago",
    blurb: "Lake blue water, stone and steel, dark tube towers",
    sky: { ...DEFAULT_SKY, elevation: 30, turbidity: 4.2, sunColor: "#fff0dc", haze: "#d7dfe5", fogNear: 180, fogFar: 620, hemiSky: "#c3d4e6" },
    ground: "#c8c3ba",
    promenade: "#c6bca9",
    water: "#3f7488",
    grid: { blockU: 26, blockW: 26, street: 7 },
    heights: { near: 8, mid: 20, far: 36, supertall: 0.1 },
    skyline: { clusters: [{ u: 50, w: -220, ru: 100, rw: 55, storeys: 65 }, { u: -110, w: -150, ru: 50, rw: 40, storeys: 45 }], round: 0.15, podium: 0.35, slender: 0.25, spires: 0.3 },
    facades: { glass: 0.2, brick: 0.3, plaster: 0.05, stone: 0.45 },
    tallGlass: 0.6,
    tints: {
      glass: ["#b8c2c7", "#a5afb4", "#d4dcdf"],
      brick: ["#f0d2c0", "#e4c4b0", "#f6e2d4"],
      plaster: ["#f0ece4"],
      stone: ["#efe6d6", "#dcd2c2", "#cfc6b8"],
    },
    setbacks: 0.35,
    waterTowers: false,
    landmarks: [
      { kind: "bundled", u: 60, w: -245, h: 148, color: "#2e3134" },
      { kind: "tapered", u: -110, w: -225, h: 128, color: "#34373a" },
      { kind: "obelisk", u: 150, w: -215, h: 100, color: "#aeb9bf" },
    ],
    trees: { palms: 0, hues: ["#6f8a5e", "#7d8f6c", "#65805a"], density: 0.9 },
    traffic: { palette: US_CARS, taxi: { color: "#f2c318", share: 0.08 }, bus: { color: "#e6e8ea", share: 0.06, decker: false }, driveLeft: false, density: 1.2 },
    people: { tops: CITY_TOPS, bottoms: CITY_BOTTOMS, density: 1.2 },
  },
  {
    id: "san-francisco",
    label: "San Francisco",
    blurb: "Cool bay fog, pastel row houses, a red suspension bridge",
    sky: { ...DEFAULT_SKY, elevation: 24, turbidity: 7, rayleigh: 1.6, sunColor: "#fff1e2", sunIntensity: 2.3, haze: "#dde3e6", fogNear: 140, fogFar: 580, hemiSky: "#ccd8e2", hemiGround: "#b9b3a6", envIntensity: 0.6 },
    ground: "#c9c6bd",
    promenade: "#c7bca8",
    water: "#4d6f7a",
    grid: { blockU: 22, blockW: 20, street: 6 },
    heights: { near: 3, mid: 8, far: 24, supertall: 0.06 },
    skyline: { clusters: [{ u: 10, w: -205, ru: 60, rw: 45, storeys: 48 }], round: 0.1, podium: 0.4, slender: 0.3, spires: 0.15 },
    facades: { glass: 0.15, brick: 0.1, plaster: 0.6, stone: 0.15 },
    tallGlass: 0.7,
    tints: {
      glass: ["#dbe5e8", "#cfdbe0", "#eef2f2"],
      brick: ["#f0d6c8"],
      plaster: ["#ffffff", "#f7e6c9", "#dfe9f2", "#f2dce0", "#e1efe3", "#f4efe2"],
      stone: ["#f3ebdc", "#e2dacb"],
    },
    setbacks: 0.1,
    waterTowers: false,
    landmarks: [
      { kind: "pyramid", u: 30, w: -220, h: 73, color: "#ece9e2" },
      { kind: "obelisk", u: -70, w: -250, h: 92, color: "#c3d1d8" },
      { kind: "bridge", u: -225, w: 0, h: 64, color: "#b8452c" },
    ],
    trees: { palms: 0.2, hues: ["#6f8a5e", "#7d8f6c", "#5f7d56", "#8c9a6a"], density: 0.9 },
    traffic: { palette: US_CARS, taxi: { color: "#f2c318", share: 0.05 }, bus: { color: "#c8392b", share: 0.05, decker: false }, driveLeft: false, density: 1 },
    people: { tops: ["#1c1b19", "#3b4a5c", "#6e6a63", "#8e9e86", "#e9e6df", "#7a4a3a", "#44505c", "#b8a47a"], bottoms: CITY_BOTTOMS, density: 1.1 },
  },
  {
    id: "seattle",
    label: "Seattle",
    blurb: "Soft overcast, Puget Sound greys, evergreens and a saucer tower",
    sky: { ...DEFAULT_SKY, elevation: 34, turbidity: 10, rayleigh: 2.2, sunColor: "#f4f1ea", sunIntensity: 1.9, haze: "#d6dadb", fogNear: 140, fogFar: 560, hemiSky: "#d2d8de", hemiGround: "#a9aca2", envIntensity: 0.7 },
    ground: "#bfbeb6",
    promenade: "#bdb6a8",
    water: "#4b6468",
    grid: { blockU: 24, blockW: 24, street: 7 },
    heights: { near: 5, mid: 12, far: 30, supertall: 0.06 },
    skyline: { clusters: [{ u: 30, w: -215, ru: 60, rw: 45, storeys: 52 }], round: 0.1, podium: 0.35, slender: 0.25, spires: 0.15 },
    facades: { glass: 0.25, brick: 0.3, plaster: 0.2, stone: 0.25 },
    tallGlass: 0.8,
    tints: {
      glass: ["#b9c5ca", "#a7b4ba", "#cfd8dc"],
      brick: ["#ecd0c0", "#e0c2b2"],
      plaster: ["#f0ede6", "#e4e2dc"],
      stone: ["#e8e1d4", "#d6cfc2"],
    },
    setbacks: 0.1,
    waterTowers: false,
    landmarks: [
      { kind: "saucer", u: -110, w: -200, h: 52, color: "#e9e6df" },
      { kind: "bundled", u: 40, w: -245, h: 84, color: "#2d3236" },
      { kind: "slab", u: 110, w: -230, h: 64, color: "#9fb0b8" },
    ],
    trees: { palms: 0, hues: ["#4f6b48", "#5b7650", "#667f58", "#48623f"], density: 1.2 },
    traffic: { palette: US_CARS, taxi: null, bus: { color: "#e6e8ea", share: 0.05, decker: false }, driveLeft: false, density: 1 },
    people: { tops: ["#1c1b19", "#2d3440", "#44505c", "#556b4f", "#6e6a63", "#7a4a3a", "#3b4a5c"], bottoms: CITY_BOTTOMS, density: 0.9 },
  },
  {
    id: "boston",
    label: "Boston",
    blurb: "Charles River light, red-brick rows, a mirror-glass slab",
    sky: { ...DEFAULT_SKY, elevation: 27, turbidity: 5, sunColor: "#ffecd2", haze: "#dde1e2" },
    ground: "#c8c1b5",
    promenade: "#c1b39c",
    water: "#4d6b74",
    grid: { blockU: 20, blockW: 18, street: 6 },
    heights: { near: 4, mid: 8, far: 24, supertall: 0.05 },
    skyline: { clusters: [{ u: -30, w: -215, ru: 55, rw: 40, storeys: 42 }, { u: 120, w: -200, ru: 30, rw: 30, storeys: 30 }], round: 0.05, podium: 0.4, slender: 0.2, spires: 0.1 },
    facades: { glass: 0.12, brick: 0.62, plaster: 0.06, stone: 0.2 },
    tallGlass: 0.65,
    tints: {
      glass: ["#d6e0e4", "#c6d2d8"],
      brick: ["#f2c8b4", "#e4b39e", "#f8d8c6", "#dca894"],
      plaster: ["#f4f0e8"],
      stone: ["#efe7d8", "#ddd4c4"],
    },
    setbacks: 0.2,
    waterTowers: false,
    landmarks: [
      { kind: "slab", u: 40, w: -230, h: 67, color: "#a9c0cc" },
      { kind: "crown", u: -80, w: -245, h: 63, color: "#b9bdbf" },
    ],
    trees: { palms: 0, hues: ["#6f8a5e", "#7d8f6c", "#65805a", "#8c9a6a"], density: 1.1 },
    traffic: { palette: US_CARS, taxi: { color: "#f2c318", share: 0.04 }, bus: { color: "#e6e8ea", share: 0.05, decker: false }, driveLeft: false, density: 1 },
    people: { tops: CITY_TOPS, bottoms: CITY_BOTTOMS, density: 1.1 },
  },
  {
    id: "toronto",
    label: "Toronto",
    blurb: "Lake Ontario harbourfront, blue-glass condos and a needle tower",
    sky: { ...DEFAULT_SKY, elevation: 30, turbidity: 4.5, sunColor: "#fff0da", haze: "#d8e0e5", fogNear: 180, fogFar: 620 },
    ground: "#c8c3ba",
    promenade: "#c6bca9",
    water: "#3f6f82",
    grid: { blockU: 26, blockW: 24, street: 7 },
    heights: { near: 10, mid: 30, far: 40, supertall: 0.08 },
    skyline: { clusters: [{ u: 0, w: -190, ru: 90, rw: 50, storeys: 60 }, { u: 150, w: -80, ru: 40, rw: 60, storeys: 45 }], round: 0.15, podium: 0.55, slender: 0.5, spires: 0.15 },
    facades: { glass: 0.55, brick: 0.2, plaster: 0.05, stone: 0.2 },
    tallGlass: 0.9,
    tints: {
      glass: ["#bcd4de", "#a9c6d2", "#cfe0e6", "#9fbccb"],
      brick: ["#ecd0c0"],
      plaster: ["#f0ede6"],
      stone: ["#e8e1d4", "#d6cfc2"],
    },
    setbacks: 0.05,
    waterTowers: false,
    landmarks: [
      { kind: "needle", u: -80, w: -210, h: 155, color: "#d4cfc4" },
      { kind: "obelisk", u: 60, w: -240, h: 82, color: "#b8a45e" },
      { kind: "slab", u: 130, w: -225, h: 80, color: "#8fb1c4" },
    ],
    trees: { palms: 0, hues: ["#6f8a5e", "#7d8f6c", "#65805a"], density: 0.9 },
    traffic: { palette: US_CARS, taxi: { color: "#f2f2ee", share: 0.05 }, bus: { color: "#c8392b", share: 0.07, decker: false }, driveLeft: false, density: 1.1 },
    people: { tops: CITY_TOPS, bottoms: CITY_BOTTOMS, density: 1.2 },
  },
  {
    id: "london",
    label: "London",
    blurb: "Thames grey light, Portland stone and stock brick, red buses",
    sky: { ...DEFAULT_SKY, elevation: 20, turbidity: 9, rayleigh: 2, sunColor: "#f6ecdc", sunIntensity: 2.0, haze: "#d4d6d4", fogNear: 140, fogFar: 560, hemiSky: "#cfd5da", hemiGround: "#aca596", envIntensity: 0.65 },
    ground: "#c1bcb2",
    promenade: "#b9ad98",
    water: "#5b6a60",
    grid: { blockU: 20, blockW: 18, street: 5 },
    heights: { near: 4, mid: 7, far: 14, supertall: 0.04 },
    skyline: { clusters: [{ u: 40, w: -215, ru: 40, rw: 35, storeys: 45 }, { u: -160, w: -150, ru: 30, rw: 30, storeys: 45 }], round: 0.2, podium: 0.3, slender: 0.25, spires: 0.1 },
    facades: { glass: 0.12, brick: 0.45, plaster: 0.13, stone: 0.3 },
    tallGlass: 0.85,
    tints: {
      glass: ["#d2dbde", "#c3cdd1"],
      brick: ["#fbe8c8", "#f2d8b4", "#f0cdb8", "#e8c2a8"],
      plaster: ["#fbf8f1", "#f1ede4"],
      stone: ["#f7f1e2", "#ece5d4"],
    },
    setbacks: 0.05,
    waterTowers: false,
    landmarks: [
      { kind: "shard", u: 20, w: -225, h: 87, color: "#c9d6dc" },
      { kind: "bullet", u: -90, w: -250, h: 50, color: "#6d8792" },
      { kind: "crown", u: 110, w: -250, h: 55, color: "#b4bcbf" },
    ],
    trees: { palms: 0, hues: ["#6f8a5e", "#7d8f6c", "#65805a", "#859466"], density: 1 },
    traffic: {
      palette: ["#1d1e21", "#f2f1ee", "#8a8f96", "#5d6269", "#c9c9c9", "#23344d", "#3c3f44", "#b0b4b8"],
      taxi: { color: "#1b1c1e", share: 0.18 },
      bus: { color: "#c1231c", share: 0.12, decker: true },
      driveLeft: true,
      density: 1.1,
    },
    people: { tops: ["#1c1b19", "#23262b", "#2d3440", "#6e6a63", "#8a8175", "#44505c", "#b8a47a", "#7a4a3a"], bottoms: CITY_BOTTOMS, density: 1.3 },
  },
  {
    id: "dubai",
    label: "Dubai",
    blurb: "Desert haze, sand stone, blue glass supertalls and palms",
    sky: { ...DEFAULT_SKY, elevation: 36, turbidity: 10, rayleigh: 0.8, sunColor: "#fff0d4", sunIntensity: 3.0, haze: "#e8dfcd", fogNear: 150, fogFar: 620, hemiSky: "#dfe3e4", hemiGround: "#d7c29a", envIntensity: 0.65 },
    ground: "#dccaa3",
    promenade: "#e0cfaa",
    water: "#3c8f98",
    grid: { blockU: 34, blockW: 30, street: 10 },
    heights: { near: 6, mid: 25, far: 55, supertall: 0.18 },
    skyline: { clusters: [{ u: 0, w: -150, ru: 170, rw: 22, storeys: 75 }, { u: -140, w: -240, ru: 45, rw: 40, storeys: 60 }], round: 0.25, podium: 0.4, slender: 0.45, spires: 0.5 },
    facades: { glass: 0.45, brick: 0, plaster: 0.25, stone: 0.3 },
    tallGlass: 0.9,
    tints: {
      glass: ["#bfdde2", "#a9ccd4", "#d7e8ea", "#b8c8d8"],
      brick: ["#f6e2c8"],
      plaster: ["#fbf1df", "#f6e6cc", "#ffffff"],
      stone: ["#f7e6c6", "#eed8b2", "#f4e8d2"],
    },
    setbacks: 0.1,
    waterTowers: false,
    landmarks: [
      { kind: "stepped", u: 40, w: -270, h: 232, color: "#c9d4da" },
      { kind: "obelisk", u: -110, w: -230, h: 115, color: "#9fc2cf" },
      { kind: "shard", u: 150, w: -240, h: 100, color: "#b8d0d8" },
    ],
    trees: { palms: 0.9, hues: ["#8a9a5e", "#96a066", "#7d8f5a"], density: 0.7 },
    traffic: { palette: ["#ffffff", "#f2f1ee", "#c9c9c9", "#1d1e21", "#8a8f96", "#b9b3a6", "#3c3f44"], taxi: { color: "#e9e1cf", share: 0.15 }, bus: { color: "#e8ecef", share: 0.04, decker: false }, driveLeft: false, density: 1.2 },
    people: { tops: ["#ffffff", "#f4f1ea", "#1c1b19", "#e9e6df", "#c9b89a", "#6e6a63", "#3b4a5c"], bottoms: ["#f2eee6", "#1c1b19", "#2d3440", "#c9b89a"], density: 0.8 },
  },
];

export const DEFAULT_CITY: CityId = "generic";

const BY_ID = new Map(CITY_PRESETS.map((p) => [p.id, p]));

export function getCityPreset(id: CityId | string | null | undefined): CityPreset {
  return BY_ID.get(id as CityId) ?? BY_ID.get(DEFAULT_CITY)!;
}

export function isCityId(id: string | null | undefined): id is CityId {
  return !!id && BY_ID.has(id as CityId);
}
