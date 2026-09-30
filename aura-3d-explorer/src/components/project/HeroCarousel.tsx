"use client";
/**
 * HeroCarousel — full-bleed project renders with a paper caption bar.
 * Slow cross-fade (1.02 → 1 settle), arrow buttons, keyboard ← / → when
 * focused, and a counter. No autoplay (calm, and kinder to screen readers).
 */
import { useCallback, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Project } from "@/content/projects";
import StatusPill from "@/components/portfolio/StatusPill";

export default function HeroCarousel({ project }: { project: Project }) {
  const images = project.heroImages;
  const [index, setIndex] = useState(0);
  const go = useCallback((d: number) => setIndex((i) => (i + d + images.length) % images.length), [images.length]);
  const img = images[index];

  return (
    <section aria-roledescription="carousel" aria-label={`${project.name} renders`}>
      <div
        className="relative h-[60vh] min-h-[360px] w-full overflow-hidden bg-stone sm:h-[72vh]"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(-1);
          if (e.key === "ArrowRight") go(1);
        }}
      >
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={img.src}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${images.length}`}
          >
            <Image src={img.src} alt={img.alt} fill priority={index === 0} sizes="100vw" className="object-cover" />
          </motion.div>
        </AnimatePresence>

        {images.length > 1 && (
          <div className="absolute bottom-4 right-4 flex gap-1">
            <button onClick={() => go(-1)} className="btn-secondary bg-paper/90 p-2" aria-label="Previous image">
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button onClick={() => go(1)} className="btn-secondary bg-paper/90 p-2" aria-label="Next image">
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>

      {/* Caption bar */}
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-base font-medium text-ink">{project.name}</h1>
          <p className="caption">
            {project.client} / {project.architect}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="caption">{project.city}</span>
          <StatusPill status={project.status} />
          <span className="caption tabular-nums" aria-live="polite">
            {index + 1} / {images.length}
          </span>
        </div>
      </div>
    </section>
  );
}
