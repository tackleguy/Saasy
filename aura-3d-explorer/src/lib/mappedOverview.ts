import { geographicToWorld, type MapSnapshot, type ProjectLocation } from "./geographicContext";
import { buildingHeight, MODEL_SCALE, planOutline, pointInPolygon, type PlanPoint } from "./tower";
import type { Building } from "@/types";

type Vec3 = [number, number, number];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Obstacle = Bounds & { bottom: number; top: number };
const boundsOf = (ring: PlanPoint[]): Bounds => ring.reduce((b, [x,z]) => ({ minX: Math.min(b.minX,x),maxX: Math.max(b.maxX,x),minZ: Math.min(b.minZ,z),maxZ: Math.max(b.maxZ,z) }),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
const overlaps = (a: Bounds,b: Bounds) => a.minX<=b.maxX && a.maxX>=b.minX && a.minZ<=b.maxZ && a.maxZ>=b.minZ;
function convexHull(points: PlanPoint[]): PlanPoint[] {
  const cross=(a:PlanPoint,b:PlanPoint,c:PlanPoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const lower:PlanPoint[]=[],upper:PlanPoint[]=[];
  for(const point of sorted) { while(lower.length>=2&&cross(lower.at(-2)!,lower.at(-1)!,point)<=0)lower.pop();lower.push(point); }
  for(let i=sorted.length-1;i>=0;i--) { const point=sorted[i];while(upper.length>=2&&cross(upper.at(-2)!,upper.at(-1)!,point)<=0)upper.pop();upper.push(point); }
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
/** Every sightline lies inside the convex hull of its two endpoints. Reject
 * boxes entirely beyond any hull edge before the repeated 3D ray tests. */
function outsideHull(box:Bounds,hull:PlanPoint[]) {
  for(let i=0;i<hull.length;i++) {
    const a=hull[i],b=hull[(i+1)%hull.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const x=dz<=0?box.maxX:box.minX,z=dx>=0?box.maxZ:box.minZ;
    if(dx*(z-a[1])-dz*(x-a[0]) < -1e-7)return true;
  }
  return false;
}
function edgesIntersect(a: PlanPoint,b: PlanPoint,c: PlanPoint,d: PlanPoint) {
  const cross=(p:PlanPoint,q:PlanPoint,r:PlanPoint)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const on=(p:PlanPoint,q:PlanPoint,r:PlanPoint)=>Math.abs(cross(p,q,r))<1e-8 && r[0]>=Math.min(p[0],q[0])-1e-8 && r[0]<=Math.max(p[0],q[0])+1e-8 && r[1]>=Math.min(p[1],q[1])-1e-8 && r[1]<=Math.max(p[1],q[1])+1e-8;
  return (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) || on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
function intersectsProposal(rings:PlanPoint[][],ring:PlanPoint[]) {
  for(const boundary of rings) for(let i=0;i<boundary.length;i++) for(let j=0;j<ring.length;j++) if(edgesIntersect(boundary[i],boundary[(i+1)%boundary.length],ring[j],ring[(j+1)%ring.length]))return true;
  return ring.some(([x,z])=>pointInPolygon(rings[0],x,z)&&!rings.slice(1).some(hole=>pointInPolygon(hole,x,z))) || rings[0].some(([x,z])=>pointInPolygon(ring,x,z));
}
/** Slab intersection of a finite sightline with a conservative building box. */
function blocked(from:Vec3,to:Vec3,box:Obstacle) {
  let low=0,high=.9999;
  for(let axis=0;axis<3;axis++) {
    const minimum=axis===0?box.minX:axis===1?box.bottom:box.minZ,maximum=axis===0?box.maxX:axis===1?box.top:box.maxZ;
    const delta=to[axis]-from[axis];
    if(Math.abs(delta)<1e-9) { if(from[axis]<minimum||from[axis]>maximum)return false; continue; }
    const a=(minimum-from[axis])/delta,b=(maximum-from[axis])/delta;
    low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));
    if(low>high)return false;
  }
  return true;
}

/** Select an unobstructed introductory view without changing source geometry.
 * Scoring uses 36 poses plus 12 podium fallback poses, twelve sightlines per
 * proposal and source-height boxes.
 * Box silhouettes are deliberately conservative; all source polygons, holes
 * and actual proposal floor outlines are used when excluding cleared context. */
export function chooseMappedOverviewDirection({ snapshot, location, buildings, target, distance, preferredDirection=[1,.25,1] }: {
  snapshot: MapSnapshot|null; location: ProjectLocation; buildings: Building[];
  target: Vec3; distance: number; preferredDirection?: Vec3;
}): Vec3 {
  if(!snapshot || !buildings.length || !Number.isFinite(distance) || distance<=0)return [...preferredDirection];
  const proposals=buildings.flatMap(building=>{
    const seen=new Set<string>();
    return building.floors.flatMap(floor=>{
      const key=JSON.stringify([floor.width,floor.depth,floor.rotationY,floor.shape]);
      if(seen.has(key))return [];seen.add(key);
      const c=Math.cos(floor.rotationY),s=Math.sin(floor.rotationY);
      const ring=planOutline(floor.shape,floor.width,floor.depth).map(([x,z]):PlanPoint=>[building.position[0]+x*c+z*s,building.position[1]-x*s+z*c]);
      return [{ring,bounds:boundsOf(ring),building}];
    });
  });
  if(!proposals.length)return [...preferredDirection];
  const canonical=Math.atan2(preferredDirection[2],preferredDirection[0]),horizontal=Math.hypot(preferredDirection[0],preferredDirection[2])||Math.SQRT2;
  const obstacles:Obstacle[]=[];
  const viewBounds={minX:Math.min(target[0]-distance,...proposals.map(p=>p.bounds.minX)),maxX:Math.max(target[0]+distance,...proposals.map(p=>p.bounds.maxX)),minZ:Math.min(target[2]-distance,...proposals.map(p=>p.bounds.minZ)),maxZ:Math.max(target[2]+distance,...proposals.map(p=>p.bounds.maxZ))};
  const proposalBounds={minX:Math.min(...proposals.map(p=>p.bounds.minX)),maxX:Math.max(...proposals.map(p=>p.bounds.maxX)),minZ:Math.min(...proposals.map(p=>p.bounds.minZ)),maxZ:Math.max(...proposals.map(p=>p.bounds.maxZ))};
  const hull=convexHull([...Array.from({length:12},(_,index):PlanPoint=>[target[0]+Math.cos(canonical+index*Math.PI/6)*distance,target[2]+Math.sin(canonical+index*Math.PI/6)*distance]),[proposalBounds.minX,proposalBounds.minZ],[proposalBounds.minX,proposalBounds.maxZ],[proposalBounds.maxX,proposalBounds.minZ],[proposalBounds.maxX,proposalBounds.maxZ]]);
  for(const feature of snapshot.features) {
    if(feature.kind!=="building" || feature.heightSource==="unknown" || !Number.isFinite(feature.height) || feature.height!<=Math.max(0,feature.minHeight??0))continue;
    const polygons=feature.geometry.type==="Polygon"?[feature.geometry.coordinates]:feature.geometry.type==="MultiPolygon"?feature.geometry.coordinates:[];
    for(const polygon of polygons) {
      if(!polygon[0]?.length)continue;
      // The local geographic projection is axis-aligned and linear. Bounds
      // need only two projected corners, not a projection of every vertex.
      let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
      for(const [longitude,latitude] of polygon[0]) { west=Math.min(west,longitude);east=Math.max(east,longitude);south=Math.min(south,latitude);north=Math.max(north,latitude); }
      let bounds:Bounds;
      if(east-west>180) bounds=boundsOf(polygon[0].map(point=>geographicToWorld(point,location)));
      else {
        const a=geographicToWorld([west,north],location),b=geographicToWorld([east,south],location);
        bounds={minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minZ:Math.min(a[1],b[1]),maxZ:Math.max(a[1],b[1])};
      }
      if(!overlaps(bounds,viewBounds)||outsideHull(bounds,hull))continue;
      const nearbyProposals=proposals.filter(proposal=>overlaps(bounds,proposal.bounds));
      if(nearbyProposals.length) {
        const rings=polygon.map(ring=>ring.slice(0,-1).map(point=>geographicToWorld(point,location)));
        if(nearbyProposals.some(proposal=>intersectsProposal(rings,proposal.ring)))continue;
      }
      obstacles.push({...bounds,bottom:Math.max(0,feature.minHeight??0)*MODEL_SCALE,top:feature.height!*MODEL_SCALE});
    }
  }
  if(!obstacles.length)return [...preferredDirection];
  const companions=buildings.filter(building=>building.floors.length).map(building=>{
    const outlines=proposals.filter(proposal=>proposal.building===building);
    return {building,box:{minX:Math.min(...outlines.map(p=>p.bounds.minX)),maxX:Math.max(...outlines.map(p=>p.bounds.maxX)),minZ:Math.min(...outlines.map(p=>p.bounds.minZ)),maxZ:Math.max(...outlines.map(p=>p.bounds.maxZ)),bottom:0,top:buildingHeight(building,0)}};
  });
  const samples=buildings.filter(building=>building.floors.length).flatMap(building=>{
    const height=buildingHeight(building,0);
    return [.06,.2,.52,.9].flatMap(fraction=>{
      const floor=building.floors[Math.min(building.floors.length-1,Math.floor(fraction*building.floors.length))];
      return [-.25,0,.25].map(offset=>({ point:[building.position[0]+floor.width*offset,height*fraction,building.position[1]+floor.depth*offset] as Vec3,weight:fraction===.52?1.4:1,building,podium:fraction===.06 }));
    });
  });
  if(!samples.length)return [...preferredDirection];
  const total=samples.reduce((sum,sample)=>sum+sample.weight,0);
  const score=(direction:Vec3)=>{
    const length=Math.hypot(...direction);
    const camera=direction.map((value,index)=>target[index]+value/length*distance) as Vec3;
    let weighted=0,podium=0;
    for(const sample of samples) {
      const contextBlocked=obstacles.some(box=>blocked(camera,sample.point,box));
      // Companions are intentional architecture, so their overlap is penalised
      // less than context occlusion but still breaks otherwise similar views.
      const companionBlocked=!contextBlocked && companions.some(other=>other.building!==sample.building && blocked(camera,sample.point,other.box));
      const penalty=contextBlocked?1:companionBlocked?.4:0;
      weighted+=sample.weight*penalty;
      if(sample.podium)podium+=penalty;
    }
    return {total:weighted/total,podium};
  };
  let result:Vec3=[...preferredDirection],bestScore=score(result),best=bestScore.total;
  // Preserve the established view unless at least one useful sightline improves.
  if(best===0)return result;
  for(const inclination of [.25,.5,.8]) for(let azimuth=0;azimuth<12;azimuth++) {
    const angle=canonical+azimuth*Math.PI/6;
    const direction:Vec3=[Math.cos(angle)*horizontal,inclination,Math.sin(angle)*horizontal];
    const deviation=Math.min(azimuth,12-azimuth)/6;
    const measured=score(direction),candidate=measured.total+Math.max(0,inclination-.25)*.035+deviation*.012;
    if(candidate<best-.005) { best=candidate;bestScore=measured;result=direction; }
  }
  // A higher fallback is justified only by a real podium visibility gain.
  if(bestScore.podium>0) for(let azimuth=0;azimuth<12;azimuth++) {
    const angle=canonical+azimuth*Math.PI/6,direction:Vec3=[Math.cos(angle)*horizontal,1.2,Math.sin(angle)*horizontal];
    const measured=score(direction),candidate=measured.total+.95*.035+Math.min(azimuth,12-azimuth)/6*.012;
    if(measured.podium<bestScore.podium && candidate<best-.005) { best=candidate;bestScore=measured;result=direction; }
  }
  return result;
}
