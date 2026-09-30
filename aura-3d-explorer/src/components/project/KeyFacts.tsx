/**
 * KeyFacts — the project's spec sheet.
 * Four headline figures set large, the programme mix as a proportional bar
 * (zone colours match the 3D model), and the remaining particulars as a
 * hairline definition list.
 */
import type { Project } from "@/content/projects";
import { projectFloors } from "@/content/projects";
import { ZONE_ORDER, ZONES } from "@/lib/tower";
import { fmtNum } from "@/lib/format";

export default function KeyFacts({ project, units }: { project: Project; units: number }) {
  const headline: [string, string, string?][] = [
    ["Gross floor area", fmtNum(project.gfaSqFt), "sf"],
    ["Floors", String(projectFloors(project))],
    ["Units (est.)", fmtNum(units)],
    ["Completion", project.completion],
  ];
  const rows: [string, string][] = [
    ["Site area", `${fmtNum(project.siteAreaSqFt)} sf`],
    ["Buildings", String(project.massing.length)],
    ["Client", project.client],
    ["Architect", project.architect],
    ["Location", project.city],
    ["Status", project.status],
  ];
  const mix = ZONE_ORDER.filter((z) => (project.programMix[z] ?? 0) > 0);

  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-t border-ink pt-6 sm:grid-cols-4">
        {headline.map(([k, v, unit]) => (
          <div key={k}>
            <dt className="text-xs text-ash">{k}</dt>
            <dd className="mt-1 font-serif text-[40px] leading-none tabular-nums text-ink">
              {v}
              {unit && <span className="ml-1 font-sans text-sm text-ash">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-10">
        <p className="text-xs text-ash">Programme mix</p>
        <div className="mt-3 flex h-2 w-full overflow-hidden bg-stone" aria-hidden>
          {mix.map((z) => (
            <span key={z} style={{ width: `${project.programMix[z]}%`, background: ZONES[z].accent }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-ink">
          {mix.map((z) => (
            <li key={z} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: ZONES[z].accent }} aria-hidden />
              {ZONES[z].short} <span className="tabular-nums text-ash">{project.programMix[z]}%</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="mt-10 grid grid-cols-1 border-t border-plaster sm:grid-cols-2 sm:gap-x-8">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-plaster py-3">
            <dt className="shrink-0 text-[13px] text-ash">{k}</dt>
            <dd className="text-right text-sm tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
