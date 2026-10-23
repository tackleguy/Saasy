/**
 * Resolving a share link on the server. The token is checked by the database
 * (aura.resolve_share: hash, expiry, revocation, password) on every request.
 * Private files (images, the customer's model) are then signed with the
 * service role for one hour; without that key the page still works but shows
 * no uploaded images or model, and says so.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { projectFromDocument } from "@/lib/data/projects";
import { withSignedImages } from "@/lib/data/images";
import { isProjectLocation, validateMapSnapshot, type MapSnapshot, type ProjectLocation } from "@/lib/geographicContext";
import { validModelSettings, type StoredModelSettings } from "@/lib/storedModel";
import type { Project } from "@/content/projects";

export interface ResolvedShare {
  projectId: string;
  project: Project;
  financials: boolean;
  location: ProjectLocation | null;
  snapshot: MapSnapshot | null;
  model: { url: string; settings: StoredModelSettings } | null;
  filesAvailable: boolean;
  branding: { name: string; slug: string; logoUrl: string | null; accent: string | null };
}

export type ShareResult = { kind: "ok"; share: ResolvedShare } | { kind: "password"; wrong: boolean } | { kind: "missing" } | { kind: "unconfigured" };

export const shareCookie = (token: string) => `aura_share_${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
export const validShareToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

export async function resolveShare(token: string, password: string | null): Promise<ShareResult> {
  if (!supabaseConfigured()) return { kind: "unconfigured" };
  if (!validShareToken(token)) return { kind: "missing" };
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.rpc("resolve_share", { token, password });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return { kind: "missing" };
  if (row.needs_password) return { kind: "password", wrong: !!password };
  const document = row.project as Record<string, unknown>;
  let project = projectFromDocument(document, "shared");
  if (!project) return { kind: "missing" };
  const admin = supabaseAdmin();
  let model: ResolvedShare["model"] = null;
  if (admin) {
    project = await withSignedImages(admin, project);
    const stored = document.model as { path?: unknown; settings?: unknown } | undefined;
    if (row.model_path && stored && validModelSettings(stored.settings)) {
      const { data: signed } = await admin.storage.from("project-models").createSignedUrl(row.model_path, 3600);
      if (signed?.signedUrl) model = { url: signed.signedUrl, settings: stored.settings };
    }
  } else {
    project = { ...project, heroImages: project.heroImages.filter((i) => !i.src.startsWith("storage:")) };
  }
  return {
    kind: "ok",
    share: {
      projectId: row.project_id,
      project,
      financials: !!row.share_financials,
      location: isProjectLocation(document.location) ? document.location : null,
      snapshot: row.site_snapshot ? validateMapSnapshot(row.site_snapshot) : null,
      model,
      filesAvailable: !!admin,
      branding: {
        name: row.org_name,
        slug: row.org_slug,
        logoUrl: row.org_logo ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${row.org_logo}` : null,
        accent: row.org_accent,
      },
    },
  };
}
