import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
const b=await chromium.launch({channel:'chrome',headless:true});
const p=await b.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
const uid='372bc495b3a941308f4a3198bc45e17b',out='docs/qa/district-transition/before';
const errors=[];p.on('pageerror',e=>errors.push(String(e)));
try{
 await p.goto('http://127.0.0.1:3161/studio?graphics=1',{waitUntil:'domcontentloaded'});
 await p.waitForSelector('canvas[data-graphics]',{timeout:120000});
 await p.getByLabel('Scene quality',{exact:true}).selectOption('low');
 await p.getByLabel('Site context',{exact:true}).selectOption('existing');
 await p.getByText('Loading city model…',{exact:true}).waitFor({state:'visible',timeout:60000});
 await p.getByText('Loading city model…',{exact:true}).waitFor({state:'detached',timeout:90000});
 await p.waitForTimeout(1500);
 const before=await p.locator('canvas').evaluate(c=>JSON.parse(c.dataset.graphics));
 await p.screenshot({path:out+'/standard-loaded.png'});
 let release;const gate=new Promise(r=>{release=r;});
 await p.route(`**/models/sketchfab/${uid}/model-hq.glb`,async r=>{await gate;return r.fulfill({status:404,body:'Unavailable'});});
 await p.getByLabel('Scene quality',{exact:true}).selectOption('high');
 await p.getByText('Loading city model…',{exact:true}).waitFor();
 await p.waitForTimeout(1500);const during=await p.locator('canvas').evaluate(c=>JSON.parse(c.dataset.graphics));
 await p.screenshot({path:out+'/district-disappears-during-upgrade.png'});
 release();await p.getByRole('button',{name:'City model couldn’t load · Retry',exact:true}).waitFor({timeout:60000});
 await p.waitForTimeout(1500);const failed=await p.locator('canvas').evaluate(c=>JSON.parse(c.dataset.graphics));
 await p.screenshot({path:out+'/missing-hq-removes-district.png'});
 await fs.writeFile(out+'/results.json',JSON.stringify({before,during,failed,errors},null,2));console.log({before,during,failed,errors});
}finally{await b.close();}
