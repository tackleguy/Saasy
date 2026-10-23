"use client";
/**
 * Buyer-facing project view for share links and white-label pages: the
 * organization's logo and accent, the renders, key facts, the live 3D
 * explorer on the real site, availability and enquiry. The development
 * appraisal appears only when the owner shared financials.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Object3D } from "three";
import HeroCarousel from "@/components/project/HeroCarousel";
import KeyFacts from "@/components/project/KeyFacts";
import ProjectWorkspace from "@/components/project/ProjectWorkspace";
import { projectSite } from "@/content/projects";
import { computeYield, DEFAULT_INPUTS } from "@/lib/finance";
import { rebuildStoredModel } from "@/lib/storedModel";
import type { ResolvedShare } from "@/lib/share";

export default function ShareView({ share, exportTo }: { share: ResolvedShare; exportTo: { endpoint: string; body: Record<string, unknown> } | null }) {
  const { project, branding } = share;
  const [model, setModel] = useState<Object3D | null>(null);
  const [modelNote, setModelNote] = useState("");
  useEffect(() => {
    if (!share.model) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(share.model!.url);
        if (!res.ok) throw new Error();
        const object = await rebuildStoredModel(new File([await res.blob()], share.model!.settings.fileName), share.model!.settings);
        if (!cancelled) setModel(object);
      } catch { if (!cancelled) setModelNote("The architect's model could not be loaded, so the massing study is shown."); }
    })();
    return () => { cancelled = true; };
  }, [share.model]);
  const site = useMemo(() => ({ location: share.location, snapshot: share.snapshot }), [share.location, share.snapshot]);
  const units = projectSite(project).reduce((s, b) => s + computeYield(project.finance[b.id] ?? DEFAULT_INPUTS, b.floors).totalUnits, 0);
  const accent = branding.accent ? ({ "--brand": branding.accent } as CSSProperties) : undefined;
  return (
    <div style={accent}>
      <header className="border-b border-plaster bg-paper">
        <div className="shell flex h-16 items-center justify-between gap-4">
          {branding.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={branding.logoUrl} alt={branding.name} className="h-8 w-auto max-w-[180px] object-contain" />
            : <span className="font-serif text-2xl text-ink">{branding.name}</span>}
          <a href="#enquire" className="btn-primary py-2 text-[13px]" style={branding.accent ? { background: branding.accent } : undefined}>Enquire</a>
        </div>
      </header>
      <main id="main">
        {project.heroImages.length > 0 && <HeroCarousel project={project} />}
        <section aria-label="Overview" className="shell grid gap-12 py-14 sm:py-20 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            {/* The carousel carries the page's h1 when there are images. */}
            {project.heroImages.length > 0
              ? <h2 className="font-serif text-display-md text-ink">{project.name}</h2>
              : <h1 className="font-serif text-display-md text-ink">{project.name}</h1>}
            <p className="mt-2 text-[13px] text-ash">{[project.city, project.status, project.completion].filter(Boolean).join(" · ")}</p>
            {project.summary && <p className="mt-6 font-serif text-2xl leading-snug text-ink">{project.summary}</p>}
            {!share.filesAvailable && <p className="caption mt-4">Uploaded images and models are not available on this deployment yet.</p>}
            {modelNote && <p className="caption mt-4">{modelNote}</p>}
          </div>
          <div className="lg:col-span-6 lg:col-start-7"><KeyFacts project={project} units={units} /></div>
        </section>
        <ProjectWorkspace project={project} site={site} model={model} financials={share.financials} exportTo={exportTo} />
      </main>
    </div>
  );
}
