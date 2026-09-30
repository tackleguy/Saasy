# AURA 3D Explorer & Yield Engine

An interactive real-estate showcase: a procedurally generated 19-floor tower in 3D,
wired to a live financial yield model and a 1% success-fee calculator.

## Run it on your computer (about 5 minutes)

1. Install **Node.js** (the "LTS" version) from https://nodejs.org — just click through the installer.
2. Unzip this folder somewhere easy, like your Desktop.
3. Open **Terminal** (Mac: press Cmd+Space, type "Terminal", press Enter).
4. Type `cd ` (with a space), drag the unzipped folder into the Terminal window, press Enter.
5. Type `npm install` and press Enter. Wait for it to finish (1–2 minutes).
6. Type `npm run dev` and press Enter.
7. Open http://localhost:3000 in your browser.

To stop it, click the Terminal window and press Ctrl+C.

## Put it on the web

The easiest route is **Vercel** (free tier): push this folder to a GitHub repo, then
"Import Project" at https://vercel.com — it detects Next.js automatically.

## Where things live

| What you might want to change | File |
|---|---|
| Floor counts, heights, shapes, colours of each zone | `lib/building.ts` (`ZONES` and `generateTower`) |
| Slider ranges, default values, the 1% fee rate | `lib/finance.ts` (`INPUT_RANGES`, `DEFAULT_INPUTS`, `SUCCESS_FEE_RATE`) |
| Furniture layouts per floor type | `components/three/geometry.ts` (`layoutFor`) |
| Camera moves, lighting, neighbouring buildings | `components/three/Scene.tsx` |
| Sidebar KPIs, chart, zone table | `components/dashboard/YieldDashboard.tsx` |
| 1% fee card | `components/dashboard/FeeCard.tsx` |
| CAD import modal + demo form | `components/dashboard/CadModal.tsx` (see the `TODO` to connect a CRM) |
| CAD file parsing (.stl / .dxf / .dwg) | `lib/cadParser.ts` |

## Tech

Next.js 15 (App Router) · Tailwind CSS · Three.js via @react-three/fiber + drei · GSAP camera
tweens · Framer Motion · Radix UI · Recharts · Lucide icons. Fonts (Instrument Serif + Inter)
are bundled locally, so nothing loads from Google at runtime.

The "Request demo" form is a front-end mock — it shows a success message but doesn't send
anything yet. Figures are illustrative only.
