# Sales presentation pass — 2026-10-02

Direction: extend AURA's established paper, ink, serif and bronze identity into a quieter architectural sales gallery. The live building is the primary evidence. Preserve mapped positions, actual product functions, sample disclosures and original imported geometry; no invented amenities, address claims, market returns or conversion promises.

## Findings recorded before edits

- High: the high-contrast repeating context facade grid competes with the proposal and reads as noisy stripes rather than architectural depth.
- Medium: the open render-settings panel, city picker, repeated capture controls and presentation button obscure the model, especially on phones.
- Medium: the landing page gives lengthy product explanation priority over the actual architecture.
- Medium: project pages place the financial appraisal beside the model before a buyer reaches units and enquiry.
- Medium: full-screen presentation has a large two-tier toolbar and an abrupt identity panel rather than the restrained controls of a sales gallery.

Changes and verification will be appended after the integrated desktop/mobile review. Revenue uplift, photographic accuracy and commercial performance are not established by this visual pass.

## Integrated review findings — before correction

- High: coplanar mapped surfaces break into triangular ground/water artifacts at the exterior viewing distance. Proposal facade details also show unstable speckling. Evidence: `qa/sales-gallery/chrome-1440-presentation.png`, `chrome-1440-dusk.png`, and `chrome-390-presentation.png`. Review the camera depth range and surface separation; retain geographic coordinates and source heights.
- Medium: closing full-screen presentation with Escape loses keyboard focus instead of returning to the triggering button. The Chrome desktop and phone regression both record `focusRestored: false` in `qa/sales-gallery/chrome-results.json`.
- Capture correction: the initial presentation screenshots were taken before canvas resize completed. Replacements wait for the canvas to match the window, then settle. Both fill the viewport; the initial blank region was not a persistent layout defect.

Fresh finish-review disposition: **fix**. Additional material findings recorded before repair:

- Medium: appraisal interrupts availability → enquiry; the generic form defaults to pro forma and asks buyers for work email/company.
- Medium: the mobile location picker compresses photo angles to a one-character sliver.
- Medium: availability uses anonymous colored cells with no visible unit reference and 28px hit areas.
- Medium: the floating assistant covers mobile scene controls and availability cells.

Preserve: the existing typography/palette, geographic geometry, illustrative disclosures, all finance controls, and selected-unit enquiry prefill. Context massing remains schematic; do not claim photographic fidelity.

## Built surface rules

- **Architecture leads.** The home page pairs a short serif statement and two actions with a full-width live model. Paper surfaces, ink type, bronze accents and fine dividers continue the existing identity. The caption carries interaction guidance, project identity and the illustrative-project disclosure; explanatory sections follow the model.
- **Follow the buyer sequence.** Project pages run from the 3D explorer to unit availability, enquiry, then development appraisal. The appraisal retains its controls, charts and sensitivity tools, with a direct link beneath the explorer. Choosing Enquire from a unit sheet pre-fills its reference and selects the viewing enquiry. The form starts with “Book Viewing” and a general email field; company and role appear for pro forma requests.
- **Keep phones legible.** The hero location picker is collapsed behind its labelled disclosure. In the full explorer, photo angles occupy their own horizontally scrollable row on phones. Availability shows unit references and text statuses, uses at most four columns per floor on phones, and gives unit and floor buttons a minimum 44px target. The assistant launcher sits near the header on phones and at the lower right on larger screens; its open panel fills the phone width.
- **Let presentation controls recede.** Full-screen presentation replaces the ordinary explorer HUD with a compact project label, exit button and bottom control panel. Exterior, interior, core, aerial, image capture and lighting remain available; floor and section-height controls appear when relevant. The panel wraps on narrow screens. Opening presentation locks page scrolling and focuses Exit; Tab cycles through visible controls, Escape closes it, and closing returns focus to “Present building.”
- **Keep sample status visible.** Retain illustrative-project, example-location, sample-availability and sample-unit-sheet labels, together with map attribution. Presentation identifies a sample design or an authored import and labels finishes and street details illustrative. The enquiry introduction, form footer and completion state all disclose that the demo sends no request.
- **Separate mapped context from authored architecture.** Mapped envelopes use subdued mineral finishes and broad tonal shading, without invented window grids or storeys. Preserve mapped positions and source heights; unknown heights remain footprints and absent map data leaves neutral ground. Authored imports retain their supplied geometry: section views disclose missing named cores, rooms or furniture rather than implying those details exist. Ordered ground layers and an exterior camera depth helper support stable rendering without changing geographic geometry. This pass ships no newly generated raster assets.

Source basis: `src/app/(site)/page.tsx`, `HeroExplorer`, `ExplorerViewport`, `PresentationControls`, `ProjectWorkspace`, `EnquiryForm`, `StackingPlan`, `ViewportHud`, `AssistantPanel`, `CityPicker`, `MappedContext`, `architecturalContextMaterial` and `renderDepth`. These rules describe the implemented surface; verification results are recorded separately.

## Verification and verdict — 2026-10-02

**Finish-review disposition: ship, scoped to the four buyer-experience corrections.** The fresh reviewer scored buyer sequence, mobile photo controls, unit identification and assistant overlap resolved. This is a verdict on those fixes, not a full-product launch approval.

| Finding | Evidence after correction |
| --- | --- |
| Ground/water depth corruption | [Before](qa/sales-gallery/chrome-1440-presentation.png) → [after](qa/sales-gallery/final/chrome-1440-presentation.png). Ordered ground layers remove competing depth values; adaptive exterior near plane improves facade precision while preserving the walking camera and map geometry. Three depth regressions pass, including a fixture reproducing over 100 original depth collisions. |
| Presentation loses focus | [Before result](qa/sales-gallery/chrome-results.json) → [passing Chrome result](qa/sales-gallery/final/chrome-results.json). Tab remains inside presentation and Escape returns to its trigger at desktop and phone sizes. |
| Crowded phone controls | [Before](qa/sales-gallery/chrome-390-project.png) → [after](qa/sales-gallery/final/chrome-390-project.png). Photo angles have a separate row; assistant occupies the header. |
| Anonymous unit cells | [Before](qa/sales-gallery/chrome-390-availability.png) → [after](qa/sales-gallery/final/chrome-390-availability.png). Visible unit references and status text; browser measures at least 44px target height. |
| Investor-first enquiry | [Phone enquiry](qa/sales-gallery/final/chrome-390-enquiry.png), [desktop sequence](qa/sales-gallery/final/chrome-1440-enquiry.png). Selected-unit reference survives handoff; keyboard submission reaches the truthful unsent-demo confirmation. |

- All **80 automated tests pass**; TypeScript and production webpack build pass (33 generated routes/pages); diff whitespace check passes.
- Production browser regressions pass in **Chrome at 1440×1000 and 390×844**, **Firefox at 1440×1000**, and **WebKit at 1440×1000**. Tests cover home overflow/content order, full-screen resize/focus/Escape, project section order, unit identity and enquiry handoff, keyboard demo submission, collapsed scene settings, quality change and map opening. [Firefox results](qa/sales-gallery/final/firefox-results.json), [WebKit results](qa/sales-gallery/final/webkit-results.json).
- All 27 final captures were inspected. WebKit dusk initially captured the selector before the renderer's light changed. Replaced that premature capture after checking the actual directional-light intensity and background, then waiting two animation frames. [Settled dusk](qa/sales-gallery/final/webkit-1440-dusk.png), [state assertion](qa/sales-gallery/final/webkit-dusk-settled.json). The shared regression now waits for renderer state rather than a fixed delay.
- Zero uncaught page exceptions and zero shader/sampler errors in these runs. Scoped WCAG A/AA axe scans of the presentation dialog report zero violations. Existing Three.Clock deprecations remain; Firefox also reports WebGL and font-preload warnings. Do not claim a clean console or whole-site accessibility pass.
- WebKit automation is not native Safari certification. Physical iOS/Android, Edge, target-device/GPU performance, global map coverage, photo-realism and sales uplift were not established by this pass. The demo enquiry still sends nothing. Existing full-product launch blockers remain open.

Reference research used official [Rivage](https://rivagebalharbour.com/) and [Casa Bella](https://casabellaresidences.com/) property presentations, with their Related Group relationship checked on [Related's Rivage page](https://relatedgroup.com/properties/rivage/) and [Casa Bella page](https://relatedgroup.com/properties/casa-bella/). Applied the setting → architecture → residence → enquiry sequence and restrained control hierarchy. No reference images or branding were copied, and no affiliation or revenue claim was added.

Local preview: http://127.0.0.1:3170/ · Studio: http://127.0.0.1:3170/studio. The running production preview uses `.next-sales-gallery`. Rebuild with `AURA_BUILD_DIR=.next-sales-gallery npm run build -- --webpack`, then run `AURA_BUILD_DIR=.next-sales-gallery npm run start -- --hostname 127.0.0.1 --port 3170` from the app directory.

## Skyline finish supersession — 2026-10-02

The user rejected the gray, schematic skyline after this sales-presentation pass. Its mineral-only skyline finish rule and earlier visual acceptance are superseded by [Skyline detail](SKYLINE-DETAIL.md), which records the implemented facade, roof, street, water, atmosphere and camera rules. Geographic source placement and illustrative disclosures remain; the buyer-flow documentation above still applies. Final verification of the skyline corrections is pending.
