/**
 * Magic-link landing. Handles both Supabase link styles:
 *   ?code=…                    PKCE (same browser that asked for the link)
 *   ?token_hash=…&type=email   email template variant that works across devices
 * Then redirects to `next` (an /app path only).
 */
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/apiGuard";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const nextParam = url.searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/app") ? nextParam : "/app";
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.redirect(new URL("/sign-in", origin));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };
  return NextResponse.redirect(new URL(error ? `/sign-in?error=link&next=${encodeURIComponent(next)}` : next, origin));
}
