import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright-core';
const engine=process.env.QA_BROWSER||'chrome', base=process.env.QA_URL||'http://127.0.0.1:3180';
const out=process.env.QA_OUT||'docs/qa/downtown/first';
const ids=(process.env.QA_IDS||'jersey-city,miami-beach,chicago,dubai,toronto,bayonne,lorenskog,madrid,london,seattle,new-york,los-angeles,san-francisco,boston').split(',');
const browser=await ({chrome:chromium,firefox,webkit}[engine]).launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
await fs.mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}), errors=[], warnings=[], results=[];
page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(['warning','error'].includes(message.type()))warnings.push(message.text());});
async function probe(){await page.evaluate(()=>{
 const canvas=document.querySelector('canvas');let fiber=canvas[Object.keys(canvas).find(key=>key.startsWith('__reactFiber$'))],root;
 for(let i=0;fiber&&i<40&&!root;i++,fiber=fiber.return)for(const branch of [fiber,fiber.alternate]){let hook=branch?.memoizedState;for(let j=0;hook&&j<100;j++,hook=hook.next){const r=hook.memoizedState?.current;if(r?.scene?.isScene&&r.gl?.domElement===canvas){root=r;break;}}}
 if(!root)throw Error('Renderer probe unavailable');
 window.__downtownState=()=>{
  let lowestMapPixel=0;
  const vector=root.camera.position.clone(), canvasRect=canvas.getBoundingClientRect();
  root.scene.updateMatrixWorld(true);
  root.scene.getObjectByName('mapped-context')?.traverse(node=>{
   const box=node.geometry?.boundingBox; if(!box || !node.name.startsWith('downtown-'))return;
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){vector.set(x,y,z);node.localToWorld(vector);vector.project(root.camera);lowestMapPixel=Math.max(lowestMapPixel,canvasRect.top+(1-vector.y)*canvasRect.height/2);}
  });
  const toolbarTop=document.querySelector('[aria-label="Presentation views"]')?.parentElement.getBoundingClientRect().top;
  const mapped=root.scene.getObjectByName('mapped-context'),downtown=root.scene.getObjectByName('downtown-context');let indexed=0,draws=0,visible=0,outerBuildings=0,unindexedWalls=0;
  downtown?.traverse(node=>{if(node.geometry){draws++;if(node.geometry.index)indexed++;if(node.name==='downtown-walls'){outerBuildings+=node.geometry.index?.count||0;if(!node.geometry.index)unindexedWalls++;}}if(node.isGroup&&node!==downtown&&node.visible)visible++;});
  return {near:{...mapped?.userData},downtown:{...downtown?.userData},indexed,draws,visible,outerBuildings,unindexedWalls,lowestMapPixel,toolbarTop,tiles:downtown?.children.map(tile=>({name:tile.name,uuid:tile.uuid})),stats:JSON.parse(canvas.dataset.graphics||'{}'),camera:root.camera.position.toArray(),far:root.camera.far};
 };
 });}
async function ready(id){await page.waitForFunction(id=>window.__downtownState?.().near.sourceId===id&&window.__downtownState().near.featureCount>0,id,{timeout:120000});}
async function cityReady(id){await page.waitForFunction(id=>{const s=window.__downtownState?.().downtown;return s?.sourceId===id&&s.visibleTiles>0&&s.loadedTiles>0&&s.pendingTiles===0&&s.failedTiles===0;},id,{timeout:180000});await page.waitForTimeout(800);}
async function present(){await page.getByRole('button',{name:'Present building',exact:true}).click();await page.waitForFunction(()=>Math.abs(document.querySelector('canvas').getBoundingClientRect().height-innerHeight)<2);await page.waitForTimeout(600);}
try{
 await page.goto(base+'/studio?graphics=1');await page.waitForSelector('canvas[data-graphics]',{timeout:120000});await probe();await ready('jersey-city');
 for(const id of ids){
  const start=Date.now();await page.getByLabel('Map area',{exact:true}).selectOption(id);await ready(id);await present();await cityReady(id);
  await page.screenshot({path:`${out}/${engine}-${id}-near.png`});
  await page.getByRole('button',{name:'Downtown',exact:true}).click();await page.waitForTimeout(1500);await cityReady(id);
  const state=await page.evaluate(()=>window.__downtownState());
  assert.equal(state.downtown.loadedTiles,state.downtown.totalTiles,'whole downtown view must load every tile');
  assert.ok(state.outerBuildings>0,'outer skyline must contain actual indexed building geometry');
  assert.equal(state.unindexedWalls,0,'outer building walls use compact indexed geometry; isolated road segments stay unindexed when smaller');
  assert.equal(state.visible,state.downtown.loadedTiles,'ready tiles must never be hidden by a stale visibility schedule');
  assert.ok(state.near.featureCount>0);assert.ok(state.far>5000);
  assert.ok(state.lowestMapPixel<state.toolbarTop-8,`mapped coverage ends at ${state.lowestMapPixel}px; toolbar begins at ${state.toolbarTop}px`);
  await page.screenshot({path:`${out}/${engine}-${id}-whole.png`});results.push({id,elapsedMs:Date.now()-start,state,passed:true});
  console.log(JSON.stringify({id,tiles:state.downtown.loadedTiles,geometryMiB:Math.round(state.downtown.geometryBytes/1048576),fps:state.stats.fps}));await page.keyboard.press('Escape');
 }
 if(process.env.QA_RESPONSIVE==='1'){
  await page.getByLabel('Map area',{exact:true}).selectOption('jersey-city');await ready('jersey-city');await present();await page.getByRole('button',{name:'Downtown',exact:true}).click();
  for(const [width,height] of [[390,844],[768,1024],[1280,900],[1920,1080]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(1000);await cityReady('jersey-city');
   const state=await page.evaluate(()=>window.__downtownState());assert.equal(state.downtown.loadedTiles,state.downtown.totalTiles);assert.ok(state.lowestMapPixel<state.toolbarTop-8);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`${out}/${engine}-${width}.png`});results.push({id:`viewport-${width}`,state,passed:true});
  }
  await page.evaluate(await fs.readFile('node_modules/axe-core/axe.min.js','utf8'));
  const violations=await page.evaluate(async()=> (await window.axe.run(document.querySelector('[aria-modal="true"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)})));
  assert.deepEqual(violations,[]);results.push({id:'presentation-accessibility',violations,passed:true});
  await page.setViewportSize({width:1440,height:1000});await page.keyboard.press('Escape');
 }
 if(process.env.QA_RESILIENCE==='1'){
  await page.getByLabel('Map area',{exact:true}).selectOption('miami-beach');await ready('miami-beach');
  let failedPath=null;await page.route('**/maps/downtown/jersey-city/tiles/*.json',async route=>{if(!failedPath||route.request().url()===failedPath){failedPath=route.request().url();await route.fulfill({status:503,body:'Temporarily unavailable'});}else await route.continue();});
  await page.getByLabel('Map area',{exact:true}).selectOption('jersey-city');await ready('jersey-city');await present();await page.getByRole('button',{name:'Downtown',exact:true}).click();
  await page.getByRole('button',{name:'Retry downtown',exact:true}).waitFor({timeout:120000});await page.waitForFunction(()=>window.__downtownState().downtown.pendingTiles===0,null,{timeout:180000});
  const partial=await page.evaluate(()=>window.__downtownState());assert.ok(partial.downtown.failedTiles>0);assert.ok(partial.downtown.loadedTiles>0);assert.ok(partial.near.featureCount>0);
  await page.screenshot({path:`${out}/${engine}-retry-before.png`});await page.unroute('**/maps/downtown/jersey-city/tiles/*.json');
  await page.getByRole('button',{name:'Retry downtown',exact:true}).click();await cityReady('jersey-city');const recovered=await page.evaluate(()=>window.__downtownState());
  for(const tile of partial.tiles)assert.ok(recovered.tiles.some(next=>next.uuid===tile.uuid),'retry must preserve already-loaded tiles');
  await page.screenshot({path:`${out}/${engine}-retry-after.png`});results.push({id:'retry-preserves-valid-city',failedPath,partial,recovered,passed:true});await page.keyboard.press('Escape');
  for(const id of ['london','dubai','new-york','jersey-city']){await page.getByLabel('Map area',{exact:true}).selectOption(id);await page.waitForTimeout(100);}
  await ready('jersey-city');await cityReady('jersey-city');const switched=await page.evaluate(()=>window.__downtownState());assert.ok(switched.tiles.every(tile=>tile.name.startsWith('jersey-city-')));results.push({id:'rapid-city-switch-cleanup',passed:true,state:switched});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings.filter(w=>/shader.*error|GL_INVALID_OPERATION|VALIDATE_STATUS|sampler.*mismatch/i.test(w)),[]);
}finally{await fs.writeFile(`${out}/${engine}-results.json`,JSON.stringify({results,errors,warnings},null,2));await browser.close();}
