"use client";
/**
 * Customer project editor: details, real address and surroundings, massing,
 * own model and images, pro forma, scenarios, exports and share links, next
 * to the live 3D explorer. Edits stay local until "Save project", which writes
 * one update to the project row (row-level security scopes it to the
 * member's organization).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Object3D } from "three";
import { projectSite, type Project } from "@/content/projects";
import { useExplorer } from "@/hooks/useExplorer";
import { useYieldCalculator } from "@/hooks/useYieldCalculator";
import { useRegisterExplorer } from "@/components/assistant/AssistantBridge";
import ExplorerViewport from "@/components/explorer/ExplorerViewport";
import FinancialSidebar from "@/components/ui/FinancialSidebar";
import ExportButtons from "@/components/ui/ExportButtons";
import ScenarioDrawer from "@/components/studio/ScenarioDrawer";
import { supabaseBrowser } from "@/lib/supabase/client";
import { databaseScenarioStore } from "@/lib/scenarioStore";
import { proforma } from "@/lib/finance";
import { CITY_PRESETS, type CityId } from "@/lib/cityPresets";
import { documentFromProject } from "@/lib/data/projects";
import { rebuildStoredModel, validModelSettings } from "@/lib/storedModel";
import type { MapSnapshot, ProjectLocation } from "@/lib/geographicContext";
import type { ProjectMassing } from "@/lib/tower";
import type { ProjectStatus } from "@/types";
import MassingPanel from "./MassingPanel";
import SitePanel from "./SitePanel";
import MediaPanel, { type StoredModelRef } from "./MediaPanel";
import SharePanel from "./SharePanel";
import RenderGallery, { type GalleryItem } from "./RenderGallery";
import type { ShareLinkSummary } from "@/app/(site)/app/projects/[id]/actions";

const STATUSES: ProjectStatus[] = ["Concept", "Approved", "Under Construction", "Selling"];

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-plaster py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between font-serif text-2xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50">
        {title}<span aria-hidden className="text-base text-ash transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export interface EditorInitial {
  id: string;
  orgId: string;
  userId: string;
  project: Project;
  location: ProjectLocation | null;
  snapshot: MapSnapshot | null;
  model: StoredModelRef | null;
  modelUrl: string | null;
  /** Signed URLs for stored images, keyed by their storage reference. */
  imageUrls: Record<string, string>;
  links: ShareLinkSummary[];
  gallery: GalleryItem[];
  updatedAt: string | null;
}

function Preview({ projectId, project, location, snapshot, onLocation, modelObject, financeKey, onSaveFigures, store, gallery }: {
  gallery: { orgId: string; userId: string; items: GalleryItem[]; onUse: (src: string, url: string) => void };
  projectId: string; project: Project; location: ProjectLocation | null; snapshot: MapSnapshot | null; onLocation: (l: ProjectLocation) => void;
  modelObject: Object3D | null; financeKey: string; onSaveFigures: (finance: Project["finance"]) => void; store: Parameters<typeof ScenarioDrawer>[0]["store"];
}) {
  const site = useMemo(() => projectSite(project), [project]);
  const yieldCalc = useYieldCalculator(site, project.finance);
  const siteOverride = useMemo(() => ({ location, snapshot, onLocationChange: onLocation }), [location, snapshot, onLocation]);
  const x = useExplorer(site, { city: project.backdrop, projectSlug: project.slug, site: siteOverride });
  useRegisterExplorer(x, { project, yieldCalc });
  const { setImportedModel } = x;
  useEffect(() => { setImportedModel(modelObject ? modelObject.clone(true) : null); }, [modelObject, setImportedModel]);
  const building = x.building;
  return (
    <>
      <ExplorerViewport explorer={x} metricsById={yieldCalc.metricsById} className="h-[56dvh] min-h-[380px]" />
      <div className="mt-6"><RenderGallery orgId={gallery.orgId} projectId={projectId} userId={gallery.userId} items={gallery.items} capture={x.captureStill} onUse={gallery.onUse} /></div>
      <div key={financeKey} className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ScenarioDrawer projectSlug={project.slug} current={yieldCalc.inputsById} onLoad={yieldCalc.load} explorer={x} store={store} />
          <ExportButtons endpoint={`/api/projects/${projectId}/export`} body={{ inputsById: yieldCalc.inputsById }} />
          <button type="button" className="btn-secondary py-2 text-xs" onClick={() => onSaveFigures(yieldCalc.inputsById)}>Use these figures as project defaults</button>
        </div>
        <FinancialSidebar buildings={site} siteName={project.name} building={building} inputs={yieldCalc.inputsById[building.id]} metrics={yieldCalc.metricsById[building.id]}
          metricsById={yieldCalc.metricsById} site={yieldCalc.site} onBuildingChange={x.selectBuilding}
          setInput={(key, value) => yieldCalc.setInput(building.id, key, value)} onReset={() => yieldCalc.reset(building.id)} onFocusZone={x.focusZone} />
      </div>
    </>
  );
}

export default function ProjectEditor({ initial }: { initial: EditorInitial }) {
  const [project, setProject] = useState(initial.project);
  const [location, setLocation] = useState(initial.location);
  const [snapshot, setSnapshot] = useState(initial.snapshot);
  const [model, setModel] = useState(initial.model);
  const [modelObject, setModelObject] = useState<Object3D | null>(null);
  const [imageUrls, setImageUrls] = useState(initial.imageUrls);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const client = useMemo(() => supabaseBrowser(), []);
  const store = useMemo(() => (client ? databaseScenarioStore(client, { projectId: initial.id, orgId: initial.orgId, projectSlug: project.slug, userId: initial.userId }) : undefined), [client, initial.id, initial.orgId, initial.userId, project.slug]);

  // Rebuild the stored model once (same review and normalisation as an upload).
  useEffect(() => {
    if (!initial.modelUrl || !initial.model || !validModelSettings(initial.model.settings)) return;
    let cancelled = false;
    setStatus("Loading your model…");
    void (async () => {
      try {
        const res = await fetch(initial.modelUrl!);
        if (!res.ok) throw new Error();
        const file = new File([await res.blob()], initial.model!.settings.fileName);
        const object = await rebuildStoredModel(file, initial.model!.settings);
        if (!cancelled) { setModelObject(object); setStatus(""); }
      } catch { if (!cancelled) setStatus("Your saved model could not be loaded; the generated massing is shown. Upload it again from Model & images."); }
    })();
    return () => { cancelled = true; };
  }, [initial.modelUrl, initial.model]);

  const edit = useCallback((patch: Partial<Project>) => { setProject((p) => ({ ...p, ...patch })); setDirty(true); setStatus(""); }, []);
  const onLocation = useCallback((l: ProjectLocation) => { setLocation(l); setSnapshot(null); setDirty(true); }, []);
  const onMassing = (next: ProjectMassing[], added?: ProjectMassing, removed?: string) => {
    const finance = { ...project.finance };
    if (added) finance[added.id] = proforma(120_000, 1_250, 600);
    if (removed) delete finance[removed];
    edit({ massing: next, finance });
  };
  // The preview resets its figures when the set of buildings or the saved defaults change.
  const financeKey = `${project.massing.map((m) => m.id).join(",")}:${JSON.stringify(project.finance).length}`;
  const displayProject = useMemo(() => ({ ...project, heroImages: project.heroImages.map((i) => ({ ...i, src: imageUrls[i.src] ?? i.src })) }), [project, imageUrls]);

  const save = async () => {
    if (!client) return;
    setSaving(true); setStatus("");
    const data = { ...documentFromProject(project, location), ...(model ? { model } : {}) };
    const { error } = await client.from("projects").update({ name: project.name, status: project.status, city: project.city, data, model_path: model?.path ?? null }).eq("id", initial.id);
    setSaving(false);
    if (error) setStatus("Not saved: check your connection and try again. Your edits are still here.");
    else { setDirty(false); setStatus(`Saved ${new Date().toLocaleTimeString()}.`); }
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div className="shell py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-plaster pb-5">
        <div>
          <Link href="/app" className="caption underline underline-offset-4">All projects</Link>
          <h1 className="mt-1 font-serif text-display-sm text-ink">{project.name || "Untitled project"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span role="status" className="caption">{saving ? "Saving…" : status || (dirty ? "Unsaved changes" : "All changes saved")}</span>
          <Link href={`/app/projects/${initial.id}/present`} className="btn-secondary py-2 text-xs">Present</Link>
          <button type="button" className="btn-primary py-2 text-xs" onClick={() => void save()} disabled={saving || !dirty} aria-busy={saving}>Save project</button>
        </div>
      </header>
      <div className="mt-6 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Preview projectId={initial.id} gallery={{ orgId: initial.orgId, userId: initial.userId, items: initial.gallery, onUse: (src, url) => {
              if (project.heroImages.length >= 3) { setStatus("Projects show up to three images. Remove one under Model and images first."); return; }
              setImageUrls((u) => ({ ...u, [src]: url })); edit({ heroImages: [...project.heroImages, { src, alt: `${project.name} — view from the live model` }] });
            } }} project={displayProject} location={location} snapshot={snapshot} onLocation={onLocation} modelObject={modelObject} financeKey={financeKey} store={store}
            onSaveFigures={(finance) => { edit({ finance }); setStatus("Figures set as defaults. Save the project to keep them."); }} />
        </div>
        <div className="lg:col-span-5">
          <Section title="Details" open>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2"><span className="caption">Project name</span><input value={project.name} maxLength={160} onChange={(e) => edit({ name: e.target.value })} className="field mt-1" /></label>
              <label className="block"><span className="caption">Client / developer</span><input value={project.client} maxLength={120} onChange={(e) => edit({ client: e.target.value })} className="field mt-1" /></label>
              <label className="block"><span className="caption">Architect</span><input value={project.architect} maxLength={120} onChange={(e) => edit({ architect: e.target.value })} className="field mt-1" /></label>
              <label className="block"><span className="caption">City</span><input value={project.city} maxLength={120} onChange={(e) => edit({ city: e.target.value })} className="field mt-1" /></label>
              <label className="block"><span className="caption">Status</span>
                <select value={project.status} onChange={(e) => edit({ status: e.target.value as ProjectStatus })} className="field mt-1">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
              <label className="block"><span className="caption">Completion</span><input value={project.completion} maxLength={40} onChange={(e) => edit({ completion: e.target.value })} className="field mt-1" placeholder="e.g. Q2 2029" /></label>
              <label className="block"><span className="caption">City style (3D context)</span>
                <select value={project.backdrop} onChange={(e) => edit({ backdrop: e.target.value as CityId })} className="field mt-1">{CITY_PRESETS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              </label>
              <label className="block sm:col-span-2"><span className="caption">Summary</span><textarea rows={3} maxLength={600} value={project.summary} onChange={(e) => edit({ summary: e.target.value })} className="field mt-1" /></label>
              <label className="block"><span className="caption">Site area (sq ft)</span><input type="number" min={0} value={project.siteAreaSqFt} onChange={(e) => edit({ siteAreaSqFt: Math.max(0, Number(e.target.value) || 0) })} className="field mt-1" /></label>
              <label className="block"><span className="caption">Gross floor area (sq ft)</span><input type="number" min={0} value={project.gfaSqFt} onChange={(e) => edit({ gfaSqFt: Math.max(0, Number(e.target.value) || 0) })} className="field mt-1" /></label>
            </div>
          </Section>
          <Section title="Site and address">
            <SitePanel projectId={initial.id} location={location} snapshot={snapshot} saved={!dirty} onLocation={onLocation} onSnapshot={(s) => { setSnapshot(s); setStatus("Surroundings saved with the project."); }} />
          </Section>
          <Section title="Massing">
            <MassingPanel massing={project.massing} onChange={onMassing} />
          </Section>
          <Section title="Model and images">
            <MediaPanel orgId={initial.orgId} projectId={initial.id} building={projectSite(project)[0]} inputs={project.finance[project.massing[0].id]} location={location}
              model={model} images={project.heroImages} onPlaced={setModelObject}
              onModel={(m) => { setModel(m); setDirty(true); }}
              onImages={(images, previews) => { setImageUrls((u) => ({ ...u, ...previews })); edit({ heroImages: images }); }} />
          </Section>
          <Section title="Share">
            <SharePanel projectId={initial.id} links={initial.links} saved={!dirty} />
          </Section>
        </div>
      </div>
    </div>
  );
}
