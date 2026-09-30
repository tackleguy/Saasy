"use client";
/**
 * The WebGL viewport: canvas, lighting, site context, the tower and the
 * GSAP-driven camera rig. Loaded client-side only (see app/page.tsx).
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import gsap from "gsap";

// Keep tweens time-accurate even on slow GPUs (no lag-smoothing slow-motion)
gsap.ticker.lagSmoothing(0);
import { useAura } from "@/lib/store";
import { towerHeight } from "@/lib/building";
import FloorPlate from "./FloorPlate";

/** Max vertical gap added between consecutive floors when fully exploded */
export const EXPLODE_GAP = 4;

const DEFAULT_CAM = new THREE.Vector3(112, 70, 138);

/* ------------------------------------------------------------ tower */
function Tower() {
  const { plates, explode, selected, hovered, furnish, setSelected, setHovered } = useAura();
  return (
    <group>
      {plates.map((p) => (
        <FloorPlate
          key={p.index}
          plate={p}
          targetY={p.baseY + p.index * EXPLODE_GAP * explode}
          selected={selected === p.index}
          dimmed={selected !== null && selected !== p.index}
          hovered={hovered === p.index}
          furnish={furnish}
          onSelect={(i) => setSelected(selected === i ? null : i)}
          onHover={setHovered}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------ camera rig */
function CameraRig() {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null };
  const { plates, selected, explode, cameraResetKey } = useAura();
  const baseH = useMemo(() => towerHeight(plates), [plates]);
  const first = useRef(true);

  useEffect(() => {
    if (!controls) return;
    const target = controls.target;
    const totalH = baseH + (plates.length - 1) * EXPLODE_GAP * explode;

    let toTarget: THREE.Vector3;
    let toCam: THREE.Vector3;

    if (selected !== null) {
      // Focus the chosen floor: keep the current viewing direction, move in close.
      const p = plates[selected];
      const y = p.baseY + p.index * EXPLODE_GAP * explode + p.height / 2;
      toTarget = new THREE.Vector3(0, y, 0);
      const dir = camera.position.clone().sub(target).setY(0).normalize();
      if (dir.lengthSq() < 0.01) dir.set(0.6, 0, 0.8);
      const dist = p.zone === "podium" ? 72 : 60;
      toCam = toTarget.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, 22, 0));
    } else {
      // Frame the whole (possibly exploded) tower.
      toTarget = new THREE.Vector3(0, totalH * 0.5, 0);
      const scale = 1 + explode * 0.6;
      toCam = new THREE.Vector3(DEFAULT_CAM.x * scale, DEFAULT_CAM.y * scale + explode * 30, DEFAULT_CAM.z * scale);
    }

    const duration = first.current ? 0 : 1.2;
    first.current = false;
    gsap.to(target, { x: toTarget.x, y: toTarget.y, z: toTarget.z, duration, ease: "power3.inOut", overwrite: true, onUpdate: () => controls.update() });
    gsap.to(camera.position, { x: toCam.x, y: toCam.y, z: toCam.z, duration, ease: "power3.inOut", overwrite: true, onUpdate: () => controls.update() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, explode, cameraResetKey, controls]);

  return null;
}

/* ------------------------------------------------------------ site context */
/** Low, dark neighbour massing so the tower reads at urban scale */
function SiteContext() {
  const blocks = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 62 + rnd() * 110;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 8 + rnd() * 12, d: 8 + rnd() * 12, h: 4 + rnd() * 18 });
    }
    return out;
  }, []);
  return (
    <group>
      {blocks.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} receiveShadow castShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color="#12151c" roughness={0.9} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------ canvas */
export default function Scene() {
  const { setSelected } = useAura();
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: DEFAULT_CAM.toArray() as [number, number, number], fov: 38, near: 0.5, far: 1200 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => setSelected(null)}
    >
      <color attach="background" args={["#0b0d11"]} />
      <fog attach="fog" args={["#0b0d11", 160, 420]} />

      {/* Lighting: soft ambient + warm key + cool rim */}
      <hemisphereLight args={["#bcc6d6", "#0b0d11", 0.45]} />
      <directionalLight
        position={[60, 110, 40]}
        intensity={2.1}
        color="#fff2d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={160}
        shadow-camera-bottom={-40}
        shadow-camera-far={400}
      />
      <directionalLight position={[-70, 40, -60]} intensity={0.6} color="#7f9cc4" />

      {/* Studio reflections built from light-formers — no external HDR files needed */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 40, -60]} scale={[120, 30, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#d4af37" position={[80, 20, 0]} rotation-y={-Math.PI / 2} scale={[60, 12, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#7f9cc4" position={[-80, 30, 20]} rotation-y={Math.PI / 2} scale={[60, 20, 1]} />
      </Environment>

      <Tower />
      <SiteContext />

      {/* Ground plane + subtle survey grid */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <circleGeometry args={[400, 64]} />
        <meshStandardMaterial color="#0e1116" roughness={1} />
      </mesh>
      <gridHelper args={[240, 48, "#262b36", "#171b23"]} position-y={0.01} />
      <ContactShadows position={[0, 0.03, 0]} opacity={0.6} scale={90} blur={2.4} far={40} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={18}
        maxDistance={480}
        maxPolarAngle={Math.PI / 2.05}
      />
      <CameraRig />
    </Canvas>
  );
}
