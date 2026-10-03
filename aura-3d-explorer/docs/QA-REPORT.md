# AURA QA report

Audit started 2026-10-01 (America/Los_Angeles). Status: **NOT launch approved**.

This is the findings ledger, recorded before product fixes. Existing uncommitted work is preserved. Passing a subset of tests does not establish a zero-finding full pass.

## Initial findings, severity-ranked

| ID | Severity | Finding and evidence | Required outcome |
|---|---|---|---|
| QA-001 | P0 | Requested sign-up, create project, share-token, reservation, organization isolation and XLSX flows do not exist in the route/component inventory. Data is static project content; scenarios use localStorage. | Remains blocked under the no-new-features constraint; cannot certify these flows or tenant isolation. |
| QA-002 | P1 | Both API POST handlers dereference parsed JSON without validating an object. `null` causes an exception. Body limits are checked only after full allocation. | Bounded streamed parsing, shape validation and regression tests. |
| QA-003 | P1 | ScenarioDrawer suppresses storage write failures, then displays the scenario as saved. Reload loses it. Parsed storage is blindly cast to Scenario[]. | Retain draft on failure; report actionable error; validate stored data before use. |
| QA-004 | P1 | No configured CSP, HSTS or defensive response headers in next.config.mjs. Inference endpoints have no authentication/rate controls. | Verify deployed headers and protect inference access; no invented tenant-security claim. |
| QA-005 | P1 | Demo/enquiry forms claim “we’ll be in touch” or “request received” despite sending nothing. | Honest status that does not imply delivery; actual delivery remains unimplemented. |
| QA-006 | P2 | fmtMoney(-0.1) returns `−$0`; full format discards cents. | Consistent nonfinite/negative-zero handling and cent-preserving full precision. |
| QA-007 | P1 | Scenario load lacks input schema/range checks; malformed finite/NaN/shape values can reach finance engine. | Reject invalid scenarios and protect calculations. |
| QA-008 | P1 | Requested physical devices, GPU throttling, Safari/Edge/Firefox and performance budgets lack a reproducible test setup. Browser caches do not match installed Playwright. | Record actual tested engines and unavailable targets; emulation is not physical-device proof. |
| QA-009 | P2 | Chart CSS removes all focus outlines, including keyboard focus. | Preserve keyboard-visible focus. |

## Baseline evidence

- `npm run lint`: passed TypeScript check before edits.
- `npm audit --json`: passed, zero known advisories (278 dependencies reported). First sandboxed attempt failed DNS; network-enabled retry succeeded.
- User has extensive existing changes; no reset or cleanup performed.
- Design authority: existing paper/stone/ink tokens, Inter and Instrument Serif. Refinements preserve those choices.
- Browser/visual, accessibility, finance and production measurements: pending. No scores fabricated.

## Coverage policy

Every requested check remains open until demonstrated. Real Safari is not equivalent to Playwright WebKit; mobile emulation is not an iOS/Android device. GPU performance on this host cannot certify a mid-range laptop or 2017 phone. Missing features will not be invented to satisfy a test.

### Browser findings recorded before their fixes

- **QA-010 P1:** Axe detects `aria-prohibited-attr` on RangeSlider wrappers on Studio and project pages. The Radix root is a generic span; the named thumb already supplies slider semantics.
- **QA-011 P1:** Engine upload input has no accessible name (`label` violation).
- **QA-012 P2:** Studio panels skip from h1 to h3 (`heading-order`). Tour lacks main landmark and h1. Baseline: `docs/qa/before/results.json`.
- **QA-013 P1:** Baseline browser console reports repeated resource 404s. Must identify failed URLs and validate on a fresh production build.
- **QA-014 P1:** SegmentedControl radio buttons default to submit inside enquiry forms and lack arrow-key radio navigation. Changing enquiry intent can submit the form. Add explicit button type and roving keyboard focus.

**Baseline environment correction:** inspected the first Studio screenshot and found the pre-existing server on port 3123 serves stale HTML with missing CSS/JS (404). Its captures prove a broken local build, not the current styled interface. That run was stopped; do not use its axe results as styled contrast evidence. A fresh isolated build will provide the valid baseline. Semantic defects identified in source remain valid.

- **QA-015 P0:** Fresh production compilation failed at BuildingScene.tsx:397: numeric `PCFSoftShadowMap` is not assignable to Fiber Canvas `shadows`. This appeared during concurrent rendering edits. Preserve the intended soft-shadow mode using the supported `"soft"` value, then rebuild.

### Fix decisions

- Money: retain compact dashboard presentation, show cents when full precision is requested, and normalize values rounding to zero.
- Forms remain explicit previews; no new submission integration was added.
- Script CSP uses unpredictable per-request nonces (no production `unsafe-inline` or `unsafe-eval` in script-src). Styles retain inline permission required by Three/Radix/Motion. Server pages become request-rendered; static exports need equivalent host security configuration and are not certified by these headers.

### Regression results (first code pass)

`docs/qa/regressions.txt`: 8/8 tests pass. Includes malformed/chunked oversized API input, scenario write failures and read validation, money formatting, independent one-floor arithmetic ($1,000,000 revenue; $361,000 cost; $639,000 profit), all projects at default/min/max slider settings, and negative-profit/zero-revenue cases. This proves those cases, not every requested finance edge. In particular zero sales absorption is outside the current slider range and is not certified.

Mechanical design detector returned no findings for changed interface files (`docs/qa/design-detector.json`). This is not a visual or accessibility pass.

### Production pass 1 findings (before second fixes)

- **QA-016 P1:** CSP blocks the 3D decoder's WebAssembly and GLTF blob textures. Add only `wasm-unsafe-eval` (not JS unsafe-eval) and blob connection support. Pass1 browser logs demonstrate the failure.
- **QA-017 P1:** Positive and oak text fail 4.5:1 on paper/stone surfaces (4.28 and 3.59 respectively); muted `text-ink/60` reaches only 4.37. Darken existing light-theme hues and use the ash text token.
- **QA-018 P1:** Engine overflows to 578px at 390px; its JSON output is not keyboard-scrollable. Constrain grid children and make the output region focusable.
- **QA-019 P1:** 3D emits deprecated THREE.Clock and removed PCFSoftShadowMap warnings. Use supported percentage shadows; Clock originates in renderer dependency and needs compatible dependency evaluation, not suppressed logging.
- **QA-020 P1:** 3D also reports `Cannot read properties of null (reading elements)`. Investigate separately after decoder recovery; no fix claim yet.
- **QA-021 P1:** GSAP camera tween ignores reduced-motion (useCameraTween); global CSS/MotionConfig cannot affect it. Respect the user's preference for camera transitions.

- **QA-022 P1:** CAD import reads arbitrary file sizes into memory and GLTF loader can follow external resource references. Reject oversized/empty files before allocation, limit declared binary STL triangles, and restrict imported GLTF resources to embedded data/blob URLs. Browser CSP is an additional defense, not the parser's only boundary.
- **QA-023 P1:** Tour auto-plays even when reduced motion is requested. Start paused for that preference; users can explicitly play.

### Second-pass targeted verification

`docs/qa/smoke.txt`: Studio at 390px has zero axe violations, no overflow, and no JS exception/decoder/texture errors after CSP repair. Engine width is corrected to 390px and contrast passes; the room table now exposes a separate keyboard-scrollability defect (QA-018 follow-up), addressed by a named focusable region. Both still emit the renderer dependency's THREE.Clock deprecation. No console-clean claim is made.

- **QA-024 P1:** Contact-sheet inspection shows the newly added scene presentation dock overlaps Tour navigation at 390/768px and appears in bare render exports despite the documented no-overlay variant. Pass the viewport variant into scene control visibility; retain presentation controls in the full workspace only. The added cinematic camera hook also duplicates the reduced-motion defect; apply the same preference handling there.

- **QA-025 P2:** `@radix-ui/react-switch` has no imports anywhere in application source and is unused. Remove it. `react-dom` is required by Next/React rendering even without a direct application import and is retained.

- **QA-026 P1:** Lighthouse production performance: Home 49, Projects 88, Developers 88, Studio 49, Engine 64. All five accessibility/best-practices/SEO scores are 100. These fail the requested performance thresholds. Home has 29,120ms simulated total blocking time; Studio 9,740ms. Full reports retained in `docs/qa/lighthouse-*.json`.
- **QA-027 P1:** Developers CLS 0.127; fonts are CSS-imported with swap and no metric-adjusted fallback/preload. Keep the exact existing font families, migrate to next/font/local preloading with fallback metrics, and remeasure. This is a candidate cause until retested.

- **QA-028 P2:** ProjectCard gives the lead image competing opacity-0 and opacity-100 classes plus a hydration-dependent scale. The emitted CSS resolves opacity to 100, so a blank-image claim is not established. Removed the redundant state and conflicting classes while keeping hover switching; no LCP improvement is claimed without measurement.

Font verification: Developers improves from 88 to 96 performance and CLS 0.127 to 0.000. Home, Projects and Studio also measure CLS 0.000. Engine still shifts (0.026). Performance thresholds remain unmet on other measured pages. Latest complete score table: `docs/qa/lighthouse-summary.json`.

### 3D measurement (not acceptance)

`docs/qa/graphics.json`: local headless Chrome measured 6–22fps in the initial idle samples, 31–39fps while orbiting, and 37fps at medium quality after 4× **CPU** throttling. First telemetry arrived at 3.923s but includes a one-second measurement window; it is not an exact first-frame timestamp. A build was running concurrently, so this is diagnostic evidence, not a controlled hardware benchmark. It does not establish 60fps idle, a <2s load, GPU-throttled performance, or performance on a 2017 phone. Those acceptance checks remain open.

### Browser availability and new cross-browser findings

- **QA-029 P1:** Firefox renders the tested pages but emits WebGL mipmap initialization, depth-filter portability, and texture-upload deprecation warnings. These are retained in the browser log, not suppressed. Console-clean acceptance is still failing.
- **Safari blocked:** A real `/usr/bin/safaridriver` session was attempted. Safari rejected it because **Allow remote automation** is disabled in Safari Settings. Exact response: `docs/qa/safari-availability.json`. No setting was changed. WebKit coverage is separate and does not close this check.
- Physical iOS Safari, Android Chrome and a 2017 phone are unavailable in this environment; no emulation result is labelled as a device pass.
- Final compiled snapshot identified by build ID and SHA-256 checksums in `docs/qa/tested-build.json`. Source files continued changing from another process during the audit, so the compiled snapshot—not an assumed clean checkout—is the evidence boundary.

- **QA-030 P1, investigation open:** Cross-browser contact sheets show darker water/material rendering in Firefox than Chrome/WebKit at the sampled load point (`docs/qa/comparison-2.jpg`). A settled-render comparison is needed to separate loading/auto-quality timing from shader portability. No pixel-parity or shader fix is claimed.

## Verification outcome — 2026-10-01

**NOT launch approved. No complete zero-finding pass.**

### Verified evidence

- Production builds and TypeScript checks pass (`build-release.txt`, `typecheck-final.txt`).
- 9 unit/integration regressions pass (`regressions-final.txt`).
- 7 browser flow/security regressions pass (`ui-regressions.json`): malformed API input, CSP injection rejection/nonce freshness, honest demo confirmation, failed-save recovery, refresh persistence, corrupt storage, and keyboard enquiry selection.
- Initial valid visual pass: 28 routes × 4 widths = **112 Chrome captures** (`pass1/results.json`).
- Final template regression: 8 route templates × 4 widths × Chrome/Firefox/WebKit = **96 captures**, HTTP 200, **zero axe violations**, **zero horizontal page overflow**, and no page exceptions. This final template sample does not replace a final pass over every project slug or every interactive state.
- Console warnings remain: THREE.Clock in 3D views; additional WebGL warnings in Firefox. The browser audit is therefore **not** a clean pass.
- 64 top-viewport pixel comparisons recorded in `pixel-comparison.json`; contact sheets inspected. Pixel differences are diagnostic, not automatically accepted. Firefox 3D appearance remains under investigation.
- Final npm audit: **zero known advisories** (`npm-audit-final.json`). This does not prove absence of unknown vulnerabilities or authorize public inference access.
- Native Safari session attempt blocked by disabled remote automation; Edge launch attempted and blocked because Edge is not installed. Physical mobile browsers unavailable.

### Latest measured Lighthouse scores

| Route | Performance | Accessibility | Best practices | SEO | CLS |
|---|---:|---:|---:|---:|---:|
| Home | 40 | 100 | 100 | 100 | 0.000 |
| Projects | 88 | 100 | 100 | 100 | 0.000 |
| Developers | 96 | 100 | 100 | 100 | 0.000 |
| Studio | 57 | 100 | 100 | 100 | 0.000 |
| Engine | 62 | 100 | 100 | 100 | 0.026 |

Lighthouse was run before the last redundant image-class cleanup; no post-cleanup score improvement is claimed. Local simulated-mobile scores are not production-host or physical-device certification.

### Fixed or mitigated, with evidence

| Findings | Outcome | Evidence |
|---|---|---|
| QA-002 | Bounded JSON reads and controlled invalid-object errors | Unit + HTTP regressions |
| QA-003, QA-007 | Failed saves retain drafts and report recovery; corrupt stored input rejected | Unit + browser regressions, scenario-save-error.png |
| QA-004 | Nonce CSP, HSTS and defensive server headers added; auth/abuse controls remain open | Browser CSP regression; headers tested |
| QA-005 | Preview forms do not claim successful delivery | Browser regression |
| QA-006 | Cent-preserving full money format; no negative zero/nonfinite output | Unit regression |
| QA-009–QA-012, QA-014 | Chart focus, slider semantics, headings, upload name, landmarks and enquiry keyboard behavior corrected | Final axe matrix + keyboard regression |
| QA-013 | Stale local server isolated; fresh production snapshots serve assets successfully | Final browser HTTP/error logs |
| QA-015 | Renderer shadow prop uses supported typed mode | Production build/typecheck |
| QA-016, QA-020 | Decoder and texture CSP failures and associated page exception disappear | Final production page-error logs |
| QA-017, QA-018 | Contrast corrected, Engine mobile overflow removed, scroll regions keyboard-focusable | Final axe/overflow logs and screenshots |
| QA-019 | Removed shadow-mode warning; upstream Clock warning remains | Console logs |
| QA-021, QA-023 | Camera tween respects reduced-motion at transition start; Tour starts paused | Source + paused Tour capture; all-motion coverage remains open |
| QA-022 | Empty/oversized/corrupt STL rejected; GLTF external resources restricted | CAD regressions; exhaustive execution-attack coverage remains open |
| QA-024 | Scene dock removed from bare Tour/render views | Final Tour and render screenshots |
| QA-025 | Unused switch dependency removed | package/lockfile check + build |
| QA-027 | Developers CLS corrected from 0.127 to 0.000 | Lighthouse before/after scores |
| QA-028 | Redundant image state and conflicting classes removed | Build + rendered project screenshots; no measured speed claim |

### Before / after visual evidence

Engine at 390px — before, 578px overflow:

![Engine before](qa/pass1/chrome-390-_engine.png)

Engine after — 390px document width and keyboard-scrollable table/JSON regions:

![Engine after](qa/final/chrome-390-_engine.png)

Tour before — overlapping scene dock:

![Tour before](qa/pass1/chrome-390-_tour.png)

Tour after — unobstructed navigation and paused reduced-motion state:

![Tour after](qa/final/chrome-390-_tour.png)

### Remaining launch gates, severity-ranked

1. **P0:** Requested signup/create/share/reserve/XLSX/organization flows do not exist. Adding them would violate the explicit no-new-features scope. Cross-tenant and share-token security cannot be certified against an absent subsystem.
2. **P1:** Home/Projects/Studio/Engine performance misses the stated thresholds; Engine CLS remains nonzero. Controlled <2s/60fps/30fps GPU/device acceptance remains unproven.
3. **P1:** Renderer/driver console warnings and Firefox 3D visual parity remain unresolved. Full motion/geometry/clip/seam guarantees are unproven.
4. **P1:** Public inference authentication/abuse limits, exhaustive malicious-upload cases, and deployed HTTPS/static-host configuration are not certified.
5. **P1:** Safari automation disabled, Edge absent, real iOS/Android and 2017 phone unavailable. No browser was silently marked passed.
6. **P1:** Full final every-slug/every-state sweep, every-label copy review, rounded-cent display/export reconciliation, full keyboard flows, 200ms feedback timing, network-interruption coverage, 10,000-unit CSV and 50-tab stress acceptance remain unfinished or unsupported. No bundle budget was supplied; no budget pass is invented.
7. **P1:** Concurrent source changes require a fresh full audit of the eventual release commit. Evidence here is limited to the recorded compiled snapshots.

The loop cannot truthfully reach zero within the current no-new-features scope and available device/browser configuration. The launch checklist is deliberately incomplete. Reproduction instructions: `scripts/qa/README.md`.

## Skyline presentation audit — 2026-10-02 (before changes)

Scope: shared cinematic skyline, all eleven presets, following the customer's Zillow / Homes.com new-construction reference and target of a customer price one-quarter of a comparable alternative.

- **High — City selection does not control the cinematic skyline.** `SiteContext` passes only a seed; grid, height clusters, facade palette and landmark silhouettes in the existing city presets are ignored. Ten named cities appear as slight variations of the same box skyline.
- **High — Golden-hour presentation reads as night.** Sky grading suppresses daylight to 5.5%, then mixes 78% dark haze. Black window atlases multiply already dark building colors, erasing city detail. Baseline: `qa/skyline/before/new-york.png`.
- **Medium — Facades stretch with building dimensions.** One fixed 8×16 window atlas covers every building, regardless of height; window/storey scale changes between neighbors. Rooftops carry the same window material as walls.
- **Medium — Low quality removes the distant skyline.** Dropping a whole ring changes the city silhouette between devices rather than reducing detail.
- **Medium — Source labeling is ambiguous.** Named city coverage points to an authored district even when the cinematic backdrop is illustrative. The two context modes must be distinguished.
- **Unverified business target — 4× better / 4× cheaper.** Customer pricing requires comparable deliverables, revision allowance, hosting term and a real competitor quote. Do not publish a quantitative quality or savings claim based on renderer metrics. The implementation should avoid per-project manual city production and new paid rendering services.

Visual direction: preserve AURA's architecture and warm metal accents; restore readable daylight, city-specific skylines, correctly scaled facades, natural depth and quiet contextual detail. Procedural surroundings are illustrative, not a geographic survey or a replacement for uploaded project geometry.

### Additional finding during skyline verification (before repair)

- **High — Context switching can render with a missing shadow texture.** Chrome's production verification logs `GL_INVALID_OPERATION` / texture-sampler mismatches after changing between Existing city and Cinematic. The static-shadow scheduler only initializes maps on a main-camera draw, but water reflection can draw the newly mounted light first. Evidence: `qa/skyline/verification/results.json` (initial verification). Repair must allocate missing maps before any draw, while preserving the pending main-camera refresh. This is separate from the pre-existing Three.Clock deprecation warning.

### Skyline verification result — 2026-10-02

- **Fixed:** ignored city presets, dark daylight grading, stretched windows, window-textured district roofs, loss of the distant skyline on Low, and ambiguous source-city labels. Before/after images cover all eleven presets, plus phone and night views: [comparison](qa/skyline/comparison.jpg), [all-city gallery](qa/skyline/contact-sheet.png). Geometry tests prove unique/deterministic city meshes, fixed storey scale, finite geometry, roof separation, retained Low-quality bounds and site clearing behavior.
- **Fixed:** missing shadow-map initialization during context changes. Maps now initialize even if a reflection draws a newly mounted light first; the main-camera refresh remains pending. The production Chrome context-switch regression asserts no `GL_INVALID_OPERATION` or sampler mismatch. Initial failing warnings are preserved in `qa/skyline/verification/before-shadow-fix.json`; the passing run is in `qa/skyline/verification/results.json`.
- **Passed:** all 12 automated tests; TypeScript; production webpack build; source design scan on the changed picker/skyline/lighting files; `git diff --check`.
- **Passed within tested scope:** Chrome, Firefox and WebKit production captures at 390, 768, 1280 and 1920 pixels, with zero uncaught page exceptions and no city-model downloads in Cinematic mode. Chrome also verifies the source-city / illustrative labels through both context transitions. [Studio](qa/skyline/verification/studio.png).
- **Performance limitation:** final complete-scene Medium samples at 390 / 768 / 1280 / 1920: Chrome 59 / 59 / 60 / 41 fps; Firefox 58 / 46 / 56 / 34 fps; WebKit 56 / 60 / 49 / 34 fps. These are local headless samples, not certified target-device or GPU-throttle benchmarks. No universal 60 fps claim. District geometry uses at most six material batches; landmarks add draws. No 4× rendering-speed claim.
- **Remaining warnings / coverage:** upstream Three.Clock deprecation and Firefox WebGL/font-preload warnings remain. WebKit is not native Safari or a physical iPhone. Edge/native Safari/physical Android and 2017-phone verification remain uncompleted as recorded in the launch checklist. No assertion that the earlier full-product audit is now green.
- **Commercial target remains unverified:** no price changed. Customer cost ≤25% of a comparable alternative needs an actual quote and matched deliverables. See [scope and pricing validation](SKYLINE-QUALITY.md).

Result: skyline-specific fixes have regression and screenshot evidence; **not a zero-finding full-product launch approval**. Existing launch blockers remain unticked.


## Focused model recovery — 2026-10-02

High-severity optional-scenery crash reproduced and recorded before editing; fixed with isolated model boundaries and keyboard-accessible retry. Production Chrome, Firefox and WebKit pass all 18 recovery cases. Studio preserves edited explosion state and the canvas; scoped recovery-panel axe reports zero violations. Full findings, file-level changes, limitations and before/after evidence: [focused skyline and Sketchfab review](FOCUSED-MODEL-REVIEW.md). Existing launch blockers remain open.


## Authored district continuity — 2026-10-02

- **High, fixed:** `context/City:District` discarded usable scenery during quality changes and left it absent when HQ failed. Replacement is now atomic, failed HQ uses the same source district’s standard model, and stale requests cannot replace newer choices. Clear retry/detail feedback remains usable at 390px.
- **Passed:** 24 final production cases across Chrome/Firefox/WebKit; all ten installed city mappings; 21 default automated tests and six installer tests; TypeScript and production build. Before/after captures, scoped accessibility and actual resource-disposal evidence are in [the district review](DISTRICT-LOADING-REVIEW.md).
- **Medium, open:** repeated quality changes increase whole-renderer geometry counts by two per cycle. The old production build reproduces the identical increase; the new district retains one model and stable texture counts. The resource-stability diagnostic remains failed and its raw result is preserved.

This pass does not close the existing full-product launch blockers or establish either four-times product target.


## Geographic context audit — 2026-10-02 (before integration)

- **High:** the active Cinematic city repeats illustrative models without geographic registration. Switching a city label does not make their placement correct.
- **High:** all authored district GLBs lack a map origin, CRS and usable north/control points. A city-name match cannot establish accurate placement.
- **High:** sample project records provide city names only, without real addresses or coordinates. AURA must not present an invented project address as fact.
- **Medium:** the existing site map is generated scenery, so it cannot verify a building position against real streets.

Decision: replace active city scenery with local Overture map snapshots; project/map/render coordinates share a metre-based projection. Example pins remain explicit. Missing source heights stay flat; floor-count estimates remain disclosed. Detailed source provenance and coverage are recorded in MAP-DATA-SOURCES.md. Verification follows after integration.


### Mapped context: additional visual findings before correction

- **High:** the original Jersey City example pin put the four proposal buildings in mapped water; Seattle and Boston also intersected water. Moved only the explicit example anchors, then tested every actual proposal floor outline against mapped water polygons including holes (all14 pass). [Before Jersey](qa/mapped-context/chrome-map.png).
- **Medium:** the original low overview aimed at the selected tower height, clipping the taller proposal and letting dense mapped neighbors block the initial view. Updated overview height to include the tallest proposal, respond to viewport aspect, and use an elevated overview direction. Photo-angle presets remain available.
- **Medium:** the parallel import presentation button covered the map-area selector on phones. Moved it above the control dock.
- **High, disabled pending authorization:** the parallel import work added live lookups that transmit exact coordinates to Overpass. Automatic approval review rejected enabling that data transfer without explicit consent. The route now returns503, and the explorer makes no live coordinate request: uncovered pins stay local with a clear unavailable-data message.

## Architectural sales presentation — 2026-10-02

The initial sales-presentation findings and direction were recorded before edits in [SALES-PRESENTATION.md](SALES-PRESENTATION.md): high-contrast fabricated facade detail competes with the proposal; dense controls cover the model; product explanation precedes architecture; finance precedes unit discovery; full-screen controls lack the existing restrained design language.

Integrated review, before its correction batch:

- **High:** visible depth artifacts break mapped water and ground into triangles, with stippling on the proposal facade. Desktop/day/dusk and phone evidence: [desktop](qa/sales-gallery/chrome-1440-presentation.png), [dusk](qa/sales-gallery/chrome-1440-dusk.png), [phone](qa/sales-gallery/chrome-390-presentation.png).
- **Medium:** Escape closes presentation without restoring focus to its trigger. Both Chrome viewport runs reproduce the failure: [results](qa/sales-gallery/chrome-results.json).
- **Evidence correction:** replaced two premature presentation captures after verifying canvas dimensions match the viewport; no persistent blank region remains after resize settles.

Final verification follows the correction batch; this is not a new full-product launch certification.

Fresh sales finish review additionally found four medium issues before correction: appraisal precedes enquiry with developer-oriented form defaults; phone photo angles are compressed; unit cells lack visible identifiers and adequate mobile targets; the mobile assistant launcher overlaps controls. The bounded correction batch is documented in [SALES-PRESENTATION.md](SALES-PRESENTATION.md).

### Geographic context verification closure

Fourteen local snapshots retain footprint/road/water provenance and source-height status; all fourteen example proposal anchors pass the water-intersection regression. Prior production map runs verify saved pins, coverage changes, phone layout and network-failure retry: [Chrome](qa/mapped-context/final/chrome-results.json), [Firefox](qa/mapped-context/ship/firefox-results.json), [WebKit](qa/mapped-context/ship/webkit-results.json). Firefox/WebKit also verify that uncovered custom pins remain local. These are recorded build-specific results, not a new every-city pixel comparison of the sales build. The final sales build reruns all data/geometry/anchor tests. Live coordinate lookup remains disabled; available map areas and example pins remain explicit.

### Sales presentation verification closure

- **Fixed, demonstrated:** map ground/water depth artifacts, presentation focus restoration, mobile photo-control compression and assistant overlap, anonymous/undersized unit cells, and the finance-first enquiry sequence. [Before/after evidence and detailed scope](SALES-PRESENTATION.md#verification-and-verdict--2026-10-02).
- **Passed:** 80 automated tests, TypeScript, production build, diff check. Production Chrome desktop/phone, Firefox desktop and WebKit desktop regressions pass; 27 final captures inspected. Presentation-only axe has zero violations, with zero uncaught page exceptions or shader/sampler errors in these runs.
- **Fresh review:** `ship` for the four scored buyer-experience corrections, all resolved. No whole-product approval inferred.
- **Evidence repaired:** WebKit dusk originally preceded the renderer's state change. The replacement verifies actual light intensity/background before capture; no application lighting defect reproduced in the settled check.
- **Still open:** existing Three.Clock and Firefox warnings, native/physical-browser coverage, benchmark targets, complete original launch checklist, globally available mapped context, real enquiry delivery and proven commercial uplift. No all-ticked launch checklist issued.

## Skyline detail redesign — 2026-10-02, user-rejected baseline

The user rejected the previous schematic skyline as insufficiently detailed. This overrides the previous scoped visual acceptance. Findings recorded before implementation:

- **High:** nearly every mapped building is a blank gray extrusion. One mineral material and position/normal-only geometry prevent building-specific facade scale, glazing, material identity and night occupancy.
- **High:** the default lighting and low material contrast flatten the city into a pale model. Detail on the proposal reads as noise against empty surroundings.
- **Medium:** roof planes have no architectural equipment or edge depth; close and elevated views have no believable secondary scale.
- **Medium:** water is a flat polygon without reflection/ripple detail, while ground and streets have little surface hierarchy.
- **Medium:** prior claims limited the city to schematic massing. The authorized redesign should retain accurate mapped envelopes while explicitly labeling facade/roof/street detail illustrative.

Direction: detailed architectural visualization with measured map footprints/heights, building-local facades (brick/stone/glass), restrained night occupancy, bounded roof detail, textured water and stronger lighting depth. No invented survey accuracy, relocated landmarks or paid services. Preserve geographic placement, unknown-height disclosure, batching, low-detail fallback, keyboard controls and existing buyer flow. Baseline: `qa/sales-gallery/final/chrome-1440-presentation.png`, `chrome-1440-dusk.png`, `chrome-390-presentation.png`.

### Skyline detail: first integrated review, before corrections

All 17 captures are loaded and show the named map area; 14 recorded map runs pass with no uncaught exceptions or shader failures. Independent visual inspection found:

- **High:** dense-city foreground buildings obscure proposal podiums and companion buildings (New York, Chicago, Toronto, Dubai, Boston; partial in Miami, San Francisco and London). Correct camera composition while retaining every mapped envelope.
- **Medium:** the new water normals create implausibly large, blurry stripes. Reduce ripple scale and amplitude, with distance filtering across all wave frequencies.
- **Medium:** the sky and distant ground have mismatched horizon colors, producing a hard horizontal band. Make atmospheric shading converge to the fog color near the horizon.
- **Medium:** the `graphics=1` scene-settings dock remains visible over full-screen presentation. Hide the editing dock while presenting, including debug mode.

Evidence: [Jersey City](qa/skyline-detail/first/chrome-jersey-city.png), [New York](qa/skyline-detail/first/chrome-new-york.png), [dusk](qa/skyline-detail/first/chrome-dusk.png), [phone](qa/skyline-detail/first/chrome-phone.png). Frame-rate snapshots do not establish sustained performance; one initial Jersey City sample was 25 FPS, others 51–59. Existing Three.Clock warning remains open.

The fresh reviewer confirmed these four issues and added a fifth medium finding: glass reads as flat dark grids, with excessive clustered lit windows at dusk. The correction raises broad environment reflections, gives glazing a restrained height gradient and reduces clustered occupancy. Reviewer disposition before corrections: **revise**; no approval inferred from the improved detail alone.

### Reflection verification correction

The first corrected captures resolved the hard horizon and extra control dock, but showed weak material differentiation. Source inspection found Three.js overrides material `envMapIntensity` with `scene.environmentIntensity` when no material-specific environment is bound. Bind the same shared environment explicitly to facade, roof, water and proposal glass materials, scale their individual responses by current time-of-day intensity, and retain external texture ownership. This additional correction addresses the fresh reviewer's existing material-depth finding; the earlier corrected capture set is retained as `qa/skyline-detail/correction-check`. Final captures follow.

Dusk additionally uses a blue atmospheric horizon (`#465669`) instead of the near-black night haze. The reviewed continuous transition was technically smooth but still produced a dark visual band against the illuminated ground; dusk capture synchronization now checks the revised rendered background.

### Camera budget regression under concurrent load

A full test run concurrent with browser capture failed one timing assertion: Dubai overview preparation took 101.1 ms against its 100 ms budget; the other 102 tests passed. The earlier isolated 103-test run passed. Retained failure log: `qa/skyline-detail/concurrent-tests-failed.log`. Keep the budget unchanged and exclude distant obstacle boxes that cannot intersect any candidate sightline. Also sample near-ground proposal geometry and permit a steeper fallback where dense neighbors still mask podiums.

The optimized 105-test suite also exceeded the unchanged budget during initial Chrome shader compilation: Jersey City 109.9 ms, with the remaining 104 tests passing. This contention-sensitive timing finding remains **open**; saved as `qa/skyline-detail/optimized-concurrent-tests-failed.log`. Do not infer a sustained performance or resilience pass from the isolated baseline or screenshots.

### Final visual review: low-tier horizon correction

Fresh review of all 24 captures accepted water, controls, standard day/dusk atmosphere, camera composition and material depth, with one remaining medium defect: the Low phone renderer retained a horizontal horizon seam near y226. Root cause: Three applies direct-rendered ground fog after tone mapping in output color space, while sky haze was tone mapped. Apply the horizon blend after output conversion only for Low; the composer path remains unchanged. Preserve the failing capture as `qa/skyline-detail/low-before.png`; verify a matched phone day/dusk capture and a pixel-row continuity assertion.

The wall-clock assertion also exceeded 100 ms with no browser running (Jersey City 122.3 ms) while Node ran all fixture-heavy test files concurrently. The standard test runner now executes test files serially so this benchmark measures its own workload; the 100 ms threshold and every test remain unchanged. This is measurement isolation, **not** resolution of the recorded contention-sensitive timing finding, which stays open. The failing parallel-suite log is retained as `qa/skyline-detail/parallel-suite-timing-failed.log`.

### Skyline detail verification closure — 2026-10-02

- **Visual issues closed:** dimension-based facade detail, bounded roof and street details, water pattern, day/dusk and Low-tier horizon, full-screen control overlap, clearer site-aware composition and differentiated material response. Fresh reviewer verdict after the Low correction: **ship** for this skyline improvement; no full-launch approval inferred.
- **Evidence:** 25 final images across Chrome/Firefox/WebKit; Chrome covers all 14 mapped areas plus 390/768/1280/1920 widths. The 27 main browser cases and three Low-horizon checks pass. Zero uncaught page exceptions or shader failures; zero presentation-only axe violations. Actual reflection binding and site-dependent camera changes are asserted. [Full before/after and scope](SKYLINE-DETAIL.md#final-verification--2026-10-02).
- **Regression proof:** Low horizon adjacent-row color jump improves from 18 to 1 in day and dusk, below the 3-level bound; failing capture preserved.
- **Build/tests:** production build, TypeScript, diff check and 105 serially executed tests pass. [Build](qa/skyline-detail/build-final.log), [tests](qa/skyline-detail/tests-final.log).
- **Open:** contention-sensitive 100ms camera preparation budget, prior warnings, sustained performance/device targets, physical/native browser coverage and original full-product launch blockers. No all-ticked launch checklist or four-times quality/cost claim issued.

## Full downtown coverage — 2026-10-02, before implementation

The user rejected the neighborhood cutout and requested the whole downtown.

- **High:** existing map extracts terminate roughly 1–2km from example pins. Buildings and water end on rectangular boundaries, so wider and skyline views present only a fragment of the urban core.
- **High:** the single-snapshot 12,000-feature limit previously caused source areas to be narrowed. Expanding one monolithic file would either fail validation or create a large blocking build.
- **Medium:** the exterior orbit distance is capped at320 scene units, preventing a useful downtown-wide view even if more geography is present.

Decision: preserve the detailed project-area snapshot and add geographically exact outer downtown tiles. Keep each tile within the existing feature/vertex limits, share materials, build geometry incrementally, and cull off-screen tile batches. Use indexed distant geometry and no distant decorative equipment. All existing mapped heights/footprints, source attribution, example-pin labels and local-only project coordinates remain intact. Coverage describes explicit broad downtown viewing envelopes, not official administrative boundaries. Baseline: `qa/skyline-detail/final/chrome-jersey-city.png` and `chrome-new-york.png`.

### Downtown integrated first pass — 2026-10-02

- **Medium — city-scale horizon seam:** the former camera far plane cuts the enlarged ground before fog fully blends into the sky. Visible in `qa/downtown/first/chrome-jersey-city-whole.png` and `chrome-390.png`. Correction: extend the city-scale far plane and ground together; preserve the established near-view atmosphere.
- **Medium — whole-area phone composition too shallow:** all mapped tiles fit, but the low oblique angle flattens the entire downtown into a narrow strip. Correction: raise only the whole-downtown camera angle; retain all eight-corner framing constraints and the near-project view.
- **Streaming review fixed before browser pass:** ready tiles no longer wait350ms to become visible again; obsolete tile jobs cancel without blocking new views; failed manifest refreshes retry the manifest; an absent map ID no longer dereferences a null error. Dedicated tests cover cancellation, retry routing and proposal changes beyond the near-area boundary.
- First browser probe confirms Jersey City's entire47-tile envelope loads. One initial QA assertion incorrectly required even isolated road segments to be indexed; the intended geometry algorithm leaves them unindexed when that uses less memory. The probe now checks indexed building walls, preserving the existing geometry-size optimization rather than changing production buffers to satisfy an incorrect test.
- Complete automated suite:131 tests pass. Production build passes. Browser verification continues after the two observed visual corrections; no performance or launch certification is claimed.

### Downtown visual confirmation — 2026-10-02

All14 areas load every manifest tile in Chrome; captured near and whole views show no obvious internal tile gaps. The horizon correction passes visual review and the raised city-view angle makes the phone footprint legible. Forced HTTP503 recovery keeps existing tile object identities and reloads the missing area; rapid city changes leave only the selected city's tiles. Presentation axe check finds zero WCAG2A/AA/2.1AA violations.

- **Medium — controls obscure the full-area boundary on desktop:** the independent review of all14 overview screenshots and four responsive sizes confirms that a raw viewport fit lets the lower corner sit behind the presentation bar at1280/1440/1920 widths. Evidence retained in `qa/downtown/before-safe-area`. Targeted correction: calculate the city fit using presentation-safe vertical space, with projected-bounds tests; no unrelated styling changes. Phone390 and tablet768 views already clear the controls.
- This is a functional coverage-visibility correction found during confirmation, not a new visual redesign. Final screenshots will confirm the corrected safe-area fit.
