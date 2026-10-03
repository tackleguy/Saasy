"use client";
/**
 * CityPicker — chooses the city backdrop the project is rendered in
 * (lib/cityPresets). A native <select> keeps it accessible and gives phones
 * their own picker; the overlay pill matches the rest of the HUD.
 */
import { retryCityModel, useCityModelStatus } from "@/lib/cityModelStatus";
import { CITY_MODELS } from "@/lib/cityModels";
import clsx from "clsx";
import { MAP_SITES, mapCoverage } from "@/lib/mapLocations";
import type { ProjectLocation } from "@/lib/geographicContext";
import { ChevronDown, MapPin } from "lucide-react";
import { CITY_PRESETS, getCityPreset, type CityId } from "@/lib/cityPresets";

interface Props {
  location?: ProjectLocation;
  onLocationChange?: (location: ProjectLocation) => boolean;
  onLocationOpen?: () => void;
  mapLoading?: boolean;
  mapError?: string;
  value: CityId;
  existingCity?: boolean;
  onChange: (id: CityId) => void;
  /** Show the one-line description of the chosen city beneath the pill. */
  showBlurb?: boolean;
  className?: string;
}

export default function CityPicker({ location, onLocationChange, onLocationOpen, mapLoading, mapError, existingCity = false, value, onChange, showBlurb = false, className }: Props) {
  const preset = getCityPreset(value);
  const model = CITY_MODELS[value];
  const { status } = useCityModelStatus(model?.uid ?? "");
  if (location) return (
    <div className={clsx("flex min-w-0 max-w-[190px] flex-col items-start gap-1 sm:max-w-[240px]", className)}>
      <label className="overlay flex max-w-full items-center gap-1 rounded px-2 py-1 text-xs text-ink">
        <MapPin size={13} className="shrink-0" aria-hidden="true" />
        <select aria-label="Map area" value={mapCoverage(location)?.id ?? ""} className="min-w-0 bg-transparent font-medium" onChange={e=>{const s=MAP_SITES.find(s=>s.id===e.target.value);if(s)onLocationChange?.({latitude:s.latitude,longitude:s.longitude,label:s.label,example:true});}}>
          {!mapCoverage(location)&&<option value="">Project pin</option>}
          {MAP_SITES.map(s=><option key={s.id} value={s.id}>{s.label.replace(" — example site","")}</option>)}
        </select>
      </label>
      <button type="button" onClick={onLocationOpen} className="max-w-full text-left text-xs text-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">{location.example ? "Example pin · Set project location" : "Project pin · Edit location"}</button>
      {mapLoading && <span role="status" className="text-xs text-ink">Loading mapped context…</span>}
      {mapError && <span role="status" className="text-xs text-ink">Map unavailable · Open location to retry</span>}
    </div>
  );
  return (
    <div className={clsx("flex min-w-0 max-w-[200px] flex-col items-start gap-1 sm:max-w-[280px]", className)}>
      <label className="overlay relative flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-7 text-[11px] text-ink transition-colors focus-within:ring-2 focus-within:ring-oak/40 hover:border-ink/30">
        <MapPin size={12} className="shrink-0 text-oak" aria-hidden />
        <span className="caption hidden sm:inline">City</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as CityId)}
          aria-label="City backdrop"
          title={existingCity && model ? model.coverage : "Illustrative city skyline"}
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
      {!existingCity && <span className="overlay rounded px-2 py-1 text-[10px] text-ink">Illustrative skyline</span>}
      {existingCity && CITY_MODELS[value] && <a href={`https://sketchfab.com/3d-models/${CITY_MODELS[value]!.uid}`} target="_blank" rel="noreferrer" className="overlay max-w-full rounded px-2 py-1 text-[10px] text-ink underline underline-offset-2">{CITY_MODELS[value]!.coverage} · Sketchfab</a>}
      {existingCity && model && (status === "loading" || status === "updating") && <span role="status" className="overlay max-w-full rounded px-2 py-1 text-xs text-ink">{status === "updating" ? "Updating city detail… Current view kept." : "Loading city model…"}</span>}
      {existingCity && model && (status === "fallback" || status === "retained") && (
        <div className="overlay max-w-full rounded px-2 py-1 text-xs text-ink">
          <p role="status">{status === "fallback" ? "Standard city detail shown. High detail couldn’t load." : "Previous city detail kept. Update couldn’t load."}</p>
          <button type="button" className="mt-1 min-h-11 rounded border border-plaster px-2 font-medium hover:bg-stone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" onClick={() => retryCityModel(model.uid)}>{status === "fallback" ? "Retry high detail" : "Retry city detail"}</button>
        </div>
      )}
      {existingCity && model && status === "failed" && <button type="button" className="overlay min-h-11 rounded px-2 py-1 text-xs text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" onClick={() => retryCityModel(model.uid)}>City model couldn’t load · Retry</button>}
      {showBlurb && !CITY_MODELS[value] && <p className="overlay hidden max-w-[260px] rounded-full px-2.5 py-0.5 text-[10px] text-ash md:block">{preset.blurb}</p>}
    </div>
  );
}
