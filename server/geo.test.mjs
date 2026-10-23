import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, localSearch } from './app.mjs';
import { coordinate, parsePoint, directRoute, rainfallSummary, demTile, ServiceError } from './geo.mjs';

test('coordinate validation rejects missing, infinite, malformed, and out-of-range input', () => {
  for (const value of [undefined, '', ' ', NaN, Infinity, 91, -91]) assert.throws(() => coordinate(value, 'latitude'));
  assert.deepEqual(parsePoint('76.27,9.97'), [76.27, 9.97]);
  for (const value of ['76', '181,10', '0,100', '0,0,0', ',']) assert.throws(() => parsePoint(value));
});
test('great-circle route has real endpoints, distance, and explicit visualization metadata', () => {
  const r = directRoute([76.2673, 9.9674], [72.82, 18.96], 'flight');
  assert.equal(r.geometry.type, 'LineString');
  assert.deepEqual(r.geometry.coordinates[0], [76.2673, 9.9674]);
  const end = r.geometry.coordinates.at(-1);
  assert.ok(Math.abs(end[0] - 72.82) < 1e-8 && Math.abs(end[1] - 18.96) < 1e-8);
  assert.ok(r.properties.distance_km > 1000 && r.properties.distance_km < 1100);
  assert.match(r.properties.description, /Not a scheduled flight/);
  assert.throws(() => directRoute([0, 0], [0, 0], 'flight'));
});
test('sea route follows a maritime network and labels land access exclusions', () => {
  const r = directRoute([76.2673, 9.9674], [72.82, 18.96], 'ship');
  assert.equal(r.geometry.type, 'LineString');
  assert.ok(r.geometry.coordinates.length > 2);
  assert.ok(r.properties.distance_km > 1000);
  assert.match(r.properties.description, /Not for navigation/);
  assert.match(r.properties.description, /Land connections/);
});
test('DEM tile uses south-west degree corner, including negative coordinates', () => {
  assert.match(demTile(10.85, 76.27).url, /N10_00_E076_00_DEM/);
  assert.match(demTile(-0.2, -73.7).url, /S01_00_W074_00_DEM/);
  assert.deepEqual(demTile(-0.2, -73.7).bounds, [-74, -1, -73, 0]);
});
function yearData(year = 2025) {
  const time = [], precipitation_sum = [];
  for (let day = new Date(`${year}-01-01T00:00:00Z`); day.getUTCFullYear() === year; day.setUTCDate(day.getUTCDate() + 1)) { time.push(day.toISOString().slice(0, 10)); precipitation_sum.push(1); }
  return { daily: { time, precipitation_sum } };
}
test('rainfall aggregation handles full years, leap years, and missing data without inventing zeros', () => {
  const data = yearData();
  const result = rainfallSummary(data, 10, 76, 2025);
  assert.equal(result.annual_mm, 365); assert.equal(result.monthly_mm[1], 28);
  assert.equal(rainfallSummary(yearData(2024), 10, 76, 2024).annual_mm, 366);
  data.daily.precipitation_sum[35] = null;
  const partial = rainfallSummary(data, 10, 76, 2025);
  assert.equal(partial.monthly_mm[1], null); assert.equal(partial.annual_mm, null); assert.equal(partial.missing_days, 1);
  const truncated = yearData(); truncated.daily.time.pop(); truncated.daily.precipitation_sum.pop();
  assert.equal(rainfallSummary(truncated, 10, 76, 2025).monthly_mm[11], null);
  assert.equal(rainfallSummary(truncated, 10, 76, 2025).missing_days, 1);
  assert.throws(() => rainfallSummary({ daily: { time: [], precipitation_sum: [] } }, 10, 76, 2025));
});
test('offline reference search resolves states and common city aliases', () => {
  assert.ok(localSearch('Kerala').some(p => p.boundaryKey === 'IN-KL'));
  assert.ok(localSearch('Kochi').some(p => /Kochi|Cochin/.test(p.name)));
  assert.ok(localSearch('Mumbai').some(p => p.lon > 72 && p.lon < 73));
});
test('API validates input, reports upstream outages, and preserves functioning local routes', async t => {
  const app = createApp({ upstream: async () => { throw new ServiceError('Live service unavailable.', 503); } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/elevation?lat=95&lon=76`)).status, 400);
  assert.equal((await fetch(`${base}/route?from=76,10&to=72,19&mode=invalid`)).status, 400);
  const fallback = await (await fetch(`${base}/search?q=Kerala`)).json();
  assert.equal(fallback.source, 'reference'); assert.ok(fallback.results.length);
  const flight = await (await fetch(`${base}/route?from=76,10&to=72,19&mode=flight`)).json();
  assert.equal(flight.type, 'Feature'); assert.equal(flight.properties.mode, 'flight');
  assert.equal((await fetch(`${base}/rainfall?lat=10&lon=76&year=9999`)).status, 400);
  assert.equal((await fetch(`${base}/elevation?lat=10&lon=76`)).status, 503);
});
test('API returns attributed real provider data and mapped road geometry', async t => {
  const app = createApp({ upstream: async url => {
    if (url.includes('/elevation')) return { elevation: [42] };
    if (url.includes('/archive?')) return yearData();
    if (url.includes('/route/v1/')) return { code: 'Ok', routes: [{ distance: 12000, duration: 900, geometry: { type: 'LineString', coordinates: [[76, 10], [76.1, 10.1]] } }] };
    if (url.includes('/interpreter')) return { elements: [] };
    return [];
  } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const elevation = await (await fetch(`${base}/elevation?lat=10&lon=76`)).json();
  assert.deepEqual(elevation.geometry.coordinates, [76, 10, 42]); assert.match(elevation.properties.source, /Copernicus/);
  const road = await (await fetch(`${base}/route?from=76,10&to=76.1,10.1&mode=car`)).json();
  assert.equal(road.properties.distance_km, 12); assert.equal(road.properties.duration_s, 900);
  const rain = await (await fetch(`${base}/rainfall?lat=10&lon=76&year=2025`)).json();
  assert.equal(rain.annual_mm, 365); assert.match(rain.feature.properties.source, /ERA5-Land/);
  assert.equal((await fetch(`${base}/boundaries?lat=10&lon=76&level=village`)).status, 404);
});
