"use client";
/**
 * CityPicker — chooses the city backdrop the project is rendered in
 * (lib/cityPresets). A native <select> keeps it accessible and gives phones
 * their own picker; the overlay pill matches the rest of the HUD.
 */
import { retryCityModel, useCityModelStatus } from "@/lib/cityModelStatus";
import { CITY_MODELS } from "@/lib/cityModels";
import clsx from "clsx";
import { ChevronDown, MapPin } from "lucide-react";
import { CITY_PRESETS, getCityPreset, type CityId } from "@/lib/cityPresets";

interface Props {
  value: CityId;
  onChange: (id: CityId) => void;
  /** Show the one-line description of the chosen city beneath the pill. */
  showBlurb?: boolean;
  className?: string;
}

export default function CityPicker({ value, onChange, showBlurb = false, className }: Props) {
  const preset = getCityPreset(value);
  const model = CITY_MODELS[value];
  const { status } = useCityModelStatus(model?.uid ?? "");
  return (
    <div className={clsx("flex flex-col items-start gap-1", className)}>
      <label className="overlay relative flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-7 text-[11px] text-ink transition-colors focus-within:ring-2 focus-within:ring-oak/40 hover:border-ink/30">
        <MapPin size={12} className="shrink-0 text-oak" aria-hidden />
        <span className="caption hidden sm:inline">City</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as CityId)}
          aria-label="City backdrop"
          title={CITY_MODELS[value]?.coverage ?? "Illustrative neutral backdrop"}
          className="cursor-pointer appearance-none bg-transparent pr-0.5 font-medium text-ink focus:outline-none"
        >
          {CITY_PRESETS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-2.5 text-ash" aria-hidden />
      </label>
      {CITY_MODELS[value] && <a href={`https://sketchfab.com/3d-models/${CITY_MODELS[value]!.uid}`} target="_blank" rel="noreferrer" className="overlay max-w-[260px] rounded px-2 py-1 text-[10px] text-ink underline underline-offset-2">{CITY_MODELS[value]!.coverage} · Sketchfab</a>}
      {model && status === "loading" && <span role="status" className="overlay rounded px-2 py-1 text-[10px] text-ink">Loading city model…</span>}
      {model && status === "failed" && <button className="overlay rounded px-2 py-1 text-xs text-ink" onClick={() => retryCityModel(model.uid)}>City model couldn’t load · Retry</button>}
      {showBlurb && !CITY_MODELS[value] && <p className="overlay hidden max-w-[260px] rounded-full px-2.5 py-0.5 text-[10px] text-ash md:block">{preset.blurb}</p>}
    </div>
  );
}
