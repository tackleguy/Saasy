import clsx from "clsx";
import type { ProjectStatus } from "@/types";

const DOT: Record<ProjectStatus, string> = {
  Concept: "bg-ash",
  Approved: "bg-sage",
  "Under Construction": "bg-oak",
  Selling: "bg-positive",
};

/** Status label with a coloured dot. `tone="overlay"` sits on imagery. */
export default function StatusPill({ status, className, tone = "paper" }: { status: ProjectStatus; className?: string; tone?: "paper" | "overlay" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-1 text-[11px] font-medium leading-none",
        tone === "overlay" ? "bg-paper/90 text-ink backdrop-blur-sm" : "border border-plaster bg-paper text-ink",
        className
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", DOT[status])} aria-hidden />
      {status}
    </span>
  );
}
