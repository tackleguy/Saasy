"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityPreset } from "@/lib/cityPresets";
import { SITE_ROTATION_Y, type UWRect } from "@/lib/siteLayout";
import { noRaycast, rng } from "../context/shared";
import { facadeTexture } from "../textures";
import Landmarks from "../context/Landmarks";
import { SUN, useCinematic } from "./settings";
import { buildSkyline } from "./skylineGeometry";

/** One automatic city pipeline for every project. No model or texture downloads. */
export default function City({preset,clearings=[]}:{preset:CityPreset;clearings?:UWRect[]}) {
  const {tier,time}=useCinematic();
  const materials=useRef<(THREE.MeshStandardMaterial|null)[]>([]);
  const batches=useMemo(()=>buildSkyline(preset,clearings,tier==="low"),[preset,clearings,tier]);
  useEffect(()=>()=>batches.forEach(b=>b.geometry.dispose()),[batches]);
  // Sparse window light is independent of the daytime facade: roofs never glow.
  const windows=useMemo(()=>{
    const c=document.createElement("canvas");c.width=256;c.height=256;
    const ctx=c.getContext("2d")!;ctx.fillStyle="#000000";ctx.fillRect(0,0,256,256);
    const random=rng(1489);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(random()<.34){ctx.fillStyle=random()<.7?"#e7c394":"#9baebd";ctx.fillRect(x*32+8,y*32+6,16,18);}
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/8,1/8);t.colorSpace=THREE.SRGBColorSpace;return t;
  },[]);
  useEffect(()=>()=>windows.dispose(),[windows]);
  useFrame((_,dt)=>materials.current.forEach(m=>{if(m)m.emissiveIntensity=THREE.MathUtils.damp(m.emissiveIntensity,SUN[time].night*.75,3,dt);}));
  return <group name={`cinematic-city-${preset.id}`}>
    <group rotation-y={SITE_ROTATION_Y}>{batches.map(({finish,geometry},i)=>{
      const glass=finish==="glass"||finish==="tower", roof=finish==="roof";
      return <mesh key={finish} geometry={geometry} raycast={noRaycast}>
        <meshStandardMaterial ref={m=>{materials.current[i]=m;}} vertexColors map={roof?undefined:facadeTexture(finish)} roughness={glass?.3:.86} metalness={glass?.32:0} envMapIntensity={glass?1.1:.4} emissive={roof?"#000000":"#ffe4bf"} emissiveMap={roof?undefined:windows} emissiveIntensity={0}/>
      </mesh>;
    })}</group>
    <Landmarks preset={preset} clearings={clearings}/>
  </group>;
}
