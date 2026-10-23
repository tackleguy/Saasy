import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";
import BrandingForm from "@/components/account/BrandingForm";

export const metadata: Metadata = { title: "Branding", robots: { index: false } };

export default async function SettingsPage() {
  const member = await currentMember();
  if (!member) redirect("/sign-in?next=/app/settings");
  if (!member.org) redirect("/app");
  const logoUrl = member.org.logo_path ? `${SUPABASE_URL}/storage/v1/object/public/org-logos/${member.org.logo_path}` : null;
  return (
    <div className="shell max-w-2xl py-12">
      <Link href="/app" className="caption underline underline-offset-4">All projects</Link>
      <h1 className="mt-2 font-serif text-display-md text-ink">Branding</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ash">Your logo and accent colour appear on share links, presentation pages and exported pro formas. “Powered by AURA” stays in the footer.</p>
      <BrandingForm orgId={member.org.id} name={member.org.name} slug={member.org.slug} accent={member.org.accent_color} logoUrl={logoUrl} canEdit={member.role === "owner"} />
    </div>
  );
}
