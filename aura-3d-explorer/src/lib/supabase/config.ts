/**
 * Supabase settings. Everything persistent (accounts, customer projects,
 * scenarios, share links, enquiries, uploads) needs these; without them the
 * site still runs its public sample portfolio and says plainly that accounts
 * are not connected. Setup: docs/SUPABASE-SETUP.md.
 *
 *   NEXT_PUBLIC_SUPABASE_URL           https://<project>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY      the public "anon" / publishable key
 *   SUPABASE_SERVICE_ROLE_KEY          server only: enquiries, share pages, exports
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** True when sign-in and per-user data can work. */
export const supabaseConfigured = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

/** The Supabase origin, for the Content-Security-Policy (connect / img). */
export function supabaseOrigin(): string | null {
  try {
    return SUPABASE_URL ? new URL(SUPABASE_URL).origin : null;
  } catch {
    return null;
  }
}
