"use client";
/**
 * Download the pro forma on screen as PDF or Excel. Posts the current inputs
 * so the file matches exactly what the viewer is looking at.
 */
import { useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";

export default function ExportButtons({ endpoint, body, compact = false }: { endpoint: string; body: Record<string, unknown>; compact?: boolean }) {
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const [error, setError] = useState("");
  const download = async (format: "pdf" | "xlsx") => {
    if (busy) return;
    setBusy(format); setError("");
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, format }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Export failed.");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `pro-forma.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally { setBusy(null); }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void download("pdf")} className="btn-secondary py-2 text-xs" aria-label="Download pro forma as PDF" aria-busy={busy === "pdf"} disabled={!!busy}>
        <FileDown size={14} aria-hidden />
        <span className={compact ? "hidden sm:inline" : ""}>{busy === "pdf" ? "Preparing…" : "PDF"}</span>
      </button>
      <button type="button" onClick={() => void download("xlsx")} className="btn-secondary py-2 text-xs" aria-label="Download pro forma and stacking plan as Excel" aria-busy={busy === "xlsx"} disabled={!!busy}>
        <FileSpreadsheet size={14} aria-hidden />
        <span className={compact ? "hidden sm:inline" : ""}>{busy === "xlsx" ? "Preparing…" : "Excel"}</span>
      </button>
      {error && <span role="alert" className="text-xs text-negative">{error}</span>}
    </span>
  );
}
