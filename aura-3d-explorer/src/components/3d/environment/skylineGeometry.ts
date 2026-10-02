import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityPreset } from "@/lib/cityPresets";
import { rectsOverlap, type UWRect } from "@/lib/siteLayout";
import { cityPlan } from "../context/cityPlan";
import type { FacadeKind } from "../textures";

export type SkylineFinish = FacadeKind | "roof";
export interface SkylineBatch { finish: SkylineFinish; geometry: THREE.BufferGeometry }

/** Fixed-size facade bays, independent of building size. Roofs have a separate finish.
 * Static geometry is merged by material, so the entire district needs at most six draws.
 * Coordinates remain in the site's u/w frame until the parent group rotates them. */
export function buildSkyline(preset: CityPreset, clearings: UWRect[] = [], low = false): SkylineBatch[] {
  const plan = cityPlan(preset);
  const buckets = new Map<SkylineFinish, THREE.BufferGeometry[]>();
  const blocked = (u: number, w: number, su: number, sw: number) => clearings.some(c => rectsOverlap(c, {u0:u-su/2,u1:u+su/2,w0:w-sw/2,w1:w+sw/2}));
  // If an edit touches any tier, remove its entire lot, including roof details.
  const removed = plan.buildings.filter(b => blocked(b.u,b.w,b.su,b.sw));
  const excluded = (u:number,w:number,su:number,sw:number) => blocked(u,w,su,sw) || removed.some(b => Math.abs(u-b.u)<(su+b.su)/2 && Math.abs(w-b.w)<(sw+b.sw)/2);
  const add = (source: THREE.BufferGeometry, finish: SkylineFinish, tint: string) => {
    const geo = source.index ? source.toNonIndexed() : source;
    if (geo !== source) source.dispose();
    const p=geo.getAttribute("position"), n=geo.getAttribute("normal");
    const sides:number[]=[], caps:number[]=[];
    for(let i=0;i<p.count;i+=3) (Math.abs(n.getY(i))>.8?caps:sides).push(i,i+1,i+2);
    for (const [indices,roof] of [[sides,false],[caps,true]] as const) {
      if (!indices.length) continue;
      const positions:number[]=[], normals:number[]=[], uv:number[]=[], colors:number[]=[];
      const c = new THREE.Color(roof ? "#8b8c87" : tint);
      // Lift dark tint multipliers; the facade texture supplies the material's actual color.
      if (!roof) c.lerp(new THREE.Color("#ffffff"),.38);
      for (const i of indices) {
        positions.push(p.getX(i),p.getY(i),p.getZ(i));
        normals.push(n.getX(i),n.getY(i),n.getZ(i));
        uv.push((Math.abs(n.getX(i))>Math.abs(n.getZ(i))?p.getZ(i):p.getX(i))/1.25, p.getY(i)/.9);
        colors.push(c.r,c.g,c.b);
      }
      const part=new THREE.BufferGeometry();
      part.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
      part.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
      part.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
      part.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
      const key=roof?"roof":finish;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key)!.push(part);
    }
    geo.dispose();
  };
  for (const b of plan.buildings) {
    if (excluded(b.u,b.w,b.su,b.sw)) continue;
    const g=b.shape==="round" ? new THREE.CylinderGeometry(.5,.5,1,low?8:16).scale(b.su,b.h,b.sw) : new THREE.BoxGeometry(b.su,b.h,b.sw);
    add(g.translate(b.u,b.y+b.h/2,b.w),b.kind,b.tint);
  }
  // Low quality retains every building and crown; only tiny rooftop equipment is omitted.
  if (!low) for (const b of plan.roof) {
    if(!excluded(b.u,b.w,b.su,b.sw)) add(new THREE.BoxGeometry(b.su,b.h,b.sw).translate(b.u,b.y+b.h/2,b.w),"roof","#8b8c87");
  }
  for (const b of plan.spires) {
    if(!excluded(b.u,b.w,b.r*2,b.r*2))add(new THREE.CylinderGeometry(b.r*.2,b.r,b.h,6).translate(b.u,b.y+b.h/2,b.w),"roof","#a6aaa7");
  }
  return [...buckets].map(([finish,parts])=>{
    const geometry=mergeGeometries(parts,false)!;
    for(const p of parts)p.dispose();
    geometry.computeBoundingSphere();
    return {finish,geometry};
  });
}
