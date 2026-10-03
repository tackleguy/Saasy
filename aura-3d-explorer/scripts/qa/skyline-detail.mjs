import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright-core';
import {waitForDusk} from './scene-light.mjs';
const engine=process.env.QA_BROWSER||'chrome',base=process.env.QA_URL||'http://127.0.0.1:3180';
const out=process.env.QA_OUT||'docs/qa/skyline-detail/first';
const browser=await ({chrome:chromium,firefox,webkit}[engine]).launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
await fs.mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],warnings=[],results=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['warning','error'].includes(m.type()))warnings.push(m.text());});
async function probe(){await page.evaluate(()=>{
 const c=document.querySelector('canvas');let f=c[Object.keys(c).find(k=>k.startsWith('__reactFiber$'))],root;
 for(let i=0;f&&i<40&&!root;i++,f=f.return)for(const b of [f,f.alternate]){let h=b?.memoizedState;for(let j=0;h&&j<100;j++,h=h.next){const r=h.memoizedState?.current;if(r?.scene?.isScene&&r.gl?.domElement===c){root=r;break;}}}
 if(!root)throw Error('Renderer probe unavailable');
 window.__skylineState=()=>{
 const mapped=root.scene.getObjectByName('mapped-context'),walls=root.scene.getObjectByName('mapped-walls'),stats=JSON.parse(c.dataset.graphics||'{}');
 const roofs=root.scene.getObjectByName('mapped-roof-details');
 return {...mapped?.userData,facade: walls?.material.name,reflectionBound:!!walls?.material.envMap&&walls.material.envMap===root.scene.environment,reflectionRatio:walls?.material.envMapIntensity/root.scene.environmentIntensity,facadeVertices:walls?.geometry.getAttribute('auraFacade')?.count,vertices:walls?.geometry.getAttribute('position')?.count,roofDetail:roofs?.userData,stats,near:root.camera.near,camera:root.camera.position.toArray()};
 };
});}
async function mapped(id){await page.waitForFunction(id=>window.__skylineState?.().sourceId===id&&window.__skylineState().featureCount>0,id,{timeout:120000});await page.waitForTimeout(1000);}
async function present(){await page.getByRole('button',{name:'Present building',exact:true}).click();await page.waitForFunction(()=>Math.abs(document.querySelector('canvas').getBoundingClientRect().height-innerHeight)<2);await page.waitForTimeout(800);assert.equal(await page.locator('[data-cinematic-dock]').count(),0,'editor controls must not leak into presentation');}
try{
 await page.goto(base+'/studio?graphics=1');await page.waitForSelector('canvas[data-graphics]',{timeout:120000});await probe();await mapped('jersey-city');
 const ids=engine==='chrome'?['jersey-city','miami-beach','chicago','dubai','toronto','bayonne','lorenskog','madrid','london','seattle','new-york','los-angeles','san-francisco','boston']:['jersey-city'];
 for(const id of ids){
  await page.getByLabel('Map area',{exact:true}).selectOption(id);await mapped(id);await present();
  const state=await page.evaluate(()=>window.__skylineState());assert.equal(state.facade,'mapped-architectural-facades');assert.equal(state.reflectionBound,true);assert.ok(Math.abs(state.reflectionRatio-1.8)<.001);assert.equal(state.facadeVertices,state.vertices);assert.ok(state.facadeVertices>0);
  await page.screenshot({path:`${out}/${engine}-${id}.png`});results.push({id,passed:true,state});await page.keyboard.press('Escape');
 }
 if(engine==='chrome') assert.ok(new Set(results.map(r=>r.state.camera.map(n=>n.toFixed(2)).join(','))).size>4,'mapped sites must receive distinct visibility-aware camera poses');
 await page.getByLabel('Map area',{exact:true}).selectOption('jersey-city');await mapped('jersey-city');await present();
 await page.getByLabel('Presentation light',{exact:true}).selectOption('dusk');await waitForDusk(page);await page.waitForTimeout(800);await page.screenshot({path:`${out}/${engine}-dusk.png`});results.push({id:'dusk',passed:true});
 await page.evaluate(await fs.readFile('node_modules/axe-core/axe.min.js','utf8'));
 const violations=await page.evaluate(async()=> (await window.axe.run(document.querySelector('[aria-modal="true"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)})));
 assert.deepEqual(violations,[]);
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('[aria-modal="true"]').contains(document.activeElement)));}
 results.push({id:'presentation-accessibility',passed:true,violations});
 await page.getByLabel('Presentation light',{exact:true}).selectOption('golden');await page.waitForTimeout(1500);
 if(engine==='chrome'){
  for(const [width,height] of [[768,1024],[1280,900],[1920,1080]]) { await page.setViewportSize({width,height});await page.waitForTimeout(1500);await page.screenshot({path:`${out}/${engine}-${width}.png`});results.push({id:`viewport-${width}`,passed:true}); }
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1500);await page.screenshot({path:`${out}/${engine}-phone.png`});results.push({id:'phone',passed:true});await page.keyboard.press('Escape');
  if(!await page.getByLabel('Scene quality',{exact:true}).isVisible())await page.getByLabel('Scene presentation settings',{exact:true}).click();await page.getByLabel('Scene quality',{exact:true}).selectOption('low');await page.waitForTimeout(1500);await present();await page.screenshot({path:`${out}/${engine}-phone-low.png`});results.push({id:'phone-low',passed:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings.filter(w=>/shader.*error|GL_INVALID_OPERATION|VALIDATE_STATUS|sampler.*mismatch/i.test(w)),[]);
}finally{
 await fs.writeFile(`${out}/${engine}-results.json`,JSON.stringify({results,errors,warnings},null,2));await browser.close();
}
