"use client";
/**
 * "Import CAD / Request Demo" modal.
 * Step 1 — drag & drop (or pick) a .stl / .dxf / .dwg file → instant in-browser parse preview.
 * Step 2 — short lead form. Submission is mocked; wire `handleSubmit` to your CRM / email API.
 */
import { useCallback, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { CheckCircle2, FileBox, Loader2, Sparkles, UploadCloud, X } from "lucide-react";
import { ACCEPTED, CadReport, makeSampleStl, parseCadFile } from "@/lib/cadParser";
import { useAura } from "@/lib/store";

function StlPreview({ report }: { report: CadReport }) {
  if (!report.geometry) return null;
  const g = report.geometry;
  const r = g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere!);
  return (
    <div className="h-44 overflow-hidden rounded-xl border border-white/[0.06] bg-obsidian">
      <Canvas camera={{ position: [r.radius * 1.9, r.radius * 1.1, r.radius * 2.3], fov: 40 }}>
        <hemisphereLight args={["#dfe6f0", "#1a1d24", 0.9]} />
        <directionalLight position={[5, 10, 7]} intensity={1.6} />
        <mesh geometry={g} rotation-x={g.boundingBox && g.boundingBox.max.z - g.boundingBox.min.z > g.boundingBox.max.y - g.boundingBox.min.y ? -Math.PI / 2 : 0}>
          <meshStandardMaterial color="#b8c4d6" metalness={0.2} roughness={0.4} side={THREE.DoubleSide} />
        </mesh>
        <OrbitControls autoRotate autoRotateSpeed={2} enableZoom={false} />
      </Canvas>
    </div>
  );
}

export default function CadModal() {
  const { cadOpen, setCadOpen } = useAura();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CadReport | null>(null);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      // brief pause so the "parsing" state is perceptible
      const [r] = await Promise.all([parseCadFile(file), new Promise((res) => setTimeout(res, 650))]);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: POST form data to your CRM (HubSpot, Resend, etc.)
    setSent(true);
  };

  const reset = (open: boolean) => {
    setCadOpen(open);
    if (!open)
      setTimeout(() => {
        setReport(null);
        setError(null);
        setSent(false);
      }, 250);
  };

  return (
    <Dialog.Root open={cadOpen} onOpenChange={reset}>
      <AnimatePresence>
        {cadOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-auto max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-white/10 bg-obsidian-800 p-6 shadow-2xl"
              >
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Automated Ingestion</p>
                    <Dialog.Title className="font-serif text-3xl text-white">Import CAD</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-mist">
                      Drop a massing model and AURA will parse it into floor plates & a yield model.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close className="rounded-full p-1.5 text-mist hover:bg-white/5 hover:text-white" aria-label="Close">
                    <X size={18} />
                  </Dialog.Close>
                </div>

                {sent ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <CheckCircle2 size={44} className="mb-4 text-gold" />
                    <h4 className="font-serif text-2xl text-white">Request received</h4>
                    <p className="mt-2 max-w-sm text-sm text-mist">Our team will prepare a full yield study from your file and reach out within one business day.</p>
                  </div>
                ) : (
                  <>
                    {/* Dropzone */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDrag(true);
                      }}
                      onDragLeave={() => setDrag(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDrag(false);
                        handleFile(e.dataTransfer.files?.[0]);
                      }}
                      onClick={() => inputRef.current?.click()}
                      className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition ${
                        drag ? "border-gold bg-gold/[0.07]" : "border-white/15 hover:border-gold/50 hover:bg-white/[0.02]"
                      }`}
                    >
                      <input ref={inputRef} type="file" accept={ACCEPTED.join(",")} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                      {busy ? <Loader2 className="mb-3 animate-spin text-gold" size={30} /> : <UploadCloud className="mb-3 text-gold transition group-hover:-translate-y-0.5" size={30} />}
                      <p className="text-sm text-white">{busy ? "Parsing geometry…" : "Drag & drop your file here, or click to browse"}</p>
                      <p className="mt-1 text-xs text-mist">.stl · .dxf · .dwg — processed locally in your browser</p>
                    </div>
                    <button
                      onClick={() => handleFile(makeSampleStl())}
                      className="mx-auto mt-2 flex items-center gap-1.5 text-xs text-mist underline-offset-4 hover:text-gold hover:underline"
                    >
                      <Sparkles size={12} /> No file handy? Try a sample tower model
                    </button>

                    {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

                    {/* Parse preview */}
                    {report && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3 rounded-xl border border-gold/25 bg-gold/[0.04] p-4">
                        <div className="flex items-center gap-2 text-sm text-white">
                          <FileBox size={16} className="text-gold" />
                          <span className="truncate">{report.fileName}</span>
                          <span className="ml-auto shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-mist">
                            {report.format} · {report.sizeKb.toFixed(1)} KB
                          </span>
                        </div>
                        <StlPreview report={report} />
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                          {report.facts.map((f) => (
                            <div key={f.label} className="contents">
                              <dt className="text-mist">{f.label}</dt>
                              <dd className="text-right text-white">{f.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </motion.div>
                    )}

                    {/* Lead form */}
                    <form onSubmit={handleSubmit} className="mt-5 space-y-3 border-t border-white/[0.06] pt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mist">Request a full demo</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input required placeholder="Full name" className="rounded-lg border border-white/10 bg-obsidian px-3 py-2.5 text-sm text-white placeholder:text-mist/60 focus:border-gold/60 focus:outline-none" />
                        <input required type="email" placeholder="Work email" className="rounded-lg border border-white/10 bg-obsidian px-3 py-2.5 text-sm text-white placeholder:text-mist/60 focus:border-gold/60 focus:outline-none" />
                      </div>
                      <input placeholder="Company / project name" className="w-full rounded-lg border border-white/10 bg-obsidian px-3 py-2.5 text-sm text-white placeholder:text-mist/60 focus:border-gold/60 focus:outline-none" />
                      <button type="submit" className="w-full rounded-lg bg-gold py-3 text-sm font-semibold uppercase tracking-[0.14em] text-obsidian transition hover:bg-gold-soft">
                        {report ? "Send file & request demo" : "Request demo"}
                      </button>
                    </form>
                  </>
                )}
              </motion.div>
            </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
