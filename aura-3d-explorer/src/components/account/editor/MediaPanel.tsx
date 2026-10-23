"use client";
/**
 * The customer's own building model and hero images, kept in Supabase Storage
 * under the organization's folder. The model goes through the existing import
 * review (CadUploadModal: size limits, no external resources, geometry checks)
 * before it is uploaded; the review settings are saved so it rebuilds the same.
 */
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Object3D } from "three";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MAX_STORED_MODEL_BYTES, modelContentType, STORABLE_MODEL, type StoredModelSettings } from "@/lib/storedModel";
import { storageRef } from "@/lib/data/images";
import type { ProjectImage, YieldInputs } from "@/types";
import type { Building } from "@/types";
import type { ProjectLocation } from "@/lib/geographicContext";

const CadUploadModal = dynamic(() => import("@/components/ui/CadUploadModal"), { ssr: false });

export interface StoredModelRef { path: string; settings: StoredModelSettings }

export default function MediaPanel({ orgId, projectId, building, inputs, location, model, images, onModel, onPlaced, onImages }: {
  orgId: string; projectId: string; building: Building; inputs: YieldInputs; location: ProjectLocation | null;
  model: StoredModelRef | null; images: ProjectImage[];
  onModel: (model: StoredModelRef | null) => void; onPlaced: (object: Object3D | null) => void;
  onImages: (images: ProjectImage[], previews: Record<string, string>) => void;
}) {
  const [cadOpen, setCadOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const client = supabaseBrowser();

  const placed = async (object: Object3D | null, source?: { file: File; settings: StoredModelSettings }) => {
    setCadOpen(false);
    onPlaced(object);
    if (!object || !source || !client) return;
    if (!STORABLE_MODEL.test(source.file.name)) return setStatus("Shown in the preview only: save the model as GLB, STL or DXF to keep it with the project.");
    if (source.file.size > MAX_STORED_MODEL_BYTES) return setStatus("Shown in the preview only: models kept with a project can be up to 50 MB. Export a lighter GLB.");
    setBusy(true); setStatus("Uploading the model…");
    const ext = source.file.name.split(".").pop()!.toLowerCase();
    const path = `${orgId}/${projectId}/model.${ext}`;
    const { error } = await client.storage.from("project-models").upload(path, source.file, { upsert: true, contentType: modelContentType(source.file.name) });
    setBusy(false);
    if (error) return setStatus("The model is shown but could not be uploaded. Check your connection and place it again.");
    onModel({ path, settings: source.settings });
    setStatus(`${source.file.name} uploaded. Save the project to keep it.`);
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length || !client) return;
    const list = [...files].slice(0, 3 - images.length);
    if (!list.length) return setStatus("Projects show up to three images. Remove one first.");
    setBusy(true); setStatus("Uploading images…");
    const next = [...images], previews: Record<string, string> = {};
    for (const file of list) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) { setStatus(`${file.name}: use a JPG, PNG or WebP under 10 MB.`); continue; }
      const path = `${orgId}/${projectId}/hero-${crypto.randomUUID().slice(0, 8)}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;
      const { error } = await client.storage.from("project-images").upload(path, file, { contentType: file.type });
      if (error) { setStatus(`${file.name} could not be uploaded.`); continue; }
      const src = storageRef("project-images", path);
      previews[src] = URL.createObjectURL(file);
      next.push({ src, alt: file.name.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ") });
    }
    setBusy(false);
    onImages(next, previews);
    if (next.length > images.length) setStatus("Images uploaded. Edit their descriptions, then save the project.");
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-ink">Your building model</h3>
        <p className="caption">Upload GLB, STL or DXF (up to 50 MB). It replaces the first building&apos;s generated tower in every view; floor isolation, explode and walk-through work where the model has storeys.</p>
        {model && <p className="text-sm text-ink">Kept with this project: {model.settings.fileName}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={() => setCadOpen(true)} disabled={busy}>{model ? "Replace model" : "Upload a model"}</button>
          {model && <button type="button" className="btn-ghost text-xs" onClick={() => { onModel(null); onPlaced(null); setStatus("Model removed. Save the project to keep this change."); }}>Use the generated massing instead</button>}
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-ink">Images</h3>
        <p className="caption">Up to three renders or photos (JPG, PNG or WebP, 10 MB each). The first is the cover on share links. You can also capture stills from the 3D view.</p>
        {images.map((img, i) => (
          <div key={img.src} className="flex items-center gap-2">
            <label className="flex-1">
              <span className="sr-only">Description of image {i + 1}</span>
              <input value={img.alt} maxLength={160} onChange={(e) => onImages(images.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)), {})} className="field" />
            </label>
            <button type="button" className="btn-ghost text-xs" onClick={() => onImages(images.filter((_, k) => k !== i), {})} aria-label={`Remove image ${i + 1}`}>Remove</button>
          </div>
        ))}
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label="Upload images" onChange={(e) => { void uploadImages(e.target.files); e.target.value = ""; }} />
        {images.length < 3 && <button type="button" className="btn-secondary text-xs" onClick={() => imageInput.current?.click()} disabled={busy}>Add images</button>}
      </section>
      <p role="status" className="caption">{status}</p>
      {cadOpen && <CadUploadModal open={cadOpen} onOpenChange={setCadOpen} inputs={inputs} building={building} location={location ?? undefined} onComplete={(m, s) => void placed(m, s)} />}
    </div>
  );
}
