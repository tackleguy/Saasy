import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentMember } from "@/lib/supabase/server";
import { storedProjectFromRow } from "@/lib/data/projects";
import { parseStorageRef } from "@/lib/data/images";
import { validModelSettings } from "@/lib/storedModel";
import ProjectEditor from "@/components/account/editor/ProjectEditor";
import { listShareLinks } from "./actions";

export const metadata: Metadata = { title: "Edit project", robots: { index: false } };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await currentMember();
  if (!member) redirect(`/sign-in?next=/app/projects/${id}`);
  if (!member.org) redirect("/app");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Row-level security: only a project of the member's own organization is returned.
  const { data: row } = await member.supabase.from("projects").select("id, org_id, slug, is_public, data, model_path, site_snapshot, updated_at").eq("id", id).eq("org_id", member.org.id).maybeSingle();
  const stored = row ? storedProjectFromRow(row) : null;
  if (!stored) notFound();

  const imageUrls: Record<string, string> = {};
  for (const image of stored.project.heroImages) {
    const ref = parseStorageRef(image.src);
    if (!ref) continue;
    const { data } = await member.supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 3600);
    if (data?.signedUrl) imageUrls[image.src] = data.signedUrl;
  }
  const rawModel = (row!.data as { model?: { path?: unknown; settings?: unknown } }).model;
  const model = rawModel && typeof rawModel.path === "string" && validModelSettings(rawModel.settings) ? { path: rawModel.path, settings: rawModel.settings } : null;
  const modelUrl = model ? (await member.supabase.storage.from("project-models").createSignedUrl(model.path, 3600)).data?.signedUrl ?? null : null;

  return (
    <ProjectEditor initial={{
      id: stored.id, orgId: member.org.id, userId: member.user.id, project: stored.project,
      location: stored.location, snapshot: stored.siteSnapshot, model, modelUrl, imageUrls,
      links: await listShareLinks(stored.id), updatedAt: stored.updatedAt,
    }} />
  );
}
