"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { geographicToWorld, type MapSnapshot, type ProjectLocation } from "@/lib/geographicContext";
import { MODEL_SCALE as M, pointInPolygon } from "@/lib/tower";
import type { Building } from "@/types";
import type { CityPreset } from "@/lib/cityPresets";
import { SUN, useCinematic } from "../environment/settings";
import People from "./People";
import { invalidateShadows } from "../staticShadows";
import { noRaycast, rng } from "./shared";

function merged(parts: THREE.BufferGeometry[]) {
  if (!parts.length) return null;
  const result = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  result?.computeBoundingSphere();
  return result;
}
function strip(a: [number,number], b: [number,number], width: number, y: number) {
  const dx = b[0]-a[0], dz = b[1]-a[1], length = Math.hypot(dx,dz);
  return new THREE.BoxGeometry(length,.02,width).rotateY(-Math.atan2(dz,dx)).translate((a[0]+b[0])/2,y,(a[1]+b[1])/2);
}
function Instances({ matrices, color, kind, night = 0 }: { matrices: THREE.Matrix4[]; color: string; kind: "box"|"leaves"; night?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    matrices.forEach((m,i) => mesh.setMatrixAt(i,m)); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    invalidateShadows();
  }, [matrices]);
  if (!matrices.length) return null;
  return <instancedMesh ref={ref} args={[undefined,undefined,matrices.length]} castShadow receiveShadow raycast={noRaycast}>
    {kind === "leaves" ? <icosahedronGeometry args={[1,2]}/> : <boxGeometry/>}
    <meshStandardMaterial color={color} roughness={kind === "leaves" ? .94 : .63} emissive={night ? "#ffda9e" : "#000000"} emissiveIntensity={night}/>
  </instancedMesh>;
}
/** Streets follow mapped centrelines; street dressing and vegetation are illustrative. */
export default function MappedSiteDetails({ snapshot, location, buildings, preset }: { snapshot: MapSnapshot | null; location: ProjectLocation; buildings: Building[]; preset: CityPreset }) {
  const { time, tier } = useCinematic();
  const data = useMemo(() => {
    const roads: THREE.BufferGeometry[] = [], paving: THREE.BufferGeometry[] = [], markings: THREE.BufferGeometry[] = [];
    const trunks: THREE.Matrix4[] = [], leaves: THREE.Matrix4[] = [], poles: THREE.Matrix4[] = [], lights: THREE.Matrix4[] = [], people: [number,number][] = [];
    const random = rng(32017), matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), vector = new THREE.Vector3();
    const instance = (x:number,y:number,z:number,sx:number,sy:number,sz:number) => matrix.compose(vector.set(x,y,z),quaternion,new THREE.Vector3(sx,sy,sz)).clone();
    const blocked = (x:number,z:number,pad=0) => buildings.some(b => b.floors.some(f => Math.hypot(x-b.position[0],z-b.position[1]) < Math.hypot(f.width,f.depth)/2+pad));
    let roadSegments = 0;
    for (const feature of snapshot?.features ?? []) {
      if (feature.kind === "road" && roadSegments < 1800) {
        const lines = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiLineString" ? feature.geometry.coordinates : [];
        for (const line of lines) for (let i=1;i<line.length;i++) {
          const a=geographicToWorld(line[i-1],location),b=geographicToWorld(line[i],location);
          const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
          if (length < .05 || Math.min(Math.hypot(...a),Math.hypot(...b)) > 160 || blocked((a[0]+b[0])/2,(a[1]+b[1])/2,1)) continue;
          roadSegments++;
          // Widths are visual defaults; the source snapshot records street centrelines only.
          roads.push(strip(a,b,5.8*M,.052)); paving.push(strip(a,b,8.8*M,.024));
          if (length > 4) for(let t=2;t<length;t+=4) {
            const p:[number,number]=[a[0]+dx*t/length,a[1]+dz*t/length];
            markings.push(strip(p,[p[0]+dx/length*1.4,p[1]+dz/length*1.4],.10*M,.068));
          }
          if (length > 5 && Math.hypot(...a)<75 && poles.length<70) {
            const x=(a[0]+b[0])/2-dz/length*3.7*M,z=(a[1]+b[1])/2+dx/length*3.7*M;
            if (!blocked(x,z,.3)) { poles.push(instance(x,2.6*M,z,.09*M,5.2*M,.09*M)); lights.push(instance(x,5.2*M,z,.65*M,.12*M,.28*M)); }
            if (people.length<44 && !blocked(x,z,1)) people.push([x+dx/length*.6,z+dz/length*.6]);
          }
        }
      }
      if (feature.kind === "park" && trunks.length<65) {
        const polys=feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
        for (const poly of polys) {
          const rings=poly.map(r=>r.map(p=>geographicToWorld(p,location))),ring=rings[0];
          const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),minX=Math.min(...xs),minZ=Math.min(...zs),w=Math.max(...xs)-minX,d=Math.max(...zs)-minZ;
          if (Math.hypot(minX,minZ)>200)continue;
          for(let attempt=0;attempt<80 && trunks.length<65;attempt++) {
            const x=minX+random()*w,z=minZ+random()*d;
            if (!pointInPolygon(ring,x,z) || rings.slice(1).some(h=>pointInPolygon(h,x,z)) || blocked(x,z,1.5))continue;
            const h=(4+random()*3)*M;
            trunks.push(instance(x,h*.38,z,.22*M,h*.76,.22*M));
            for(let j=0;j<7;j++)leaves.push(instance(x+(random()-.5)*h*.65,h*.8+(random()-.5)*h*.42,z+(random()-.5)*h*.65,h*.28,h*.25,h*.28));
            if (attempt>12)break;
          }
        }
      }
    }
    return { roads: merged(roads), paving: merged(paving), markings: merged(markings), trunks, leaves, poles, lights, people };
  }, [snapshot,location.latitude,location.longitude,buildings]);
  useEffect(() => { invalidateShadows(); return () => { data.roads?.dispose(); data.paving?.dispose(); data.markings?.dispose(); }; }, [data]);
  const lamp = useRef<THREE.PointLight>(null);
  useFrame((_,dt)=>{ if(lamp.current)lamp.current.intensity=THREE.MathUtils.damp(lamp.current.intensity,SUN[time].night*2,2,dt); });
  if (!snapshot) return null;
  return <group name="mapped-street-dressing">
    {data.roads && <mesh geometry={data.roads} receiveShadow raycast={noRaycast} dispose={null}><meshStandardMaterial color="#34383a" roughness={.91}/></mesh>}
    {data.paving && <mesh geometry={data.paving} receiveShadow raycast={noRaycast} dispose={null}><meshStandardMaterial color="#a29f96" roughness={.85}/></mesh>}
    {data.markings && <mesh geometry={data.markings} raycast={noRaycast} dispose={null}><meshStandardMaterial color="#c6bea2" roughness={.9}/></mesh>}
    <Instances matrices={data.trunks} color="#62503d" kind="box"/><Instances matrices={data.leaves} color="#3d5034" kind="leaves"/>
    <Instances matrices={data.poles} color="#393d3d" kind="box"/><Instances matrices={data.lights} color="#e9dfbc" kind="box" night={SUN[time].night*2}/>
    {tier !== "low" && <People preset={preset} anchors={data.people}/>}
  </group>;
}
