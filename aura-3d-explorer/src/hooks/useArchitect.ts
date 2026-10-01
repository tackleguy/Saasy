"use client";
/**
 * useArchitect — state for the Studio's Architect mode.
 * -----------------------------------------------------------------------------
 * Drawing view (perspective / plan / elevations), measure tool and its
 * measurements, level markers, clay render, sun study (month + solar time at
 * the city's latitude) and zoning limits (height, FAR, coverage). Returns
 * the UI state plus `scene`, the slice the 3D scene reads (undefined outside
 * Architect mode, so Developer mode renders exactly as before).
 */
import { useCallback, useMemo, useState } from "react";
import type { Building } from "@/types";
import { dayOfYear, roundUp, siteSchedule, sunPosition, type ArchitectSceneState, type ArchView, type Measurement, type Vec3 } from "@/lib/architecture";

export type StudioMode = "developer" | "architect";

interface Options {
  /** Latitude of the city backdrop, degrees. */
  latitude: number;
  /** Project site area, sq ft (for FAR and coverage). */
  siteAreaSqFt: number;
  /** True while the Studio is in Architect mode. */
  active: boolean;
}

export function useArchitect(site: Building[], { latitude, siteAreaSqFt, active }: Options) {
  const schedule = useMemo(() => siteSchedule(site, siteAreaSqFt), [site, siteAreaSqFt]);

  // Drawing view; the nonce re-frames even when the same view is picked again.
  const [view, setViewState] = useState<ArchView>("perspective");
  const [viewNonce, setViewNonce] = useState(0);
  const setView = useCallback((v: ArchView) => {
    setViewState(v);
    setViewNonce((n) => n + 1);
  }, []);

  // Measure tool
  const [measuring, setMeasuring] = useState(false);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const addMeasurement = useCallback((a: Vec3, b: Vec3) => setMeasurements((list) => [...list, { id: Date.now() + list.length, a, b }].slice(-8)), []);
  const removeMeasurement = useCallback((id: number) => setMeasurements((list) => list.filter((m) => m.id !== id)), []);
  const clearMeasurements = useCallback(() => setMeasurements([]), []);

  // Presentation
  const [dimensions, setDimensions] = useState(true);
  const [clay, setClay] = useState(false);

  // Sun study: 21st of the month, local solar time.
  const [sunStudy, setSunStudy] = useState(false);
  const [month, setMonth] = useState(5); // June (summer solstice)
  const [hour, setHour] = useState(15);
  const sun = useMemo(() => sunPosition(latitude, dayOfYear(month), hour), [latitude, month, hour]);

  // Zoning envelope: defaults the current scheme passes, rounded to tidy values.
  const [zoning, setZoning] = useState(true);
  const [heightLimitM, setHeightLimitM] = useState(() => roundUp(schedule.tallestM * 1.05, 10));
  const [farLimit, setFarLimit] = useState(() => roundUp(schedule.far * 1.1, 0.5));
  const [coverageLimit, setCoverageLimit] = useState(() => Math.min(100, roundUp(schedule.coverage * 100 * 1.1, 5)));

  const scene = useMemo<ArchitectSceneState | undefined>(
    () =>
      active
        ? {
            view,
            viewNonce,
            measuring,
            measurements,
            onMeasure: addMeasurement,
            dimensions,
            clay,
            sun: sunStudy ? sun : null,
            heightLimitM: zoning ? heightLimitM : null,
          }
        : undefined,
    [active, view, viewNonce, measuring, measurements, addMeasurement, dimensions, clay, sunStudy, sun, zoning, heightLimitM]
  );

  return {
    schedule,
    view,
    setView,
    measuring,
    setMeasuring,
    measurements,
    removeMeasurement,
    clearMeasurements,
    dimensions,
    setDimensions,
    clay,
    setClay,
    sunStudy,
    setSunStudy,
    month,
    setMonth,
    hour,
    setHour,
    sun,
    zoning,
    setZoning,
    heightLimitM,
    setHeightLimitM,
    farLimit,
    setFarLimit,
    coverageLimit,
    setCoverageLimit,
    scene,
  };
}

export type ArchitectState = ReturnType<typeof useArchitect>;
