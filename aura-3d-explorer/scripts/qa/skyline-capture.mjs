import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const phase = process.argv[2] || 'after';
const cities = ['generic','new-york','miami','los-angeles','chicago','san-francisco','seattle','boston','toronto','london','dubai'];
const dir = `docs/qa/skyline/${phase}`;
await fs.mkdir(dir,{recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
const results=[];
try {
for (const city of cities) {
 await page.goto(`http://127.0.0.1:3149/render/aurelia-tower?city=${city}&graphics=1&angle=waterfront`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForSelector('canvas[data-graphics]',{timeout:120000});
 await page.getByLabel('Site context',{exact:true}).selectOption('cinematic');
 await page.getByLabel('Scene quality',{exact:true}).selectOption('medium');
 await page.waitForTimeout(3500);
 await page.screenshot({path:`${dir}/${city}.png`});
 results.push({city,graphics:await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.graphics))});
 console.log(city);
}
await page.setViewportSize({width:390,height:844});
await page.getByLabel('Scene quality',{exact:true}).selectOption('low');
await page.waitForTimeout(3000);
await page.screenshot({path:`${dir}/mobile.png`});
await page.getByLabel('Sun',{exact:true}).selectOption('night');
await page.waitForTimeout(3000);
await page.screenshot({path:`${dir}/night.png`});
await fs.writeFile(`${dir}/results.json`,JSON.stringify({results,errors},null,2));
} finally { await browser.close(); }
