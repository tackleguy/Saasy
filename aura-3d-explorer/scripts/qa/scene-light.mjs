/** Wait for the renderer's light, not just a changed select value. */
export async function waitForDusk(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    let fiber = canvas?.[Object.keys(canvas).find(key => key.startsWith('__reactFiber$'))], root;
    for (let i = 0; fiber && i < 40 && !root; i++, fiber = fiber.return) {
      for (const branch of [fiber, fiber.alternate]) {
        let hook = branch?.memoizedState;
        for (let j = 0; hook && j < 100; j++, hook = hook.next) {
          const state = hook.memoizedState?.current;
          if (state?.scene?.isScene && state.gl?.domElement === canvas) { root = state; break; }
        }
      }
    }
    if (!root) return false;
    let ready = false;
    root.scene.traverse(node => { if (node.isDirectionalLight && Math.abs(node.intensity - .65) < .005) ready = true; });
    return ready && root.scene.background?.getHexString() === '465669';
  }, null, {timeout: 30000});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
