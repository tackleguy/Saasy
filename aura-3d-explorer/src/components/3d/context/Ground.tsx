"use client";
/**
 * Ground — paved plinth, sidewalks, the textured main road with curbs and
 * zebra crossings, the promenade, and the secondary street grid behind and
 * beside the site.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { LAYOUT, SITE_ROTATION_Y, uwToXZ } from "@/lib/siteLayout";
import { asphaltBump, asphaltTexture, concreteBump, concreteTexture, earthBump, earthTexture, pavingBump, pavingTexture, repeatTexture, roadBump, roadTexture, stoneBump, stoneTexture } from "../textures";
import { FLAT_UW, noRaycast, placeUW, uploadInstances } from "./shared";
import { cityPlan } from "./cityPlan";
import type { UWRect } from "@/lib/siteLayout";
import type { CityPreset } from "@/lib/cityPresets";

/** A flat textured rectangle spanning [w0, w1] along w and [u0, u1] along u. */
function Slab({ u0, u1, w0, w1, y, map, bump, tile, color = "#ffffff", roughness = 0.9, bumpScale = 0.045 }: { u0: number; u1: number; w0: number; w1: number; y: number; map: THREE.Texture; bump?: THREE.Texture; tile: number; color?: string; roughness?: number; bumpScale?: number }) {
  const [x, z] = uwToXZ((u0 + u1) / 2, (w0 + w1) / 2);
  const rx = (u1 - u0) / tile;
  const ry = (w1 - w0) / tile;
  const tex = useMemo(() => repeatTexture(map, rx, ry), [map, rx, ry]);
  const relief = useMemo(() => (bump ? repeatTexture(bump, rx, ry) : null), [bump, rx, ry]);
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, SITE_ROTATION_Y]} receiveShadow raycast={noRaycast}>
      <planeGeometry args={[u1 - u0, w1 - w0]} />
      <meshStandardMaterial map={tex} bumpMap={relief ?? undefined} bumpScale={bumpScale} color={color} roughness={roughness} />
    </mesh>
  );
}

/** Zebra crossings across the main road every 60 units. */
function Crossings() {
  const matrices = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (const u of [-150, -90, -30, 30, 90, 150]) {
      for (let w = LAYOUT.road[0] + 0.7; w < LAYOUT.road[1] - 0.3; w += 1.0) out.push(placeUW(u, w, 0.014, FLAT_UW, new THREE.Vector3(2.6, 0.5, 1)));
    }
    return out;
  }, []);
  return (
    <instancedMesh ref={(m) => uploadInstances(m, matrices)} args={[undefined, undefined, matrices.length]} raycast={noRaycast}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color="#f1eee7" roughness={0.85} />
    </instancedMesh>
  );
}

/** Raised kerbs along both edges of the main road. */
function Kerbs() {
  const half = LAYOUT.streetHalfLength;
  const map = useMemo(() => repeatTexture(concreteTexture(), 48, 1), []);
  const bump = useMemo(() => repeatTexture(concreteBump(), 48, 1), []);
  return (
    <>
      {[LAYOUT.road[0], LAYOUT.road[1]].map((w) => {
        const [x, z] = uwToXZ(0, w);
        return (
          <mesh key={w} position={[x, 0.05, z]} rotation={[0, SITE_ROTATION_Y, 0]} receiveShadow castShadow raycast={noRaycast}>
            <boxGeometry args={[half * 2, 0.1, 0.22]} />
            <meshStandardMaterial map={map} bumpMap={bump} bumpScale={0.04} color="#e4dfd6" roughness={0.88} />
          </mesh>
        );
      })}
    </>
  );
}

export default function Ground({ preset, pads = [] }: { preset: CityPreset; pads?: UWRect[] }) {
  const L = LAYOUT;
  const half = L.streetHalfLength;
  const paving = pavingTexture();
  const pavingRelief = pavingBump();
  const asphalt = asphaltTexture();
  const asphaltRelief = asphaltBump();
  const stone = stoneTexture();
  const stoneRelief = stoneBump();
  const road = roadTexture();
  const roadRelief = roadBump();
  const earth = useMemo(() => repeatTexture(earthTexture(), 56, 56), []);
  const earthRelief = useMemo(() => repeatTexture(earthBump(), 56, 56), []);

  return (
    <group>
      {/* Far ground */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow raycast={noRaycast}>
        <circleGeometry args={[700, 48]} />
        <meshStandardMaterial map={earth} bumpMap={earthRelief} bumpScale={0.08} color={preset.ground} roughness={1} />
      </mesh>

      {/* Paved plinth under the towers (extends back to carry the supertall) */}
      <Slab u0={-52} u1={52} w0={-L.plinthBackDepth} w1={L.plinthHalfDepth} y={0.004} map={stone} bump={stoneRelief} tile={6} color="#f0ebe3" roughness={0.72} bumpScale={0.06} />

      {/* Main street: sidewalk · road · sidewalk · promenade */}
      <Slab u0={-half} u1={half} w0={L.sidewalkNear[0]} w1={L.sidewalkNear[1]} y={0.03} map={paving} bump={pavingRelief} tile={4} bumpScale={0.07} />
      <Slab u0={-half} u1={half} w0={L.road[0]} w1={L.road[1]} y={0.006} map={road} bump={roadRelief} tile={L.road[1] - L.road[0]} roughness={0.94} bumpScale={0.035} />
      <Crossings />
      <Kerbs />
      <Slab u0={-half} u1={half} w0={L.sidewalkFar[0]} w1={L.sidewalkFar[1]} y={0.03} map={paving} bump={pavingRelief} tile={4} bumpScale={0.07} />
      <Slab u0={-half} u1={half} w0={L.promenade[0]} w1={L.promenade[1]} y={0.03} map={stone} bump={stoneRelief} tile={3} color={preset.promenade} roughness={0.78} bumpScale={0.05} />

      {/* Paved pads under buildings moved off the plinth on the site map */}
      {pads.map((p, i) => (
        <Slab key={`pad${i}`} u0={p.u0} u1={p.u1} w0={p.w0} w1={p.w1} y={0.012} map={stone} bump={stoneRelief} tile={6} color="#f0ebe3" roughness={0.72} bumpScale={0.06} />
      ))}

      {/* Secondary street grid */}
      {cityPlan(preset).streets.map((s, i) => (
        <Slab key={i} u0={s.u0} u1={s.u1} w0={s.w0} w1={s.w1} y={0.005} map={asphalt} bump={asphaltRelief} tile={6} roughness={0.96} bumpScale={0.04} />
      ))}
    </group>
  );
}
