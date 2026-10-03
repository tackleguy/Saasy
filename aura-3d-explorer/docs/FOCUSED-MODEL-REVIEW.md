# Focused skyline and Sketchfab review — 2026-10-02

Started 06:38:30 UTC. Requested duration: 25–45 minutes. Existing uncommitted skyline work is preserved. No Sketchfab API requests, downloads, asset replacements or attribution-record edits are authorized or performed.

## Chosen issue, recorded before implementation

**High: optional scenery load failures destroy the entire explorer.** `context/Water.tsx:Surface` and `context/IllustrativeCity.tsx:CityModels` use `useGLTF` within Suspense but have no error boundary. A local 404 for the ocean file or one of the generic city building files reaches the outer page error boundary. Chrome reproduction leaves **zero canvases** and the message “This page couldn’t load”. Both are recorded in `qa/focused-model-recovery/before/results.json` with screenshots. The named district loader catches its fetch errors and retains the canvas, so it is not the same failure path.

Chosen fix: isolate failures to those optional model groups and provide per-asset retry feedback outside the canvas. Preserve the project, camera, floor state and all unaffected scenery. Retry the exact loader cache key; do not silently replace an authored district with procedural scenery. This outranks cosmetic changes and stale assistant copy because the current failure removes the customer's entire working view.

## Skyline trace and findings

- `SiteContext` chooses Cinematic or Existing city from `CinematicContext`. City selection comes from `useExplorer`, through `ExplorerViewport` and `BuildingScene`; `CityPicker` receives the context-mode callback and distinguishes illustrative skylines from source-district coverage.
- `environment/City:City` calls `skylineGeometry:buildSkyline`, which uses `context/cityPlan:cityPlan` and `cityPresets`. The previous pass already added deterministic city-specific grids/heights/materials, at most six merged district batches, separate roofs, fixed-size facade UVs, and full district bounds in Low. These changes are not redone here.
- `cityPlan` uses a seeded generator and an ID-keyed cache. Clearings remove intersecting pieces and neighboring overlapping tiers in `buildSkyline`; this is footprint-based, not explicit lot ownership. Landmark clearings are approximate rectangles. The bridge's long deck is not represented by that square clearing footprint. These are follow-up geometry risks, not fixed in this pass.
- `context/City:District` loads a local standard or HQ GLB, preserves the source layout, applies measured ground alignment, and disposes owned resources on switch/cancellation. Quality changes currently clear the old district while loading its replacement, and a missing HQ file has no standard-file fallback. Manhattan's unlit-material replacement does not retain non-color textures for later disposal. These are follow-ups.
- `context/IllustrativeCity:CityModels` is the generic Existing city fallback, composed from seven installed building assets. It disposes cloned geometry/materials; the loader cache retains shared source textures. This is an illustrative assembly, not a real authored district.
- `environment/City` and `Landmarks` dispose generated geometry/materials and keep shared facade textures under their existing module cache. Previous screenshot evidence covers every preset, phone/night views and Chrome/Firefox/WebKit; this pass does not claim a new all-city visual audit.

## Sketchfab pipeline trace and findings

- `scripts/sketchfab.py:source` produces candidates with status, credit and license metadata; it filters CC BY/CC0 and candidate archive/face budgets. `download` rechecks the license, keeps tokens off the archive request, streams under 100 MB, and writes unreviewed local files. `install` validates UID/size/rotation, reads one zip entry without path extraction, validates a self-contained GLB, and writes installed manifest/credit records. This review does not execute sourcing, downloading or installation against project assets.
- `validate_glb` checks the GLB header, basic scene/mesh presence, external buffers/images, and unsupported decoder extensions. It is not a full glTF schema validator; the 150,000-face sourcing budget is not enforced at installation. Explicit 100 MB installs are supported. London and Miami contain well over one million unique mesh triangles. Standard/HQ variants preserve the same geometry counts; they primarily change textures.
- Local read-only inventory: **46 catalogue records, 27 installed assets, 19 candidate-only IDs, 35 local GLBs (eight HQ variants)**. All installed files and credit records exist; compared name/category/UID/creator/license/source/modification fields match. Every installed license is recorded as CC BY with creator/name/license/source fields. All credit license URLs use the legacy HTTP Creative Commons address; no records changed. This checks recorded metadata, not independent provenance or legal compliance.
- All 35 GLBs have matching GLB headers/lengths, embedded resources and no listed Draco/Basis/Meshopt decoder dependency. Total local GLB size is 471,261,024 bytes; this is the full inventory, not one page's transfer.
- `modelLibrary` imports only `installed-models.json`; the assistant cannot select candidate-only IDs through `libraryModel`. `actions:runAction` validates installed selection; `context:buildAssistantContext` offers installed representatives. Runtime loaders use local `/models/sketchfab/...` paths.
- `LibraryModel` catches errors but may silently show no outdoor model; furniture supplies a procedural fallback. Its boundary has no retry. `Water` and `IllustrativeCity` have no local error boundary (the chosen fix). `ImportedModel` receives caller-owned normalized geometry; it does not contact Sketchfab.
- `SiteFooter` renders installed creators, source links, licenses and modification notices. Metadata is rendered as text rather than HTML; the installer does not generally validate credit URL schemes beyond the model download URL. No credential contents were read or printed.
- **Accuracy follow-up:** `assistant/context.ts` and `api/assistant/route.ts` still say every named city loads an authored district. `actions.ts` city-model actions only set the city, not the scene's local context mode; water actions likewise describe the authored ocean while Cinematic is active. These contradict the now-correct visible picker label. They remain outside the selected resilience fix.

## Implementation and verification

Implemented one resilience fix:

- `src/components/3d/ContextModelRecovery.tsx`: a per-viewport provider renders recovery feedback outside the canvas; a local React error boundary isolates optional scenery. Retry clears the exact `useGLTF` resource key, including the seven-URL array for generic buildings, before remounting only that model group. Pending feedback disables duplicate retries. Component state mirrored through an effect survives StrictMode cleanup/setup replay. Unmount removes stale messages and retry closures; existing source-cache ownership is unchanged.
- `src/components/3d/context/Water.tsx`: wrap `Surface`; boats and project geometry remain available.
- `src/components/3d/context/IllustrativeCity.tsx`: wrap `CityModels`; all seven models retain their existing shared load and cleanup behavior.
- `src/components/3d/BuildingScene.tsx`: add the provider around the existing canvas and controls. Preserve all earlier skyline/shadow edits.
- `scripts/qa/context-model-recovery.mjs`: reproducible missing/corrupt/network-failure, repeated retry, simultaneous failure and context-unmount regressions.
- `scripts/qa/context-model-recovery-studio.mjs`: keyboard retry, delayed pending feedback, preserved explosion setting/canvas, and scoped axe regression.

Actual checks:

- Production webpack build and TypeScript passed (31 routes).
- Existing automated suite: 12/12 passed. Sketchfab Python tests: 6/6 passed using temporary synthetic fixtures, without changing project assets.
- Production Chrome, Firefox and Playwright WebKit: six recovery scenarios per engine passed, **18 total**. Each injected failure preserves the same canvas; retry fetches the local file again and restores the group. Failed retries become actionable again; independent failures retain independent controls; switching away clears feedback.
- Development Chrome with StrictMode: all six recovery scenarios also passed; raw results and captures are in `qa/focused-model-recovery/development/`.
- Studio Chrome: keyboard Enter activates retry, pending retry is disabled with visible feedback, and explosion remains 0.1 before and after. The same canvas survives. Axe reports **zero violations in the new recovery panel**, not a whole-site accessibility certification.
- Visually inspected desktop simultaneous failures, mobile corrupt-file feedback, and Studio keyboard-focus / pending / recovered screenshots. Feedback uses existing paper/ink/plaster tokens, visible focus, native 44px minimum buttons and live status; no additional animation or dependencies.
- Changed-component design detector and `git diff --check` passed. Asset, catalogue, installed-manifest, attribution and installer diffs remain empty.

React Three Fiber reports caught loader errors through the browser error channel. Tests retain those expected messages and reject unrelated page errors; they do not suppress logging or claim a zero-error console. Before-fix screenshots show the page error and no canvas; after-fix screenshots show the project and recovery feedback. WebKit is not native Safari or a physical iPhone. No new device/GPU performance, price or four-times-quality claim is made.

Evidence:

- [Before: missing water destroys the page](qa/focused-model-recovery/before/water-404.png)
- [After: two failures remain recoverable](qa/focused-model-recovery/after/chrome-simultaneous-failures-error.png)
- [Phone error feedback](qa/focused-model-recovery/after/chrome-water-corrupt-error.png)
- [Studio keyboard focus](qa/focused-model-recovery/after/chrome-studio-keyboard-error.png)
- [Studio retry in progress](qa/focused-model-recovery/after/chrome-studio-retrying.png)
- [Studio restored](qa/focused-model-recovery/after/chrome-studio-recovered.png)
- Raw results: `qa/focused-model-recovery/after/{chrome,firefox,webkit}-results.json` and `studio-results.json`.

Reproduce against a running local server:

```sh
QA_URL=http://127.0.0.1:3161 node scripts/qa/context-model-recovery.mjs
QA_URL=http://127.0.0.1:3161 QA_BROWSER=firefox node scripts/qa/context-model-recovery.mjs
QA_URL=http://127.0.0.1:3161 QA_BROWSER=webkit node scripts/qa/context-model-recovery.mjs
QA_URL=http://127.0.0.1:3161 node scripts/qa/context-model-recovery-studio.mjs
```

The existing full-product launch blockers remain open. This is a focused, verified scenery-recovery fix, not launch certification.

Final review timestamp: 2026-10-02 07:03:36 UTC.
