"use client";
/**
 * LightingEnvironment — daylight, tuned per city preset (sun height and
 * colour, haze, fog distance, skylight). Defaults describe the neutral preset.
 * -----------------------------------------------------------------------------
 *   • Sky        — drei <Sky> (physically based Preetham model) with the sun
 *                  low in the south-west, giving a warm horizon and pale zenith.
 *   • Reflections — a real HDR (Potsdamer Platz, Poly Haven, CC0) bundled in
 *                  /public/hdri, so glass and water reflect a city — no CDN.
 *   • Key light  — warm #FFE8C8 sun at ~28° elevation, 4096² soft shadows.
 *                  bias + normalBias are tuned to remove acne on the thin
 *                  slabs without peter-panning the podium.
 *   • Fill       — cool hemisphere light standing in for skylight bounce.
 *   • Haze       — light fog matching the horizon so distant blocks recede.
 */
import { Environment, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { CityPreset } from "@/lib/cityPresets";

/** Horizontal heading of the sun: behind the default camera's left shoulder. */
const HEADING = new THREE.Vector2(0.35, 1.06).normalize(); // horizontal x/z

/**
 * Direction TO the sun at a given elevation. The camera sits on the +X/+Z
 * diagonal, so the faces the viewer sees are lit and shadows fall back-right,
 * like an archviz render. Each city preset sets its own elevation.
 */
export function sunDirection(elevationDeg: number) {
  const e = THREE.MathUtils.degToRad(elevationDeg);
  return new THREE.Vector3(Math.cos(e) * HEADING.x, Math.sin(e), Math.cos(e) * HEADING.y);
}

interface Props {
  /** High quality: 4096 shadow map; low: 2048. */
  quality: "high" | "low";
  preset: CityPreset;
}

export default function LightingEnvironment({ quality, preset }: Props) {
  const sky = preset.sky;
  const sunPos = sunDirection(sky.elevation).multiplyScalar(200);
  const mapSize = quality === "high" ? 4096 : 2048;

  return (
    <>
      <color attach="background" args={[sky.haze]} />
      <fog attach="fog" args={[sky.haze, sky.fogNear, sky.fogFar]} />
      <Sky distance={4500} sunPosition={sunPos.toArray()} turbidity={sky.turbidity} rayleigh={sky.rayleigh} mieCoefficient={0.004} mieDirectionalG={0.85} />

      {/* Image-based lighting + reflections from a bundled city HDR (not shown as background). */}
      <Environment files="/hdri/potsdamer_platz_1k.hdr" environmentIntensity={sky.envIntensity} />

      {/* Skylight fill */}
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, 0.45]} />

      {/* Sun */}
      <directionalLight
        key={mapSize /* re-create the shadow map when quality changes */}
        position={sunPos.toArray()}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.035}
        shadow-radius={4}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={150}
        shadow-camera-bottom={-70}
        shadow-camera-near={10}
        shadow-camera-far={420}
      />
    </>
  );
}
