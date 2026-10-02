"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ContactShadows, MeshReflectorMaterial } from "@react-three/drei";
import { SITE_ROTATION_Y, uwToXZ, pointInRect } from "@/lib/siteLayout";
import type { SiteEdits } from "../SiteContext";
import { ALONG_U, placeUW, rng, uploadInstances, noRaycast } from "../context/shared";
import { waterNormalTexture } from "../textures";
import { SUN, useCinematic } from "./settings";
import City from "./City";

function Batch({matrices,color,emissive=false,round=false}:{matrices:THREE.Matrix4[];color:string;emissive?:boolean;round?:boolean}) {
  const mat=useRef<THREE.MeshStandardMaterial>(null);const {time}=useCinematic();
  useFrame((_,dt)=>{if(mat.current&&emissive)mat.current.emissiveIntensity=THREE.MathUtils.damp(mat.current.emissiveIntensity,SUN[time].night*2,3,dt);});
  return <instancedMesh ref={m=>uploadInstances(m,matrices)} args={[undefined,undefined,matrices.length]} raycast={noRaycast} receiveShadow>
    {round?<icosahedronGeometry args={[1,1]}/>:<boxGeometry/>}
    <meshStandardMaterial ref={mat} color={color} roughness={0.85} emissive={emissive?color:undefined} emissiveIntensity={0}/>
  </instancedMesh>;
}
function Landscape({edits}:{edits:SiteEdits}) {
  const canopy=useRef<THREE.InstancedMesh>(null);
  const data=useMemo(()=>{
    const random=rng(781);const trunks:THREE.Matrix4[]=[],leaves:THREE.Matrix4[]=[],lamps:THREE.Matrix4[]=[],bulbs:THREE.Matrix4[]=[],marks:THREE.Matrix4[]=[],paving:THREE.Matrix4[]=[];
    for(let i=0;i<54;i++){
      const u=-160+(i%27)*12,w=i<27?30:15;
      if(edits.clearings.some(c=>pointInRect(u,w,c)))continue;
      const h=1.8+random()*.6;
      trunks.push(placeUW(u,w,h*.48,ALONG_U,new THREE.Vector3(.14,h,.14)));
      leaves.push(placeUW(u,w,h+0.45,ALONG_U,new THREE.Vector3(i%2?.9:.65,i%2?.85:1.2,.8)));
    }
    for(let i=0;i<24;i++){const u=-170+i*15;lamps.push(placeUW(u,28.5,1.5,ALONG_U,new THREE.Vector3(.065,3,.065)));bulbs.push(placeUW(u,28.5,3,ALONG_U,new THREE.Vector3(.5,.08,.18)));}
    for(let i=0;i<90;i++)marks.push(placeUW(-178+i*4,23,.012,ALONG_U,new THREE.Vector3(1.8,.015,.045)));
    for(const w of [18,28,31])paving.push(placeUW(0,w,.025,ALONG_U,new THREE.Vector3(400,.07,w===31?2:1.8)));
    edits.pads.forEach(p=>paving.push(placeUW((p.u0+p.u1)/2,(p.w0+p.w1)/2,.025,ALONG_U,new THREE.Vector3(p.u1-p.u0,.07,p.w1-p.w0))));
    return {trunks,leaves,lamps,bulbs,marks,paving};
  },[edits]);
  const mat=useMemo(()=>new THREE.Matrix4(),[]),rotation=useMemo(()=>new THREE.Matrix4(),[]);
  useFrame(({clock})=>{const mesh=canopy.current;if(!mesh)return;data.leaves.forEach((m,i)=>{rotation.makeRotationZ(Math.sin(clock.elapsedTime*.55+i)*.018);mat.copy(m).multiply(rotation);mesh.setMatrixAt(i,mat);});mesh.instanceMatrix.needsUpdate=true;});
  return <>
    <mesh rotation-x={-Math.PI/2} position-y={-.05} receiveShadow raycast={noRaycast}><planeGeometry args={[1600,1600]}/><meshStandardMaterial color="#232830" roughness={.95}/></mesh>
    <group rotation-y={SITE_ROTATION_Y}><mesh position={[0,-.005,23]} receiveShadow raycast={noRaycast}><boxGeometry args={[420,.02,8]}/><meshStandardMaterial color="#121720" roughness={.96}/></mesh></group>
    <Batch matrices={data.paving} color="#514E49"/><Batch matrices={data.marks} color="#6D6B63"/>
    <Batch matrices={data.trunks} color="#343025"/>
    <instancedMesh ref={m=>{canopy.current=m;uploadInstances(m,data.leaves);}} args={[undefined,undefined,data.leaves.length]} raycast={noRaycast}><icosahedronGeometry args={[1,1]}/><meshStandardMaterial color="#353e2c" roughness={.92}/></instancedMesh>
    <Batch matrices={data.lamps} color="#34363A"/><Batch matrices={data.bulbs} color="#FFE2B0" emissive/>
  </>;
}
function Bay() {
  const {tier}=useCinematic();
  const normal=useMemo(()=>{const t=waterNormalTexture().clone();t.repeat.set(120,80);t.needsUpdate=true;return t;},[]);
  useEffect(()=>()=>normal.dispose(),[normal]);
  useFrame((_,dt)=>{normal.offset.x+=dt*.008;normal.offset.y+=dt*.003;});
  const [x,z]=uwToXZ(0,270);
  return <mesh position={[x,.01,z]} rotation={[-Math.PI/2,0,SITE_ROTATION_Y]} raycast={noRaycast}>
    <planeGeometry args={[1500,476]}/>
    {tier==="high"?<MeshReflectorMaterial resolution={512} mirror={.75} blur={[400,100]} mixBlur={.8} mixStrength={1.5} color="#0E141C" roughness={.24} metalness={.3} normalMap={normal} normalScale={new THREE.Vector2(.045,.045)}/>:<meshStandardMaterial color="#0E141C" roughness={.22} metalness={.65} envMapIntensity={1.3} normalMap={normal} normalScale={new THREE.Vector2(.045,.045)}/>}
  </mesh>;
}
function Traffic() {
  const body=useRef<THREE.InstancedMesh>(null),front=useRef<THREE.InstancedMesh>(null),back=useRef<THREE.InstancedMesh>(null);
  const fm=useRef<THREE.MeshStandardMaterial>(null),bm=useRef<THREE.MeshStandardMaterial>(null);
  const {time}=useCinematic();
  const matrix=useMemo(()=>new THREE.Matrix4(),[]);
  useFrame(({clock},dt)=>{
    for(let i=0;i<12;i++){
      const dir=i%2?1:-1,u=((i*31+clock.elapsedTime*2.1*dir+3600)%360)-180,w=i%2?21:25;
      body.current?.setMatrixAt(i,placeUW(u,w,.24,ALONG_U,new THREE.Vector3(1.25,.38,.58),matrix));
      front.current?.setMatrixAt(i,placeUW(u+dir*.63,w,.27,ALONG_U,new THREE.Vector3(.025,.1,.44),matrix));
      back.current?.setMatrixAt(i,placeUW(u-dir*.63,w,.27,ALONG_U,new THREE.Vector3(.025,.09,.44),matrix));
    }
    [body,front,back].forEach(r=>{if(r.current)r.current.instanceMatrix.needsUpdate=true;});
    [fm,bm].forEach(r=>{if(r.current)r.current.emissiveIntensity=THREE.MathUtils.damp(r.current.emissiveIntensity,SUN[time].night*3,3,dt);});
  });
  return <>{[body,front,back].map((r,i)=><instancedMesh key={i} ref={r} args={[undefined,undefined,12]} frustumCulled={false} raycast={noRaycast}><boxGeometry/><meshStandardMaterial ref={i===1?fm:i===2?bm:undefined} color={i===0?"#41444C":i===1?"#FFE2B0":"#CD4C3C"} emissive={i===1?"#FFE2B0":i===2?"#CD4C3C":"#000000"} emissiveIntensity={0} roughness={.45}/></instancedMesh>)}</>;
}
function Clouds() {
  const {time}=useCinematic();const group=useRef<THREE.Group>(null);
  const texture=useMemo(()=>{const c=document.createElement("canvas");c.width=128;c.height=64;const ctx=c.getContext("2d")!;const g=ctx.createRadialGradient(64,32,2,64,32,55);g.addColorStop(0,"rgba(175,184,196,.3)");g.addColorStop(1,"rgba(175,184,196,0)");ctx.fillStyle=g;ctx.fillRect(0,0,128,64);return new THREE.CanvasTexture(c);},[]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  useFrame(({clock})=>{if(group.current)group.current.position.x=Math.sin(clock.elapsedTime*.007)*18;});
  return <group ref={group} visible={time==="dawn"||time==="golden"}>{[-130,0,160].map((x,i)=><sprite key={x} position={[x,100+i*12,-290]} scale={[150,30,1]} raycast={noRaycast}><spriteMaterial map={texture} transparent opacity={.3} depthWrite={false}/></sprite>)}</group>;
}
export default function CinematicSite({edits,seed}:{edits:SiteEdits;seed:number}) {
  const {tier}=useCinematic();
  return <group><Landscape edits={edits}/><City clearings={edits.clearings} seed={seed}/><Bay/><Traffic/><Clouds/>{tier!=="low"&&<ContactShadows position={[0,.002,0]} opacity={.3} scale={150} blur={2.5} far={12} resolution={256} frames={1} color="#090b10"/>}</group>;
}
