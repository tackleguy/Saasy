import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright-core';
import {waitForDusk} from './scene-light.mjs';
const base=process.env.QA_URL||'http://127.0.0.1:3170';
const engine=process.env.QA_BROWSER||'chrome',out=process.env.QA_OUT||'docs/qa/sales-gallery';
const browser=await ({chrome:chromium,firefox,webkit}[engine]).launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
await fs.mkdir(out,{recursive:true});const results=[];
async function ready(p){await p.waitForSelector('canvas[data-graphics]',{timeout:90000});await p.waitForFunction(()=>!document.body.innerText.includes('Loading mapped context…'));await p.waitForTimeout(800);}
try{
for(const width of engine==='chrome'?[1440,390]:[1440]){
 const p=await browser.newPage({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});const errors=[],warnings=[];
 p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='warning'||m.type()==='error')warnings.push(m.text());});
 await p.goto(base,{waitUntil:'domcontentloaded'});await ready(p);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'home overflow');
 const order=await p.evaluate(()=>['portfolio','capabilities'].map(id=>document.querySelector('#'+id).getBoundingClientRect().top));assert.ok(order[0]<order[1],'project evidence must precede tool list');
 await p.screenshot({path:`${out}/${engine}-${width}-home.png`});
 await p.getByRole('button',{name:'Present building',exact:true}).click();const dialog=p.getByRole('dialog',{name:/3D model/});await dialog.waitFor();await p.waitForFunction(()=>{const c=document.querySelector('canvas');return Math.abs(c.getBoundingClientRect().height-innerHeight)<2&&Math.abs(c.getBoundingClientRect().width-innerWidth)<2;});await p.waitForTimeout(800);
 for(let i=0;i<18;i++){await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>document.querySelector('[aria-modal="true"]').contains(document.activeElement)),'presentation focus stays inside');}
 await p.screenshot({path:`${out}/${engine}-${width}-presentation.png`});
 await p.evaluate(await fs.readFile('node_modules/axe-core/axe.min.js','utf8'));const axe=await p.evaluate(async()=> (await window.axe.run(document.querySelector('[aria-modal="true"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)})));assert.deepEqual(axe,[]);
 if(width===1440){await p.getByLabel('Presentation light',{exact:true}).selectOption('dusk');await waitForDusk(p);await p.screenshot({path:`${out}/${engine}-${width}-dusk.png`});}
 await p.keyboard.press('Escape');assert.equal(await dialog.count(),0);const focusRestored=await p.getByRole('button',{name:'Present building',exact:true}).evaluate(e=>e===document.activeElement);assert.ok(focusRestored,'closing presentation restores focus');
 await p.goto(base+'/projects/meridian-tower#explore',{waitUntil:'domcontentloaded'});await ready(p);await p.locator('#explore').evaluate(e=>e.scrollIntoView({block:'start'}));await p.screenshot({path:`${out}/${engine}-${width}-project.png`});
 const sections=await p.evaluate(()=>['explore','availability','enquire','appraisal'].map(id=>document.querySelector('#'+id).getBoundingClientRect().top));assert.ok(sections.every((v,i)=>i===0||v>sections[i-1]));
 await p.getByRole('link',{name:'View unit availability',exact:true}).click();await p.screenshot({path:`${out}/${engine}-${width}-availability.png`});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'project overflow');
 const cell=p.getByRole('button',{name:/^Unit .*, Available,/}).first();
 assert.ok((await cell.innerText()).trim().length>0,'visible unit reference');
 if(width===390){assert.ok((await cell.boundingBox()).height>=44,'mobile unit target');const launcher=p.getByRole('button',{name:/Ask AURA/});assert.ok((await launcher.boundingBox()).y<64,'assistant is outside page controls');}
 const code=(await cell.getAttribute('aria-label')).match(/^Unit ([^,]+)/)[1];await cell.click();await p.getByRole('button',{name:'Enquire',exact:true}).click();await p.getByLabel('Unit (optional)',{exact:true}).waitFor();assert.equal(await p.getByLabel('Unit (optional)',{exact:true}).inputValue(),code);
 assert.equal(await p.getByLabel('Company',{exact:true}).count(),0,'buyer enquiry does not request company');await p.screenshot({path:`${out}/${engine}-${width}-enquiry.png`});
 await p.getByLabel('Full name',{exact:true}).fill('QA Example');await p.getByLabel('Email',{exact:true}).fill('qa@example.com');await p.getByRole('button',{name:'Book a viewing',exact:true}).focus();await p.keyboard.press('Enter');await p.getByText('Demo complete — no request sent.',{exact:true}).waitFor();
 await p.goto(base+'/studio',{waitUntil:'domcontentloaded'});await ready(p);assert.equal(await p.getByLabel('Scene quality',{exact:true}).isVisible(),false,'technical settings initially collapsed');await p.screenshot({path:`${out}/${engine}-${width}-studio.png`});if(width===390){assert.ok((await p.getByRole('group',{name:'Photo angles',exact:true}).boundingBox()).width>250,'phone photo angles have their own row');}await p.getByLabel('Scene presentation settings',{exact:true}).click();await p.getByLabel('Scene quality',{exact:true}).selectOption('medium');await p.getByRole('button',{name:'Site map',exact:true}).click();await p.getByRole('dialog',{name:'Project map location',exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(warnings.filter(w=>/shader.*error|GL_INVALID_OPERATION|sampler.*mismatch/i.test(w)),[],'no render pipeline errors');results.push({width,passed:focusRestored,focusRestored,axe,pageErrors:errors,console:warnings});await fs.writeFile(`${out}/${engine}-results.json`,JSON.stringify(results,null,2));await p.close();
}
}finally{await fs.writeFile(`${out}/${engine}-results.json`,JSON.stringify(results,null,2));await browser.close();}
