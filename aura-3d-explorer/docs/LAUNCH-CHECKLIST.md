# AURA launch checklist — NOT approved

Date: 2026-10-01 (America/Los_Angeles). This is an evidence checklist, not a launch certificate. The requested zero-finding full pass has **not** occurred. Unchecked items are failures, unavailable coverage, or unfinished verification; none have been waived.

## Visual
- [x] Capture every discovered route (28) at 390, 768, 1280 and 1920px in Chrome (112 captures in pass1).
- [ ] Complete final screenshot inspection of every page and state: edges, spacing, clipping, heading wraps, radii, palette, typography, icons, layout shifts, hover and focus.
- [ ] Final pass finds zero visual issues.

## 3D
- [ ] Explorer loads in under 2 seconds on a specified mid-range laptop.
- [ ] Sustained 60fps idle and 30fps orbiting, including GPU-throttled tests.
- [ ] No flicker, z-fighting, floor seams or camera clipping across all models.
- [ ] Floor selection and explode animate smoothly without snapping.

## Copy and calculations
- [x] Mock enquiry/demo confirmations no longer falsely claim delivery (browser regression).
- [x] Full money formatting preserves cents and does not print negative zero (unit regression).
- [x] Independent reference pro forma and all project floor/zone/site roll-ups checked at slider minimum/default/maximum values.
- [x] Zero-revenue and negative-profit calculations remain finite in tested cases.
- [ ] Every label, tooltip, error and empty state reviewed; no placeholders or inconsistent naming remain.
- [ ] Every displayed rounded currency/area figure reconciles across all panels, charts and exports; zero-units-sold edge fully covered.

## Flows
- [ ] Sign up → create project → edit massing → save scenario → share → private-window access → reserve → PDF and XLSX, first try.
- [x] Scenario save and reload persistence verified.
- [x] Failed scenario writes show recovery instructions and retain the scenario-name draft.
- [x] Corrupt scenario storage cannot crash the drawer.
- [x] Enquiry radio options use arrow keys and cannot accidentally submit the form.
- [ ] Every flow responds within 200ms, survives refresh, and works with keyboard only.

## Accessibility
- [ ] Final axe run has zero violations on every page, viewport and interactive state.
- [ ] All controls have verified screen-reader names and visible keyboard focus.
- [ ] Reduced motion verified across every animation, including 3D.
- [ ] Every text color and interactive state meets 4.5:1 contrast.

## Performance
- [ ] All marketing Lighthouse categories ≥95; all app categories ≥90.
- [ ] Zero layout shift on every page.
- [ ] No console errors or warnings in development and production.
- [x] Confirmed unused switch dependency removed; framework-required react-dom retained.
- [ ] Full dependency usage audit and agreed bundle budget pass.

## Resilience
- [x] Corrupt, empty and oversized CAD inputs have regression checks; oversized input rejected before reading.
- [x] Chunked oversized API input is rejected before full allocation.
- [ ] Network loss mid-save and recovery verified for every persistence path.
- [ ] 10,000-unit CSV import, 50 concurrent explorer tabs, and 2017-phone tests pass without crashes, hangs or data loss.
- [ ] Every failure path has an actionable recovery state.

## Security
- [x] npm audit completed with zero known vulnerabilities at the recorded audit time.
- [x] Malformed API objects return controlled errors (HTTP regression).
- [x] Production security headers and fresh CSP script nonces verified; injected inline script blocked.
- [ ] Public inference endpoint authentication/abuse controls verified.
- [ ] Share-token entropy and access checks verified (share-token system absent).
- [ ] Upload execution and all external-resource attack cases verified.
- [ ] Cross-organization denial regression passes (organization/auth store absent).
- [ ] HTTPS deployment headers and static-export host configuration verified.

## Browsers
- [ ] Complete Chrome pixel comparison.
- [ ] Complete real Safari pixel comparison.
- [ ] Complete Firefox pixel comparison.
- [ ] Complete Edge pixel comparison.
- [ ] Complete physical iOS Safari pixel comparison.
- [ ] Complete physical Android Chrome pixel comparison.

## Release gate
- [x] Findings recorded before fixes in QA-REPORT.md.
- [x] Reproducible regression and browser audit scripts provided.
- [ ] Every bug has passing evidence and all requested checks are complete.
- [ ] A complete repeat audit finds zero issues.
- [ ] Launch approved.
