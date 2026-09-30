/**
 * ProjectGrid — an even editorial grid (3 / 2 / 1 columns).
 * `layout="feature"` gives the first project a double-width slot so a short
 * selection (the landing page) reads as a composed spread, not a catalogue.
 */
import clsx from "clsx";
import type { Project } from "@/content/projects";
import ProjectCard from "./ProjectCard";

interface Props {
  projects: Project[];
  priorityCount?: number;
  layout?: "even" | "feature";
}

export default function ProjectGrid({ projects, priorityCount = 3, layout = "even" }: Props) {
  return (
    <ul className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8">
      {projects.map((p, i) => {
        const feature = layout === "feature" && i === 0;
        return (
          <li key={p.slug} className={clsx(feature && "sm:col-span-2 lg:row-span-2")}>
            <ProjectCard
              project={p}
              priority={i < priorityCount}
              feature={feature}
              aspect={feature ? "aspect-[4/3] lg:aspect-auto lg:min-h-[420px] lg:flex-1" : "aspect-[4/3]"}
              sizes={feature ? "(min-width: 1024px) 66vw, 100vw" : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}
