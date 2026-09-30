# AURA

AURA is a platform real estate **developers** use to market, explore and underwrite
projects: an archviz-style portfolio, live photoreal-adjacent 3D for every project
(explode the stack, isolate floors, walk the interiors), stacking plans with unit
sheets, and a developer-grade pro forma with IRR, residual land value and
sensitivities. All projects, names and figures shipped here are **placeholders**.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```

Node 20+. `STATIC_EXPORT=1 npm run build` also writes a static site to `/out`.

## Routes

| Route | What it is |
|---|---|
| `/` | Full-bleed live 3D hero of the flagship (The Meridian Tower) with caption bar, portfolio grid, "For developers" strip |
| `/projects` | Masonry portfolio (3 → 2 → 1 columns): image, name, client / architect, city, status |
| `/projects/[slug]` | Render carousel, key facts, live 3D explorer + yield engine with the project's defaults, unit-availability stacking plan with unit sheets, "Request Pro Forma / Book Viewing" |
| `/studio` | **AURA Studio**: explorer + full yield engine + CAD import, saved scenarios (localStorage) and Export Pro Forma (PDF, via print stylesheet) |
| `/developers` | How it works, 1% success-fee pricing, placeholder testimonials (labelled), FAQ, demo request |

## Replace the placeholder images

Each project ships three generated placeholders (1600 × 1000). Drop real renders in
with **the same file names** — no code changes:

```
public/projects/meridian-tower/hero-1.jpg     hero-2.jpg   hero-3.jpg
public/projects/seaform-hotel/hero-1.jpg      hero-2.jpg   hero-3.jpg
public/projects/chess-towers/hero-1.jpg       hero-2.jpg   hero-3.jpg
public/projects/infiniti/hero-1.jpg           hero-2.jpg   hero-3.jpg
public/projects/refad-place/hero-1.jpg        hero-2.jpg   hero-3.jpg
public/projects/broadway-bayonne/hero-1.jpg   hero-2.jpg   hero-3.jpg
public/projects/lorenskog-quarter/hero-1.jpg  hero-2.jpg   hero-3.jpg
public/projects/sports-world/hero-1.jpg       hero-2.jpg   hero-3.jpg
```

`hero-1` is the exterior hero (also the OpenGraph image), `hero-2` a secondary
exterior or amenity, `hero-3` an interior. 16:10, sRGB JPG, ideally < 400 KB.
Update alt text in `src/content/projects.ts`. Regenerate placeholders with
`node scripts/generate-placeholders.mjs`. See `public/projects/README.md`.

## Where things live

```
src/
├── app/                         routes (/, /projects, /projects/[slug], /studio, /developers)
├── content/projects.ts          8 sample projects: copy, massing, renders, finance defaults
├── lib/
│   ├── tower.ts                 ProjectMassing → BuildingSpec → floor plates (buildSite)
│   ├── finance.ts               pure pro forma: cash flow, IRR, RLV, sensitivity
│   ├── siteLayout.ts            street / water / context layout frame
│   ├── viewpoints.ts            walk-through example views
│   └── explorer.ts, format.ts, cadParser.ts, walkInput.ts
├── hooks/
│   ├── useExplorer.ts           all 3D view state (shared by every explorer)
│   ├── useYieldCalculator.ts    per-building pro-forma state + site roll-up
│   └── useCameraTween.ts        GSAP camera: focus / pose / overview + intro dolly
├── components/
│   ├── 3d/                      scene, floor plates, facades, furniture, context, post FX, walk
│   ├── explorer/                ExplorerViewport (full / hero)
│   ├── project/                 carousel, key facts, stacking plan, enquiry, workspace
│   ├── portfolio/               project card, masonry grid, status pill
│   ├── studio/                  studio app, toolbar, scenarios drawer, printable report
│   ├── site/                    header, footer, providers
│   └── ui/                      yield sidebar, charts, sensitivity, fee card, HUDs, CAD modal
└── types/index.ts
```

Common edits:

- **Projects / massing / defaults** — `src/content/projects.ts` (`massing` per building:
  zone floor counts, plate sizes, twist, `facade.finSpacing`, `balconies`, `arches`).
- **Finance model** — `src/lib/finance.ts` (method is documented at the top of the file).
- **Theme** — CSS tokens in `src/app/globals.css` (`--paper`, `--stone`, `--plaster`,
  `--ink`, `--ash`, `--oak`, `--sage`, `--brass`); dark variant via `<html data-theme="dark">`.
- **Materials / lighting** — `src/components/3d/FloorPlate.tsx`, `LightingEnvironment.tsx`,
  `SiteContext.tsx`, `PostEffects.tsx`.

## The pro forma, briefly

Area is attributed to floors by plate footprint; value = area × zone price, so
GDV = Σ floor values. Hard, soft (% of hard) and contingency costs are spent on an
S-curve over the build term, funded equity-first then by a loan at the chosen LTC,
with interest capitalised monthly. Sales launch at 40% of the build at the chosen
absorption; pre-sales close at completion. Receipts net of commission and the 1%
AURA fee repay debt, then equity. Outputs: GDV, TDC, profit, profit on cost, margin
on GDV, equity required, peak debt, equity IRR and multiple, residual land value at
a target profit on cost, and a price ±10% × cost ±10% sensitivity grid.

## Rendering notes

- High quality: transmissive glass, planar-reflection water, N8AO, bloom, depth of
  field on the isolated floor, vignette, ACES at exposure 1.05. Low quality drops
  post-processing and reflections and renders at dpr 1; the Studio switches to Low
  automatically if the frame rate stays low.
- Photo angles (Street, Waterfront, Aerial, Podium) and a 2× PNG "Capture".
- three.js r18x removed `PCFSoftShadowMap`; shadows use PCF with `shadow.radius`.
- Reflections use `public/hdri/potsdamer_platz_1k.hdr` (Poly Haven, CC0) — bundled,
  so nothing loads from a CDN at runtime. Fonts are bundled too.

## Tech

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS · three.js via
@react-three/fiber, drei and @react-three/postprocessing (+ n8ao) · GSAP · Framer
Motion · Radix UI · Recharts · Lucide.

Illustrative figures only — not investment, valuation or financial advice.
