import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import fs from 'node:fs/promises';
const base=process.env.QA_URL||'http://localhost:3137';
const browser=await launch({chromePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',chromeFlags:['--headless','--no-first-run']});
const results=[];
try {
 for(const route of ['/', '/projects', '/developers', '/studio', '/engine']){
  const run=await lighthouse(base+route,{port:browser.port,output:'json',onlyCategories:['performance','accessibility','best-practices','seo'],logLevel:'error'});
  await fs.writeFile(`docs/qa/lighthouse-${route.replaceAll('/','_')||'home'}.json`,run.report);
  const scores=Object.fromEntries(Object.entries(run.lhr.categories).map(([k,v])=>[k,v.score*100]));
  results.push({route,scores,cls:run.lhr.audits['cumulative-layout-shift'].numericValue,lcp:run.lhr.audits['largest-contentful-paint'].numericValue});
  await fs.writeFile('docs/qa/lighthouse-summary.json',JSON.stringify(results,null,2));console.log(route,scores);
 }
}finally{await browser.kill()}

if (results.some(r => Object.values(r.scores).some(score => score < (["/studio", "/engine"].includes(r.route) ? 90 : 95)) || r.cls > 0)) process.exitCode = 1;
