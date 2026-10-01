"use client";
/**
 * Project floor plans, shared by the explorer scene and its overlays.
 * The array is the explorer's state; an empty list means the required
 * import has not been made yet.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { ProjectFloorPlan } from "@/lib/projectFloorPlan";

const Ctx = createContext<readonly ProjectFloorPlan[]>([]);

export function ProjectFloorPlansProvider({ plans, children }: { plans: readonly ProjectFloorPlan[]; children: ReactNode }) {
  return <Ctx.Provider value={plans}>{children}</Ctx.Provider>;
}

export function useProjectFloorPlans(): readonly ProjectFloorPlan[] {
  return useContext(Ctx);
}
