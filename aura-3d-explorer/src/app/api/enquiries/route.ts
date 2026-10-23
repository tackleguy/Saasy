/**
 * /api/enquiries — project enquiries ("Book viewing", "Request pro forma") and
 * developer demo requests.
 *
 * POST { kind, name, email, company?, message?, projectSlug?, details? }
 *   → 200 { stored, emailed }   at least one delivery path succeeded
 *   → 503 { stored: false, emailed: false, error }   nothing is connected / both failed
 *
 * Stores every submission in Supabase (`enquiries`, via the service role) so a
 * failed email never loses a lead, then emails it with Resend. Same-origin
 * only, rate limited per IP, honeypot field `website`.
 */
import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/apiGuard";
import { readJsonObject, RequestBodyError } from "@/lib/requestBody";
import { emailConfigured, parseEnquiry, sendWithResend } from "@/lib/enquiries";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProject } from "@/content/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { limit: 5, windowMs: 10 * 60_000 };

export async function POST(req: Request) {
  const blocked = guardRequest(req, "enquiries", LIMIT);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, 16_000);
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Could not read the request." }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const input = parseEnquiry(body);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  const admin = supabaseAdmin();
  let stored = false, projectName: string | null = null, rowId: string | null = null;
  if (admin && input.projectSlug) {
    const { data } = await admin.from("projects").select("id, org_id, name").eq("slug", input.projectSlug).order("org_id", { nullsFirst: true }).limit(1).maybeSingle();
    if (data) projectName = data.name;
    const { data: row, error } = await admin.from("enquiries").insert({
      project_id: data?.id ?? null, org_id: data?.org_id ?? null, kind: input.kind, name: input.name, email: input.email,
      company: input.company, message: input.message, details: input.details,
    }).select("id").single();
    stored = !error; rowId = row?.id ?? null;
    if (error) console.warn(`[enquiries] could not store: ${error.message}`);
  } else if (admin) {
    const { data: row, error } = await admin.from("enquiries").insert({ kind: input.kind, name: input.name, email: input.email, company: input.company, message: input.message, details: input.details }).select("id").single();
    stored = !error; rowId = row?.id ?? null;
    if (error) console.warn(`[enquiries] could not store: ${error.message}`);
  }
  projectName ??= input.projectSlug ? getProject(input.projectSlug)?.name ?? null : null;

  const emailed = emailConfigured() ? await sendWithResend(input, projectName) : false;
  if (admin && rowId) await admin.from("enquiries").update({ delivery: emailed ? "emailed" : emailConfigured() ? "email_failed" : "stored" }).eq("id", rowId);

  if (!stored && !emailed) {
    return NextResponse.json({
      stored: false, emailed: false,
      error: admin || emailConfigured()
        ? "We could not deliver your request just now. Nothing was sent; please try again in a few minutes."
        : "This site is not connected to an inbox yet, so your request was not sent.",
    }, { status: 503 });
  }
  return NextResponse.json({ stored, emailed });
}
