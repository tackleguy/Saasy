import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright-core';
const engine=process.env.QA_BROWSER||'chrome';
const base=process.env.QA_URL||'http://127.0.0.1:3160';
const out=process.env.QA_OUT||'docs/qa/district-transition/after';
const uid='372bc495b3a941308f4a3198bc45e17b';
const browser=await ({chrome:chromium,firefox,webkit}[engine]).launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
await fs.mkdir(out,{recursive:true});const results=[];
// Read-only test probe: CanvasImpl holds the renderer state in a React ref.
// Fail loudly if that internal shape changes; never add a production debug API.
async function probe(page){await page.evaluate((uid)=>{
 const canvas=document.querySelector('canvas');
 const key=Object.keys(canvas).find(k=>k.startsWith('__reactFiber$'));
 let fiber=canvas[key],root;
 for(let d=0;fiber&&d<40&&!root;d++,fiber=fiber.return){for(const f of [fiber,fiber.alternate]){
  let hook=f?.memoizedState;
  for(let n=0;hook&&n<100;n++,hook=hook.next){const s=hook.memoizedState?.current;if(s?.scene?.isScene&&s.gl?.domElement===canvas){root=s;break;}}
 }}
 if(!root)throw new Error('R3F state unavailable');
 window.__districtRead=(id=uid)=>{const host=root.scene.getObjectByName(`city-district:${id}`);return {canvas:canvas===document.querySelector('canvas'),scene:root.scene.uuid,models:host?.children.map(c=>({uuid:c.uuid,name:c.name}))||[]};};
 window.__districtTrackResources=()=>{const host=root.scene.getObjectByName(`city-district:${uid}`);const resources=new Set();host.traverse(o=>{if(!o.isMesh)return;resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const value of Object.values(m))if(value?.isTexture)resources.add(value);}});window.__districtDisposals=[...resources].map(resource=>{const record={uuid:resource.uuid,count:0};resource.addEventListener('dispose',()=>record.count++);return record;});};
 window.__districtFrames=[];window.__districtSampling=false;
 window.__districtStart=()=>{window.__districtFrames=[];window.__districtSampling=true;const tick=()=>{if(!window.__districtSampling)return;window.__districtFrames.push(window.__districtRead());requestAnimationFrame(tick);};tick();};
 },uid);}
const read=p=>p.evaluate(()=>window.__districtRead());
const detail=(p,d)=>p.waitForFunction(d=>window.__districtRead().models.some(m=>m.name.endsWith(':'+d)),d,{timeout:90000});
async function start(width=1280){const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(String(e)));await p.goto(base+'/studio?graphics=1',{waitUntil:'domcontentloaded'});await p.waitForSelector('canvas[data-graphics]',{timeout:120000});await probe(p);return {p,errors};}
async function finish(name,p,errors,extra={}){assert.deepEqual(errors,[]);assert.equal((await read(p)).canvas,true);await p.screenshot({path:`${out}/${engine}-${name}.png`});results.push({name,passed:true,errors,...extra});await fs.writeFile(`${out}/${engine}-results.json`,JSON.stringify(results,null,2));console.log(engine+': '+name+' passed');await p.close();}
try{
 // Retain standard during a delayed failed upgrade, then keyboard retry atomically.
 {const {p,errors}=await start();let fail=true,release,standardRequests=0;const gate=new Promise(r=>{release=r;});
 await p.route(`**/models/sketchfab/${uid}/model.glb`,r=>{standardRequests++;return r.continue();});
 await p.route(`**/models/sketchfab/${uid}/model-hq.glb`,async r=>{if(fail){await gate;return r.fulfill({status:404,body:'Unavailable'});}return r.continue();});
 await p.getByLabel('Scene quality',{exact:true}).selectOption('low');await p.getByLabel('Site context',{exact:true}).selectOption('existing');await detail(p,'standard');const original=(await read(p)).models[0].uuid;const initialStandardRequests=standardRequests;
 await p.evaluate(()=>{window.__districtTrackResources();window.__districtStart();});await p.getByLabel('Scene quality',{exact:true}).selectOption('high');await p.getByText('Updating city detail… Current view kept.',{exact:true}).waitFor();await p.waitForTimeout(1000);
 assert.equal((await read(p)).models[0].uuid,original);assert.ok((await p.evaluate(()=>window.__districtDisposals)).every(r=>r.count===0),'active resources must remain allocated during replacement');await p.screenshot({path:`${out}/${engine}-pending-retains-district.png`});release();
 await p.getByRole('button',{name:'Retry high detail',exact:true}).waitFor();assert.equal((await read(p)).models[0].uuid,original);assert.equal(standardRequests,initialStandardRequests,'failed HQ must reuse the active standard without another download');
 await p.evaluate(await fs.readFile('node_modules/axe-core/axe.min.js','utf8'));
 const axe=await p.evaluate(async()=>{const box=document.querySelector('select[aria-label="City backdrop"]').parentElement.parentElement;return (await window.axe.run(box)).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)}));});assert.deepEqual(axe,[]);
 await p.getByRole('button',{name:'Retry high detail',exact:true}).focus();await p.screenshot({path:`${out}/${engine}-fallback-keyboard.png`});fail=false;await p.getByRole('button',{name:'Retry high detail',exact:true}).press('Enter');await detail(p,'high');
 const final=(await read(p)).models[0].uuid;assert.notEqual(final,original);const disposals=await p.evaluate(()=>window.__districtDisposals);assert.ok(disposals.length>0&&disposals.every(r=>r.count===1),'retired resources must dispose exactly once');
 const frames=await p.evaluate(()=>{window.__districtSampling=false;return window.__districtFrames;});assert.ok(frames.length>2);assert.ok(frames.every(f=>f.models.length===1&&f.canvas),'district must never disappear or duplicate during replacement');
 await finish('atomic-upgrade-and-retry',p,errors,{frames:frames.length,standardRequests,original,final,disposedResources:disposals.length,axe});}
 // Initial missing/corrupt/offline HQ falls back to the local standard file.
 for(const failure of ['404','corrupt','network']){const {p,errors}=await start(failure==='corrupt'?390:1280);let standardRequests=0;
 await p.route(`**/models/sketchfab/${uid}/model-hq.glb`,r=>failure==='network'?r.abort('internetdisconnected'):r.fulfill({status:failure==='404'?404:200,body:'Not a valid GLB'}));
 await p.route(`**/models/sketchfab/${uid}/model.glb`,r=>{standardRequests++;return r.continue();});
 await p.getByLabel('Scene quality',{exact:true}).selectOption('high');await p.getByLabel('Site context',{exact:true}).selectOption('existing');await detail(p,'standard');await p.getByRole('button',{name:'Retry high detail',exact:true}).waitFor();assert.equal(standardRequests,1);
 if(failure==='corrupt'){const box=await p.getByRole('button',{name:'Capture render as PNG',exact:true}).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390,'recovery feedback must not push Capture offscreen');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await finish('initial-hq-'+failure,p,errors,{standardRequests});}
 // Failure of both variants remains actionable; retry replaces only scenery.
 {const {p,errors}=await start();let fail=true;await p.route(`**/models/sketchfab/${uid}/*.glb`,r=>fail?r.fulfill({status:404,body:'Unavailable'}):r.continue());
 await p.getByLabel('Scene quality',{exact:true}).selectOption('high');await p.getByLabel('Site context',{exact:true}).selectOption('existing');await p.getByRole('button',{name:'City model couldn’t load · Retry',exact:true}).waitFor();assert.equal((await read(p)).models.length,0);
 fail=false;await p.getByRole('button',{name:'City model couldn’t load · Retry',exact:true}).press('Enter');await detail(p,'high');await finish('both-fail-then-retry',p,errors);}
 // A failed downgrade retains HQ, and retry restores the requested standard detail.
 {const {p,errors}=await start();let fail=true;await p.route(`**/models/sketchfab/${uid}/model.glb`,r=>fail?r.fulfill({status:404,body:'Unavailable'}):r.continue());
 await p.getByLabel('Scene quality',{exact:true}).selectOption('high');await p.getByLabel('Site context',{exact:true}).selectOption('existing');await detail(p,'high');const original=(await read(p)).models[0].uuid;
 await p.getByLabel('Scene quality',{exact:true}).selectOption('low');await p.getByRole('button',{name:'Retry city detail',exact:true}).waitFor();assert.equal((await read(p)).models[0].uuid,original);
 fail=false;await p.getByRole('button',{name:'Retry city detail',exact:true}).press('Enter');await detail(p,'standard');await finish('failed-downgrade-retains-hq',p,errors);}
 // Returning to the active detail cancels HQ without reloading or accepting it late.
 {const {p,errors}=await start();let release;const gate=new Promise(r=>{release=r;});await p.route(`**/models/sketchfab/${uid}/model-hq.glb`,async r=>{await gate;try{await r.continue();}catch{/* request intentionally cancelled */}});
 await p.getByLabel('Scene quality',{exact:true}).selectOption('low');await p.getByLabel('Site context',{exact:true}).selectOption('existing');await detail(p,'standard');const original=(await read(p)).models[0].uuid;
 await p.getByLabel('Scene quality',{exact:true}).selectOption('high');await p.getByText('Updating city detail… Current view kept.',{exact:true}).waitFor();await p.getByLabel('Scene quality',{exact:true}).selectOption('low');release();await p.waitForTimeout(1200);assert.equal((await read(p)).models[0].uuid,original);
 await p.getByLabel('Site context',{exact:true}).selectOption('cinematic');await p.waitForFunction(()=>window.__districtRead().models.length===0);assert.equal(await p.getByText('Updating city detail… Current view kept.',{exact:true}).count(),0);await finish('cancel-obsolete-upgrade',p,errors);}
 // Changing cities cancels the previous city's pending upgrade and keeps source identity honest.
 {const {p,errors}=await start();const toronto='013c2e21e61c4a598c6d279f05953819';let release;const gate=new Promise(r=>{release=r;});await p.route(`**/models/sketchfab/${uid}/model-hq.glb`,async r=>{await gate;try{await r.continue();}catch{/* cancelled */}});
 await p.getByLabel('Scene quality',{exact:true}).selectOption('low');await p.getByLabel('Site context',{exact:true}).selectOption('existing');await detail(p,'standard');await p.getByLabel('Scene quality',{exact:true}).selectOption('high');await p.getByText('Updating city detail… Current view kept.',{exact:true}).waitFor();
 await p.getByLabel('City backdrop',{exact:true}).selectOption('toronto');release();await p.waitForFunction(id=>window.__districtRead(id).models.some(m=>m.name.endsWith(':high')),toronto,{timeout:90000});assert.equal((await read(p)).models.length,0);await p.waitForTimeout(500);assert.equal((await read(p)).models.length,0);await finish('city-change-cancels-upgrade',p,errors,{newCity:toronto});}
}finally{await fs.writeFile(`${out}/${engine}-results.json`,JSON.stringify(results,null,2));await browser.close();}
