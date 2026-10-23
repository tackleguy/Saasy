/**
 * POST /api/share/export { token, format, inputsById? } — the pro forma of a
 * shared project, only when its owner chose "Share financials". The token is
 * re-resolved (expiry, revocation, password cookie) on every request.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/apiGuard";
import { readJsonObject, RequestBodyError } from "@/lib/requestBody";
import { resolveShare, shareCookie } from "@/lib/share";
import { buildExportModel } from "@/lib/exports/model";
import { exportResponse } from "@/lib/exports/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = guardRequest(req, "exports", { limit: 30, windowMs: 10 * 60_000 });
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 200_000); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Could not read the request." }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token : "";
  const format = body.format === "pdf" || body.format === "xlsx" ? body.format : null;
  if (!format) return NextResponse.json({ error: "Choose pdf or xlsx." }, { status: 400 });
  const result = await resolveShare(token, (await cookies()).get(shareCookie(token))?.value ?? null);
  if (result.kind !== "ok") return NextResponse.json({ error: "This link is not available." }, { status: 404 });
  if (!result.share.financials) return NextResponse.json({ error: "Financials are not shared on this link." }, { status: 403 });
  const inputsById = body.inputsById && typeof body.inputsById === "object" && !Array.isArray(body.inputsById) ? (body.inputsById as Record<string, unknown>) : null;
  const model = buildExportModel({ project: result.share.project, inputsById, branding: { orgName: result.share.branding.name, accent: result.share.branding.accent ?? undefined } });
  return exportResponse(model, format);
}
