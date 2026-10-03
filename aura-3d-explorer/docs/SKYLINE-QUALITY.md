# Automated skyline presentation

Implemented 2026-10-02. Applies to AURA's default Cinematic context in every project, Studio and render view.

## Reference and intent

The customer requested the presentation quality of new-construction imagery and tours on Zillow and Homes.com, with a customer price one-quarter of a comparable alternative. Reviewed [Zillow's 3D Home presentation](https://www.zillow.com/3d-home/), its [new-construction toolkit](https://www.zillow.com/new-construction-advertising/training/zillow-3d-home/), and [a Homes.com new-construction listing](https://www.homes.com/property/homesite-l28-fair-weather-place-bowie-md/kxq9pmen4gqt0/).

The visual direction is clear daylight, legible architectural materials and a recognizable sense of place. This change improves the live exterior context; it does not turn a massing model into a photographed interior tour. Uploaded design geometry remains necessary for faithful project-specific architecture.

## What changed

- All eleven presets now use their existing street grids, height clusters, material palettes and landmark silhouettes. Selecting a city no longer just reseeds generic boxes.
- Golden hour and dawn have readable skies and fill light; each city's haze, paving, vegetation and water colors feed the shared presentation.
- Facades tile at a fixed 0.9-unit storey height and 1.25-unit bay width. Roofs have a separate matte finish; night lighting illuminates sparse windows rather than entire roofs.
- Static district geometry is merged into at most six material batches, with landmark meshes added separately. No city-specific model or texture downloads are needed in Cinematic mode. Existing authored source districts remain available in Existing city mode.
- Low quality preserves the entire district silhouette. It reduces cylinder segments and omits small rooftop equipment instead of removing distant buildings.
- Site edits clear intersecting contextual building tiers. Context labels distinguish an illustrative skyline from an authored source district.

The generated skylines are illustrative compositions, not surveyed views, certified sightlines or exact geographic replicas.

## Evidence

Before/after images for every city: `qa/skyline/before/` and `qa/skyline/after/`. Gallery: `qa/skyline/contact-sheet.png`. Reproduce with `node scripts/qa/skyline-capture.mjs before|after` while the development preview runs on port 3149.

`npm test` includes distinct deterministic city geometry, finite attributes, a six-batch district budget, fixed facade scale, roof separation, consistent low/high bounds, and full-site clearing tests. `npm run lint` and the isolated production build pass.

`node scripts/qa/skyline-verify.mjs` targets the production preview on port 3150, captures Chrome / Firefox / WebKit at 390, 768, 1280 and 1920 pixels, checks for page exceptions and accidental city-model requests, and verifies the source labeling when switching context modes. Results live in `qa/skyline/verification/`. All three runs completed with zero uncaught exceptions and no city-model downloads. Chrome also asserts that switching context modes produces no shadow-texture sampler errors. Remaining warnings and frame-rate limits are recorded in `QA-REPORT.md`.

## Customer price target

“Four times cheaper” means **AURA customer total ≤ 25% of the comparable alternative's customer total**, for the same property, deliverables, revision allowance and hosting term. Compare total production and delivery cost, not only a player subscription. Zillow advertises its 3D Home app and tour uploads as free; that is not a valid positive-price baseline for a 75% savings claim.

This implementation removes per-project skyline assembly and adds no paid renderer, city-model service or generated-image API. It does not prove a 75% reduction in customer price. A real alternative quote, AURA's delivery/support costs and an agreed customer package are still needed to validate that target. No price or marketing savings claim was changed.

“Four times better” remains a target, not a measured result. Compare like-for-like outputs through a blind buyer review for realism, architectural clarity, navigation and confidence; measure completion time and defects separately. Frame rate alone is not a quality score.
