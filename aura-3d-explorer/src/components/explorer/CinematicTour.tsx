"use client";
/**
 * CinematicTour — a self-running, full-screen demo reel of the portfolio.
 * -----------------------------------------------------------------------------
 * Plays a scripted shot list against the live explorer for each project, then
 * cross-fades to the next one:
 *
 *   waterfront → street → podium → aerial → exploded stack → isolated floor →
 *   walk-through (two interior views) → skyline → drone
 *
 * Every shot is a normal explorer action (photo angle, explosion, floor
 * select, walk view), so the reel always shows the real renderer, never a
 * pre-baked video. Letterbox bars, lower-third captions and a shot progress
 * bar give it a film look. Controls: Space pauses, ← / → skip shots, P / N
 * switch projects, Esc leaves; the pointer can also orbit at any time (the
 * next shot re-takes the camera).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import type { Project } from "@/content/projects";
import { projectSite } from "@/content/projects";
import { useExplorer, type ExplorerState } from "@/hooks/useExplorer";
import { viewpointsFor } from "@/lib/viewpoints";
import ExplorerViewport from "./ExplorerViewport";

interface Shot {
  id: string;
  /** Hold time, ms (includes the camera tween). */
  ms: number;
  kicker: string;
  title: (p: Project, x: ExplorerState) => string;
  run: (x: ExplorerState) => void | (() => void);
}

/** A residential floor a few levels into the stack (falls back to mid-tower). */
function showcaseFloor(x: ExplorerState) {
  const b = x.building;
  const resi = b.zones.residential?.floors;
  // Zone floor ranges are 1-based storey numbers; floors[] is 0-based.
  const i = resi && resi[1] >= resi[0] ? Math.min(resi[0] + 1, resi[1] - 1) : Math.floor(b.floors.length * 0.6);
  return b.floors[Math.max(0, Math.min(i, b.floors.length - 1))];
}

const SHOTS: Shot[] = [
  { id: "waterfront", ms: 7000, kicker: "Arrival", title: (p) => `${p.name}, from the water`, run: (x) => x.choosePhotoAngle("waterfront") },
  { id: "street", ms: 6000, kicker: "Street level", title: (p) => `${p.city}: the view from the kerb`, run: (x) => x.choosePhotoAngle("street") },
  { id: "podium", ms: 5500, kicker: "Podium", title: () => "Arcade, lobby and active frontage", run: (x) => x.choosePhotoAngle("podium") },
  { id: "aerial", ms: 6000, kicker: "Massing", title: (p) => `${p.architect} · ${p.status}`, run: (x) => x.choosePhotoAngle("aerial") },
  {
    id: "exploded",
    ms: 7000,
    kicker: "Stacking plan",
    title: (_, x) => `${x.building.floors.length} floors, exploded by programme`,
    run: (x) => {
      x.resetView();
      const t = setTimeout(() => x.setExplosion(1.5), 350);
      return () => clearTimeout(t);
    },
  },
  {
    id: "floor",
    ms: 6000,
    kicker: "Floor plate",
    title: (_, x) => {
      const f = showcaseFloor(x);
      return `Level ${f.index + 1}: furnished, ${f.zone}`;
    },
    run: (x) => x.selectFloor(showcaseFloor(x)),
  },
  {
    id: "walk",
    ms: 11000,
    kicker: "Walk-through",
    title: (_, x) => {
      const v = viewpointsFor(showcaseFloor(x));
      return v.length ? `${v[0].label}, then ${v[v.length - 1].label.toLowerCase()}` : "Interior walk-through";
    },
    run: (x) => {
      // Walking needs an isolated floor; when arriving from another shot, isolate it and let the focus land first.
      const needsFloor = x.selectedIndex === null;
      if (needsFloor) {
        x.setExplosion(Math.max(x.explosion, 1));
        x.selectFloor(showcaseFloor(x));
      }
      const views = viewpointsFor(showcaseFloor(x)).length;
      const t1 = setTimeout(() => x.startWalk(), needsFloor ? 700 : 0);
      const t2 = setTimeout(() => x.goToView(Math.max(0, views - 1)), 5200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    },
  },
  {
    id: "skyline",
    ms: 7000,
    kicker: "Context",
    title: (p) => `${p.name} on the skyline`,
    run: (x) => {
      x.stopWalk();
      x.selectFloor(null);
      x.setExplosion(0);
      x.choosePhotoAngle("skyline");
    },
  },
  { id: "drone", ms: 7000, kicker: "Overview", title: (p) => p.summary.split(". ")[0].replace(/\.$/, ""), run: (x) => x.choosePhotoAngle("drone") },
];

/** One project's reel. Remounted (key) per project so each gets a fresh scene. */
function Reel({ project, playing, onDone, shotSkip }: { project: Project; playing: boolean; onDone: () => void; shotSkip: number }) {
  const site = useMemo(() => projectSite(project), [project]);
  const x = useExplorer(site, { city: project.backdrop });
  // Shot index and time into it change together, so a new shot never inherits the old clock.
  const [{ shot, elapsed }, setClock] = useState({ shot: 0, elapsed: 0 });
  const xRef = useRef(x);
  xRef.current = x;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const go = useCallback((n: number) => {
    if (n >= SHOTS.length) return doneRef.current();
    setClock({ shot: Math.max(0, n), elapsed: 0 });
  }, []);

  // External ←/→ skips arrive as a nonce; apply the whole delta once.
  const lastSkip = useRef(shotSkip);
  const shotRef = useRef(shot);
  shotRef.current = shot;
  useEffect(() => {
    const d = shotSkip - lastSkip.current;
    lastSkip.current = shotSkip;
    if (d) go(shotRef.current + d);
  }, [shotSkip, go]);

  // Run the shot's action whenever it changes. The first waits for the scene chunk.
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      cleanupRef.current = SHOTS[shot].run(xRef.current) || null;
    }, shot === 0 ? 900 : 0);
    return () => {
      clearTimeout(t);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [shot]);

  // Clock: advances only while playing; rolls over to the next shot.
  useEffect(() => {
    if (!playing) return;
    let prev = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - prev;
      prev = now;
      setClock((c) => (c.elapsed + dt >= SHOTS[c.shot].ms && c.shot + 1 < SHOTS.length ? { shot: c.shot + 1, elapsed: 0 } : { ...c, elapsed: c.elapsed + dt }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // End of the last shot hands over to the next project (outside the updater, so it runs once).
  const handedOver = useRef(false);
  useEffect(() => {
    if (shot === SHOTS.length - 1 && elapsed >= SHOTS[shot].ms && !handedOver.current) {
      handedOver.current = true;
      doneRef.current();
    }
  }, [shot, elapsed]);

  const s = SHOTS[shot];
  const progress = (shot + Math.min(1, elapsed / s.ms)) / SHOTS.length;

  return (
    <>
      {/* Own stacking layer, so the canvas can never paint over the captions. */}
      <div className="absolute inset-0 isolate z-0">
        <ExplorerViewport explorer={x} variant="bare" intro={false} className="h-dvh w-screen" />
      </div>

      {/* Lower third */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[9vh] z-30 px-6 sm:px-12">
        {/* Keyed enter-only animation: an exit phase could strand the caption during rapid skips. */}
        <motion.div
          key={`${project.slug}-${s.id}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl"
        >
          <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-white/75 [text-shadow:0_1px_8px_rgba(0,0,0,.45)]">
            {project.name} · {s.kicker}
          </p>
          <h2 className="font-serif text-3xl leading-[1.05] text-white [text-shadow:0_2px_24px_rgba(0,0,0,.45)] sm:text-5xl">{s.title(project, x)}</h2>
        </motion.div>
      </div>

      {/* Progress */}
      <div className="absolute inset-x-0 bottom-[6.5vh] z-30 flex gap-1 px-6 sm:px-12" aria-hidden>
        {SHOTS.map((sh, i) => (
          <div key={sh.id} className="h-[2px] flex-1 overflow-hidden bg-white/25">
            <div className="h-full bg-white" style={{ width: `${i < shot ? 100 : i > shot ? 0 : Math.min(100, (elapsed / s.ms) * 100)}%` }} />
          </div>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {project.name}: {s.kicker}. {Math.round(progress * 100)}% through this project.
      </span>
    </>
  );
}

export default function CinematicTour({ projects, startSlug }: { projects: Project[]; startSlug?: string }) {
  const [index, setIndex] = useState(() => Math.max(0, projects.findIndex((p) => p.slug === startSlug)));
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPlaying(!preference.matches);
    const change = () => { if (preference.matches) setPlaying(false); };
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  const [skip, setSkip] = useState(0);
  const [chrome, setChrome] = useState(true);
  const project = projects[index];

  const next = useCallback(() => setIndex((i) => (i + 1) % projects.length), [projects.length]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + projects.length) % projects.length), [projects.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") setSkip((n) => n + 1);
      else if (e.key === "ArrowLeft") setSkip((n) => n - 1);
      else if (e.key.toLowerCase() === "n") next();
      else if (e.key.toLowerCase() === "p") prev();
      else if (e.key.toLowerCase() === "h") setChrome((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-black">
      <AnimatePresence mode="wait">
        <motion.div key={project.slug} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }}>
          <Reel project={project} playing={playing} onDone={next} shotSkip={skip} />
        </motion.div>
      </AnimatePresence>

      {/* Letterbox */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[5vh] bg-black" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[5vh] bg-black" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[5vh] z-10 h-[34vh] bg-gradient-to-t from-black/45 to-transparent" />

      {chrome && (
        <div className="absolute inset-x-0 top-[5vh] z-30 flex items-center justify-between px-6 py-4 text-white sm:px-12">
          <Link href="/" className="font-serif text-2xl leading-none [text-shadow:0_1px_10px_rgba(0,0,0,.4)]" aria-label="Leave tour">
            AURA <span className="ml-2 align-middle font-sans text-[11px] uppercase tracking-[0.22em] text-white/70">Live reel</span>
          </Link>
          <div className="flex items-center gap-1">
            <span className="mr-3 hidden text-[11px] tabular-nums text-white/70 sm:inline">
              {String(index + 1).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}
            </span>
            <TourButton label="Previous project (P)" onClick={prev}>
              <ChevronLeft size={16} />
            </TourButton>
            <TourButton label={playing ? "Pause (Space)" : "Play (Space)"} onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </TourButton>
            <TourButton label="Next project (N)" onClick={next}>
              <ChevronRight size={16} />
            </TourButton>
            <Link href={`/projects/${project.slug}`} className="ml-2 border border-white/40 bg-white/10 px-3 py-1.5 text-xs backdrop-blur transition-colors hover:bg-white hover:text-ink">
              Open project
            </Link>
            <Link href="/" aria-label="Close tour" className="ml-1 grid h-8 w-8 place-items-center text-white/80 hover:text-white">
              <X size={16} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function TourButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center border border-white/30 bg-white/10 backdrop-blur transition-colors hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {children}
    </button>
  );
}
