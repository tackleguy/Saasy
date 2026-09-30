"use client";
/**
 * CadUploadModal — drag-and-drop CAD ingestion with a simulated pipeline.
 * -----------------------------------------------------------------------------
 * Accepts .stl, .dwg and .dxf. Dropping a file runs a 4-stage ingestion
 * pipeline with animated progress bars and a live status terminal:
 *
 *   1.  0 – 25%  Parsing CAD Layer Vectors & Mesh Topologies…
 *   2. 25 – 55%  Extracting Floor Boundaries & Structural Cores…
 *   3. 55 – 85%  Generating Procedural Furniture Grids & Spatial Volumes…
 *   4. 85 – 100% Compiling WebGL glTF Scene & Linking Financial Pro Forma…
 *
 * Stage 1 is partly real: `parseCadFile` reads the file locally (STL
 * triangles/bounds, DXF entities/layers, DWG release) and those facts are
 * streamed into the terminal. Stages 2–4 are a scripted simulation.
 * Nothing leaves the browser.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileBox, Sparkles, Terminal, UploadCloud, X } from "lucide-react";
import clsx from "clsx";
import type { Building, IngestionStage, YieldInputs } from "@/types";
import { ACCEPTED, makeSampleStl, parseCadFile, type CadReport } from "@/lib/cadParser";
import { fmtNum } from "@/lib/format";

export const INGESTION_STAGES: IngestionStage[] = [
  { label: "Parsing CAD Layer Vectors & Mesh Topologies...", from: 0, to: 25 },
  { label: "Extracting Floor Boundaries & Structural Cores...", from: 25, to: 55 },
  { label: "Generating Procedural Furniture Grids & Spatial Volumes...", from: 55, to: 85 },
  { label: "Compiling WebGL glTF Scene & Linking Financial Pro Forma...", from: 85, to: 100 },
];

/** Wall-clock duration of each stage, ms. */
const STAGE_MS = [1700, 2100, 1900, 1500];

type Phase = "idle" | "running" | "done" | "error";

interface TerminalLine {
  id: number;
  text: string;
  tone: "cmd" | "ok" | "info" | "warn";
}

/** A line scheduled to print at a fraction (0 – 1) of a given stage. */
interface ScriptLine {
  stage: number;
  at: number;
  text: string;
  tone: TerminalLine["tone"];
}

/** Build the terminal script for a parsed file. */
function buildScript(report: CadReport, inputs: YieldInputs, building: Building): ScriptLine[] {
  const floors = building.floors.length;
  const officeFloors = building.floors.filter((f) => f.zone === "office").length;
  const resiFloors = building.floors.filter((f) => f.zone === "residential").length;
  return [
    { stage: 0, at: 0, text: `aura ingest ./${report.fileName}`, tone: "cmd" },
    { stage: 0, at: 0.15, text: `Format ${report.format} · ${report.sizeKb.toFixed(1)} KB · decoded locally`, tone: "info" },
    ...report.facts.map((f, i) => ({ stage: 0, at: 0.35 + i * 0.15, text: `${f.label}: ${f.value}`, tone: "ok" as const })),
    { stage: 1, at: 0.1, text: "Slicing volume on Z-axis at storey intervals", tone: "info" },
    {
      stage: 1,
      at: 0.45,
      text: report.estimatedFloors
        ? `Model suggests ~${report.estimatedFloors} storeys → mapped to ${building.name} (${floors} floors)`
        : `Mapped geometry to ${building.name} (${floors} floors)`,
      tone: "ok",
    },
    { stage: 1, at: 0.75, text: "Lift & stair core located · 4 zones classified (podium / office / residential / crown)", tone: "ok" },
    { stage: 2, at: 0.1, text: `Office fit-out: desk clusters, conference suite, kitchen × ${officeFloors} floors`, tone: "info" },
    { stage: 2, at: 0.45, text: `Residential fit-out: 4 apartments (living, kitchen, dining, bedroom) × ${resiFloors} floors`, tone: "info" },
    { stage: 2, at: 0.8, text: `Spatial volumes computed · twist ${building.twistDeg}°/floor applied`, tone: "ok" },
    { stage: 3, at: 0.1, text: `glTF scene compiled · ${floors} nodes · 4 PBR materials`, tone: "ok" },
    {
      stage: 3,
      at: 0.55,
      text: `Pro forma linked · ${fmtNum(inputs.totalBuildableSqFt)} sf · hard cost $${fmtNum(inputs.hardCostPerSqFt)}/sf · ${inputs.ltcPct}% LTC`,
      tone: "ok",
    },
    { stage: 3, at: 0.95, text: "Ingestion complete ✓", tone: "ok" },
  ];
}

/** Progress (0–100) → per-stage completion (0–1). */
function stageProgress(progress: number, s: IngestionStage) {
  return Math.min(1, Math.max(0, (progress - s.from) / (s.to - s.from)));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current pro-forma inputs (echoed in the terminal). */
  inputs: YieldInputs;
  /** Building the model is mapped onto. */
  building: Building;
  /** Called when the user opens the ingested model in the explorer. */
  onComplete: () => void;
}

export default function CadUploadModal({ open, onOpenChange, inputs, building, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const runId = useRef(0);

  /** Cancel any running pipeline animation. */
  const cancel = useCallback(() => {
    runId.current++;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  const resetState = useCallback(() => {
    cancel();
    setPhase("idle");
    setProgress(0);
    setLines([]);
    setFileName(null);
    setError(null);
  }, [cancel]);

  // Reset shortly after closing (after the exit animation) and on unmount.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(resetState, 250);
    return () => clearTimeout(t);
  }, [open, resetState]);
  useEffect(() => cancel, [cancel]);

  // Keep the terminal scrolled to the newest line.
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const handleFile = useCallback(
    async (file?: File) => {
      if (!file) return;
      cancel();
      const id = runId.current;
      const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();

      setFileName(file.name);
      setLines([]);
      setProgress(0);
      setError(null);

      if (!ACCEPTED.includes(ext)) {
        setPhase("error");
        setError(`Unsupported file type "${ext}". Please drop a ${ACCEPTED.join(", ")} file.`);
        return;
      }

      setPhase("running");
      let report: CadReport;
      try {
        report = await parseCadFile(file);
      } catch (e) {
        if (id !== runId.current) return;
        setPhase("error");
        setError(e instanceof Error ? e.message : "Could not read that file.");
        return;
      }
      if (id !== runId.current) return; // superseded or closed

      // Drive progress + terminal output from a single rAF clock.
      const script = buildScript(report, inputs, building);
      const totalMs = STAGE_MS.reduce((a, b) => a + b, 0);
      let printed = 0;
      let lineId = 0;
      const start = performance.now();

      const tick = (now: number) => {
        if (id !== runId.current) return;
        const elapsed = now - start;

        // Which stage are we in, and how far through it?
        let acc = 0;
        let stage = STAGE_MS.length - 1;
        let within = 1;
        for (let i = 0; i < STAGE_MS.length; i++) {
          if (elapsed < acc + STAGE_MS[i]) {
            stage = i;
            within = (elapsed - acc) / STAGE_MS[i];
            break;
          }
          acc += STAGE_MS[i];
        }
        const s = INGESTION_STAGES[stage];
        const eased = within < 0.5 ? 2 * within * within : 1 - Math.pow(-2 * within + 2, 2) / 2;
        const p = elapsed >= totalMs ? 100 : s.from + (s.to - s.from) * eased;
        setProgress(p);

        // Print every script line whose time has come.
        const due: TerminalLine[] = [];
        while (printed < script.length) {
          const l = script[printed];
          if (l.stage < stage || (l.stage === stage && l.at <= within) || elapsed >= totalMs) {
            due.push({ id: lineId++, text: l.text, tone: l.tone });
            printed++;
          } else break;
        }
        if (due.length) setLines((prev) => [...prev, ...due]);

        if (elapsed >= totalMs) {
          setPhase("done");
          raf.current = null;
          return;
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [cancel, inputs, building]
  );

  const activeStage = INGESTION_STAGES.findIndex((s) => progress < s.to);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
              <Dialog.Content asChild aria-describedby="cad-desc">
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.98 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overlay thin-scroll pointer-events-auto max-h-[92dvh] w-full max-w-[600px] overflow-y-auto rounded-[3px] bg-paper p-5  sm:p-6"
                >
                  {/* Header */}
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="caption mb-1 text-oak">Automated Ingestion</p>
                      <Dialog.Title className="font-serif text-3xl text-ink">Import CAD Model</Dialog.Title>
                      <Dialog.Description id="cad-desc" className="mt-1 text-sm text-ash">
                        Drop a massing model and AURA parses it into floor plates, furniture grids and a live pro forma.
                      </Dialog.Description>
                    </div>
                    <Dialog.Close className="rounded-full p-1.5 text-ash transition hover:bg-stone hover:text-ink" aria-label="Close">
                      <X size={18} />
                    </Dialog.Close>
                  </div>

                  {/* Dropzone (idle / error) */}
                  {(phase === "idle" || phase === "error") && (
                    <>
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          handleFile(e.dataTransfer.files?.[0]);
                        }}
                        onClick={() => inputRef.current?.click()}
                        className={clsx(
                          "group flex cursor-pointer flex-col items-center justify-center rounded-[3px] border border-dashed px-6 py-10 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50",
                          dragging ? "scale-[1.01] border-oak bg-oak/[0.07]" : "border-plaster hover:border-oak/50 hover:bg-stone/40"
                        )}
                      >
                        <input
                          ref={inputRef}
                          type="file"
                          accept={ACCEPTED.join(",")}
                          className="hidden"
                          onChange={(e) => {
                            handleFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                        <motion.div animate={dragging ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }}>
                          <UploadCloud className="mb-3 text-oak" size={34} />
                        </motion.div>
                        <p className="text-sm text-ink">Drag & drop your CAD file, or click to browse</p>
                        <div className="mt-3 flex gap-1.5">
                          {ACCEPTED.map((ext) => (
                            <span key={ext} className="rounded-md border border-plaster bg-stone/50 px-2 py-0.5 font-mono text-[11px] text-ash">
                              {ext}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => handleFile(makeSampleStl())}
                        className="mx-auto mt-3 flex items-center gap-1.5 text-xs text-ash underline-offset-4 transition hover:text-oak hover:underline"
                      >
                        <Sparkles size={12} /> No file handy? Run the pipeline on a sample tower
                      </button>
                      {error && (
                        <p className="mt-3 flex items-center gap-2 rounded-[3px] border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
                          <AlertTriangle size={14} className="shrink-0" /> {error}
                        </p>
                      )}
                    </>
                  )}

                  {/* Pipeline (running / done) */}
                  {(phase === "running" || phase === "done") && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-ink">
                        <FileBox size={16} className="text-oak" />
                        <span className="truncate">{fileName}</span>
                        <span className="ml-auto font-serif text-2xl tabular-nums text-ink">{Math.round(progress)}%</span>
                      </div>

                      {/* Overall bar */}
                      <div className="h-1.5 overflow-hidden rounded-full bg-stone">
                        <div
                          className="h-full rounded-full bg-ink"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      {/* Per-stage bars */}
                      <ol className="space-y-2.5">
                        {INGESTION_STAGES.map((s, i) => {
                          const sp = stageProgress(progress, s);
                          const done = sp >= 1;
                          const active = i === activeStage && phase === "running";
                          return (
                            <li key={s.label} className={clsx("transition-opacity", !done && !active && "opacity-40")}>
                              <div className="mb-1 flex items-center gap-2 text-xs">
                                <span
                                  className={clsx(
                                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px]",
                                    done ? "border-positive bg-positive/15 text-positive" : active ? "border-oak text-oak" : "border-plaster text-ash/80"
                                  )}
                                >
                                  {done ? "✓" : i + 1}
                                </span>
                                <span className={done ? "text-ink/80" : active ? "text-ink" : "text-ash/80"}>{s.label}</span>
                                <span className="ml-auto font-mono text-[10px] tabular-nums text-ash/80">
                                  {s.from}–{s.to}%
                                </span>
                              </div>
                              <div className="ml-6 h-1 overflow-hidden rounded-full bg-stone">
                                <div
                                  className={clsx("h-full rounded-full", done ? "bg-positive/70" : "bg-ink")}
                                  style={{ width: `${sp * 100}%` }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ol>

                      {/* Status terminal */}
                      <div className="overflow-hidden rounded-[3px] border border-plaster bg-ink">
                        <div className="flex items-center gap-2 border-b border-plaster px-3 py-1.5 text-[10px] text-ash/80">
                          <Terminal size={11} /> aura-ingest
                          {phase === "running" && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />}
                        </div>
                        <div ref={terminalRef} className="thin-scroll h-40 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
                          {lines.map((l) => (
                            <motion.div
                              key={l.id}
                              initial={{ opacity: 0, x: -4 }}
                              animate={{ opacity: 1, x: 0 }}
                              className={clsx(
                                l.tone === "cmd" && "text-oak",
                                l.tone === "ok" && "text-positive",
                                l.tone === "info" && "text-ash",
                                l.tone === "warn" && "text-negative"
                              )}
                            >
                              {l.tone === "cmd" ? "$ " : l.tone === "ok" ? "✓ " : "› "}
                              {l.text}
                            </motion.div>
                          ))}
                          {phase === "running" && <span className="inline-block h-3 w-1.5 animate-pulse bg-oak/70 align-middle" />}
                        </div>
                      </div>

                      {/* Completion */}
                      <AnimatePresence>
                        {phase === "done" && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col gap-3 rounded-[3px] border border-positive/30 bg-positive/10 p-4 sm:flex-row sm:items-center"
                          >
                            <div className="flex items-center gap-2.5">
                              <CheckCircle2 size={22} className="shrink-0 text-positive" />
                              <div>
                                <p className="text-sm text-ink">Model ready</p>
                                <p className="text-xs text-ash">Linked to the live pro forma.</p>
                              </div>
                            </div>
                            <div className="flex gap-2 sm:ml-auto">
                              <button
                                onClick={resetState}
                                className="rounded-[3px] border border-plaster px-3 py-2 text-xs text-ink/80 transition hover:border-oak/40 hover:text-ink"
                              >
                                Ingest another
                              </button>
                              <button
                                onClick={onComplete}
                                className="rounded-[3px] bg-ink px-4 py-2 text-xs font-semibold text-paper transition hover:brightness-110"
                              >
                                Open in Explorer
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <p className="mt-5 text-center text-[10px] text-ash/80">
                    Files are read locally · geometry reconstruction is a simulated preview
                  </p>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
