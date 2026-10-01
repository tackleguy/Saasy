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
 *   • Haze       — exponential fog matching the horizon so distant blocks
 *                  recede gradually while the skyline stays legible.
 */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
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
  /**
   * Sun study (Architect mode): an explicit sun position — elevation and
   * azimuth in degrees, see lib/architecture — instead of the preset's
   * afternoon sun. Light fades out as the sun drops below the horizon.
   */
  sun?: { elevation: number; azimuth: number } | null;
  /** Drop the haze (orthographic drawing views, where the camera is far away). */
  noFog?: boolean;
}

/** 0 below −1°, 1 above 8°: the sun's light fades in around sunrise and out at sunset. */
const daylight = (elevation: number) => THREE.MathUtils.smoothstep(elevation, -1, 8);
const LOW_SUN = new THREE.Color("#ffb27a");

export default function LightingEnvironment({ quality, preset, sun = null, noFog = false }: Props) {
  const sky = preset.sky;
  let sunPos: THREE.Vector3;
  let light = 1;
  let sunColor = new THREE.Color(sky.sunColor);
  if (sun) {
    const e = THREE.MathUtils.degToRad(sun.elevation);
    const a = THREE.MathUtils.degToRad(sun.azimuth);
    // North = −Z, east = +X (see lib/architecture).
    sunPos = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).multiplyScalar(200);
    light = daylight(sun.elevation);
    // Warmer light when the sun is low.
    sunColor = sunColor.clone().lerp(LOW_SUN, 1 - THREE.MathUtils.smoothstep(sun.elevation, 2, 25));
  } else {
    sunPos = sunDirection(sky.elevation).multiplyScalar(200);
  }
  const mapSize = quality === "high" ? 4096 : 2048;
  // A sun study can put the sun anywhere, so the shadow frustum widens to cover the site from every side.
  const wide = !!sun;

  // Shadow maps may be static (updated on demand): ask for a fresh one whenever the sun moves.
  const gl = useThree((st) => st.gl);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, sunPos.x, sunPos.y, sunPos.z]);

  return (
    <>
      <color attach="background" args={[sky.haze]} />
      {/* Exponential haze: clear up close, then a gradual aerial perspective, so distant
          skylines still read as silhouettes (density from the preset's fog distance). */}
      {!noFog && <fogExp2 attach="fog" args={[sky.haze, 0.85 / sky.fogFar]} />}
      <Sky distance={4500} sunPosition={sunPos.toArray()} turbidity={sky.turbidity} rayleigh={sky.rayleigh} mieCoefficient={0.004} mieDirectionalG={0.85} />

      {/* Image-based lighting + reflections from a bundled city HDR (not shown as background). */}
      <Environment files="/hdri/potsdamer_platz_1k.hdr" environmentIntensity={sky.envIntensity * (0.35 + 0.65 * light)} />

      {/* Skylight fill */}
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, 0.45 * (0.4 + 0.6 * light)]} />

      {/* Sun */}
      <directionalLight
        key={`${mapSize}:${wide}` /* re-create the shadow map when quality or the frustum changes */}
        position={sunPos.toArray()}
        intensity={sky.sunIntensity * light}
        color={sunColor}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.035}
        shadow-radius={4}
        shadow-camera-left={wide ? -170 : -90}
        shadow-camera-right={wide ? 170 : 90}
        shadow-camera-top={wide ? 170 : 150}
        shadow-camera-bottom={wide ? -170 : -70}
        shadow-camera-near={10}
        shadow-camera-far={wide ? 600 : 420}
      />
    </>
  );
}
