/**
 * Aura Engine — the engine-ready scene schema.
 * -----------------------------------------------------------------------------
 * `AuraScene` is the exact JSON contract the engine emits (and that an LLM is
 * asked to emit for blueprint images). Units are metres; the ground plane is
 * X / Z, Y is up. Furniture positions share the plan's coordinate frame.
 */

export type FlooringType = "hardwood" | "tile" | "carpet" | "marble";

export interface AuraFurniture {
  /** Catalog id, e.g. "sofa_modern_01", "bed_king_02". */
  modelId: string;
  /** CDN .glb path for the model. */
  modelPath: string;
  /** [X, Y, Z], metres, plan frame (Y = 0 is the finished floor). */
  position: [number, number, number];
  /** Euler [X, Y, Z], radians. Pieces face +Z before rotation. */
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface AuraRoom {
  id: string;
  name: string;
  /** Metres. */
  ceilingHeight: number;
  /** [X, Z] ground-plane vertices, metres, counter-clockwise seen from above. */
  polygon: [number, number][];
  flooring: { type: FlooringType; texturePath: string };
  furniture: AuraFurniture[];
}

export interface AuraScene {
  projectInfo: {
    totalSquareFeet: number;
    /** Metres. */
    defaultCeilingHeight: number;
    unitsCount: number;
  };
  materials: {
    defaultWall: { color: string; roughness: number };
  };
  rooms: AuraRoom[];
}

/** Where a room came from and what the engine did — shown next to the scene, never in it. */
export interface EngineReport {
  source: string;
  method: "dxf" | "cad-json" | "scene-json" | "vision";
  /** Model that read the plan (vision / AI paths only). */
  model?: string;
  units?: string;
  facts: { label: string; value: string }[];
  warnings: string[];
  /** Door / opening segments found in the plan ([x1, z1, x2, z2], metres) — drawn as gaps by the viewer. */
  openings: [number, number, number, number][];
}

export interface EngineResult {
  scene: AuraScene;
  report: EngineReport;
}
