"use client";
/**
 * HeroExplorer — the landing page's full-bleed live 3D viewport of the
 * flagship project, with the archviz-style caption bar beneath it.
 */
import Link from "next/link";
import type { Project } from "@/content/projects";
import { projectSite } from "@/content/projects";
import { useExplorer } from "@/hooks/useExplorer";
import { useRegisterExplorer } from "@/components/assistant/AssistantBridge";
import ExplorerViewport from "@/components/explorer/ExplorerViewport";

export default function HeroExplorer({ project }: { project: Project }) {
  const x = useExplorer(projectSite(project), { city: project.backdrop, projectSlug: project.slug });
  useRegisterExplorer(x, { project }); // lets the AURA assistant see + drive this explorer
  return (
    <section aria-label={`${project.name} — live 3D`}>
      <ExplorerViewport explorer={x} variant="hero" className="h-[64svh] min-h-[430px] w-full sm:h-[calc(100svh-18rem)] sm:min-h-[540px] sm:max-h-[900px]" />
      {/* Caption bar — archviz plate credit */}
      <div className="shell grid gap-4 border-b border-plaster py-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-oak" aria-hidden />
            Explore the live model. Drag to orbit or choose a viewpoint.
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ash">
            <Link href={`/projects/${project.slug}`} className="link-draw text-ink">
              {project.name}
            </Link>{" "}
            · {project.city} · Illustrative project
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.slug}`} className="btn-primary">
            View project
          </Link>
          <Link href="/studio" className="btn-secondary">
            Open in Studio
          </Link>
        </div>
      </div>
    </section>
  );
}
