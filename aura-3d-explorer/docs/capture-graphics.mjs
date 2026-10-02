import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=process.env.GRAPHICS_URL||'http://localhost:3147';
const out=new URL('./screens/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
let page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push(m.type()+': '+m.text());});
await page.goto(base+'/render/aurelia-tower?city=generic&graphics=1',{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForSelector('canvas[data-graphics]',{timeout:120000});
await page.getByLabel('Site context',{exact:true}).selectOption('cinematic');
await page.getByLabel('Scene quality',{exact:true}).selectOption('high');
await page.waitForTimeout(6000);
await page.mouse.move(1590,990);
await page.waitForFunction(()=>{const c=document.querySelector('canvas');if(!c?.dataset.graphics)return false;const g=JSON.parse(c.dataset.graphics);return Object.values(g.towerMeshes).every(n=>n<45);},{},{timeout:60000});
const results=[];
const capture=async(name)=>{
 await page.mouse.move(1590,990);await page.waitForTimeout(2500);
 await page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});
 results.push({name,...await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.graphics))});
 await fs.writeFile(new URL('results.json',out),JSON.stringify({results,errors},null,2));
};
if(process.env.GRAPHICS_STEP){await capture(process.env.GRAPHICS_STEP);}
else {
 for(const time of ['dawn','golden','dusk','night']){await page.getByLabel('Sun',{exact:true}).selectOption(time);await capture('sun-'+time);}
 await page.getByLabel('Sun',{exact:true}).selectOption('golden');
 for(const angle of ['street','waterfront','aerial','podium','crown']){await page.getByLabel('Photo angle',{exact:true}).selectOption(angle);await capture('angle-'+angle);}
 for(const tier of ['medium','low']){await page.getByLabel('Scene quality',{exact:true}).selectOption(tier);await capture('quality-'+tier);}
 await page.setViewportSize({width:390,height:844});await capture('mobile-low');
 if(process.env.GRAPHICS_SOAK==='1'){
  await page.close();
  page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'no-preference'});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push(m.type()+': '+m.text());});
  await page.goto(base+'/render/aurelia-tower?city=generic&graphics=1',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForSelector('canvas[data-graphics]',{timeout:120000});
  await page.getByLabel('Site context',{exact:true}).selectOption('cinematic');
  await page.getByLabel('Scene quality',{exact:true}).selectOption('high');
  await page.mouse.move(1590,990);await page.waitForTimeout(30000);
  const samples=[];
  for(let i=0;i<=10;i++){
   samples.push({minute:i,...await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.graphics))});
   await fs.writeFile(new URL('soak.json',out),JSON.stringify(samples,null,2));
   if(i<10)await page.waitForTimeout(60000);
  }
 }
}
await fs.writeFile(new URL('results.json',out),JSON.stringify({results,errors},null,2));
console.log(JSON.stringify({results,errors},null,2));await browser.close();
