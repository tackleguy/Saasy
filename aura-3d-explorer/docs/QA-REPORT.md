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
