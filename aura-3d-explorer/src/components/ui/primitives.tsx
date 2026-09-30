"use client";
/**
 * Small shared UI building blocks used by the cards and HUD:
 * GlassCard, RangeSlider, SegmentedControl, AnimatedValue and Metric.
 */
import { ReactNode } from "react";
import clsx from "clsx";
import * as RSlider from "@radix-ui/react-slider";
import { AnimatePresence, motion } from "framer-motion";

/* ------------------------------------------------------------------ GlassCard */

interface GlassCardProps {
  eyebrow?: string;
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Stagger index for the entrance animation. */
  index?: number;
}

/** Glassmorphism panel with a staggered fade-up entrance. */
export function GlassCard({ eyebrow, title, icon, action, children, className, index = 0 }: GlassCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className={clsx("glass-card rounded-2xl p-5 shadow-card", className)}
    >
      {(eyebrow || title) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {eyebrow && (
              <p className="eyebrow mb-1 flex items-center gap-1.5 text-gold/85">
                {icon}
                {eyebrow}
              </p>
            )}
            {title && <h3 className="font-serif text-[22px] leading-tight text-white">{title}</h3>}
          </div>
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
}

/* ---------------------------------------------------------------- RangeSlider */

interface RangeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Formatted value shown on the right of the label. */
  display: string;
  onChange: (v: number) => void;
  icon?: ReactNode;
  /** Formatted min / max captions under the track. */
  bounds?: [string, string];
  compact?: boolean;
}

/** Radix slider in brushed gold with a live serif readout. */
export function RangeSlider({ label, value, min, max, step = 1, display, onChange, icon, bounds, compact }: RangeSliderProps) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
          {icon}
          {label}
        </span>
        <span className={clsx("font-serif tabular-nums text-white", compact ? "text-base" : "text-lg")}>{display}</span>
      </div>
      <RSlider.Root
        className="relative flex h-5 w-full cursor-pointer touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      >
        <RSlider.Track className="relative h-[3px] grow overflow-hidden rounded-full bg-white/10">
          <RSlider.Range className="absolute h-full rounded-full bg-gradient-to-r from-gold-dim via-gold to-gold-light" />
        </RSlider.Track>
        <RSlider.Thumb className="block h-4 w-4 rounded-full border-2 border-gold bg-obsidian shadow-gold outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-gold/50" />
      </RSlider.Root>
      {bounds && (
        <div className="flex justify-between text-[10px] tabular-nums text-slate-500">
          <span>{bounds[0]}</span>
          <span>{bounds[1]}</span>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- SegmentedControl */

interface SegmentedControlProps<T extends string> {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  /** Unique id so the animated pill doesn't jump between separate controls. */
  layoutId: string;
  size?: "sm" | "md";
  ariaLabel: string;
}

/** Pill toggle group with a sliding gold indicator. */
export function SegmentedControl<T extends string>({ value, options, onChange, layoutId, size = "md", ariaLabel }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex rounded-full border border-white/[0.08] bg-black/30 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              active ? "text-obsidian" : "text-slate-400 hover:text-white"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-gradient-to-b from-gold-light to-gold"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- AnimatedValue */

/** Cross-fades whenever the formatted value string changes. */
export function AnimatedValue({ value, className }: { value: string; className?: string }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className={className}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* --------------------------------------------------------------------- Metric */

interface MetricProps {
  label: string;
  value: string;
  icon?: ReactNode;
  sub?: string;
  tone?: "default" | "gold" | "positive" | "negative";
}

const TONES = {
  default: { box: "border-white/[0.06] bg-white/[0.02]", text: "text-white" },
  gold: { box: "border-gold/30 bg-gold/[0.06]", text: "text-gold-metal" },
  positive: { box: "border-emerald-500/25 bg-emerald-500/[0.06]", text: "text-emerald-400" },
  negative: { box: "border-rose-500/25 bg-rose-500/[0.06]", text: "text-rose-400" },
};

/** KPI tile with a serif figure. */
export function Metric({ label, value, icon, sub, tone = "default" }: MetricProps) {
  const t = TONES[tone];
  return (
    <div className={clsx("rounded-xl border p-3.5", t.box)}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {icon}
        {label}
      </div>
      <div className="font-serif text-[24px] leading-tight tabular-nums">
        <AnimatedValue value={value} className={t.text} />
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
