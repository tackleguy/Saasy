# Authored district loading review — 2026-10-02

Started 07:07:33 UTC. Focused 30-minute pass, preserving previous skyline and optional-model recovery changes. No Sketchfab API calls, new downloads, asset replacements, or attribution/license edits.

## Finding recorded before implementation

**High — quality changes remove a usable authored district.** `src/components/3d/context/City.tsx:District` disposes its current scene in effect cleanup and clears `object` before loading the new quality variant. Missing/corrupt HQ never falls back to the installed standard variant. Chrome reproduction loaded Standard Manhattan, held the HQ request, then returned 404: the district vanished while loading and remained absent after failure. The explorer itself survived. Evidence: `qa/district-transition/before/` (loaded, pending and failed screenshots plus renderer observations).

Chosen fix: make replacement atomic; retain the current district while fetching; fall back only to the same UID's standard asset when HQ fails; reject and dispose stale results; keep retry and detail-level feedback accurate. Do not change model geometry, geographical coverage, lighting, or licenses.

## Review scope and remaining findings

- Procedural implementation at the start of this pass: `environment/City:City` uses `skylineGeometry:buildSkyline`, seeded `context/cityPlan:cityPlan`, `cityPresets` and `Landmarks`. Its tests cover distinct deterministic presets, low-tier bounds, six merged finish batches, fixed facade scale and separate roofs. Approximate clearing rectangles, especially the long bridge deck, remain follow-ups in that implementation. During this pass, concurrent commit `be717f5` switched `environment/Site` to `context/IllustrativeCity`; the procedural implementation remains in the tree but is no longer the active Cinematic city renderer. This concurrent change is preserved and is not attributed to the district-loading fix.
- Authored path: `SiteContext` chooses `context/City:District` via `cityModels`, or the generic seven-model `IllustrativeCity`. The previous `ContextModelRecovery` change already handles optional water/building failures. CityPicker distinguishes authored source districts from Cinematic illustrative assemblies; the concurrent commit adds assembled-model credits. The selected issue concerns only authored district variant replacement.
- Sketchfab path: candidate sourcing, local download/install validation, GLB decoding constraints, manifest selection, assistant action routing and footer credit rendering were re-reviewed. Inventory remains 46 catalogue records, 27 installed assets and 19 candidate-only IDs. Installed assets and attribution fields match. Runtime loads local files and candidate-only IDs are not offered as installed models. Recorded licenses are CC BY; this is a metadata consistency check, not independent provenance verification.
- Remaining pipeline issues: the install step does not enforce the sourcing face budget; large district geometry remains expensive. Assistant context/API wording and city/water action confirmations still imply authored scenery when Cinematic is active. Those are separate follow-ups.
- Correction to prior report: Manhattan unlit-material adaptation could orphan non-color textures in future models, but both installed Manhattan variants currently have only one base-color texture. No current leak was reproduced. Resource disposal deduplicates textures but not shared bitmap sources; ownership will be reviewed with the chosen lifecycle change.
- `docs/GRAPHICS.md` contains historical skyline details superseded by `docs/SKYLINE-QUALITY.md`; this pass avoids unrelated documentation rewrites.

## Implementation and verification

Implementation is complete. The final production verification below includes the phone layout correction. The production build includes concurrent commit `be717f5` plus existing and current uncommitted work. Before captures used the preceding production snapshot; the authored district load failure is unchanged by that concurrent Cinematic-only routing change.

Changed for this pass: `districtLoadController.ts`, authored `context/City.tsx`, `cityModelStatus.ts`, `CityPicker.tsx`, `package.json` test command, `district-loading.test.ts`, browser regression/evidence files. No third-party asset or attribution changes.

Final production Chrome, Firefox and Playwright WebKit each pass eight cases (**24 total**), including frame-by-frame continuity, initial HQ 404/corrupt/network fallback, both variants failing then retry, failed downgrade retention, rapid reversal, and city change during load. In final Chrome, all 120 sampled upgrade/retry frames retain exactly one district; Firefox and WebKit independently assert the same invariant. All 29 tracked resources on the retired district emit exactly one dispose event, and none are disposed while retained. Scoped CityPicker axe reports no violations.

Default automated suite passes 21/21 tests (nine new lifecycle cases); Python installer suite passes 6/6; TypeScript and isolated production webpack build pass. Existing Three.js CommonJS test warning remains.


## Repeated-switch diagnostic and limitations

Five High→Low cycles retained the same canvas and exactly one authored district across **1,361 sampled frames**. Texture counts stayed stable at High 87 / Low 54. Whole-renderer geometry counts increased **391, 393, 395, 397, 399**, so the resource-stability assertion remains failed. The preceding production build on port 3161 reproduced the identical geometry series (textures High 89 / Low 56). This growth predates the fix; its full source is not established by this pass. Code inspection found that `context/WaterReflector.tsx` disposes BlurPass render targets and material but omits the owned `blurPass.screen.geometry` created in Drei’s BlurPass constructor. That is a concrete follow-up cleanup gap and a possible contributor, not proof of the full two-geometry increase. Do not report a leak-free renderer. Raw evidence, including the failure and before-build comparison: `qa/district-transition/soak-results.json`; reproducible diagnostic: `scripts/qa/district-soak.mjs`.

The phone screenshot review found the new feedback initially pushed Capture offscreen. CityPicker width and child wrapping were constrained to retain the adjacent action. The final browser suite passes explicit assertions that Capture stays inside the 390px viewport and that the page has no horizontal overflow in all three engines. Desktop and phone confirmation screenshots were visually inspected; keyboard focus remains visible.

Current limitations: native Safari/Edge and physical devices were not verified in this focused pass; Playwright WebKit is an engine check. No GPU-byte or browser-heap measurement, target-device FPS certification, all-page accessibility audit or customer price claim is made. The upstream Three.Clock browser warning and Three.js CommonJS test warning are retained. Fetch/parse failures are caught as expected state; failed HTTP requests still appear in developer network logs. The shared city-status store remains global by UID; simultaneous instances of the same district in one document are outside this pass.

The user’s reference sites emphasize easy movement through property media: [Zillow’s linked tours and floor plans](https://www.zillow.com/news/zillow-launches-next-generation-3d-tours/) and [Homes.com’s guided 3D tours](https://www.homes.com/product-release/). These are presentation references, not evidence of equivalent rendering fidelity or a comparative quality score. This fix improves continuity during model loading; it does not establish either four-times product ambition.

## Final implementation details

- `src/lib/districtLoadController.ts:DistrictLoadController` owns one active district and a cancellable replacement. An aborted generation cannot attach, trigger a fallback or change status. Late successful parses are disposed. Failed HQ reuses an already loaded standard district without another download; otherwise it tries that district’s standard file. Successful replacement detaches the old graph before releasing its resources.
- `src/components/3d/context/City.tsx:District` retains the same React host group and delegates only its imperative authored-model children to the controller. Model alignment, material adaptation, raycast policy and lighting remain unchanged. Context/city unmount aborts work and removes owned geometry.
- `src/lib/cityModelStatus.ts` and `src/components/ui/CityPicker.tsx` expose loading, updating, fallback and retained states. Feedback identifies the visible detail and provides keyboard retry with visible focus and a 44px minimum target. Width constraints preserve the adjacent Capture action on phones.
- `scripts/qa/district-loading.test.ts` supplies nine deferred lifecycle regressions. `package.json` includes every QA test file in `npm test`, so these run by default alongside the original twelve.

**Final development verification:** all eight browser cases pass in Chrome with StrictMode, including city-change cancellation, actual retired-resource disposal and the phone overflow assertion. Results: `qa/district-transition/development-final/chrome-results.json`. Initial StrictMode replay cancels one initial request; the test verifies that HQ failure adds zero further standard downloads relative to the loaded baseline.

**City coverage:** all ten installed mappings passed on the final production build. Eight textured cities each requested an intercepted HQ file and exactly one standard file with the same UID. Miami and Dubai requested no HQ file. Every case retained its original canvas and scene and attached exactly one standard district, with zero page exceptions and zero external requests. Evidence: `qa/district-transition/city-coverage-results.json`.

**Prior-fix regression:** the earlier Studio water-recovery test passed on the final build: keyboard retry, pending feedback, same canvas and explosion value 0.1 preserved. Its expected injected loader error remains recorded, with zero unrelated page errors. The scoped recovery-panel axe check also passed. Evidence remains in `qa/focused-model-recovery/after/studio-results.json` (port 3163).

## Evidence and reproduction

- [Before: standard district visible](qa/district-transition/before/standard-loaded.png)
- [Before: HQ failure removes the district](qa/district-transition/before/missing-hq-removes-district.png)
- [After: district remains during replacement](qa/district-transition/final/chrome-pending-retains-district.png)
- [After: standard fallback and keyboard retry](qa/district-transition/final/chrome-fallback-keyboard.png)
- [After: phone recovery with Capture visible](qa/district-transition/final/chrome-initial-hq-corrupt.png)
- [After: HQ retry succeeds](qa/district-transition/final/chrome-atomic-upgrade-and-retry.png)
- Browser result files: `qa/district-transition/final/{chrome,firefox,webkit}-results.json`.

```sh
npm test
python3 -m unittest discover -s scripts -p test_sketchfab.py
npm run lint
QA_URL=http://127.0.0.1:3163 node scripts/qa/district-transitions.mjs
QA_URL=http://127.0.0.1:3163 QA_BROWSER=firefox node scripts/qa/district-transitions.mjs
QA_URL=http://127.0.0.1:3163 QA_BROWSER=webkit node scripts/qa/district-transitions.mjs
QA_URL=http://127.0.0.1:3163 node --import tsx scripts/qa/district-city-coverage.mjs
# Diagnostic intentionally fails while the existing geometry growth remains:
QA_URL=http://127.0.0.1:3163 node scripts/qa/district-soak.mjs
```

Production build: `AURA_BUILD_DIR=.next-qa-district-final npm run build -- --webpack` (31 routes; compiled and TypeScript passed). Preview: `http://127.0.0.1:3163/studio`.

The changed-component design scan, JavaScript syntax checks and `git diff --check` pass. No dependencies, GLBs, candidate/installed manifests, attribution files or installer behavior were changed. Next.js updated its generated type-path files for the isolated build directories. Existing user work and concurrent commit `be717f5` are preserved. No commit or push was performed in this pass.

Completed 2026-10-02 07:32:43 UTC; elapsed 25 minutes 10 seconds. Final local Studio returned HTTP 200.
