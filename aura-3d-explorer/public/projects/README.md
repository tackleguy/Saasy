# Project imagery

Each sample project has three hero renders:

```
public/projects/<slug>/hero-1.jpg   exterior hero from the water (also the OpenGraph image)
public/projects/<slug>/hero-2.jpg   street level at the podium
public/projects/<slug>/hero-3.jpg   interior — living-room walk-through view
```

The files shipped here are **photographed from the live 3D scene** by
`scripts/capture-heroes.mjs` (headless Chrome against a production build, via the
bare `/render/<slug>` route). Re-run it after changing a project's massing:

```
npm run build && npm start        # terminal 1
node scripts/capture-heroes.mjs   # terminal 2  (--only <slug> for one project, --base <url> for another port)
```

To use real renders instead, replace the files using **the same names** — no code
changes needed.

- Size: 1600 × 1000 px (16:10) or larger at the same ratio; JPG, sRGB.
- Keep each file under ~400 KB (next/image resizes and serves AVIF/WebP).
- Alt text lives with the project in `src/content/projects.ts` (`heroImages`).

`node scripts/generate-placeholders.mjs` still writes flat gradient placeholders if
you ever need them.

Slugs: `meridian-tower`, `seaform-hotel`, `chess-towers`, `infiniti`,
`refad-place`, `broadway-bayonne`, `lorenskog-quarter`, `sports-world`.
