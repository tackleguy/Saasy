"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchDowntownManifest, type DowntownManifest } from "@/lib/downtownContext";
import { downtownRetryTarget } from "@/lib/downtownStreaming";

/** Downtown data is published with the app. Project coordinates never enter a request. */
export function useDowntownMap(id: string | undefined) {
  const [loaded, setLoaded] = useState<DowntownManifest | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [manifestAttempt, setManifestAttempt] = useState(0);
  const [tileAttempt, setTileAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setFailed(null);
    void fetchDowntownManifest(id, { signal: controller.signal }).then(manifest => {
      if (!controller.signal.aborted) setLoaded(manifest);
    }).catch(error => {
      if (!controller.signal.aborted) setFailed({ id, message: error instanceof Error ? error.message : "Downtown could not load. Please retry." });
    });
    return () => controller.abort();
  }, [id, manifestAttempt]);
  const manifest = loaded?.id === id ? loaded : null;
  const error = failed && failed.id === id ? failed.message : "";
  const retry = useCallback(() => {
    const target = downtownRetryTarget(id, loaded, failed);
    if (target === "manifest") setManifestAttempt(value => value + 1);
    else if (target === "tiles") setTileAttempt(value => value + 1);
  }, [id, loaded, failed]);
  return { manifest, error, loading: !!id && !manifest && !error, retry, tileAttempt };
}
