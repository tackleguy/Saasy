import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney } from '../../src/lib/format';
import { readJsonObject, RequestBodyError } from '../../src/lib/requestBody';
import { readScenarios, writeScenarios, validYieldInputs } from '../../src/lib/scenarioStorage';
import { computeYield, computeSite, proforma, INPUT_RANGES } from '../../src/lib/finance';
import { PROJECTS, projectSite } from '../../src/content/projects';
import type { FloorData, YieldInputs } from '../../src/types';

const request=(value:unknown)=>new Request('http://localhost/api/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
test('QA-002 rejects null, arrays, scalars and malformed JSON without crashing',async()=>{
 for(const value of [null, [], 'text', 1, true]) await assert.rejects(()=>readJsonObject(request(value),1024),e=>e instanceof RequestBodyError && e.status===400);
 await assert.rejects(()=>readJsonObject(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:'{'}),1024),RequestBodyError);
 assert.deepEqual(await readJsonObject(request({text:'valid'}),1024),{text:'valid'});
});
test('QA-002 rejects chunked oversized bytes before parsing',async()=>{
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(100));c.enqueue(new Uint8Array(100));c.close();}});
 const req=new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'} as RequestInit);
 await assert.rejects(()=>readJsonObject(req,150),e=>e instanceof RequestBodyError && e.status===413);
});
test('QA-006 money handles negative zero, cents and unavailable numbers',()=>{
 assert.equal(fmtMoney(-0.1),'$0');assert.equal(fmtMoney(-0.001,false),'$0.00');assert.equal(fmtMoney(-12.34,false),'−$12.34');assert.equal(fmtMoney(1234.56,false),'$1,234.56');assert.equal(fmtMoney(NaN),'—');assert.equal(fmtMoney(Infinity),'—');
});
test('QA-003 failed storage writes are observable; valid scenario survives reload',()=>{
 assert.throws(()=>writeScenarios({setItem(){throw new Error('QuotaExceededError')}},'demo',[]),/QuotaExceededError/);
 let raw='';const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value}};
 const scenario={id:'1',name:'Base case',savedAt:'2026-10-01T00:00:00Z',inputsById:{tower:proforma(100000,1000,500)},layout:{tower:[0,10] as [number,number]}};
 writeScenarios(storage,'demo',[scenario]);assert.deepEqual(readScenarios(storage,'demo'),[scenario]);
});
test('QA-007 malformed saved scenarios are rejected',()=>{
 for(const raw of ['null','{}','[null]','[{"id":"1"}]','bad']) assert.throws(()=>readScenarios({getItem:()=>raw},'demo'));
 const valid=proforma(100000,1000,500);assert.ok(validYieldInputs(valid));
 for(const invalid of [{...valid,termMonths:Infinity},{...valid,termMonths:0},{...valid,pricePerSqFt:null},{...valid,absorptionUnitsPerMonth:-1}]) assert.equal(validYieldInputs(invalid),false);
});
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<0.005,`${actual} differs from ${expected}`);
test('independent one-floor calculation agrees to the cent',()=>{
 const floor={index:0,zone:'residential',zoneIndex:0,footprintM2:100} as FloorData;
 const inputs=proforma(1000,1000,200,'balanced',{landCost:100000,softCostPct:10,contingencyPct:5,ltcPct:0,pricePerSqFt:{podium:1000,office:1000,residential:1000,crown:1000},salesCommissionPct:2,auraFeePct:1});
 const m=computeYield(inputs,[floor]);
 // Area 1,000 × $1,000; hard 1,000 × $200; soft 10%; contingency 5% of $220k.
 close(m.gdv,1000000);close(m.hardCost,200000);close(m.softCost,20000);close(m.contingency,11000);close(m.financeCost,0);close(m.salesCommission,20000);close(m.platformFee,10000);close(m.totalDevelopmentCost,361000);close(m.profit,639000);
 close(m.cashflow.reduce((s,x)=>s+x.receipts,0),970000);close(m.floors[0].profit,639000);
});
test('all project floor, zone and site totals reconcile at defaults and slider extremes',()=>{
 for(const project of PROJECTS){
  const metrics=[];
  for(const b of projectSite(project)){
   const base=project.finance[b.id];
   for(const edge of ['default','min','max'] as const){
    const inputs={...base,pricePerSqFt:{...base.pricePerSqFt}};
    if(edge!=='default') for(const [key,range] of Object.entries(INPUT_RANGES)){
     if(key==='price') for(const z of ['podium','office','residential','crown'] as const) inputs.pricePerSqFt[z]=range[edge];
     else (inputs as unknown as Record<string,unknown>)[key]=range[edge];
    }
    const m=computeYield(inputs,b.floors);for(const [key,value] of Object.entries(m)) if(typeof value==='number') assert.ok(Number.isFinite(value),`${project.slug} ${key}`);
    close(m.floors.reduce((s,f)=>s+f.revenue,0),m.gdv);close(m.zones.reduce((s,z)=>s+z.revenue,0),m.gdv);close(m.floors.reduce((s,f)=>s+f.cost,0),m.totalDevelopmentCost);close(m.gdv-m.totalDevelopmentCost,m.profit);
    if(edge==='default') metrics.push(m);
   }
  }
  close(computeSite(metrics).gdv,metrics.reduce((s,m)=>s+m.gdv,0));
 }
});
test('zero revenue and costs above revenue remain finite and negative',()=>{
 const floors=projectSite(PROJECTS[0])[0].floors;
 const i={...proforma(100000,1000,1200),pricePerSqFt:{podium:0,office:0,residential:0,crown:0}};
 const m=computeYield(i,floors);assert.equal(m.gdv,0);assert.ok(m.profit<0);assert.equal(m.irrPct,null);assert.ok(Number.isFinite(m.marginOnGdvPct));assert.ok(fmtMoney(m.profit).startsWith('−$'));
});

test('QA-022 corrupt and oversized CAD files fail before allocating geometry',async()=>{
 const {parseCadFile}=await import('../../src/lib/cadParser');
 await assert.rejects(()=>parseCadFile(new File([],'empty.stl')),/empty/);
 let read=false;
 const huge={name:'huge.stl',size:51*1024*1024,arrayBuffer:async()=>{read=true;return new ArrayBuffer(0)}} as File;
 await assert.rejects(()=>parseCadFile(huge),/50 MB/);assert.equal(read,false);
 await assert.rejects(()=>parseCadFile(new File(['not an STL'],'corrupt.stl')));
});

import { CITY_PRESETS } from '../../src/lib/cityPresets';
import { buildSkyline } from '../../src/components/3d/environment/skylineGeometry';
import { createHash } from 'node:crypto';

test('skyline: all cities have distinct, deterministic geometry within six material batches',()=>{
 const hashes=new Set<string>();
 for(const city of CITY_PRESETS){
  const a=buildSkyline(city), b=buildSkyline(city);
  assert.ok(a.length>0 && a.length<=6,city.id);
  const hash=(batches:ReturnType<typeof buildSkyline>)=>{
   const h=createHash('sha256');
   for(const batch of batches) h.update(Buffer.from(batch.geometry.getAttribute('position').array.buffer));
   return h.digest('hex');
  };
  assert.equal(hash(a),hash(b));hashes.add(hash(a));
  for(const batch of a){
   for(const name of ['position','normal','uv','color'])assert.ok([...batch.geometry.getAttribute(name).array].every(Number.isFinite),`${city.id}: ${name}`);
   assert.ok(batch.geometry.getAttribute('position').count<100000);
  }
  [...a,...b].forEach(b=>b.geometry.dispose());
 }
 assert.equal(hashes.size,CITY_PRESETS.length);
});
test('skyline: windows maintain a 0.9-unit storey on every facade; roofs are separate',()=>{
 for(const city of CITY_PRESETS){
  const batches=buildSkyline(city);
  assert.ok(batches.some(b=>b.finish==='roof'));
  for(const b of batches){
   if(b.finish!=='roof'){
    const p=b.geometry.getAttribute('position'),uv=b.geometry.getAttribute('uv'),n=b.geometry.getAttribute('normal');
    for(let i=0;i<p.count;i++){
     assert.ok(Math.abs(uv.getY(i)-p.getY(i)/.9)<.00003);
     assert.ok(Math.abs(n.getY(i))<=.8,'roof cannot use a window material');
    }
   }
   b.geometry.dispose();
  }
 }
});
test('skyline: quality reduction preserves district bounds and site edits remove geometry',()=>{
 for(const city of CITY_PRESETS){
  const high=buildSkyline(city),low=buildSkyline(city,[],true);
  const bounds=(batches:ReturnType<typeof buildSkyline>)=>{
   const points=batches.filter(b=>b.finish!=='roof').flatMap(b=>[...b.geometry.getAttribute('position').array]);
   return Array.from({length:3},(_,axis)=>{const p=points.filter((_,i)=>i%3===axis);return [Math.min(...p),Math.max(...p)];});
  };
  assert.deepEqual(bounds(high),bounds(low),city.id);
  assert.equal(buildSkyline(city,[{u0:-1000,u1:1000,w0:-1000,w1:1000}]).length,0);
  [...high,...low].forEach(b=>b.geometry.dispose());
 }
});
