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

## Local AI assistant

"Ask AURA" (bottom-right on every page) is a chat assistant that runs on a **local** model, so nothing leaves the machine. It answers from the page's project, massing and pro-forma, and can drive the 3D explorer: views, floors, explode, walk-through, city backdrop, tour.

```bash
ollama serve                 # or open the Ollama app
ollama pull llama3.2         # ~2 GB, 3B params; any chat model works
npm run dev                  # the assistant needs a server: `next dev` or `next start`
```

| Env var | Default | |
|---|---|---|
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama server |
| `AURA_AI_MODEL` | `llama3.2:latest` | Ollama model tag |
| `LMSTUDIO_URL` | `http://127.0.0.1:1234` | Fallback: LM Studio's OpenAI-compatible server, used if Ollama is unreachable |
| `LMSTUDIO_MODEL` | first loaded model | LM Studio model id |

The route is `src/app/api/assistant/route.ts` (`GET` = health, `POST` = streamed reply). The UI and the explorer bridge live in `src/components/assistant/`. A page shares its explorer with one line, `useRegisterExplorer(x, { project, yieldCalc })`. The model controls the scene by writing commands such as `[[action:photo angle=aerial]]` or `[[action:floor n=12]]` on their own line (full list in `protocol.ts`). If no local model is running, or the site is a static export (which has no API routes), the panel shows "Local AI offline" with the commands to copy.

## Routes

| Route | What it is |
|---|---|
| `/` | Full-bleed live 3D hero of the flagship (The Meridian Tower) with caption bar, portfolio grid, "For developers" strip |
| `/projects` | Masonry portfolio (3 → 2 → 1 columns): image, name, client / architect, city, status |
| `/projects/[slug]` | Render carousel, key facts, live 3D explorer + yield engine with the project's defaults, unit-availability stacking plan with unit sheets, "Request Pro Forma / Book Viewing" |
| `/studio` | **AURA Studio**: explorer + full yield engine + CAD import, saved scenarios (localStorage) and Export Pro Forma (PDF, via print stylesheet) |
| `/developers` | How it works, 1% success-fee pricing, placeholder testimonials (labelled), FAQ, demo request |

## Project photos

Each project ships three 1600 × 1000 hero images **photographed from the live 3D
scene** (waterfront, street level, and an interior walk-through view). Re-shoot them
after changing a project's massing or the scene:

```bash
npm run build && npm start          # in one terminal
node scripts/capture-heroes.mjs     # in another (add --only <slug> for one project)
```

The script drives the bare `/render/<slug>` route in headless Chrome. To use your
own renders instead, drop them in with **the same file names** — no code changes:

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
Update alt text in `src/content/projects.ts`. `node scripts/generate-placeholders.mjs`
still produces flat gradient placeholders if you need them. See `public/projects/README.md`.

## Where things live

```
src/
├── app/(site)/                  public routes (/, /projects, /projects/[slug], /studio, /developers)
├── app/render/[slug]            bare full-screen scene used by scripts/capture-heroes.mjs
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
│   ├── 3d/                      scene, floor plates, facades, furniture, textures, post FX, walk
│   ├── 3d/context/              city grid, ground & roads, water & boats, trees, cars, people, lamps
│   ├── explorer/                ExplorerViewport (full / hero / bare) + RenderView
│   ├── project/                 carousel, key facts, stacking plan, enquiry, workspace
│   ├── portfolio/               project card, masonry grid, status pill
│   ├── studio/                  studio app, toolbar, scenarios drawer, printable report
│   ├── site/                    header, footer, providers
│   └── ui/                      yield sidebar, charts, sensitivity, fee card, HUDs, CAD modal
└── types/index.ts
```

Common edits:

- **Projects / massing / defaults** — `src/content/projects.ts` (`massing` per building:
  zone floor counts, plate sizes, twist, `taper` for supertalls, `facade.finSpacing`,
  `balconies`, `arches`). The flagship site includes the 100-storey Meridian Pinnacle.
- **City backdrops** — `src/lib/cityPresets.ts`: Neutral, New York, Miami, Los Angeles,
  Chicago, San Francisco, Seattle, Boston, Toronto, London and Dubai. Each preset sets light
  and haze, water colour, block grid, heights, facade materials and tints, setbacks, NYC
  water tanks, palms, vehicle mix (yellow cabs, red double-deckers, left-hand traffic),
  clothing palettes and generic landmark silhouettes. Viewers switch city from the picker
  in the explorer; each project's default is `backdrop` in `src/content/projects.ts`, and
  `/render/<slug>?city=<id>` renders any project in any city.
- **Skylines** — each preset's `skyline` block in `src/lib/cityPresets.ts`: downtown
  clusters (centre, radii, peak storeys) shape the silhouette, plus the share of round,
  podium and slender towers and of spires. Distance haze is exponential, from `sky.fogFar`.
- **Site map** — the Map button in the explorer opens `src/components/explorer/SiteMap.tsx`:
  drag a building (or use the arrow keys) to move it; neighbours, trees and people under it
  are cleared and it gets a paved pad off the plot. Layout state lives in `useExplorer`
  (`site` is the moved site, `baseSite` the original; helpers in `src/lib/siteLayout.ts`).
- **City context** — `src/components/3d/context/cityPlan.ts` (block grid, heights,
  facade kinds, driven by the preset) and the components beside it (`vehicles.ts` for car,
  taxi and bus models, `People.tsx` for walking figures, `Landmarks.tsx` for skyline
  silhouettes and bridges); textures in `src/components/3d/textures.ts`.
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
- Photo angles (Street, Waterfront, Aerial, Podium, Skyline, Drone) and a 2× PNG "Capture".
- All surface textures are procedural (canvas noise): concrete, asphalt with lane
  markings, paving, stone, plaster, wood grain, fabric weave, marble, bark, leaves,
  roof gravel and a scrolling water normal map. Neighbour facades tile per storey via
  a small instancing shader patch (`tilePerUnit`).
- Context is fully instanced: ~200 city blocks in four facade kinds, 60 cars (two
  moving lanes + parked), ~110 pedestrians, ~90 trees in three species, lamps,
  benches and boats — about 25 draw calls in total.
- three.js r18x removed `PCFSoftShadowMap`; shadows use PCF with `shadow.radius`.
- Reflections use `public/hdri/potsdamer_platz_1k.hdr` (Poly Haven, CC0) — bundled,
  so nothing loads from a CDN at runtime. Fonts are bundled too.

## Tech

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS · three.js via
@react-three/fiber, drei and @react-three/postprocessing (+ n8ao) · GSAP · Framer
Motion · Radix UI · Recharts · Lucide.

Illustrative figures only — not investment, valuation or financial advice.
