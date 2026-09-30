"use client";
/**
 * ProjectCard — a render with the project's spec line beneath.
 * Hovering scrubs through the three hero renders: the pointer's horizontal
 * position picks the frame (left / middle / right third), with a segment
 * indicator along the top edge. The extra renders only load after the first
 * hover. Touch and keyboard users see the lead render. If a render is
 * missing, the card falls back to the project's palette so it never breaks.
 */
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import type { Project } from "@/content/projects";
import { projectFloors } from "@/content/projects";
import { fmtNum } from "@/lib/format";
import StatusPill from "./StatusPill";

interface Props {
  project: Project;
  /** Aspect ratio class, e.g. "aspect-[4/5]". */
  aspect?: string;
  /** Eager-load for above-the-fold cards. */
  priority?: boolean;
  sizes?: string;
  /** Larger title for feature slots. */
  feature?: boolean;
}

export default function ProjectCard({ project, aspect = "aspect-[4/3]", priority, sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw", feature }: Props) {
  const images = project.heroImages;
  const [frame, setFrame] = useState(0);
  const [armed, setArmed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || images.length < 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(images.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * images.length)));
    if (!armed) setArmed(true);
    if (i !== frame) setFrame(i);
  };

  const floors = projectFloors(project);
  const stats = [project.city, `${fmtNum(project.gfaSqFt)} sf`, `${floors} floors`, project.completion];

  return (
    <Link
      href={`/projects/${project.slug}`}
      className={clsx("group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak focus-visible:ring-offset-4 focus-visible:ring-offset-paper", feature && "lg:flex lg:h-full lg:flex-col")}
    >
      <div
        className={clsx("relative overflow-hidden bg-stone", aspect)}
        onPointerMove={onMove}
        onPointerLeave={() => setFrame(0)}
        style={broken[0] ? { background: `linear-gradient(160deg, ${project.palette.sky}, ${project.palette.ground})` } : undefined}
      >
        {images.map((img, i) =>
          (i === 0 || armed) && !broken[i] ? (
            <Image
              key={img.src}
              src={img.src}
              alt={i === 0 ? img.alt : ""}
              aria-hidden={i === 0 ? undefined : true}
              fill
              sizes={sizes}
              priority={i === 0 && priority}
              onLoad={i === 0 ? () => setLoaded(true) : undefined}
              onError={() => setBroken((b) => ({ ...b, [i]: true }))}
              className={clsx(
                "object-cover transition-[opacity,transform] duration-700 ease-calm",
                i === 0 && !loaded ? "scale-[1.02] opacity-0" : "",
                i === frame ? "opacity-100" : "opacity-0",
                "group-hover:scale-[1.025]"
              )}
            />
          ) : null
        )}

        {broken[0] && (
          <span className="absolute inset-0 flex items-end p-5 font-serif text-3xl text-paper/90" aria-hidden>
            {project.name}
          </span>
        )}

        {/* Frame indicator — appears on hover */}
        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex gap-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden>
            {images.map((img, i) => (
              <span key={img.src} className="h-0.5 flex-1 bg-paper/40">
                <span className={clsx("block h-full bg-paper transition-[width] duration-300", i === frame ? "w-full" : "w-0")} />
              </span>
            ))}
          </div>
        )}

        <div className="absolute bottom-3 left-3 flex gap-1.5">
          <StatusPill status={project.status} tone="overlay" />
          {project.placeholder && <span className="bg-ink/70 px-2 py-1 text-[11px] leading-none text-paper backdrop-blur-sm">Sample</span>}
        </div>
        <span className="absolute bottom-3 right-3 flex h-9 w-9 translate-y-2 items-center justify-center bg-paper text-ink opacity-0 transition-[opacity,transform] duration-500 ease-calm group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100" aria-hidden>
          <ArrowUpRight size={18} />
        </span>
      </div>

      <div className="pt-4">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className={clsx("font-serif leading-tight text-ink", feature ? "text-display-sm" : "text-[26px]")}>
            <span className="link-draw group-hover:bg-[length:100%_1px]">{project.name}</span>
          </h3>
          <p className="shrink-0 text-xs text-ash">{project.architect}</p>
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] tabular-nums text-ash">
          {stats.map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              {i > 0 && <span className="h-3 w-px bg-plaster" aria-hidden />}
              {s}
            </li>
          ))}
        </ul>
      </div>
    </Link>
  );
}
