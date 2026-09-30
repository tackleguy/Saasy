"use client";
/**
 * ImportedModelHud — small viewport chip shown while a CAD import is loaded.
 * -----------------------------------------------------------------------------
 * "Imported model · Edges · Show procedural · ×": switch between the imported
 * geometry and the procedural tower, toggle the 30° edge-line overlay built by
 * lib/importNormalize, or discard the import.
 */
import { useState } from "react";
import type { Object3D } from "three";
import clsx from "clsx";
import { Box, X } from "lucide-react";

/** Same as lib/importNormalize#setEdgesVisible, inlined so this chip doesn't pull Three.js into the page bundle. */
function setEdgesVisible(root: Object3D, visible: boolean) {
  root.traverse((o) => {
    if (o.userData.isEdgeOverlay) o.visible = visible;
  });
  root.userData.edgesVisible = visible;
}

interface Props {
  model: Object3D;
  shown: boolean;
  onShownChange: (shown: boolean) => void;
  onClear: () => void;
  className?: string;
}

export default function ImportedModelHud({ model, shown, onShownChange, onClear, className }: Props) {
  const hasEdges = !!model.userData.hasEdges;
  const [edges, setEdges] = useState<boolean>(!!model.userData.edgesVisible);
  const name = (model.userData.fileName as string | undefined) ?? "Imported model";
  const chip = "rounded-full px-2 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40";

  return (
    <div className={clsx("overlay flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-[11px] text-ink", className)} role="group" aria-label="Imported model">
      <Box size={12} className="shrink-0 text-oak" aria-hidden />
      <span className="max-w-[140px] truncate font-medium" title={name}>
        {shown ? name : "Procedural tower"}
      </span>
      <span className="text-ash" aria-hidden>
        ·
      </span>
      {shown && hasEdges && (
        <button
          onClick={() => {
            setEdgesVisible(model, !edges);
            setEdges(!edges);
          }}
          aria-pressed={edges}
          className={clsx(chip, edges ? "bg-ink text-paper" : "text-ash hover:text-ink")}
        >
          Edges
        </button>
      )}
      <button onClick={() => onShownChange(!shown)} className={clsx(chip, "text-ash hover:text-ink")}>
        {shown ? "Show procedural" : "Show import"}
      </button>
      <button onClick={onClear} className={clsx(chip, "px-1 text-ash hover:text-negative")} aria-label="Discard imported model" title="Discard imported model">
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}
