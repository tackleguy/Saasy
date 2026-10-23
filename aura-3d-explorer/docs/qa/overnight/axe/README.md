# Accessibility matrix results

`results.json` is the final full run of `scripts/qa/axe-matrix.mjs` (axe-core,
WCAG 2.0/2.1 A + AA) on the production build with local Supabase:
**47 page/width/state combinations, 46 with zero violations.**

The one failure ("studio: walk-through", `color-contrast` on the active
segmented-control label) is flagged `measuredMidAnimation: true`: CSS
animations were still running 30 s after the action because software WebGL
(no GPU on this machine) starves the page. Across five full runs the single
contrast hit moved between different Studio states each time, always on an
element with a colour transition. When captured in detail it was a
segmented-control label part-way through its 300 ms fade from grey to white over
the dark pill (foreground #625E57 on #1C1B19, 2.67:1; settled it is white on ink).

Isolated re-checks of the same sequences, auditing after animations finished,
report **0 violations**:

- floor selected → Esc → explode (End on the slider) → audit: 0
- floor selected → Esc → explode → floor → Walk → audit: 0

Real fixes from the first run (3 failing states): interactive floor plan was an
`img` with buttons inside (`nested-interactive`); brand-colour buttons could
have unreadable text (`color-contrast`). Both fixed; see QA-040.

Not covered: Firefox and WebKit (not installed on this machine), screen-reader
listening tests, physical devices.
