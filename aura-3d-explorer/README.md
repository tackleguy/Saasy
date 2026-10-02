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

## Sketchfab assets for the local AI

`src/content/sketchfab-models.json` contains API-sourced **candidates**, including
creator credits, licenses, triangle counts and archive sizes. Twenty-seven downloaded GLBs
are bundled under `public/models/sketchfab`: sofa, lounge chair, coffee table,
bed, skyline, seven buildings, ten city/district models, ocean, pine tree, potted plant, bench and car. The assistant only uses
`src/content/installed-models.json`; it never treats search results as installed assets.

Use Python 3.10+ from this directory:

```bash
python3 scripts/sketchfab.py source
# Configure SKETCHFAB_ACCESS_TOKEN in .env.local or your local shell.
# Set SKETCHFAB_AUTH_TYPE=Token for an API token, or Bearer for OAuth.
# Do not paste it in chat, commit it, or use a NEXT_PUBLIC_ environment variable.
python3 scripts/sketchfab.py download <model-uid>
python3 scripts/sketchfab.py install <model-uid> --size 2.4 --rotation 0
```

`--size` is the longest model dimension in real metres; `--rotation` is yaw in
degrees. Download archives and their `attribution.json` stay in ignored
`model-downloads/<uid>/`. Installation copies a self-contained GLB and credits to
`public/models/sketchfab/<uid>/` and registers it in the installed manifest.
For manual Sketchfab downloads, put `model.glb` and matching `attribution.json`
there first; attribution follows the candidate record's uid/name/category/url/
creator/license fields. A ZIP containing one GLB is also supported. Convert glTF
archives or compressed models to a self-contained, uncompressed GLB before installing.
External buffer and texture URLs are rejected so runtime assets stay local.

Restart/rebuild after installing. Ask AURA **“furnish this apartment”** to use the
first installed sofa, table, bed and plant automatically, or ask for a named asset.
The AI uses `[[action:model id=<uid>]]` and only sees installed assets (up to twelve
in its compact context). `[[action:model id=clear]]` clears library selections from
the open floor and site context. Selections last for the current explorer session.

Interior models replace whole matching furniture ensembles in the existing
collision-aware apartment planner, up to twelve replacements per floor. They keep
their proportions, fit within the ensemble footprint and ceiling, and retain the
procedural ensemble while loading or on failure. Imported floor-plan scenes are
not supported yet. Outdoor props occupy one fixed site-context position; optional
skyline cutouts appear behind the site. These placements need visual review with the actual
files, including scale, orientation, materials and surrounding geometry.

Credits for installed models appear in the site footer and beside each deployed
GLB in `attribution.json`. Candidate sourcing currently accepts CC BY and CC0,
under 150,000 faces and 50 MB per archive; these are screening limits, not measured
performance guarantees. Check the downloaded asset visually before shipping.

Official API documentation: [Sketchfab downloads](https://sketchfab.com/developers/download-api/downloading-models).

Each named city preset now loads its own Sketchfab city or district GLB, preserving
the original internal arrangement and proportions. New York defaults to truekit’s
textured Lower Manhattan. Los Angeles, Chicago, San Francisco, Seattle, Boston and
Toronto use aaelick’s textured **district samples**. London uses 333DDD’s financial
district reconstruction. Miami and Dubai use Jack M Simmons’s **untextured city
models**. The source and coverage are linked directly under the city selector.
These are creator-authored representations, not certified survey data or complete
current city coverage. The proposal remains a separate illustrative site in front
of the model; it is not inserted at a surveyed address.

Only Neutral retains the instanced illustrative buildings. Named cities no longer
scatter buildings or draw a generated street grid through the downloaded district.
One city is loaded on demand, with loading/retry feedback, and its GPU resources
are disposed on switching cities. Districts retain uniform scale with a 70-unit height cap and a setback behind the proposal. Ragged scan skirts are clipped below ground; Manhattan and London use an explicit ground-cut offset. Geometry is welded
and 16-bit position quantized, textures resized to at most 2048px and compressed.
Miami geometry is also simplified. Downloads range from approximately 8–57 MB;
large models can still take time on mobile connections. The installer normally
limits GLBs to 50 MB; use `--max-mb 100` explicitly for a reviewed large district.
Every deployed model has a CC BY attribution record and appears in the footer.

The waterfront uses the bundled Sketchfab **Ocean model** mesh, fitted to the
shoreline with reduced wave height. AURA adds scrolling ripple normals and planar
reflections in High quality; Low uses environment-lit water. The heavier animated
ocean candidate stays in ignored downloads and is not shipped. Creator credits
and geometry/material adaptations are recorded beside each model.

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
- **Studio modes** — `/studio` has a Developer / Architect switch (`?mode=architect` links to
  it). Developer is the finance dashboard. Architect swaps the sidebar for
  `src/components/studio/ArchitectPanel.tsx`: plan and N/E/S/W elevations through an
  orthographic camera clipped to the site, a measure tool (Shift for vertical), level markers,
  section cut, core X-ray, clay model, sun study by month and solar time at the city's latitude,
  a zoning envelope (height plane, FAR and coverage checks) and an area schedule with CSV export.
  State lives in `src/hooks/useArchitect.ts`, maths in `src/lib/architecture.ts`, and the 3D
  side in `src/components/3d/ArchitectLayer.tsx`.
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
