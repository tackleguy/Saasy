import clsx from "clsx";
import type { ProjectStatus } from "@/types";

const DOT: Record<ProjectStatus, string> = {
  Concept: "bg-ash",
  Approved: "bg-sage",
  "Under Construction": "bg-oak",
  Selling: "bg-positive",
};

/** Small outlined status label with a coloured dot. */
export default function StatusPill({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap border border-plaster bg-paper px-2 py-0.5 text-[11px] text-ink", className)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", DOT[status])} aria-hidden />
      {status}
    </span>
  );
}
