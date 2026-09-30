/**
 * Generates placeholder hero renders for every sample project:
 *   public/projects/<slug>/hero-{1,2,3}.jpg   (1600 × 1000)
 *
 * Soft sky→ground gradient in the project's palette, a simple massing
 * silhouette, the project name and a clear "placeholder" label, so the site
 * never shows a broken image. Replace the JPGs with real renders (same names).
 *
 *   node scripts/generate-placeholders.mjs
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "projects");

// Keep in sync with src/content/projects.ts (slug, name, palette, shot captions, tower heights).
const PROJECTS = [
  { slug: "meridian-tower", name: "The Meridian Tower", sky: "#dfe6e8", ground: "#d8d0c2", accent: "#9C7A52", shots: ["Waterfront at golden hour", "Podium arcade", "Sky penthouse living room"], towers: [0.55, 0.78, 0.32] },
  { slug: "seaform-hotel", name: "Seaform Hotel", sky: "#e3eaec", ground: "#e8dfd0", accent: "#8E9E86", shots: ["Curved balconies from the beach", "Lobby lounge", "Suite terrace"], towers: [0.5] },
  { slug: "chess-towers", name: "Chess Towers", sky: "#e4e7ea", ground: "#d5d1c9", accent: "#8B6B44", shots: ["Twin towers from the river", "Fluted facade detail", "Sky lobby"], towers: [0.72, 0.64] },
  { slug: "infiniti", name: "Infiniti", sky: "#f0e6d6", ground: "#e6dccb", accent: "#B89A5C", shots: ["Three towers from the water", "Marina promenade", "Sky residence"], towers: [0.7, 0.84, 0.77] },
  { slug: "refad-place", name: "REFAD Place", sky: "#e7e9e4", ground: "#d9cfbf", accent: "#9C7A52", shots: ["Timber fins at dusk", "Atrium", "Roof terrace"], towers: [0.34] },
  { slug: "broadway-bayonne", name: "Broadway in Bayonne", sky: "#e8e5df", ground: "#d6c7b3", accent: "#a2694a", shots: ["Arcade on Broadway", "Corner retail", "Loft interior"], towers: [0.3] },
  { slug: "lorenskog-quarter", name: "Lørenskog Quarter", sky: "#e5eaec", ground: "#dcd3c4", accent: "#8E9E86", shots: ["Courtyard", "Timber balconies", "Family living room"], towers: [0.24, 0.27] },
  { slug: "sports-world", name: "Sports World", sky: "#e6e8ea", ground: "#d9d3c8", accent: "#6E6A63", shots: ["Perforated tower", "Sports hall", "Club lounge"], towers: [0.62] },
];

const W = 1600;
const H = 1000;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Exterior: towers as soft rectangles with fine vertical lines (mullions). */
function exterior(p, variant) {
  const horizon = variant === 1 ? 700 : 760;
  const n = p.towers.length;
  const gap = 90;
  const tw = variant === 1 ? 240 : 170;
  const total = n * tw + (n - 1) * gap;
  let x = (W - total) / 2 + (variant === 1 ? 120 : 0);
  let out = "";
  for (const t of p.towers) {
    const h = t * (horizon - 90) * (variant === 1 ? 1.15 : 1);
    const y = horizon - h;
    out += `<rect x="${x}" y="${y}" width="${tw}" height="${h}" fill="url(#glass)" />`;
    for (let lx = x + 14; lx < x + tw; lx += 14) out += `<line x1="${lx}" y1="${y}" x2="${lx}" y2="${horizon}" stroke="${p.accent}" stroke-opacity="0.35" stroke-width="2" />`;
    for (let ly = y + 22; ly < horizon; ly += 22) out += `<line x1="${x}" y1="${ly}" x2="${x + tw}" y2="${ly}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1" />`;
    // Reflection in the water
    out += `<rect x="${x}" y="${horizon}" width="${tw}" height="${Math.min(h * 0.45, H - horizon)}" fill="url(#glass)" opacity="0.25" />`;
    x += tw + gap;
  }
  return { horizon, shapes: out };
}

/** Interior: floor, ceiling line, tall window grid and a sofa-ish block. */
function interior(p) {
  let out = `<rect x="0" y="690" width="${W}" height="${H - 690}" fill="${p.ground}" />`;
  out += `<rect x="0" y="0" width="${W}" height="120" fill="#f3efe8" />`;
  for (let x = 120; x < W; x += 260) out += `<rect x="${x}" y="120" width="10" height="570" fill="${p.accent}" fill-opacity="0.55" />`;
  out += `<rect x="420" y="560" width="620" height="120" rx="40" fill="#f1ebe0" /><rect x="420" y="520" width="620" height="70" rx="30" fill="#e7dfd2" />`;
  out += `<rect x="1130" y="600" width="170" height="80" fill="#b08d63" />`;
  return { horizon: 690, shapes: out };
}

function svg(p, i) {
  const scene = i === 2 ? interior(p) : exterior(p, i);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.sky}" /><stop offset="0.75" stop-color="#f6f4ef" /><stop offset="1" stop-color="${p.ground}" />
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c9d8dc" /><stop offset="1" stop-color="#9fb2b6" />
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9c8c9" /><stop offset="1" stop-color="#8fa4a6" />
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)" />
  ${i === 2 ? "" : `<rect x="0" y="${scene.horizon}" width="${W}" height="${H - scene.horizon}" fill="url(#water)" />`}
  ${scene.shapes}
  <!-- Label kept inside the centre 50% so portrait / square crops in the grid never cut it -->
  <rect x="0" y="${H - 170}" width="${W}" height="170" fill="#f6f4ef" fill-opacity="0.82" />
  <text x="${W / 2}" y="${H - 100}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="54" fill="#1c1b19">${esc(p.name)}</text>
  <text x="${W / 2}" y="${H - 62}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="21" fill="#6e6a63">${esc(p.shots[i])} · placeholder render</text>
  <text x="${W / 2}" y="${H - 34}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#8a857d">replace /projects/${p.slug}/hero-${i + 1}.jpg</text>
</svg>`;
}

for (const p of PROJECTS) {
  for (let i = 0; i < 3; i++) {
    const out = join(root, p.slug, `hero-${i + 1}.jpg`);
    mkdirSync(dirname(out), { recursive: true });
    await sharp(Buffer.from(svg(p, i))).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toFile(out);
  }
  console.log("✓", p.slug);
}
