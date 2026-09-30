"use client";
/**
 * LightingEnvironment — studio lighting, shadows, skybox and ground.
 * -----------------------------------------------------------------------------
 * Everything is procedural (no HDR or texture downloads):
 *   • Gradient sky dome   — a back-faced sphere with a tiny GLSL gradient.
 *   • Studio reflections  — drei <Environment> baked once from <Lightformer>s,
 *                           giving the basalt and glass something to reflect.
 *   • Key / rim / fill    — warm key light with soft shadows, cool rim light.
 *   • Ground              — dark plinth, survey grid and contact shadows.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";

const BG = "#090a0f";

/** Large inverted sphere shaded with a vertical obsidian → blue-slate gradient + gold horizon haze. */
function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color("#0b1020") },
          bottom: { value: new THREE.Color(BG) },
          haze: { value: new THREE.Color("#3a2f14") },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vWorld = normalize((modelMatrix * vec4(position, 1.0)).xyz);
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 bottom; uniform vec3 haze;
          varying vec3 vWorld;
          void main() {
            float h = vWorld.y;
            vec3 col = mix(bottom, top, smoothstep(-0.05, 0.6, h));
            col += haze * exp(-abs(h) * 14.0) * 0.55;   // warm glow on the horizon
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    []
  );
  return (
    <mesh material={material} scale={500} raycast={() => null} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  );
}

export default function LightingEnvironment() {
  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 70, 220]} />
      <SkyDome />

      {/* Soft ambient fill */}
      <hemisphereLight args={["#c8d2e0", "#090a0f", 0.5]} />

      {/* Warm key light with soft shadows */}
      <directionalLight
        position={[28, 46, 18]}
        intensity={2.2}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={80}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />

      {/* Cool rim light from behind */}
      <directionalLight position={[-30, 22, -26]} intensity={0.8} color="#7f9cc4" />

      {/* Studio reflections — baked once, zero per-frame cost */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 20, -30]} scale={[60, 14, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#d4af37" position={[36, 10, 0]} rotation-y={-Math.PI / 2} scale={[30, 6, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#7f9cc4" position={[-36, 14, 10]} rotation-y={Math.PI / 2} scale={[30, 10, 1]} />
        <Lightformer form="ring" intensity={1.6} color="#f3e5ab" position={[0, 40, 0]} rotation-x={Math.PI / 2} scale={12} />
      </Environment>

      {/* Ground plinth, survey grid and soft contact shadow */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow raycast={() => null}>
        <circleGeometry args={[400, 64]} />
        <meshStandardMaterial color="#0c0e14" roughness={0.95} metalness={0.1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005} raycast={() => null}>
        <ringGeometry args={[9.5, 9.6, 96]} />
        <meshBasicMaterial color="#d4af37" transparent opacity={0.35} />
      </mesh>
      <gridHelper args={[120, 60, "#232836", "#141821"]} position-y={0.01} />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.65} scale={40} blur={2.2} far={20} resolution={512} />
    </>
  );
}
