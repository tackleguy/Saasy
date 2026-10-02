import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
const b=await chromium.launch({channel:'chrome',headless:true});
const p=await b.newPage({viewport:{width:1280,height:900}});const base=process.env.QA_URL||'http://localhost:3140';
const start=Date.now();await p.goto(base+'/studio',{waitUntil:'domcontentloaded'});
const samples=[];
try{await p.waitForFunction(()=>document.querySelector('canvas')?.dataset.graphics,{timeout:60000});samples.push({firstTelemetryMs:Date.now()-start,note:'First telemetry follows a one-second sampling window; not exact first frame.'});
for(let i=0;i<5;i++){await p.waitForTimeout(1100);samples.push({mode:'idle',data:await p.locator('canvas').first().getAttribute('data-graphics')})}
const box=await p.locator('canvas').first().boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();
for(let i=0;i<5;i++){await p.mouse.move(box.x+box.width/2+20*i,box.y+box.height/2,{steps:10});await p.waitForTimeout(1100);samples.push({mode:'orbit',data:await p.locator('canvas').first().getAttribute('data-graphics')})}
await p.mouse.up();const cdp=await p.context().newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await p.waitForTimeout(3000);samples.push({mode:'4x CPU throttle (not GPU throttle)',data:await p.locator('canvas').first().getAttribute('data-graphics')});
}catch(e){samples.push({error:String(e)})}
await fs.writeFile('docs/qa/graphics.json',JSON.stringify(samples,null,2));console.log(samples);await b.close();
