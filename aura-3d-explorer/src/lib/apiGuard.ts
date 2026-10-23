/**
 * Abuse controls for the paid inference routes (/api/assistant, /api/engine).
 *
 * - Same-origin: browsers send `Origin` (and `Sec-Fetch-Site`) on POST; a
 *   request from another site, or a POST with no browser origin at all, is
 *   refused. GET health checks only need the fetch-site check.
 * - Rate limit: a fixed-window counter per client IP, held in memory. On
 *   Vercel each warm function instance keeps its own window, so the effective
 *   ceiling is per instance. That bounds a single abuser's burst; it is not a
 *   global quota (see docs/DECISIONS.md).
 */
import { NextResponse } from "next/server";

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  reset: number;
}

const buckets = new Map<string, Map<string, Bucket>>();
const MAX_TRACKED = 10_000;

export function clientIp(req: Request): string {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "local";
}

/** Returns seconds until the window resets when the caller is over the limit, otherwise null. */
export function takeToken(scope: string, key: string, rule: RateLimit, now = Date.now()): number | null {
  let table = buckets.get(scope);
  if (!table) buckets.set(scope, (table = new Map()));
  let bucket = table.get(key);
  if (!bucket || bucket.reset <= now) {
    if (table.size >= MAX_TRACKED) {
      for (const [k, b] of table) if (b.reset <= now) table.delete(k);
      if (table.size >= MAX_TRACKED) table.clear();
    }
    bucket = { count: 0, reset: now + rule.windowMs };
    table.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count > rule.limit ? Math.max(1, Math.ceil((bucket.reset - now) / 1000)) : null;
}

/** Test helper: forget every counter. */
export function resetRateLimits() {
  buckets.clear();
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/** True when the request comes from this site's own pages. */
export function isSameOrigin(req: Request, { requireOrigin }: { requireOrigin: boolean }): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return !requireOrigin;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const allowed = new Set([host, ...(process.env.AURA_ALLOWED_ORIGINS ?? "").split(",").map((o) => hostOf(o.trim())).filter(Boolean)]);
  const from = hostOf(origin);
  return !!from && allowed.has(from);
}

/**
 * Run both checks. Returns a ready error response to send, or null to continue.
 */
export function guardRequest(req: Request, scope: string, rule: RateLimit, { requireOrigin = true } = {}): Response | null {
  if (!isSameOrigin(req, { requireOrigin })) {
    return NextResponse.json({ error: "This endpoint only accepts requests from the AURA site." }, { status: 403 });
  }
  const wait = takeToken(scope, clientIp(req), rule);
  if (wait !== null) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${wait} seconds.` },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }
  return null;
}
