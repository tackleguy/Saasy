# Reproduce AURA QA

From the app root:

1. `npm ci`
2. `npm test` and `npm run lint`
3. `npm run build` then `npm run start -- --port 3139`
4. `QA_URL=http://localhost:3139 npm run qa:flows`
5. `QA_URL=http://localhost:3139 QA_PHASE=verification QA_ENGINES=chrome,firefox,webkit,edge npm run qa:browser`
6. Stop other browser workloads, then `QA_URL=http://localhost:3139 npm run qa:lighthouse`
7. `npm audit --json`

Chrome and Edge channels require installed browsers. Install matching test engines with `npx playwright-core install firefox webkit`. Missing engines are recorded as blocked. WebKit does not certify Safari or iOS Safari; desktop mobile emulation does not certify physical Android Chrome or a 2017 phone.

The browser runner enumerates every project and render slug from project content and checks 390, 768, 1280 and 1920 widths. `QA_ROUTES`, `QA_WIDTHS`, `QA_ENGINES` can narrow a diagnostic run; the output must then be labelled partial. Screenshots and axe findings go to `docs/qa/<phase>/`. First-pass captures on port 3123 are invalid styled baselines because that pre-existing server had missing build assets.

The scripts intentionally do not manipulate real customer data. The app has no authentication, organization store, reservation or share-token system to test. No tests invent those systems or label their absence a pass. Lighthouse is local, simulated mobile, and not a production-host or GPU benchmark.
