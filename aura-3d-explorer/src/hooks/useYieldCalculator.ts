"use client";
/**
 * useYieldCalculator — React state for the yield engine.
 * Holds one set of pro-forma inputs per building of a project site and
 * derives per-building metrics plus a site roll-up via the pure functions in
 * lib/finance.ts.
 */
import { useCallback, useMemo, useState } from "react";
import type { Building, BuildingId, YieldInputs, YieldMetrics } from "@/types";
import { computeSite, computeYield, DEFAULT_INPUTS } from "@/lib/finance";

/** React state wrapper: one set of inputs per building of a site + a site roll-up. */
export function useYieldCalculator(site: Building[], defaults: Record<BuildingId, YieldInputs>) {
  const initial = useMemo(
    () => Object.fromEntries(site.map((b) => [b.id, defaults[b.id] ?? DEFAULT_INPUTS])) as Record<BuildingId, YieldInputs>,
    [site, defaults]
  );
  const [inputsById, setInputsById] = useState<Record<BuildingId, YieldInputs>>(initial);

  const setInput = useCallback(<K extends keyof YieldInputs>(building: BuildingId, key: K, value: YieldInputs[K]) => {
    setInputsById((prev) => ({ ...prev, [building]: { ...prev[building], [key]: value } }));
  }, []);

  const reset = useCallback((building: BuildingId) => setInputsById((prev) => ({ ...prev, [building]: initial[building] })), [initial]);

  /** Replace every building's inputs at once (e.g. loading a saved scenario). */
  const load = useCallback((all: Record<BuildingId, YieldInputs>) => setInputsById({ ...initial, ...all }), [initial]);

  const metricsById = useMemo(
    () => Object.fromEntries(site.map((b) => [b.id, computeYield(inputsById[b.id] ?? DEFAULT_INPUTS, b.floors)])) as Record<BuildingId, YieldMetrics>,
    [site, inputsById]
  );

  const siteMetrics = useMemo(() => computeSite(Object.values(metricsById)), [metricsById]);

  return { inputsById, setInput, reset, load, metricsById, site: siteMetrics };
}

export type YieldCalculator = ReturnType<typeof useYieldCalculator>;
