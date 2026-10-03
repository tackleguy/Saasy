"use client";

import {
  Component, Suspense, createContext, useCallback, useContext, useEffect,
  useId, useState, type ReactNode,
} from "react";
import { useGLTF } from "@react-three/drei";
import { RotateCcw, TriangleAlert } from "lucide-react";

interface Failure {
  label: string;
  retrying: boolean;
  retry: () => void;
}

type Report = (id: string, failure: Failure | null) => void;
const RecoveryContext = createContext<Report | null>(null);

/** Own feedback per viewport, outside the canvas and outside suspended scenery.
 * A background asset must never replace the customer's project with a page error. */
export function ContextModelRecoveryProvider({ children }: { children: ReactNode }) {
  const [failures, setFailures] = useState<ReadonlyMap<string, Failure>>(() => new Map());
  const report = useCallback<Report>((id, failure) => {
    setFailures((previous) => {
      if (!failure && !previous.has(id)) return previous;
      const next = new Map(previous);
      if (failure) next.set(id, failure);
      else next.delete(id);
      return next;
    });
  }, []);

  return (
    <RecoveryContext.Provider value={report}>
      {children}
      {failures.size > 0 && (
        <div aria-label="Background model recovery" className="absolute inset-x-3 top-24 z-40 max-h-[50%] overflow-y-auto sm:right-auto sm:w-80">
          <ul className="space-y-2">
            {[...failures].map(([id, failure]) => (
              <li key={id} className="rounded-xl border border-plaster bg-paper p-3 text-sm text-ink">
                <div role="status" aria-live="polite" aria-atomic="true">
                  <p className="flex items-center gap-2 font-medium">
                    <TriangleAlert size={16} className="shrink-0" aria-hidden="true" />
                    {failure.retrying ? `Loading ${failure.label.toLowerCase()}…` : `${failure.label} couldn’t load.`}
                  </p>
                  <p className="mt-1 leading-relaxed">Your project is still available. You can retry without reloading.</p>
                </div>
                <button
                  type="button"
                  aria-label={`Retry ${failure.label.toLowerCase()}`}
                  disabled={failure.retrying}
                  onClick={failure.retry}
                  className="mt-2 inline-flex min-h-11 items-center gap-2 rounded border border-ink px-3 font-medium hover:bg-stone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  {failure.retrying ? "Retrying…" : "Retry"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </RecoveryContext.Provider>
  );
}

class AssetBoundary extends Component<{
  children: ReactNode;
  onFailure: () => void;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function AssetReady({ onReady }: { onReady: () => void }) {
  // This commits only after the sibling loader has resolved its Suspense boundary.
  useEffect(onReady, [onReady]);
  return null;
}

/** `resource` must be the same string or URL array passed to useGLTF. In
 * particular, a multi-model load has one cache key, not one key per URL. */
export function RecoverableContextModel({ label, resource, children }: {
  label: string;
  resource: string | string[];
  children: ReactNode;
}) {
  const report = useContext(RecoveryContext);
  const id = useId();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "retrying">("loading");
  const clear = useCallback(() => report?.(id, null), [id, report]);
  const ready = useCallback(() => setStatus("ready"), []);
  const retry: () => void = useCallback(() => {
    useGLTF.clear(resource);
    setStatus("retrying");
    setAttempt((previous) => previous + 1);
  }, [resource]);
  const fail = useCallback(() => setStatus("failed"), []);

  // A city/context change removes its message and stale retry closure. Cached
  // source assets remain owned by useGLTF; this boundary never disposes them.
  // Mirror state in an effect so StrictMode's cleanup/setup replay restores it.
  useEffect(() => {
    if (status === "failed" || status === "retrying") report?.(id, { label, retrying: status === "retrying", retry });
    else clear();
    return clear;
  }, [status, id, label, report, retry, clear]);

  return (
    <AssetBoundary key={attempt} onFailure={fail}>
      <Suspense fallback={null}>
        {children}
        <AssetReady onReady={ready} />
      </Suspense>
    </AssetBoundary>
  );
}
