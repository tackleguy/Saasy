/**
 * KeyFacts — the project's headline numbers as a definition table.
 */
import type { Project } from "@/content/projects";
import { projectFloors } from "@/content/projects";
import { ZONE_ORDER, ZONES } from "@/lib/tower";
import { fmtNum } from "@/lib/format";

export default function KeyFacts({ project, units }: { project: Project; units: number }) {
  const rows: [string, string][] = [
    ["Site area", `${fmtNum(project.siteAreaSqFt)} sf`],
    ["Gross floor area", `${fmtNum(project.gfaSqFt)} sf`],
    ["Buildings", String(project.massing.length)],
    ["Floors", String(projectFloors(project))],
    ["Units (est.)", fmtNum(units)],
    ["Program mix", ZONE_ORDER.map((z) => `${ZONES[z].short} ${project.programMix[z]}%`).join(" · ")],
    ["Client", project.client],
    ["Architect", project.architect],
    ["Completion", project.completion],
  ];
  return (
    <dl className="grid grid-cols-1 border-t border-plaster sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-plaster py-2.5 sm:odd:pr-6 sm:even:pl-6">
          <dt className="caption shrink-0">{k}</dt>
          <dd className="text-right text-sm tabular-nums text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
