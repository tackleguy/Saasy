# Project imagery

Each sample project has three hero renders:

```
public/projects/<slug>/hero-1.jpg   exterior hero (also the OpenGraph image)
public/projects/<slug>/hero-2.jpg   secondary exterior / amenity
public/projects/<slug>/hero-3.jpg   interior
```

The files shipped here are generated placeholders (soft gradient, massing
silhouette, project name). Replace them with real renders using **the same
file names** — no code changes needed.

- Size: 1600 × 1000 px (16:10) or larger at the same ratio; JPG, sRGB.
- Keep each file under ~400 KB (next/image resizes and serves AVIF/WebP).
- Alt text lives with the project in `src/content/projects.ts` (`heroImages`).

To regenerate the placeholders: `node scripts/generate-placeholders.mjs`.

Slugs: `meridian-tower`, `seaform-hotel`, `chess-towers`, `infiniti`,
`refad-place`, `broadway-bayonne`, `lorenskog-quarter`, `sports-world`.
