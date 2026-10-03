import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readStoredProjectLocation,fetchProjectMap} from '../../src/hooks/useProjectMap';
import {defaultMapLocation} from '../../src/lib/mapLocations';
import type {MapSnapshot} from '../../src/lib/geographicContext';

const map:MapSnapshot={id:'test-area',label:'Test area',bounds:[-75,40,-73,41],capturedAt:'2026-10-02T00:00:00Z',attribution:'Test fixture',sourceUrl:'https://example.com/map',features:[]};
const request=(response:Response)=>async()=>response;

test('project pins restore independently and missing records clear the previous pin',()=>{
 const a=defaultMapLocation('new-york'),b=defaultMapLocation('chicago');
 const stored=new Map([['project-a',JSON.stringify(a)],['project-b',JSON.stringify(b)]]);
 const storage={getItem:(key:string)=>stored.get(key)??null};
 assert.deepEqual(readStoredProjectLocation(storage,'project-a'),{location:a,error:''});
 assert.deepEqual(readStoredProjectLocation(storage,'project-b'),{location:b,error:''});
 assert.deepEqual(readStoredProjectLocation(storage,'project-without-pin'),{location:null,error:''});
 stored.delete('project-a');
 assert.deepEqual(readStoredProjectLocation(storage,'project-a'),{location:null,error:''});
});

test('valid custom pins restore while corrupt, invalid and inaccessible pins show a fallback message',()=>{
 const custom={latitude:40.4,longitude:-3.7,label:'Custom project pin',example:false};
 assert.deepEqual(readStoredProjectLocation({getItem:()=>JSON.stringify(custom)},'project'),{location:custom,error:''});
 for(const raw of ['{',JSON.stringify({latitude:90,longitude:0,label:'Invalid latitude',example:false}),JSON.stringify({latitude:'40',longitude:-74,label:'Invalid',example:false})]){
  const result=readStoredProjectLocation({getItem:()=>raw},'project');
  assert.equal(result.location,null);assert.match(result.error,/example pin is shown/);
 }
 const denied=readStoredProjectLocation({getItem:()=>{throw new Error('Blocked storage');}},'project');
 assert.equal(denied.location,null);assert.match(denied.error,/could not be restored/);
});

test('map requests accept only validated data with the requested source identity',async()=>{
 const signal=new AbortController().signal;
 assert.equal((await fetchProjectMap('test-area',{signal,request:request(Response.json(map))})).id,'test-area');
 for(const response of [new Response('Missing',{status:404}),Response.json({...map,id:'different-area'}),Response.json({...map,features:[{id:'broken'}]})]){
  await assert.rejects(fetchProjectMap('test-area',{signal,request:request(response)}),/could not load/);
 }
 await assert.rejects(fetchProjectMap('test-area',{signal,request:async()=>{throw new TypeError('Failed to fetch');}}),/Your project is still available/);
});

test('a stalled response times out and aborts its network request',async()=>{
 let inner:AbortSignal|null=null;
 const stalled:typeof fetch=async(_url,init)=>{inner=init!.signal!;return new Promise<Response>(()=>{});};
 await assert.rejects(fetchProjectMap('test-area',{signal:new AbortController().signal,request:stalled,timeoutMs:10}),/took too long/);
 assert.equal((inner as AbortSignal|null)?.aborted,true);
});

test('switching projects cancels pending JSON parsing and rejects late stale completion',async()=>{
 const controller=new AbortController();
 let complete!:(value:MapSnapshot)=>void;
 const body=new Promise<MapSnapshot>(resolve=>{complete=resolve;});
 const response={ok:true,json:()=>body} as Response;
 const pending=fetchProjectMap('test-area',{signal:controller.signal,request:request(response)});
 controller.abort();
 await assert.rejects(pending,error=>error instanceof DOMException&&error.name==='AbortError');
 complete(map);
 await new Promise(resolve=>setImmediate(resolve));
 const alreadyCancelled=new AbortController();alreadyCancelled.abort();
 let requested=false;
 await assert.rejects(fetchProjectMap('test-area',{signal:alreadyCancelled.signal,request:async()=>{requested=true;return Response.json(map);}}),error=>error instanceof DOMException&&error.name==='AbortError');
 assert.equal(requested,false);
});
