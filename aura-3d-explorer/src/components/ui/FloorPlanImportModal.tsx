"use client";
/**
 * FloorPlanImportModal — the required floor-plan import for a project.
 * -----------------------------------------------------------------------------
 * DXF and CAD JSON are read in the browser by the Aura Engine. A blueprint
 * image or PDF is sent to /api/engine, which asks a vision model to extract
 * the rooms. Either way the result is an engine scene: room polygons plus
 * the furniture staged inside them. Nothing about the tower's pro forma
 * changes; the plan becomes the floor design.
 */
import { useCallback, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { FileBox, UploadCloud, X } from "lucide-react";
import clsx from "clsx";
import type { Building } from "@/types";
import { runEngine } from "@/lib/engine";
import { apartmentDxf } from "@/lib/engine/samples";
import type { ProjectFloorPlan } from "@/lib/projectFloorPlan";
import { planSummary } from "@/lib/projectFloorPlan";

const TEXT_EXT = ["dxf", "json", "txt", "geojson"];
const RASTER: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building: Building;
  /** Replace the plan already imported for this building, if any. */
  existing?: ProjectFloorPlan | null;
  onComplete: (plan: ProjectFloorPlan) => void;
}

export default function FloorPlanImportModal({ open, onOpenChange, building, existing, onComplete }: Props) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProjectFloorPlan | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    (fileName: string, text?: string, result?: ProjectFloorPlan["result"]) => {
      const built = result ?? runEngine(fileName, text ?? "");
      if (!built.scene.rooms.length) throw new Error(built.report.warnings[0] ?? "No rooms found in this floor plan.");
      const plan: ProjectFloorPlan = {
        id: `fp-${Math.random().toString(36).slice(2, 10)}`,
        fileName,
        buildingId: building.id,
        result: built,
      };
      setPreview(plan);
      setError(null);
    },
    [building.id]
  );

  const handleFile = useCallback(
    async (file?: File) => {
      if (!file) return;
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      setError(null);
      setPreview(null);
      if (ext === "dwg") {
        setError("DWG is a closed binary format. Export the plan as DXF and drop that in.");
        return;
      }
      try {
        if (TEXT_EXT.includes(ext) || file.type === "application/json") {
          setBusy(`Reading ${file.name}…`);
          accept(file.name, await file.text());
          return;
        }
        const mediaType = RASTER[ext] ?? file.type;
        if (!Object.values(RASTER).includes(mediaType)) {
          setError(`Unsupported file "${file.name}". Use a DXF, CAD JSON, PNG, JPEG, WebP or PDF floor plan.`);
          return;
        }
        if (file.size > 16 * 1024 * 1024) {
          setError("That file is over 16 MB.");
          return;
        }
        setBusy(`Reading ${file.name}…`);
        const res = await fetch("/api/engine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mediaType, data: await toBase64(file) }),
        });
        const data = (await res.json().catch(() => ({ error: `Server error ${res.status}` }))) as ProjectFloorPlan["result"] & { error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `Server error ${res.status}`);
        accept(file.name, undefined, data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [accept]
  );

  const useSample = () => {
    setBusy(null);
    try {
      accept("aura-sample-apartment.dxf", apartmentDxf());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
              <Dialog.Content asChild aria-describedby="plan-desc">
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.98 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overlay thin-scroll pointer-events-auto max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-[3px] bg-paper p-5 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="caption text-oak">Required for this project</p>
                      <Dialog.Title className="font-serif text-2xl text-ink">Floor plan</Dialog.Title>
                    </div>
                    <Dialog.Close className="rounded-full p-1 text-ash transition hover:bg-stone hover:text-ink" aria-label="Close">
                      <X size={16} />
                    </Dialog.Close>
                  </div>
                  <Dialog.Description id="plan-desc" className="mt-2 text-sm leading-relaxed text-ash">
                    AURA designs the apartments in {building.short ?? building.name} from this drawing — rooms, doors and furniture — instead of a generic layout. DXF is read on this machine. A scan or PDF needs the vision model.
                  </Dialog.Description>

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
                      void handleFile(e.dataTransfer.files?.[0]);
                    }}
                    onClick={() => inputRef.current?.click()}
                    className={clsx(
                      "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[3px] border border-dashed px-6 py-8 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/50",
                      dragging ? "border-oak bg-oak/[0.07]" : "border-plaster hover:border-oak/50 hover:bg-stone/40"
                    )}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".dxf,.json,.png,.jpg,.jpeg,.webp,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        void handleFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <UploadCloud className="mb-2 text-oak" size={28} />
                    <p className="text-sm text-ink">{busy ?? "Drop a floor plan, or click to browse"}</p>
                    <p className="mt-1 font-mono text-[10px] text-ash">DXF · JSON · PNG · JPEG · PDF</p>
                  </div>

                  {error && <p className="mt-3 text-xs leading-relaxed text-negative">{error}</p>}

                  {preview && (
                    <div className="mt-4 border border-plaster bg-stone/40 px-3 py-3">
                      <p className="flex items-center gap-2 text-xs text-ink">
                        <FileBox size={14} className="text-oak" />
                        {preview.fileName}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-ash">{planSummary(preview)}</p>
                      {preview.result.report.warnings.slice(0, 2).map((w) => (
                        <p key={w} className="mt-1 text-[10px] text-oak">
                          {w}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={useSample} className="text-xs text-ash underline-offset-2 hover:text-ink hover:underline">
                      Use the sample apartment plan
                    </button>
                    <div className="flex gap-2">
                      <Dialog.Close className="btn-secondary py-2 text-xs">Cancel</Dialog.Close>
                      <button type="button" disabled={!preview} onClick={() => preview && onComplete(preview)} className="btn-primary py-2 text-xs disabled:opacity-40">
                        {existing ? "Replace plan" : "Design floors"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
