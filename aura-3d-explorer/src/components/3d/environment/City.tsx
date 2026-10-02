"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type UWRect, rectsOverlap } from "@/lib/siteLayout";
import { ALONG_U, placeUW, rng, uploadInstances, noRaycast } from "../context/shared";
import { SUN, useCinematic } from "./settings";

/** Three instanced batches, 150 addresses; L wings and setbacks reuse each batch. */
export default function City({clearings=[],seed=83}:{clearings?:UWRect[];seed?:number}) {
  const {tier,time}=useCinematic();
  const materials=useRef<(THREE.MeshStandardMaterial|null)[]>([]);
  const windows=useMemo(()=>{
    const c=document.createElement("canvas");c.width=128;c.height=256;
    const ctx=c.getContext("2d")!;ctx.fillStyle="#050608";ctx.fillRect(0,0,128,256);
    const random=rng(1489);
    for(let y=4;y<256;y+=16)for(let x=4;x<128;x+=16){ctx.fillStyle=random()<0.7?"#a89476":"#151a22";ctx.fillRect(x,y,7,9);}
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;
  },[]);
  useEffect(()=>()=>windows.dispose(),[windows]);
  const rings=useMemo(()=>{
    const random=rng(seed);const groups:THREE.Matrix4[][]=[[],[],[]];
    for(let i=0;i<150;i++){
      const col=i%20,row=Math.floor(i/20),ring=row<3?0:row<6?1:2;
      const u=(col-9.5)*22,w=-65-row*28;
      const width=8+random()*7,depth=8+random()*9;
      const height=ring===0?5.4+random()*5.4:ring===1?10.8+random()*25.2:12+random()*35;
      if(clearings.some(c=>rectsOverlap(c,{u0:u-width/2,u1:u+width/2,w0:w-depth/2,w1:w+depth/2})))continue;
      const add=(du:number,dw:number,y:number,sx:number,sy:number,sz:number)=>groups[ring].push(placeUW(u+du,w+dw,y,ALONG_U,new THREE.Vector3(sx,sy,sz)));
      const type=i%7;
      if(type===0){add(-width*.2,0,height/2,width*.6,height,depth);add(width*.3,depth*.3,height*.4,width*.4,height*.8,depth*.4);}
      else if(type===1){add(0,0,height*.32,width,height*.64,depth);add(0,0,height*.82,width*.65,height*.36,depth*.65);}
      else add(0,0,height/2,type===2?width*.5:width,height,type===2?depth*1.4:depth);
    }
    return groups;
  },[seed,clearings]);
  useFrame((_,dt)=>materials.current.forEach(m=>{if(m)m.emissiveIntensity=THREE.MathUtils.damp(m.emissiveIntensity,SUN[time].night*0.65,3,dt);}));
  return <group name="cinematic-city">{rings.map((matrices,i)=>i===2&&tier==="low"?null:<instancedMesh key={i} ref={m=>uploadInstances(m,matrices)} args={[undefined,undefined,matrices.length]} raycast={noRaycast}>
    <boxGeometry/>
    <meshStandardMaterial ref={m=>{materials.current[i]=m;}} color={["#2A2F3A","#222733","#1A1E27"][i]} roughness={i===0?0.42:0.8} metalness={i===0?0.28:0.05} map={i<2?windows:undefined} emissive={i<2?"#FFE2B0":"#000000"} emissiveMap={i<2?windows:undefined} emissiveIntensity={0}/>
  </instancedMesh>)}</group>;
}
