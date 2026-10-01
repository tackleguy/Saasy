"use client";
/**
 * LiftCore — the core slice of the floor you are walking, with a real lift.
 * -----------------------------------------------------------------------------
 * Replaces the solid core box on the walked floor. The core is rebuilt from
 * blocks so the main lift (middle of the +Z face) is a hollow cab you can
 * step into:
 *   • side blocks, back block and a head block above the cab — their inner
 *     faces are the cab's walls and ceiling
 *   • door jambs and two sliding leaves that part into the jambs as
 *     `liftState.open` rises (driven by WalkControls)
 *   • cab lining: brushed-steel walls, stone floor, light panel, handrail,
 *     button panel; a call button and floor indicator outside
 *   • the other lift doors stay as flat panels
 *   • on residential / office floors the service passage behind the bank,
 *     the refuse room (chutes) and the riser closet (interior/CoreService)
 * The concrete is one merged, cached geometry from lib/coreLayout. Also shown
 * on an isolated (not walked) floor so the cutaway reads from above.
 * Building-local coordinates, like the core (it never twists).
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { liftDims, liftState } from "@/lib/lift";
import { liftBankDoors, LiftBankSignals } from "./interior/LiftBank";
import CoreService, { coreShell } from "./interior/CoreService";
import { concreteTexture } from "./textures";

const noRaycast = () => null;

interface Props {
  coreSize: number;
  floorHeight: number;
  slab: number;
  /** The service passage + refuse room are walkable on this floor (lib/coreLayout `coreServiceOpen`). */
  open?: boolean;
  /** Walking this floor (the cab light is only lit then). */
  walking?: boolean;
}

export default function LiftCore({ coreSize, floorHeight, slab, open = false, walking = true }: Props) {
  const c = coreSize;
  const H = floorHeight;
  const L = liftDims(c, H - slab);
  const half = c / 2;
  const cw = L.cabW / 2;
  const ow = L.opening / 2;
  const top = slab + L.cabH;

  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ map: concreteTexture(), color: "#e2dcd1", roughness: 0.9 }), []);
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c7ccd2", metalness: 0.85, roughness: 0.32 }), []);
  const leafMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b9a78a", metalness: 0.85, roughness: 0.3 }), []);
  const others = liftBankDoors(c, slab, L.cabH, true);
  const shell = coreShell(c, H, slab, open);

  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);

  // Ease the door leaves toward the requested state and slide them into the jambs.
  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.02, dt);
    liftState.open = THREE.MathUtils.lerp(liftState.open, liftState.targetOpen, k);
    const shift = liftState.open * ow;
    if (left.current) left.current.position.x = -ow / 2 - shift;
    if (right.current) right.current.position.x = ow / 2 + shift;
  });

  const leafZ = L.zFront + L.jamb * 0.5;

  return (
    <group>
      {/* Core shell: cab surround, head, jambs and (open floors) the walls round the service band */}
      <mesh geometry={shell} material={concrete} castShadow receiveShadow raycast={noRaycast} />
      {open && <CoreService coreSize={c} floorHeight={H} slab={slab} />}

      {/* Sliding leaves */}
      <mesh ref={left} position={[-ow / 2, slab + L.cabH / 2, leafZ]} material={leafMat} raycast={noRaycast}>
        <boxGeometry args={[ow, L.cabH, L.jamb * 0.4]} />
      </mesh>
      <mesh ref={right} position={[ow / 2, slab + L.cabH / 2, leafZ]} material={leafMat} raycast={noRaycast}>
        <boxGeometry args={[ow, L.cabH, L.jamb * 0.4]} />
      </mesh>

      {/* Cab lining */}
      <group>
        <mesh position={[0, slab + 0.003, (L.zBack + L.zFront) / 2]} rotation-x={-Math.PI / 2} raycast={noRaycast} receiveShadow>
          <planeGeometry args={[L.cabW, L.cabD]} />
          <meshStandardMaterial color="#3a3835" roughness={0.35} metalness={0.1} />
        </mesh>
        <mesh position={[0, slab + L.cabH / 2, L.zBack + 0.004]} material={steel} raycast={noRaycast}>
          <planeGeometry args={[L.cabW - 0.01, L.cabH - 0.01]} />
        </mesh>
        <mesh position={[-cw + 0.004, slab + L.cabH / 2, (L.zBack + L.zFront) / 2]} rotation-y={Math.PI / 2} material={steel} raycast={noRaycast}>
          <planeGeometry args={[L.cabD - 0.01, L.cabH - 0.01]} />
        </mesh>
        <mesh position={[cw - 0.004, slab + L.cabH / 2, (L.zBack + L.zFront) / 2]} rotation-y={-Math.PI / 2} material={steel} raycast={noRaycast}>
          <planeGeometry args={[L.cabD - 0.01, L.cabH - 0.01]} />
        </mesh>
        {/* Light panel */}
        <mesh position={[0, top - 0.004, (L.zBack + L.zFront) / 2]} rotation-x={Math.PI / 2} raycast={noRaycast}>
          <planeGeometry args={[L.cabW * 0.7, L.cabD * 0.7]} />
          <meshStandardMaterial color="#fff6e6" emissive="#fff1d6" emissiveIntensity={1.4} />
        </mesh>
        {walking && <pointLight position={[0, top - 0.05, (L.zBack + L.zFront) / 2]} color="#fff1d6" intensity={0.6} distance={1.2} decay={2} />}
        {/* Handrail on the back wall */}
        <mesh position={[0, slab + 0.25, L.zBack + 0.02]} raycast={noRaycast}>
          <boxGeometry args={[L.cabW * 0.8, 0.012, 0.012]} />
          <meshStandardMaterial color="#c9a24a" metalness={1} roughness={0.28} />
        </mesh>
        {/* Button panel on the right wall, by the door */}
        <mesh position={[cw - 0.008, slab + 0.3, L.zFront - 0.08]} rotation-y={-Math.PI / 2} raycast={noRaycast}>
          <planeGeometry args={[0.05, 0.12]} />
          <meshStandardMaterial color="#1c1b19" emissive="#f5c07a" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* Outside: call button + floor indicator above the door */}
      <mesh position={[ow + (cw - ow) / 2, slab + 0.3, half + 0.003]} raycast={noRaycast}>
        <planeGeometry args={[0.03, 0.06]} />
        <meshStandardMaterial color="#1c1b19" emissive="#f5c07a" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, top + 0.05, half + 0.003]} raycast={noRaycast}>
        <planeGeometry args={[L.opening * 0.5, 0.035]} />
        <meshStandardMaterial color="#1c1b19" emissive="#f5c07a" emissiveIntensity={0.6} />
      </mesh>

      {/* The rest of the lift bank + stair door */}
      <mesh geometry={others} material={leafMat} raycast={noRaycast} />
      <LiftBankSignals coreSize={c} floorHeight={H} slab={slab} />
    </group>
  );
}
