"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Building, FloorData } from "@/types";
import { explodedY, MODEL_SCALE } from "@/lib/tower";
import { plateOutline } from "@/lib/plateOutline";
import { rng } from "../context/shared";
import { SUN, useCinematic } from "./settings";
type Piece={floor:FloorData;matrix:THREE.Matrix4};
/** All lit windows and terrace parts are per-floor transforms in four building-wide batches. */
export default function FacadeDetails({building,explosion,selectedIndex,hidden}:{building:Building;explosion:number;selectedIndex:number|null;hidden:boolean}) {
  const {time}=useCinematic();
  const windows=useRef<THREE.InstancedMesh>(null),roof=useRef<THREE.InstancedMesh>(null),plants=useRef<THREE.InstancedMesh>(null);
  const glow=useRef<THREE.MeshStandardMaterial>(null);
  const data=useMemo(()=>{
    const random=rng(71);const panels:Piece[]=[],solids:Piece[]=[],shrubs:Piece[]=[],strips:Piece[]=[];
    const transform=new THREE.Object3D();
    const add=(list:Piece[],f:FloorData,x:number,y:number,z:number,w:number,h:number,d:number,angle=0)=>{transform.position.set(x,y,z);transform.rotation.set(0,angle,0);transform.scale.set(w,h,d);transform.updateMatrix();list.push({floor:f,matrix:transform.matrix.clone()});};
    building.floors.forEach((f,index)=>{
      const points=plateOutline(f);const zoneTop=index===building.floors.length-1||building.floors[index+1].zone!==f.zone;
      for(let edge=0;edge<points.length;edge++){
        const a=points[edge],b=points[(edge+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx);
        const count=Math.max(1,Math.floor(len/(1.5*MODEL_SCALE)));
        for(let j=0;j<count;j++){
          if(random()>0.7||f.zone==="podium")continue;
          const t=(j+.5)/count;
          // Just behind the physical glazing: occupied interior rooms, not glowing glass.
          const x=(a[0]+dx*t)*.985,z=(a[1]+dz*t)*.985;
          add(panels,f,x,f.height*.55,z,len/count*.78,f.height*.58,.015,angle);
        }
        if(f.zone==="residential")add(strips,f,(a[0]+b[0])*.5,0.055,(a[1]+b[1])*.5,len,.014,.035,angle);
        if(zoneTop){
          add(solids,f,(a[0]+b[0])*.485,f.height+.12,(a[1]+b[1])*.485,len*.97,.24,.065,angle);
          if(edge%2===0){add(solids,f,(a[0]+b[0])*.38,f.height+.14,(a[1]+b[1])*.38,Math.min(len*.5,1.4),.28,.45,angle);add(shrubs,f,(a[0]+b[0])*.38,f.height+.38,(a[1]+b[1])*.38,Math.min(len*.24,.65),.32,.3,angle);}
        }
      }
      if(zoneTop){const core=Math.min(f.width,f.depth)*.34;for(let k=0;k<5;k++)add(solids,f,0,f.height+.25+k*.085,-core*.5,core,.035,.08);}
      if(f.zone==="podium"&&index===0)add(solids,f,0,f.height*.87,f.depth*.5+.25,Math.min(3.2,f.width*.7),.07,.85);
    });
    return {panels:[...panels,...strips],solids,shrubs,};
  },[building]);
  const matrix=useMemo(()=>new THREE.Matrix4(),[]),parent=useMemo(()=>new THREE.Matrix4(),[]),q=useMemo(()=>new THREE.Quaternion(),[]),pos=useMemo(()=>new THREE.Vector3(),[]),scale=useMemo(()=>new THREE.Vector3(1,1,1),[]),axis=useMemo(()=>new THREE.Vector3(0,1,0),[]),color=useMemo(()=>new THREE.Color(),[]);
  useEffect(()=>{
    for(const ref of [glow]) {
      const material=ref.current;if(!material)continue;
      material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>","#include <color_fragment>\n#ifdef USE_COLOR\ndiffuseColor.a *= vColor.r;\n#endif").replace("#include <emissivemap_fragment>","#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif");};
      material.customProgramCacheKey=()=>"aura-floor-emission-v1";material.needsUpdate=true;
    }
  },[]);
  const heights=useRef(new Map<number,number>());
  const settle=useRef(Infinity);
  useEffect(()=>{settle.current=performance.now()+2200;},[building,explosion,selectedIndex,hidden]);
  useFrame((_,dt)=>{
    if(performance.now()<settle.current) {
    building.floors.forEach(f=>heights.current.set(f.index,THREE.MathUtils.damp(heights.current.get(f.index)??f.baseY,explodedY(f,explosion),7,dt)));
    [[windows,data.panels],[roof,data.solids],[plants,data.shrubs]].forEach(([ref,list])=>{
      const mesh=(ref as typeof windows).current;if(!mesh)return;
      (list as Piece[]).forEach((p,i)=>{
        const dimmed=selectedIndex!==null&&selectedIndex!==p.floor.index;
        q.setFromAxisAngle(axis,p.floor.rotationY);pos.set(0,heights.current.get(p.floor.index)!,0);
        const disappear=hidden||(ref===windows&&selectedIndex===p.floor.index);
        scale.setScalar(disappear?0:1);parent.compose(pos,q,scale);matrix.multiplyMatrices(parent,p.matrix);mesh.setMatrixAt(i,matrix);
        color.setScalar(dimmed?.12:1);mesh.setColorAt(i,color);
      });
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    });
    }
    if(glow.current)glow.current.emissiveIntensity=THREE.MathUtils.damp(glow.current.emissiveIntensity,SUN[time].night*1.7,3,dt);
    if(windows.current)windows.current.visible=(glow.current?.emissiveIntensity??0)>.01;
  });
  const crownFloor=building.floors.find(f=>f.zone==="crown");
  return <group>
    <instancedMesh ref={windows} args={[undefined,undefined,data.panels.length]} frustumCulled={false} raycast={()=>null}><boxGeometry/><meshStandardMaterial ref={glow} alphaHash color="#272523" emissive="#FFE2B0" emissiveIntensity={0} roughness={.8}/></instancedMesh>
    <instancedMesh ref={roof} args={[undefined,undefined,data.solids.length]} frustumCulled={false} raycast={()=>null}><boxGeometry/><meshStandardMaterial color="#8A8071" roughness={.72} metalness={.25}/></instancedMesh>
    <instancedMesh ref={plants} args={[undefined,undefined,data.shrubs.length]} frustumCulled={false} raycast={()=>null}><icosahedronGeometry args={[1,1]}/><meshStandardMaterial color="#35412C" roughness={.9}/></instancedMesh>

    {crownFloor&&<CrownBlade floor={crownFloor} explosion={explosion} selectedIndex={selectedIndex} hidden={hidden}/>}
    <AuraSign floor={building.floors[0]} explosion={explosion} dimmed={selectedIndex!==null&&selectedIndex!==0} hidden={hidden}/>
  </group>;
}
function CrownBlade({floor,explosion,selectedIndex,hidden}:{floor:FloorData;explosion:number;selectedIndex:number|null;hidden:boolean}) {
  const group=useRef<THREE.Group>(null);
  const material=useRef<THREE.MeshStandardMaterial>(null);
  const dimmed=selectedIndex!==null&&selectedIndex!==floor.index;
  useFrame((_,dt)=>{
    if(group.current)group.current.position.y=THREE.MathUtils.damp(group.current.position.y,explodedY(floor,explosion),7,dt);
    if(material.current)material.current.opacity=THREE.MathUtils.damp(material.current.opacity,dimmed?.15:1,7,dt);
  });
  return <group ref={group} position-y={floor.baseY} rotation-y={floor.rotationY} visible={!hidden}>
    <mesh position={[0,floor.height+4,0]} castShadow>
      <cylinderGeometry args={[.035,.36,8,3,1]}/>
      <meshStandardMaterial ref={material} color="#B8924B" metalness={.85} roughness={.24} emissive="#6f4b18" emissiveIntensity={.35} transparent={dimmed} opacity={dimmed?.15:1}/>
    </mesh>
    <mesh position={[0,floor.height+4,.31]}>
      <boxGeometry args={[.035,7.2,.02]}/>
      <meshBasicMaterial color="#FFE2B0" toneMapped={false} transparent opacity={dimmed?.15:1}/>
    </mesh>
  </group>;
}
function AuraSign({floor,explosion,dimmed,hidden}:{floor:FloorData;explosion:number;dimmed:boolean;hidden:boolean}) {
  const group=useRef<THREE.Group>(null);
  const map=useMemo(()=>{const c=document.createElement("canvas");c.width=512;c.height=128;const ctx=c.getContext("2d")!;ctx.fillStyle="#D6B87C";ctx.font="64px Georgia";ctx.textAlign="center";ctx.fillText("A U R A",256,88);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;},[]);
  useEffect(()=>()=>map.dispose(),[map]);
  useFrame((_,dt)=>{if(group.current)group.current.position.y=THREE.MathUtils.damp(group.current.position.y,explodedY(floor,explosion),7,dt);});
  return <group ref={group} rotation-y={floor.rotationY} visible={!hidden}><mesh position={[0,floor.height*.7,floor.depth*.5+.69]} raycast={()=>null}><planeGeometry args={[2,.5]}/><meshBasicMaterial map={map} transparent opacity={dimmed?.15:1} depthWrite={false} toneMapped={false}/></mesh></group>;
}
