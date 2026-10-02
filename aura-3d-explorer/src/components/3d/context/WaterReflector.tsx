"use client";
/**
 * WaterReflector — drei's MeshReflectorMaterial, re-wired for a large site.
 * -----------------------------------------------------------------------------
 * Same material and blur as drei's <MeshReflectorMaterial> (its shader class
 * and BlurPass are reused), but the planar reflection pass is cheaper:
 *   • it re-renders every `interval` frames (default 2) instead of every
 *     frame — the reflection is blurred and rippled, a one-frame lag is
 *     invisible, and the texture matrix is kept in step with the texture;
 *   • its mirrored camera sees layer 0 only, so the main-camera-only details
 *     on DETAIL_LAYER (lift doors, ceilings, balcony furniture, rails…) are
 *     skipped;
 *   • it is skipped while the camera is below the water plane.
 * Use as the water mesh's material, passing that mesh's ref:
 *   <mesh ref={water}><WaterReflector mesh={water} … /></mesh>
 */
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { MeshReflectorMaterial as ReflectorMaterialImpl } from "@react-three/drei/materials/MeshReflectorMaterial";
import { BlurPass } from "@react-three/drei/materials/BlurPass";

interface Props {
  /** The reflecting plane (its local +Z is the plane normal, like drei's). */
  mesh: RefObject<THREE.Mesh | null>;
  resolution?: number;
  blur?: [number, number];
  mixBlur?: number;
  mixStrength?: number;
  mirror?: number;
  roughness?: number;
  metalness?: number;
  depthScale?: number;
  minDepthThreshold?: number;
  maxDepthThreshold?: number;
  depthToBlurRatioBias?: number;
  distortion?: number;
  distortionMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  normalScale?: THREE.Vector2;
  color?: THREE.ColorRepresentation;
  /** Re-render the reflection every N frames. */
  interval?: number;
}

export default function WaterReflector({
  mesh,
  resolution = 512,
  blur = [0, 0],
  mixBlur = 0,
  mixStrength = 1,
  mirror = 0,
  roughness = 1,
  metalness = 0,
  depthScale = 0,
  minDepthThreshold = 0.9,
  maxDepthThreshold = 1,
  depthToBlurRatioBias = 0.25,
  distortion = 1,
  distortionMap,
  normalMap,
  normalScale,
  color = "#ffffff",
  interval = 2,
}: Props) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const [bx, by] = blur;
  const hasBlur = bx + by > 0;

  const tmp = useMemo(
    () => ({
      plane: new THREE.Plane(),
      normal: new THREE.Vector3(),
      reflectorPos: new THREE.Vector3(),
      cameraPos: new THREE.Vector3(),
      rotation: new THREE.Matrix4(),
      lookAt: new THREE.Vector3(),
      clip: new THREE.Vector4(),
      view: new THREE.Vector3(),
      target: new THREE.Vector3(),
      q: new THREE.Vector4(),
      textureMatrix: new THREE.Matrix4(),
      virtualCamera: new THREE.PerspectiveCamera(), // layer 0 only
    }),
    []
  );

  const [fbo1, fbo2, blurPass] = useMemo(() => {
    const params = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType };
    const a = new THREE.WebGLRenderTarget(resolution, resolution, params);
    a.depthBuffer = true;
    a.depthTexture = new THREE.DepthTexture(resolution, resolution);
    a.depthTexture.format = THREE.DepthFormat;
    a.depthTexture.type = THREE.UnsignedShortType;
    const b = new THREE.WebGLRenderTarget(resolution, resolution, params);
    const pass = new BlurPass({ gl, resolution, width: bx, height: by, minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias });
    return [a, b, pass];
  }, [gl, resolution, bx, by, minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias]);
  useEffect(
    () => () => {
      fbo1.depthTexture?.dispose();
      fbo1.dispose();
      fbo2.dispose();
      blurPass.renderTargetA.dispose();
      blurPass.renderTargetB.dispose();
      blurPass.convolutionMaterial.dispose();
    },
    [fbo1, fbo2, blurPass]
  );

  const material = useMemo(() => {
    const m = new ReflectorMaterialImpl();
    m.defines = { ...m.defines, ...(hasBlur && { USE_BLUR: "" }), ...(depthScale > 0 && { USE_DEPTH: "" }), ...(distortionMap && { USE_DISTORTION: "" }) };
    return m;
  }, [hasBlur, depthScale, distortionMap]);
  useEffect(() => () => material.dispose(), [material]);

  // Initialize matrix uniforms before the first render, including city remounts.
  useLayoutEffect(() => {
    const m = material as ReflectorMaterialImpl & Record<string, unknown>;
    Object.assign(m, {
      textureMatrix: tmp.textureMatrix,
      tDiffuse: fbo1.texture,
      tDepth: fbo1.depthTexture,
      tDiffuseBlur: fbo2.texture,
      hasBlur,
      mirror,
      mixBlur,
      mixStrength,
      minDepthThreshold,
      maxDepthThreshold,
      depthScale,
      depthToBlurRatioBias,
      distortion,
      distortionMap: distortionMap ?? null,
      mixContrast: 1,
    });
    m.roughness = roughness;
    m.metalness = metalness;
    m.color.set(color);
    m.normalMap = normalMap ?? null;
    if (normalScale) m.normalScale.copy(normalScale);
    m.needsUpdate = true;
  }, [material, tmp, fbo1, fbo2, hasBlur, mirror, mixBlur, mixStrength, minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias, distortion, distortionMap, roughness, metalness, color, normalMap, normalScale]);

  const frame = useRef(0);

  /** Mirror the camera about the water plane (drei's math, incl. the oblique clip plane). Returns false when looking from below. */
  const aimVirtualCamera = (parent: THREE.Object3D) => {
    const { plane, normal, reflectorPos, cameraPos, rotation, lookAt, clip, view, target, q, textureMatrix, virtualCamera } = tmp;
    reflectorPos.setFromMatrixPosition(parent.matrixWorld);
    cameraPos.setFromMatrixPosition(camera.matrixWorld);
    rotation.extractRotation(parent.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(rotation);
    view.subVectors(reflectorPos, cameraPos);
    if (view.dot(normal) > 0) return false;
    view.reflect(normal).negate().add(reflectorPos);
    rotation.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rotation).add(cameraPos);
    target.subVectors(reflectorPos, lookAt).reflect(normal).negate().add(reflectorPos);
    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    virtualCamera.lookAt(target);
    virtualCamera.far = camera.far;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(virtualCamera.projectionMatrix).multiply(virtualCamera.matrixWorldInverse).multiply(parent.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, reflectorPos).applyMatrix4(virtualCamera.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = virtualCamera.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + p[8]) / p[0];
    q.y = (Math.sign(clip.y) + p[9]) / p[5];
    q.z = -1;
    q.w = (1 + p[10]) / p[14];
    clip.multiplyScalar(2 / clip.dot(q));
    p[2] = clip.x;
    p[6] = clip.y;
    p[10] = clip.z + 1;
    p[14] = clip.w;
    return true;
  };

  useFrame(() => {
    const parent = mesh.current;
    if (!parent) return;
    if (frame.current++ % Math.max(1, interval) !== 0) return;
    if (!aimVirtualCamera(parent)) return;
    parent.visible = false;
    const xr = gl.xr.enabled;
    const autoShadows = gl.shadowMap.autoUpdate;
    const needsShadows = gl.shadowMap.needsUpdate;
    gl.xr.enabled = false;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = false; // shadows are drawn from the main camera only
    gl.setRenderTarget(fbo1);
    gl.state.buffers.depth.setMask(true);
    if (!gl.autoClear) gl.clear();
    gl.render(scene, tmp.virtualCamera);
    if (hasBlur) blurPass.render(gl, fbo1, fbo2);
    gl.xr.enabled = xr;
    gl.shadowMap.autoUpdate = autoShadows;
    gl.shadowMap.needsUpdate = needsShadows;
    parent.visible = true;
    gl.setRenderTarget(null);
  });

  return <primitive object={material} attach="material" />;
}
