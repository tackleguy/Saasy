"use client";
/**
 * HeroCarousel — full-bleed project renders with the title set on the plate.
 * Slow cross-fade (1.03 → 1 settle), segment indicators that double as
 * buttons, arrow buttons, ← / → keys when focused and swipe on touch.
 * No autoplay (calm, and kinder to screen readers). An ink scrim under the
 * title keeps it AA-legible on any render.
 */
import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import type { Project } from "@/content/projects";
import StatusPill from "@/components/portfolio/StatusPill";

export default function HeroCarousel({ project }: { project: Project }) {
  const images = project.heroImages;
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const go = useCallback((d: number) => setIndex((i) => (i + d + images.length) % images.length), [images.length]);
  const img = images[index];

  return (
    <section aria-roledescription="carousel" aria-label={`${project.name} renders`} className="relative">
      <div
        className="relative h-[72vh] min-h-[440px] w-full overflow-hidden bg-stone sm:h-[82vh] sm:max-h-[960px]"
        tabIndex={0}
        style={{ background: `linear-gradient(160deg, ${project.palette.sky}, ${project.palette.ground})` }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(-1);
          if (e.key === "ArrowRight") go(1);
        }}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={img.src}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${images.length}`}
          >
            <Image src={img.src} alt={img.alt} fill priority={index === 0} sizes="100vw" className="object-cover" />
          </motion.div>
        </AnimatePresence>

        {/* Scrim for the title */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-ink/85 via-ink/35 to-transparent" aria-hidden />

        <div className="absolute inset-x-0 bottom-0">
          <div className="shell grid gap-6 pb-8 sm:pb-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <StatusPill status={project.status} tone="overlay" />
                {project.placeholder && <span className="bg-ink/60 px-2 py-1 text-[11px] leading-none text-paper">Sample project</span>}
              </div>
              <h1 className="font-serif text-display-xl text-paper">{project.name}</h1>
              <p className="mt-3 text-[15px] text-paper/85">
                {project.city} · {project.client} / {project.architect}
              </p>
            </div>

            {images.length > 1 && (
              <div className="flex items-center gap-4 lg:col-span-4 lg:justify-end">
                <div className="flex flex-1 gap-1.5 lg:max-w-[180px]" role="group" aria-label="Choose render">
                  {images.map((im, i) => (
                    <button
                      key={im.src}
                      onClick={() => setIndex(i)}
                      aria-label={`Show render ${i + 1}: ${im.alt}`}
                      aria-current={i === index ? "true" : undefined}
                      className="group flex h-6 flex-1 items-center focus-visible:outline-paper"
                    >
                      <span className={clsx("h-0.5 w-full transition-colors duration-300", i === index ? "bg-paper" : "bg-paper/35 group-hover:bg-paper/70")} />
                    </button>
                  ))}
                </div>
                <span className="text-[13px] tabular-nums text-paper/85" aria-live="polite">
                  {String(index + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => go(-1)} className="flex h-11 w-11 items-center justify-center border border-paper/40 text-paper transition-colors hover:bg-paper hover:text-ink focus-visible:outline-paper" aria-label="Previous render">
                    <ChevronLeft size={18} aria-hidden />
                  </button>
                  <button onClick={() => go(1)} className="flex h-11 w-11 items-center justify-center border border-paper/40 text-paper transition-colors hover:bg-paper hover:text-ink focus-visible:outline-paper" aria-label="Next render">
                    <ChevronRight size={18} aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
