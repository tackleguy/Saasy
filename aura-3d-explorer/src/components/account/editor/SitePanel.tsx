"use client";
/**
 * The project's real address and its surroundings. Searching uses the
 * existing geocoder (OpenStreetMap Nominatim, explicit search only). Loading
 * surroundings is a separate, explicit step that sends the saved coordinates
 * to OpenStreetMap's Overpass service (docs/DECISIONS.md D-06).
 */
import { useState } from "react";
import SiteAddressFields from "@/components/ui/SiteAddressFields";
import { mapCoverage } from "@/lib/mapLocations";
import type { MapSnapshot, ProjectLocation } from "@/lib/geographicContext";

export default function SitePanel({ projectId, location, snapshot, saved, onLocation, onSnapshot }: {
  projectId: string; location: ProjectLocation | null; snapshot: MapSnapshot | null; saved: boolean;
  onLocation: (location: ProjectLocation) => void; onSnapshot: (snapshot: MapSnapshot) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const bundled = location ? mapCoverage(location) : undefined;
  const load = async () => {
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/site/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }) });
      const data = (await res.json().catch(() => ({}))) as { snapshot?: MapSnapshot; error?: string };
      if (!res.ok || !data.snapshot) throw new Error(data.error ?? "The surroundings could not be loaded.");
      onSnapshot(data.snapshot);
      setMessage(`Loaded ${data.snapshot.features.length.toLocaleString("en-US")} mapped buildings, streets, parks and water features.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "The surroundings could not be loaded."); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <SiteAddressFields value={location} onChange={onLocation} />
      {location && (
        <div className="space-y-3 border-t border-plaster pt-4">
          <p className="text-sm text-ink">{location.label}</p>
          <p className="caption tabular-nums">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</p>
          {snapshot ? (
            <p className="caption">Surroundings: {snapshot.features.length.toLocaleString("en-US")} features from {snapshot.attribution}, captured {new Date(snapshot.capturedAt).toLocaleDateString()}. Heights come from mapped heights or floor counts; buildings without either stay flat footprints. Facades are illustrative.</p>
          ) : bundled ? (
            <p className="caption">This address is inside AURA&apos;s bundled {bundled.label} map area, so mapped surroundings are shown without a lookup.</p>
          ) : (
            <p className="caption">No surroundings loaded yet: the building stands on neutral ground until you load them.</p>
          )}
          {!bundled && (
            <div className="space-y-2">
              <p className="caption">Loading sends this address&apos;s coordinates to OpenStreetMap&apos;s Overpass service. The result is saved with the project, so viewers never trigger another lookup.</p>
              <button type="button" className="btn-secondary text-xs" onClick={() => void load()} disabled={busy || !saved} aria-busy={busy}>
                {busy ? "Loading surroundings…" : snapshot ? "Reload surroundings from OpenStreetMap" : "Load surroundings from OpenStreetMap"}
              </button>
              {!saved && <p className="caption">Save the project first so the address is stored.</p>}
            </div>
          )}
          <p role="status" className="caption">{message}</p>
        </div>
      )}
    </div>
  );
}
