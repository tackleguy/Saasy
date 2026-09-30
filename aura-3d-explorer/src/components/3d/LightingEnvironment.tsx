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

/** Scene background / fog colour — a deep dusk blue that melts into the sky horizon. */
const BG = "#0e1320";

/** Large inverted sphere shaded with a vertical obsidian → blue-slate gradient + gold horizon haze. */
function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color("#0c1630") },
          bottom: { value: new THREE.Color(BG) },
          haze: { value: new THREE.Color("#b0703c") },
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
            vec3 col = mix(bottom, top, smoothstep(-0.02, 0.55, h));
            col += vec3(0.05, 0.08, 0.16) * smoothstep(0.0, 0.25, h) * (1.0 - smoothstep(0.25, 0.8, h)); // dusk blue band
            col += haze * exp(-abs(h) * 11.0) * 0.5;   // warm sunset glow on the horizon
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
      <fog attach="fog" args={[BG, 110, 430]} />
      <SkyDome />

      {/* Soft ambient fill */}
      <hemisphereLight args={["#aebfdc", "#0e1320", 0.6]} />

      {/* Warm key light with soft shadows */}
      <directionalLight
        position={[40, 70, 26]}
        intensity={2.2}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={70}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={240}
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
      {/* Paved site plinth tying the three towers together */}
      <mesh rotation-x={-Math.PI / 2} rotation-z={-Math.PI / 4} position-y={0.004} receiveShadow raycast={() => null}>
        <planeGeometry args={[34, 78]} />
        <meshStandardMaterial color="#141821" roughness={0.8} metalness={0.2} />
      </mesh>
      <gridHelper args={[160, 80, "#232836", "#141821"]} position-y={0.001} />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.6} scale={100} blur={2.2} far={20} resolution={1024} />
    </>
  );
}
