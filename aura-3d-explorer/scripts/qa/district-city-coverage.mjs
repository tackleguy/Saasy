import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import cityModule from '../../src/lib/cityModels.ts';

const { CITY_MODELS } = cityModule;
const base = process.env.QA_URL || 'http://127.0.0.1:3163';
const output = 'docs/qa/district-transition/city-coverage-results.json';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
await fs.mkdir('docs/qa/district-transition', { recursive: true });

async function installProbe(page, uid) {
  await page.evaluate(uid => {
    const canvas = document.querySelector('canvas');
    const key = Object.keys(canvas).find(key => key.startsWith('__reactFiber$'));
    let fiber = canvas[key], root;
    for (let depth = 0; fiber && depth < 40 && !root; depth++, fiber = fiber.return) {
      for (const candidate of [fiber, fiber.alternate]) {
        let hook = candidate?.memoizedState;
        for (let n = 0; hook && n < 100; n++, hook = hook.next) {
          const state = hook.memoizedState?.current;
          if (state?.scene?.isScene && state.gl?.domElement === canvas) { root = state; break; }
        }
      }
    }
    if (!root) throw new Error('R3F renderer state unavailable');
    window.__cityCoverageRead = () => ({
      canvasPreserved: canvas === document.querySelector('canvas'),
      scene: root.scene.uuid,
      models: root.scene.getObjectByName(`city-district:${uid}`)?.children.map(object => ({ name: object.name, uuid: object.uuid })) || [],
    });
  }, uid);
}

try {
  for (const [city, model] of Object.entries(CITY_MODELS)) {
    const started = Date.now();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const errors = [], requests = [], external = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith(`/models/sketchfab/${model.uid}/`)) requests.push(url.pathname);
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin && !['data:', 'blob:'].includes(url.protocol)) {
        external.push(url.origin); return route.abort();
      }
      if (url.pathname === `/models/sketchfab/${model.uid}/model-hq.glb`) return route.fulfill({ status: 404, body: 'QA: high detail unavailable' });
      return route.continue();
    });
    try {
      await page.goto(`${base}/render/aurelia-tower?city=${city}&graphics=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('canvas[data-graphics]', { timeout: 30000 });
      await installProbe(page, model.uid);
      const before = await page.evaluate(() => window.__cityCoverageRead());
      await page.getByLabel('Scene quality', { exact: true }).selectOption('high');
      await page.getByLabel('Site context', { exact: true }).selectOption('existing');
      await page.waitForFunction(uid => window.__cityCoverageRead().models.some(model => model.name === `city-model:${uid}:standard`), model.uid, { timeout: 45000 });
      const after = await page.evaluate(() => window.__cityCoverageRead());
      assert.equal(after.models.length, 1);
      assert.equal(after.models[0].name, `city-model:${model.uid}:standard`);
      assert.equal(after.canvasPreserved, true);
      assert.equal(after.scene, before.scene);
      assert.equal(requests.filter(path => path.endsWith('/model.glb')).length, 1);
      assert.equal(requests.filter(path => path.endsWith('/model-hq.glb')).length, model.textured ? 1 : 0);
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      results.push({ city, uid: model.uid, textured: model.textured, passed: true, requests, canvasPreserved: after.canvasPreserved, scene: after.scene, models: after.models, errors, external, elapsedMs: Date.now() - started });
      console.log(`${city}: same-source standard district passed`);
    } catch (error) {
      results.push({ city, uid: model.uid, passed: false, requests, errors, external, error: String(error), elapsedMs: Date.now() - started });
      throw error;
    } finally {
      await fs.writeFile(output, JSON.stringify(results, null, 2) + '\n');
      await page.close();
    }
  }
} finally {
  await fs.writeFile(output, JSON.stringify(results, null, 2) + '\n');
  await browser.close();
}
