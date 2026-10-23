# AURA launch checklist — NOT approved

> **2026-10-23 overnight product pass:** items below were re-checked where evidence exists; nothing was ticked without it. Launch is still **not** approved: the live Vercel deployment is disabled (HTTP 402), the 3D first frame is ~12 s on this machine against a 2 s goal, draw calls are above target, and Firefox/Safari/Edge/physical devices are untested. See QA-032…QA-041.

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
- [ ] Sign up → create project → edit massing → save scenario → share → private-window access → reserve → PDF and XLSX, first try. *(2026-10-23: everything except "reserve" passes keyboard-only against local Supabase — `docs/qa/overnight/customer-flow/`. Unit reservation is not built; units show "Available" with "Unit status tracking is not connected yet".)*
- [x] Scenario save and reload persistence verified.
- [x] Failed scenario writes show recovery instructions and retain the scenario-name draft.
- [x] Corrupt scenario storage cannot crash the drawer.
- [x] Enquiry radio options use arrow keys and cannot accidentally submit the form.
- [ ] Every flow responds within 200ms, survives refresh, and works with keyboard only.

## Accessibility
- [ ] Final axe run has zero violations on every page, viewport and interactive state. *(2026-10-23: 46 of 47 combinations clean in Chrome; the one hit was measured mid-animation and re-checks clean in isolation — `docs/qa/overnight/axe/README.md`. Firefox/WebKit not run.)*
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
- [x] Public inference endpoint authentication/abuse controls verified. *(Same-origin check + per-IP rate limits on `/api/assistant`, `/api/engine`, `/api/enquiries`; `scripts/qa/api-guard.test.ts`. Limits are per server instance — D-02.)*
- [x] Share-token entropy and access checks verified. *(32 random bytes, only the SHA-256 is stored; expiry, password, revoke, financials toggle — `supabase-rls.test.ts`, both customer flows.)*
- [ ] Upload execution and all external-resource attack cases verified.
- [x] Cross-organization denial regression passes. *(`supabase-rls.test.ts` 8/8; customer-flow-2 last step: another company is refused.)*
- [ ] HTTPS deployment headers and static-export host configuration verified.

## Browsers
- [ ] Complete Chrome pixel comparison.
- [ ] Complete real Safari pixel comparison.
- [ ] Complete Firefox pixel comparison.
- [ ] Complete Edge pixel comparison.
- [ ] Complete physical iOS Safari pixel comparison.
- [ ] Complete physical Android Chrome pixel comparison.

## Overnight product pass (2026-10-23)
- [x] Assistant does not show local-AI setup to website visitors; rate-limited and same-origin (QA-031).
- [ ] 3D first frame < 2 s at 4× CPU throttle. *(12.4 s median, from 21.6 s; software WebGL — QA-033.)*
- [ ] Medium tier < 60 draw calls. *(Medium 214, High 174, Low 135 — `renderer-soak.json`, QA-034.)*
- [x] Renderer resources stable across 5 High↔Low cycles (no geometry/texture growth) — `renderer-soak.json`.
- [x] WaterReflector disposes its blur geometry; shared reduced-motion helper applied to every animated 3D element.
- [ ] `THREE.Clock` deprecation warning gone. *(From @react-three/fiber 9.8.2 itself — D-05.)*
- [ ] Firefox darkness (QA-030) verified fixed. *(Firefox not available here.)*
- [x] No sample project reuses another's photos (QA-036).
- [x] Enquiry and early-access forms store to the database and email via Resend, with honest outcomes (QA-037). *(Real Resend key untested.)*
- [x] Every map/model/HDR file returns 200 with immutable caching on a production build (576/576). *(Live site returns 402 — QA-032.)*
- [x] Magic-link sign-in, companies, row-level security, projects saved to the database, real address + surroundings, CAD in storage, share links, scenarios in the database, PDF and XLSX exports — two end-to-end flows pass.
- [ ] Live OpenStreetMap Overpass lookups. *(Tested against a mock only — D-15.)*
- [ ] Presentation keys at 1920 and on iPad 1024. *(See `docs/qa/overnight/presentation/results.json`.)*
- [x] White-label: logo, accent (readable text on any colour), `/o/<company>/projects/<id>`, "Powered by AURA".
- [x] 2× still capture saved to the project gallery (customer-flow-2).
- [x] Early-access page with real product screenshots, three steps, sign-up form.
- [ ] Keyboard-only completion of the whole flow. *(Customer flow is keyboard-only except file pickers, which cannot be typed into.)*
- [ ] Chrome / Firefox / WebKit matrix. *(Chrome only.)*

## Release gate
- [x] Findings recorded before fixes in QA-REPORT.md.
- [x] Reproducible regression and browser audit scripts provided.
- [ ] Every bug has passing evidence and all requested checks are complete.
- [ ] A complete repeat audit finds zero issues.
- [ ] Launch approved.
