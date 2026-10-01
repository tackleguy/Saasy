"use client";
/**
 * InteriorShell — walls, doors, floor patches and balconies of one plate.
 * -----------------------------------------------------------------------------
 * Mount INSIDE FloorPlate's twisted plate group (the frame FurnitureOverlay
 * uses), once per floor:
 *   • balconies — always (the exterior reads them), unless `hideBalconies`;
 *     cached merged geometry, three draw calls per floor, fading with the
 *     plate when dimmed / X-ray
 *   • walls, doors, kitchen tiles and the lift-lobby floor — only while the
 *     floor is isolated (or walked); they grow up from the slab on mount like
 *     the furniture
 * The plan comes from lib/roomPlan via ./plan (cached per plate).
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { FacadeSpec, FloorData } from "@/types";
import { MODEL_SCALE } from "@/lib/tower";
import type { RoomPlan } from "@/lib/roomPlan";
import { SLAB_THICKNESS } from "../FurnitureOverlay";
import Walls, { runMatrix } from "./Walls";
import Doors from "./Doors";
import Balconies from "./Balconies";
import { balconiesFor, interiorPlanFor } from "./plan";
import { interiorMaterials, UNIT_BOX } from "./materials";

export { interiorPlanFor, wallCollidersFor, balconiesFor, LOBBY_DEPTH_M } from "./plan";
export { liftBankDoors, LiftBankSignals, bankCoreLayout } from "./LiftBank";
export { pushOutOfWalls, wallColliders } from "@/lib/roomPlan";

const noRaycast = () => null;

/** Kitchen tiles and the stone lift lobby, a few millimetres above the floor finish. */
function Patch({ matrices, mat }: { matrices: THREE.Matrix4[]; mat: "tile" | "lobby" }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  if (!matrices.length) return null;
  // Instanced so the textures tile per metre (tilePerUnit works on instances).
  return <instancedMesh ref={ref} args={[UNIT_BOX, interiorMaterials()[mat], matrices.length]} receiveShadow raycast={noRaycast} />;
}

function FloorPatches({ plan }: { plan: RoomPlan }) {
  const tiles = useMemo(() => plan.tiles.map((r) => runMatrix([r.x0, (r.z0 + r.z1) / 2], [r.x1, (r.z0 + r.z1) / 2], 0, 0.008, r.z1 - r.z0)), [plan]);
  const lobby = useMemo(() => {
    const { center: c, halfW, halfD, rotY } = plan.lobby;
    const ax: [number, number] = [Math.cos(rotY) * halfW, -Math.sin(rotY) * halfW]; // box local +X after Ry(rotY)
    const foyers = (plan.stone ?? []).map((r) => runMatrix([r.x0, (r.z0 + r.z1) / 2], [r.x1, (r.z0 + r.z1) / 2], 0, 0.01, r.z1 - r.z0));
    return [runMatrix([c[0] - ax[0], c[1] - ax[1]], [c[0] + ax[0], c[1] + ax[1]], 0, 0.01, halfD * 2), ...foyers];
  }, [plan]);
  return (
    <group>
      <Patch key={`t${tiles.length}`} matrices={tiles} mat="tile" />
      <Patch key={`l${lobby.length}`} matrices={lobby} mat="lobby" />
    </group>
  );
}

/** Walls + doors + floor patches, growing up from the slab. */
function Rooms({ floor, coreSize, crownFloors }: { floor: FloorData; coreSize: number; crownFloors: number }) {
  const plan = useMemo(() => interiorPlanFor(floor, coreSize, crownFloors), [floor, coreSize, crownFloors]);
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || g.scale.y >= MODEL_SCALE - 1e-4) return;
    const k = 1 - Math.pow(0.002, dt);
    g.scale.y = Math.min(MODEL_SCALE, THREE.MathUtils.lerp(g.scale.y, MODEL_SCALE, k) + 1e-4);
  });
  return (
    <group ref={group} position={[0, SLAB_THICKNESS + 0.034, 0]} scale={[MODEL_SCALE, 0.001, MODEL_SCALE]}>
      <FloorPatches plan={plan} />
      <Walls plan={plan} />
      <Doors doors={plan.doors} />
    </group>
  );
}

interface Props {
  floor: FloorData;
  coreSize: number;
  facade: FacadeSpec;
  /** Floors in the building's crown (the penthouse spans them all). */
  crownFloors: number;
  /** The floor is isolated (selected) — show walls and doors. */
  isolated: boolean;
  /** Another floor is isolated: balconies fade with the plate. */
  dimmed?: boolean;
  xray?: boolean;
  hideBalconies?: boolean;
}

export default function InteriorShell({ floor, coreSize, facade, crownFloors, isolated, dimmed = false, xray = false, hideBalconies = false }: Props) {
  const specs = useMemo(() => (hideBalconies ? [] : balconiesFor(floor, facade)), [floor, facade, hideBalconies]);
  const band = floor.zone === "residential" && facade.balconies;
  const geoKey = [floor.zone, floor.width, floor.depth, floor.shape?.kind, floor.shape?.amount, band].join(":");
  return (
    <group>
      {specs.length > 0 && (
        <group position={[0, SLAB_THICKNESS, 0]} scale={MODEL_SCALE}>
          <Balconies specs={specs} geoKey={geoKey} dimmed={dimmed} xray={xray} />
        </group>
      )}
      {isolated && <Rooms floor={floor} coreSize={coreSize} crownFloors={crownFloors} />}
    </group>
  );
}
