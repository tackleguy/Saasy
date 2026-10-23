/**
 * The public portfolio: sample projects marked `is_public` in Supabase, read
 * with the anonymous key (row-level security allows only public rows). With no
 * database configured, or if it cannot be reached, the bundled samples (the
 * same content as the seed migration) are used and the failure is logged.
 */
import { createClient } from "@supabase/supabase-js";
import type { Project } from "@/content/projects";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/config";
import { SAMPLE_PROJECTS, storedProjectFromRow } from "./projects";

function anon() {
  return supabaseConfigured() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

/** Same order as the bundled content, so the landing page and portfolio grid stay stable. */
const order = (slug: string) => {
  const i = SAMPLE_PROJECTS.findIndex((p) => p.slug === slug);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};

export async function listPortfolio(): Promise<Project[]> {
  const client = anon();
  if (!client) return SAMPLE_PROJECTS;
  const { data, error } = await client.from("projects").select("id, org_id, slug, is_public, data").eq("is_public", true);
  if (error || !data?.length) {
    if (error) console.warn(`[portfolio] falling back to bundled samples: ${error.message}`);
    return SAMPLE_PROJECTS;
  }
  return data.map((row) => storedProjectFromRow(row)?.project).filter((p): p is Project => !!p).sort((a, b) => order(a.slug) - order(b.slug));
}

export async function getPortfolioProject(slug: string): Promise<Project | undefined> {
  const client = anon();
  if (!client) return SAMPLE_PROJECTS.find((p) => p.slug === slug);
  const { data, error } = await client.from("projects").select("id, org_id, slug, is_public, data").eq("is_public", true).eq("slug", slug).maybeSingle();
  if (error) console.warn(`[portfolio] falling back to bundled samples: ${error.message}`);
  if (!data) return error ? SAMPLE_PROJECTS.find((p) => p.slug === slug) : undefined;
  return storedProjectFromRow(data)?.project;
}
