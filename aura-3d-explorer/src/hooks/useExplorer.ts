"use client";
/**
 * useExplorer — all interactive 3D state for one project site.
 * -----------------------------------------------------------------------------
 * Active building, explosion, isolated floor, X-ray, walk-through, photo
 * angles, rendering quality and capture. Shared by the Studio, project pages
 * and the landing hero, so every explorer behaves identically; the result is
 * passed to <ExplorerViewport> and to any toolbar that needs it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Building, BuildingId, FloorData, ViewMode, ZoneId } from "@/types";
import type { PhotoAngle, Quality } from "@/lib/explorer";

/** Explosion factor applied by the "Exploded" view preset. */
const EXPLODED_PRESET = 1.5;

interface Options {
  /** Global keyboard shortcuts (Esc, ↑/↓). Only for full-page explorers. */
  keyboard?: boolean;
  /** Suspend keyboard shortcuts (e.g. while a modal is open). */
  keyboardPaused?: boolean;
}

export function useExplorer(site: Building[], { keyboard = false, keyboardPaused = false }: Options = {}) {
  const [activeBuildingId, setActiveBuildingId] = useState<BuildingId>(site[0].id);
  const [explosion, setExplosion] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [xray, setXray] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  // First-person walk-through of the isolated floor
  const [walking, setWalking] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);
  const [viewNonce, setViewNonce] = useState(0);
  // Rendering quality: High = post-processing + reflections; drops to Low automatically on weak devices
  const [quality, setQualityState] = useState<Quality>("high");
  const [autoLowered, setAutoLowered] = useState(false);
  // Photo-angle presets and PNG capture
  const [photoAngle, setPhotoAngle] = useState<PhotoAngle | null>(null);
  const [photoNonce, setPhotoNonce] = useState(0);
  const captureRef = useRef<(() => Promise<void>) | null>(null);
  const [capturing, setCapturing] = useState(false);

  const building = site.find((b) => b.id === activeBuildingId) ?? site[0];
  const selectedFloor: FloorData | null = selectedIndex !== null ? building.floors[selectedIndex] ?? null : null;
  const floorCount = building.floors.length;

  // The view-mode toggle reflects the current state rather than holding its own.
  const viewMode: ViewMode = selectedIndex !== null ? "interior" : explosion > 0 ? "exploded" : "massing";

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setPhotoAngle(null);
      if (mode === "massing") {
        setSelectedIndex(null);
        setExplosion(0);
      } else if (mode === "exploded") {
        setSelectedIndex(null);
        setExplosion(EXPLODED_PRESET);
      } else {
        // Interior: open up the stack and isolate a residential floor.
        setExplosion((e) => Math.max(e, 1));
        setSelectedIndex((i) => i ?? Math.min(building.zones.residential.floors[0] + 1, building.floors.length - 1));
      }
    },
    [building]
  );

  const setQuality = useCallback((q: Quality) => {
    setQualityState(q);
    setAutoLowered(false);
  }, []);
  const lowerQualityAutomatically = useCallback(() => {
    setQualityState((q) => {
      if (q === "high") setAutoLowered(true);
      return "low";
    });
  }, []);

  const choosePhotoAngle = useCallback((a: PhotoAngle) => {
    setSelectedIndex(null);
    setPhotoAngle(a);
    setPhotoNonce((n) => n + 1);
  }, []);

  const capture = useCallback(async () => {
    if (!captureRef.current) return;
    setCapturing(true);
    try {
      await captureRef.current();
    } finally {
      setCapturing(false);
    }
  }, []);

  const startWalk = useCallback(() => {
    setViewIndex(0);
    setViewNonce((n) => n + 1);
    setWalking(true);
  }, []);
  const goToView = useCallback((i: number) => {
    setViewIndex(i);
    setViewNonce((n) => n + 1);
  }, []);
  const stopWalk = useCallback(() => setWalking(false), []);

  // Walking needs an isolated floor; leaving the floor ends the walk.
  useEffect(() => {
    if (selectedIndex === null) setWalking(false);
  }, [selectedIndex]);

  /** Switch the active building (keeps the explosion, clears the selection). */
  const selectBuilding = useCallback((id: BuildingId) => {
    setActiveBuildingId(id);
    setSelectedIndex(null);
  }, []);

  /** Floor clicked in the 3D scene (in any building), or null to release. */
  const selectFloor = useCallback(
    (floor: FloorData | null) => {
      if (!floor) return setSelectedIndex(null);
      if (floor.buildingId !== activeBuildingId) setActiveBuildingId(floor.buildingId);
      setSelectedIndex(floor.index);
      setPhotoAngle(null);
    },
    [activeBuildingId]
  );

  const resetView = useCallback(() => {
    setPhotoAngle(null);
    setSelectedIndex(null);
    setExplosion(0);
    setXray(false);
    setResetNonce((n) => n + 1);
  }, []);

  /** Reveal the model with an exploded fly-around (after a CAD ingest). */
  const reveal = useCallback(() => {
    setPhotoAngle(null);
    setSelectedIndex(null);
    setExplosion(1.2);
    setResetNonce((n) => n + 1);
  }, []);

  const focusZone = useCallback((zone: ZoneId) => setSelectedIndex(building.zones[zone].floors[0] - 1), [building]);

  const stepFloor = useCallback(
    (delta: 1 | -1) => setSelectedIndex((i) => (i === null ? i : Math.min(floorCount - 1, Math.max(0, i + delta)))),
    [floorCount]
  );

  // Keyboard: Esc releases the floor, ↑ / ↓ step through the active tower.
  // While walking, arrows move the walker (handled in WalkControls) and Esc exits.
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (keyboardPaused) return;
      if (walking) {
        if (e.key === "Escape") setWalking(false);
        return;
      }
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [role='slider'], [role='radio'], [role='dialog']")) return;
      if (e.key === "Escape") setSelectedIndex(null);
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const d = e.key === "ArrowUp" ? 1 : -1;
        setSelectedIndex((i) => (i === null ? (d === 1 ? 0 : floorCount - 1) : Math.min(floorCount - 1, Math.max(0, i + d))));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, keyboardPaused, floorCount, walking]);

  return {
    site,
    building,
    activeBuildingId,
    selectBuilding,
    explosion,
    setExplosion,
    selectedIndex,
    selectedFloor,
    selectFloor,
    stepFloor,
    focusZone,
    xray,
    setXray,
    resetNonce,
    resetView,
    reveal,
    viewMode,
    setViewMode,
    walking,
    startWalk,
    stopWalk,
    viewIndex,
    viewNonce,
    goToView,
    quality,
    setQuality,
    autoLowered,
    lowerQualityAutomatically,
    photoAngle,
    photoNonce,
    choosePhotoAngle,
    captureRef,
    capture,
    capturing,
  };
}

export type ExplorerState = ReturnType<typeof useExplorer>;
