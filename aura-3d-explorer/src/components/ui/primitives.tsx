"use client";
/**
 * Small shared UI building blocks: Panel, RangeSlider, SegmentedControl,
 * AnimatedValue and Metric. Light, flat, hairline-bordered — whitespace does
 * the work, not glass or glow. Motion is slow and restrained (no springs).
 */
import { ReactNode } from "react";
import clsx from "clsx";
import * as RSlider from "@radix-ui/react-slider";
import { AnimatePresence, motion } from "framer-motion";

/** Calm ease used across the app. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/* --------------------------------------------------------------------- Panel */

interface PanelProps {
  /** Small grey caption above the title. */
  kicker?: string;
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Stagger index for the entrance fade. */
  index?: number;
}

/** Flat paper panel with a hairline border and a gentle fade-up entrance. */
export function Panel({ kicker, title, icon, action, children, className, index = 0 }: PanelProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.05 + index * 0.06, ease: EASE }}
      className={clsx("panel p-5", className)}
    >
      {(kicker || title) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {kicker && (
              <p className="caption mb-1 flex items-center gap-1.5">
                {icon}
                {kicker}
              </p>
            )}
            {title && <h3 className="font-serif text-[22px] leading-tight text-ink">{title}</h3>}
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

/** Keyboard-operable Radix slider (arrows, PageUp/Down, Home/End). */
export function RangeSlider({ label, value, min, max, step = 1, display, onChange, icon, bounds, compact }: RangeSliderProps) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs text-ash">
          {icon}
          {label}
        </span>
        <span className={clsx("tabular-nums text-ink", compact ? "text-sm" : "font-serif text-lg leading-none")}>{display}</span>
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
        <RSlider.Track className="relative h-px grow bg-plaster">
          <RSlider.Range className="absolute h-full bg-ink" />
        </RSlider.Track>
        <RSlider.Thumb
          aria-label={label}
          className="block h-3.5 w-3.5 rounded-full border border-ink bg-paper outline-none transition-transform duration-300 hover:scale-110 focus-visible:ring-4 focus-visible:ring-oak/30"
        />
      </RSlider.Root>
      {bounds && (
        <div className="caption flex justify-between tabular-nums">
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
  /** Unique id so the sliding indicator doesn't jump between separate controls. */
  layoutId: string;
  size?: "sm" | "md";
  ariaLabel: string;
}

/** Toggle group with a sliding ink indicator. */
export function SegmentedControl<T extends string>({ value, options, onChange, layoutId, size = "md", ariaLabel }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex border border-plaster bg-paper p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              active ? "text-paper" : "text-ash hover:text-ink"
            )}
          >
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 bg-ink" transition={{ duration: 0.35, ease: EASE }} />}
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
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25, ease: EASE }}
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
  tone?: "default" | "accent" | "positive" | "negative";
}

const TONES = {
  default: "text-ink",
  accent: "text-oak",
  positive: "text-positive",
  negative: "text-negative",
};

/** KPI tile: small caption, large serif figure. */
export function Metric({ label, value, icon, sub, tone = "default" }: MetricProps) {
  return (
    <div className="border border-plaster bg-stone/40 p-3.5">
      <div className="caption mb-1 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="font-serif text-[26px] leading-tight tabular-nums">
        <AnimatedValue value={value} className={TONES[tone]} />
      </div>
      {sub && <div className="caption mt-0.5">{sub}</div>}
    </div>
  );
}
