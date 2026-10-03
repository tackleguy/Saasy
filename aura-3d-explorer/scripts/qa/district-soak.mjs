import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.QA_URL || 'http://127.0.0.1:3162';
const output = 'docs/qa/district-transition/soak-results.json';
const uid = '372bc495b3a941308f4a3198bc45e17b';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const result = {
  started: new Date().toISOString(), url: base,
  scope: 'Five high-to-low district replacement cycles. Concurrent browser tests share the GPU. Counts are renderer resources, not heap bytes, GPU bytes or an FPS benchmark.',
  passed: false, samples: [], pageErrors: [], consoleWarnings: [],
};
// Preserve the current-build result and append the same resource exercise from
// the earlier production server, whose district objects have no QA names.
if (process.env.QA_BASELINE_ONLY === '1') {
  const previous = JSON.parse(await fs.readFile(output, 'utf8'));
  const baseline = { started: new Date().toISOString(), url: base, samples: [], pageErrors: [], consoleWarnings: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => baseline.pageErrors.push(String(error)));
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) baseline.consoleWarnings.push({ type: message.type(), text: message.text() }); });
    await page.goto(`${base}/render/aurelia-tower?city=new-york&graphics=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas[data-graphics]', { timeout: 120000 });
    const canvas = await page.locator('canvas').elementHandle();
    await page.getByLabel('Scene quality', { exact: true }).selectOption('low');
    let response = page.waitForResponse(r => r.url().endsWith(`/models/sketchfab/${uid}/model.glb`));
    await page.getByLabel('Site context', { exact: true }).selectOption('existing');
    await (await response).finished();
    await page.waitForTimeout(2500);
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const [tier, file] of [['high', 'model-hq.glb'], ['low', 'model.glb']]) {
        response = page.waitForResponse(r => r.url().endsWith(`/models/sketchfab/${uid}/${file}`));
        await page.getByLabel('Scene quality', { exact: true }).selectOption(tier);
        await (await response).finished();
        await page.waitForTimeout(2500);
        const graphics = await page.locator('canvas').evaluate(canvas => JSON.parse(canvas.dataset.graphics));
        const sameCanvas = await canvas.evaluate(canvas => canvas === document.querySelector('canvas'));
        baseline.samples.push({ cycle, tier, sameCanvas, graphics });
        console.log(`legacy resource cycle ${cycle + 1}/5 ${tier}: ${graphics.geometries} geometries / ${graphics.textures} textures`);
      }
    }
  } catch (error) {
    baseline.failure = String(error);
  } finally {
    baseline.finished = new Date().toISOString();
    previous.baseline = baseline;
    await fs.writeFile(output, JSON.stringify(previous, null, 2));
    await browser.close();
  }
  process.exit(baseline.failure ? 1 : 0);
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 844 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => result.pageErrors.push(String(error)));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) result.consoleWarnings.push({ type: message.type(), text: message.text() });
  });
  await page.goto(`${base}/render/aurelia-tower?city=new-york&graphics=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas[data-graphics]', { timeout: 120000 });
  await page.evaluate(uid => {
    const canvas = document.querySelector('canvas');
    const key = Object.keys(canvas).find(k => k.startsWith('__reactFiber$'));
    let fiber = canvas[key], root;
    for (let d = 0; fiber && d < 40 && !root; d++, fiber = fiber.return) {
      for (const f of [fiber, fiber.alternate]) {
        let hook = f?.memoizedState;
        for (let n = 0; hook && n < 100; n++, hook = hook.next) {
          const state = hook.memoizedState?.current;
          if (state?.scene?.isScene && state.gl?.domElement === canvas) { root = state; break; }
        }
      }
    }
    if (!root) throw new Error('R3F state unavailable for read-only QA probe');
    window.__districtSoakRead = () => {
      const hosts = [];
      root.scene.traverse(node => { if (node.name === `city-district:${uid}`) hosts.push(node); });
      return {
        sameCanvas: canvas === document.querySelector('canvas'), hosts: hosts.length,
        models: hosts.flatMap(host => host.children.map(child => ({ uuid: child.uuid, name: child.name }))),
        graphics: JSON.parse(canvas.dataset.graphics || 'null'),
        resources: { geometries: root.gl.info.memory.geometries, textures: root.gl.info.memory.textures, programs: root.gl.info.programs?.length },
      };
    };
    window.__districtSoakMonitor = { running: false, frames: 0, invalid: [] };
    window.__districtSoakStart = () => {
      const monitor = window.__districtSoakMonitor;
      monitor.running = true;
      const tick = () => {
        if (!monitor.running) return;
        monitor.frames++;
        const sample = window.__districtSoakRead();
        if (!sample.sameCanvas || sample.hosts !== 1 || sample.models.length !== 1) monitor.invalid.push(sample);
        requestAnimationFrame(tick);
      };
      tick();
    };
  }, uid);
  const waitDetail = detail => page.waitForFunction(detail => {
    const sample = window.__districtSoakRead();
    return sample.hosts === 1 && sample.models.length === 1 && sample.models[0].name.endsWith(`:${detail}`);
  }, detail, { timeout: 90000 });
  await page.getByLabel('Scene quality', { exact: true }).selectOption('low');
  await page.getByLabel('Site context', { exact: true }).selectOption('existing');
  await waitDetail('standard');
  await page.evaluate(() => window.__districtSoakStart());
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const [tier, detail] of [['high', 'high'], ['low', 'standard']]) {
      await page.getByLabel('Scene quality', { exact: true }).selectOption(tier);
      await waitDetail(detail);
      await page.waitForTimeout(1200);
      const sample = await page.evaluate(() => window.__districtSoakRead());
      assert.equal(sample.sameCanvas, true);
      assert.equal(sample.hosts, 1);
      assert.equal(sample.models.length, 1);
      assert.equal(sample.models[0].name, `city-model:${uid}:${detail}`);
      result.samples.push({ cycle, tier, ...sample });
      console.log(`district resource cycle ${cycle + 1}/5 ${tier}: ${JSON.stringify(sample.resources)}`);
    }
  }
  result.monitor = await page.evaluate(() => {
    window.__districtSoakMonitor.running = false;
    return window.__districtSoakMonitor;
  });
  assert.equal(result.monitor.invalid.length, 0, 'a rendered transition must retain exactly one authored district');
  assert.deepEqual(result.pageErrors, []);
  for (const tier of ['high', 'low']) {
    const settled = result.samples.filter(sample => sample.tier === tier && sample.cycle > 0);
    const expected = { geometries: settled[0].resources.geometries, textures: settled[0].resources.textures };
    for (const sample of settled) assert.deepEqual({ geometries: sample.resources.geometries, textures: sample.resources.textures }, expected, `${tier} resource counts changed after warm-up`);
  }
  result.passed = true;
} catch (error) {
  result.failure = String(error);
  throw error;
} finally {
  result.finished = new Date().toISOString();
  await fs.mkdir('docs/qa/district-transition', { recursive: true });
  await fs.writeFile(output, JSON.stringify(result, null, 2));
  await browser.close();
}
