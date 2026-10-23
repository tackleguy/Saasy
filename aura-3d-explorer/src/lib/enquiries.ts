/**
 * Enquiry and demo-request handling, shared by the route and its tests.
 * Every valid submission is stored (Supabase `enquiries`) when the database is
 * configured, and emailed through Resend when RESEND_API_KEY and
 * AURA_ENQUIRY_TO are set. The visitor is told exactly which happened.
 */
export type EnquiryKind = "enquiry" | "demo";

export interface EnquiryInput {
  kind: EnquiryKind;
  name: string;
  email: string;
  company: string | null;
  message: string | null;
  projectSlug: string | null;
  /** Small structured extras: intent, unit, role, pipeline. */
  details: Record<string, string>;
}

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");

/** Validate untrusted JSON. Returns the clean input, or an error message for the visitor. */
export function parseEnquiry(body: Record<string, unknown>): EnquiryInput | string {
  // Honeypot: a hidden field people never fill in.
  if (text(body.website, 200)) return "Your request could not be sent.";
  const kind = body.kind === "demo" ? "demo" : body.kind === "enquiry" ? "enquiry" : null;
  if (!kind) return "Unknown request type.";
  const name = text(body.name, 120), email = text(body.email, 254);
  if (!name) return "Please enter your name.";
  if (!EMAIL.test(email)) return "Please enter a valid email address.";
  const details: Record<string, string> = {};
  if (body.details && typeof body.details === "object" && !Array.isArray(body.details)) {
    for (const [key, value] of Object.entries(body.details as Record<string, unknown>).slice(0, 8)) {
      const k = text(key, 32), v = text(value, 160);
      if (/^[a-z][a-zA-Z]*$/.test(k) && v) details[k] = v;
    }
  }
  const slug = text(body.projectSlug, 80);
  return {
    kind, name, email,
    company: text(body.company, 160) || null,
    message: text(body.message, 4000) || null,
    projectSlug: /^[a-z0-9-]+$/.test(slug) ? slug : null,
    details,
  };
}

export function enquiryEmail(input: EnquiryInput, projectName: string | null) {
  const subject = input.kind === "demo"
    ? `AURA demo request — ${input.name}${input.company ? `, ${input.company}` : ""}`
    : `${input.details.intent === "proforma" ? "Pro forma request" : "Viewing request"} — ${projectName ?? input.projectSlug ?? "project"}`;
  const lines = [
    `${input.kind === "demo" ? "Demo request" : "Project enquiry"} received by AURA`,
    "",
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    input.company ? `Company: ${input.company}` : null,
    projectName || input.projectSlug ? `Project: ${projectName ?? input.projectSlug}` : null,
    ...Object.entries(input.details).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`),
    "",
    input.message ?? "(no message)",
  ].filter((l): l is string => l !== null);
  return { subject, text: lines.join("\n") };
}

/** Send through Resend's HTTP API. Returns false (never throws) when it fails. */
export async function sendWithResend(input: EnquiryInput, projectName: string | null, fetcher: typeof fetch = fetch): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, to = process.env.AURA_ENQUIRY_TO;
  if (!key || !to) return false;
  const { subject, text: body } = enquiryEmail(input, projectName);
  try {
    const res = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.AURA_ENQUIRY_FROM ?? "AURA <onboarding@resend.dev>",
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        reply_to: input.email,
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn(`[enquiries] Resend returned ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res.ok;
  } catch (error) {
    console.warn(`[enquiries] Resend request failed: ${(error as Error).message}`);
    return false;
  }
}

export const emailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.AURA_ENQUIRY_TO;
