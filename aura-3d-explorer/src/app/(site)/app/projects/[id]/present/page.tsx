import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentMember } from "@/lib/supabase/server";
import { storedProjectFromRow } from "@/lib/data/projects";
import { validModelSettings } from "@/lib/storedModel";
import PresentProject from "@/components/account/PresentProject";

export const metadata: Metadata = { title: "Present", robots: { index: false } };

export default async function PresentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await currentMember();
  if (!member?.org) redirect(`/sign-in?next=/app/projects/${id}/present`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: row } = await member.supabase.from("projects").select("id, org_id, slug, is_public, data, model_path, site_snapshot, updated_at").eq("id", id).eq("org_id", member.org.id).maybeSingle();
  const stored = row ? storedProjectFromRow(row) : null;
  if (!stored) notFound();
  const raw = (row!.data as { model?: { path?: unknown; settings?: unknown } }).model;
  let model = null;
  if (raw && typeof raw.path === "string" && validModelSettings(raw.settings)) {
    const { data } = await member.supabase.storage.from("project-models").createSignedUrl(raw.path, 3600);
    if (data?.signedUrl) model = { url: data.signedUrl, settings: raw.settings };
  }
  return (
    <div className="shell py-6">
      <Link href={`/app/projects/${id}`} className="caption underline underline-offset-4">Back to the editor</Link>
      <h1 className="sr-only">Present {stored.project.name}</h1>
      <div className="mt-4"><PresentProject project={stored.project} location={stored.location} snapshot={stored.siteSnapshot} model={model} /></div>
    </div>
  );
}
