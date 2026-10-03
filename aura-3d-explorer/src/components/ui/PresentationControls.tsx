"use client";
import { Camera, Maximize2, X } from "lucide-react";
import type { ExplorerState } from "@/hooks/useExplorer";
import type { ModelCut } from "@/components/3d/presentationContext";
import { SUN, type SunPreset } from "@/components/3d/environment/settings";
import type { ModelReview } from "@/lib/modelReview";
interface Props { sun: SunPreset; onSun: (v: SunPreset) => void; explorer: ExplorerState; active: boolean; onActive: (v: boolean) => void; cut: ModelCut; onCut: (v: ModelCut) => void }
export default function PresentationControls({ explorer: x, active, onActive, cut, onCut, sun, onSun }: Props) {
  const imported = x.showImported && x.importedModel?.userData.buildingId === x.building.id ? x.importedModel : null;
  const review = imported?.userData.review as ModelReview | undefined;
  const open = () => { onCut({mode:"exterior",fraction:.35}); x.setMapOpen(false); x.resetView(); x.setQuality("high"); onActive(true); };
  const shot = (mode: ModelCut["mode"]) => {
    onCut({ ...cut, mode });
    x.stopWalk();
    if (imported) { x.resetView(); return; }
    x.setSectionMode(mode === "core");
    x.setExplosion(0);
    if (mode === "floor") x.selectFloor(x.building.floors.find(f => f.zone === "residential") ?? x.building.floors[1]);
    else x.selectFloor(null);
  };
  if (!active) return <button data-presentation-trigger onClick={open} className="absolute top-16 left-4 z-20 flex min-h-11 items-center gap-2 border border-plaster bg-paper px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-stone sm:left-5"><Maximize2 size={14}/> Present building</button>;
  return <>
    <div className="absolute left-4 top-4 z-40 max-w-[calc(100%-5.5rem)] bg-paper px-4 py-3 text-ink sm:left-8 sm:top-8 sm:max-w-[420px] sm:px-5 sm:py-4"><p className="font-serif text-2xl leading-tight sm:text-3xl">{x.building.name}</p><p className="mt-1 text-xs text-ash">{x.location.label}</p><p className="mt-1 text-[11px] text-ash">{imported ? "Authored import · reviewed scale and materials" : "Illustrative sample design · mapped context"}</p></div>
    <button onClick={() => { onActive(false); x.stopWalk(); }} aria-label="Exit presentation" className="absolute right-4 top-4 z-50 flex min-h-11 min-w-11 items-center justify-center bg-paper p-3 text-ink transition-colors hover:bg-stone sm:right-8 sm:top-8"><X size={20}/></button>
    <div className="absolute bottom-6 left-1/2 z-40 w-[min(720px,calc(100%-2rem))] -translate-x-1/2 bg-paper p-3 text-ink sm:bottom-8 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Presentation views">{[{id:"exterior",label:"Exterior"},{id:"floor",label:"Interior"},{id:"core",label:"Core section"}].map(v => <button key={v.id} onClick={() => shot(v.id as ModelCut["mode"])} aria-pressed={cut.mode===v.id} className={`min-h-11 px-3 py-2 text-sm ${cut.mode===v.id ? "bg-ink text-paper" : "hover:bg-stone"}`}>{v.label}</button>)}
        {!imported && cut.mode === "floor" && <button onClick={x.startWalk} className="min-h-11 border border-plaster px-3 py-2 text-sm">Walk inside</button>}
        <button onClick={() => x.choosePhotoAngle("aerial")} className="min-h-11 px-3 py-2 text-sm hover:bg-stone">Aerial</button>
        <button onClick={() => { shot("exterior"); x.choosePhotoAngle("skyline"); }} className="min-h-11 px-3 py-2 text-sm hover:bg-stone">Downtown</button>
        <button onClick={() => void x.capture()} disabled={x.capturing} className="flex items-center gap-1 min-h-11 px-3 py-2 text-sm hover:bg-stone disabled:opacity-50"><Camera size={15}/>{x.capturing ? "Saving…" : "Save image"}</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-plaster pt-2 text-xs"><label>Light <select aria-label="Presentation light" className="rounded bg-paper px-2 py-1" value={sun} onChange={e => onSun(e.target.value as SunPreset)}>{Object.entries(SUN).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select></label>{x.walking && <button onClick={x.stopWalk} className="underline">Return to floor</button>}<span className="text-ash">Illustrative façades, roofs and street details.</span></div>
      {imported && cut.mode === "floor" && <label className="mt-3 flex items-center gap-3 px-2 text-xs">Section height<input aria-label="Imported model section height" type="range" min={.02} max={1} step={.005} value={cut.fraction} onChange={e => onCut({ ...cut, fraction: Number(e.target.value) })} className="min-w-0 flex-1 accent-[#9C7A52]"/><span className="tabular-nums">{((imported.userData.normalization?.heightM ?? 0) * cut.fraction).toFixed(1)} m</span></label>}
      {imported && cut.mode !== "exterior" && <p className="mt-2 px-2 text-xs text-ash">This cut reveals supplied geometry.{!review?.parts.Core && " A core was not identified by name."} Missing rooms or furniture require a detailed source model.</p>}
      {!imported && cut.mode === "floor" && x.selectedFloor && <label className="mt-2 flex items-center justify-center gap-2 text-xs">Floor<select aria-label="Presentation floor" className="rounded border border-plaster bg-paper px-2 py-1" value={x.selectedIndex ?? 0} onChange={e => x.selectFloor(x.building.floors[Number(e.target.value)])}>{x.building.floors.map(f => <option key={f.index} value={f.index}>{f.number} · {f.zone}</option>)}</select></label>}
    </div>
  </>;
}
