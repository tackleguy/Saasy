"use client";
/**
 * ScenarioDrawer — save, load and delete pro-forma scenarios for a project.
 * Stored in this browser's localStorage (per project), so scenarios are
 * private to the viewer and survive reloads. Every storage access is guarded:
 * private windows or blocked storage simply show an empty list.
 */
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FolderOpen, Trash2, X } from "lucide-react";
import type { BuildingId, YieldInputs } from "@/types";

export interface Scenario {
  id: string;
  name: string;
  savedAt: string;
  inputsById: Record<BuildingId, YieldInputs>;
}

const key = (slug: string) => `aura:scenarios:${slug}`;

function readScenarios(slug: string): Scenario[] {
  try {
    const raw = window.localStorage.getItem(key(slug));
    return raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    return [];
  }
}

function writeScenarios(slug: string, list: Scenario[]) {
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(list));
  } catch {
    /* storage unavailable — keep in memory only */
  }
}

interface Props {
  projectSlug: string;
  current: Record<BuildingId, YieldInputs>;
  onLoad: (inputsById: Record<BuildingId, YieldInputs>) => void;
}

export default function ScenarioDrawer({ projectSlug, current, onLoad }: Props) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Scenario[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setList(readScenarios(projectSlug));
  }, [open, projectSlug]);

  const update = useCallback(
    (next: Scenario[]) => {
      setList(next);
      writeScenarios(projectSlug, next);
    },
    [projectSlug]
  );

  const save = () => {
    const s: Scenario = {
      id: `${Date.now()}`,
      name: name.trim() || `Scenario ${list.length + 1}`,
      savedAt: new Date().toISOString(),
      inputsById: current,
    };
    update([s, ...list]);
    setName("");
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
              <Dialog.Description className="caption mt-1">Saved in this browser only.</Dialog.Description>
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

          <ul className="thin-scroll mt-6 flex-1 space-y-2 overflow-y-auto">
            {list.length === 0 && <li className="caption">No saved scenarios yet. Save the current assumptions to compare later.</li>}
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-2 border border-plaster p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{s.name}</p>
                  <p className="caption">{new Date(s.savedAt).toLocaleString()}</p>
                </div>
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => {
                    onLoad(s.inputsById);
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
