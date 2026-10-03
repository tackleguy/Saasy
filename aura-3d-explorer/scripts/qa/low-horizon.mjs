import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {waitForDusk} from './scene-light.mjs';
const out='docs/qa/skyline-detail/final',base=process.env.QA_URL||'http://127.0.0.1:3180';
async function horizonJump(path){
 const {data,info}=await sharp(path).removeAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,390);assert.equal(info.height,844);
 let last,max=0;
 // Clear sky at left, spanning the known horizon in the fixed Jersey phone pose.
 for(let y=185;y<285;y++){
  const rgb=[0,0,0];for(let x=20;x<70;x++)for(let c=0;c<3;c++)rgb[c]+=data[(y*info.width+x)*info.channels+c]/50;
  if(last)max=Math.max(max,...rgb.map((v,c)=>Math.abs(v-last[c])));last=rgb;
 }
 return max;
}
const baselineJump=await horizonJump('docs/qa/skyline-detail/low-before.png');assert.ok(baselineJump>10,'saved failing image must reproduce the seam');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[],warnings=[],results=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['warning','error'].includes(m.type()))warnings.push(m.text());});
async function present(){await page.getByRole('button',{name:'Present building',exact:true}).click();await page.waitForFunction(()=>document.querySelector('canvas')?.getBoundingClientRect().height===844);await page.waitForTimeout(1500);assert.equal(await page.locator('[data-cinematic-dock]').count(),0);}
try{
 await page.goto(base+'/studio?graphics=1');await page.waitForSelector('canvas[data-graphics]',{timeout:120000});await page.waitForTimeout(1800);await present();
 await page.screenshot({path:`${out}/chrome-phone.png`});results.push({id:'high-reference',passed:true});await page.keyboard.press('Escape');
 await page.getByLabel('Scene quality',{exact:true}).selectOption('low');await present();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.graphics).tier==='low');
 for(const light of ['golden','dusk']){
  await page.getByLabel('Presentation light',{exact:true}).selectOption(light);if(light==='dusk')await waitForDusk(page);await page.waitForTimeout(1000);
  const path=`${out}/chrome-phone-low${light==='dusk'?'-dusk':''}.png`;await page.screenshot({path});const jump=await horizonJump(path);
  results.push({id:`low-${light}`,passed:jump<=3,maximumAdjacentRowJump:jump});assert.ok(jump<=3,`${light} horizon seam: ${jump.toFixed(2)} color levels`);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(warnings.filter(w=>/shader.*error|GL_INVALID_OPERATION|VALIDATE_STATUS|sampler.*mismatch/i.test(w)),[]);
}finally{await fs.writeFile(`${out}/chrome-low-horizon.json`,JSON.stringify({baselineJump,results,errors,warnings},null,2));await browser.close();}
