"use client";
import { useEffect, useMemo, useState } from "react";
import type { Object3D } from "three";
import { projectSite, type Project } from "@/content/projects";
import { useExplorer } from "@/hooks/useExplorer";
import { useYieldCalculator } from "@/hooks/useYieldCalculator";
import ExplorerViewport from "@/components/explorer/ExplorerViewport";
import { rebuildStoredModel, type StoredModelSettings } from "@/lib/storedModel";
import type { MapSnapshot, ProjectLocation } from "@/lib/geographicContext";

/** Boardroom view of a customer project: opens straight into presentation mode. */
export default function PresentProject({ project, location, snapshot, model }: { project: Project; location: ProjectLocation | null; snapshot: MapSnapshot | null; model: { url: string; settings: StoredModelSettings } | null }) {
  const site = useMemo(() => projectSite(project), [project]);
  const yieldCalc = useYieldCalculator(site, project.finance);
  const override = useMemo(() => ({ location, snapshot }), [location, snapshot]);
  const x = useExplorer(site, { city: project.backdrop, projectSlug: project.slug, site: override });
  const [object, setObject] = useState<Object3D | null>(null);
  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    void fetch(model.url).then((r) => r.blob()).then((b) => rebuildStoredModel(new File([b], model.settings.fileName), model.settings)).then((o) => { if (!cancelled) setObject(o); }).catch(() => {});
    return () => { cancelled = true; };
  }, [model]);
  const { setImportedModel } = x;
  useEffect(() => { if (object) setImportedModel(object); }, [object, setImportedModel]);
  return <ExplorerViewport explorer={x} metricsById={yieldCalc.metricsById} presentOnOpen className="h-[80dvh]" />;
}
