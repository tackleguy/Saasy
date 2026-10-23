"use client";
/**
 * The one reduced-motion source for the whole app.
 *
 * `prefersReducedMotion()` is safe to call every frame inside `useFrame`
 * (it reads a cached MediaQueryList). `usePrefersReducedMotion()` re-renders
 * when the operating-system preference changes. With the preference on,
 * ambient 3D motion (traffic, pedestrians, water, canopy sway, clouds, boats,
 * idle orbit) holds still and camera moves cut instead of easing.
 */
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
let media: MediaQueryList | null = null;
const query = () => (media ??= typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null);

export function prefersReducedMotion(): boolean {
  return query()?.matches ?? false;
}

function subscribe(onChange: () => void) {
  const list = query();
  list?.addEventListener("change", onChange);
  return () => list?.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
