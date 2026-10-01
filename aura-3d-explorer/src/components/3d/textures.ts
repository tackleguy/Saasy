/**
 * Procedural textures — generated on a canvas at load, no image downloads.
 * -----------------------------------------------------------------------------
 * Gradient noise and fBm drive every surface: concrete, asphalt, paving,
 * stone, plaster, wood, weave and bouclé, leather, brushed metal, marble,
 * bark, leaves, roof gravel, skin and hair, plus five neighbour facades.
 * Each surface also gets a matching bump map so joints, grain and pores
 * catch the light. Results are cached, so each texture is built once.
 *
 * Sizes stay at 256 px because the maps repeat; anisotropy keeps tiled
 * ground crisp at grazing angles. Integer noise frequencies keep tiles seamless.
 */
import * as THREE from "three";

/* ------------------------------------------------------------------- noise */

/** Seeded PRNG. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Periodic gradient noise, 0–1. Integer frequencies tile. */
function makeNoise(seed: number) {
  const r = rng(seed);
  const N = 64;
  const gx = new Float32Array(N * N);
  const gy = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const a = r() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const xf = x - x0;
    const yf = y - y0;
    const u = fade(xf);
    const v = fade(yf);
    const dot = (ix: number, iy: number, dx: number, dy: number) => {
      const i = (iy & (N - 1)) * N + (ix & (N - 1));
      return gx[i] * dx + gy[i] * dy;
    };
    const n00 = dot(x0, y0, xf, yf);
    const n10 = dot(x0 + 1, y0, xf - 1, yf);
    const n01 = dot(x0, y0 + 1, xf, yf - 1);
    const n11 = dot(x0 + 1, y0 + 1, xf - 1, yf - 1);
    const n = n00 + (n10 - n00) * u + (n01 - n00) * v + (n00 - n10 - n01 + n11) * u * v;
    const t = n * 0.707 + 0.5;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  };
}

/** Fractal Brownian motion, 0–1. */
function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x, y) * amp;
    norm += amp;
    x *= lacunarity;
    y *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}

/** Ridged fBm — sharp creases, 0–1. */
function ridged(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise(x, y) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    x *= 2;
    y *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Cell hash, 0–1, stable for integer lattice coords. */
function hash(ix: number, iy: number) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/* ----------------------------------------------------------------- helpers */

const SIZE = 256;

type RGB = [number, number, number];

const cache = new Map<string, THREE.Texture>();

interface Surface {
  map: THREE.Texture;
  bump: THREE.Texture;
}

const surfaces = new Map<string, Surface>();

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

function finish(c: HTMLCanvasElement, opts: { srgb?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Clone a cached texture and set how many times it repeats. Does not mutate the original. */
export function repeatTexture(src: THREE.Texture, rx: number, ry = rx): THREE.Texture {
  const t = src.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const byte = (n: number) => {
  const v = Math.round(n);
  return v < 0 ? 0 : v > 255 ? 255 : v;
};
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Colour + height (0–1) for every pixel. Height becomes the bump map. */
function raster(size: number, fn: (u: number, v: number) => { rgb: RGB; h: number }) {
  const { c, ctx } = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { rgb, h } = fn(x / size, y / size);
      const i = y * size + x;
      height[i] = h;
      const o = i * 4;
      d[o] = byte(rgb[0]);
      d[o + 1] = byte(rgb[1]);
      d[o + 2] = byte(rgb[2]);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { color: c, height };
}

function heightToBump(height: Float32Array, size: number) {
  const { c, ctx } = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < height.length; i++) {
    const h = height[i];
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const span = max - min || 1;
  for (let i = 0; i < height.length; i++) {
    const g = ((height[i] - min) / span) * 255;
    const o = i * 4;
    d[o] = d[o + 1] = d[o + 2] = g;
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, { srgb: false });
}

function cachedSurface(key: string, make: () => { color: HTMLCanvasElement; height: Float32Array }): Surface {
  let s = surfaces.get(key);
  if (!s) {
    const built = make();
    s = { map: finish(built.color), bump: heightToBump(built.height, built.color.width) };
    surfaces.set(key, s);
  }
  return s;
}

/** Soft multiply so drawn facades pick up a little grain. */
function grainPass(c: HTMLCanvasElement, amount: number, seed: number) {
  const n = makeNoise(seed);
  const ctx = c.getContext("2d")!;
  const size = c.width;
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = (fbm(n, (x / size) * 18, (y / size) * 18, 3) - 0.5) * amount;
      const i = (y * size + x) * 4;
      d[i] = byte(d[i] + g);
      d[i + 1] = byte(d[i + 1] + g);
      d[i + 2] = byte(d[i + 2] + g);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------------------------------------------------------------- surfaces */

/** Board-formed concrete: aggregate, pour clouds and faint form lines. */
export const concreteTexture = () => concreteSurface().map;
export const concreteBump = () => concreteSurface().bump;
function concreteSurface() {
  return cachedSurface("concrete", () => {
    const n = makeNoise(3);
    const base = hexToRgb("#ddd8d0");
    const dark = hexToRgb("#b7b1a6");
    const chip = hexToRgb("#9a948a");
    const pale = hexToRgb("#f3f0ea");
    return raster(SIZE, (u, v) => {
      const cloud = fbm(n, u * 6, v * 6, 4);
      const grain = fbm(n, u * 48, v * 48, 3);
      const form = 0.5 + 0.5 * Math.sin(v * Math.PI * 10 + fbm(n, u * 3, v * 2, 2) * 2);
      const speckle = fbm(n, u * 140, v * 140, 2);
      let rgb = mix(base, dark, cloud * 0.28 + grain * 0.22 + form * 0.06);
      if (speckle > 0.72) rgb = mix(rgb, speckle > 0.86 ? pale : chip, 0.55);
      const h = cloud * 0.35 + grain * 0.25 + (speckle > 0.72 ? 0.35 : 0) + form * 0.08;
      return { rgb, h };
    });
  });
}

/** Asphalt: packed aggregate, tar patches and hairline cracks. */
export const asphaltTexture = () => asphaltSurface().map;
export const asphaltBump = () => asphaltSurface().bump;
function asphaltSurface() {
  return cachedSurface("asphalt", () => {
    const n = makeNoise(5);
    const base = hexToRgb("#6e6c68");
    const dark = hexToRgb("#3e3d3a");
    const stone = hexToRgb("#9a9892");
    return raster(SIZE, (u, v) => {
      const patch = fbm(n, u * 5, v * 5, 4);
      const grain = fbm(n, u * 70, v * 70, 3);
      const grit = fbm(n, u * 160, v * 160, 2);
      const crack = ridged(n, u * 7, v * 9, 4);
      let t = patch * 0.45 + grain * 0.4;
      let rgb = mix(base, dark, t);
      if (grit > 0.66) rgb = mix(rgb, stone, (grit - 0.66) * 1.6);
      if (crack > 0.78) rgb = mix(rgb, dark, (crack - 0.78) * 3);
      const h = 0.45 + grain * 0.35 + (grit > 0.66 ? 0.4 : 0) - (crack > 0.78 ? 0.55 : 0);
      return { rgb, h };
    });
  });
}

/**
 * Main-road tile: worn asphalt, wheel paths, a dashed centre line and solid edges.
 * One tile spans the road's full width (v) and 6 units along it (u).
 */
export const roadTexture = () => roadSurface().map;
export const roadBump = () => roadSurface().bump;
function roadSurface() {
  return cachedSurface("road", () => {
    const n = makeNoise(5);
    const base = hexToRgb("#6a6864");
    const dark = hexToRgb("#3a3936");
    const stone = hexToRgb("#a19e97");
    const built = raster(SIZE, (u, v) => {
      const patch = fbm(n, u * 5, v * 4, 4);
      const grain = fbm(n, u * 55, v * 55, 3);
      const grit = fbm(n, u * 150, v * 150, 2);
      const lane = Math.exp(-((v - 0.27) ** 2) / 0.004) + Math.exp(-((v - 0.73) ** 2) / 0.004);
      let rgb = mix(base, dark, patch * 0.4 + grain * 0.35 + lane * 0.14);
      if (grit > 0.68) rgb = mix(rgb, stone, (grit - 0.68) * 1.4);
      return { rgb, h: 0.4 + grain * 0.4 + (grit > 0.68 ? 0.35 : 0) - lane * 0.12 };
    });
    const ctx = built.color.getContext("2d")!;
    const s = SIZE;
    const paint = (x: number, y: number, w: number, h: number, alpha: number) => {
      ctx.fillStyle = `rgba(236, 232, 220, ${alpha})`;
      ctx.fillRect(x, y, w, h);
    };
    paint(0, s * 0.025, s, s * 0.018, 0.92);
    paint(0, s * 0.957, s, s * 0.018, 0.92);
    // Centre dash wears at the ends so repeats don't look stamped.
    paint(s * 0.12, s * 0.491, s * 0.5, s * 0.016, 0.88);
    ctx.fillStyle = "rgba(90, 88, 82, 0.35)";
    ctx.fillRect(s * 0.12, s * 0.491, s * 0.04, s * 0.016);
    ctx.fillRect(s * 0.58, s * 0.491, s * 0.04, s * 0.016);
    return built;
  });
}

/** Flagstone paving: each slab its own tone, with a recessed joint. */
export const pavingTexture = () => pavingSurface().map;
export const pavingBump = () => pavingSurface().bump;
function pavingSurface() {
  return cachedSurface("paving", () => {
    const n = makeNoise(9);
    const cols = 4;
    const rows = 4;
    return raster(SIZE, (u, v) => {
      const su = Math.floor(u * cols);
      const sv = Math.floor(v * rows);
      const fu = (u * cols) % 1;
      const fv = (v * rows) % 1;
      const edge = Math.min(fu, fv, 1 - fu, 1 - fv);
      const joint = edge < 0.045;
      const tone = hash(su + 2, sv + 5);
      const base = mix(hexToRgb("#e7e2d8"), hexToRgb("#cfc6b6"), tone * 0.85);
      const grain = fbm(n, u * 28 + su, v * 28 + sv, 3);
      let rgb = mix(base, hexToRgb("#b7ad9e"), grain * 0.28);
      if (joint) rgb = mix(hexToRgb("#6f675c"), rgb, edge / 0.045);
      else if (edge < 0.09) rgb = mix(rgb, hexToRgb("#f7f4ee"), 0.35);
      const h = joint ? 0.05 : 0.55 + grain * 0.3 + tone * 0.15;
      return { rgb, h };
    });
  });
}

/** Travertine: honey bands, pits and a soft polish. */
export const stoneTexture = () => stoneSurface().map;
export const stoneBump = () => stoneSurface().bump;
function stoneSurface() {
  return cachedSurface("stone", () => {
    const n = makeNoise(7);
    const base = hexToRgb("#efe6d6");
    const honey = hexToRgb("#d9c4a4");
    const pit = hexToRgb("#a89880");
    return raster(SIZE, (u, v) => {
      const warp = fbm(n, u * 3, v * 2, 3);
      const band = 0.5 + 0.5 * Math.sin((v * 16 + warp * 3) * Math.PI);
      const grain = fbm(n, u * 22, v * 22, 3);
      const pores = fbm(n, u * 90, v * 70, 2);
      let rgb = mix(base, honey, band * 0.45 + grain * 0.2);
      const hole = pores > 0.71;
      if (hole) rgb = mix(rgb, pit, 0.65);
      return { rgb, h: 0.6 + band * 0.15 + grain * 0.15 - (hole ? 0.7 : 0) };
    });
  });
}

/** Plaster: fine mottling, almost flat, so walls stay quiet. */
export const plasterTexture = (hex = "#efe9df") => plasterSurface(hex).map;
export const plasterBump = (hex = "#efe9df") => plasterSurface(hex).bump;
function plasterSurface(hex: string) {
  return cachedSurface(`plaster:${hex}`, () => {
    const n = makeNoise(11 + hex.length);
    const base = hexToRgb(hex);
    const dark = mix(base, [0, 0, 0], 0.1);
    const warm = mix(base, [255, 244, 220], 0.15);
    return raster(SIZE, (u, v) => {
      const cloud = fbm(n, u * 4, v * 4, 4);
      const fine = fbm(n, u * 36, v * 36, 2);
      const rgb = mix(mix(base, warm, cloud * 0.35), dark, fine * 0.28);
      return { rgb, h: cloud * 0.4 + fine * 0.2 };
    });
  });
}

/** Wood: irregular growth rings, pores and a few rays. Grain runs along v. */
export const woodTexture = (light: string, dark: string, seed = 13) => woodSurface(light, dark, seed).map;
export const woodBump = (light: string, dark: string, seed = 13) => woodSurface(light, dark, seed).bump;
function woodSurface(light: string, dark: string, seed: number) {
  return cachedSurface(`wood:${light}:${dark}:${seed}`, () => {
    const n = makeNoise(seed);
    const a = hexToRgb(light);
    const b = hexToRgb(dark);
    return raster(SIZE, (u, v) => {
      const warp = fbm(n, u * 2, v * 5, 4);
      const rings = u * 26 + warp * 0.35 + fbm(n, u * 8, v * 1.5, 2) * 0.2;
      const late = Math.pow(clamp01(0.5 + 0.5 * Math.sin(rings * Math.PI * 2)), 1.6);
      const pore = fbm(n, u * 80, v * 6, 2);
      const ray = Math.pow(clamp01(0.5 + 0.5 * Math.sin((v * 40 + warp) * Math.PI)), 18);
      let rgb = mix(a, b, late * 0.72 + (pore > 0.62 ? 0.22 : 0));
      rgb = mix(rgb, a, ray * 0.18);
      const h = 0.35 + (1 - late) * 0.4 + (pore > 0.62 ? 0.15 : 0);
      return { rgb, h };
    });
  });
}

export type FabricStyle = "weave" | "boucle" | "linen";

/** Cloth: a plain weave, a nubby bouclé, or a fine linen. */
export const fabricTexture = (hex: string, style: FabricStyle = "weave") => fabricSurface(hex, style).map;
export const fabricBump = (hex: string, style: FabricStyle = "weave") => fabricSurface(hex, style).bump;
function fabricSurface(hex: string, style: FabricStyle) {
  return cachedSurface(`fabric:${hex}:${style}`, () => {
    const n = makeNoise(17 + hex.length);
    const base = hexToRgb(hex);
    const shadow = mix(base, [0, 0, 0], style === "linen" ? 0.14 : 0.28);
    const hi = mix(base, [255, 255, 255], 0.2);
    const threads = style === "linen" ? 72 : style === "boucle" ? 28 : 46;
    return raster(SIZE, (u, v) => {
      const ix = Math.floor(u * threads);
      const iy = Math.floor(v * threads);
      const tu = (u * threads) % 1;
      const tv = (v * threads) % 1;
      const warpOver = ix % 2 === iy % 2;
      const thread = warpOver ? Math.sin(tu * Math.PI) : Math.sin(tv * Math.PI);
      const slub = fbm(n, u * 10, v * 10, 3);
      let t = (1 - thread) * 0.55 + slub * 0.12;
      let h = thread * 0.7 + 0.15;
      if (style === "boucle") {
        const cx = Math.floor(u * 22);
        const cy = Math.floor(v * 22);
        const loop = hash(cx, cy);
        const dx = (u * 22) % 1 - 0.5;
        const dy = (v * 22) % 1 - 0.5;
        const d = Math.hypot(dx, dy);
        if (loop > 0.55 && d < 0.32) {
          t *= 0.35;
          h = 0.9;
        }
      }
      const rgb = mix(mix(base, hi, thread * 0.35), shadow, t);
      return { rgb, h };
    });
  });
}

/** Marble: domain-warped veins over a crystalline ground. */
export const marbleTexture = () => marbleSurface().map;
export const marbleBump = () => marbleSurface().bump;
function marbleSurface() {
  return cachedSurface("marble", () => {
    const n = makeNoise(19);
    const base = hexToRgb("#f4f0e8");
    const warm = hexToRgb("#e7dcc8");
    const vein = hexToRgb("#9e978c");
    return raster(SIZE, (u, v) => {
      const wx = fbm(n, u * 3, v * 3, 4);
      const wy = fbm(n, u * 3 + 5.2, v * 3 + 1.7, 4);
      const crystal = fbm(n, u * 24, v * 24, 2);
      const major = Math.pow(Math.abs(Math.sin((u * 5 + wx * 6) * Math.PI)), 10);
      const minor = Math.pow(Math.abs(Math.sin((u * 11 + v * 2 + wy * 8) * Math.PI)), 22);
      let rgb = mix(base, warm, crystal * 0.35 + wy * 0.15);
      const veins = clamp01(major * 0.85 + minor * 0.65);
      rgb = mix(rgb, vein, veins);
      return { rgb, h: 0.55 - veins * 0.45 + crystal * 0.1 };
    });
  });
}

/** Bark: vertical fissures, ridges and lenticels. */
export const barkTexture = () => barkSurface().map;
export const barkBump = () => barkSurface().bump;
function barkSurface() {
  return cachedSurface("bark", () => {
    const n = makeNoise(23);
    const a = hexToRgb("#8a7358");
    const b = hexToRgb("#3e3126");
    const lichen = hexToRgb("#9aa484");
    return raster(SIZE, (u, v) => {
      const warp = fbm(n, u * 2, v * 6, 3);
      const fissure = Math.abs(Math.sin((u * 16 + warp * 2.2) * Math.PI));
      const crack = Math.pow(1 - fissure, 2.4);
      const grain = fbm(n, u * 40, v * 12, 2);
      const lent = hash(Math.floor(u * 48), Math.floor(v * 36)) > 0.94;
      let rgb = mix(a, b, crack * 0.85 + grain * 0.2);
      if (lent) rgb = mix(rgb, lichen, 0.45);
      if (fbm(n, u * 3 + 4, v * 3, 2) > 0.72) rgb = mix(rgb, lichen, 0.2);
      return { rgb, h: fissure * 0.85 + grain * 0.1 - (lent ? 0.05 : 0) };
    });
  });
}

/** Leaves: clumped foliage with soft internal veins. Tinted per tree by instance color. */
export const leafTexture = () => leafSurface().map;
export const leafBump = () => leafSurface().bump;
function leafSurface() {
  return cachedSurface("leaf", () => {
    const n = makeNoise(29);
    const light = hexToRgb("#d5ddc4");
    const mid = hexToRgb("#8b9a72");
    const dark = hexToRgb("#4e5c40");
    return raster(SIZE, (u, v) => {
      const clump = fbm(n, u * 7, v * 7, 5);
      const fleck = fbm(n, u * 36, v * 36, 2);
      const vein = Math.pow(Math.abs(Math.sin((u * 5 + v * 2 + fbm(n, u * 2, v * 2, 2) * 3) * Math.PI)), 6);
      let rgb = mix(light, mid, clump * 0.85);
      rgb = mix(rgb, dark, fleck * 0.28 + vein * 0.35);
      return { rgb, h: clump * 0.7 + fleck * 0.2 - vein * 0.25 };
    });
  });
}

/** Roof gravel over a darker membrane. */
export const roofTexture = () => roofSurface().map;
export const roofBump = () => roofSurface().bump;
function roofSurface() {
  return cachedSurface("roof", () => {
    const n = makeNoise(31);
    const membrane = hexToRgb("#5e5a54");
    return raster(SIZE, (u, v) => {
      const cells = 22;
      const cx = Math.floor(u * cells);
      const cy = Math.floor(v * cells);
      const jx = (hash(cx, cy) - 0.5) * 0.55;
      const jy = (hash(cx + 4, cy + 1) - 0.5) * 0.55;
      const fx = (u * cells) % 1 - 0.5 - jx;
      const fy = (v * cells) % 1 - 0.5 - jy;
      const d = Math.hypot(fx, fy);
      const tone = hash(cx + 9, cy + 3);
      const stone = mix(hexToRgb("#c4bfb4"), hexToRgb("#7a756c"), tone);
      const onStone = d < 0.34 + tone * 0.08;
      const shade = onStone ? clamp01(0.55 + (0.34 - d) * 1.4) : 0;
      const rgb = onStone ? mix(membrane, stone, 0.55 + shade * 0.45) : mix(membrane, hexToRgb("#3a3834"), fbm(n, u * 8, v * 8, 2) * 0.4);
      return { rgb, h: onStone ? 0.45 + shade * 0.55 : 0.08 };
    });
  });
}

/** Calf leather: pores and a few creases. */
export const leatherTexture = (hex: string) => leatherSurface(hex).map;
export const leatherBump = (hex: string) => leatherSurface(hex).bump;
function leatherSurface(hex: string) {
  return cachedSurface(`leather:${hex}`, () => {
    const n = makeNoise(43);
    const base = hexToRgb(hex);
    const dark = mix(base, [0, 0, 0], 0.45);
    const hi = mix(base, [255, 230, 200], 0.25);
    return raster(SIZE, (u, v) => {
      const pore = fbm(n, u * 55, v * 55, 2);
      const grain = fbm(n, u * 12, v * 12, 3);
      const crease = Math.pow(Math.abs(Math.sin((u * 2.5 + fbm(n, u * 2, v * 3, 3) * 4) * Math.PI)), 8);
      let rgb = mix(base, hi, grain * 0.25);
      rgb = mix(rgb, dark, (pore > 0.58 ? (pore - 0.58) * 1.2 : 0) + crease * 0.55);
      return { rgb, h: 0.5 + grain * 0.2 - crease * 0.45 - (pore > 0.58 ? 0.2 : 0) };
    });
  });
}

/** Brushed metal: fine anisotropic streaks and the odd scratch. */
export const brushedMetalTexture = (hex = "#c5ccd2") => metalSurface(hex).map;
export const brushedMetalBump = (hex = "#c5ccd2") => metalSurface(hex).bump;
function metalSurface(hex: string) {
  return cachedSurface(`metal:${hex}`, () => {
    const n = makeNoise(47 + hex.charCodeAt(1));
    const base = hexToRgb(hex);
    const dark = mix(base, [0, 0, 0], 0.35);
    const hi = mix(base, [255, 255, 255], 0.28);
    return raster(SIZE, (u, v) => {
      const streak = fbm(n, u * 3, v * 120, 2);
      const scratch = hash(Math.floor(u * 180), Math.floor(v * 3)) > 0.985;
      let rgb = mix(dark, hi, streak);
      rgb = mix(base, rgb, 0.55);
      if (scratch) rgb = mix(rgb, hi, 0.65);
      return { rgb, h: streak * 0.25 + (scratch ? 0.9 : 0.4) };
    });
  });
}

/** Neutral skin detail. Multiplied by each person's skin colour. */
export const skinTexture = () => skinSurface().map;
export const skinBump = () => skinSurface().bump;
function skinSurface() {
  return cachedSurface("skin", () => {
    const n = makeNoise(53);
    return raster(SIZE, (u, v) => {
      const blotch = fbm(n, u * 5, v * 5, 3);
      const pore = fbm(n, u * 80, v * 80, 2);
      const t = blotch * 0.06 + pore * 0.1 + (pore > 0.74 ? 0.08 : 0);
      return { rgb: mix([255, 248, 242], [196, 176, 164], t), h: 0.6 - (pore > 0.74 ? 0.35 : 0) + blotch * 0.1 };
    });
  });
}

/** Hair strands. Multiplied by each person's hair colour. */
export const hairTexture = () => hairSurface().map;
function hairSurface() {
  return cachedSurface("hair", () => {
    const n = makeNoise(59);
    return raster(SIZE, (u, v) => {
      const warp = fbm(n, u * 2, v * 6, 3);
      const strand = 0.5 + 0.5 * Math.sin((u * 48 + warp * 2) * Math.PI);
      const gap = Math.pow(1 - strand, 1.15);
      const rgb = mix([252, 250, 246], [168, 164, 158], gap * 0.42);
      return { rgb, h: strand };
    });
  });
}

/** High-key earth, so a preset ground colour still reads through it. */
export const earthTexture = () => earthSurface().map;
export const earthBump = () => earthSurface().bump;
function earthSurface() {
  return cachedSurface("earth", () => {
    const n = makeNoise(61);
    return raster(SIZE, (u, v) => {
      const patch = fbm(n, u * 4, v * 4, 4);
      const grit = fbm(n, u * 40, v * 40, 2);
      const pebble = grit > 0.78;
      const t = patch * 0.16 + grit * 0.08 + (pebble ? 0.12 : 0);
      return { rgb: mix([248, 246, 240], [186, 178, 166], t), h: patch * 0.4 + (pebble ? 0.7 : grit * 0.2) };
    });
  });
}

/** Soft ceramic speckle for glossy whiteware. */
export const ceramicTexture = () => ceramicSurface().map;
function ceramicSurface() {
  return cachedSurface("ceramic", () => {
    const n = makeNoise(67);
    return raster(SIZE, (u, v) => {
      const speck = fbm(n, u * 60, v * 60, 2);
      const t = speck > 0.8 ? 0.07 : fbm(n, u * 8, v * 8, 2) * 0.03;
      return { rgb: mix([252, 251, 248], [210, 206, 198], t), h: 0.5 + t };
    });
  });
}

/**
 * Water normal map: broad swells plus small chop, tangent-space.
 * Scrolled every frame by the water component.
 */
export const waterNormalTexture = () =>
  cached("waterNormal", () => {
    const n = makeNoise(37);
    const size = SIZE;
    const h = (u: number, v: number) => fbm(n, u * 5, v * 5, 5, 2.05, 0.5) * 0.62 + fbm(n, u * 26 + 4, v * 22 + 9, 3) * 0.38;
    const e = 1 / size;
    const strength = 7;
    const { c, ctx } = canvas(size, size);
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const dx = (h(u + e, v) - h(u - e, v)) * strength;
        const dy = (h(u, v + e) - h(u, v - e)) * strength;
        const nx = -dx;
        const ny = -dy;
        const nz = 1;
        const len = Math.hypot(nx, ny, nz) || 1;
        const i = (y * size + x) * 4;
        d[i] = byte(((nx / len) * 0.5 + 0.5) * 255);
        d[i + 1] = byte(((ny / len) * 0.5 + 0.5) * 255);
        d[i + 2] = byte(((nz / len) * 0.5 + 0.5) * 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, { srgb: false });
  });

/* ---------------------------------------------------------------- facades */

export type FacadeKind = "glass" | "brick" | "plaster" | "stone" | "tower";

/** A recessed window: frame, sky glass, a warm lower reflection, mullion and sill. */
function paintWindow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: string,
  glassTop: string,
  glassBot: string
) {
  ctx.fillStyle = "rgba(24, 18, 14, 0.38)";
  ctx.fillRect(x + 2, y + 4, w, h);
  ctx.fillStyle = frame;
  ctx.fillRect(x, y, w, h);
  const inset = Math.max(3, Math.round(Math.min(w, h) * 0.07));
  const gx = x + inset;
  const gy = y + inset;
  const gw = w - inset * 2;
  const gh = h - inset * 2;
  const g = ctx.createLinearGradient(gx, gy, gx + gw * 0.15, gy + gh);
  g.addColorStop(0, glassTop);
  g.addColorStop(0.42, glassBot);
  g.addColorStop(1, glassTop);
  ctx.fillStyle = g;
  ctx.fillRect(gx, gy, gw, gh);
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.fillRect(gx, gy, gw, Math.max(2, Math.round(gh * 0.1)));
  ctx.fillStyle = "rgba(255, 206, 160, 0.16)";
  ctx.fillRect(gx, gy + Math.round(gh * 0.62), gw, Math.round(gh * 0.38));
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.moveTo(gx, gy + gh * 0.18);
  ctx.lineTo(gx + gw * 0.62, gy);
  ctx.lineTo(gx + gw * 0.78, gy);
  ctx.lineTo(gx, gy + gh * 0.42);
  ctx.fill();
  ctx.fillStyle = frame;
  const m = Math.max(2, Math.round(inset * 0.45));
  ctx.fillRect(gx + Math.round(gw / 2) - Math.floor(m / 2), gy, m, gh);
  ctx.fillRect(gx, gy + Math.round(gh * 0.46), gw, m);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(x - 3, y + h, w + 6, Math.max(3, Math.round(h * 0.045)));
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x + 1, y + h + 4, w - 2, 4);
}

function fillBricks(ctx: CanvasRenderingContext2D, size: number) {
  const course = Math.max(5, Math.round(size / 32));
  const brickW = Math.round(course * 2.15);
  const mortar = Math.max(1, Math.round(course * 0.16));
  const palette = ["#c4967e", "#b4836c", "#a8745c", "#d0a48c", "#9a6a54", "#c48b74"];
  ctx.fillStyle = "#d9cfc3";
  ctx.fillRect(0, 0, size, size);
  let row = 0;
  for (let y = 0; y < size; y += course) {
    const offset = (row % 2) * Math.round(brickW / 2);
    for (let x = -brickW; x < size + brickW; x += brickW) {
      const tone = hash(row + 3, Math.round(x / brickW) + row);
      ctx.fillStyle = palette[Math.floor(tone * palette.length) % palette.length];
      ctx.globalAlpha = lerp(0.88, 1, tone);
      ctx.fillRect(x + offset + mortar, y + mortar, brickW - mortar * 2, course - mortar * 2);
    }
    row++;
  }
  ctx.globalAlpha = 1;
}

function fillAshlar(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = "#cfc4b2";
  ctx.fillRect(0, 0, size, size);
  const course = Math.round(size / 7);
  const palette = ["#e4d9c6", "#d5c8b2", "#cbbba2", "#eee4d4", "#c4b49c"];
  let y = 0;
  let row = 0;
  while (y < size) {
    const h = course + ((row % 3) - 1);
    let x = -((row % 2) * Math.round(size / 9));
    let col = 0;
    while (x < size) {
      const w = Math.round(size / (4 + (hash(row, col) > 0.6 ? 2 : 0)));
      const tone = hash(row + 1, col + 2);
      ctx.fillStyle = palette[Math.floor(tone * palette.length) % palette.length];
      ctx.fillRect(x + 2, y + 2, w - 3, h - 3);
      x += w;
      col++;
    }
    y += h;
    row++;
  }
}

/**
 * Neighbour facade tile: ONE storey high × ONE bay wide (the shader repeats it
 * per metre of the building, so windows keep a real size on any block).
 */
export const facadeTexture = (kind: FacadeKind) =>
  kind === "tower" ? towerFacadeTexture() : cached(`facade:${kind}`, () => {
    const size = SIZE;
    const { c, ctx } = canvas(size, size);
    if (kind === "brick") fillBricks(ctx, size);
    else if (kind === "stone") fillAshlar(ctx, size);
    else if (kind === "plaster") {
      const n = makeNoise(41);
      const base = hexToRgb("#efe8dc");
      const dark = hexToRgb("#d5ccbe");
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const t = fbm(n, (x / size) * 10, (y / size) * 10, 4);
          const [r, g, b] = mix(base, dark, t * 0.65);
          const i = (y * size + x) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, "#c5d0d4");
      g.addColorStop(0.5, "#8ea3ab");
      g.addColorStop(1, "#7d929b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }

    if (kind === "glass") {
      ctx.fillStyle = "#3c474c";
      ctx.fillRect(0, 0, size, 4);
      ctx.fillRect(0, size - 4, size, 4);
      ctx.fillRect(0, 0, 4, size);
      ctx.fillRect(size - 4, 0, 4, size);
      ctx.fillRect(size / 2 - 2, 4, 3, size - 8);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(6, 8, size * 0.28, size * 0.22);
    } else {
      const win =
        kind === "stone"
          ? { x: size * 0.22, y: size * 0.16, w: size * 0.56, h: size * 0.6 }
          : kind === "brick"
            ? { x: size * 0.26, y: size * 0.18, w: size * 0.48, h: size * 0.52 }
            : { x: size * 0.24, y: size * 0.16, w: size * 0.52, h: size * 0.56 };
      const frame = kind === "brick" ? "#f3efe6" : kind === "stone" ? "#f7f3ea" : "#fbf8f2";
      paintWindow(ctx, win.x, win.y, win.w, win.h, frame, "#d5e4ea", "#6d868f");
    }
    grainPass(c, kind === "glass" ? 10 : 16, 41);
    return finish(c);
  });

/**
 * Curtain-wall tile for office / high-rise towers: one storey × one bay of
 * vision glass, a slim mullion, and an opaque spandrel at the slab.
 */
const towerFacadeTexture = () =>
  cached("facade:tower", () => {
    const size = SIZE;
    const { c, ctx } = canvas(size, size);
    const g = ctx.createLinearGradient(0, 0, size * 0.2, size);
    g.addColorStop(0, "#d5e3ea");
    g.addColorStop(0.22, "#b7c9d2");
    g.addColorStop(0.55, "#8fa6b0");
    g.addColorStop(0.82, "#7b909a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // Horizon band so a stack of storeys reads as sky, not a flat tint.
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(0, size * 0.18, size, size * 0.08);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.moveTo(0, size * 0.08);
    ctx.lineTo(size * 0.55, 0);
    ctx.lineTo(size * 0.72, 0);
    ctx.lineTo(0, size * 0.28);
    ctx.fill();
    // Faint floor plate seen through the glass.
    ctx.fillStyle = "rgba(255, 214, 170, 0.07)";
    ctx.fillRect(0, size * 0.62, size, size * 0.16);
    // Spandrel
    const spandrel = Math.round(size * 0.16);
    ctx.fillStyle = "#4e5c64";
    ctx.fillRect(0, size - spandrel, size, spandrel);
    ctx.fillStyle = "#7d8c94";
    ctx.fillRect(0, size - spandrel, size, 3);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, size - 4, size, 4);
    // Mullions
    ctx.fillStyle = "#2f3940";
    ctx.fillRect(0, 0, 4, size);
    ctx.fillRect(size - 3, 0, 3, size);
    ctx.fillRect(size / 2 - 2, 0, 3, size - spandrel);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(4, 0, 1, size - spandrel);
    grainPass(c, 8, 71);
    return finish(c);
  });

/**
 * Patches a MeshStandardMaterial so an instanced box's texture repeats per
 * world unit instead of stretching with the instance's scale: the UVs are
 * multiplied by the instance scale of the two axes that span each face.
 * Colour, bump, normal and roughness maps all share that scale.
 * `perUnit` = tiles per scene unit (e.g. 1 storey ≈ 0.9 units → ~1.1).
 */
export function tilePerUnit(material: THREE.MeshStandardMaterial, perUnit: number, shape: "box" | "cylinder" = "box") {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPerUnit = { value: perUnit };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uPerUnit;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec3 an = abs(normal);
          ${shape === "cylinder"
            ? "vec2 face = an.y > 0.5 ? isc.xz : vec2(3.14159 * isc.x, isc.y);"
            : "vec2 face = an.z > 0.5 ? isc.xy : (an.x > 0.5 ? isc.zy : isc.xz);"}
          vec2 tiled = uv * face * uPerUnit;
          #ifdef USE_MAP
            vMapUv = tiled;
          #endif
          #ifdef USE_BUMPMAP
            vBumpMapUv = tiled;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = tiled;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = tiled;
          #endif
          #ifdef USE_METALNESSMAP
            vMetalnessMapUv = tiled;
          #endif
        #endif`
      );
  };
  material.customProgramCacheKey = () => `tile:${perUnit}:${shape}`;
}
