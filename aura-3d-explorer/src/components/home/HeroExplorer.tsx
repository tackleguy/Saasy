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
  const x = useExplorer(projectSite(project), { city: project.backdrop });
  useRegisterExplorer(x, { project }); // lets the AURA assistant see + drive this explorer
  return (
    <section aria-label={`${project.name} — live 3D`}>
      <ExplorerViewport explorer={x} variant="hero" className="h-[62vh] min-h-[400px] w-full sm:h-[80vh] sm:max-h-[920px]" />
      {/* Caption bar — archviz plate credit */}
      <div className="shell grid gap-4 border-b border-plaster py-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-ink">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-negative" aria-hidden />
            Live 3D, not a render. Drag to orbit, pick an angle or a city.
          </p>
          <p className="mt-1.5 truncate text-[13px] text-ash">
            <Link href={`/projects/${project.slug}`} className="link-draw text-ink">
              {project.name}
            </Link>{" "}
            · {project.architect} · {project.city} · {project.status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.slug}`} className="btn-secondary">
            View project
          </Link>
          <Link href="/studio" className="btn-primary">
            Open in Studio
          </Link>
        </div>
      </div>
    </section>
  );
}
