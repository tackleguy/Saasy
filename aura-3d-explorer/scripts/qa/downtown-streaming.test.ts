import { test } from "node:test";
import assert from "node:assert/strict";
import { outerProposalSignature, abortUnwantedDowntownLoads, downtownRetryTarget } from "../../src/lib/downtownStreaming";
import { worldToGeographic, type ProjectLocation, type MapSnapshot } from "../../src/lib/geographicContext";
import { fetchDowntownTile, type DowntownTile } from "../../src/lib/downtownContext";
import type { Building } from "../../src/types";

const location:ProjectLocation={latitude:40.7,longitude:-74,label:"Test pin",example:true};
const southwest=worldToGeographic([-20,20],location),northeast=worldToGeographic([20,-20],location);
const nearBounds:MapSnapshot["bounds"]=[...southwest,...northeast];
const building=(id:string,x=0,z=0,width=4,depth=4):Building=>({id,position:[x,z],floors:[{index:0,baseY:0,height:3,width,depth,rotationY:0,shape:{kind:"rect"}}]}) as Building;

test("near-only proposal edits keep outer tiles while boundary crossings and outside edits rebuild them",()=>{
  assert.equal(outerProposalSignature(nearBounds,location,[building("a")]),"");
  assert.equal(outerProposalSignature(nearBounds,location,[building("a",8,8,10,8)]),"");
  const outside=building("a",19);
  const signature=outerProposalSignature(nearBounds,location,[outside]);
  assert.ok(signature.length>0,"the entire bounding circle must fit, not only the centre");
  assert.notEqual(outerProposalSignature(nearBounds,location,[building("a",21)]),signature);
  const changed=structuredClone(outside);changed.floors[0].shape={kind:"l-shape",amount:.5};
  assert.notEqual(outerProposalSignature(nearBounds,location,[changed]),signature);
  assert.equal(outerProposalSignature(nearBounds,location,[building("a")]),"");
});

test("outside proposal signatures remain stable under object copies and building array reordering",()=>{
  const buildings=[building("b",30),building("a")];
  const signature=outerProposalSignature(nearBounds,location,buildings);
  assert.equal(outerProposalSignature(nearBounds,location,structuredClone(buildings)),signature);
  assert.equal(outerProposalSignature(nearBounds,location,[...buildings].reverse()),signature);
  const changed=structuredClone(buildings);changed[1].floors[0].rotationY=.2;
  assert.notEqual(outerProposalSignature(nearBounds,location,changed),signature,"all proposals participate while an outside proposal is present");
});

test("obsolete loading jobs abort without cancelling visible jobs or releasing concurrency slots early",()=>{
  const records=["obsolete","visible","ready"].map((id,index)=>({tile:{id},state:index===2?"ready":"loading",controller:new AbortController()}));
  assert.equal(abortUnwantedDowntownLoads(records,new Set(["visible"])),1);
  assert.equal(records[0].controller.signal.aborted,true);
  assert.equal(records[0].state,"loading","the async job owns its slot until finally runs");
  assert.equal(records[1].controller.signal.aborted,false);
  assert.equal(records[2].controller.signal.aborted,false);
  assert.equal(abortUnwantedDowntownLoads(records,new Set(["visible"])),0);
});

test("cancelling two invisible stalled requests frees both promises for the current view",async()=>{
  const tile:DowntownTile={id:"test-city-downtown-0-0",url:"/maps/downtown/test-city/tiles/0-0.json",bounds:[-75,40,-73,41],features:0,vertices:0};
  const records=[0,1].map(index=>({tile:{...tile,id:`test-city-downtown-${index}-0`,url:`/maps/downtown/test-city/tiles/${index}-0.json`},state:"loading",controller:new AbortController()}));
  const pending=records.map(record=>fetchDowntownTile(record.tile,{signal:record.controller.signal,request:async()=>new Promise(()=>{})}));
  assert.equal(abortUnwantedDowntownLoads(records,new Set(["newly-visible"])),2);
  const settled=await Promise.allSettled(pending);
  assert.ok(settled.every(result=>result.status==="rejected"&&result.reason.name==="AbortError"));
});

test("retry follows the requested city's failed manifest before retrying its tiles",()=>{
  assert.equal(downtownRetryTarget("a",null,null),"manifest");
  assert.equal(downtownRetryTarget("a",{id:"a"},null),"tiles");
  assert.equal(downtownRetryTarget("b",{id:"a"},null),"manifest");
  assert.equal(downtownRetryTarget("a",{id:"a"},{id:"a"}),"manifest","A→B→A refresh failure must retry A's manifest");
  assert.equal(downtownRetryTarget("a",{id:"a"},{id:"b"}),"tiles","another city's stale failure cannot redirect this retry");
  assert.equal(downtownRetryTarget(undefined,{id:"a"},{id:"a"}),"none");
});
