import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "";

/**
 * Service-role Supabase client: bypasses row-level security. Server only (the
 * key is not a NEXT_PUBLIC_ variable, so it is never bundled for browsers), and
 * only for work no visitor session can do: storing an enquiry, resolving a
 * public share link's images, generating signed download URLs for exports.
 * Returns null when the key is not configured.
 */
export function supabaseAdmin() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
