"use client";
/**
 * WalkHud — overlay shown during a first-person walk-through.
 * -----------------------------------------------------------------------------
 * Top: where you are + curated example-view chips.
 * Bottom: controls hint, a hold-to-walk touch pad (for phones/tablets) and
 * the exit button. The pad writes to the shared `walkInput` object that the
 * in-canvas WalkControls reads every frame.
 * Right: the lift panel, shown while you stand in the lift cab — pick a
 * floor to ride there; while travelling it shows the floor passing by.
 */
import { motion } from "framer-motion";
import { ArrowDown, ArrowDownUp, ArrowLeft, ArrowRight, ArrowUp, Camera, LogOut, Move3d } from "lucide-react";
import clsx from "clsx";
import type { Building, FloorData } from "@/types";
import { crownFloorCount, ZONES } from "@/lib/tower";
import { LIFT_VIEW, viewpointsFor } from "@/lib/viewpoints";
import { DEFAULT_FIT, type FloorFit } from "@/lib/apartmentFit";
import { walkInput } from "@/lib/walkInput";

interface Props {
  building: Building;
  floor: FloorData;
  viewIndex: number;
  onView: (index: number) => void;
  onExit: () => void;
  /** Standing in the lift cab. */
  inLift?: boolean;
  /** Floor number passing by while riding (null when stopped). */
  liftFloor?: number | null;
  /** Ride the lift to floor index. */
  onRide?: (index: number) => void;
  fit?: FloorFit;
}

/** Lift car operating panel: one button per floor, top floor first. */
function LiftPanel({ building, floor, liftFloor, onRide }: { building: Building; floor: FloorData; liftFloor: number | null; onRide: (i: number) => void }) {
  const riding = liftFloor !== null;
  const floors = [...building.floors].reverse();
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      className="overlay absolute right-3 top-24 z-10 w-[188px] rounded-[3px] p-3 sm:right-4"
      role="group"
      aria-label="Lift panel"
    >
      <div className="flex items-baseline justify-between">
        <p className="caption flex items-center gap-1.5">
          <ArrowDownUp size={12} className="text-oak" aria-hidden /> Lift
        </p>
        <p className="font-serif text-3xl leading-none tabular-nums text-ink" aria-live="polite">
          {riding ? liftFloor : floor.number}
        </p>
      </div>
      <p className="caption mt-1">{riding ? "Travelling…" : "Choose a floor"}</p>
      <div className="thin-scroll mt-2 grid max-h-[46vh] grid-cols-4 gap-1 overflow-y-auto pr-0.5">
        {floors.map((f) => {
          const here = f.index === floor.index;
          return (
            <button
              key={f.index}
              disabled={riding || here}
              onClick={() => onRide(f.index)}
              title={`${ZONES[f.zone].label} · floor ${f.number}`}
              className={clsx(
                "relative flex h-8 items-center justify-center rounded-full border text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40",
                here ? "border-oak bg-oak/15 text-oak" : "border-plaster text-ink hover:border-ink/40 disabled:opacity-40"
              )}
            >
              {f.zone === "podium" ? "L" : f.number}
              <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: ZONES[f.zone].accent }} aria-hidden />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
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

export default function WalkHud({ building, floor, viewIndex, onView, onExit, inLift = false, liftFloor = null, onRide, fit = DEFAULT_FIT }: Props) {
  const views = viewpointsFor(floor, crownFloorCount(building), floor.coreSize ?? building.coreSize, fit);

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
          <button
            onClick={() => onView(LIFT_VIEW)}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition",
              viewIndex === LIFT_VIEW ? "bg-ink font-medium text-paper" : "text-ash hover:text-ink"
            )}
          >
            <ArrowDownUp size={12} />
            Elevator
          </button>
        </div>
      </motion.div>

      {inLift && onRide && <LiftPanel building={building} floor={floor} liftFloor={liftFloor} onRide={onRide} />}

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
          <Move3d size={12} className="text-oak" /> Drag to look · W A S D or arrows to walk · walk into the lift to change floors · Esc to exit
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
