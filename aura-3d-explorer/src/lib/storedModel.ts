/**
 * A customer's own building model kept with their project: the original file
 * in Supabase Storage plus the review settings chosen when it was placed
 * (units, up axis, heading). Rebuilding runs the same safety checks and
 * normalisation as the import dialog (QA-022: size limits, no external
 * resources), so a stored model can never bypass them.
 */
import type { Object3D } from "three";
import { parseCadFile } from "./cadParser";
import { applyArchMaterials, normalizeImport } from "./importNormalize";
import { disposeModel, reviewModel } from "./modelReview";

export interface StoredModelSettings {
  fileName: string;
  metresPerUnit: number;
  upAxis: "y" | "z";
  heading: number;
}

/** Formats kept with a project (Storage bucket `project-models`). */
export const STORABLE_MODEL = /\.(glb|stl|dxf)$/i;
export const MAX_STORED_MODEL_BYTES = 50 * 1024 * 1024;

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
export function validModelSettings(value: unknown): value is StoredModelSettings {
  return record(value) && typeof value.fileName === "string" && STORABLE_MODEL.test(value.fileName)
    && typeof value.metresPerUnit === "number" && value.metresPerUnit > 0 && value.metresPerUnit < 1000
    && (value.upAxis === "y" || value.upAxis === "z") && typeof value.heading === "number" && Number.isFinite(value.heading);
}

export function modelContentType(fileName: string): string {
  if (/\.glb$/i.test(fileName)) return "model/gltf-binary";
  if (/\.stl$/i.test(fileName)) return "model/stl";
  return "application/dxf";
}

/** Download → parse → review → normalise → architectural materials. */
export async function rebuildStoredModel(file: File, settings: StoredModelSettings): Promise<Object3D> {
  const report = await parseCadFile(file);
  if (!report.model) throw new Error("The saved model contains no readable 3D geometry.");
  const review = reviewModel(report.model);
  if (review.errors.length) {
    disposeModel(report.model);
    throw new Error("The saved model failed its geometry review. Upload it again from the project editor.");
  }
  const normalized = normalizeImport(report.model, { upHint: settings.upAxis, metresPerUnit: settings.metresPerUnit });
  const root = normalized.root;
  const materials = applyArchMaterials(root);
  root.rotation.y = -settings.heading * Math.PI / 180;
  root.userData = { ...root.userData, fileName: settings.fileName, review, normalization: normalized.report, materials, heading: settings.heading, heightUnits: normalized.report.heightUnits, stored: true };
  return root;
}
