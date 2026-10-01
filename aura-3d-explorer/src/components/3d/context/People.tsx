"use client";
/**
 * People — pedestrians on the promenade, sidewalks and plaza.
 * -----------------------------------------------------------------------------
 * Each figure is built from a few instanced parts so walkers can actually
 * walk: a shaped torso with shoulders (top colour), a head with neck (skin),
 * short or long hair, and two legs and two arms hinged at hip and shoulder
 * that swing in opposition. Shoes and hands are baked in as vertex colour.
 * Clothing palettes and crowd density come from the city preset; about half
 * the crowd strolls along the street and wraps at the ends.
 *
 * Parts are modelled for a 1-unit-tall figure and scaled per person
 * (1.60–1.90 m ≈ 0.45–0.53 scene units).
 *
 * Standing and walking people are separate crowds: only standing people cast
 * shadows (the sun's shadow map is static, see ../staticShadows), and the
 * standing crowd uploads its matrices only when they change.
 */
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LAYOUT } from "@/lib/siteLayout";
import type { CityPreset } from "@/lib/cityPresets";
import { ALONG_MINUS_U, ALONG_U, noRaycast, rng } from "./shared";
import { SITE_ROTATION_Y, pointInRect, uwToXZ, type UWRect } from "@/lib/siteLayout";

interface Person {
  u: number;
  w: number;
  dir: -1 | 0 | 1;
  speed: number;
  h: number;
  /** Standing people face this angle (radians). */
  facing: number;
  phase: number;
  longHair: boolean;
  top: THREE.Color;
  bottom: THREE.Color;
  skin: THREE.Color;
  hair: THREE.Color;
}

const SKINS = ["#f1d3b8", "#e6bf9f", "#d9a98a", "#b8825f", "#8a5a3c", "#5a3a28", "#f5e0cc"];
const HAIRS = ["#1d1611", "#2e2016", "#4a3322", "#6b4a2e", "#a07a4e", "#c9a66b", "#7b7b78", "#151515"];
const HALF = 170;

/* ------------------------------------------------------------- geometry */

function colored(g: THREE.BufferGeometry, c: [number, number, number]) {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

/** Hip height and shoulder height of the 1-unit figure. */
const HIP = 0.5;
const SHOULDER = 0.81;

const GEOMETRY = (() => {
  const white: [number, number, number] = [1, 1, 1];
  // Torso: a lathe from waist to shoulders, slightly flattened front-to-back.
  const torsoProfile = [
    new THREE.Vector2(0.0, HIP - 0.04),
    new THREE.Vector2(0.105, HIP - 0.04),
    new THREE.Vector2(0.11, HIP + 0.08),
    new THREE.Vector2(0.1, HIP + 0.16),
    new THREE.Vector2(0.12, SHOULDER - 0.08),
    new THREE.Vector2(0.125, SHOULDER - 0.02),
    new THREE.Vector2(0.08, SHOULDER + 0.02),
    new THREE.Vector2(0.0, SHOULDER + 0.03),
  ];
  const torso = colored(new THREE.LatheGeometry(torsoProfile, 12).scale(0.72, 1, 1.25), white);
  // Head (skin) + neck
  const head = merge([
    colored(new THREE.SphereGeometry(0.062, 12, 10).scale(0.92, 1.12, 0.95).translate(0, 0.925, 0), white),
    colored(new THREE.CylinderGeometry(0.03, 0.035, 0.07, 8).translate(0, SHOULDER + 0.05, 0), white),
  ]);
  // Hair: a cap over the top and back of the head; the long variant falls to the shoulders.
  const cap = new THREE.SphereGeometry(0.067, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.1, 1).translate(-0.004, 0.93, 0);
  const hairShort = merge([colored(cap, white)]);
  const hairLong = merge([
    colored(cap.clone(), white),
    colored(new THREE.CylinderGeometry(0.058, 0.066, 0.14, 10, 1, true, Math.PI * 0.25, Math.PI * 1.5).translate(-0.01, 0.87, 0), white),
  ]);
  // Leg: hinged at the hip (origin), hanging down; shoe baked in dark.
  const leg = merge([
    colored(new THREE.CylinderGeometry(0.05, 0.036, HIP - 0.04, 8).translate(0, -(HIP - 0.04) / 2, 0), white),
    colored(new THREE.BoxGeometry(0.11, 0.035, 0.055).translate(0.025, -HIP + 0.018, 0), [0.14, 0.13, 0.12]),
  ]);
  // Arm: hinged at the shoulder, sleeve in the top colour, hand in skin tone.
  const arm = merge([
    colored(new THREE.CylinderGeometry(0.03, 0.024, 0.31, 7).translate(0, -0.155, 0), white),
    colored(new THREE.SphereGeometry(0.025, 7, 6).translate(0, -0.33, 0), [0.93, 0.74, 0.6]),
  ]);
  return { torso, head, hairShort, hairLong, leg, arm };
})();

/* --------------------------------------------------------------- layout */

function layout(preset: CityPreset): Person[] {
  const r = rng(83);
  const out: Person[] = [];
  const P = preset.people;
  const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)];
  const add = (u: number, w: number, moving: boolean) =>
    out.push({
      u,
      w,
      dir: moving ? (r() < 0.5 ? 1 : -1) : 0,
      speed: 0.3 + r() * 0.14,
      h: 0.45 + r() * 0.08,
      facing: r() * Math.PI * 2,
      phase: r() * Math.PI * 2,
      longHair: r() < 0.4,
      top: new THREE.Color(pick(P.tops)),
      bottom: new THREE.Color(pick(P.bottoms)),
      skin: new THREE.Color(pick(SKINS)),
      hair: new THREE.Color(pick(HAIRS)),
    });
  const n = (k: number) => Math.round(k * P.density);
  // Promenade — the busiest
  for (let i = 0; i < n(46); i++) add(-HALF + r() * HALF * 2, LAYOUT.promenade[0] + 0.4 + r() * 2.2, r() < 0.6);
  // Sidewalks
  for (let i = 0; i < n(22); i++) add(-HALF + r() * HALF * 2, LAYOUT.sidewalkNear[0] + 0.4 + r() * 1.2, r() < 0.7);
  for (let i = 0; i < n(18); i++) add(-HALF + r() * HALF * 2, LAYOUT.sidewalkFar[0] + 0.4 + r() * 1.2, r() < 0.7);
  // Plaza and arcades in front of the podiums (standing / chatting in small groups)
  for (let i = 0; i < n(12); i++) {
    const cu = -46 + r() * 92;
    const cw = 4 + r() * 12;
    const size = 1 + Math.floor(r() * 3);
    for (let k = 0; k < size; k++) {
      add(cu + (r() - 0.5) * 0.8, cw + (r() - 0.5) * 0.8, false);
      // Face the middle of the group.
      const p = out[out.length - 1];
      // Local +X turned by θ about Y points along (u, w) = θ − π/4 in the site frame.
      p.facing = SITE_ROTATION_Y + Math.atan2(-(cw - p.w), cu - p.u) + (r() - 0.5) * 0.4;
    }
  }
  return out;
}

/* ------------------------------------------------------------ component */

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export default function People({ preset, clearings = [] }: { preset: CityPreset; clearings?: UWRect[] }) {
  const crowds = useMemo(() => {
    const all = layout(preset);
    return { standing: all.filter((p) => p.dir === 0), walking: all.filter((p) => p.dir !== 0) };
  }, [preset]);
  return (
    <group>
      <Crowd people={crowds.standing} clearings={clearings} shadow />
      <Crowd people={crowds.walking} clearings={clearings} shadow={false} />
    </group>
  );
}

function Crowd({ people, clearings, shadow }: { people: Person[]; clearings: UWRect[]; shadow: boolean }) {
  const anyWalking = useMemo(() => people.some((p) => p.dir !== 0), [people]);
  const refs = {
    torso: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    hairShort: useRef<THREE.InstancedMesh>(null),
    hairLong: useRef<THREE.InstancedMesh>(null),
    legL: useRef<THREE.InstancedMesh>(null),
    legR: useRef<THREE.InstancedMesh>(null),
    armL: useRef<THREE.InstancedMesh>(null),
    armR: useRef<THREE.InstancedMesh>(null),
  };
  // Hair meshes index only their own people.
  const hairIndex = useMemo(() => {
    let s = 0;
    let l = 0;
    return people.map((p) => (p.longHair ? l++ : s++));
  }, [people]);
  const counts = useMemo(() => ({ long: people.filter((p) => p.longHair).length, short: people.filter((p) => !p.longHair).length }), [people]);

  const tmp = useMemo(
    () => ({
      base: new THREE.Matrix4(),
      local: new THREE.Matrix4(),
      rot: new THREE.Matrix4(),
      out: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      pos: new THREE.Vector3(),
      scl: new THREE.Vector3(),
    }),
    []
  );
  const first = useRef(true);
  // People standing where a moved building now stands are hidden; re-upload when that changes.
  const hidden = useMemo(() => people.map((p) => p.dir === 0 && clearings.some((c) => pointInRect(p.u, p.w, c))), [people, clearings]);
  const uploadedHidden = useRef<boolean[] | null>(null);
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);

  useFrame(({ clock }, dt) => {
    const { base, local, rot, out, q, pos, scl } = tmp;
    const t = clock.elapsedTime;
    const step = Math.min(dt, 0.05);
    /** Part matrix = person base × translate(offset) × rotZ(swing). */
    const part = (mesh: THREE.InstancedMesh | null, i: number, ox: number, oy: number, oz: number, swing: number) => {
      if (!mesh) return;
      local.makeTranslation(ox, oy, oz);
      if (swing) local.multiply(rot.makeRotationAxis(Z_AXIS, swing));
      mesh.setMatrixAt(i, out.multiplyMatrices(base, local));
    };

    const refresh = uploadedHidden.current !== hidden;
    if (!anyWalking && !first.current && !refresh) return; // a standing crowd is static
    uploadedHidden.current = hidden;
    people.forEach((p, i) => {
      if (p.dir !== 0) {
        p.u += p.dir * p.speed * step;
        if (p.u > HALF) p.u = -HALF;
        if (p.u < -HALF) p.u = HALF;
      } else if (!first.current && !refresh) return; // standing people are static
      if (hidden[i]) {
        for (const m of [refs.torso, refs.head, refs.legL, refs.legR, refs.armL, refs.armR]) m.current?.setMatrixAt(i, zero);
        (p.longHair ? refs.hairLong : refs.hairShort).current?.setMatrixAt(hairIndex[i], zero);
        return;
      }
      const walking = p.dir !== 0;
      // Stride: ~1.9 steps per second at walking pace.
      const cycle = t * 6 + p.phase;
      const swing = walking ? Math.sin(cycle) * 0.5 : 0;
      const bob = walking ? Math.abs(Math.cos(cycle)) * 0.012 : 0;
      if (walking) q.copy(p.dir === 1 ? ALONG_U : ALONG_MINUS_U);
      else q.setFromAxisAngle(Y_AXIS, p.facing);
      const [x, z] = uwToXZ(p.u, p.w);
      base.compose(pos.set(x, bob * p.h, z), q, scl.setScalar(p.h));

      part(refs.torso.current, i, 0, 0, 0, 0);
      part(refs.head.current, i, 0, 0, 0, 0);
      part(p.longHair ? refs.hairLong.current : refs.hairShort.current, hairIndex[i], 0, 0, 0, 0);
      part(refs.legL.current, i, 0, HIP, 0.055, swing);
      part(refs.legR.current, i, 0, HIP, -0.055, -swing);
      part(refs.armL.current, i, 0, SHOULDER - 0.03, 0.135, walking ? -swing * 0.8 : 0.05);
      part(refs.armR.current, i, 0, SHOULDER - 0.03, -0.135, walking ? swing * 0.8 : -0.05);
    });
    for (const ref of Object.values(refs)) if (ref.current) ref.current.instanceMatrix.needsUpdate = true;

    if (first.current && refs.torso.current) {
      people.forEach((p, i) => {
        refs.torso.current!.setColorAt(i, p.top);
        refs.armL.current?.setColorAt(i, p.top);
        refs.armR.current?.setColorAt(i, p.top);
        refs.legL.current?.setColorAt(i, p.bottom);
        refs.legR.current?.setColorAt(i, p.bottom);
        refs.head.current?.setColorAt(i, p.skin);
        (p.longHair ? refs.hairLong : refs.hairShort).current?.setColorAt(hairIndex[i], p.hair);
      });
      for (const ref of Object.values(refs)) if (ref.current?.instanceColor) ref.current.instanceColor.needsUpdate = true;
      first.current = false;
    }
  });

  const mesh = (ref: RefObject<THREE.InstancedMesh | null>, geo: THREE.BufferGeometry, count: number, opts: { shadow?: boolean; roughness?: number } = {}) =>
    count > 0 ? (
      <instancedMesh ref={ref} args={[geo, undefined, count]} castShadow={opts.shadow} raycast={noRaycast} frustumCulled={false}>
        <meshStandardMaterial vertexColors roughness={opts.roughness ?? 0.85} />
      </instancedMesh>
    ) : null;

  const G = GEOMETRY;
  return (
    <group>
      {mesh(refs.torso, G.torso, people.length, { shadow })}
      {mesh(refs.head, G.head, people.length, { roughness: 0.6 })}
      {mesh(refs.hairShort, G.hairShort, counts.short, { roughness: 0.7 })}
      {mesh(refs.hairLong, G.hairLong, counts.long, { roughness: 0.7 })}
      {mesh(refs.legL, G.leg, people.length, { shadow })}
      {mesh(refs.legR, G.leg, people.length, { shadow })}
      {mesh(refs.armL, G.arm, people.length)}
      {mesh(refs.armR, G.arm, people.length)}
    </group>
  );
}
