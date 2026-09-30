"use client";
/**
 * WalkHud — overlay shown during a first-person walk-through.
 * -----------------------------------------------------------------------------
 * Top: where you are + curated example-view chips.
 * Bottom: controls hint, a hold-to-walk touch pad (for phones/tablets) and
 * the exit button. The pad writes to the shared `walkInput` object that the
 * in-canvas WalkControls reads every frame.
 */
import { motion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, LogOut, Move3d } from "lucide-react";
import clsx from "clsx";
import type { Building, FloorData } from "@/types";
import { ZONES } from "@/lib/tower";
import { viewpointsFor } from "@/lib/viewpoints";
import { walkInput } from "@/lib/walkInput";

interface Props {
  building: Building;
  floor: FloorData;
  viewIndex: number;
  onView: (index: number) => void;
  onExit: () => void;
}

/** Hold-to-move pad button. */
function PadButton({ axis, value, label, children }: { axis: "forward" | "strafe"; value: 1 | -1; label: string; children: React.ReactNode }) {
  const start = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    walkInput[axis] = value;
  };
  const stop = () => {
    if (walkInput[axis] === value) walkInput[axis] = 0;
  };
  return (
    <button
      aria-label={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      className="flex h-11 w-11 touch-none select-none items-center justify-center rounded-[3px] border border-plaster bg-stone/60 text-ink/80 active:border-oak/60 active:bg-oak/20 active:text-oak"
    >
      {children}
    </button>
  );
}

export default function WalkHud({ building, floor, viewIndex, onView, onExit }: Props) {
  const views = viewpointsFor(floor);

  return (
    <>
      {/* Location + example views */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute inset-x-0 top-3 z-10 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-col items-center gap-2 sm:top-4"
      >
        <p className="overlay rounded-full px-3.5 py-1.5 text-[11px] text-ink/80">
          <span className="caption mr-2 text-oak">Walk-through</span>
          {building.name} · Floor {floor.number} · {ZONES[floor.zone].label}
        </p>
        <div className="overlay no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full p-1">
          {views.map((v, i) => (
            <button
              key={v.id}
              onClick={() => onView(i)}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition",
                i === viewIndex ? "bg-ink font-medium text-paper" : "text-ash hover:text-ink"
              )}
            >
              <Camera size={12} />
              {v.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-3 sm:inset-x-4 sm:bottom-4"
      >
        {/* Touch pad */}
        <div className="overlay grid grid-cols-3 gap-1 rounded-[3px] p-1.5" aria-label="Movement pad">
          <span />
          <PadButton axis="forward" value={1} label="Walk forward">
            <ArrowUp size={16} />
          </PadButton>
          <span />
          <PadButton axis="strafe" value={-1} label="Step left">
            <ArrowLeft size={16} />
          </PadButton>
          <PadButton axis="forward" value={-1} label="Walk back">
            <ArrowDown size={16} />
          </PadButton>
          <PadButton axis="strafe" value={1} label="Step right">
            <ArrowRight size={16} />
          </PadButton>
        </div>

        <p className="overlay hidden items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] text-ash md:flex">
          <Move3d size={12} className="text-oak" /> Drag to look · W A S D or arrows to walk · Shift to run · Esc to exit
        </p>

        <button
          onClick={onExit}
          className="flex items-center gap-2 rounded-full border border-oak/50 bg-paper/90 px-4 py-2.5 text-xs font-semibold text-oak backdrop-blur transition hover:bg-ink hover:text-paper"
        >
          <LogOut size={14} /> Exit
        </button>
      </motion.div>
    </>
  );
}
