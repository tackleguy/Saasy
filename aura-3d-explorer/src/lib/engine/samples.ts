/**
 * Sample inputs for the Aura Engine page — generated, so they always parse.
 *   • apartmentDxf  2-bed apartment, millimetres, closed room boundaries on
 *                   A-AREA, wall lines on A-WALL, labels + CH notes as TEXT
 *   • studioCadJson 1-bed flat as CAD JSON wall segments in metres, with door
 *                   gaps, an L-shaped living / kitchen and a storage closet
 */

type P = [number, number];

function dxf(entities: string[]): string {
  return [
    "0", "SECTION", "2", "HEADER",
    "9", "$INSUNITS", "70", "4",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    ...entities,
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
}

const lw = (layer: string, pts: P[]) => ["0", "LWPOLYLINE", "8", layer, "90", String(pts.length), "70", "1", ...pts.flatMap(([x, y]) => ["10", String(x), "20", String(y)])];
const line = (layer: string, a: P, b: P) => ["0", "LINE", "8", layer, "10", String(a[0]), "20", String(a[1]), "11", String(b[0]), "21", String(b[1])];
const text = (at: P, h: number, s: string) => ["0", "TEXT", "8", "A-ANNO", "10", String(at[0]), "20", String(at[1]), "40", String(h), "1", s];
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

export function apartmentDxf(): string {
  const rooms: { name: string; r: P[]; notes: string[] }[] = [
    { name: "LIVING / DINING", r: rect(0, 0, 6000, 4800), notes: ["19'8\" x 15'9\"", "CH: 9'0\""] },
    { name: "KITCHEN", r: rect(6000, 0, 9500, 3600), notes: ["11'6\" x 11'10\""] },
    { name: "HALL", r: rect(6000, 3600, 9500, 4800), notes: [] },
    { name: "MASTER BEDROOM", r: rect(0, 4800, 4200, 9000), notes: ["13'9\" x 13'9\"", "CH: 8'6\""] },
    { name: "BATH", r: rect(4200, 4800, 6400, 6600), notes: [] },
    { name: "ENSUITE", r: rect(4200, 6600, 6400, 9000), notes: [] },
    { name: "BEDROOM 2", r: rect(6400, 4800, 9500, 9000), notes: ["10'2\" x 13'9\"", "CH: 8'6\""] },
  ];
  const ents: string[] = [];
  for (const rm of rooms) {
    ents.push(...lw("A-AREA", rm.r));
    const cx = (rm.r[0][0] + rm.r[2][0]) / 2;
    const cy = (rm.r[0][1] + rm.r[2][1]) / 2;
    ents.push(...text([cx - 600, cy + 150], 220, rm.name));
    rm.notes.forEach((n, i) => ents.push(...text([cx - 600, cy - 250 - i * 220], 150, n)));
  }
  // Exterior wall outline (single lines) for context.
  const outer = rect(-200, -200, 9700, 9200);
  for (let i = 0; i < 4; i++) ents.push(...line("A-WALL", outer[i], outer[(i + 1) % 4]));
  ents.push(...text([0, -900], 200, "CEILING HEIGHT 2.7 m TYP."));
  return dxf(ents);
}

export function studioCadJson(): string {
  // Plan coordinates (x, z) in metres. Door gaps are left open in the walls.
  const walls: [P, P][] = [
    // Exterior 10 × 7 with an entry door on the south wall (x 4.0 – 5.0)
    [[0, 0], [10, 0]],
    [[10, 0], [10, 7]],
    [[10, 7], [5, 7]],
    [[4, 7], [0, 7]],
    [[0, 7], [0, 0]],
    // Partition between living and bedroom / bath, door into the bedroom at z 2.0 – 2.9
    [[6, 0], [6, 2.0]],
    [[6, 2.9], [6, 7]],
    // Bedroom / bath partition, bath door at x 6.4 – 7.2
    [[6, 4.5], [6.4, 4.5]],
    [[7.2, 4.5], [10, 4.5]],
    // Storage closet in the living room's corner, door at z 5.2 – 6.0
    [[0, 4.5], [2.5, 4.5]],
    [[2.5, 4.5], [2.5, 5.2]],
    [[2.5, 6.0], [2.5, 7]],
  ];
  return JSON.stringify(
    {
      units: "m",
      ceilingHeight: "9'0\"",
      walls: walls.map(([a, b]) => ({ start: a, end: b })),
      labels: [
        { text: "LIVING / KITCHEN", position: [3.5, 2.5] },
        { text: "BEDROOM", position: [8, 2.2] },
        { text: "CH: 8'6\"", position: [8, 2.8] },
        { text: "BATH", position: [8.2, 5.8] },
        { text: "STORAGE", position: [1.2, 5.8] },
      ],
    },
    null,
    2
  );
}
