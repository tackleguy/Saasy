"use client";
import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { LibraryModel as Model } from "@/lib/modelLibrary";
import { invalidateShadows } from "./staticShadows";

class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Loaded({ model, maxWidth, maxDepth, maxHeight }: { model: Model; maxWidth?: number; maxDepth?: number; maxHeight?: number }) {
  // Installs are self-contained GLBs. No model or texture fetches from Sketchfab at runtime.
  const { scene } = useGLTF(model.path);
  const object = useMemo(() => {
    const result = new THREE.Group();
    const copy = clone(scene);
    copy.rotation.y += model.rotationY;
    result.add(copy);
    result.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(result);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = Math.min(model.sizeMeters / Math.max(size.x, size.y, size.z, 0.001),
      maxWidth ? maxWidth / Math.max(size.x, 0.001) : Infinity,
      maxDepth ? maxDepth / Math.max(size.z, 0.001) : Infinity,
      maxHeight ? maxHeight / Math.max(size.y, 0.001) : Infinity);
    copy.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
    result.scale.setScalar(scale);
    result.traverse((node) => {
      if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    return result;
  }, [scene, model, maxWidth, maxDepth, maxHeight]);
  useEffect(() => { invalidateShadows(); return () => invalidateShadows(); }, [object]);
  return <primitive object={object} dispose={null} />;
}

export default function LibraryModel({ fallback = null, ...props }: {
  model: Model; maxWidth?: number; maxDepth?: number; maxHeight?: number; fallback?: ReactNode;
}) {
  return <ModelBoundary key={props.model.uid} fallback={fallback}>
    <Suspense fallback={fallback}><Loaded {...props} /></Suspense>
  </ModelBoundary>;
}
