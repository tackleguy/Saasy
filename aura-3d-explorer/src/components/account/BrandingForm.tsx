"use client";
import { brandButtonStyle } from "@/lib/brandColor";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function BrandingForm({ orgId, name, slug, accent, logoUrl, canEdit }: { orgId: string; name: string; slug: string; accent: string | null; logoUrl: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [color, setColor] = useState(accent ?? "#9C7A52");
  const [orgName, setOrgName] = useState(name);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="panel mt-8 space-y-5 p-6" onSubmit={async (e) => {
      e.preventDefault();
      const client = supabaseBrowser();
      if (!client || !canEdit) return;
      setBusy(true); setStatus("");
      let logo_path: string | undefined;
      if (file) {
        if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type) || file.size > 2 * 1024 * 1024) { setBusy(false); return setStatus("Use a PNG, JPG, WebP or SVG logo under 2 MB."); }
        const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg");
        logo_path = `${orgId}/logo-${Date.now().toString(36)}.${ext}`;
        const { error } = await client.storage.from("org-logos").upload(logo_path, file, { contentType: file.type });
        if (error) { setBusy(false); return setStatus("The logo could not be uploaded. Try again."); }
      }
      const { error } = await client.from("organizations").update({ name: orgName.trim(), accent_color: color, ...(logo_path ? { logo_path } : {}) }).eq("id", orgId);
      setBusy(false);
      if (error) setStatus("Branding could not be saved. Only owners can change it.");
      else { setStatus("Branding saved."); router.refresh(); }
    }}>
      <label className="block"><span className="caption">Company name</span><input value={orgName} onChange={(e) => setOrgName(e.target.value)} minLength={2} maxLength={120} className="field mt-1" disabled={!canEdit} /></label>
      <div className="flex flex-wrap items-end gap-6">
        <label className="block"><span className="caption">Accent colour</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 block h-11 w-20 cursor-pointer border border-plaster bg-paper" disabled={!canEdit} /></label>
        <span className="text-sm tabular-nums text-ash">{color.toUpperCase()}</span>
        <span className="btn-primary pointer-events-none py-2 text-xs" style={brandButtonStyle(color)} aria-hidden>Enquire</span>
      </div>
      <div>
        <span className="caption">Logo</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl && <img src={logoUrl} alt={`${name} logo`} className="mt-2 h-10 w-auto max-w-[200px] object-contain" />}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-2 block text-sm" aria-label="Upload logo" disabled={!canEdit} />
        <p className="caption mt-1">PNG with a transparent background works best. PDFs use PNG or JPG logos.</p>
      </div>
      <p className="caption">Company link name: <span className="font-mono">{slug}</span>. Branded pages live at /o/{slug}/projects/&lt;project id&gt;.</p>
      {status && <p role="status" className="text-sm text-ink">{status}</p>}
      <button type="submit" className="btn-primary" disabled={busy || !canEdit} aria-busy={busy}>{busy ? "Saving…" : "Save branding"}</button>
      {!canEdit && <p className="caption">Only company owners can change branding.</p>}
    </form>
  );
}
