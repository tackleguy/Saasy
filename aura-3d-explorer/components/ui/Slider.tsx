"use client";
/** Luxury-styled Radix slider with label + live value readout */
import * as RSlider from "@radix-ui/react-slider";
import { ReactNode } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  onChange: (v: number) => void;
  icon?: ReactNode;
  hint?: string;
}

export default function Slider({ label, value, min, max, step = 1, display, onChange, icon, hint }: Props) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-mist">
          {icon}
          {label}
        </span>
        <span className="font-serif text-lg tabular-nums text-white">{display}</span>
      </div>
      <RSlider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      >
        <RSlider.Track className="relative h-[3px] grow overflow-hidden rounded-full bg-obsidian-500">
          <RSlider.Range className="absolute h-full rounded-full bg-gradient-to-r from-gold-dim to-gold" />
        </RSlider.Track>
        <RSlider.Thumb className="block h-4 w-4 rounded-full border-2 border-gold bg-obsidian shadow-gold outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-gold/50" />
      </RSlider.Root>
      {hint && <p className="text-[11px] text-mist/70">{hint}</p>}
    </div>
  );
}
