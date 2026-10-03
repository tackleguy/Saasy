import {chromium, firefox, webkit} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='docs/qa/skyline/verification';await fs.mkdir(dir,{recursive:true});
const results=[];
for(const [name,type,options] of [['chrome',chromium,{channel:'chrome'}],['firefox',firefox,{}],['webkit',webkit,{}]]){
 const browser=await type.launch({headless:true,...options});
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
 const errors=[], warnings=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['warning','error'].includes(m.type()))warnings.push(m.text());});
 try{
 await page.goto('http://127.0.0.1:3150/render/aurelia-tower?city=new-york&graphics=1',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('canvas[data-graphics]',{timeout:120000});
 await page.getByLabel('Scene quality',{exact:true}).selectOption('medium');
 await page.waitForTimeout(6000);
 const measurements=[];
 for(const width of [390,768,1280,1920]){
  await page.setViewportSize({width,height:width===390?844:800});await page.waitForTimeout(1500);
  await page.screenshot({path:`${dir}/${name}-${width}.png`});
  measurements.push({width,graphics:await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.graphics))});
 }
 const skylineRequests=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/\/models\/|sketchfab|\.glb/.test(r.name)).map(r=>r.name));
 assert.equal(skylineRequests.length,0,'cinematic backdrop must not download city models');
 assert.deepEqual(errors,[]);
 results.push({browser:name,measurements,errors,warnings,skylineModelRequests:skylineRequests});
 if(name==='chrome'){
  await page.setViewportSize({width:1280,height:800});
  await page.goto('http://127.0.0.1:3150/studio',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('canvas[data-graphics]',{timeout:120000});
  await page.getByLabel('City backdrop',{exact:true}).selectOption('new-york');
  await page.getByText('Illustrative skyline',{exact:true}).waitFor();
  await page.getByLabel('Site context',{exact:true}).selectOption('existing');
  await page.getByRole('link',{name:/Lower Manhattan/}).waitFor();
  assert.equal(await page.getByText('Illustrative skyline',{exact:true}).count(),0);
  await page.getByLabel('Site context',{exact:true}).selectOption('cinematic');
  await page.getByText('Illustrative skyline',{exact:true}).waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({path:`${dir}/studio.png`});
  assert.deepEqual(warnings.filter(w=>/GL_INVALID_OPERATION|sampler type/.test(w)),[], "context transitions must initialize shadow textures before reflection draws");
 }
 console.log(`${name} passed`);
 }finally{await browser.close();await fs.writeFile(`${dir}/results.json`,JSON.stringify(results,null,2));}
}
