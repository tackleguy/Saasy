import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { validateDowntownManifest, fetchDowntownManifest, fetchDowntownTile, MAX_DOWNTOWN_MANIFEST_BYTES, MAX_DOWNTOWN_TILE_BYTES, type DowntownManifest, type DowntownTile } from "../../src/lib/downtownContext";
import type { MapSnapshot } from "../../src/lib/geographicContext";

const bounds:MapSnapshot["bounds"]=[-74.1,40.6,-73.9,40.8];
const tile:DowntownTile={id:"test-city-downtown-0-0",url:"/maps/downtown/test-city/tiles/0-0.json",bounds,features:1,vertices:2};
const map:MapSnapshot={id:tile.id,label:"Test city",bounds,capturedAt:"2026-10-02T00:00:00Z",attribution:"Test attribution",sourceUrl:"https://example.com/source",features:[{id:"road",kind:"road",geometry:{type:"LineString",coordinates:[[-74,40.7],[-73.99,40.71]]}}]};
const manifest:DowntownManifest={id:"test-city",label:"Test downtown",bounds,nearBounds:[-74.05,40.65,-73.95,40.75],capturedAt:map.capturedAt,attribution:map.attribution,sourceUrl:map.sourceUrl,release:"2026-09-23.1",license:"ODbL-1.0",licenseUrl:"https://opendatacommons.org/licenses/odbl/1-0/",provenanceUrl:"/maps/downtown/test-city/provenance.json",tiles:[tile],statistics:{tiles:1,features:1,vertices:2,coverageSquareKilometres:12.5},version:1,coverage:"Public city centre",tileSizeMetres:1750};
const options=(request:typeof fetch)=>({signal:new AbortController().signal,request});
const respond=(value:unknown):typeof fetch=>async()=>Response.json(value);
const abortError=(error:unknown)=>error instanceof DOMException&&error.name==="AbortError";

test("manifest validation copies valid data and rejects malformed bounds, metadata and feature budgets",()=>{
  const accepted=validateDowntownManifest(manifest,"test-city");
  assert.deepEqual(accepted,manifest);
  assert.notEqual(accepted,manifest);assert.notEqual(accepted!.tiles,manifest.tiles);assert.notEqual(accepted!.bounds,bounds);
  for(const bad of [null,[],{}, {...manifest,id:"../other"},{...manifest,bounds:[-74,40,-75,41]}, {...manifest,nearBounds:[-75,40.65,-73.95,40.75]}, {...manifest,bounds:[-74,40,Infinity,41]}, {...manifest,sourceUrl:"javascript:alert(1)"},{...manifest,licenseUrl:"https://user:secret@example.com"},{...manifest,provenanceUrl:"https://example.com/provenance.json"},{...manifest,capturedAt:"yesterday"},{...manifest,statistics:{tiles:1,features:2,vertices:2}},{...manifest,statistics:{...manifest.statistics,coverageSquareKilometres:Infinity}},{...manifest,tiles:[{...tile,features:12001}]},{...manifest,tiles:[{...tile,vertices:500001}]}]) assert.equal(validateDowntownManifest(bad),null);
  assert.equal(validateDowntownManifest(manifest,"wrong-city"),null);
  assert.equal(validateDowntownManifest({...manifest,tiles:[tile,tile],statistics:{tiles:2,features:2,vertices:4}}),null);
  const many=Array.from({length:257},(_,i)=>({...tile,id:`test-city-downtown-${i}-0`,url:`/maps/downtown/test-city/tiles/${i}-0.json`}));
  assert.equal(validateDowntownManifest({...manifest,tiles:many,statistics:{tiles:257,features:257,vertices:514}}),null);
});

test("unsafe and cross-city URLs are rejected before any request",async()=>{
  let requests=0;const request:typeof fetch=async()=>{requests++;return Response.json(map);};
  const badUrls=["https://evil.example/tile.json","//evil.example/tile.json","/maps/downtown/test-city/tiles/../0-0.json","/maps/downtown/test-city/tiles/%2e%2e%2f0-0.json","/maps/downtown/test-city/tiles/0-0.json?pin=private","/maps/downtown/test-city/tiles/0-0.json#fragment","/maps/downtown/other-city/tiles/0-0.json","/maps/downtown/test-city/tiles/0-0.json\\anything","/api/site/context?lat=40&lon=-74"];
  for(const url of badUrls) {
    assert.equal(validateDowntownManifest({...manifest,tiles:[{...tile,url}]}),null);
    await assert.rejects(fetchDowntownTile({...tile,url},options(request)),/invalid/);
  }
  await assert.rejects(fetchDowntownManifest("../private",options(request)),/invalid/);
  assert.equal(requests,0);
});

test("local manifest and one tile load with safe request settings and no automatic fanout",async()=>{
  const calls:string[]=[];
  const request:typeof fetch=async(url,init)=>{
    calls.push(String(url));
    assert.equal(init?.mode,"same-origin");assert.equal(init?.redirect,"error");assert.equal(init?.credentials,"omit");
    assert.ok(init?.signal);
    return Response.json(String(url).endsWith("manifest.json")?manifest:map);
  };
  const loaded=await fetchDowntownManifest("test-city",options(request));
  assert.deepEqual(calls,["/maps/downtown/test-city/manifest.json"]);
  assert.deepEqual(await fetchDowntownTile(loaded.tiles[0],options(request)),map);
  assert.equal(calls.length,2);
});

test("tile payload must match its manifest identity, bounds, feature count and vertex count",async()=>{
  for(const payload of [{...map,id:"other"},{...map,bounds:[-74.2,40.6,-73.9,40.8]},{...map,features:[]},{...map,features:[{...map.features[0],geometry:{type:"LineString",coordinates:[[-74,40.7],[-73.99,40.71],[-73.98,40.72]]}}]},{...map,features:[{id:"broken"}]}]) {
    await assert.rejects(fetchDowntownTile(tile,options(respond(payload))),/invalid|incomplete/);
  }
});

test("header and chunked byte limits reject oversized responses and cancel their body",async()=>{
  let cancelled=0;
  const stream=(bytes:number)=>new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(bytes));},cancel(){cancelled++;}});
  const header=new Response(stream(1),{headers:{"content-length":String(MAX_DOWNTOWN_MANIFEST_BYTES+1)}});
  await assert.rejects(fetchDowntownManifest("test-city",options(async()=>header)),/size limit/);
  const chunks=new Response(stream(MAX_DOWNTOWN_TILE_BYTES+1),{headers:{"content-length":"1"}});
  await assert.rejects(fetchDowntownTile(tile,options(async()=>chunks)),/size limit/);
  assert.equal(cancelled,2);
  const badUtf8=new Response(new Uint8Array([0xc3,0x28]));
  await assert.rejects(fetchDowntownManifest("test-city",options(async()=>badUtf8)),/could not be read/);
  await assert.rejects(fetchDowntownManifest("test-city",options(async()=>new Response("{"))),/could not be read/);
});

test("abort rejects stalled fetch immediately and pre-aborted requests never start",async()=>{
  const controller=new AbortController();let inner:AbortSignal|null=null,started=0;
  const request:typeof fetch=async(_url,init)=>{started++;inner=init!.signal!;return new Promise(()=>{});};
  const pending=fetchDowntownManifest("test-city",{signal:controller.signal,request});
  controller.abort();await assert.rejects(pending,abortError);
  assert.equal((inner as AbortSignal|null)?.aborted,true);
  await assert.rejects(fetchDowntownManifest("test-city",{signal:controller.signal,request}),abortError);
  assert.equal(started,1);
});

test("timeout and cancellation cover stalled body reads even when stream cleanup never resolves",async()=>{
  for(const action of ["timeout","abort"] as const) {
    const controller=new AbortController();let cancelled=false;
    const body=new ReadableStream<Uint8Array>({start(stream){stream.enqueue(new TextEncoder().encode('{"id":'));},cancel(){cancelled=true;return new Promise(()=>{});}});
    const pending=fetchDowntownTile(tile,{signal:controller.signal,request:async()=>new Response(body),timeoutMs:20});
    if(action==="abort")setTimeout(()=>controller.abort(),5);
    await assert.rejects(pending,action==="abort"?abortError:/timed out/);
    assert.equal(cancelled,true);
  }
  let aborted:AbortSignal|null=null;
  await assert.rejects(fetchDowntownManifest("test-city",{signal:new AbortController().signal,timeoutMs:10,request:async(_url,init)=>{aborted=init!.signal!;return new Promise(()=>{});}}),/timed out/);
  assert.equal((aborted as AbortSignal|null)?.aborted,true);
});

test("failed and cancelled tiles can be retried without a poisoned cache or stale completion",async()=>{
  for(const request of [async()=>new Response("Missing",{status:404}),async()=>{throw new Error("socket failure");}] as (typeof fetch)[]) {
    await assert.rejects(fetchDowntownTile(tile,options(request)),/Retry/);
    assert.equal((await fetchDowntownTile(tile,options(respond(map)))).id,tile.id);
  }
  const controller=new AbortController();let complete!:(value:Response)=>void;
  const pending=fetchDowntownTile(tile,{signal:controller.signal,request:async()=>new Promise(resolve=>{complete=resolve;})});
  controller.abort();await assert.rejects(pending,abortError);complete(Response.json(map));
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(await fetchDowntownTile(tile,options(respond(map))),map);
});

test("redirected responses are rejected instead of following a different source",async()=>{
  const response=Response.json(manifest);Object.defineProperty(response,"redirected",{value:true});
  await assert.rejects(fetchDowntownManifest("test-city",options(async()=>response)),/could not load/);
});

test("checked-in downtown manifests satisfy the runtime contract and every installed tile stays byte bounded",()=>{
  const root=new URL("../../public/maps/downtown/",import.meta.url);
  if(!existsSync(root))return;
  let checked=0;
  for(const city of readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory())) {
    const path=new URL(`${city.name}/manifest.json`,root);if(!existsSync(path))continue;
    const bytes=readFileSync(path);assert.ok(bytes.byteLength<=MAX_DOWNTOWN_MANIFEST_BYTES);
    const loaded=validateDowntownManifest(JSON.parse(bytes.toString("utf8")),city.name);
    assert.ok(loaded,`${city.name} manifest rejected`);
    for(const tile of loaded.tiles) {
      const file=readFileSync(new URL(`../../public${tile.url}`,import.meta.url));
      assert.ok(file.byteLength<=MAX_DOWNTOWN_TILE_BYTES,`${tile.id} exceeds byte budget`);
    }
    checked++;
  }
  assert.ok(checked>0,"installed downtown directory must contain a usable manifest");
});
