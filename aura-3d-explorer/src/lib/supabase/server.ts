import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config";

/**
 * Supabase as the signed-in visitor (row-level security applies), for Server
 * Components, Route Handlers and Server Functions. Returns null when Supabase
 * is not configured.
 */
export async function supabaseServer() {
  if (!supabaseConfigured()) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components cannot set cookies; the proxy refreshes the session instead.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
  });
}

/** The signed-in user and their organization (null when signed out or unconfigured). */
export async function currentMember() {
  const supabase = await supabaseServer();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase.from("memberships").select("org_id, role, organizations(id, name, slug, logo_path, accent_color)").eq("user_id", user.id).maybeSingle();
  const org = (membership?.organizations ?? null) as unknown as { id: string; name: string; slug: string; logo_path: string | null; accent_color: string | null } | null;
  return { supabase, user, role: (membership?.role ?? null) as "owner" | "member" | null, org };
}
