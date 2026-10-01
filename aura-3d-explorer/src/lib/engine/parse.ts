/**
 * Plan parsing — DXF text and CAD JSON → room boundary polygons.
 * -----------------------------------------------------------------------------
 * Rooms are found in one of two ways:
 *   1. Closed polylines (LWPOLYLINE / POLYLINE / JSON rooms) — room boundaries
 *      drawn directly. Outer outlines that contain other rooms are dropped.
 *   2. Wall lines (LINE, open polylines, JSON walls) — the segments are
 *      snapped, split at crossings and T-junctions, door gaps are bridged
 *      (and remembered as openings), then the faces of the planar graph are
 *      traced. Faces that are too small or too thin (the cavity between a
 *      wall's two faces) are discarded.
 * Text inside a room names it ("MASTER BEDROOM"); "CH: 9'0"" sets its
 * ceiling height; "12'0" x 14'6"" dimension strings help detect units when
 * the file doesn't declare them. DXF Y becomes plan −Z (seen from above the
 * plan reads the same way), and the plan is shifted so its corner is 0, 0.
 */
import { area, bounds, centroid, cleanPolygon, dist, perimeter, pointInPolygon, signedArea, sub, type Poly, type Vec } from "./geometry";

export interface RawRoom {
  name?: string;
  polygon: Poly;
  ceilingHeight?: number;
  /** Dimension string found in the room ("12'0" x 14'6"" → metres). */
  dims?: [number, number];
}

export interface RawPlan {
  rooms: RawRoom[];
  openings: [number, number, number, number][];
  units: string;
  defaultCeiling?: number;
  unitsCount?: number;
  facts: { label: string; value: string }[];
  warnings: string[];
}

interface Text {
  text: string;
  at: Vec;
  height: number;
}

interface Source {
  closed: Poly[];
  segments: [Vec, Vec][];
  texts: Text[];
  /** Metres per drawing unit, if declared. */
  scale?: number;
  unitName?: string;
  /** DXF Y-up drawings are mirrored into plan Z. */
  flipY: boolean;
  doorArcs: { c: Vec; r: number; a0: number; a1: number }[];
  extra: Partial<Pick<RawPlan, "defaultCeiling" | "unitsCount">>;
  facts: { label: string; value: string }[];
  warnings: string[];
}

/* ---------------------------------------------------------- length parsing */

/** "9'0"", "9' 6\"", "9'-6\"", "2.7m", "2700mm", "270 cm", "108in" → metres. */
export function parseLength(raw: string): number | null {
  const s = raw.trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  const fi = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:(\d+)\/(\d+))?\s*"?)?/);
  if (fi) {
    const ft = parseFloat(fi[1]);
    const inch = (fi[2] ? parseFloat(fi[2]) : 0) + (fi[3] && fi[4] ? parseInt(fi[3]) / parseInt(fi[4]) : 0);
    return ft * 0.3048 + inch * 0.0254;
  }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m|in|"|ft)?\b/i) ?? s.match(/^(\d+(?:\.\d+)?)\s*(")/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  switch ((m[2] ?? "").toLowerCase()) {
    case "mm":
      return v / 1000;
    case "cm":
      return v / 100;
    case "m":
      return v;
    case "in":
    case '"':
      return v * 0.0254;
    case "ft":
      return v * 0.3048;
    default:
      // Bare number: guess from magnitude (ceiling heights are 2 – 6 m).
      if (v > 1000) return v / 1000;
      if (v > 100) return v / 100;
      if (v > 6) return v * 0.3048;
      return v;
  }
}

const CH_RE = /\b(?:CH|C\.H\.?|CLG(?:\s*HT)?|CEILING(?:\s*HEIGHT)?|CEIL\.?\s*HT)\s*[:=.]?\s*(.+)$/i;
const DIM_RE = /(\d+(?:\.\d+)?\s*'\s*-?\s*(?:\d+(?:\.\d+)?\s*"?)?|\d+(?:\.\d+)?\s*(?:mm|cm|m|ft)?)\s*[x×X*]\s*(\d+(?:\.\d+)?\s*'\s*-?\s*(?:\d+(?:\.\d+)?\s*"?)?|\d+(?:\.\d+)?\s*(?:mm|cm|m|ft)?)/;

function parseCeiling(t: string): number | null {
  const m = t.match(CH_RE);
  if (!m) return null;
  const v = parseLength(m[1]);
  return v && v >= 2 && v <= 8 ? v : null;
}

function parseDims(t: string): [number, number] | null {
  const m = t.match(DIM_RE);
  if (!m) return null;
  const a = parseLength(m[1]);
  const b = parseLength(m[2]);
  return a && b && a > 0.5 && b > 0.5 && a < 60 && b < 60 ? [a, b] : null;
}

/** Strip MTEXT formatting: \P breaks, {\fArial|b1;…}, \H2.5x; etc. */
function cleanMText(s: string): string {
  return s
    .replace(/\\P/g, " ")
    .replace(/\\[A-Za-z][^;\\{}]*;/g, "")
    .replace(/\\[~]/g, " ")
    .replace(/[{}]/g, "")
    .replace(/%%[cdp]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Is this text a room label (not a dimension, CH, area or note)? */
function isLabel(t: string): boolean {
  if (!t || t.length > 40) return false;
  if (CH_RE.test(t) || DIM_RE.test(t)) return false;
  if (/^\s*[\d.,'"\s-]+\s*(m²|m2|sq\.?\s*ft|sf|ft²)?\s*$/i.test(t)) return false;
  if (/\b(sq\.?\s*ft|m²|m2|scale|level|plan|drawing|dwg|sheet|north|rev)\b/i.test(t)) return false;
  return /[A-Za-z]{2,}/.test(t);
}

/* -------------------------------------------------------------------- DXF */

const DXF_UNITS: Record<number, { name: string; m: number }> = {
  1: { name: "inches", m: 0.0254 },
  2: { name: "feet", m: 0.3048 },
  4: { name: "millimetres", m: 0.001 },
  5: { name: "centimetres", m: 0.01 },
  6: { name: "metres", m: 1 },
};

function readDxf(text: string): Source {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) {
      i -= 1; // resync on stray lines
      continue;
    }
    pairs.push([code, lines[i + 1].trim()]);
  }

  const src: Source = { closed: [], segments: [], texts: [], flipY: true, doorArcs: [], extra: {}, facts: [], warnings: [] };

  // Header: $INSUNITS
  for (let i = 0; i < pairs.length - 2; i++) {
    if (pairs[i][0] === 9 && pairs[i][1] === "$INSUNITS") {
      const u = DXF_UNITS[parseInt(pairs[i + 1][1], 10)];
      if (u) {
        src.scale = u.m;
        src.unitName = u.name;
      }
      break;
    }
  }

  // Entities
  let start = pairs.findIndex((p, i) => p[0] === 2 && p[1] === "ENTITIES" && pairs[i - 1]?.[1] === "SECTION");
  if (start < 0) start = 0;
  let counts: Record<string, number> = {};
  let i = start + 1;
  const take = () => {
    // Collect group codes until the next entity (code 0).
    const out: [number, string][] = [];
    while (i < pairs.length && pairs[i][0] !== 0) out.push(pairs[i++]);
    return out;
  };
  const num = (g: [number, string][], code: number, def = 0) => {
    const f = g.find((p) => p[0] === code);
    return f ? parseFloat(f[1]) : def;
  };

  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code !== 0) {
      i++;
      continue;
    }
    if (val === "ENDSEC" || val === "EOF") break;
    i++;
    counts[val] = (counts[val] ?? 0) + 1;
    const g = take();
    switch (val) {
      case "LINE": {
        src.segments.push([
          [num(g, 10), num(g, 20)],
          [num(g, 11), num(g, 21)],
        ]);
        break;
      }
      case "LWPOLYLINE": {
        const pts: Vec[] = [];
        let x: number | null = null;
        for (const [c, v] of g) {
          if (c === 10) x = parseFloat(v);
          else if (c === 20 && x !== null) {
            pts.push([x, parseFloat(v)]);
            x = null;
          }
        }
        const closed = (num(g, 70) & 1) === 1 || (pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 1e-6);
        addPolyline(src, pts, closed);
        break;
      }
      case "POLYLINE": {
        const flags = num(g, 70);
        const pts: Vec[] = [];
        while (i < pairs.length && pairs[i][0] === 0 && pairs[i][1] === "VERTEX") {
          i++;
          const v = take();
          pts.push([num(v, 10), num(v, 20)]);
        }
        if (pairs[i]?.[1] === "SEQEND") {
          i++;
          take();
        }
        addPolyline(src, pts, (flags & 1) === 1 || (pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 1e-6));
        break;
      }
      case "TEXT":
      case "MTEXT": {
        const parts = g.filter((p) => p[0] === 3 || p[0] === 1).map((p) => p[1]);
        const t = cleanMText(parts.join(""));
        if (t) src.texts.push({ text: t, at: [num(g, 10), num(g, 20)], height: num(g, 40, 1) });
        break;
      }
      case "ARC": {
        src.doorArcs.push({ c: [num(g, 10), num(g, 20)], r: num(g, 40), a0: (num(g, 50) * Math.PI) / 180, a1: (num(g, 51) * Math.PI) / 180 });
        break;
      }
    }
  }
  const summary = Object.entries(counts)
    .filter(([k]) => ["LINE", "LWPOLYLINE", "POLYLINE", "TEXT", "MTEXT", "ARC", "INSERT"].includes(k))
    .map(([k, v]) => `${v} ${k}`)
    .join(" · ");
  src.facts.push({ label: "Entities", value: summary || "none recognised" });
  if (counts.INSERT) src.warnings.push(`${counts.INSERT} block reference(s) (INSERT) ignored — explode blocks for doors/fixtures to be read.`);
  return src;
}

function addPolyline(src: Source, pts: Vec[], closed: boolean) {
  if (pts.length < 2) return;
  if (closed && pts.length >= 3) src.closed.push(pts);
  const n = closed ? pts.length : pts.length - 1;
  for (let k = 0; k < n; k++) src.segments.push([pts[k], pts[(k + 1) % pts.length]]);
}

/* --------------------------------------------------------------- CAD JSON */

const UNIT_NAMES: Record<string, { name: string; m: number }> = {
  mm: { name: "millimetres", m: 0.001 },
  millimeters: { name: "millimetres", m: 0.001 },
  millimetres: { name: "millimetres", m: 0.001 },
  cm: { name: "centimetres", m: 0.01 },
  m: { name: "metres", m: 1 },
  meters: { name: "metres", m: 1 },
  metres: { name: "metres", m: 1 },
  in: { name: "inches", m: 0.0254 },
  inch: { name: "inches", m: 0.0254 },
  inches: { name: "inches", m: 0.0254 },
  ft: { name: "feet", m: 0.3048 },
  feet: { name: "feet", m: 0.3048 },
};

/** [x, y] | {x, y} | {x, z} → Vec (drawing units, y up). */
function pt(v: unknown): Vec | null {
  if (Array.isArray(v) && v.length >= 2 && v.every((n, k) => k > 2 || typeof n === "number")) return [v[0] as number, v[1] as number];
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const x = o.x ?? o.X;
    const y = o.y ?? o.Y ?? o.z ?? o.Z;
    if (typeof x === "number" && typeof y === "number") return [x, y];
  }
  return null;
}

const ptList = (v: unknown): Vec[] => (Array.isArray(v) ? v.map(pt).filter((p): p is Vec => !!p) : []);

function readCadJson(o: Record<string, unknown>): Source {
  const src: Source = { closed: [], segments: [], texts: [], flipY: false, doorArcs: [], extra: {}, facts: [], warnings: [] };
  const unitKey = String(o.units ?? o.unit ?? "").toLowerCase();
  const u = UNIT_NAMES[unitKey];
  if (u) {
    src.scale = u.m;
    src.unitName = u.name;
  }
  // Y-up drawings (DXF-like JSON) are mirrored like DXF unless they say "z".
  src.flipY = String(o.upAxis ?? o.yAxis ?? "").toLowerCase() === "up";
  const ch = o.ceilingHeight ?? o.defaultCeilingHeight ?? o.ch;
  if (typeof ch === "number") src.extra.defaultCeiling = ch * (src.scale ?? 1) > 1.8 && ch * (src.scale ?? 1) < 8 ? ch * (src.scale ?? 1) : undefined;
  else if (typeof ch === "string") src.extra.defaultCeiling = parseLength(ch) ?? undefined;
  const uc = o.unitsCount ?? o.units_count;
  if (typeof uc === "number") src.extra.unitsCount = uc;

  const rooms = Array.isArray(o.rooms) ? o.rooms : [];
  for (const r of rooms as Record<string, unknown>[]) {
    const poly = ptList(r.polygon ?? r.points ?? r.vertices ?? r.boundary ?? r.outline);
    if (poly.length < 3) continue;
    src.closed.push(poly);
    const name = r.name ?? r.label ?? r.type;
    const c = centroid(poly);
    if (typeof name === "string") src.texts.push({ text: name, at: c, height: 10 });
    const rch = r.ceilingHeight ?? r.height ?? r.ch;
    if (typeof rch === "number") src.texts.push({ text: `CH ${rch}${unitKey && unitKey !== "m" ? unitKey : "m"}`, at: c, height: 1 });
    else if (typeof rch === "string") src.texts.push({ text: `CH ${rch}`, at: c, height: 1 });
  }

  const walls = Array.isArray(o.walls) ? o.walls : Array.isArray(o.lines) ? o.lines : [];
  for (const w of walls as unknown[]) {
    if (Array.isArray(w)) {
      const ps = ptList(w);
      for (let k = 0; k + 1 < ps.length; k++) src.segments.push([ps[k], ps[k + 1]]);
      continue;
    }
    const r = w as Record<string, unknown>;
    const a = pt(r.start ?? r.from ?? r.a ?? (typeof r.x1 === "number" ? [r.x1, r.y1] : null));
    const b = pt(r.end ?? r.to ?? r.b ?? (typeof r.x2 === "number" ? [r.x2, r.y2] : null));
    if (a && b) src.segments.push([a, b]);
    const ps = ptList(r.points ?? r.vertices);
    for (let k = 0; k + 1 < ps.length; k++) src.segments.push([ps[k], ps[k + 1]]);
  }

  const labels = Array.isArray(o.labels) ? o.labels : Array.isArray(o.texts) ? o.texts : Array.isArray(o.annotations) ? o.annotations : [];
  for (const l of labels as Record<string, unknown>[]) {
    const at = pt(l.position ?? l.at ?? l.point ?? (typeof l.x === "number" ? [l.x, l.y ?? l.z] : null));
    const t = l.text ?? l.label ?? l.value;
    if (at && typeof t === "string") src.texts.push({ text: t, at, height: 1 });
  }

  // DXF-style entity lists.
  const ents = Array.isArray(o.entities) ? o.entities : [];
  for (const e of ents as Record<string, unknown>[]) {
    const type = String(e.type ?? "").toUpperCase();
    if (type === "LINE") {
      const vs = Array.isArray(e.vertices) ? (e.vertices as unknown[]) : undefined;
      const a = pt(e.start ?? vs?.[0]);
      const b = pt(e.end ?? vs?.[1]);
      if (a && b) src.segments.push([a, b]);
    } else if (type === "LWPOLYLINE" || type === "POLYLINE") {
      addPolyline(src, ptList(e.vertices ?? e.points), !!(e.closed ?? e.shape));
    } else if (type === "TEXT" || type === "MTEXT") {
      const at = pt(e.position ?? e.insert ?? e.startPoint);
      const t = e.text ?? e.string;
      if (at && typeof t === "string") src.texts.push({ text: cleanMText(t), at, height: 1 });
    }
  }
  if (ents.length) src.flipY = true;

  src.facts.push({
    label: "CAD JSON",
    value: [rooms.length && `${rooms.length} rooms`, walls.length && `${walls.length} walls`, labels.length && `${labels.length} labels`, ents.length && `${ents.length} entities`].filter(Boolean).join(" · ") || "no geometry keys",
  });
  return src;
}

/* -------------------------------------------------------- planar faces */

interface Graph {
  pts: Vec[];
  adj: Map<number, Set<number>>;
}

/** Snap endpoints, split at crossings / T-junctions and build an undirected graph. */
function buildGraph(segs: [Vec, Vec][], tol: number): Graph {
  // Split every segment at points where others cross or touch it.
  const cuts: number[][] = segs.map(() => [0, 1]);
  for (let a = 0; a < segs.length; a++) {
    const [p, p2] = segs[a];
    const r = sub(p2, p);
    const rl = Math.hypot(r[0], r[1]);
    if (rl < tol) continue;
    for (let b = a + 1; b < segs.length; b++) {
      const [q, q2] = segs[b];
      const s = sub(q2, q);
      const den = r[0] * s[1] - r[1] * s[0];
      const qp = sub(q, p);
      if (Math.abs(den) > 1e-12) {
        const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
        const u = (qp[0] * r[1] - qp[1] * r[0]) / den;
        const sl = Math.hypot(s[0], s[1]);
        const et = tol / rl;
        const eu = tol / (sl || 1);
        if (t >= -et && t <= 1 + et && u >= -eu && u <= 1 + eu) {
          cuts[a].push(Math.min(1, Math.max(0, t)));
          cuts[b].push(Math.min(1, Math.max(0, u)));
        }
      } else {
        // Collinear overlap: cut each at the other's endpoints.
        const off = Math.abs(qp[0] * r[1] - qp[1] * r[0]) / rl;
        if (off > tol) continue;
        const proj = (v: Vec) => ((v[0] - p[0]) * r[0] + (v[1] - p[1]) * r[1]) / (rl * rl);
        for (const v of [q, q2]) {
          const t = proj(v);
          if (t > 0 && t < 1) cuts[a].push(t);
        }
        const sl2 = s[0] * s[0] + s[1] * s[1];
        if (sl2 > 0)
          for (const v of [p, p2]) {
            const u = ((v[0] - q[0]) * s[0] + (v[1] - q[1]) * s[1]) / sl2;
            if (u > 0 && u < 1) cuts[b].push(u);
          }
      }
    }
  }

  const pts: Vec[] = [];
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
  const idOf = (v: Vec) => {
    const gx = Math.round(v[0] / tol);
    const gy = Math.round(v[1] / tol);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of grid.get(`${gx + dx},${gy + dy}`) ?? []) if (dist(pts[id], v) <= tol) return id;
      }
    pts.push(v);
    const k = key(v[0], v[1]);
    grid.set(k, [...(grid.get(k) ?? []), pts.length - 1]);
    return pts.length - 1;
  };
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  segs.forEach(([p, p2], k) => {
    const ts = [...new Set(cuts[k].map((t) => Math.round(t * 1e6) / 1e6))].sort((x, y) => x - y);
    let prev = idOf(p);
    for (const t of ts.slice(1)) {
      const id = idOf([p[0] + (p2[0] - p[0]) * t, p[1] + (p2[1] - p[1]) * t]);
      link(prev, id);
      prev = id;
    }
  });
  return { pts, adj };
}

/**
 * Bridge door gaps: a dangling wall end is joined to another dangling end
 * straight ahead of it (≤ maxGap), and the bridge is recorded as an opening.
 */
function bridgeGaps(g: Graph, maxGap: number): [Vec, Vec][] {
  const openings: [Vec, Vec][] = [];
  const dangling = () => [...g.adj.entries()].filter(([, s]) => s.size === 1).map(([id]) => id);
  const used = new Set<number>();
  for (const a of dangling()) {
    if (used.has(a)) continue;
    const nb = [...g.adj.get(a)!][0];
    const dir = sub(g.pts[a], g.pts[nb]);
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    let best = -1;
    let bestD = Infinity;
    for (const b of dangling()) {
      if (b === a || used.has(b)) continue;
      const v = sub(g.pts[b], g.pts[a]);
      const d = Math.hypot(v[0], v[1]);
      if (d < 0.5 || d > maxGap) continue;
      const cos = (v[0] * dir[0] + v[1] * dir[1]) / (d * dl);
      if (cos > 0.95 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (best >= 0) {
      used.add(a);
      used.add(best);
      g.adj.get(a)!.add(best);
      g.adj.get(best)!.add(a);
      openings.push([g.pts[a], g.pts[best]]);
    }
  }
  // Prune remaining spurs.
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [id, s] of g.adj) {
      if (s.size <= 1) {
        for (const n of s) g.adj.get(n)?.delete(id);
        g.adj.delete(id);
        pruned = true;
      }
    }
  }
  return openings;
}

/** Trace the bounded faces of a planar graph (CCW rings). */
function traceFaces(g: Graph): Poly[] {
  const order = new Map<number, number[]>();
  for (const [v, s] of g.adj) {
    const pv = g.pts[v];
    order.set(
      v,
      [...s].sort((a, b) => Math.atan2(g.pts[a][1] - pv[1], g.pts[a][0] - pv[0]) - Math.atan2(g.pts[b][1] - pv[1], g.pts[b][0] - pv[0]))
    );
  }
  const seen = new Set<string>();
  const faces: Poly[] = [];
  for (const [u, s] of g.adj) {
    for (const v of s) {
      if (seen.has(`${u}>${v}`)) continue;
      const ring: number[] = [];
      let a = u;
      let b = v;
      let guard = 0;
      while (!seen.has(`${a}>${b}`) && guard++ < 10000) {
        seen.add(`${a}>${b}`);
        ring.push(a);
        // At b, turn to the neighbour just clockwise of the way we came in.
        const nbrs = order.get(b)!;
        const k = nbrs.indexOf(a);
        const next = nbrs[(k - 1 + nbrs.length) % nbrs.length];
        a = b;
        b = next;
      }
      if (ring.length >= 3) {
        const poly = ring.map((id) => g.pts[id]);
        if (signedArea(poly) > 0) faces.push(poly);
      }
    }
  }
  return faces;
}

/* ------------------------------------------------------------------- main */

function guessScale(src: Source): { m: number; name: string; how: string } {
  if (src.scale) return { m: src.scale, name: src.unitName ?? "declared", how: "declared" };
  // Calibrate from a room dimension string if we can match one.
  const polys = src.closed.length ? src.closed : [];
  for (const t of src.texts) {
    const dims = parseDims(t.text);
    if (!dims) continue;
    const room = polys.find((p) => pointInPolygon(t.at, p));
    if (!room) continue;
    const ratio = Math.sqrt((dims[0] * dims[1]) / area(room));
    const known = [0.001, 0.01, 0.0254, 0.3048, 1];
    const best = known.reduce((x, y) => (Math.abs(Math.log(y / ratio)) < Math.abs(Math.log(x / ratio)) ? y : x));
    if (Math.abs(Math.log(best / ratio)) < 0.35) {
      const name = { 0.001: "millimetres", 0.01: "centimetres", 0.0254: "inches", 0.3048: "feet", 1: "metres" }[best]!;
      return { m: best, name, how: `calibrated from "${t.text}"` };
    }
  }
  const all = [...src.segments.flat(), ...src.closed.flat()];
  const b = bounds(all.length ? all : [[0, 0]]);
  const E = Math.max(b.w, b.d);
  const imperial = src.texts.some((t) => /\d\s*'/.test(t.text));
  if (E > 2500) return { m: 0.001, name: "millimetres", how: "guessed from extents" };
  if (E > 250) return imperial ? { m: 0.0254, name: "inches", how: "guessed from extents" } : { m: 0.01, name: "centimetres", how: "guessed from extents" };
  if (E > 60) return { m: 0.3048, name: "feet", how: "guessed from extents" };
  return { m: 1, name: "metres", how: "guessed from extents" };
}

function toPlan(src: Source): RawPlan {
  const { m, name, how } = guessScale(src);
  const warnings = [...src.warnings];
  const facts = [...src.facts, { label: "Units", value: `${name} (${how})` }];
  const tf = (v: Vec): Vec => [v[0] * m, (src.flipY ? -v[1] : v[1]) * m];

  const texts = src.texts.map((t) => ({ ...t, at: tf(t.at) }));
  let polys: Poly[] = [];
  let openings: [Vec, Vec][] = [];

  // 1. Closed room boundaries.
  const closed = src.closed.map((p) => cleanPolygon(p.map(tf))).filter((p) => p.length >= 3 && area(p) >= 1 && area(p) <= 2000);
  const labelled = closed.filter((p) => texts.some((t) => isLabel(t.text) && pointInPolygon(t.at, p)));
  if (labelled.length >= 2 || (closed.length && !src.segments.length)) {
    const cand = labelled.length >= 2 ? labelled : closed;
    // Drop outlines that contain other rooms.
    polys = cand.filter((p) => cand.filter((q) => q !== p && area(q) < area(p) && pointInPolygon(centroid(q), p)).length < 2);
    facts.push({ label: "Rooms from", value: `${polys.length} closed boundaries` });
  }

  // 2. Wall lines → planar faces.
  if (!polys.length && src.segments.length) {
    const segs = src.segments.map(([a, b]) => [tf(a), tf(b)] as [Vec, Vec]).filter(([a, b]) => dist(a, b) > 0.01);
    if (segs.length > 6000) warnings.push(`Large drawing: only the first 6000 of ${segs.length} segments were traced.`);
    const g = buildGraph(segs.slice(0, 6000), 0.02);
    openings = bridgeGaps(g, 1.6);
    const faces = traceFaces(g)
      .map((f) => cleanPolygon(f))
      .filter((f) => f.length >= 3);
    // Real rooms: big enough and not a wall cavity (area / perimeter ≈ half the width).
    const rooms = faces.filter((f) => area(f) >= 1.2 && area(f) / perimeter(f) >= 0.28);
    // The outline of the whole plan can appear as a face when walls are single lines around a courtyard — drop faces containing others.
    polys = rooms.filter((p) => rooms.filter((q) => q !== p && area(q) < area(p) && pointInPolygon(centroid(q), p)).length < 2);
    facts.push({ label: "Rooms from", value: `${polys.length} faces traced from ${segs.length} wall segments` });
    if (openings.length) facts.push({ label: "Openings", value: `${openings.length} door gap(s) bridged` });
  }

  // Door arcs → openings (hinge to the leaf's closed position along the wall).
  for (const a of src.doorArcs) {
    const r = a.r * m;
    if (r < 0.55 || r > 1.3) continue;
    const sweep = (((a.a1 - a.a0) * 180) / Math.PI + 360) % 360;
    if (Math.abs(sweep - 90) > 15) continue;
    const c = tf(a.c);
    const ends = [a.a0, a.a1].map((ang) => tf([a.c[0] + Math.cos(ang) * a.r, a.c[1] + Math.sin(ang) * a.r]));
    // Pick the end closer to an already-known opening or the shorter wall gap: use the first.
    openings.push([c, ends[0]]);
  }

  if (!polys.length) warnings.push("No closed rooms found. Draw room boundaries as closed polylines, or walls as lines with door gaps under 1.6 m.");

  // Name, ceiling and dimension text per room.
  const rooms: RawRoom[] = polys.map((p) => {
    const inside = texts.filter((t) => pointInPolygon(t.at, p));
    const label = inside.filter((t) => isLabel(t.text)).sort((a, b) => b.height - a.height)[0];
    let ch: number | undefined;
    let dims: [number, number] | undefined;
    for (const t of inside) {
      ch ??= parseCeiling(t.text) ?? undefined;
      dims ??= parseDims(t.text) ?? undefined;
    }
    return { name: label?.text, polygon: p, ceilingHeight: ch, dims };
  });

  // Plan-wide ceiling note ("CH 2.7m typ.") outside any room.
  let defaultCeiling = src.extra.defaultCeiling;
  if (!defaultCeiling) {
    for (const t of texts) {
      if (polys.some((p) => pointInPolygon(t.at, p))) continue;
      const c = parseCeiling(t.text);
      if (c) {
        defaultCeiling = c;
        break;
      }
    }
  }

  // Shift so the plan's corner sits at 0, 0.
  const b = bounds(rooms.flatMap((r) => r.polygon).concat(openings.flat()));
  const shift = (v: Vec): Vec => [v[0] - (Number.isFinite(b.minX) ? b.minX : 0), v[1] - (Number.isFinite(b.minZ) ? b.minZ : 0)];
  for (const r of rooms) r.polygon = r.polygon.map(shift);
  const shiftedOpenings = openings.map(([a, c]) => {
    const [x1, z1] = shift(a);
    const [x2, z2] = shift(c);
    return [x1, z1, x2, z2] as [number, number, number, number];
  });

  return { rooms, openings: shiftedOpenings, units: name, defaultCeiling, unitsCount: src.extra.unitsCount, facts, warnings };
}

export type InputKind = "dxf" | "cad-json" | "scene-json" | "dwg" | "unknown";

export function detectKind(fileName: string, text: string): InputKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "dwg" || text.startsWith("AC10")) return "dwg";
  const t = text.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const o = JSON.parse(t);
      if (o && typeof o === "object" && Array.isArray(o.rooms) && o.rooms.some((r: Record<string, unknown>) => Array.isArray(r?.furniture) || r?.flooring)) return "scene-json";
      return "cad-json";
    } catch {
      return "unknown";
    }
  }
  if (ext === "dxf" || /(^|\n)\s*0\s*\r?\n\s*SECTION/.test(text)) return "dxf";
  return "unknown";
}

export function parsePlan(kind: "dxf" | "cad-json", text: string): RawPlan {
  if (kind === "dxf") return toPlan(readDxf(text));
  const o = JSON.parse(text.trim());
  return toPlan(readCadJson(Array.isArray(o) ? { walls: o } : o));
}
