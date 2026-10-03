import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium, firefox, webkit} from 'playwright-core';

const base = process.env.QA_URL || 'http://127.0.0.1:3160';
const out = process.env.QA_OUT || 'docs/qa/focused-model-recovery/after';
const browserName = process.env.QA_BROWSER || 'chrome';
const browserType = {chrome:chromium, firefox, webkit}[browserName];
assert.ok(browserType, 'QA_BROWSER must be chrome, firefox or webkit');
await fs.mkdir(out,{recursive:true});
const browser = await browserType.launch({headless:true,...(browserName==='chrome'?{channel:'chrome'}:{})});
const water = '50f21b06c6e644e196b2ac828eda97dc';
const building = 'f943ba2828a64b7d858ee6e4bdacedc6';
const results=[];
const cases = [
 {name:'water-404',city:'new-york',ids:[water],labels:['water model'],kind:'404'},
 {name:'generic-building-404',city:'generic',ids:[building],labels:['surrounding buildings'],kind:'404'},
 {name:'water-corrupt',city:'new-york',ids:[water],labels:['water model'],kind:'corrupt'},
 {name:'water-network-failure',city:'new-york',ids:[water],labels:['water model'],kind:'network'},
 {name:'simultaneous-failures',city:'generic',ids:[water,building],labels:['water model','surrounding buildings'],kind:'404'},
];
try {
 for (const scenario of cases) {
  const page=await browser.newPage({viewport:{width:scenario.name==='water-corrupt'?390:1280,height:844},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  const blocked=new Set(scenario.ids),requests={};
  await page.route('**/models/sketchfab/**/*.glb',async route=>{
   const uid=route.request().url().split('/sketchfab/')[1].split('/')[0];
   requests[uid]=(requests[uid]||0)+1;
   if (!blocked.has(uid)) return route.continue();
   if(scenario.kind==='network')return route.abort('internetdisconnected');
   return route.fulfill({status:scenario.kind==='404'?404:200,contentType:'application/octet-stream',body:'Not a valid model'});
  });
  await page.goto(`${base}/render/aurelia-tower?city=${scenario.city}&graphics=1`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForSelector('canvas[data-graphics]',{timeout:120000});
  await page.getByLabel('Scene quality',{exact:true}).selectOption('low');
  const canvas=await page.locator('canvas').elementHandle();
  await page.getByLabel('Site context',{exact:true}).selectOption('existing');
  for(const label of scenario.labels)await page.getByRole('button',{name:`Retry ${label}`,exact:true}).waitFor({timeout:60000});
  assert.equal(await canvas.evaluate(el=>el===document.querySelector('canvas')),true,'failure must not remount the canvas');
  assert.equal(await page.getByText('This page couldn’t load',{exact:true}).count(),0);
  assert.deepEqual(errors.filter(e=>!scenario.ids.some(id=>e.includes(id) && e.includes('Could not load'))),[], 'unexpected runtime error');
  await page.screenshot({path:`${out}/${browserName}-${scenario.name}-error.png`});
  // A second failed request must restore the button, not leave a stuck spinner.
  if(scenario.name==='water-404'){
   await page.getByRole('button',{name:'Retry water model',exact:true}).press('Enter');
   await page.waitForFunction(()=>document.querySelector('[aria-label="Retry water model"]')?.disabled===false);
   assert.ok(requests[water]>=2,'retry must clear the cached rejection and issue another request');
  }
  for(let i=0;i<scenario.ids.length;i++){
   const uid=scenario.ids[i],label=scenario.labels[i];blocked.delete(uid);
   await page.getByRole('button',{name:`Retry ${label}`,exact:true}).press('Enter');
   await page.getByRole('button',{name:`Retry ${label}`,exact:true}).waitFor({state:'detached',timeout:90000});
   if(i+1<scenario.labels.length)assert.equal(await page.getByRole('button',{name:`Retry ${scenario.labels[i+1]}`,exact:true}).count(),1,'one recovery must not hide another failure');
  }
  assert.equal(await page.getByLabel('Background model recovery',{exact:true}).count(),0);
  assert.equal(await canvas.evaluate(el=>el===document.querySelector('canvas')),true,'recovery must keep the existing canvas');
  await page.waitForTimeout(1500);
  assert.deepEqual(errors.filter(e=>!scenario.ids.some(id=>e.includes(id) && e.includes('Could not load'))),[]);
  await page.screenshot({path:`${out}/${browserName}-${scenario.name}-recovered.png`});
  results.push({name:scenario.name,passed:true,errors,requests:Object.fromEntries(scenario.ids.map(id=>[id,requests[id]])),graphics:await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.graphics))});
  await page.close();
  await fs.writeFile(`${out}/${browserName}-results.json`,JSON.stringify(results,null,2));
  console.log(`${browserName}: ${scenario.name} passed`);
 }
 // Leaving a failed context must remove its recovery UI and stale retry handlers.
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route(`**/models/sketchfab/${water}/*.glb`,r=>r.fulfill({status:404,body:'Unavailable'}));
 await page.goto(`${base}/render/aurelia-tower?city=generic&graphics=1`,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('canvas[data-graphics]',{timeout:120000});
 await page.getByLabel('Scene quality',{exact:true}).selectOption('low');
 for(let i=0;i<3;i++){
  await page.getByLabel('Site context',{exact:true}).selectOption('existing');
  await page.getByRole('button',{name:'Retry water model',exact:true}).waitFor({timeout:60000});
  await page.getByLabel('Site context',{exact:true}).selectOption('cinematic');
  await page.getByLabel('Background model recovery',{exact:true}).waitFor({state:'detached'});
 }
 assert.deepEqual(errors.filter(e=>!(e.includes(water) && e.includes('Could not load'))),[]);
 results.push({name:'switch-away-cleans-failure-state',passed:true,errors});
 await page.close();
} finally {
 await fs.writeFile(`${out}/${browserName}-results.json`,JSON.stringify(results,null,2));
 await browser.close();
}
