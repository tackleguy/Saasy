/**
 * /api/exports/proforma — downloadable pro forma for a sample project.
 *
 * POST { projectSlug, inputsById?, format: "pdf" | "xlsx" }
 *   → 200 the file (attachment; no-store)
 *   → 400 bad body · 403 cross-site · 404 unknown project · 429 rate limited
 *
 * `inputsById` is the scenario on screen; each building's entry is validated
 * and an invalid or missing one falls back to the project default, so the file
 * always matches finance.ts. Database projects: build the model with
 * `buildExportModel` and return `exportResponse(model, format)` from
 * lib/exports/response (kept out of this file: a route module may only export
 * HTTP handlers and route config).
 */
import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/apiGuard";
import { readJsonObject, RequestBodyError } from "@/lib/requestBody";
import { getProject } from "@/content/projects";
import { buildExportModel } from "@/lib/exports/model";
import { exportResponse } from "@/lib/exports/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { limit: 30, windowMs: 10 * 60_000 };

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export async function POST(req: Request) {
  const blocked = guardRequest(req, "exports", LIMIT);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, 200_000);
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Could not read the request." }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const { projectSlug, inputsById, format } = body;
  if (format !== "pdf" && format !== "xlsx") return NextResponse.json({ error: 'Choose a format: "pdf" or "xlsx".' }, { status: 400 });
  if (typeof projectSlug !== "string" || !projectSlug) return NextResponse.json({ error: "Missing project." }, { status: 400 });
  if (inputsById !== undefined && inputsById !== null && !record(inputsById)) return NextResponse.json({ error: "inputsById must be an object keyed by building id." }, { status: 400 });

  const project = getProject(projectSlug);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  try {
    const model = buildExportModel({ project, inputsById: inputsById ?? null });
    return await exportResponse(model, format);
  } catch (error) {
    console.error(`[exports] ${projectSlug} ${format}: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: "The export could not be generated." }, { status: 500 });
  }
}
