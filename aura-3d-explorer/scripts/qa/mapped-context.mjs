import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright-core';
const base=process.env.QA_URL||'http://127.0.0.1:3160';
const engine=process.env.QA_BROWSER||'chrome';
const out=process.env.QA_OUT||'docs/qa/mapped-context';
const browser=await ({chrome:chromium,firefox,webkit}[engine]).launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
await fs.mkdir(out,{recursive:true});
const results=[];
async function probe(p){await p.evaluate(()=>{
const c=document.querySelector('canvas');let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))],root;
for(let i=0;f&&i<40&&!root;i++,f=f.return)for(const fiber of [f,f.alternate]){let h=fiber?.memoizedState;for(let j=0;h&&j<100;j++,h=h.next){const r=h.memoizedState?.current;if(r?.scene?.isScene&&r.gl?.domElement===c){root=r;break;}}}
if(!root)throw Error('Renderer probe unavailable');window.__mapRead=()=>{const m=root.scene.getObjectByName('mapped-context');return {...m?.userData,children:m?.children.map(x=>x.name),draws:root.gl.info.render.calls,geometries:root.gl.info.memory.geometries};};
});}
async function ready(p,id){await p.waitForFunction(id=>window.__mapRead?.().sourceId===id&&window.__mapRead().featureCount>0,id,{timeout:120000});}
try{
const p=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[],requests=[];
p.on('pageerror',e=>errors.push(String(e)));p.on('request',r=>requests.push(r.url()));
await p.goto(base+'/studio?graphics=1',{waitUntil:'domcontentloaded'});await p.waitForSelector('canvas[data-graphics]',{timeout:120000});await probe(p);await ready(p,'jersey-city');
await p.getByLabel('Scene quality',{exact:true}).selectOption('medium');await p.getByLabel('Sun',{exact:true}).selectOption('golden');
await p.waitForTimeout(4500);await p.screenshot({path:`${out}/${engine}-studio.png`});results.push({name:'real-geography-initial',passed:true,scene:await p.evaluate(()=>window.__mapRead())});
await p.getByRole('button',{name:'Site map',exact:true}).click();await p.getByRole('dialog',{name:'Project map location'}).waitFor();
await p.screenshot({path:`${out}/${engine}-map.png`});
await p.getByLabel('Map pin or coordinates',{exact:true}).fill('40.712000, -74.037000');await p.getByLabel('Site name',{exact:true}).fill('QA real project pin');await p.getByRole('button',{name:'Save project pin',exact:true}).click();await p.getByText('Project pin saved on this device.',{exact:true}).waitFor();
await p.reload({waitUntil:'domcontentloaded'});await p.waitForSelector('canvas[data-graphics]',{timeout:90000});await probe(p);await ready(p,'jersey-city');await p.getByRole('button',{name:'Site map',exact:true}).click();await p.waitForFunction(()=>[...document.querySelectorAll('input')].some(i=>i.value==='40.712000, -74.037000'));assert.equal(await p.getByLabel('Map pin or coordinates',{exact:true}).inputValue(),'40.712000, -74.037000');
await p.getByLabel('Map pin or coordinates',{exact:true}).fill('999, 0');await p.getByRole('button',{name:'Save project pin',exact:true}).click();await p.getByText('Enter latitude, longitude or a map link containing coordinates.',{exact:true}).waitFor();assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('aura:project-location:v1:meridian-tower')))).latitude,40.712);
await p.evaluate(await fs.readFile('node_modules/axe-core/axe.min.js','utf8'));const axe=await p.evaluate(async()=> (await window.axe.run(document.querySelector('[aria-label="Project map location"]'))).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)})));assert.deepEqual(axe,[]);
await p.getByRole('button',{name:'Close project map',exact:true}).press('Enter');
results.push({name:'pin-persistence-and-coverage',passed:true,axe});
await p.getByLabel('Map area',{exact:true}).selectOption('miami-beach');await ready(p,'miami-beach');await p.screenshot({path:`${out}/${engine}-miami.png`});
if(engine==='chrome')for(const id of ['chicago','dubai','toronto','bayonne','lorenskog','madrid','london','seattle','new-york','los-angeles','san-francisco','boston']){await p.getByLabel('Map area',{exact:true}).selectOption(id);await ready(p,id);await p.screenshot({path:`${out}/${engine}-${id}.png`});results.push({name:id,passed:true,scene:await p.evaluate(()=>window.__mapRead())});}
await p.getByLabel('Map area',{exact:true}).selectOption('jersey-city');await ready(p,'jersey-city');await p.setViewportSize({width:390,height:844});await p.screenshot({path:`${out}/${engine}-phone.png`});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');await p.getByRole('button',{name:'Site map',exact:true}).click();await p.screenshot({path:`${out}/${engine}-phone-map.png`});const panel=await p.getByRole('dialog',{name:'Project map location'}).boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=390);await p.getByRole('button',{name:'Close project map',exact:true}).press('Escape');
assert.deepEqual(errors,[]);assert.equal(requests.filter(u=>/\/models\/sketchfab\//.test(u)).length,0,'no arbitrary skyline model requests');
results.push({name:'browser-and-phone',passed:true,errors});
await p.close();
const q=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});let fail=true;await q.route('**/maps/jersey-city.json',r=>fail?r.fulfill({status:503,body:'offline'}):r.continue());await q.goto(base+'/studio?graphics=1',{waitUntil:'domcontentloaded'});await q.getByRole('button',{name:'Retry map context',exact:true}).waitFor({timeout:90000});await q.screenshot({path:`${out}/${engine}-unavailable.png`});fail=false;await q.getByRole('button',{name:'Retry map context',exact:true}).press('Enter');await q.waitForSelector('canvas[data-graphics]');await probe(q);await ready(q,'jersey-city');results.push({name:'network-failure-retry',passed:true});const external=[];q.on('request',r=>{if(r.url().includes('/api/site/context')||r.url().includes('overpass'))external.push(r.url());});
await q.getByRole('button',{name:'Site map',exact:true}).click();await q.getByLabel('Map pin or coordinates',{exact:true}).fill('0, 0');await q.getByRole('button',{name:'Save project pin',exact:true}).click();await q.getByText('Map data is not installed for this location. Your pin is saved locally. Choose a downloaded map area to preview surroundings.',{exact:true}).waitFor();assert.equal(external.length,0);assert.equal((await q.request.get(base+'/api/site/context?lat=0&lon=0')).status(),503);await q.screenshot({path:`${out}/${engine}-local-pin-no-live-lookup.png`});results.push({name:'custom-pin-stays-local',passed:true});await q.close();
}catch(error){for(const page of browser.contexts().flatMap(c=>c.pages())){console.error((await page.locator('body').innerText()).slice(-2500));await page.screenshot({path:`${out}/${engine}-failure.png`}).catch(()=>{});}throw error;}finally{await fs.writeFile(`${out}/${engine}-results.json`,JSON.stringify(results,null,2));await browser.close();}
