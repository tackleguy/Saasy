import { chromium, firefox, webkit } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
const phase = process.env.QA_PHASE || 'before';
const base = process.env.QA_URL || 'http://localhost:3123';
const out = path.resolve('docs/qa', phase);
await fs.mkdir(out, {recursive:true});
const slugs = [...(await fs.readFile('src/content/projects.ts','utf8')).matchAll(/slug: "([^"]+)"/g)].map(m=>m[1]);
const routes = ['/', '/projects', '/developers', '/studio', '/engine', '/tour', ...slugs.map(s=>'/projects/'+s), ...slugs.map(s=>'/render/'+s)];
const engines = process.env.QA_ENGINES?.split(',') || ['chrome'];
const results=[];
for(const engine of engines){
 let browser;
 try { browser=await ({chrome:chromium,edge:chromium,firefox,webkit}[engine]).launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:engine==='edge'?{channel:'msedge'}:{})}); }
 catch(e){results.push({engine,blocked:String(e)});continue;}
 for(const width of [390,768,1280,1920]){
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  for(const route of routes){
   const page=await ctx.newPage(); const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push(m.type()+': '+m.text())});
   const record={engine,width,route,errors};
   try{
    const start=Date.now();const res=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(2200);record.status=res.status();record.elapsedMs=Date.now()-start;
    record.overflow=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
    record.screenshot=`${engine}-${width}-${route.replaceAll('/','_')||'home'}.png`;
    await page.screenshot({path:path.join(out,record.screenshot),fullPage:true,timeout:30000});
    try{await page.addScriptTag({path:'/private/tmp/aura-qa-tools/node_modules/axe-core/axe.min.js'});record.axe=await page.evaluate(async()=>{const r=await axe.run();return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});}catch(e){record.axeBlocked=String(e)}
   }catch(e){record.failure=String(e)}
   results.push(record);await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
   console.log(engine,width,route,record.status,record.axe?.map(x=>x.id).join(','),errors.length);
   await page.close();
  }
  await ctx.close();
 }
 await browser.close();
}
await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
