// Local stand-in for OpenStreetMap's Overpass API, for end-to-end tests in
// environments that cannot reach overpass-api.de. Answers any query with a
// small synthetic neighbourhood (a block grid of buildings with recorded
// heights or levels, streets and a park) around the requested point, in
// Overpass `out geom` JSON. Start it, then run the app with
// AURA_OVERPASS_URL=http://127.0.0.1:3199/api/interpreter.
import http from 'node:http';
const port = Number(process.env.PORT || 3199);
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const query = decodeURIComponent(new URLSearchParams(body).get('data') ?? '');
    const m = /around:\d+,(-?[\d.]+),(-?[\d.]+)/.exec(query);
    if (!m) { res.writeHead(400); res.end('bad query'); return; }
    const lat = Number(m[1]), lon = Number(m[2]);
    const dLat = 1 / 111320, dLon = 1 / (111320 * Math.cos(lat * Math.PI / 180));
    const at = (x, y) => ({ lat: lat + y * dLat, lon: lon + x * dLon });
    const elements = []; let id = 1;
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      if (Math.abs(i) <= 0 && Math.abs(j) <= 0) continue; // leave the project's own block open
      if (i === 2 && j === -2) continue;
      const cx = i * 70, cy = j * 70, w = 22 + ((i * 7 + j * 13) & 15), d = 18 + ((i * 11 + j * 5) & 15);
      const ring = [at(cx - w, cy - d), at(cx + w, cy - d), at(cx + w, cy + d), at(cx - w, cy + d), at(cx - w, cy - d)];
      const tall = (i + j) % 3 === 0;
      elements.push({ type: 'way', id: id++, tags: tall ? { building: 'yes', height: String(30 + Math.abs(i * j) * 6) } : { building: 'yes', 'building:levels': String(3 + ((i + 8) % 5)) }, geometry: ring });
    }
    const p = [at(105, -175), at(175, -175), at(175, -105), at(105, -105), at(105, -175)];
    elements.push({ type: 'way', id: id++, tags: { leisure: 'park', name: 'Test Park' }, geometry: p });
    for (let k = -4; k <= 4; k++) {
      elements.push({ type: 'way', id: id++, tags: { highway: 'residential' }, geometry: [at(k * 70 + 35, -320), at(k * 70 + 35, 320)] });
      elements.push({ type: 'way', id: id++, tags: { highway: 'residential' }, geometry: [at(-320, k * 70 + 35), at(320, k * 70 + 35)] });
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ version: 0.6, generator: 'AURA QA mock', elements }));
  });
}).listen(port, '127.0.0.1', () => console.log(`mock overpass on ${port}`));
