import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_SITES, defaultMapLocation, mapCoverage, parseMapPin, openStreetMapUrl } from "../../src/lib/mapLocations";
import type { ProjectLocation } from "../../src/lib/geographicContext";

test("decimal coordinate pairs accept signs, spacing, zero and geographic limits", () => {
  for (const [input, expected] of [
    ["51.505, -0.086", { latitude: 51.505, longitude: -0.086 }],
    ["  +40.7112 , -74.0366  ", { latitude: 40.7112, longitude: -74.0366 }],
    [".5, -.25", { latitude: 0.5, longitude: -0.25 }],
    ["0, 0", { latitude: 0, longitude: 0 }],
    ["85, 180", { latitude: 85, longitude: 180 }],
    ["-85, -180", { latitude: -85, longitude: -180 }],
  ] as const) assert.deepEqual(parseMapPin(input), expected, input);
});

test("Google Maps view-centre and explicit coordinate-query links preserve latitude/longitude order", () => {
  const expected = { latitude: 51.505, longitude: -0.086 };
  for (const input of [
    "https://www.google.com/maps/@51.505,-0.086,17z",
    "https://www.google.com/maps/place/London/@51.505,-0.086,1000m/data=!3m1",
    "https://maps.google.com/?q=51.505,-0.086",
    "https://www.google.com/maps/search/?api=1&query=51.505%2C-0.086",
    "https://www.google.co.uk/maps?ll=51.505%2C%20-0.086",
    "https://www.google.com/maps/%4051.505%2C-0.086%2C17z",
  ]) assert.deepEqual(parseMapPin(input), expected, input);
});

test("OpenStreetMap marker and map-centre links parse without network requests", () => {
  const expected = { latitude: 40.7112, longitude: -74.0366 };
  for (const input of [
    "https://www.openstreetmap.org/?mlat=40.7112&mlon=-74.0366#map=17/40.7/-74",
    "https://www.openstreetmap.org/#map=17/40.7112/-74.0366",
    "https://openstreetmap.org/#map=17.5/40.7112/-74.0366&layers=N",
    "https://openstreetmap.org/#map=17%2F40.7112%2F-74.0366",
  ]) assert.deepEqual(parseMapPin(input), expected, input);
  const location: ProjectLocation = { ...expected, label: "Example pin", example: true };
  assert.deepEqual(parseMapPin(openStreetMapUrl(location)), expected);
});

test("non-coordinate, shortened, ambiguous and unsafe links are rejected without guessing an address", () => {
  for (const input of [
    "London Bridge", "51.5 -0.086", "51.5, -0.086, 100", "NaN, 0", "Infinity, 0", "0x10, 0", "1e2, 0", "", " ",
    "https://maps.app.goo.gl/EXAMPLE", "https://goo.gl/maps/EXAMPLE", "https://www.google.com/maps/place/London+Bridge/", "https://www.google.com/maps?q=London+Bridge",
    "https://example.com/?q=51.5,-0.086", "https://www.google.com.evil.test/maps/@51.5,-0.086,17z", "javascript:alert(1)", "https://user:secret@www.google.com/maps/@51.5,-0.086,17z",
    "https://www.openstreetmap.org/?mlat=51.5", "https://www.openstreetmap.org/?mlat=&mlon=0", "https://www.openstreetmap.org/?mlat=0x10&mlon=0", "https://www.openstreetmap.org/?mlat=51.5&mlat=40&mlon=0",
    "https://www.openstreetmap.org/#map=zoom/51.5/0", "https://www.openstreetmap.org/#map=17/51.5", "https://www.openstreetmap.org/#map=17/51.5/0/10",
    "https://www.google.com/maps?q=51.5,0&q=40,0", "https://www.google.com/maps?q=51.5,0&ll=40,0", "https://www.google.com/maps/@51.5,0<script>", "https://www.google.com/maps/%FF",
    "x".repeat(2049),
  ]) assert.equal(parseMapPin(input), null, input);
});

test("all accepted formats reject nonfinite and out-of-range coordinates", () => {
  for (const [lat, lon] of [["85.0001", "0"], ["-85.0001", "0"], ["0", "180.001"], ["0", "-180.001"], ["Infinity", "0"], ["0", "NaN"]]) {
    for (const input of [`${lat},${lon}`, `https://www.google.com/maps/@${lat},${lon},17z`, `https://www.google.com/maps?q=${lat},${lon}`, `https://openstreetmap.org/?mlat=${lat}&mlon=${lon}`, `https://openstreetmap.org/#map=17/${lat}/${lon}`]) assert.equal(parseMapPin(input), null, input);
  }
});

test("project examples distinguish Jersey City, Bayonne and Manhattan within the New York preset", () => {
  for (const [project, site] of [["meridian-tower", "jersey-city"], ["broadway-bayonne", "bayonne"], ["lexington-deco", "new-york"]]) {
    const expected = MAP_SITES.find(candidate => candidate.id === site)!;
    const location = defaultMapLocation("new-york", project);
    assert.equal(location.latitude, expected.latitude);
    assert.equal(location.longitude, expected.longitude);
    assert.equal(location.example, true);
    assert.match(location.label, /example site/);
    assert.equal(mapCoverage(location)?.id, site);
  }
  assert.equal(mapCoverage(defaultMapLocation("new-york"))?.id, "new-york");
});

test("generic project defaults keep Madrid and Lørenskog in their actual separate map regions", () => {
  const madrid = defaultMapLocation("generic", "sports-world"), norway = defaultMapLocation("generic", "lorenskog-quarter");
  assert.equal(mapCoverage(madrid)?.id, "madrid");
  assert.equal(mapCoverage(norway)?.id, "lorenskog");
  assert.ok(madrid.latitude < 45 && madrid.longitude < 0);
  assert.ok(norway.latitude > 59 && norway.longitude > 10);
  assert.equal(madrid.example, true); assert.equal(norway.example, true);
  // An explicit city change must not silently keep the previous project's region.
  assert.equal(mapCoverage(defaultMapLocation("new-york", "sports-world"))?.id, "new-york");
});

test("coverage includes its exact boundary and never chooses an uncovered nearest city", () => {
  const site = MAP_SITES.find(candidate => candidate.id === "madrid")!;
  const location = defaultMapLocation("generic", "sports-world");
  for (const [longitude, latitude] of [[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]]) assert.equal(mapCoverage({ ...location, longitude, latitude })?.id, site.id);
  assert.equal(mapCoverage({ ...location, longitude: site.bounds[2] + 0.000001 }), undefined);
  assert.equal(mapCoverage({ ...location, longitude: 0, latitude: 0 }), undefined);
  assert.equal(mapCoverage({ ...location, longitude: NaN }), undefined);
});

test("overlapping coverage is selected by local ground distance, not raw degree distance", () => {
  const length = MAP_SITES.length;
  const location: ProjectLocation = { latitude: 60, longitude: 10, label: "Distance regression", example: true };
  const shared = { city: "generic", label: "QA example", example: true, bounds: [9.9, 59.9, 10.1, 60.1], projects: [] as string[] };
  try {
    // At 60° north, 0.015° east is closer than 0.01° north.
    MAP_SITES.push({ ...shared, id: "qa-north", latitude: 60.01, longitude: 10 }, { ...shared, id: "qa-east", latitude: 60, longitude: 10.015 });
    assert.equal(mapCoverage(location)?.id, "qa-east");
  } finally { MAP_SITES.splice(length); }
});
