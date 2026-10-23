import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { currentMember } from "@/lib/supabase/server";
import { CITY_PRESETS } from "@/lib/cityPresets";
import { CreateOrganizationForm, CreateProjectForm } from "@/components/account/DashboardForms";

export const metadata: Metadata = { title: "Your projects", robots: { index: false } };

export default async function Dashboard() {
  if (!supabaseConfigured()) redirect("/sign-in");
  const member = await currentMember();
  if (!member) redirect("/sign-in?next=/app");

  if (!member.org) {
    return (
      <div className="shell max-w-xl py-16">
        <h1 className="font-serif text-display-md text-ink">Set up your company</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ash">Projects, share links and exports belong to your company. Only its members can see them.</p>
        <CreateOrganizationForm />
      </div>
    );
  }

  const [{ data: projects }, { data: enquiries }] = await Promise.all([
    member.supabase.from("projects").select("id, name, status, city, updated_at").eq("org_id", member.org.id).order("updated_at", { ascending: false }),
    member.supabase.from("enquiries").select("id, kind, name, email, created_at, details, project_id, delivery").order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <div className="shell py-12 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-plaster pb-6">
        <div>
          <p className="caption">{member.org.name}</p>
          <h1 className="font-serif text-display-md text-ink">Your projects</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/app/settings" className="btn-secondary py-2 text-[13px]">Branding</Link>
          <form action="/auth/sign-out" method="post"><button className="btn-ghost text-[13px]" type="submit">Sign out</button></form>
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-12">
        <section aria-labelledby="projects-heading" className="lg:col-span-8">
          <h2 id="projects-heading" className="sr-only">Projects</h2>
          {projects?.length ? (
            <ul className="divide-y divide-plaster border-y border-plaster">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/projects/${p.id}`} className="group flex items-center justify-between gap-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50">
                    <span>
                      <span className="block font-serif text-2xl text-ink">{p.name}</span>
                      <span className="caption">{[p.city, p.status].filter(Boolean).join(" · ")} · updated {new Date(p.updated_at).toLocaleDateString()}</span>
                    </span>
                    <ArrowUpRight size={18} className="text-ash transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-ash">No projects yet. Create your first one: give it a name, then set its address and massing.</p>
          )}
        </section>
        <aside className="space-y-10 lg:col-span-4">
          <section aria-labelledby="new-heading">
            <h2 id="new-heading" className="font-serif text-2xl text-ink">New project</h2>
            <CreateProjectForm cities={CITY_PRESETS.map((c) => ({ id: c.id, label: c.label }))} />
          </section>
          <section aria-labelledby="enquiries-heading">
            <h2 id="enquiries-heading" className="font-serif text-2xl text-ink">Latest enquiries</h2>
            {enquiries?.length ? (
              <ul className="mt-3 space-y-3">
                {enquiries.map((e) => (
                  <li key={e.id} className="border border-plaster p-3 text-sm">
                    <p className="text-ink">{e.name} · <a className="underline" href={`mailto:${e.email}`}>{e.email}</a></p>
                    <p className="caption">{e.kind === "demo" ? "Demo request" : (e.details as Record<string, string>)?.intent === "proforma" ? "Pro forma request" : "Viewing request"} · {new Date(e.created_at).toLocaleString()}{e.delivery === "email_failed" ? " · email not delivered" : ""}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="caption mt-3">Enquiries from your share links appear here.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
