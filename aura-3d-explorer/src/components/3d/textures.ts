/**
 * Procedural textures — generated on a canvas at load, no image downloads.
 * -----------------------------------------------------------------------------
 * A small value-noise / fBm kernel drives every surface: concrete, asphalt,
 * stone, plaster, wood grain, fabric weave, marble veins, bark, leaves, a
 * water normal map, roof gravel and four kinds of neighbour facade (glass,
 * brick, plaster, stone) with window grids. Results are cached, so each
 * texture is built once per page.
 *
 * Sizes are kept small (256–512 px) because the maps are tiled with
 * RepeatWrapping; anisotropy is set so tiled ground textures stay crisp at
 * grazing angles.
 */
import * as THREE from "three";

/* ------------------------------------------------------------------- noise */

/** Seeded PRNG. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Value noise with a 64² lattice; returns 0–1. */
function makeNoise(seed: number) {
  const r = rng(seed);
  const N = 64;
  const lattice = new Float32Array(N * N);
  for (let i = 0; i < lattice.length; i++) lattice[i] = r();
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x) & (N - 1);
    const yi = Math.floor(y) & (N - 1);
    const xf = smooth(x - Math.floor(x));
    const yf = smooth(y - Math.floor(y));
    const a = lattice[yi * N + xi];
    const b = lattice[yi * N + ((xi + 1) & (N - 1))];
    const c = lattice[((yi + 1) & (N - 1)) * N + xi];
    const d = lattice[((yi + 1) & (N - 1)) * N + ((xi + 1) & (N - 1))];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/** Fractal Brownian motion of `octaves` value-noise layers, 0–1. */
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

/* ----------------------------------------------------------------- helpers */

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

function finish(c: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: [number, number] } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.repeat.set(...opts.repeat);
  t.needsUpdate = true;
  return t;
}

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Fill a canvas from a per-pixel colour function (x, y in 0–1). */
function shade(size: number, fn: (u: number, v: number) => [number, number, number]) {
  const { c, ctx } = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------------------------------------------------------------- surfaces */

/** Light concrete: fine grain + faint pour lines. */
export const concreteTexture = () =>
  cached("concrete", () => {
    const n = makeNoise(3);
    const base = hexToRgb("#d9d4cb");
    const dark = hexToRgb("#b9b3a8");
    return finish(
      shade(256, (u, v) => {
        const grain = fbm(n, u * 40, v * 40, 4);
        const pour = 0.5 + 0.5 * Math.sin(v * Math.PI * 6 + fbm(n, u * 6, v * 6, 2) * 3);
        return mix(base, dark, grain * 0.35 + pour * 0.08);
      })
    );
  });

/** Asphalt: dark, coarse grain. */
export const asphaltTexture = () =>
  cached("asphalt", () => {
    const n = makeNoise(5);
    const base = hexToRgb("#8a8884");
    const dark = hexToRgb("#5f5d59");
    return finish(shade(256, (u, v) => mix(base, dark, fbm(n, u * 90, v * 90, 3) * 0.7 + fbm(n, u * 8, v * 8, 2) * 0.2)));
  });

/**
 * Main-road tile: asphalt with a dashed centre line and solid edge lines.
 * One tile spans the road's full width (v) and 6 units along it (u).
 */
export const roadTexture = () =>
  cached("road", () => {
    const n = makeNoise(5);
    const base = hexToRgb("#8a8884");
    const dark = hexToRgb("#5f5d59");
    const size = 256;
    const c = shade(size, (u, v) => mix(base, dark, fbm(n, u * 60, v * 60, 3) * 0.7 + fbm(n, u * 6, v * 6, 2) * 0.2));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(244,241,234,0.85)";
    ctx.fillRect(0, size * 0.03, size, size * 0.012); // edge lines
    ctx.fillRect(0, size * 0.958, size, size * 0.012);
    ctx.fillRect(size * 0.15, size * 0.494, size * 0.45, size * 0.012); // centre dash (tile = 6 units → 2.7 dash)
    return finish(c);
  });

/** Pale paving: large slabs with joints. */
export const pavingTexture = () =>
  cached("paving", () => {
    const n = makeNoise(9);
    const base = hexToRgb("#e2ddd3");
    const dark = hexToRgb("#c7c0b3");
    const size = 256;
    const c = shade(size, (u, v) => {
      const joint = Math.min((u * 4) % 1, 1 - ((u * 4) % 1), (v * 4) % 1, 1 - ((v * 4) % 1)) < 0.015 ? 1 : 0;
      return mix(base, dark, fbm(n, u * 30, v * 30, 3) * 0.3 + joint * 0.6);
    });
    return finish(c);
  });

/** Stone: warm travertine bands with pitting. */
export const stoneTexture = () =>
  cached("stone", () => {
    const n = makeNoise(7);
    const base = hexToRgb("#e6dfd3");
    const dark = hexToRgb("#c4b7a3");
    return finish(
      shade(256, (u, v) => {
        const band = 0.5 + 0.5 * Math.sin(v * Math.PI * 14 + fbm(n, u * 5, v * 5, 2) * 4);
        const pit = fbm(n, u * 80, v * 80, 2) > 0.62 ? 1 : 0;
        return mix(base, dark, band * 0.18 + pit * 0.35 + fbm(n, u * 20, v * 20, 3) * 0.15);
      })
    );
  });

/** Plaster: barely-there mottling. */
export const plasterTexture = (hex = "#efe9df") =>
  cached(`plaster:${hex}`, () => {
    const n = makeNoise(11);
    const base = hexToRgb(hex);
    const dark = mix(base, [0, 0, 0], 0.12);
    return finish(shade(128, (u, v) => mix(base, dark, fbm(n, u * 24, v * 24, 3) * 0.5)));
  });

/** Wood: grain lines wobbled by noise, running along v. */
export const woodTexture = (light: string, dark: string, seed = 13) =>
  cached(`wood:${light}:${dark}`, () => {
    const n = makeNoise(seed);
    const a = hexToRgb(light);
    const b = hexToRgb(dark);
    return finish(
      shade(256, (u, v) => {
        const wobble = fbm(n, u * 3, v * 0.6, 3) * 2.2;
        const grain = 0.5 + 0.5 * Math.sin((u * 36 + wobble) * Math.PI);
        const fine = fbm(n, u * 120, v * 4, 2) * 0.3;
        return mix(a, b, Math.pow(grain, 2.2) * 0.7 + fine);
      })
    );
  });

/** Fabric: a soft plain weave with slight slubs (bouclé-like). */
export const fabricTexture = (hex: string) =>
  cached(`fabric:${hex}`, () => {
    const n = makeNoise(17);
    const base = hexToRgb(hex);
    const shadow = mix(base, [0, 0, 0], 0.22);
    return finish(
      shade(128, (u, v) => {
        const warp = 0.5 + 0.5 * Math.sin(u * Math.PI * 32);
        const weft = 0.5 + 0.5 * Math.sin(v * Math.PI * 32);
        const slub = fbm(n, u * 18, v * 18, 2) * 0.35;
        return mix(base, shadow, Math.abs(warp - weft) * 0.55 + slub);
      })
    );
  });

/** Marble: pale ground with grey veins. */
export const marbleTexture = () =>
  cached("marble", () => {
    const n = makeNoise(19);
    const base = hexToRgb("#f0ece5");
    const vein = hexToRgb("#a9a49b");
    return finish(
      shade(256, (u, v) => {
        const warp = fbm(n, u * 4, v * 4, 4) * 6;
        const veins = Math.pow(Math.abs(Math.sin((u * 7 + v * 3 + warp) * Math.PI)), 18);
        return mix(base, vein, veins * 0.8 + fbm(n, u * 30, v * 30, 2) * 0.08);
      })
    );
  });

/** Bark: vertical ridges. */
export const barkTexture = () =>
  cached("bark", () => {
    const n = makeNoise(23);
    const a = hexToRgb("#7a6650");
    const b = hexToRgb("#4a3c2e");
    return finish(shade(128, (u, v) => mix(a, b, Math.pow(0.5 + 0.5 * Math.sin(u * Math.PI * 22 + fbm(n, u * 4, v * 8, 2) * 3), 1.5) * 0.6 + fbm(n, u * 40, v * 40, 2) * 0.3)));
  });

/** Leaves: mottled greens; the hue is tinted per tree via instanceColor. */
export const leafTexture = () =>
  cached("leaf", () => {
    const n = makeNoise(29);
    const light = hexToRgb("#c9d3b4");
    const dark = hexToRgb("#6a7a58");
    return finish(shade(128, (u, v) => mix(light, dark, fbm(n, u * 14, v * 14, 4) * 0.8 + (fbm(n, u * 60, v * 60, 2) > 0.58 ? 0.25 : 0))));
  });

/** Roof: dark gravel with a slightly lighter membrane. */
export const roofTexture = () =>
  cached("roof", () => {
    const n = makeNoise(31);
    const a = hexToRgb("#b7b2a8");
    const b = hexToRgb("#8d8880");
    return finish(shade(128, (u, v) => mix(a, b, fbm(n, u * 70, v * 70, 3) * 0.8)));
  });

/**
 * Water normal map: the gradient of layered noise, encoded as a tangent-space
 * normal. Scrolled every frame by the water component.
 */
export const waterNormalTexture = () =>
  cached("waterNormal", () => {
    const n = makeNoise(37);
    const size = 256;
    const h = (u: number, v: number) => fbm(n, u * 12, v * 12, 4, 2.1, 0.55) + 0.35 * fbm(n, u * 40 + 3, v * 40 + 7, 2);
    const e = 1 / size;
    const strength = 6;
    const c = shade(size, (u, v) => {
      const dx = (h(u + e, v) - h(u - e, v)) * strength;
      const dy = (h(u, v + e) - h(u, v - e)) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      return [((nx / len) * 0.5 + 0.5) * 255, ((ny / len) * 0.5 + 0.5) * 255, ((nz / len) * 0.5 + 0.5) * 255];
    });
    return finish(c, { srgb: false });
  });

/* ---------------------------------------------------------------- facades */

export type FacadeKind = "glass" | "brick" | "plaster" | "stone";

/**
 * Neighbour facade tile: ONE storey high × ONE bay wide (the shader repeats it
 * per metre of the building, so windows keep a real size on any block).
 */
export const facadeTexture = (kind: FacadeKind) =>
  cached(`facade:${kind}`, () => {
    const size = 128;
    const { c, ctx } = canvas(size, size);
    const n = makeNoise(41);
    const wall: Record<FacadeKind, [string, string]> = {
      glass: ["#b9c3c6", "#9aa7ab"],
      brick: ["#b98a72", "#9c6f58"],
      plaster: ["#e6e0d6", "#d2cbbf"],
      stone: ["#d9d0c0", "#bfb39f"],
    };
    const [a, b] = wall[kind].map(hexToRgb) as [[number, number, number], [number, number, number]];
    // Wall
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let t = fbm(n, (x / size) * 20, (y / size) * 20, 3) * 0.6;
        if (kind === "brick") {
          const row = Math.floor(y / 8);
          const bx = (x + (row % 2) * 16) % 32;
          if (y % 8 === 0 || bx < 2) t = 0.95; // mortar joints
        }
        const [r, g, bb] = mix(a, b, t);
        const i = (y * size + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = bb;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Window (with a lit/unlit lottery baked in as slight tint variation)
    const win = kind === "glass" ? { x: 6, y: 8, w: 116, h: 100 } : kind === "stone" ? { x: 30, y: 26, w: 68, h: 80 } : { x: 36, y: 30, w: 56, h: 72 };
    ctx.fillStyle = kind === "glass" ? "#6f8a94" : "#5d6b73";
    ctx.fillRect(win.x, win.y, win.w, win.h);
    const g = ctx.createLinearGradient(win.x, win.y, win.x + win.w, win.y + win.h);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(0.5, "rgba(255,255,255,0.05)");
    g.addColorStop(1, "rgba(200,220,230,0.25)");
    ctx.fillStyle = g;
    ctx.fillRect(win.x, win.y, win.w, win.h);
    // Frame / mullion
    ctx.strokeStyle = kind === "glass" ? "rgba(60,70,75,0.8)" : "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(win.x + 1, win.y + 1, win.w - 2, win.h - 2);
    if (kind === "glass") {
      ctx.beginPath();
      ctx.moveTo(size / 2, win.y);
      ctx.lineTo(size / 2, win.y + win.h);
      ctx.stroke();
    }
    // Sill shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(win.x, win.y + win.h, win.w, 4);
    return finish(c);
  });

/**
 * Patches a MeshStandardMaterial so an instanced box's texture repeats per
 * world unit instead of stretching with the instance's scale: the UVs are
 * multiplied by the instance scale of the two axes that span each face.
 * `perUnit` = tiles per scene unit (e.g. 1 storey ≈ 0.9 units → ~1.1).
 */
export function tilePerUnit(material: THREE.MeshStandardMaterial, perUnit: number) {
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
          vec2 face = an.z > 0.5 ? isc.xy : (an.x > 0.5 ? isc.zy : isc.xz);
          #ifdef USE_MAP
            vMapUv = uv * face * uPerUnit;
          #endif
        #endif`
      );
  };
  material.customProgramCacheKey = () => `tile:${perUnit}`;
}
