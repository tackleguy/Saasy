import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});const errors=[];
p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text())});
for(const route of ['/studio','/engine']){
 await p.goto((process.env.QA_URL||'http://localhost:3138')+route);await p.waitForTimeout(4000);
 await p.evaluate(await fs.readFile('node_modules/axe-core/axe.min.js','utf8'));
 console.log(route,await p.evaluate(async()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,axe:(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)}))})),errors.splice(0));
 await p.screenshot({path:`docs/qa/pass2-${route.slice(1)}.png`,fullPage:true});
}
await b.close();
