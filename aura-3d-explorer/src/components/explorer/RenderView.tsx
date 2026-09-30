"use client";
/**
 * RenderView — bare full-screen scene for offline photography (see
 * /render/[slug] and scripts/capture-heroes.mjs). Sets the requested photo
 * angle or walk-through view once the explorer is ready, always in High
 * quality, no intro dolly, and flags `data-render-ready` on <html> a few
 * seconds after mount so the capture script knows the frame is settled.
 */
import { useEffect, useState } from "react";
import type { Project } from "@/content/projects";
import { projectSite } from "@/content/projects";
import { useExplorer } from "@/hooks/useExplorer";
import type { PhotoAngle } from "@/lib/explorer";
import ExplorerViewport from "./ExplorerViewport";
import { isCityId, type CityId } from "@/lib/cityPresets";

export interface RenderParams {
  angle: PhotoAngle;
  building?: string;
  walk: boolean;
  floor?: number;
  view: number;
  /** City backdrop override (defaults to the project's own). */
  city?: CityId;
}

/** Parse the query string (client only). */
function readParams(): RenderParams {
  const q = new URLSearchParams(window.location.search);
  return {
    angle: (q.get("angle") as PhotoAngle) ?? "waterfront",
    building: q.get("building") ?? undefined,
    walk: q.get("walk") === "1",
    floor: q.get("floor") ? Number(q.get("floor")) : undefined,
    view: q.get("view") ? Number(q.get("view")) : 0,
    city: isCityId(q.get("city")) ? (q.get("city") as CityId) : undefined,
  };
}

export default function RenderView({ project }: { project: Project }) {
  const [params] = useState<RenderParams>(() => (typeof window === "undefined" ? { angle: "waterfront", walk: false, view: 0 } : readParams()));
  const site = projectSite(project);
  const x = useExplorer(site, { lockQuality: true, city: params.city ?? project.backdrop });
  const building = site.find((b) => b.id === params.building) ?? site[0];

  useEffect(() => {
    x.setQuality("high");
    if (building.id !== x.activeBuildingId) x.selectBuilding(building.id);
    if (params.walk) {
      const floorIndex = params.floor ?? building.zones.residential.floors[0] + 1;
      x.selectFloor(building.floors[Math.min(floorIndex, building.floors.length - 1)]);
      // Let the focus snap land, then step inside and glide to the view.
      const t = setTimeout(() => {
        x.startWalk();
        x.goToView(params.view);
      }, 600);
      return () => clearTimeout(t);
    }
    x.choosePhotoAngle(params.angle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building.id, params.angle, params.walk, params.floor, params.view]);

  // Walk flag so the capture script can wait for the walk-through to start.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-walking", x.walking);
  }, [x.walking]);

  // Ready flag for the capture script (the scene needs a few frames to settle).
  useEffect(() => {
    const t = setTimeout(() => document.documentElement.setAttribute("data-render-ready", "1"), 6000);
    return () => clearTimeout(t);
  }, []);

  return <ExplorerViewport explorer={x} variant="bare" intro={false} className="h-dvh w-screen" />;
}
