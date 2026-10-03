"use client";
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Building } from "@/types";
import { geographicToWorld, type ProjectLocation } from "@/lib/geographicContext";
import { fetchDowntownTile, type DowntownManifest, type DowntownTile } from "@/lib/downtownContext";
import { createDowntownGeometryBuilder } from "@/lib/downtownGeometry";
import type { MapBatchKind, MappedGeometry } from "@/lib/mappedGeometry";
import { MAP_RENDER_ORDER } from "@/lib/renderDepth";
import { abortUnwantedDowntownLoads, outerProposalSignature } from "@/lib/downtownStreaming";
import { useCinematic } from "../environment/settings";
import { noRaycast } from "./shared";

export interface DowntownProgress { id: string; visible: number; ready: number; pending: number; failed: number }
type Record = { tile: DowntownTile; box: THREE.Box3; centre: THREE.Vector3; state: "idle" | "loading" | "ready" | "failed"; group?: THREE.Group; data?: MappedGeometry; bytes: number; lastUsed: number; controller?: AbortController };
const EMPTY_BUILDINGS: Building[] = [];
const bufferBytes = (data: MappedGeometry) => data.batches.reduce((sum, batch) => sum + Object.values(batch.geometry.attributes).reduce((total, a) => total + a.array.byteLength, 0) + (batch.geometry.index?.array.byteLength ?? 0), 0);
const release = (record: Record, host: THREE.Group) => { if (record.group) host.remove(record.group); record.data?.dispose(); record.data = undefined; record.group = undefined; record.bytes = 0; record.state = "idle"; };

/** Full mapped coverage streams by visible tile. Only off-screen cached geometry
 * is evicted; a memory preference never silently removes visible geography. */
export default function DowntownContext({ manifest, location, buildings, materials, retry, onProgress }: {
  manifest: DowntownManifest; location: ProjectLocation; buildings: Building[];
  materials: { [K in MapBatchKind]: THREE.Material }; retry: number;
  onProgress: (progress: DowntownProgress) => void;
}) {
  const host = useRef<THREE.Group>(null);
  const { tier } = useCinematic();
  const current = useRef<{ plan: (camera: THREE.Camera, now: number, budget: number) => void; retry: () => void } | null>(null);
  const progressCallback = useRef(onProgress);
  progressCallback.current = onProgress;
  // Outer tiles are clipped around the detailed site's original bounds. A moved
  // proposal can still extend into them; clear only those intersecting tiles.
  const buildingsRef = useRef(buildings); buildingsRef.current = buildings;
  const proposalSignature = outerProposalSignature(manifest.nearBounds, location, buildings);
  useEffect(() => {
    const group = host.current;
    if (!group) return;
    let disposed = false, active = 0, lastPlan = -Infinity, lastProgress = "";
    let wanted = new Set<string>();
    const records = manifest.tiles.map(tile => {
      const a = geographicToWorld([tile.bounds[0], tile.bounds[1]], location), b = geographicToWorld([tile.bounds[2], tile.bounds[3]], location);
      const box = new THREE.Box3(new THREE.Vector3(Math.min(a[0], b[0]), -.1, Math.min(a[1], b[1])), new THREE.Vector3(Math.max(a[0], b[0]), 450, Math.max(a[1], b[1])));
      return { tile, box, centre: box.getCenter(new THREE.Vector3()), state: "idle", bytes: 0, lastUsed: 0 } as Record;
    });
    const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4(), cameraPoint = new THREE.Vector3();
    const publish = () => {
      const visible = records.filter(record => wanted.has(record.tile.id));
      const progress = { id: manifest.id, visible: visible.length, ready: visible.filter(record => record.state === "ready").length, pending: visible.filter(record => record.state === "idle" || record.state === "loading").length, failed: visible.filter(record => record.state === "failed").length };
      const ready = records.filter(record => record.state === "ready");
      group.userData = { sourceId: manifest.id, bounds: manifest.bounds, totalTiles: records.length, loadedTiles: ready.length, visibleTiles: progress.visible, pendingTiles: progress.pending, failedTiles: progress.failed, renderedFeatures: ready.reduce((sum, record) => sum + record.tile.features, 0), geometryBytes: ready.reduce((sum, record) => sum + record.bytes, 0) };
      const key = JSON.stringify(progress);
      if (key !== lastProgress && !disposed) { lastProgress = key; progressCallback.current(progress); }
    };
    const pump = () => {
      if (disposed) return;
      const queue = records.filter(record => wanted.has(record.tile.id) && record.state === "idle").sort((a, b) => a.centre.distanceToSquared(cameraPoint) - b.centre.distanceToSquared(cameraPoint));
      while (active < 2 && queue.length) {
        const record = queue.shift()!;
        active++; record.state = "loading";
        const controller = new AbortController(); record.controller = controller;
        void (async () => {
          let builder: ReturnType<typeof createDowntownGeometryBuilder> | undefined;
          try {
            const snapshot = await fetchDowntownTile(record.tile, { signal: controller.signal });
            if (disposed || controller.signal.aborted) throw new DOMException("Downtown tile no longer needed", "AbortError");
            const nearby = buildingsRef.current.filter(building => {
              const radius = Math.max(...building.floors.map(floor => Math.hypot(floor.width, floor.depth))) / 2;
              return building.position[0] + radius >= record.box.min.x && building.position[0] - radius <= record.box.max.x && building.position[1] + radius >= record.box.min.z && building.position[1] - radius <= record.box.max.z;
            });
            builder = createDowntownGeometryBuilder(snapshot, location, nearby.length ? nearby : EMPTY_BUILDINGS);
            while (!builder.complete && !disposed && !controller.signal.aborted) {
              const started = performance.now();
              do { builder.step(1); } while (!builder.complete && performance.now() - started < 4);
              if (!builder.complete) await new Promise(resolve => setTimeout(resolve, 0));
            }
            if (disposed || controller.signal.aborted) throw new DOMException("Downtown tile no longer needed", "AbortError");
            const data = builder.finish(), tileGroup = new THREE.Group(); tileGroup.name = record.tile.id;
            for (const batch of data.batches) {
              const mesh = batch.kind === "roads" ? new THREE.LineSegments(batch.geometry, materials.roads) : new THREE.Mesh(batch.geometry, materials[batch.kind]);
              mesh.name = `downtown-${batch.kind}`; mesh.renderOrder = MAP_RENDER_ORDER[batch.kind]; mesh.raycast = noRaycast;
              // The distant city never participates in the project's shadow map.
              mesh.castShadow = false; mesh.receiveShadow = false;
              tileGroup.add(mesh);
            }
            // Cached geometry stays available every frame. Three's mesh-level
            // frustum culling follows the live camera; the slower tile planner
            // is only for requests and off-screen memory eviction.
            record.data = data; record.bytes = bufferBytes(data); record.group = tileGroup; record.state = "ready";
            group.add(tileGroup);
          } catch {
            builder?.cancel();
            if (!disposed) record.state = controller.signal.aborted ? "idle" : "failed";
          } finally { active--; record.controller = undefined; if (!disposed) { publish(); pump(); } }
        })();
      }
      publish();
    };
    current.current = {
      plan(camera, now, budget) {
        if (disposed || now - lastPlan < 350) return;
        lastPlan = now;
        camera.updateMatrixWorld(); cameraPoint.copy(camera.position);
        matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(matrix);
        wanted = new Set(records.filter(record => frustum.intersectsBox(record.box)).map(record => record.tile.id));
        abortUnwantedDowntownLoads(records, wanted);
        for (const record of records) {
          const visible = wanted.has(record.tile.id);
          if (visible) record.lastUsed = now;
        }
        let bytes = records.reduce((sum, record) => sum + record.bytes, 0);
        for (const record of records.filter(record => record.state === "ready" && !wanted.has(record.tile.id)).sort((a, b) => a.lastUsed - b.lastUsed)) {
          if (bytes <= budget) break;
          bytes -= record.bytes; release(record, group);
        }
        pump();
      },
      retry() { for (const record of records) if (record.state === "failed") record.state = "idle"; pump(); },
    };
    return () => { disposed = true; current.current = null; for (const record of records) { record.controller?.abort(); release(record, group); } };
  }, [manifest, location.latitude, location.longitude, materials, proposalSignature]);
  useEffect(() => { current.current?.retry(); }, [retry]);
  useFrame(({ camera }) => current.current?.plan(camera, performance.now(), (tier === "low" ? 96 : 192) * 1024 * 1024));
  return <group ref={host} name="downtown-context" dispose={null} />;
}
