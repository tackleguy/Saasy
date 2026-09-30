"use client";
/**
 * SectionCut — vertical cutaway through the active building.
 * -----------------------------------------------------------------------------
 * Mounted inside a building's group while Section mode is on. It
 *   1. applies a world-space clipping plane (renderer localClippingEnabled +
 *      per-material `clippingPlanes`) to every material under the building,
 *      re-scanning a few times a second so late-mounting meshes (furniture,
 *      the core shaft) are cut too, and removes it again on unmount;
 *   2. aims the cut through the core centre, snapped to the building axis
 *      facing the camera, so the near half is always the one removed;
 *   3. draws poché caps on the cut plane — dark slab sections per floor
 *      (following each plate's twist and outline) and the core walls in a deep
 *      core accent — so the section reads like an architectural drawing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { Building } from "@/types";
import { buildingHeight, explodedY } from "@/lib/tower";
import { lineExtent, plateOutline, rotateY, type Pt } from "@/lib/plateOutline";
import { SLAB_THICKNESS } from "./FurnitureOverlay";

const POCHE = "#2b2724";
const CORE_POCHE = "#7a2f1f";
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const noRaycast = () => null;

/** Axis the camera sits on: +X, +Z, −X, −Z. */
const DIRS: Pt[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

interface Props {
  building: Building;
  explosion: number;
}

export default function SectionCut({ building, explosion }: Props) {
  const gl = useThree((s) => s.gl);
  const self = useRef<THREE.Group>(null);
  const slabs = useRef<THREE.InstancedMesh>(null);
  const walls = useRef<THREE.Group>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), []);
  const clipped = useRef(new Set<THREE.Material>());
  const [dirIdx, setDirIdx] = useState(0);
  const st = useRef({ e: explosion, frame: 0, laidE: NaN, laidDir: -1 });
  const mats = useMemo(
    () => ({
      slab: new THREE.MeshBasicMaterial({ color: POCHE, side: THREE.DoubleSide }),
      core: new THREE.MeshBasicMaterial({ color: CORE_POCHE, side: THREE.DoubleSide }),
    }),
    []
  );

  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  // Remove the plane from every material it was applied to.
  useEffect(() => {
    const set = clipped.current;
    return () => {
      set.forEach((m) => {
        m.clippingPlanes = null;
        m.clipShadows = false;
      });
      set.clear();
      mats.slab.dispose();
      mats.core.dispose();
    };
  }, [mats]);

  const [bx, bz] = building.position;
  const dir = DIRS[dirIdx];
  // Cut line runs perpendicular to the camera axis, through the core centre.
  const along: Pt = [-dir[1], dir[0]];
  const c = building.coreSize;
  const wallT = Math.max(0.05, c * 0.07);

  useFrame(({ camera }, dt) => {
    const s = st.current;
    s.e = THREE.MathUtils.lerp(s.e, explosion, 1 - Math.pow(0.0008, dt));

    // Snap the cut to the building axis facing the camera.
    const dx = camera.position.x - bx;
    const dz = camera.position.z - bz;
    const idx = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : dz >= 0 ? 1 : 3;
    if (idx !== dirIdx) setDirIdx(idx);
    const d = DIRS[dirIdx];
    // Keep n·p + k ≥ 0 (the far half): n points away from the camera.
    plane.normal.set(-d[0], 0, -d[1]);
    plane.constant = d[0] * bx + d[1] * bz;

    // Apply the plane to every material under the building (not our caps).
    if (s.frame++ % 15 === 0) {
      const parent = self.current?.parent;
      if (parent) {
        const visit = (o: THREE.Object3D) => {
          if (o === self.current || o.userData.noClip) return;
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (m) {
            for (const mat of Array.isArray(m) ? m : [m]) {
              if (mat.clippingPlanes?.[0] !== plane) {
                mat.clippingPlanes = [plane];
                mat.clipShadows = true;
                clipped.current.add(mat);
              }
            }
          }
          o.children.forEach(visit);
        };
        visit(parent);
      }
    }

    // Poché caps: re-laid while the stack is moving or the cut axis changes.
    const fl = slabs.current;
    if (fl && (s.laidDir !== dirIdx || !(Math.abs(s.laidE - s.e) < 1e-4))) {
      s.laidE = s.e;
      s.laidDir = dirIdx;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-along[1], along[0]));
      const p = new THREE.Vector3();
      const sc = new THREE.Vector3();
      const nudge = 0.004; // just on the camera side of the plane
      building.floors.forEach((f, i) => {
        const ext = lineExtent(plateOutline(f), rotateY(along, -f.rotationY));
        if (!ext) {
          m.makeScale(0, 0, 0);
        } else {
          const lo = ext[0] - 0.05;
          const hi = ext[1] + 0.05;
          const mid = (lo + hi) / 2;
          p.set(along[0] * mid + d[0] * nudge, explodedY(f, s.e) + SLAB_THICKNESS / 2, along[1] * mid + d[1] * nudge);
          sc.set(hi - lo, SLAB_THICKNESS, 0.006);
          m.compose(p, q, sc);
        }
        fl.setMatrixAt(i, m);
      });
      fl.instanceMatrix.needsUpdate = true;
      fl.computeBoundingSphere();
      if (walls.current) walls.current.scale.y = buildingHeight(building, s.e);
    }
  });

  const rot = Math.atan2(-along[1], along[0]);
  return (
    <group ref={self} userData={{ noClip: true }}>
      <instancedMesh ref={slabs} args={[UNIT_BOX, mats.slab, building.floors.length]} raycast={noRaycast} frustumCulled={false} />
      {/* Core walls in section, full (exploded) height */}
      <group ref={walls}>
        {[-1, 1].map((side) => {
          const s = side * (c / 2 - wallT / 2);
          return (
            <mesh
              key={side}
              geometry={UNIT_BOX}
              material={mats.core}
              position={[along[0] * s + dir[0] * 0.005, 0.5, along[1] * s + dir[1] * 0.005]}
              rotation={[0, rot, 0]}
              scale={[wallT, 1, 0.006]}
              raycast={noRaycast}
            />
          );
        })}
      </group>
    </group>
  );
}
