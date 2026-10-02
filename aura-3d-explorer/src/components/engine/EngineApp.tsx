"use client";
/**
 * EngineApp — the Aura Engine page.
 * -----------------------------------------------------------------------------
 * Drop a plan (DXF, CAD JSON, AuraScene JSON, or a blueprint image / PDF),
 * see it staged in 3D, and copy / download the engine-ready scene JSON.
 * Vector input runs entirely in the browser (lib/engine); images and PDFs go
 * to /api/engine, which needs a vision model.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { AlertTriangle, Check, Copy, Download, FileJson, FileUp, Layers, Loader2, Sparkles, Tag } from "lucide-react";
import { runEngine, type EngineResult } from "@/lib/engine";
import { area } from "@/lib/engine/geometry";
import { FLOORING } from "@/lib/engine/catalog";
import { apartmentDxf, studioCadJson } from "@/lib/engine/samples";

const EngineViewer = dynamic(() => import("./EngineViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-ash">
      <Loader2 className="mr-2 animate-spin" size={16} /> Loading 3D…
    </div>
  ),
});

const SAMPLES = [
  { id: "dxf", label: "2-bed apartment", file: "aura-sample-apartment.dxf", make: apartmentDxf, note: "DXF · mm · room boundaries" },
  { id: "json", label: "1-bed with L-shaped living", file: "aura-sample-studio.json", make: studioCadJson, note: "CAD JSON · wall lines + door gaps" },
] as const;

const TEXT_EXT = ["dxf", "json", "txt", "geojson"];
const RASTER: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };

type Vision = { provider: string; model: string; pdf: boolean } | null;

function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export default function EngineApp() {
  const [result, setResult] = useState<EngineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [vision, setVision] = useState<Vision | undefined>(undefined);
  const [cutaway, setCutaway] = useState(true);
  const [labels, setLabels] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const runText = useCallback((name: string, text: string) => {
    setError(null);
    try {
      const r = runEngine(name, text);
      if (!r.scene.rooms.length) throw new Error(r.report.warnings[0] ?? "No rooms found in this plan.");
      setResult(r);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Open on the apartment sample so there is always something to look at.
  useEffect(() => {
    runText(SAMPLES[0].file, SAMPLES[0].make());
    fetch("/api/engine")
      .then((r) => (r.ok ? r.json() : { vision: null }))
      .then((d: { vision: Vision }) => setVision(d.vision))
      .catch(() => setVision(null));
  }, [runText]);

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      setError(null);
      if (ext === "dwg") {
        setError("DWG is a closed binary format. Export the plan as DXF (File → Save As → DXF) and drop that in instead.");
        return;
      }
      if (TEXT_EXT.includes(ext) || file.type === "application/json") {
        setBusy(`Parsing ${file.name}…`);
        try {
          runText(file.name, await file.text());
        } finally {
          setBusy(null);
        }
        return;
      }
      const mediaType = RASTER[ext] ?? file.type;
      if (!Object.values(RASTER).includes(mediaType)) {
        setError(`Unsupported file "${file.name}". Use DXF, CAD JSON, PNG, JPEG, WebP or PDF.`);
        return;
      }
      if (file.size > 16 * 1024 * 1024) {
        setError("That file is over 16 MB.");
        return;
      }
      setBusy(`Reading ${file.name} with ${vision?.model ?? "the vision model"}…`);
      try {
        const res = await fetch("/api/engine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mediaType, data: await toBase64(file) }),
        });
        const data = (await res.json().catch(() => ({ error: `Server error ${res.status}` }))) as EngineResult & { error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `Server error ${res.status}`);
        setResult(data);
        setSelected(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [runText, vision]
  );

  // Pretty JSON, but keep number tuples ([x, z], position, rotation…) on one line.
  const json = useMemo(
    () => (result ? JSON.stringify(result.scene, null, 2).replace(/\[\s+(-?[\d.e+-]+(?:,\s+-?[\d.e+-]+)*)\s+\]/g, (_, inner: string) => `[${inner.replace(/,\s+/g, ", ")}]`) : ""),
    [result]
  );
  const scene = result?.scene;
  const report = result?.report;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the download still works */
    }
  };

  return (
    <div className="shell pb-20 pt-10 sm:pt-14">
      {/* Heading */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <p className="caption flex items-center gap-1.5 text-oak">
            <Sparkles size={13} aria-hidden /> Aura Engine
          </p>
          <h1 className="mt-2 font-serif text-[44px] leading-[1.02] tracking-display text-ink sm:text-[56px]">
            Floor plans in, <em className="italic text-oak">staged</em> 3D out.
          </h1>
        </div>
        <p className="max-w-xl text-[15px] leading-relaxed text-ink/75 lg:col-span-5">
          Drop a DXF, CAD JSON or blueprint. The engine reads room boundaries, labels and ceiling heights, classifies each room, stages real-size furniture with walkway
          clearances, and hands back engine-ready scene JSON for React Three Fiber.
        </p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        {/* Left: input + report */}
        <div className="flex flex-col gap-4 lg:col-span-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={clsx("rounded-[3px] border border-dashed p-5 transition-colors", dragging ? "border-oak bg-oak/10" : "border-plaster bg-stone/50")}
          >
            <div className="flex items-start gap-3">
              <FileUp className="mt-0.5 shrink-0 text-oak" size={20} aria-hidden />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-ink">Drop a floor plan</p>
                <p className="mt-0.5 text-[13px] text-ash">.dxf · CAD / scene .json · .png .jpg .webp · .pdf</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => fileInput.current?.click()} disabled={!!busy}>
                Choose file
              </button>
              <button className="btn-secondary" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>
                <FileJson size={14} aria-hidden /> Paste JSON
              </button>
              <input
                ref={fileInput}
                type="file"
                aria-label="Floor plan file"
                className="hidden"
                accept=".dxf,.dwg,.json,.geojson,.txt,.png,.jpg,.jpeg,.webp,.gif,.pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            {pasteOpen && (
              <div className="mt-3">
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={7}
                  spellCheck={false}
                  placeholder={'{ "units": "m", "rooms": [{ "name": "Living Room", "polygon": [[0,0],[6,0],[6,4],[0,4]] }] }'}
                  className="thin-scroll w-full rounded-[3px] border border-plaster bg-paper p-2.5 font-mono text-[12px] text-ink focus:border-oak focus:outline-none"
                />
                <button className="btn-primary mt-2" onClick={() => runText("pasted.json", paste)} disabled={!paste.trim()}>
                  Run engine
                </button>
              </div>
            )}
            <p className="mt-4 text-[12px] leading-relaxed text-ash">
              {vision === undefined
                ? "Checking for a vision model…"
                : vision
                  ? `Blueprint images${vision.pdf ? " and PDFs" : ""} are read by ${vision.model} (${vision.provider === "anthropic" ? "Anthropic API" : "local Ollama"}).`
                  : "DXF and JSON run in your browser. Blueprint images need a vision model: set ANTHROPIC_API_KEY or `ollama pull llama3.2-vision`."}
            </p>
          </div>

          <div className="rounded-[3px] border border-plaster bg-paper p-4">
            <p className="caption">Samples</p>
            <ul className="mt-2 divide-y divide-plaster">
              {SAMPLES.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <button className="min-w-0 text-left" onClick={() => runText(s.file, s.make())}>
                    <span className={clsx("block text-[14px] hover:text-oak", report?.source === s.file ? "text-oak" : "text-ink")}>{s.label}</span>
                    <span className="block text-[12px] text-ash">{s.note}</span>
                  </button>
                  <button className="btn-ghost shrink-0 !px-2" onClick={() => download(s.file, s.make(), "text/plain")} aria-label={`Download ${s.file}`} title={`Download ${s.file}`}>
                    <Download size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {(busy || error) && (
            <div className={clsx("rounded-[3px] border p-3 text-[13px]", error ? "border-negative/40 bg-negative/5 text-ink" : "border-plaster bg-stone/50 text-ink")} role={error ? "alert" : "status"}>
              {busy ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-oak" /> {busy}
                </span>
              ) : (
                <span className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-negative" /> {error}
                </span>
              )}
            </div>
          )}

          {report && (
            <div className="rounded-[3px] border border-plaster bg-paper p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="caption">Engine report</p>
                <p className="truncate text-[12px] text-ash" title={report.source}>
                  {report.source}
                </p>
              </div>
              <dl className="mt-2 space-y-1.5 text-[13px]">
                {report.facts.map((f) => (
                  <div key={f.label} className="grid grid-cols-[88px_1fr] gap-2">
                    <dt className="text-ash">{f.label}</dt>
                    <dd className="text-ink">{f.value}</dd>
                  </div>
                ))}
              </dl>
              {report.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-plaster pt-3 text-[12px] text-ink/80">
                  {report.warnings.map((w) => (
                    <li key={w} className="flex gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-oak" /> {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Right: viewer + rooms */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          <div className="relative h-[440px] overflow-hidden rounded-[3px] border border-plaster bg-stone sm:h-[560px]">
            {scene && scene.rooms.length > 0 ? (
              <EngineViewer scene={scene} openings={report?.openings ?? []} cutaway={cutaway} labels={labels} selected={selected} onSelect={setSelected} />
            ) : (
              <div className="flex h-full items-center justify-center text-ash">No scene yet</div>
            )}
            {scene && (
              <>
                <div className="overlay absolute left-3 top-3 flex gap-1 rounded-[3px] p-1">
                  <button className={clsx("flex items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 text-[12px]", cutaway ? "bg-ink text-paper" : "text-ink hover:bg-stone")} onClick={() => setCutaway(true)}>
                    <Layers size={12} aria-hidden /> Cutaway
                  </button>
                  <button className={clsx("rounded-[2px] px-2.5 py-1.5 text-[12px]", !cutaway ? "bg-ink text-paper" : "text-ink hover:bg-stone")} onClick={() => setCutaway(false)}>
                    Full height
                  </button>
                  <button className={clsx("flex items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 text-[12px]", labels ? "bg-ink text-paper" : "text-ink hover:bg-stone")} onClick={() => setLabels((v) => !v)} aria-pressed={labels}>
                    <Tag size={12} aria-hidden /> Labels
                  </button>
                </div>
                <div className="overlay absolute bottom-3 right-3 rounded-[3px] px-3 py-2 text-right">
                  <p className="font-serif text-2xl leading-none text-ink">{scene.projectInfo.totalSquareFeet.toLocaleString("en-US")} sf</p>
                  <p className="mt-1 text-[11px] text-ash">
                    {scene.rooms.length} rooms · {scene.projectInfo.unitsCount} unit{scene.projectInfo.unitsCount === 1 ? "" : "s"} · CH {scene.projectInfo.defaultCeilingHeight} m
                  </p>
                </div>
              </>
            )}
          </div>

          {scene && (
            <div className="overflow-x-auto rounded-[3px] border border-plaster bg-paper">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-plaster text-left text-ash">
                    <th className="px-3 py-2 font-normal">Room</th>
                    <th className="px-3 py-2 text-right font-normal">Area</th>
                    <th className="px-3 py-2 text-right font-normal">Ceiling</th>
                    <th className="px-3 py-2 font-normal">Flooring</th>
                    <th className="px-3 py-2 font-normal">Staged</th>
                  </tr>
                </thead>
                <tbody>
                  {scene.rooms.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(selected === r.id ? null : r.id)}
                      className={clsx("cursor-pointer border-b border-plaster/60 last:border-0", selected === r.id ? "bg-oak/10" : "hover:bg-stone/60")}
                    >
                      <td className="px-3 py-2 text-ink">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{area(r.polygon).toFixed(1)} m²</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{r.ceilingHeight.toFixed(2)} m</td>
                      <td className="px-3 py-2 text-ink/80">{FLOORING[r.flooring.type]?.label ?? r.flooring.type}</td>
                      <td className="px-3 py-2 text-ink/80">{r.furniture.length ? r.furniture.map((f) => f.modelId).filter((v, i, a) => a.indexOf(v) === i).join(", ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Output JSON */}
      {scene && (
        <div className="mt-4 rounded-[3px] border border-plaster bg-paper">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-plaster px-4 py-2.5">
            <p className="caption">Scene JSON · {Math.round(json.length / 1024)} KB</p>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={copy}>
                {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? "Copied" : "Copy"}
              </button>
              <button className="btn-primary" onClick={() => download("aura-scene.json", json)}>
                <Download size={14} aria-hidden /> Download
              </button>
            </div>
          </div>
          <pre className="thin-scroll max-h-[420px] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-ink/85">{json}</pre>
        </div>
      )}
    </div>
  );
}
