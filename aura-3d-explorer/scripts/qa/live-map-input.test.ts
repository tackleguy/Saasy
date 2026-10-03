import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LIVE_MAP_BYTES, parseMapCoordinate, parseLiveMapCoordinates, parseMapHeight, readBoundedMapJson } from "../../src/lib/liveMapInput";

test("live coordinates accept only finite in-range decimal strings", () => {
  assert.equal(parseMapCoordinate("  +51.505 ", "latitude"), 51.505);
  assert.equal(parseMapCoordinate("-.086", "longitude"), -0.086);
  assert.equal(parseMapCoordinate("0", "latitude"), 0);
  assert.equal(parseMapCoordinate("85", "latitude"), 85);
  assert.equal(parseMapCoordinate("-180", "longitude"), -180);
  for (const value of [null, undefined, 0, false, {}, [], "", " ", "0x10", "0b10", "1e1", "NaN", "Infinity", "51 north", "51,5", "1/2", "1;2", "1-2", "1".repeat(65)]) {
    assert.equal(parseMapCoordinate(value, "latitude"), null, String(value));
    assert.equal(parseMapCoordinate(value, "longitude"), null, String(value));
  }
  for (const latitude of ["85.00001", "-85.00001"]) assert.equal(parseMapCoordinate(latitude, "latitude"), null);
  for (const longitude of ["180.00001", "-180.00001"]) assert.equal(parseMapCoordinate(longitude, "longitude"), null);
});

test("live coordinate query rejects missing, blank and duplicate parameters", () => {
  assert.deepEqual(parseLiveMapCoordinates(new URLSearchParams("lat=0&lon=0")), { latitude: 0, longitude: 0 });
  assert.deepEqual(parseLiveMapCoordinates(new URLSearchParams("lat=51.505&lon=-0.086")), { latitude: 51.505, longitude: -0.086 });
  for (const query of ["", "lat=0", "lon=0", "lat=&lon=", "lat=+&lon=0", "lat=0x10&lon=0", "lat=10&lat=20&lon=30", "lat=10&lon=20&lon=30", "lat=90&lon=0"]) assert.equal(parseLiveMapCoordinates(new URLSearchParams(query)), null, query);
});

test("recorded heights accept metres or explicit feet with exact conversion", () => {
  for (const value of ["12.5", "12.5m", "12.5 m", "12.5 metre", "12.5 metres", "12.5 meter", "12.5 meters", " +12.5 M "]) assert.equal(parseMapHeight(value), 12.5, value);
  for (const value of ["100ft", "100 feet", "100 foot", "100'", "100′", "100 FT"]) assert.equal(parseMapHeight(value), 30.48, value);
  assert.equal(parseMapHeight("0 m"), 0);
  assert.equal(parseMapHeight("1000m"), 1000);
  assert.equal(parseMapHeight(".5 m"), 0.5);
});

test("ambiguous or unsupported heights remain unknown instead of numeric prefixes or clamping", () => {
  for (const value of [null, undefined, 12, {}, [], "", " ", "-5", "NaN", "Infinity", "0x10", "1e2", "12;15", "10-12", "10–12", "40 cm", "1 km", "10 storeys", "12,5m", "12 metres approx", "approx 12 m", "6'2\"", "1000.1m", "4000 ft", "12 m<script>"]) assert.equal(parseMapHeight(value), undefined, String(value));
});

function chunked(parts: Uint8Array[]) {
  let index = 0, cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { if (index === parts.length) controller.close(); else controller.enqueue(parts[index++]); },
    cancel() { cancelled = true; },
  });
  return { body, wasCancelled: () => cancelled };
}
const bytes = (value: string) => new TextEncoder().encode(value);

test("bounded map JSON accepts an exact byte limit and UTF-8 split between chunks", async () => {
  const body = bytes('{"name":"Lørenskog"}'), split = body.indexOf(0xc3) + 1;
  const stream = chunked([body.slice(0, split), body.slice(split)]);
  assert.deepEqual(await readBoundedMapJson(new Response(stream.body), body.byteLength), { name: "Lørenskog" });
  assert.equal(stream.wasCancelled(), false);
  assert.equal(MAX_LIVE_MAP_BYTES, 8 * 1024 * 1024);
});

test("declared oversized map responses are rejected and cancelled before reading", async () => {
  const stream = chunked([bytes("{}")]);
  await assert.rejects(readBoundedMapJson(new Response(stream.body, { headers: { "Content-Length": "100" } }), 10), RangeError);
  assert.equal(stream.wasCancelled(), true);
});

test("chunked and understated map responses stop at the aggregate byte limit", async () => {
  for (const headers of [undefined, { "Content-Length": "2" }]) {
    const stream = chunked([bytes('{"data":'), bytes('"1234567890"'), bytes("}")]);
    await assert.rejects(readBoundedMapJson(new Response(stream.body, { headers }), 12), RangeError);
    assert.equal(stream.wasCancelled(), true);
  }
});

test("malformed JSON, invalid UTF-8 and interrupted bodies cannot become snapshots", async () => {
  await assert.rejects(readBoundedMapJson(new Response("not JSON")), SyntaxError);
  await assert.rejects(readBoundedMapJson(new Response(null)), SyntaxError);
  await assert.rejects(readBoundedMapJson(new Response(new Uint8Array([0xc3, 0x28]))), TypeError);
  const broken = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("Connection lost")); } });
  await assert.rejects(readBoundedMapJson(new Response(broken)), /Connection lost/);
  for (const limit of [0, -1, NaN, Infinity, 1.5]) await assert.rejects(readBoundedMapJson(new Response("{}"), limit), RangeError);
});
