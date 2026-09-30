/**
 * ProjectGrid — 3-column masonry (2 on tablet, 1 on phone) with 12px gutters.
 * CSS columns give the masonry flow; varying aspect ratios give it rhythm.
 */
import type { Project } from "@/content/projects";
import ProjectCard from "./ProjectCard";

const RHYTHM = ["aspect-[4/5]", "aspect-[16/10]", "aspect-square", "aspect-[16/11]", "aspect-[4/5]", "aspect-[16/10]"];

export default function ProjectGrid({ projects, priorityCount = 3 }: { projects: Project[]; priorityCount?: number }) {
  return (
    <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 [&>*]:mb-6">
      {projects.map((p, i) => (
        <ProjectCard key={p.slug} project={p} aspect={RHYTHM[i % RHYTHM.length]} priority={i < priorityCount} />
      ))}
    </div>
  );
}
