"use client";
/**
 * Marketing stills captured from the live scene at 2× (watermarked, with map
 * attribution), saved to the project's gallery in Storage (`project-renders`)
 * and listed in the `renders` table. Any still can become one of the
 * project's images.
 */
import { useState } from "react";
import { Camera } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { storageRef } from "@/lib/data/images";

export interface GalleryItem { id: string; path: string; url: string; width: number; height: number; createdAt: string }

async function size(blob: Blob): Promise<[number, number]> {
  const bitmap = await createImageBitmap(blob);
  const dims: [number, number] = [bitmap.width, bitmap.height];
  bitmap.close();
  return dims;
}

export default function RenderGallery({ orgId, projectId, userId, items, capture, onUse }: {
  orgId: string; projectId: string; userId: string; items: GalleryItem[];
  capture: () => Promise<Blob | null>; onUse: (src: string, previewUrl: string) => void;
}) {
  const [list, setList] = useState(items);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const save = async () => {
    const client = supabaseBrowser();
    if (!client || busy) return;
    setBusy(true); setStatus("Capturing…");
    try {
      const blob = await capture();
      if (!blob) throw new Error("capture");
      const [width, height] = await size(blob);
      const path = `${orgId}/${projectId}/render-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      const up = await client.storage.from("project-renders").upload(path, blob, { contentType: "image/png" });
      if (up.error) throw new Error("upload");
      const { data, error } = await client.from("renders").insert({ project_id: projectId, org_id: orgId, storage_path: path, width, height, created_by: userId }).select("id, created_at").single();
      if (error || !data) throw new Error("record");
      setList((l) => [{ id: data.id, path, url: URL.createObjectURL(blob), width, height, createdAt: data.created_at }, ...l]);
      setStatus(`Still saved to the gallery (${width} × ${height}).`);
    } catch {
      setStatus("The still could not be saved. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="gallery-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="gallery-heading" className="font-serif text-2xl text-ink">Gallery</h2>
        <button type="button" className="btn-secondary py-2 text-xs" onClick={() => void save()} disabled={busy} aria-busy={busy}>
          <Camera size={14} aria-hidden /> {busy ? "Capturing…" : "Save still to gallery"}
        </button>
      </div>
      <p role="status" className="caption">{status || "Frame the 3D view, then save a 2× still for brochures and listings."}</p>
      {list.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((item, i) => (
            <li key={item.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={`Captured still ${list.length - i}`} className="aspect-[16/10] w-full border border-plaster object-cover" />
              <div className="flex items-center justify-between gap-2">
                <a href={item.url} download={`render-${i + 1}.png`} className="caption underline underline-offset-4">Download</a>
                <button type="button" className="caption underline underline-offset-4" onClick={() => onUse(storageRef("project-renders", item.path), item.url)}>Use as project image</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
