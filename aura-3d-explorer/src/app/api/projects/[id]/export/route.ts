/**
 * POST /api/projects/:id/export { format: "pdf" | "xlsx", inputsById? }
 * A customer project's pro forma as a file, for members of its organization
 * (row-level security finds the project only for them). Carries the
 * organization's name, accent and logo. `inputsById` exports exactly the
 * scenario on screen; invalid entries fall back to the project's defaults.
 */
import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/apiGuard";
import { readJsonObject, RequestBodyError } from "@/lib/requestBody";
import { currentMember } from "@/lib/supabase/server";
import { storedProjectFromRow } from "@/lib/data/projects";
import { buildExportModel } from "@/lib/exports/model";
import { exportResponse } from "@/lib/exports/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = guardRequest(req, "exports", { limit: 30, windowMs: 10 * 60_000 });
  if (blocked) return blocked;
  const member = await currentMember();
  if (!member?.org) return NextResponse.json({ error: "Sign in to export this project." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 200_000); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Could not read the request." }, { status: 400 }); }
  const format = body.format === "pdf" || body.format === "xlsx" ? body.format : null;
  if (!format) return NextResponse.json({ error: "Choose pdf or xlsx." }, { status: 400 });
  const { id } = await ctx.params;
  const { data: row } = await member.supabase.from("projects").select("id, org_id, slug, is_public, data").eq("id", id).maybeSingle();
  const stored = row ? storedProjectFromRow(row) : null;
  if (!stored) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  let logo: Buffer | null = null;
  if (member.org.logo_path) {
    const { data } = await member.supabase.storage.from("org-logos").download(member.org.logo_path);
    if (data) logo = Buffer.from(await data.arrayBuffer());
  }
  const inputsById = body.inputsById && typeof body.inputsById === "object" && !Array.isArray(body.inputsById) ? (body.inputsById as Record<string, unknown>) : null;
  const model = buildExportModel({ project: stored.project, inputsById, branding: { orgName: member.org.name, accent: member.org.accent_color ?? undefined, logo } });
  return exportResponse(model, format);
}
