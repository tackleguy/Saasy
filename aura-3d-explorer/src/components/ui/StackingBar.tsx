"use client";
/**
 * StackingBar — slim vertical stacking diagram of the active building.
 * -----------------------------------------------------------------------------
 * One segment per floor (height ∝ floor-to-floor height), coloured by zone,
 * roof at the top. Hover reads out the level; click isolates that floor
 * (click the isolated floor again to release it). Zone starts are ticked.
 */
import { useState } from "react";
import clsx from "clsx";
import type { Building, FloorData } from "@/types";
import { ZONES } from "@/lib/tower";
import { AMENITY_ACCENT, amenityName } from "@/lib/amenities";

/** Amenity floors are marked in the amenity colour; others by zone. */
const accentOf = (f: FloorData) => (f.amenity ? AMENITY_ACCENT : ZONES[f.zone].accent);

interface Props {
  building: Building;
  selectedIndex: number | null;
  onSelect: (floor: FloorData | null) => void;
  className?: string;
}

export default function StackingBar({ building, selectedIndex, onSelect, className }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const floors = [...building.floors].reverse();
  const shownIndex = hover ?? selectedIndex;
  const shown = shownIndex !== null ? building.floors[shownIndex] ?? null : null;

  return (
    <nav aria-label={`${building.short} stacking diagram`} className={clsx("overlay flex flex-col items-end gap-1.5 rounded-[3px] px-1.5 py-2", className)}>
      <p className="caption w-full text-center font-mono text-[9px] tabular-nums">{shown ? `L${shown.number}` : `${building.floors.length}F`}</p>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-px" onMouseLeave={() => setHover(null)}>
        {floors.map((f) => {
          const selected = f.index === selectedIndex;
          const zoneStart = f.zoneIndex === 0;
          return (
            <button
              key={f.index}
              onClick={() => onSelect(selected ? null : f)}
              onMouseEnter={() => setHover(f.index)}
              onFocus={() => setHover(f.index)}
              onBlur={() => setHover(null)}
              aria-label={`Floor ${f.number} · ${f.amenity ? `Amenity · ${amenityName(f)}` : ZONES[f.zone].short}`}
              aria-pressed={selected}
              title={`L${f.number} · ${f.amenity ? `Amenity · ${amenityName(f)}` : ZONES[f.zone].label}`}
              className="group relative flex min-h-px w-full items-stretch justify-center focus-visible:outline-none"
              style={{ flexGrow: f.height, flexBasis: 0 }}
            >
              <span
                className={clsx(
                  "block rounded-[1px] transition-all duration-200",
                  selected ? "w-full bg-ink" : "w-2/3 opacity-60 group-hover:w-full group-hover:opacity-100 group-focus-visible:w-full group-focus-visible:opacity-100"
                )}
                style={selected ? undefined : { background: accentOf(f) }}
              />
              {f.amenity && <span aria-hidden className="absolute -right-1 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full" style={{ background: AMENITY_ACCENT }} />}
              {zoneStart && <span aria-hidden className="absolute -left-1 bottom-0 h-px w-1 bg-ash/60" />}
            </button>
          );
        })}
      </div>
      <p className="caption w-full truncate text-center text-[9px]" style={shown ? { color: accentOf(shown) } : undefined}>
        {shown ? (shown.amenity ? amenityName(shown) : ZONES[shown.zone].short) : "Stack"}
      </p>
    </nav>
  );
}
