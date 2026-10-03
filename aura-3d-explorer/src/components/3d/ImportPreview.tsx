"use client";
import { Component, Suspense, useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Environment, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert" className="p-5 text-sm text-ink">The preview could not render. Check the file and try a smaller GLB export.</p> : this.props.children; }
}
export default function ImportPreview({ model, revision }: { model: THREE.Object3D; revision: string }) {
  const clone = useMemo(() => model.clone(true), [model]);
  return <PreviewBoundary key={revision}><Canvas camera={{ position: [30, 20, 30], fov: 40 }} dpr={[1, 1.5]} gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}>
    <color attach="background" args={["#d2d5d7"]}/>
    <hemisphereLight args={["#d9e7f2", "#62594b", 1.5]}/>
    <directionalLight position={[30, 40, 20]} intensity={3} color="#ffe3be"/>
    <Suspense fallback={null}><Environment files="/hdri/potsdamer_platz_1k.hdr"/></Suspense>
    <Bounds key={revision} fit clip observe margin={1.25}><primitive object={clone} dispose={null}/></Bounds>
    <Grid position-y={-.005} args={[300,300]} cellSize={2.8} cellColor="#8a9096" sectionColor="#737c83" sectionSize={14} fadeDistance={200}/>
    <OrbitControls makeDefault minDistance={.5}/>
  </Canvas></PreviewBoundary>;
}
