"use client";
/**
 * People — pedestrians on the promenade, sidewalks and plaza: a capsule body
 * with per-person clothing colour and a head, two instanced meshes. About
 * half of them stroll along the street and wrap at the ends.
 *
 * A person is 1.75 m ≈ 0.49 scene units tall.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { LAYOUT } from "@/lib/siteLayout";
import { ALONG_MINUS_U, ALONG_U, noRaycast, placeUW, rng } from "./shared";

interface Person {
  u: number;
  w: number;
  dir: -1 | 0 | 1;
  speed: number;
  h: number;
  cloth: THREE.Color;
  skin: THREE.Color;
}

const CLOTHES = ["#1c1b19", "#6e6a63", "#e9e6df", "#8e9e86", "#9c7a52", "#3b4a5c", "#b8a47a", "#d9d4cb", "#7a4a3a", "#2f4f4f"];
const SKINS = ["#f1d3b8", "#d9a98a", "#b8825f", "#8a5a3c", "#5a3a28", "#f5e0cc"];
const HALF = 170;

function layout(): Person[] {
  const r = rng(83);
  const out: Person[] = [];
  const add = (u: number, w: number, moving: boolean) =>
    out.push({
      u,
      w,
      dir: moving ? (r() < 0.5 ? 1 : -1) : 0,
      speed: 0.28 + r() * 0.16,
      h: 0.44 + r() * 0.09,
      cloth: new THREE.Color(CLOTHES[Math.floor(r() * CLOTHES.length)]),
      skin: new THREE.Color(SKINS[Math.floor(r() * SKINS.length)]),
    });
  // Promenade — the busiest
  for (let i = 0; i < 46; i++) add(-HALF + r() * HALF * 2, LAYOUT.promenade[0] + 0.4 + r() * 2.2, r() < 0.6);
  // Sidewalks
  for (let i = 0; i < 22; i++) add(-HALF + r() * HALF * 2, LAYOUT.sidewalkNear[0] + 0.4 + r() * 1.2, r() < 0.7);
  for (let i = 0; i < 18; i++) add(-HALF + r() * HALF * 2, LAYOUT.sidewalkFar[0] + 0.4 + r() * 1.2, r() < 0.7);
  // Plaza and arcades in front of the podiums (standing / chatting)
  for (let i = 0; i < 26; i++) add(-46 + r() * 92, 4 + r() * 12, r() < 0.3);
  return out;
}

export default function People() {
  const people = useMemo(layout, []);
  const body = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), s: new THREE.Vector3(), q: new THREE.Quaternion() }), []);
  const first = useRef(true);

  useFrame(({ clock }, dt) => {
    const { m, s, q } = tmp;
    people.forEach((p, i) => {
      if (p.dir !== 0) {
        p.u += p.dir * p.speed * Math.min(dt, 0.05);
        if (p.u > HALF) p.u = -HALF;
        if (p.u < -HALF) p.u = HALF;
      } else if (!first.current) return;
      // Standing people face random-ish directions; walkers face their heading.
      const rot = p.dir === 0 ? q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2.4) : p.dir === 1 ? ALONG_U : ALONG_MINUS_U;
      const bob = p.dir === 0 ? 0 : Math.abs(Math.sin(clock.elapsedTime * 6 + i)) * 0.01;
      body.current?.setMatrixAt(i, placeUW(p.u, p.w, p.h * 0.5 + bob, rot, s.set(p.h * 0.34, p.h * 0.9, p.h * 0.22), m));
      head.current?.setMatrixAt(i, placeUW(p.u, p.w, p.h * 0.93 + bob, rot, s.set(p.h * 0.17, p.h * 0.2, p.h * 0.17), m));
    });
    for (const ref of [body, head]) if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (first.current && body.current && head.current) {
      people.forEach((p, i) => {
        body.current!.setColorAt(i, p.cloth);
        head.current!.setColorAt(i, p.skin);
      });
      body.current.instanceColor!.needsUpdate = true;
      head.current.instanceColor!.needsUpdate = true;
      first.current = false;
    }
  });

  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, people.length]} castShadow raycast={noRaycast} frustumCulled={false}>
        <capsuleGeometry args={[0.5, 0.6, 3, 8]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, people.length]} raycast={noRaycast} frustumCulled={false}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </group>
  );
}
