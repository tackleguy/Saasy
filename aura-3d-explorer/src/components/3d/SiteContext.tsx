"use client";
/**
 * SiteContext — daylight urban context around the project.
 * -----------------------------------------------------------------------------
 * Laid out in the rotated "screen" frame from `lib/siteLayout.ts` (u across
 * the view, w towards the viewer), so the default camera looks over water,
 * a promenade and a street at the towers, like a waterfront archviz render.
 *
 *   • Ground, paved plinth, sidewalks, asphalt road with dashed lane markings
 *   • Water: drei <MeshReflectorMaterial> (blurred planar mirror) in High
 *     quality; a cheap glossy material that still picks up the HDR in Low
 *   • ~40 instanced low-poly trees (one draw call for trunks, one for canopies)
 *   • Light neighbouring blocks, instanced, with a faint window grid texture
 *
 * Everything is static and non-interactive (raycast disabled).
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MeshReflectorMaterial } from "@react-three/drei";
import { LAYOUT, SITE_ROTATION_Y, uwToXZ } from "@/lib/siteLayout";

const noRaycast = () => null;

/** Seeded PRNG so the context is identical on every load. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/* -------------------------------------------------------------- flat strips */

/** A flat rectangle spanning [w0, w1] along w and ±halfU along u. */
function Strip({ w0, w1, halfU, y, color, roughness = 0.9 }: { w0: number; w1: number; halfU: number; y: number; color: string; roughness?: number }) {
  const [x, z] = uwToXZ(0, (w0 + w1) / 2);
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, SITE_ROTATION_Y]} receiveShadow raycast={noRaycast}>
      <planeGeometry args={[halfU * 2, w1 - w0]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

/** Dashed centre line + solid edge lines on the road, as one instanced mesh. */
function LaneMarkings() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const out: { u: number; w: number; len: number }[] = [];
    const mid = (LAYOUT.road[0] + LAYOUT.road[1]) / 2;
    for (let u = -LAYOUT.streetHalfLength; u < LAYOUT.streetHalfLength; u += 3) out.push({ u, w: mid, len: 1.4 });
    for (const w of [LAYOUT.road[0] + 0.25, LAYOUT.road[1] - 0.25]) out.push({ u: 0, w, len: LAYOUT.streetHalfLength * 2 });
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, SITE_ROTATION_Y));
    items.forEach((it, i) => {
      const [x, z] = uwToXZ(it.u, it.w);
      m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.012, z), q, new THREE.Vector3(it.len, 0.12, 1)));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} raycast={noRaycast}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color="#f4f1ea" roughness={0.8} />
    </instancedMesh>
  );
}

/* --------------------------------------------------------------------- water */

function Water({ quality }: { quality: "high" | "low" }) {
  const depth = 420;
  const [x, z] = uwToXZ(0, LAYOUT.waterStart + depth / 2);
  return (
    <mesh position={[x, 0.008, z]} rotation={[-Math.PI / 2, 0, SITE_ROTATION_Y]} raycast={noRaycast}>
      <planeGeometry args={[LAYOUT.streetHalfLength * 2.4, depth]} />
      {quality === "high" ? (
        // Planar reflection: the scene is re-rendered from a mirrored camera into a
        // blurred render target, then mixed with the water colour.
        <MeshReflectorMaterial
          resolution={512}
          blur={[400, 120]}
          mixBlur={1}
          mixStrength={0.9}
          mirror={0.6}
          roughness={0.35}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#5f7f84"
          metalness={0.2}
        />
      ) : (
        <meshStandardMaterial color="#6a888c" roughness={0.12} metalness={0.3} envMapIntensity={1.2} />
      )}
    </mesh>
  );
}

/* --------------------------------------------------------------------- trees */

function Trees() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const canopies = useRef<THREE.InstancedMesh>(null);
  const trees = useMemo(() => {
    const r = rng(11);
    const out: { x: number; z: number; s: number }[] = [];
    // Street trees: a full row on the promenade side, a sparse row on the site side
    // (kept clear of the podiums so the arcades stay visible from the water).
    for (let u = -80; u <= 80; u += 6 + r() * 2) {
      const [x, z] = uwToXZ(u + (r() - 0.5), LAYOUT.sidewalkFar[1] + 1.2);
      out.push({ x, z, s: 0.55 + r() * 0.2 });
    }
    for (const u of [-58, -42, -8, 8, 42, 58]) {
      const [x, z] = uwToXZ(u, LAYOUT.sidewalkNear[0] + 0.9);
      out.push({ x, z, s: 0.5 + r() * 0.15 });
    }
    // A few in the courtyard behind the site
    for (let i = 0; i < 6; i++) {
      const [x, z] = uwToXZ(-30 + r() * 60, -14 - r() * 6);
      out.push({ x, z, s: 1 + r() * 0.5 });
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const q = new THREE.Quaternion();
    trees.forEach((t, i) => {
      trunks.current?.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, 0.9 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s)));
      canopies.current?.setMatrixAt(
        i,
        new THREE.Matrix4().compose(new THREE.Vector3(t.x, 2.5 * t.s, t.z), q.clone().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), new THREE.Vector3(1.6 * t.s, 1.8 * t.s, 1.6 * t.s))
      );
    });
    for (const m of [trunks.current, canopies.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [trees]);

  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.07, 0.11, 1.8, 6]} />
        <meshStandardMaterial color="#6f5b45" roughness={0.9} />
      </instancedMesh>
      {/* Low-poly canopy: a detail-1 icosahedron reads as a soft faceted crown */}
      <instancedMesh ref={canopies} args={[undefined, undefined, trees.length]} castShadow receiveShadow raycast={noRaycast}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#7d8f6c" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

/* --------------------------------------------------------------- neighbours */

/** Pale facade texture: faint window grid on plaster. */
function facadeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e6e1d8";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#c9c8c3";
  for (let y = 6; y < c.height; y += 16) for (let x = 6; x < c.width; x += 16) ctx.fillRect(x, y, 9, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function Neighbours() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const blocks = useMemo(() => {
    const r = rng(7);
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    // Behind the site and to both sides — never in front (street, water).
    for (let i = 0; i < 60; i++) {
      const u = -170 + r() * 340;
      const w = -40 - r() * 160;
      const [x, z] = uwToXZ(u, w);
      // Low near the site, a few taller blocks far back so the towers stay the heroes.
      out.push({ x, z, w: 8 + r() * 12, d: 8 + r() * 12, h: 2.5 + Math.pow(r(), 2.2) * (w < -90 ? 26 : 9) });
    }
    for (let i = 0; i < 20; i++) {
      const side = r() > 0.5 ? 1 : -1;
      const [x, z] = uwToXZ(side * (58 + r() * 110), -28 + r() * 40);
      out.push({ x, z, w: 8 + r() * 10, d: 8 + r() * 10, h: 2.5 + r() * 7 });
    }
    return out;
  }, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e3ded5", map: facadeTexture(), roughness: 0.85 }), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SITE_ROTATION_Y);
    blocks.forEach((b, i) => m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.w, b.h, b.d))));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [blocks]);

  return <instancedMesh ref={ref} args={[geometry, material, blocks.length]} castShadow receiveShadow raycast={noRaycast} />;
}

/* -------------------------------------------------------------------- scene */

export default function SiteContext({ quality }: { quality: "high" | "low" }) {
  const L = LAYOUT;
  const half = L.streetHalfLength;
  return (
    <group>
      {/* Ground */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow raycast={noRaycast}>
        <circleGeometry args={[600, 48]} />
        <meshStandardMaterial color="#CFC8BB" roughness={1} />
      </mesh>
      {/* Paved plinth under the towers */}
      <Strip w0={-L.plinthHalfDepth} w1={L.plinthHalfDepth} halfU={48} y={0.004} color="#dcd6cb" roughness={0.75} />
      <Strip w0={L.sidewalkNear[0]} w1={L.sidewalkNear[1]} halfU={half} y={0.03} color="#e2ddd3" />
      <Strip w0={L.road[0]} w1={L.road[1]} halfU={half} y={0.006} color="#8e8c87" roughness={0.95} />
      <LaneMarkings />
      <Strip w0={L.sidewalkFar[0]} w1={L.sidewalkFar[1]} halfU={half} y={0.03} color="#e2ddd3" />
      <Strip w0={L.promenade[0]} w1={L.promenade[1]} halfU={half} y={0.03} color="#b69b77" roughness={0.8} />
      <Water quality={quality} />
      <Trees />
      <Neighbours />
    </group>
  );
}
