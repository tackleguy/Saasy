"use client";
/**
 * Lightweight app-wide state (React context — no extra dependency).
 * Shared between the 3D viewport and the financial sidebar so that e.g.
 * clicking a bar in the yield chart selects the same floor in 3D.
 */
import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import { FloorPlate, generateTower } from "./building";
import { computeYield, DEFAULT_INPUTS, FinanceInputs, YieldResult } from "./finance";

interface AuraState {
  plates: FloorPlate[];
  inputs: FinanceInputs;
  setInput: <K extends keyof FinanceInputs>(k: K, v: FinanceInputs[K]) => void;
  yieldResult: YieldResult;

  explode: number; // 0 → 1
  setExplode: (v: number) => void;
  furnish: boolean;
  setFurnish: (v: boolean) => void;
  selected: number | null;
  setSelected: (i: number | null) => void;
  hovered: number | null;
  setHovered: (i: number | null) => void;
  cameraResetKey: number;
  resetCamera: () => void;

  cadOpen: boolean;
  setCadOpen: (v: boolean) => void;
}

const Ctx = createContext<AuraState | null>(null);

export function AuraProvider({ children }: { children: ReactNode }) {
  // The tower is generated once — deterministic procedural geometry.
  const plates = useMemo(() => generateTower(), []);
  const [inputs, setInputs] = useState<FinanceInputs>(DEFAULT_INPUTS);
  const [explode, setExplode] = useState(0);
  const [furnish, setFurnish] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [cameraResetKey, setResetKey] = useState(0);
  const [cadOpen, setCadOpen] = useState(false);

  const yieldResult = useMemo(() => computeYield(inputs, plates), [inputs, plates]);

  const value: AuraState = {
    plates,
    inputs,
    setInput: (k, v) => setInputs((p) => ({ ...p, [k]: v })),
    yieldResult,
    explode,
    setExplode,
    furnish,
    setFurnish,
    selected,
    setSelected,
    hovered,
    setHovered,
    cameraResetKey,
    resetCamera: () => {
      setSelected(null);
      setResetKey((k) => k + 1);
    },
    cadOpen,
    setCadOpen,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAura() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAura must be used inside <AuraProvider>");
  return v;
}
