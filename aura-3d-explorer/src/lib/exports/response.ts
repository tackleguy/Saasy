/**
 * exports/response — turn an export model into a download Response.
 * Shared by /api/exports/proforma (sample projects) and any route that builds
 * a model for a database project.
 */
import type { ExportModel } from "./model";
import { buildProformaWorkbook } from "./xlsx";
import { buildProformaPdf } from "./pdf";

export type ExportFormat = "pdf" | "xlsx";

const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Render the model in `format` and wrap it as a download response. */
export async function exportResponse(model: ExportModel, format: ExportFormat): Promise<Response> {
  const file = format === "pdf" ? await buildProformaPdf(model) : await buildProformaWorkbook(model);
  const base = model.project.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  return new Response(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${base}-pro-forma.${format}"`,
      "Content-Length": String(file.length),
      "Cache-Control": "no-store",
    },
  });
}
