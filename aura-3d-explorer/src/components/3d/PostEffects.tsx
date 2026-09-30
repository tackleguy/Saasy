"use client";
/**
 * PostEffects — the "High" quality post-processing stack.
 * -----------------------------------------------------------------------------
 *   1. N8AO     — screen-space ambient occlusion; grounds furniture, mullions
 *                 and slab edges. Radius is in world units (1 ≈ 3.6 m).
 *   2. Bloom    — very low, threshold 0.9, so only the sun glints on glass
 *                 and warm interior lamps bloom.
 *   3. DoF      — only when a floor is isolated (and not while walking):
 *                 focuses on that floor so the rest of the site softens.
 *   4. Grade    — a touch of contrast and saturation, like a camera profile.
 *   5. Vignette — 0.25, a photographic fall-off.
 *   6. ACES tone mapping, exposure 1.05.
 *   7. Grain    — very faint film grain after tone mapping, which breaks up
 *                 banding in the sky gradient and fog.
 *
 * With a composer, three.js only tone-maps when rendering to the screen, so
 * the renderer's tone mapping is effectively bypassed and the ToneMapping
 * effect does it instead (reading gl.toneMappingExposure).
 */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Bloom, BrightnessContrast, DepthOfField, EffectComposer, HueSaturation, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { N8AOPostPass } from "n8ao";
import * as THREE from "three";

/** Wraps n8ao's pass so it can sit inside <EffectComposer> as a child. */
function N8AO() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const pass = useMemo(() => new N8AOPostPass(scene, camera, size.width, size.height), [scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = pass.configuration;
    c.aoRadius = 1.2;
    c.distanceFalloff = 0.6;
    c.intensity = 2.2;
    c.color = new THREE.Color("#3a3128");
    c.halfRes = true;
    c.depthAwareUpsampling = true;
    c.transparencyAware = false;
    pass.setQualityMode("Medium");
  }, [pass]);

  useEffect(() => pass.setSize(size.width, size.height), [pass, size.width, size.height]);

  return <primitive object={pass} dispose={null} />;
}

interface Props {
  /** World-space point to focus on, or null to disable depth of field. */
  focus: [number, number, number] | null;
}

export default function PostEffects({ focus }: Props) {
  const target = useMemo(() => (focus ? new THREE.Vector3(...focus) : null), [focus?.[0], focus?.[1], focus?.[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <N8AO />
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.35} mipmapBlur />
      {target ? <DepthOfField target={target} focalLength={0.02} bokehScale={2} /> : <></>}
      <BrightnessContrast brightness={0} contrast={0.05} />
      <HueSaturation hue={0} saturation={0.06} />
      <Vignette offset={0.3} darkness={0.25} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.18} />
    </EffectComposer>
  );
}
