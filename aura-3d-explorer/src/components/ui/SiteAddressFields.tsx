"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import type { ProjectLocation } from "@/lib/geographicContext";

export default function SiteAddressFields({ value, onChange }: { value: ProjectLocation | null; onChange: (v: ProjectLocation) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setResults([]);
    try {
      const response = await fetch(`/api/site/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (!body.results.length) setError("No address found. Include a street number, street, and city.");
      setResults(body.results.map((r: {label: string; lat: number; lon: number}) => ({label: r.label.slice(0,160), latitude: r.lat, longitude: r.lon, example: false})));
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Address search failed."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const inputClass = "min-w-0 rounded border border-plaster bg-paper px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak";
  return <div className="space-y-3">
    {value && <div className="flex items-start gap-2 text-sm text-ink"><MapPin size={16} className="mt-1 shrink-0 text-oak"/><div><p>{value.label}</p><a className="text-xs text-oak underline underline-offset-4" href={`https://www.openstreetmap.org/?mlat=${value.latitude}&mlon=${value.longitude}#map=18/${value.latitude}/${value.longitude}`} target="_blank" rel="noreferrer">Check position on map</a>{value.example && <p className="mt-1 text-xs text-ash">Reference address for an illustrative sample. This is not the building currently at this address.</p>}</div></div>}
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void search(); }}>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ash">Street address and city<input className={inputClass} value={query} onChange={e => setQuery(e.target.value)} placeholder="200 Hudson Street, Jersey City" minLength={5} maxLength={200} required autoComplete="street-address"/></label>
      <button type="submit" disabled={busy || query.trim().length < 5} aria-label="Find address" className="self-end rounded border border-plaster p-2.5 text-ink hover:bg-stone disabled:opacity-40">{busy ? <LoaderCircle size={18} className="animate-spin"/> : <Search size={18}/>}</button>
    </form>
    <p className="text-xs text-ash">Only the address is sent to OpenStreetMap. Your model stays in this browser.</p>
    {error && <p role="alert" className="text-sm text-negative">{error}</p>}
    {results.length > 0 && <ul className="divide-y divide-plaster border-y border-plaster">{results.map(r => <li key={`${r.latitude}-${r.longitude}`}><button className="w-full px-2 py-3 text-left text-sm text-ink hover:bg-stone focus-visible:ring-2 focus-visible:ring-oak" onClick={() => { onChange(r); setResults([]); }}>{r.label}</button></li>)}</ul>}
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="inline-block text-xs text-ash underline underline-offset-4">© OpenStreetMap contributors</a>
  </div>;
}
