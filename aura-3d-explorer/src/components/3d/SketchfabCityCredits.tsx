"use client";

import { SKETCHFAB_CITY_SOURCE_UIDS } from "./context/IllustrativeCity";
import { libraryModel } from "@/lib/modelLibrary";

const models = SKETCHFAB_CITY_SOURCE_UIDS.map(libraryModel).filter((model) => model !== undefined);

/** Compact, visible CC BY attribution for the locally installed Sketchfab city assets. */
export default function SketchfabCityCredits() {
  return (
    <details aria-label="Sketchfab city model credits" style={{ position: "relative" }}>
      <summary style={{ cursor: "pointer", padding: 5, color: "#D6B87C" }}>Sketchfab credits</summary>
      <ul style={{ position: "absolute", right: 0, top: "100%", zIndex: 50, width: 320, maxHeight: 260, overflowY: "auto", margin: 0, padding: 12, listStyle: "none", background: "#111620", border: "1px solid #5c503c", borderRadius: 6, color: "#E8DCC6" }}>
        {models.map((model) => (
          <li key={model.uid} style={{ padding: "6px 0", borderBottom: "1px solid #38332b" }}>
            <a href={model.url} target="_blank" rel="noreferrer" style={{ color: "#E8DCC6", textDecoration: "underline" }}>{model.name}</a>
            <span> by </span>
            <a href={model.creator.url} target="_blank" rel="noreferrer" style={{ color: "#D6B87C", textDecoration: "underline" }}>{model.creator.name}</a>
            <div style={{ marginTop: 2, fontSize: 10 }}>
              Modified for scale, placement and tint · <a href={model.license.url} target="_blank" rel="noreferrer" style={{ color: "#D6B87C", textDecoration: "underline" }}>{model.license.label}</a>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
