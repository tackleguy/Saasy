"use client";
/**
 * ArchitectPanel — the Studio sidebar in Architect mode.
 * -----------------------------------------------------------------------------
 *   1. Drawing views — perspective, plan and four orthographic elevations.
 *   2. Tools — measure (with a list of dimensions), level markers, section
 *      cutaway, core X-ray, clay model and the site map.
 *   3. Sun & shadow study — month and solar time at the city's latitude.
 *   4. Zoning envelope — height, FAR and coverage limits with a pass / fail
 *      check per building and for the site; the height limit is drawn in 3D.
 *   5. Area schedule — GFA by zone, levels, floor-to-floor and plate sizes,
 *      downloadable as CSV.
 */
import clsx from "clsx";
import type { ReactNode } from "react";
import { Box, Check, Download, Eye, Layers, Map as MapIcon, PenLine, Ruler, ScanEye, Scissors, Sun, Trash2, X as XIcon } from "lucide-react";
import type { ExplorerState } from "@/hooks/useExplorer";
import type { ArchitectState } from "@/hooks/useArchitect";
import { ARCH_VIEWS, formatHour, MONTHS, SQFT_PER_M2, type Measurement } from "@/lib/architecture";
import { MODEL_SCALE, ZONES } from "@/lib/tower";
import { getCityPreset } from "@/lib/cityPresets";
import { Metric, Panel, RangeSlider } from "@/components/ui/primitives";

interface Props {
  arch: ArchitectState;
  explorer: ExplorerState;
  projectName: string;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const cardinal = (deg: number) => CARDINALS[Math.round(deg / 45) % 8];

function ToolButton({ on, onClick, icon, label, hint }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; hint?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      title={hint}
      className={clsx(
        "flex items-center gap-2 border px-2.5 py-2 text-left text-xs transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40",
        on ? "border-oak bg-oak/10 text-oak" : "border-plaster text-ash hover:border-ink/30 hover:text-ink"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function Status({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-positive">
      <Check size={12} aria-hidden /> Pass
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-negative">
      <XIcon size={12} aria-hidden /> Over
    </span>
  );
}

const distanceM = (m: Measurement) => Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]) / MODEL_SCALE;

export default function ArchitectPanel({ arch, explorer: x, projectName }: Props) {
  const s = arch.schedule;
  const preset = getCityPreset(x.city);
  const heightMax = Math.max(100, Math.ceil((s.tallestM * 1.6) / 50) * 50);

  const downloadCsv = () => {
    const rows = [["Building", "Zone", "Floors", "From (m)", "To (m)", "Floor-to-floor (m)", "Plate W (m)", "Plate D (m)", "GFA (m²)", "GFA (sf)"]];
    for (const b of s.buildings) {
      for (const z of b.zones) {
        rows.push([b.name, ZONES[z.zone].label, String(z.floors), z.fromM.toFixed(1), z.toM.toFixed(1), z.f2fM.toFixed(2), z.plateM[0].toFixed(1), z.plateM[1].toFixed(1), z.gfaM2.toFixed(0), (z.gfaM2 * SQFT_PER_M2).toFixed(0)]);
      }
      rows.push([b.name, "Total", String(b.floors), "0.0", b.heightM.toFixed(1), "", "", "", b.gfaM2.toFixed(0), (b.gfaM2 * SQFT_PER_M2).toFixed(0)]);
    }
    rows.push(["Site", `FAR ${s.far.toFixed(2)} · coverage ${(s.coverage * 100).toFixed(1)}%`, "", "", "", "", "", "", s.gfaM2.toFixed(0), (s.gfaM2 * SQFT_PER_M2).toFixed(0)]);
    const csv = rows.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-area-schedule.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 1 — Drawing views */}
      <Panel kicker="Drawing views" title="Views" icon={<Eye size={12} aria-hidden />} index={0}>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Drawing view">
          {ARCH_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => arch.setView(v.id)}
              aria-pressed={arch.view === v.id}
              className={clsx(
                "border px-2 py-1.5 text-xs transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40",
                arch.view === v.id ? "border-ink bg-ink text-paper" : "border-plaster text-ash hover:border-ink/30 hover:text-ink"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="caption mt-2.5">
          {arch.view === "perspective"
            ? "Orbit freely. Plan and elevations use a true orthographic camera, north up."
            : "Orthographic: drag to pan, scroll to zoom. Pick a view again to re-frame."}
        </p>
      </Panel>

      {/* 2 — Tools */}
      <Panel kicker="Tools" title="Draw & inspect" icon={<PenLine size={12} aria-hidden />} index={1}>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton on={arch.measuring} onClick={() => arch.setMeasuring(!arch.measuring)} icon={<Ruler size={13} aria-hidden />} label="Measure" hint="Click two points; Shift for a vertical dimension; Esc cancels" />
          <ToolButton on={arch.dimensions} onClick={() => arch.setDimensions(!arch.dimensions)} icon={<Layers size={13} aria-hidden />} label="Level markers" hint="Height dimension and zone levels on the active building" />
          <ToolButton on={x.sectionMode} onClick={() => x.setSectionMode(!x.sectionMode)} icon={<Scissors size={13} aria-hidden />} label="Section cut" hint="Vertical cutaway through the active building" />
          <ToolButton on={x.xray} onClick={() => x.setXray(!x.xray)} icon={<ScanEye size={13} aria-hidden />} label="Core X-ray" hint="Fade facades to show the structural cores" />
          <ToolButton on={arch.clay} onClick={() => arch.setClay(!arch.clay)} icon={<Box size={13} aria-hidden />} label="Clay model" hint="White massing-model render" />
          <ToolButton on={x.mapOpen} onClick={() => x.setMapOpen(!x.mapOpen)} icon={<MapIcon size={13} aria-hidden />} label="Site map" hint="Move buildings on the plan" />
        </div>
        {arch.measuring && <p className="caption mt-2.5">Click two points on a building or the ground. Hold Shift on the second click for a vertical dimension. Esc cancels.</p>}
        {arch.measurements.length > 0 && (
          <div className="mt-3 border-t border-plaster pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="caption">Dimensions</p>
              <button onClick={arch.clearMeasurements} className="btn-ghost px-1 py-0.5 text-[11px]">
                Clear all
              </button>
            </div>
            <ul className="space-y-1">
              {arch.measurements.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2 text-xs">
                  <span className="caption w-5">D{i + 1}</span>
                  <span className="flex-1 font-mono tabular-nums text-ink">{distanceM(m).toFixed(1)} m</span>
                  <span className="caption font-mono tabular-nums">Δh {((m.b[1] - m.a[1]) / MODEL_SCALE).toFixed(1)} m</span>
                  <button onClick={() => arch.removeMeasurement(m.id)} className="text-ash hover:text-ink" aria-label={`Delete dimension D${i + 1}`}>
                    <Trash2 size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {/* 3 — Sun study */}
      <Panel
        kicker={`Sun & shadow · ${preset.label} ${Math.abs(preset.latitude).toFixed(1)}°${preset.latitude >= 0 ? "N" : "S"}`}
        title="Sun study"
        icon={<Sun size={12} aria-hidden />}
        index={2}
        action={
          <button
            onClick={() => arch.setSunStudy(!arch.sunStudy)}
            aria-pressed={arch.sunStudy}
            className={clsx("border px-2.5 py-1 text-[11px] transition-colors", arch.sunStudy ? "border-oak bg-oak/10 text-oak" : "border-plaster text-ash hover:text-ink")}
          >
            {arch.sunStudy ? "On" : "Off"}
          </button>
        }
      >
        <div className={clsx("space-y-3", !arch.sunStudy && "opacity-50")}>
          <div className="grid grid-cols-6 gap-1" role="group" aria-label="Month">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                disabled={!arch.sunStudy}
                onClick={() => arch.setMonth(i)}
                aria-pressed={arch.month === i}
                className={clsx("border px-1 py-1 text-[11px] transition-colors", arch.month === i ? "border-ink bg-ink text-paper" : "border-plaster text-ash hover:text-ink")}
              >
                {m}
              </button>
            ))}
          </div>
          <RangeSlider compact label="Solar time" value={arch.hour} min={5} max={21} step={0.25} display={formatHour(arch.hour)} onChange={(v) => arch.sunStudy && arch.setHour(v)} bounds={["05:00", "21:00"]} />
          <p className="caption">
            {arch.sun.elevation > 0
              ? `Sun ${arch.sun.elevation.toFixed(0)}° up, from the ${cardinal(arch.sun.azimuth)} (${arch.sun.azimuth.toFixed(0)}°). 21 ${MONTHS[arch.month]}, local solar time.`
              : `Sun below the horizon at ${formatHour(arch.hour)} on 21 ${MONTHS[arch.month]}.`}
          </p>
        </div>
      </Panel>

      {/* 4 — Zoning */}
      <Panel
        kicker="Zoning envelope"
        title="Compliance"
        index={3}
        action={
          <button
            onClick={() => arch.setZoning(!arch.zoning)}
            aria-pressed={arch.zoning}
            title="Show the height limit as a plane over the site"
            className={clsx("border px-2.5 py-1 text-[11px] transition-colors", arch.zoning ? "border-oak bg-oak/10 text-oak" : "border-plaster text-ash hover:text-ink")}
          >
            {arch.zoning ? "Plane on" : "Plane off"}
          </button>
        }
      >
        <div className="space-y-3">
          <RangeSlider compact label="Height limit" value={arch.heightLimitM} min={20} max={heightMax} step={5} display={`${arch.heightLimitM} m`} onChange={arch.setHeightLimitM} />
          <RangeSlider compact label="Max FAR" value={arch.farLimit} min={0.5} max={Math.max(20, Math.ceil(s.far * 2))} step={0.5} display={arch.farLimit.toFixed(1)} onChange={arch.setFarLimit} />
          <RangeSlider compact label="Max site coverage" value={arch.coverageLimit} min={10} max={100} step={5} display={`${arch.coverageLimit}%`} onChange={arch.setCoverageLimit} />
        </div>
        <table className="mt-4 w-full text-xs">
          <tbody className="divide-y divide-plaster">
            {s.buildings.map((b) => (
              <tr key={b.id}>
                <td className="py-1.5 text-ink">{b.short} height</td>
                <td className="py-1.5 text-right font-mono tabular-nums text-ash">{b.heightM.toFixed(1)} m</td>
                <td className="w-16 py-1.5 text-right">
                  <Status ok={b.heightM <= arch.heightLimitM} />
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-1.5 text-ink">Site FAR</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-ash">{s.far.toFixed(2)}</td>
              <td className="py-1.5 text-right">
                <Status ok={s.far <= arch.farLimit} />
              </td>
            </tr>
            <tr>
              <td className="py-1.5 text-ink">Site coverage</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-ash">{(s.coverage * 100).toFixed(1)}%</td>
              <td className="py-1.5 text-right">
                <Status ok={s.coverage * 100 <= arch.coverageLimit} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="caption mt-2">Illustrative limits for testing massing, not a code review.</p>
      </Panel>

      {/* 5 — Area schedule */}
      <Panel
        kicker="Area schedule"
        title="Areas & levels"
        index={4}
        action={
          <button onClick={downloadCsv} className="btn-secondary px-2.5 py-1 text-[11px]" aria-label="Download area schedule as CSV">
            <Download size={12} aria-hidden /> CSV
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Total GFA" value={`${fmtInt(s.gfaM2)} m²`} sub={`${fmtInt(s.gfaM2 * SQFT_PER_M2)} sf`} />
          <Metric label="FAR" value={s.far.toFixed(2)} sub={`Site ${fmtInt(s.siteAreaM2)} m²`} />
          <Metric label="Coverage" value={`${(s.coverage * 100).toFixed(1)}%`} sub="Ground-floor footprints" />
          <Metric label="Tallest" value={`${s.tallestM.toFixed(0)} m`} sub={s.buildings.reduce((a, b) => (b.heightM > a.heightM ? b : a)).short} />
        </div>
        <div className="mt-4 space-y-4">
          {s.buildings.map((b) => (
            <div key={b.id}>
              <p className="mb-1 flex items-baseline justify-between text-xs">
                <span className={clsx("font-medium", b.id === x.activeBuildingId ? "text-oak" : "text-ink")}>{b.name}</span>
                <span className="caption tabular-nums">
                  {b.floors} floors · {b.heightM.toFixed(1)} m · {fmtInt(b.gfaM2)} m²
                </span>
              </p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="caption text-left">
                    <th className="py-1 font-normal">Zone</th>
                    <th className="py-1 text-right font-normal">Fl.</th>
                    <th className="py-1 text-right font-normal">Levels</th>
                    <th className="py-1 text-right font-normal">F-F</th>
                    <th className="py-1 text-right font-normal">Plate</th>
                    <th className="py-1 text-right font-normal">GFA m²</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-plaster font-mono tabular-nums text-ash">
                  {b.zones.map((z) => (
                    <tr key={z.zone}>
                      <td className="py-1 font-sans text-ink">
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: ZONES[z.zone].accent }} />
                        {ZONES[z.zone].short}
                      </td>
                      <td className="py-1 text-right">{z.floors}</td>
                      <td className="py-1 text-right">
                        +{z.fromM.toFixed(0)}–{z.toM.toFixed(0)}
                      </td>
                      <td className="py-1 text-right">{z.f2fM.toFixed(2)}</td>
                      <td className="py-1 text-right">
                        {z.plateM[0].toFixed(0)}×{z.plateM[1].toFixed(0)}
                      </td>
                      <td className="py-1 text-right">{fmtInt(z.gfaM2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="caption mt-3">Levels in metres above grade. Plates are the first floor of each zone; GFA uses each plate&apos;s true outline.</p>
      </Panel>
    </div>
  );
}
