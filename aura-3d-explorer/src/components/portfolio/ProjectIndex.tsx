"use client";
/**
 * ProjectIndex — the full portfolio with a status filter.
 * Filters are derived from the data, so new projects and statuses appear
 * automatically. The count is announced politely when the filter changes.
 */
import { useMemo, useState } from "react";
import clsx from "clsx";
import type { Project } from "@/content/projects";
import type { ProjectStatus } from "@/types";
import ProjectGrid from "./ProjectGrid";

const ORDER: ProjectStatus[] = ["Selling", "Under Construction", "Approved", "Concept"];

export default function ProjectIndex({ projects }: { projects: Project[] }) {
  const [status, setStatus] = useState<ProjectStatus | "All">("All");

  const counts = useMemo(() => {
    const c = new Map<ProjectStatus, number>();
    projects.forEach((p) => c.set(p.status, (c.get(p.status) ?? 0) + 1));
    return c;
  }, [projects]);

  const filters: (ProjectStatus | "All")[] = ["All", ...ORDER.filter((s) => counts.has(s))];
  const shown = status === "All" ? projects : projects.filter((p) => p.status === status);

  return (
    <>
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-plaster pb-4">
        <div role="group" aria-label="Filter by status" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
          {filters.map((f) => {
            const active = f === status;
            const n = f === "All" ? projects.length : counts.get(f) ?? 0;
            return (
              <button
                key={f}
                onClick={() => setStatus(f)}
                aria-pressed={active}
                className={clsx(
                  "flex shrink-0 items-center gap-2 border px-3.5 py-2 text-[13px] transition-colors duration-300",
                  active ? "border-ink bg-ink text-paper" : "border-plaster text-ink hover:border-ink/50"
                )}
              >
                {f}
                <span className={clsx("tabular-nums", active ? "text-paper/70" : "text-ash")}>{n}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[13px] text-ash" aria-live="polite">
          Showing {shown.length} of {projects.length}
        </p>
      </div>
      <ProjectGrid projects={shown} />
    </>
  );
}
