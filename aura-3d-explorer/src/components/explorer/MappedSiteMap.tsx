"use client";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type FormEvent } from "react";
import { ArrowUp, ExternalLink, MapPin, RotateCcw, Search, X, Loader2, Navigation } from "lucide-react";
import type { ExplorerState } from "@/hooks/useExplorer";
import { geographicToWorld, type LonLat } from "@/lib/geographicContext";
import { openStreetMapUrl, geocodeAddress } from "@/lib/mapLocations";
import { MODEL_SCALE, planOutline } from "@/lib/tower";

const QUICK_PRESETS = [
  { label: "Jersey City Waterfront", query: "200 Hudson Street, Jersey City" },
  { label: "Midtown Manhattan", query: "350 5th Avenue, New York" },
  { label: "Chicago Loop", query: "121 North LaSalle Street, Chicago" },
  { label: "Miami Beach", query: "1700 Convention Center Drive, Miami Beach" },
  { label: "Downtown Dubai", query: "1 Sheikh Mohammed bin Rashid Boulevard, Dubai" },
  { label: "City of London", query: "Guildhall, Gresham Street, London" },
  { label: "Boston Seaport", query: "100 Federal St, Boston" },
  { label: "Seattle Waterfront", query: "1301 Alaskan Way, Seattle" },
] as const;

export default function MappedSiteMap({ explorer: x, onClose }: { explorer: ExplorerState; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  const [district, setDistrict] = useState(false);
  const [searchInput, setSearchInput] = useState(x.location.label.replace(" — example site", ""));
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState("");
  const [invalid, setInvalid] = useState("");

  const dragging = useRef<{ id: string; offset: [number, number] } | null>(null);
  const radius = (district ? 1500 : 250) * MODEL_SCALE;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    setSearchInput(x.location.label.replace(" — example site", ""));
  }, [x.location]);

  useEffect(() => () => x.setDragging(false), [x.setDragging]);

  const counts = useMemo(() => {
    const b = x.mapSnapshot?.features.filter((f) => f.kind === "building") ?? [];
    return {
      provided: b.filter((f) => f.heightSource === "recorded").length,
      estimated: b.filter((f) => f.heightSource === "levels").length,
      unknown: b.filter((f) => !f.height || f.heightSource === "unknown").length,
    };
  }, [x.mapSnapshot]);

  // Render canvas map layer from real map snapshot
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const w = 1000;
    const h = 750;
    c.width = w;
    c.height = h;
    ctx.fillStyle = "#f3f0ea";
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(w / (radius * 2), 0, 0, h / (radius * 1.5), w / 2, h / 2);

    const path = (points: LonLat[], closed: boolean) => {
      points.forEach((point, i) => {
        const [px, pz] = geographicToWorld(point, x.location);
        if (i === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      });
      if (closed) ctx.closePath();
    };

    for (const kind of ["water", "park", "building", "road"]) {
      for (const feature of x.mapSnapshot?.features ?? []) {
        if (feature.kind !== kind) continue;
        ctx.beginPath();
        const g = feature.geometry;
        if (g.type === "Polygon") g.coordinates.forEach((r) => path(r, true));
        else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p.forEach((r) => path(r, true)));
        else if (g.type === "LineString") path(g.coordinates, false);
        else g.coordinates.forEach((r) => path(r, false));

        if (kind === "road") {
          ctx.strokeStyle = "#beb8ac";
          ctx.lineWidth = radius / 400;
          ctx.stroke();
        } else {
          ctx.fillStyle = kind === "water" ? "#9dbdc6" : kind === "park" ? "#c1cca9" : feature.height ? "#b7ad9d" : "#ded8ce";
          ctx.fill("evenodd");
        }
      }
    }
  }, [x.mapSnapshot, x.location, radius]);

  async function locateAddress(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setInvalid("");
    setNotice("");

    try {
      const loc = await geocodeAddress(trimmed);
      if (!loc) {
        setInvalid("Could not locate address. Try a street, landmark, or latitude, longitude.");
        return;
      }

      const finalLabel = loc.label || trimmed;
      const success = x.setLocation({
        ...loc,
        label: finalLabel,
        example: false,
      });

      if (success) {
        setSearchInput(finalLabel);
        setNotice(`Moved project site to: ${finalLabel}`);
        // Reset local building offset so proposal sits directly at new address pin
        x.resetLayout();
      }
    } catch {
      setInvalid("Geocoding service error. Please try again or check connection.");
    } finally {
      setSearching(false);
    }
  }

  function handleLocate(e?: FormEvent) {
    if (e) e.preventDefault();
    void locateAddress(searchInput);
  }

  function handleMapClick(event: PointerEvent<SVGSVGElement>) {
    if (dragging.current || !svg.current) return;
    const target = event.target as SVGElement;
    if (target.tagName.toLowerCase() === "path") return; // clicked building path
    const r = svg.current.getBoundingClientRect();
    const px = ((event.clientX - r.left) / r.width) * radius * 2 - radius;
    const pz = ((event.clientY - r.top) / r.height) * radius * 1.5 - radius * 0.75;
    const newX = Math.round(px / MODEL_SCALE) * MODEL_SCALE;
    const newZ = Math.round(pz / MODEL_SCALE) * MODEL_SCALE;
    x.moveBuilding(x.activeBuildingId, [newX, newZ]);
    const mEast = Math.round(newX / MODEL_SCALE);
    const mNorth = Math.round(-newZ / MODEL_SCALE);
    setNotice(`Tower moved: ${mEast >= 0 ? "+" : ""}${mEast}m East, ${mNorth >= 0 ? "+" : ""}${mNorth}m North`);
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (!dragging.current || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const px = ((event.clientX - r.left) / r.width) * radius * 2 - radius;
    const pz = ((event.clientY - r.top) / r.height) * radius * 1.5 - radius * 0.75;
    const newX = Math.round((px - dragging.current.offset[0]) / MODEL_SCALE) * MODEL_SCALE;
    const newZ = Math.round((pz - dragging.current.offset[1]) / MODEL_SCALE) * MODEL_SCALE;
    x.moveBuilding(dragging.current.id, [newX, newZ]);
    const mEast = Math.round(newX / MODEL_SCALE);
    const mNorth = Math.round(-newZ / MODEL_SCALE);
    setNotice(`Tower moved: ${mEast >= 0 ? "+" : ""}${mEast}m East, ${mNorth >= 0 ? "+" : ""}${mNorth}m North`);
  }

  function end() {
    dragging.current = null;
    x.setDragging(false);
  }

  const activeBuilding = x.site.find((b) => b.id === x.activeBuildingId) ?? x.site[0];
  const offsetEast = Math.round((activeBuilding?.position[0] ?? 0) / MODEL_SCALE);
  const offsetNorth = Math.round(-(activeBuilding?.position[1] ?? 0) / MODEL_SCALE);
  const isMoved = offsetEast !== 0 || offsetNorth !== 0;

  return (
    <section
      role="dialog"
      aria-label="Project map location"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="overlay absolute inset-x-3 top-3 z-40 max-h-[calc(100%-1.5rem)] overflow-auto rounded-lg border border-plaster/80 bg-paper/95 p-4 text-ink shadow-2xl backdrop-blur-md sm:left-auto sm:right-4 sm:w-[450px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-plaster pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-oak/10 text-oak">
            <Navigation size={14} />
          </div>
          <div>
            <h2 className="font-serif text-lg font-medium leading-none text-ink">Site Map & Address</h2>
            <p className="text-[11px] text-ash">Position your building on real maps</p>
          </div>
        </div>
        <button
          ref={close}
          type="button"
          aria-label="Close project map"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone text-ash hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Address search form */}
      <form onSubmit={handleLocate} className="mt-3 space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ash">
          Address or Coordinates
          <div className="relative mt-1">
            <input
              type="text"
              value={searchInput}
              placeholder="e.g. 200 Hudson St, Empire State Building, lat, lon..."
              onChange={(e) => {
                setSearchInput(e.target.value);
                setInvalid("");
                setNotice("");
              }}
              className="block w-full rounded border border-plaster bg-paper px-3 py-2 pr-10 text-sm text-ink placeholder:text-ash/60 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            />
            <button
              type="submit"
              disabled={searching}
              aria-label="Locate address"
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded bg-ink text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            </button>
          </div>
        </label>

        {/* Quick location chips */}
        <div className="flex flex-wrap gap-1 pt-1">
          <span className="text-[10px] uppercase font-bold text-ash py-0.5 mr-1">Jump to:</span>
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setSearchInput(preset.query);
                void locateAddress(preset.query);
              }}
              className="rounded-full border border-plaster/80 bg-stone/50 px-2 py-0.5 text-[10px] text-ink hover:bg-stone hover:border-ink/40 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Feedback messages */}
        {invalid && <p role="alert" className="text-xs font-medium text-negative">{invalid}</p>}
        {notice && <p role="status" className="text-xs font-medium text-emerald-700">{notice}</p>}
      </form>

      {/* Map view controls */}
      <div className="my-3 flex items-center justify-between gap-2 border-t border-plaster pt-3">
        <div role="group" aria-label="Map zoom" className="flex gap-1">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={district === v}
              onClick={() => setDistrict(v)}
              className={district === v ? "btn-primary !px-2.5 !py-1 text-xs" : "btn-secondary !px-2.5 !py-1 text-xs"}
            >
              {v ? "District (3 km)" : "Site (500 m)"}
            </button>
          ))}
        </div>

        {isMoved && (
          <div className="flex items-center gap-1.5 text-xs text-ash">
            <span className="font-mono text-[11px] bg-stone px-1.5 py-0.5 rounded">
              {offsetEast >= 0 ? "+" : ""}{offsetEast}m E, {offsetNorth >= 0 ? "+" : ""}{offsetNorth}m N
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] text-ink underline hover:text-oak"
              onClick={() => {
                x.resetLayout();
                setNotice("Building reset to site center");
              }}
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
        )}
      </div>

      {/* Interactive Map Area */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded border border-plaster bg-paper shadow-inner cursor-crosshair">
        <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
        <svg
          ref={svg}
          role="group"
          aria-label="Mapped site. Click to move tower or drag buildings."
          viewBox={`${-radius} ${-radius * 0.75} ${radius * 2} ${radius * 1.5}`}
          className="absolute inset-0 h-full w-full touch-none"
          onClick={handleMapClick}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {/* Target crosshairs at site origin */}
          <line x1={-radius / 20} y1={0} x2={radius / 20} y2={0} stroke="#999" strokeWidth={radius / 400} />
          <line x1={0} y1={-radius / 20} x2={0} y2={radius / 20} stroke="#999" strokeWidth={radius / 400} />
          <circle cx={0} cy={0} r={radius / 70} fill="none" stroke="#201f1b" strokeWidth={radius / 350} strokeDasharray="2,2" />

          {/* Proposed site buildings */}
          {x.site.map((b) => {
            const outlines = new Set(
              b.floors.map((f) => {
                const c = Math.cos(f.rotationY);
                const s = Math.sin(f.rotationY);
                return (
                  planOutline(f.shape, f.width, f.depth)
                    .map(([px, pz], i) => `${i ? "L" : "M"}${b.position[0] + px * c + pz * s},${b.position[1] - px * s + pz * c}`)
                    .join(" ") + "Z"
                );
              })
            );
            const active = b.id === x.activeBuildingId;
            return (
              <g key={b.id}>
                <path
                  d={[...outlines].join(" ")}
                  fill={active ? "#1a1915" : "#8d704d"}
                  stroke="#ffffff"
                  strokeWidth={radius / 180}
                  tabIndex={0}
                  role="button"
                  aria-label={`Drag to move ${b.name}`}
                  className="cursor-grab active:cursor-grabbing focus:stroke-oak transition-shadow"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.focus();
                    x.selectBuilding(b.id);
                    const r = svg.current!.getBoundingClientRect();
                    dragging.current = {
                      id: b.id,
                      offset: [
                        ((e.clientX - r.left) / r.width) * radius * 2 - radius - b.position[0],
                        ((e.clientY - r.top) / r.height) * radius * 1.5 - radius * 0.75 - b.position[1],
                      ],
                    };
                    x.setDragging(true);
                    svg.current?.setPointerCapture(e.pointerId);
                  }}
                  onKeyDown={(e) => {
                    const d = e.shiftKey ? 10 * MODEL_SCALE : MODEL_SCALE;
                    const offsets: Record<string, [number, number]> = {
                      ArrowLeft: [-d, 0],
                      ArrowRight: [d, 0],
                      ArrowUp: [0, -d],
                      ArrowDown: [0, d],
                    };
                    if (offsets[e.key]) {
                      e.preventDefault();
                      e.stopPropagation();
                      x.selectBuilding(b.id);
                      const nX = b.position[0] + offsets[e.key][0];
                      const nZ = b.position[1] + offsets[e.key][1];
                      x.moveBuilding(b.id, [nX, nZ]);
                      setNotice(`Moved: ${Math.round(nX / MODEL_SCALE)}m E, ${Math.round(-nZ / MODEL_SCALE)}m N`);
                    }
                  }}
                >
                  <title>{b.name} — Click or drag to move</title>
                </path>
              </g>
            );
          })}
        </svg>

        {/* Map Badges */}
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-paper/90 px-1.5 py-0.5 text-[11px] font-medium text-ink shadow-sm border border-plaster">
          <ArrowUp size={11} className="text-negative font-bold" />
          <span>North</span>
        </div>
        <div className="absolute bottom-2 left-2 rounded bg-paper/90 px-1.5 py-0.5 text-[10px] text-ash shadow-sm border border-plaster">
          {district ? "3 km span" : "500 m span"} · Click anywhere to place
        </div>
      </div>

      <p className="mt-2 text-[11px] text-ash leading-snug">
        💡 <strong>Tip:</strong> Click anywhere on the map or drag the dark tower shape to move your building. Use Arrow keys to nudge (hold Shift for 10m).
      </p>

      {/* Loading & data attribution */}
      {x.mapLoading && <p role="status" className="mt-2 text-xs text-ash animate-pulse">Loading local map snapshot…</p>}
      {x.mapError && (
        <div role="status" className="mt-2 rounded bg-stone p-2 text-xs text-ash">
          <p>{x.mapError}</p>
          <button type="button" onClick={x.retryMap} className="mt-1 font-medium text-ink underline">
            Retry map
          </button>
        </div>
      )}
      {x.mapSnapshot && (
        <p className="mt-2 text-[10px] text-ash/80 leading-normal">
          {counts.provided.toLocaleString()} 3D buildings · {counts.estimated.toLocaleString()} estimated floors · {counts.unknown.toLocaleString()} footprints
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-plaster pt-2 text-[10px] text-ash">
        <div className="flex gap-2">
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
            © OpenStreetMap
          </a>
          <span>·</span>
          <a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noreferrer" className="underline">
            Overture Maps
          </a>
        </div>
        <a
          href={openStreetMapUrl(x.location)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] underline hover:text-ink"
        >
          View live map <ExternalLink size={10} />
        </a>
      </div>
    </section>
  );
}
