"use client";
/**
 * HeroExplorer — the landing page's full-bleed live 3D viewport of the
 * flagship project, with the archviz-style caption bar beneath it.
 */
import Link from "next/link";
import type { Project } from "@/content/projects";
import { projectSite } from "@/content/projects";
import { useExplorer } from "@/hooks/useExplorer";
import ExplorerViewport from "@/components/explorer/ExplorerViewport";

export default function HeroExplorer({ project }: { project: Project }) {
  const x = useExplorer(projectSite(project), { city: project.backdrop });
  return (
    <section aria-label={`${project.name} — live 3D`}>
      <ExplorerViewport explorer={x} variant="hero" className="h-[60vh] min-h-[380px] w-full sm:h-[78vh]" />
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <p className="text-base font-medium text-ink">{project.name} — AURA Development</p>
          <p className="caption">
            {project.architect} · {project.city} · live 3D, drag to orbit
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/tour" className="btn-secondary py-2 text-xs">
            Play live reel
          </Link>
          <Link href={`/projects/${project.slug}`} className="btn-secondary py-2 text-xs">
            View project
          </Link>
          <Link href="/studio" className="btn-primary py-2 text-xs">
            Open in Studio
          </Link>
        </div>
      </div>
    </section>
  );
}
