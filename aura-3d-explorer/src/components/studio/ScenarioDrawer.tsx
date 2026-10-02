"use client";
/**
 * ScenarioDrawer — save, load and delete scenarios for a project: the
 * pro-forma inputs plus the site layout (buildings moved on the site map).
 * Stored in this browser's localStorage (per project), so scenarios are
 * private to the viewer and survive reloads. Every storage access is guarded:
 * private windows or blocked storage simply show an empty list.
 */
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FolderOpen, Trash2, X } from "lucide-react";
import type { BuildingId, YieldInputs } from "@/types";
import type { ExplorerState } from "@/hooks/useExplorer";

import { readScenarios, writeScenarios, type Scenario, type SiteLayout } from "@/lib/scenarioStorage";
export type { Scenario, SiteLayout } from "@/lib/scenarioStorage";

/** The buildings whose position differs from the project's original site. */
function currentLayout(x: ExplorerState): SiteLayout {
  const out: SiteLayout = {};
  for (const b of x.site) {
    const base = x.baseSite.find((o) => o.id === b.id);
    if (base && (base.position[0] !== b.position[0] || base.position[1] !== b.position[1])) out[b.id] = [b.position[0], b.position[1]];
  }
  return out;
}

/** Restore a saved layout: back to the original site, then re-apply each saved move that is still valid. */
function applyLayout(x: ExplorerState, layout: SiteLayout | undefined) {
  x.resetLayout();
  for (const [id, pos] of Object.entries(layout ?? {}) as [BuildingId, [number, number]][]) {
    const valid = Array.isArray(pos) && pos.length === 2 && pos.every(Number.isFinite);
    if (valid && x.baseSite.some((b) => b.id === id)) x.moveBuilding(id, [pos[0], pos[1]]);
  }
}

const movedCount = (layout?: SiteLayout) => Object.keys(layout ?? {}).length;

interface Props {
  projectSlug: string;
  current: Record<BuildingId, YieldInputs>;
  onLoad: (inputsById: Record<BuildingId, YieldInputs>) => void;
  /** The explorer whose site layout is saved with each scenario and restored on load. */
  explorer?: ExplorerState;
}

export default function ScenarioDrawer({ projectSlug, current, onLoad, explorer }: Props) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Scenario[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (open) {
      setError(""); setStatus("");
      try { setList(readScenarios(window.localStorage, projectSlug)); }
      catch { setError("Saved scenarios could not be read. Enable browser storage or restore a valid backup, then reopen this panel. Your current work is unchanged."); }
    }
  }, [open, projectSlug]);

  const update = useCallback(
    (next: Scenario[]) => {
      try {
        writeScenarios(window.localStorage, projectSlug, next);
        setList(next); setError(""); setStatus("Saved scenarios updated in this browser.");
        return true;
      } catch {
        setError("Changes could not be saved. Enable browser storage or free space, then try again. Keep this page open to retain your current work.");
        setStatus("");
        return false;
      }
    },
    [projectSlug]
  );

  const save = () => {
    const s: Scenario = {
      id: crypto.randomUUID(),
      name: name.trim() || `Scenario ${list.length + 1}`,
      savedAt: new Date().toISOString(),
      inputsById: current,
      ...(explorer ? { layout: currentLayout(explorer) } : {}),
    };
    if (update([s, ...list])) setName("");
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn-secondary py-2 text-xs" aria-label="Saved scenarios">
        <FolderOpen size={14} aria-hidden />
        <span className="hidden sm:inline">Scenarios</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(400px,100%)] flex-col border-l border-plaster bg-paper p-6 focus:outline-none">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="font-serif text-3xl text-ink">Scenarios</Dialog.Title>
              <Dialog.Description className="caption mt-1">
                Pro-forma assumptions{explorer ? " and site layout" : ""}, saved in this browser only.
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn-ghost" aria-label="Close">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form
            className="mt-6 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="sr-only" htmlFor="scenario-name">
              Scenario name
            </label>
            <input id="scenario-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Base case, 60% LTC" className="field" />
            <button type="submit" className="btn-primary shrink-0">
              Save
            </button>
          </form>

          {error && <p role="alert" className="mt-3 text-sm text-negative">{error}</p>}
          <p role="status" className="caption mt-2">{status}</p>

          <ul className="thin-scroll mt-6 flex-1 space-y-2 overflow-y-auto">
            {list.length === 0 && (
              <li className="caption">No saved scenarios yet. Save the current assumptions{explorer ? " and building positions" : ""} to compare later.</li>
            )}
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-2 border border-plaster p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{s.name}</p>
                  <p className="caption">
                    {new Date(s.savedAt).toLocaleString()}
                    {movedCount(s.layout) > 0 && ` · ${movedCount(s.layout)} building${movedCount(s.layout) > 1 ? "s" : ""} moved`}
                  </p>
                </div>
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => {
                    onLoad(s.inputsById);
                    if (explorer) applyLayout(explorer, s.layout);
                    setOpen(false);
                  }}
                >
                  Load
                </button>
                <button className="btn-ghost" aria-label={`Delete ${s.name}`} onClick={() => update(list.filter((x) => x.id !== s.id))}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
