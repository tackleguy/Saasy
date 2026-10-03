"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, LoaderCircle, UploadCloud, X } from "lucide-react";
import type { Object3D } from "three";
import type { Building, YieldInputs } from "@/types";
import type { ProjectLocation } from "@/lib/geographicContext";
import { ACCEPTED, makeSampleStl, parseCadFile, type CadReport } from "@/lib/cadParser";
import { applyArchMaterials, normalizeImport } from "@/lib/importNormalize";
import { MODEL_PARTS, reviewModel, disposeModel, type ModelReview } from "@/lib/modelReview";
import SiteAddressFields from "./SiteAddressFields";
const ImportPreview = dynamic(() => import("@/components/3d/ImportPreview"), { ssr: false });
// Kept for clients which expose the import stages in their own UI.
export const INGESTION_STAGES = [
  { label: "Read geometry", from: 0, to: 25 }, { label: "Review scale and materials", from: 25, to: 55 },
  { label: "Choose an address", from: 55, to: 85 }, { label: "Place reviewed model", from: 85, to: 100 },
];
interface Props {
  open: boolean; onOpenChange: (open: boolean) => void; inputs: YieldInputs; building: Building;
  location?: ProjectLocation; onLocation?: (v: ProjectLocation) => boolean;
  onComplete: (model: Object3D | null) => void;
}
export default function CadUploadModal({ open, onOpenChange, onComplete, location: initialLocation, onLocation }: Props) {
  const [source, setSource] = useState<CadReport | null>(null);
  const [review, setReview] = useState<ModelReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState(1);
  const [axis, setAxis] = useState<"y" | "z">("y");
  const [location, setLocation] = useState<ProjectLocation | null>(initialLocation ?? null);
  const [heading, setHeading] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const transferred = useRef<Object3D | null>(null);
  useEffect(() => () => { if (source?.model && transferred.current !== source.model) disposeModel(source.model); }, [source]);
  useEffect(() => () => { run.current++; }, []);
  const prepared = useMemo(() => {
    if (!source?.model || review?.errors.length) return null;
    try { const normalized = normalizeImport(source.model.clone(true), { upHint: axis, metresPerUnit: unit }); normalized.root.rotation.y = -heading * Math.PI / 180; return normalized; }
    catch { return null; }
  }, [source, review, unit, axis, heading]);
  async function load(file?: File) {
    if (!file) return;
    if (file.size > 250 * 1024 * 1024) { setError("This file is over 250 MB. Export a smaller GLB with compressed textures."); return; }
    const id = ++run.current;
    setBusy(true); setError(""); setSource(null); setReview(null); setConfirmed(false);
    try {
      const report = await parseCadFile(file);
      if (id !== run.current) { if (report.model) disposeModel(report.model); return; }
      if (!report.model) throw new Error("This file contains no readable 3D geometry. Export the model as GLB, FBX, OBJ, STL, or 3D DXF.");
      const audit = reviewModel(report.model);
      setReview(audit); setSource(report);
      setUnit(report.metresPerUnit ?? 1);
      const suggested = audit.errors.length ? "Y" : normalizeImport(report.model.clone(true), { upHint: report.upHint === "y" ? "y" : "auto", metresPerUnit: report.metresPerUnit ?? 1 }).report.upAxis;
      setAxis(suggested === "Z" ? "z" : "y");
    } catch (e) { if (id === run.current) setError(e instanceof Error ? e.message : "Could not open this model."); }
    finally { if (id === run.current) setBusy(false); }
  }
  function complete() {
    if (!prepared || !confirmed || !location || review?.errors.length) return;
    if (onLocation && !onLocation(location)) { setError("This address could not be applied. Check the site location and try again."); return; }
    const model = prepared.root;
    const materials = applyArchMaterials(model);
    model.rotation.y = -heading * Math.PI / 180;
    model.userData = { ...model.userData, fileName: source?.fileName, review, normalization: prepared.report, materials, location,
      heading, reviewedAt: new Date().toISOString(), heightUnits: prepared.report.heightUnits };
    transferred.current = source!.model!;
    onComplete(model);
  }
  const control = "w-full rounded border border-plaster bg-paper px-3 py-2 text-sm text-ink focus-visible:ring-2 focus-visible:ring-oak";
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/50"/>
    <Dialog.Content aria-describedby="import-description" className="overlay thin-scroll fixed left-1/2 top-1/2 z-50 max-h-[94dvh] w-[min(1060px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded bg-paper p-5 sm:p-7">
      <div className="mb-5 flex items-start justify-between gap-4"><div><Dialog.Title className="font-serif text-3xl text-ink">Review your building</Dialog.Title><Dialog.Description id="import-description" className="mt-2 max-w-[65ch] text-sm text-ash">Inspect the geometry, keep its original materials, and place it at a real address. Missing interiors need an authored model or floor plan.</Dialog.Description></div><Dialog.Close aria-label="Close import review" className="p-2 text-ink hover:bg-stone"><X size={20}/></Dialog.Close></div>
      <input ref={fileInput} type="file" accept={ACCEPTED.join(",")} className="hidden" onChange={e => { void load(e.target.files?.[0]); e.target.value = ""; }}/>
      {!source && !busy && <button className={`flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded border border-dashed p-8 text-center text-ink ${dragging ? "border-oak bg-stone" : "border-plaster hover:bg-stone/50"}`} onClick={() => fileInput.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void load(e.dataTransfer.files[0]); }}><UploadCloud size={32} className="text-oak"/><span>Drop a building model, or choose a file</span><span className="max-w-[55ch] text-xs text-ash">GLB is best for preserving materials and textures. OBJ needs embedded geometry; separate texture files are not collected automatically.</span><span className="text-xs text-ash">GLB · glTF · FBX · OBJ · STL · DXF · up to 250 MB</span></button>}
      {!source && !busy && <button onClick={() => void load(makeSampleStl())} className="mt-3 text-sm text-oak underline underline-offset-4">Try a sample massing model</button>}
      {busy && <div role="status" className="flex min-h-56 items-center justify-center gap-3 text-ink"><LoaderCircle className="animate-spin" size={22}/> Reading geometry and reviewing materials…</div>}
      {source && <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div><div className="h-[280px] overflow-hidden rounded bg-stone sm:h-[380px]">{prepared ? <ImportPreview model={prepared.root} revision={`${source.fileName}-${unit}-${axis}`}/> : <p className="p-6 text-sm text-negative">The model cannot be previewed until its geometry is repaired.</p>}</div><p className="mt-2 text-xs text-ash">Drag to orbit. Scroll to inspect. Preview uses the original materials.</p><div className="mt-4 flex items-center justify-between gap-2"><p className="truncate text-sm text-ink">{source.fileName}</p><button onClick={() => fileInput.current?.click()} className="shrink-0 text-xs text-oak underline">Replace file</button></div>
          {review && <><dl className="mt-4 grid grid-cols-3 gap-3 border-y border-plaster py-4 text-sm">{[["Meshes", review.meshes.toLocaleString()], ["Triangles", Math.round(review.triangles).toLocaleString()], ["Textured finishes", `${review.textured} / ${review.materials}`]].map(([label, value]) => <div key={label}><dt className="text-xs text-ash">{label}</dt><dd className="mt-1 tabular-nums text-ink">{value}</dd></div>)}</dl><p className="mb-2 mt-4 text-sm text-ink">Interior inventory <span className="text-xs text-ash">· based on object names</span></p><dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs">{MODEL_PARTS.map(part => <div key={part} className="flex justify-between"><dt className="text-ash">{part}</dt><dd className={review.parts[part] ? "text-positive" : "text-ash"}>{review.parts[part] ? `${review.parts[part]} identified` : "Unidentified"}</dd></div>)}</dl>{review.issues.length > 0 && <ul className="mt-4 list-disc space-y-2 pl-4 text-xs leading-relaxed text-ash">{review.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</>}
        </div>
        <div className="space-y-5"><section><h3 className="mb-3 font-serif text-xl text-ink">Scale & orientation</h3><div className="grid grid-cols-3 gap-2"><label className="text-xs text-ash">Source units<select className={control} value={unit} onChange={e => { setUnit(Number(e.target.value)); setConfirmed(false); }}>{[{m:1,label:"Metres"},{m:.001,label:"Millimetres"},{m:.01,label:"Centimetres"},{m:.3048,label:"Feet"},{m:.0254,label:"Inches"}, ...(![1,.001,.01,.3048,.0254].includes(unit) ? [{m:unit,label:"File units"}] : [])].map(u => <option key={u.m} value={u.m}>{u.label}</option>)}</select></label><label className="text-xs text-ash">Up direction<select className={control} value={axis} onChange={e => { setAxis(e.target.value as "y"|"z"); setConfirmed(false); }}><option value="y">Y up</option><option value="z">Z up</option></select></label><label className="text-xs text-ash">Heading °<input className={control} type="number" min={0} max={360} value={heading} onChange={e => setHeading(Math.max(0,Math.min(360,Number(e.target.value))))}/></label></div>{prepared && <p className="mt-3 text-sm tabular-nums text-ink">{prepared.report.footprintM[0].toFixed(1)} × {prepared.report.footprintM[1].toFixed(1)} m footprint · {prepared.report.heightM.toFixed(1)} m high</p>}<p className="mt-1 text-xs text-ash">{source.metresPerUnit ? "The file declares its units. Confirm the measured size." : "This file does not declare units. Choose the units used when exporting."}</p></section>
          <section className="border-t border-plaster pt-4"><h3 className="mb-3 font-serif text-xl text-ink">Site address</h3><SiteAddressFields value={location} onChange={setLocation}/></section>
          <label className="flex items-start gap-2 border-t border-plaster pt-4 text-sm text-ink"><input type="checkbox" className="mt-1 accent-[#9C7A52]" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span>I checked the dimensions, orientation, and model contents. Unidentified details have not been invented.</span></label>
          <button onClick={complete} disabled={!prepared || !confirmed || !location || !!review?.errors.length} className="flex w-full items-center justify-center gap-2 rounded bg-ink px-4 py-3 text-sm text-paper hover:opacity-90 disabled:opacity-40"><Check size={16}/> Place reviewed model</button>
        </div>
      </div>}
      {(!!error || !!review?.errors.length) && <div role="alert" className="mt-4 space-y-1 text-sm text-negative">{error && <p>{error}</p>}{review?.errors.map(e => <p key={e}>{e}</p>)}</div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
