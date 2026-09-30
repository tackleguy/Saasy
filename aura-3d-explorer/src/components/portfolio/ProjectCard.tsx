"use client";
/**
 * ProjectCard — edge-to-edge image with a thin paper caption bar beneath.
 * The image fades in and settles from 1.02 → 1 once loaded; on hover the
 * caption bar lifts slightly. No rounded corners on imagery.
 */
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import type { Project } from "@/content/projects";
import StatusPill from "./StatusPill";

interface Props {
  project: Project;
  /** Aspect ratio class for masonry rhythm, e.g. "aspect-[4/5]". */
  aspect?: string;
  /** Eager-load for above-the-fold cards. */
  priority?: boolean;
  sizes?: string;
}

export default function ProjectCard({ project, aspect = "aspect-[16/10]", priority, sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" }: Props) {
  const [loaded, setLoaded] = useState(false);
  const hero = project.heroImages[0];
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group block break-inside-avoid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      <div className={clsx("relative overflow-hidden bg-stone", aspect)}>
        <Image
          src={hero.src}
          alt={hero.alt}
          fill
          sizes={sizes}
          priority={priority}
          onLoad={() => setLoaded(true)}
          className={clsx(
            "object-cover transition-[opacity,transform] duration-[1200ms] ease-calm group-hover:scale-[1.01]",
            loaded ? "scale-100 opacity-100" : "scale-[1.02] opacity-0"
          )}
        />
      </div>
      <div className="relative bg-paper pb-1 pt-3 transition-transform duration-500 ease-calm group-hover:-translate-y-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-medium text-ink">{project.name}</h3>
            <p className="caption truncate">
              {project.client} / {project.architect}
            </p>
          </div>
          <StatusPill status={project.status} className="shrink-0" />
        </div>
        <p className="caption mt-1">
          {project.city}
          {project.placeholder && <span className="ml-2 text-ash">· Sample project</span>}
        </p>
      </div>
    </Link>
  );
}
