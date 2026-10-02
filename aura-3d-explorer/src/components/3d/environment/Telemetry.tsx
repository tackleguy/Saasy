"use client";
import type * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Tier } from "./settings";
/** Complete-frame counters include reflection, transmission and composer passes. */
export default function Telemetry({tier}:{tier:Tier}) {
  const gl=useThree(s=>s.gl), scene=useThree(s=>s.scene);
  const sample=useRef({at:performance.now(),frames:0,calls:0,triangles:0});
  useEffect(()=>{gl.info.autoReset=false;return()=>{gl.info.autoReset=true;delete gl.domElement.dataset.graphics;};},[gl]);
  useFrame(()=>{
    const s=sample.current;s.frames++;s.calls+=gl.info.render.calls;s.triangles+=gl.info.render.triangles;
    const now=performance.now();
    if(now-s.at>1000){
      const tower:Record<string,number>={};
      scene.traverse(o=>{if(o.userData.heroBuilding){let n=0;o.traverse(c=>{if((c as THREE.Mesh).isMesh&&c.visible&&c.layers.test(gl.xr.isPresenting?gl.xr.getCamera().layers:{mask:3} as THREE.Layers))n++;});tower[o.name]=n;}});
      gl.domElement.dataset.graphics=JSON.stringify({tier,fps:Math.round(s.frames*1000/(now-s.at)),calls:Math.round(s.calls/s.frames),triangles:Math.round(s.triangles/s.frames),geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,programs:gl.info.programs?.length,towerMeshes:tower});
      s.at=now;s.frames=0;s.calls=0;s.triangles=0;
    }
    gl.info.reset();
  },-100);
  return null;
}
