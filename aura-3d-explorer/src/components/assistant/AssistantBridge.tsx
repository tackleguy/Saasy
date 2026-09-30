"use client";
/**
 * AssistantBridge — lets the AURA assistant see and drive the page's explorer.
 * -----------------------------------------------------------------------------
 * <AssistantBridgeProvider> wraps the site once (app/(site)/layout.tsx). Any
 * component that owns an explorer registers it with ONE line:
 *
 *   useRegisterExplorer(x, { project, yieldCalc });
 *
 * The latest explorer / project / yield state is held in a ref (no re-renders
 * on every explorer change); the assistant reads it when it builds context and
 * when it dispatches actions. Without a provider the hook is a no-op, so hosts
 * also work on routes outside the (site) group (/render, /tour).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ExplorerState } from "@/hooks/useExplorer";
import type { YieldCalculator } from "@/hooks/useYieldCalculator";
import type { Project } from "@/content/projects";

export interface AssistantRegistration {
  explorer?: ExplorerState | null;
  project?: Project | null;
  yieldCalc?: YieldCalculator | null;
}

interface BridgeValue {
  /** Latest registration (read at call time — never stale). */
  current: () => AssistantRegistration;
  /** Bumped when a host mounts / unmounts, so the panel can refresh its chips. */
  version: number;
  register: (id: symbol, reg: AssistantRegistration) => void;
  unregister: (id: symbol) => void;
}

const BridgeContext = createContext<BridgeValue | null>(null);

export function AssistantBridgeProvider({ children }: { children: ReactNode }) {
  // Several hosts could mount at once; the most recently registered wins.
  const regs = useRef(new Map<symbol, AssistantRegistration>());
  const [version, setVersion] = useState(0);

  const register = useCallback((id: symbol, reg: AssistantRegistration) => {
    const isNew = !regs.current.has(id);
    regs.current.set(id, reg); // updating keeps insertion order
    if (isNew) setVersion((v) => v + 1);
  }, []);
  const unregister = useCallback((id: symbol) => {
    if (regs.current.delete(id)) setVersion((v) => v + 1);
  }, []);
  const current = useCallback(() => {
    const all = [...regs.current.values()];
    return all[all.length - 1] ?? {};
  }, []);

  const value = useMemo(() => ({ current, version, register, unregister }), [current, version, register, unregister]);
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

/** Register this page's explorer (and optionally its project + yield engine) with the assistant. */
export function useRegisterExplorer(explorer: ExplorerState | null | undefined, extras: Omit<AssistantRegistration, "explorer"> = {}) {
  const bridge = useContext(BridgeContext);
  const [id] = useState(() => Symbol("explorer"));
  const { project, yieldCalc } = extras;
  // Depend only on the stable callbacks: `bridge` itself changes with `version`,
  // and unregistering on that change would bump `version` again, forever.
  const register = bridge?.register;
  const unregister = bridge?.unregister;
  // Refresh on every render so the assistant always sees the latest state.
  useEffect(() => {
    register?.(id, { explorer, project, yieldCalc });
  });
  useEffect(() => () => unregister?.(id), [unregister, id]);
}

/** Assistant side: access to the registered host (null outside the provider). */
export function useAssistantBridge() {
  return useContext(BridgeContext);
}
