"use client";
/**
 * useExplorer — all interactive 3D state for one project site.
 * -----------------------------------------------------------------------------
 * Active building, explosion, isolated floor, X-ray, walk-through, photo
 * angles, rendering quality, capture, the city backdrop, buildings moved on
 * the site map (`moveBuilding`), and an imported CAD model (shown in
 * place of the procedural tower it was imported onto). Shared by the Studio, project pages
 * and the landing hero, so every explorer behaves identically; the result is
 * passed to <ExplorerViewport> and to any toolbar that needs it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Building, BuildingId, FloorData, ViewMode, ZoneId } from "@/types";
import type { PhotoAngle, Quality } from "@/lib/explorer";
import type { Object3D } from "three";
import { DEFAULT_CITY, type CityId } from "@/lib/cityPresets";
import { buildingClearing, PLINTH, type UWRect } from "@/lib/siteLayout";

/** Explosion factor applied by the "Exploded" view preset. */
const EXPLODED_PRESET = 1.5;

interface Options {
  /** Global keyboard shortcuts (Esc, ↑/↓). Only for full-page explorers. */
  keyboard?: boolean;
  /** Suspend keyboard shortcuts (e.g. while a modal is open). */
  keyboardPaused?: boolean;
  /** Never drop to Low automatically (offline renders). */
  lockQuality?: boolean;
  /** Initial city backdrop (usually the project's own city). */
  city?: CityId;
}

export function useExplorer(baseSite: Building[], { keyboard = false, keyboardPaused = false, lockQuality = false, city: initialCity = DEFAULT_CITY }: Options = {}) {
  // City backdrop for the urban context (New York, Miami, …)
  const [city, setCity] = useState<CityId>(initialCity);
  // Site plan edits: buildings moved on the map, as world [x, z] per building id.
  const [moved, setMoved] = useState<Partial<Record<BuildingId, [number, number]>>>({});
  const [mapOpen, setMapOpen] = useState(false);
  /** True while a building is being dragged on the map (the camera holds still). */
  const [dragging, setDragging] = useState(false);
  /** The site as currently laid out (moved buildings carry their new position). */
  const site = useMemo(() => baseSite.map((b) => (moved[b.id] ? { ...b, position: moved[b.id]! } : b)), [baseSite, moved]);
  const moveBuilding = useCallback((id: BuildingId, position: [number, number]) => setMoved((m) => ({ ...m, [id]: position })), []);
  const resetLayout = useCallback(() => setMoved({}), []);
  const layoutEdited = Object.keys(moved).length > 0;
  /** Context edits for moved buildings: neighbours to clear, and paving where they left the plinth. */
  const siteEdits = useMemo(() => {
    const clearings: UWRect[] = [];
    const pads: UWRect[] = [];
    for (const b of site) {
      if (!moved[b.id]) continue;
      clearings.push(buildingClearing(b, 2));
      const r = buildingClearing(b, 3);
      const onPlinth = r.u0 >= PLINTH.u0 && r.u1 <= PLINTH.u1 && r.w0 >= PLINTH.w0 && r.w1 <= PLINTH.w1;
      if (!onPlinth) pads.push(r);
    }
    return { clearings, pads };
  }, [site, moved]);
  const [activeBuildingId, setActiveBuildingId] = useState<BuildingId>(baseSite[0].id);
  const [explosion, setExplosion] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [xray, setXray] = useState(false);
  // Section cutaway: vertical clipping plane through the active building's core.
  const [sectionMode, setSectionMode] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  // First-person walk-through of the isolated floor
  const [walking, setWalking] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);
  const [viewNonce, setViewNonce] = useState(0);
  // Lift (walk-through): in the cab? floor passing by while riding, ride requests and arrivals.
  const [inLift, setInLift] = useState(false);
  const [liftFloor, setLiftFloor] = useState<number | null>(null);
  const [liftRide, setLiftRide] = useState({ target: -1, nonce: 0 });
  const [liftArrival, setLiftArrival] = useState({ index: -1, nonce: 0 });
  // Rendering quality: High = post-processing + reflections; drops to Low automatically on weak devices
  const [quality, setQualityState] = useState<Quality>("high");
  const [autoLowered, setAutoLowered] = useState(false);
  // Photo-angle presets and PNG capture
  const [photoAngle, setPhotoAngle] = useState<PhotoAngle | null>(null);
  const [photoNonce, setPhotoNonce] = useState(0);
  const captureRef = useRef<(() => Promise<void>) | null>(null);
  const [capturing, setCapturing] = useState(false);
  // Imported CAD model (normalised Object3D from lib/importNormalize) + visibility
  const [importedModel, setImportedModelState] = useState<Object3D | null>(null);
  const [showImported, setShowImported] = useState(true);

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
    if (lockQuality) return;
    setQualityState((q) => {
      if (q === "high") setAutoLowered(true);
      return "low";
    });
  }, [lockQuality]);

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

  /** Ride the lift (only honoured while standing in the cab) to floor `index`. */
  const rideTo = useCallback((index: number) => setLiftRide((r) => ({ target: index, nonce: r.nonce + 1 })), []);
  /** A ride ended: walk the destination floor, starting inside its lift. */
  const arriveByLift = useCallback((index: number) => {
    setSelectedIndex(index);
    setLiftArrival((a) => ({ index, nonce: a.nonce + 1 }));
    setLiftFloor(null);
  }, []);
  /** Lift plumbing handed to the scene's walk controller. */
  const lift = useMemo(
    () => ({ ride: liftRide, arrival: liftArrival, onInside: setInLift, onFloor: setLiftFloor, onArrive: arriveByLift }),
    [liftRide, liftArrival, arriveByLift]
  );

  // Walking needs an isolated floor; leaving the floor ends the walk.
  useEffect(() => {
    if (selectedIndex === null) setWalking(false);
  }, [selectedIndex]);
  useEffect(() => {
    if (!walking) {
      setInLift(false);
      setLiftFloor(null);
    }
  }, [walking]);

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
    setSectionMode(false);
    setResetNonce((n) => n + 1);
  }, []);

  /**
   * Show an imported model on the active building's plot (replacing the
   * procedural tower), or clear it with null. The previous model is disposed.
   */
  const setImportedModel = useCallback(
    (obj: Object3D | null) => {
      if (obj) obj.userData.buildingId = activeBuildingId;
      setImportedModelState((prev) => {
        if (prev && prev !== obj) {
          prev.traverse((o) => {
            const m = o as Object3D & { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
            m.geometry?.dispose();
            for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) mat.dispose();
          });
        }
        return obj;
      });
      setShowImported(true);
    },
    [activeBuildingId]
  );

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
    sectionMode,
    setSectionMode,
    resetNonce,
    resetView,
    reveal,
    importedModel,
    setImportedModel,
    showImported,
    setShowImported,
    viewMode,
    setViewMode,
    walking,
    startWalk,
    stopWalk,
    inLift,
    liftFloor,
    rideTo,
    lift,
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
    city,
    setCity,
    baseSite,
    moveBuilding,
    resetLayout,
    siteEdits,
    layoutEdited,
    mapOpen,
    setMapOpen,
    dragging,
    setDragging,
  };
}

export type ExplorerState = ReturnType<typeof useExplorer>;
