import type { CityId } from "./cityPresets";

export interface CityLandmarkPlacement {
  uid: string;
  name: string;
  position?: [number, number, number]; // [x, y, z] in world coordinates
  uw?: [number, number]; // [u, w] screen-frame coordinates (aligned with district offsetU/offsetW)
  targetHeight?: number; // Physical height in scene units (1 unit ≈ 3.57m)
  scale?: number;
  rotationY?: number;
}

export interface CityModel {
  uid: string;
  coverage: string;
  width: number;
  rotation: number;
  textured: boolean;
  /** Source-space ground elevation, measured from broad horizontal ground faces.
   * Underground skirts are intentionally allowed below the site plane. */
  groundY: number;
  /** Screen-frame offsets (u across, w towards viewer). Default is u=0, w=-55-depth/2. */
  offsetU?: number;
  offsetW?: number;
  /** Explicit world position [x, y, z]. If set, overrides (offsetU, offsetW). */
  worldPosition?: [number, number, number];
  /** Landmark models anchored into this city's skyline at real-world coordinates. */
  landmarks?: CityLandmarkPlacement[];
}

/**
 * Authored Sketchfab city & district backdrops georeferenced to project sites.
 *
 * Orientation notes:
 *  - Scene world +X is East, +Z is South, -Z is North, -X is West.
 *  - Screen frame: u is along (+X, -Z)/√2; w is along (+X, +Z)/√2 (water at +w, city at -w).
 *  - Rotations align the model's actual streets and water shorelines to true map bearings.
 */
export const CITY_MODELS: Partial<Record<CityId, CityModel>> = {
  // New York / Jersey City: The Meridian Tower is on the Jersey City Hudson River waterfront.
  // Lower Manhattan (1 WTC, Wall St) is East across the Hudson River (x~450, z~-80; u~375, w~260).
  // Avenue grid angle ~29° NE. Rotating model aligns West Street along the river facing Jersey City.
  "new-york": {
    groundY: -1.187324,
    uid: "372bc495b3a941308f4a3198bc45e17b",
    coverage: "Lower Manhattan · Financial District & World Trade Center",
    width: 680,
    rotation: -1.06,
    offsetU: 380,
    offsetW: 240,
    textured: true,
    landmarks: [
      { uid: "ff93086fa20345d4b4562ce95095e292", name: "Citigroup Center", uw: [390, 210], targetHeight: 78, rotationY: 0.5 },
      { uid: "14e3d5743f7546d5bb7f3befc72c9057", name: "New York High-Rise", uw: [370, 260], targetHeight: 62, rotationY: -0.2 },
      { uid: "9359c41541814b968360fc4f3823892c", name: "New York Condominium", uw: [350, 280], targetHeight: 48, rotationY: 0.3 }
    ]
  },
  // Chicago: The Bourse on the Chicago lakefront / river. Loop street grid aligned north-south.
  chicago: {
    groundY: 0.05665,
    uid: "5910afb517bd4d2cafd8f280dabf37a4",
    coverage: "Chicago · Downtown Loop & Michigan Ave",
    width: 480,
    rotation: 0,
    offsetU: 40,
    offsetW: -160,
    textured: true,
    landmarks: [
      { uid: "fa82b5beb9a9427698dafd2c3867ebf9", name: "Park Tower", uw: [35, -150], targetHeight: 72 }
    ]
  },
  // Dubai: Al-Noor Tower in Downtown Dubai on the canal / lake.
  dubai: {
    groundY: -0.065989,
    uid: "0e60e12f253442ee8baffa3d9afb2c3d",
    coverage: "Downtown Dubai & Sheikh Zayed Rd",
    width: 1100,
    rotation: 0.15,
    offsetU: 0,
    offsetW: -140,
    textured: true,
    landmarks: [
      { uid: "191cf9a66d204ccc941e097bcfe90f27", name: "Burj Khalifa", uw: [10, -135], targetHeight: 232 }
    ]
  },
  // London: The Ironworks on the south bank facing north across the River Thames to City of London.
  london: {
    groundY: -1.913676,
    uid: "74cc9216f2c24efa96fe2554897e5966",
    coverage: "City of London · Thames North Bank Financial District",
    width: 580,
    rotation: 1.57,
    offsetU: -30,
    offsetW: -180,
    textured: true,
  },
  // Boston: Seaport / Waterfront facing Boston Harbor & downtown.
  boston: {
    groundY: 0.063456,
    uid: "395d4a8639de411592797890e219dbd2",
    coverage: "Boston · Financial District & Harbor",
    width: 440,
    rotation: -0.3,
    offsetU: -20,
    offsetW: -170,
    textured: true,
    landmarks: [
      { uid: "b33e54d616c44c1795fb86f433c0dfc0", name: "100 Federal St", uw: [-15, -165], targetHeight: 49 }
    ]
  },
};



