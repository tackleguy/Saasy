# AURA 3D Explorer & Yield Engine

An interactive real-estate development showcase: a procedurally generated 20-floor tower
in WebGL, a simulated CAD ingestion pipeline, and a live spatial yield engine with a
1% performance-fee model.

## Run it

1. Install **Node.js 20+** (LTS) from https://nodejs.org.
2. In this folder run `npm install`, then `npm run dev`.
3. Open http://localhost:3000.

`npm run build && npm start` runs the production build. `STATIC_EXPORT=1 npm run build`
also writes a static site to `/out` that can be hosted anywhere (Vercel, Netlify, S3…).

## What it does

| Feature | Details |
|---|---|
| Procedural tower | 20 addressable floor plates: basalt podium (F1, 12×12×1.8 m), glass offices (F2–7, 10×10×0.9 m), frosted twisting residences (F8–18, 8.5×8.5×0.85 m, +3.5°/floor), clear-glass crown penthouses with warm interior light (F19–20, 6.5×6.5×1.4 m) |
| Exploded view | Slider 0–2.5; `Y = Y_base + floorIndex × factor × 1.2` |
| Floor isolation | Click a floor (or use ↑/↓, the legend, or the programme list). It highlights, other floors dim to 0.15 opacity, and GSAP flies the camera to `P_floor + [8, 4, 8]` looking at `P_floor`. Esc or clicking empty space releases it |
| Furniture overlay | Wireframe furniture grows in on the isolated floor: office desk clusters + conference table, residential sofa/bed/kitchen island, plus podium and penthouse sets |
| Yield engine | Revenue, construction cost, gross profit, margin, developer net (after 1% fee) and the 1% fee, updated live. The unit-mix strategy redistributes value across zones (and resizes residences) without changing the headline formulas |
| CAD import | Drag-and-drop `.stl` / `.dxf` / `.dwg` → 4-stage animated pipeline with a status terminal. Stage 1 really reads the file in the browser (STL triangles & bounds, DXF entities & layers, DWG release); the later stages are simulated |

## Where things live

```
src/
├── app/                        Next.js App Router (layout, page orchestrator, global CSS)
├── components/
│   ├── 3d/
│   │   ├── BuildingScene.tsx        Canvas, OrbitControls, camera rig
│   │   ├── ProceduralBuilding.tsx   Stacks the floor plates, spire, hover label
│   │   ├── FloorPlate.tsx           One floor: materials, hover/select/dim easing
│   │   ├── FurnitureOverlay.tsx     Procedural wireframe furniture layouts
│   │   └── LightingEnvironment.tsx  Lights, shadows, sky dome, ground
│   └── ui/
│       ├── HeaderNav.tsx            Brand, view toggles, status badges
│       ├── ViewportHud.tsx          Explosion slider, reset, zone legend
│       ├── FinancialSidebar.tsx     Input sliders, strategy, KPI tiles
│       ├── FloorInspectorCard.tsx   Selected-floor overlay
│       ├── CommissionModelCard.tsx  1% fee simulator vs. traditional load
│       ├── CadUploadModal.tsx       Drag-and-drop ingestion pipeline
│       ├── FinancialChart.tsx       Recharts cost vs. revenue breakdown
│       └── primitives.tsx           GlassCard, RangeSlider, SegmentedControl…
├── hooks/
│   ├── useYieldCalculator.ts   Financial state + pure `computeYield`
│   └── useCameraTween.ts       GSAP camera/target interpolation
├── lib/
│   ├── tower.ts                Zone specs, floor generator, explosion maths
│   ├── cadParser.ts            In-browser STL/DXF/DWG inspection
│   └── format.ts               Money / number formatting
└── types/index.ts              Shared TypeScript interfaces
```

Common tweaks:

- **Floor dimensions, zones, twist**: `src/lib/tower.ts` (`ZONES`, `TWIST_DEG_PER_FLOOR`, `EXPLODE_SPACING`).
- **Materials**: `LOOKS` in `src/components/3d/FloorPlate.tsx`.
- **Camera focus offset**: `FOCUS_OFFSET` in `src/components/3d/BuildingScene.tsx`.
- **Slider ranges, defaults, fee rate, strategies**: `src/hooks/useYieldCalculator.ts`.

## Tech

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Three.js via
@react-three/fiber + drei · GSAP · Framer Motion · Radix UI · Recharts · Lucide.
Fonts (Instrument Serif + Inter) are bundled locally, so nothing is fetched from
Google at runtime. All figures are illustrative.
