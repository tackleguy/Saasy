import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chooseMappedOverviewDirection } from "../../src/lib/mappedOverview";
import { worldToGeographic, type MapFeature, type MapSnapshot, type ProjectLocation } from "../../src/lib/geographicContext";
import { buildingHeight, type PlanPoint } from "../../src/lib/tower";
import { MAP_SITES } from "../../src/lib/mapLocations";
import { PROJECTS, projectSite } from "../../src/content/projects";
import type { Building } from "../../src/types";

const location:ProjectLocation={latitude:40.7,longitude:-74,label:"Test pin",example:true};
const ring=(points:PlanPoint[])=>[...points,points[0]].map(point=>worldToGeographic(point,location));
const rectangle=(x:number,z:number,w:number,d=w):PlanPoint[]=>[[x,z],[x+w,z],[x+w,z+d],[x,z+d]];
const obstacle=(id:string,x:number,z:number,w:number,height=100):MapFeature=>({id,kind:"building",height,heightSource:"recorded",geometry:{type:"Polygon",coordinates:[ring(rectangle(x,z,w))]}});
const snapshot=(features:MapFeature[]):MapSnapshot=>({id:"overview",label:"Overview fixture",capturedAt:"2026-10-02T00:00:00Z",bounds:[-74.1,40.6,-73.9,40.8],sourceUrl:"https://example.com",attribution:"Synthetic geometry",features});
const proposal={id:"proposal",position:[0,0],floors:[{baseY:0,index:0,height:15,width:4,depth:4,rotationY:0,shape:{kind:"rect"}}]} as Building;
const base={location,buildings:[proposal],target:[0,6,0] as [number,number,number],distance:60};

test("missing, unknown-height and below-sightline context keep the exact canonical view",()=>{
  assert.deepEqual(chooseMappedOverviewDirection({...base,snapshot:null}),[1,.25,1]);
  assert.deepEqual(chooseMappedOverviewDirection({...base,snapshot:snapshot([{...obstacle("unknown",12,12,14),heightSource:"unknown"}])}),[1,.25,1]);
  assert.deepEqual(chooseMappedOverviewDirection({...base,snapshot:snapshot([obstacle("low",12,12,14,1)])}),[1,.25,1]);
  assert.deepEqual(chooseMappedOverviewDirection({...base,snapshot:snapshot([{...obstacle("elevated",12,12,14,200),minHeight:150}])}),[1,.25,1]);
});

test("a dense foreground blocker causes a deterministic clearer azimuth without raising an already clear view",()=>{
  const input={...base,snapshot:snapshot([obstacle("foreground",10,10,20,200)])};
  const result=chooseMappedOverviewDirection(input);
  assert.notDeepEqual(result,[1,.25,1]);
  assert.equal(result[1],.25,"clear low angles are preferred over an unnecessary aerial view");
  assert.deepEqual(result,chooseMappedOverviewDirection(input));
  assert.ok(result.every(Number.isFinite));
});

test("source polygons removed beneath proposals do not steer the camera; courtyard envelopes remain obstacles",()=>{
  assert.deepEqual(chooseMappedOverviewDirection({...base,snapshot:snapshot([obstacle("overlap",-3,-3,6,400)])}),[1,.25,1]);
  const court=obstacle("courtyard",-30,-30,60,400);
  court.geometry={type:"Polygon",coordinates:[ring(rectangle(-30,-30,60)),ring(rectangle(-4,-4,8))]};
  // Courtyard walls remain present; the helper must not mistake the hole for a
  // proposal intersection and discard this envelope as the overlap case above.
  const before=JSON.stringify(court);
  const result=chooseMappedOverviewDirection({...base,snapshot:snapshot([court])});
  assert.ok(result.every(Number.isFinite));
  assert.equal(JSON.stringify(court),before);
});

test("similar context views favour separating proposal companions instead of hiding one behind another",()=>{
  const companion={...proposal,id:"companion",position:[8,8]} as Building;
  const result=chooseMappedOverviewDirection({...base,buildings:[proposal,companion],snapshot:snapshot([obstacle("low-context",-25,15,2,1)])});
  assert.notDeepEqual(result,[1,.25,1]);
  assert.equal(result[1],.25);
});

test("a higher fallback clears podiums hidden by a surrounding context ring",()=>{
  const walls=[rectangle(-6,-6,12,1),rectangle(-6,5,12,1),rectangle(-6,-5,1,10),rectangle(5,-5,1,10)].map((points,index):MapFeature=>({id:`podium-wall-${index}`,kind:"building",height:24,heightSource:"recorded",geometry:{type:"Polygon",coordinates:[ring(points)]}}));
  const result=chooseMappedOverviewDirection({...base,snapshot:snapshot(walls)});
  assert.equal(result[1],1.2,"the former .2-height samples missed this hidden podium");
});

test("remote boxes outside the camera and proposal convex envelope do not influence the chosen pose",()=>{
  const near=obstacle("foreground",10,10,20,200);
  const expected=chooseMappedOverviewDirection({...base,snapshot:snapshot([near])});
  const remote=Array.from({length:1000},(_,index)=>obstacle(`remote-${index}`,50+index%10,50+Math.floor(index/10),.5,800));
  assert.deepEqual(chooseMappedOverviewDirection({...base,snapshot:snapshot([near,...remote])}),expected);
});

test("all bundled snapshot camera choices finish within 100ms without mutating source data",()=>{
  const timings:{id:string;milliseconds:number}[]=[];
  for(const site of MAP_SITES) {
    const project=PROJECTS.find(project=>site.projects.includes(project.slug))??PROJECTS[0];
    const map=JSON.parse(readFileSync(new URL(`../../public/maps/${site.id}.json`,import.meta.url),"utf8")) as MapSnapshot;
    const buildings=projectSite(project),height=Math.max(...buildings.map(building=>buildingHeight(building,0)));
    const input={snapshot:map,location:site,buildings,target:[0,height*.42,0] as [number,number,number],distance:Math.max(height*1.8+40,96)};
    const before=JSON.stringify(map);
    const start=performance.now();const direction=chooseMappedOverviewDirection(input);const elapsed=performance.now()-start;
    timings.push({id:site.id,milliseconds:Math.round(elapsed*100)/100});
    assert.ok(elapsed<100,`${site.id}: ${elapsed.toFixed(1)}ms`);
    assert.ok(direction.every(Number.isFinite));
    assert.equal(JSON.stringify(map),before);
  }
  assert.equal(timings.length,14);
  console.log("Mapped overview snapshot timings",JSON.stringify(timings));
});
