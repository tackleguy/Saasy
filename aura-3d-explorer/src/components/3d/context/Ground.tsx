"use client";
/**
 * Ground — paved plinth, sidewalks, the textured main road with curbs and
 * zebra crossings, the promenade, and the secondary street grid behind and
 * beside the site.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { LAYOUT, SITE_ROTATION_Y, uwToXZ } from "@/lib/siteLayout";
import { asphaltTexture, concreteTexture, pavingTexture, roadTexture, stoneTexture } from "../textures";
import { FLAT_UW, noRaycast, placeUW, uploadInstances } from "./shared";
import { CITY_STREETS } from "./cityPlan";

/** A flat textured rectangle spanning [w0, w1] along w and [u0, u1] along u. */
function Slab({ u0, u1, w0, w1, y, map, tile, color = "#ffffff", roughness = 0.9 }: { u0: number; u1: number; w0: number; w1: number; y: number; map: THREE.Texture; tile: number; color?: string; roughness?: number }) {
  const [x, z] = uwToXZ((u0 + u1) / 2, (w0 + w1) / 2);
  const tex = useMemo(() => {
    const t = map.clone();
    t.repeat.set((u1 - u0) / tile, (w1 - w0) / tile);
    t.needsUpdate = true;
    return t;
  }, [map, u0, u1, w0, w1, tile]);
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, SITE_ROTATION_Y]} receiveShadow raycast={noRaycast}>
      <planeGeometry args={[u1 - u0, w1 - w0]} />
      <meshStandardMaterial map={tex} color={color} roughness={roughness} />
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
  return (
    <>
      {[LAYOUT.road[0], LAYOUT.road[1]].map((w) => {
        const [x, z] = uwToXZ(0, w);
        return (
          <mesh key={w} position={[x, 0.05, z]} rotation={[0, SITE_ROTATION_Y, 0]} receiveShadow castShadow raycast={noRaycast}>
            <boxGeometry args={[half * 2, 0.1, 0.22]} />
            <meshStandardMaterial map={concreteTexture()} color="#d8d3c9" roughness={0.9} />
          </mesh>
        );
      })}
    </>
  );
}

export default function Ground() {
  const L = LAYOUT;
  const half = L.streetHalfLength;
  const paving = pavingTexture();
  const asphalt = asphaltTexture();
  const stone = stoneTexture();
  const road = roadTexture();

  return (
    <group>
      {/* Far ground */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow raycast={noRaycast}>
        <circleGeometry args={[700, 48]} />
        <meshStandardMaterial color="#CFC8BB" roughness={1} />
      </mesh>

      {/* Paved plinth under the towers (extends back to carry the supertall) */}
      <Slab u0={-52} u1={52} w0={-L.plinthBackDepth} w1={L.plinthHalfDepth} y={0.004} map={stone} tile={6} color="#e4ded3" roughness={0.75} />

      {/* Main street: sidewalk · road · sidewalk · promenade */}
      <Slab u0={-half} u1={half} w0={L.sidewalkNear[0]} w1={L.sidewalkNear[1]} y={0.03} map={paving} tile={4} />
      <Slab u0={-half} u1={half} w0={L.road[0]} w1={L.road[1]} y={0.006} map={road} tile={L.road[1] - L.road[0]} roughness={0.95} />
      <Crossings />
      <Kerbs />
      <Slab u0={-half} u1={half} w0={L.sidewalkFar[0]} w1={L.sidewalkFar[1]} y={0.03} map={paving} tile={4} />
      <Slab u0={-half} u1={half} w0={L.promenade[0]} w1={L.promenade[1]} y={0.03} map={stone} tile={3} color="#c9b596" roughness={0.8} />

      {/* Secondary street grid */}
      {CITY_STREETS.map((s, i) => (
        <Slab key={i} u0={s.u0} u1={s.u1} w0={s.w0} w1={s.w1} y={0.005} map={asphalt} tile={6} roughness={0.95} />
      ))}
    </group>
  );
}
