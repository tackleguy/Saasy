import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.QA_URL||'http://localhost:3137';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
const page=await context.newPage();
const results=[];
async function check(name,fn){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:String(e)});}}
await check('QA-002 API rejects null and arrays',async()=>{
 for(const route of ['/api/engine','/api/assistant'])for(const value of [null,[]]){
  const r=await context.request.post(base+route,{data:JSON.stringify(value),headers:{'content-type':'application/json'}});assert.equal(r.status(),400);
 }
});
await check('QA-004 headers and fresh nonces block injected scripts',async()=>{
 await page.route(base+'/developers',async route=>{const response=await route.fetch();const body=await response.text();await route.fulfill({response,body:body.replace('</head>','<script>window.__injected = true</script></head>')})});
 const r=await page.goto(base+'/developers');const headers=r.headers();assert.ok(headers['strict-transport-security']);assert.equal(headers['x-content-type-options'],'nosniff');
 const csp=headers['content-security-policy'];assert.ok(csp?.includes("'strict-dynamic'"));assert.ok(!csp.split(';').find(x=>x.includes('script-src')).includes('unsafe-inline'));
 assert.equal(await page.evaluate(()=>window.__injected),undefined);
 await page.unroute(base+'/developers');
 const r2=await page.reload();assert.notEqual(r2.headers()['content-security-policy'],csp);
});
await check('QA-005 demo form does not claim delivery',async()=>{
 await page.getByLabel('Full name').fill('QA Tester');await page.getByLabel('Work email').fill('qa@example.com');await page.getByLabel('Company',{exact:true}).fill('QA');
 await page.locator('form').getByRole('button',{name:'Request a demo'}).click();await page.getByText('Demo complete — no request sent.').waitFor();
});
await check('QA-003 scenario storage failure retains draft and gives recovery',async()=>{
 await page.goto(base+'/studio');await page.getByRole('button',{name:'Saved scenarios'}).click();await page.getByLabel('Scenario name').fill('Do not lose this');
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}});
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('alert').filter({hasText:'Changes could not be saved'}).waitFor();assert.equal(await page.getByLabel('Scenario name').inputValue(),'Do not lose this');
 await page.screenshot({path:'docs/qa/scenario-save-error.png'});
});
await check('QA-003 scenario persists across reload',async()=>{
 await page.reload();await page.getByRole('button',{name:'Saved scenarios'}).click();await page.getByLabel('Scenario name').fill('QA persisted scenario');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved scenarios updated'}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Saved scenarios'}).click();await page.getByText('QA persisted scenario',{exact:true}).waitFor();
});
await check('QA-007 corrupt scenario storage cannot crash drawer',async()=>{
 await page.evaluate(()=>localStorage.setItem('aura:scenarios:meridian-tower','null'));await page.reload();await page.getByRole('button',{name:'Saved scenarios'}).click();await page.getByRole('alert').filter({hasText:'could not be read'}).waitFor();
});
await check('QA-014 enquiry radio arrows do not submit form',async()=>{
 await page.goto(base+'/projects/meridian-tower');const group=page.getByRole('radiogroup',{name:'Enquiry type'});const radio=group.getByRole('radio').first();await radio.focus();await page.keyboard.press('ArrowRight');assert.equal(await group.getByRole('radio').nth(1).getAttribute('aria-checked'),'true');await page.getByLabel('Full name').waitFor();assert.equal(await group.getByRole('radio').nth(1).getAttribute('type'),'button');
});
await fs.writeFile('docs/qa/ui-regressions.json',JSON.stringify(results,null,2));console.log(results);await browser.close();if(results.some(x=>!x.pass))process.exitCode=1;
