"use client";
import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { createShareLink, revokeShareLink, type ShareLinkSummary } from "@/app/(site)/app/projects/[id]/actions";

export default function SharePanel({ projectId, links, saved }: { projectId: string; links: ShareLinkSummary[]; saved: boolean }) {
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("");
  const [password, setPassword] = useState("");
  const [financials, setFinancials] = useState(false);
  const [created, setCreated] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      <p className="caption">A share link opens a clean buyer view: the 3D explorer, images, key facts and availability. No sign-in needed. The pro forma is hidden unless you tick “Share financials”.</p>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault(); setError(""); setCreated("");
        start(async () => {
          const r = await createShareLink(projectId, { label, expiresInDays: days ? Number(days) : null, password, shareFinancials: financials }, window.location.origin);
          if (r.error) setError(r.error); else { setCreated(r.url ?? ""); setLabel(""); setPassword(""); }
        });
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="caption">Label (for you)</span><input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className="field mt-1" placeholder="e.g. Lender pack, Oct" /></label>
          <label className="block"><span className="caption">Expires after (days, optional)</span><input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="field mt-1" /></label>
          <label className="block"><span className="caption">Password (optional)</span><input type="password" autoComplete="new-password" minLength={6} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1" /></label>
          <label className="mt-6 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={financials} onChange={(e) => setFinancials(e.target.checked)} /> Share financials (pro forma)</label>
        </div>
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <button type="submit" className="btn-primary text-xs" disabled={pending || !saved} aria-busy={pending}>{pending ? "Creating…" : "Create share link"}</button>
        {!saved && <p className="caption">Save the project before sharing it.</p>}
      </form>
      {created && (
        <div className="space-y-2 border border-oak/60 bg-stone/50 p-3" role="status">
          <p className="text-sm text-ink">Copy this link now. For security it is shown only once.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={created} className="field font-mono text-xs" aria-label="New share link" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-secondary text-xs" onClick={() => void navigator.clipboard.writeText(created).then(() => setCopied(true))}>{copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {links.map((l) => {
          const expired = l.expiresAt && new Date(l.expiresAt) < new Date();
          const state = l.revokedAt ? "Revoked" : expired ? "Expired" : "Active";
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-2 border border-plaster p-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block text-ink">{l.label ?? "Share link"} · {state}</span>
                <span className="caption">Created {new Date(l.createdAt).toLocaleDateString()}{l.expiresAt ? ` · expires ${new Date(l.expiresAt).toLocaleDateString()}` : ""}{l.hasPassword ? " · password" : ""}{l.shareFinancials ? " · financials shared" : ""}</span>
              </span>
              {state === "Active" && <button type="button" className="btn-ghost text-xs text-negative" disabled={pending} onClick={() => start(async () => { const r = await revokeShareLink(projectId, l.id); if (r.error) setError(r.error); })}>Revoke</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
