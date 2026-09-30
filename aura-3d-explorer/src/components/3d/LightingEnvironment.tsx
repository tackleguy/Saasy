"use client";
/**
 * LightingEnvironment — late-afternoon daylight.
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

/**
 * Direction TO the sun: 28° above the horizon, behind the default camera's
 * left shoulder (camera sits on the +X/+Z diagonal), so the faces the viewer
 * sees are warmly lit and shadows fall back-right, like a golden-hour render.
 */
const ELEVATION = THREE.MathUtils.degToRad(28);
const HEADING = new THREE.Vector2(0.35, 1.06).normalize(); // horizontal x/z
export const SUN_DIRECTION = new THREE.Vector3(
  Math.cos(ELEVATION) * HEADING.x,
  Math.sin(ELEVATION),
  Math.cos(ELEVATION) * HEADING.y
);

const HAZE = "#dfe2e1";

interface Props {
  /** High quality: 4096 shadow map; low: 2048. */
  quality: "high" | "low";
}

export default function LightingEnvironment({ quality }: Props) {
  const sunPos = SUN_DIRECTION.clone().multiplyScalar(200);
  const mapSize = quality === "high" ? 4096 : 2048;

  return (
    <>
      <color attach="background" args={[HAZE]} />
      <fog attach="fog" args={[HAZE, 160, 520]} />
      <Sky distance={4500} sunPosition={sunPos.toArray()} turbidity={5} rayleigh={1.4} mieCoefficient={0.004} mieDirectionalG={0.85} />

      {/* Image-based lighting + reflections from a bundled city HDR (not shown as background). */}
      <Environment files="/hdri/potsdamer_platz_1k.hdr" environmentIntensity={0.55} />

      {/* Cool skylight fill */}
      <hemisphereLight args={["#cfdcea", "#b8ab97", 0.45]} />

      {/* Warm low sun */}
      <directionalLight
        key={mapSize /* re-create the shadow map when quality changes */}
        position={sunPos.toArray()}
        intensity={2.6}
        color="#FFE8C8"
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
