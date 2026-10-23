/**
 * Organization-branded project page: /o/<org slug>/projects/<project id>.
 * Members of that organization see it directly (a preview of what buyers see);
 * anyone else needs the project's share-link token as ?t=<token>, checked on
 * every request exactly like /s/<token>. A custom domain can later be mapped
 * on Vercel (README "Custom domains").
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import ShareView from "@/components/share/ShareView";
import { currentMember } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { storedProjectFromRow } from "@/lib/data/projects";
import { withSignedImages } from "@/lib/data/images";
import { resolveShare, shareCookie, type ResolvedShare } from "@/lib/share";
import { validModelSettings } from "@/lib/storedModel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

async function memberView(slug: string, id: string): Promise<ResolvedShare | null> {
  const member = await currentMember();
  if (!member?.org || member.org.slug !== slug || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: row } = await member.supabase.from("projects").select("id, org_id, slug, is_public, data, model_path, site_snapshot, updated_at").eq("id", id).eq("org_id", member.org.id).maybeSingle();
  const stored = row ? storedProjectFromRow(row) : null;
  if (!stored) return null;
  const raw = (row!.data as { model?: { settings?: unknown } }).model;
  let model: ResolvedShare["model"] = null;
  if (stored.modelPath && raw && validModelSettings(raw.settings)) {
    const { data } = await member.supabase.storage.from("project-models").createSignedUrl(stored.modelPath, 3600);
    if (data?.signedUrl) model = { url: data.signedUrl, settings: raw.settings };
  }
  return {
    projectId: stored.id, project: await withSignedImages(member.supabase, stored.project), financials: true,
    location: stored.location, snapshot: stored.siteSnapshot, model, filesAvailable: true,
    branding: { name: member.org.name, slug: member.org.slug, logoUrl: member.org.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${member.org.logo_path}` : null, accent: member.org.accent_color },
  };
}

export default async function BrandedProjectPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug, id } = await params;
  const { t } = await searchParams;
  let share = await memberView(slug, id);
  let exportTo: { endpoint: string; body: Record<string, unknown> } | null = share ? { endpoint: `/api/projects/${id}/export`, body: {} } : null;
  if (!share && t) {
    const result = await resolveShare(t, (await cookies()).get(shareCookie(t))?.value ?? null);
    if (result.kind === "ok" && result.share.projectId === id && result.share.branding.slug === slug) {
      share = result.share;
      exportTo = share.financials ? { endpoint: "/api/share/export", body: { token: t } } : null;
    }
  }
  if (!share) notFound();
  return (
    <>
      <ShareView share={share} exportTo={exportTo} />
      <footer className="border-t border-plaster py-8">
        <div className="shell flex flex-wrap items-center justify-between gap-3 text-[13px] text-ash">
          <span>© {share.branding.name}. Map data © OpenStreetMap contributors · Overture Maps.</span>
          <Link href="/" className="underline underline-offset-4">Powered by AURA</Link>
        </div>
      </footer>
    </>
  );
}
