"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config";

/** Supabase in the browser, as the signed-in visitor (null when not configured). */
export function supabaseBrowser() {
  return supabaseConfigured() ? createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
}
