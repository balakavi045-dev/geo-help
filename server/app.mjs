import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bbox, centroid, distance, point } from '@turf/turf';
import osmtogeojson from 'osmtogeojson';
import { ServiceError, coordinate, parsePoint, directRoute, rainfallSummary, demTile } from './geo.mjs';

const dataRoot = new URL('../public/data/', import.meta.url);
const places = JSON.parse(readFileSync(new URL('places.geojson', dataRoot)));
const states = JSON.parse(readFileSync(new URL('states.geojson', dataRoot)));
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const cityAliases = { kochi: ['cochin'], kozhikode: ['calicut'], bengaluru: ['bangalore'], mumbai: ['bombay'], chennai: ['madras'], thiruvananthapuram: ['trivandrum'] };
export function localSearch(q) {
  const query = normalize(q);
  const cityResults = places.features.filter(f => normalize([f.properties.name, ...(cityAliases[normalize(f.properties.name)] || []), f.properties.state, f.properties.country].join(' ')).includes(query)).sort((a, b) => b.properties.population - a.properties.population).slice(0, 6).map(f => ({
    id: `place-${f.properties.name}-${f.geometry.coordinates.join(',')}`, name: f.properties.name,
    label: [f.properties.name, f.properties.state, f.properties.country].filter(Boolean).join(', '),
    lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], type: 'city', country: f.properties.country, source: 'Natural Earth · bundled reference data',
  }));
  const stateResults = states.features.filter(f => normalize(f.properties.name).includes(query)).map(f => {
    const p = centroid(f).geometry.coordinates;
    return { id: `state-${f.properties.code}`, name: f.properties.name, label: `${f.properties.name}, ${f.properties.country}`, lat: p[1], lon: p[0], type: 'state', country: f.properties.country, boundaryKey: f.properties.code, bounds: bbox(f), source: 'Natural Earth · bundled reference boundary' };
  });
  return [...stateResults, ...cityResults].slice(0, 7);
}

const cache = new Map();
let nominatimTail = Promise.resolve(), lastNominatim = 0;
async function provider(url, options = {}) {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.data;
  const fetchOnce = async () => {
    try {
      const response = await fetch(url, { ...options, headers: { 'User-Agent': 'TerraGeoWorkspace/1.0 (personal open-data research; https://github.com/balakavi045-dev/geo-help)', Accept: 'application/json', ...options.headers }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Provider returned ${response.status}`);
      const data = await response.json();
      if (cache.size >= 256) cache.delete(cache.keys().next().value);
      cache.set(url, { data, expires: Date.now() + 86400000 });
      return data;
    } catch (error) {
      console.warn('Open-data request failed:', new URL(url).hostname, error.message);
      throw new ServiceError('This live data service is unavailable right now. Please try again later.', 503);
    }
  };
  if (new URL(url).hostname === 'nominatim.openstreetmap.org') {
    // The public Nominatim service permits at most one request per second. Search is submitted, never autocomplete.
    const task = nominatimTail.then(async () => {
      const wait = Math.max(0, 1100 - (Date.now() - lastNominatim));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastNominatim = Date.now();
      return fetchOnce();
    });
    nominatimTail = task.catch(() => {});
    return task;
  }
  return fetchOnce();
}

export function createApp({ upstream = provider } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', reference_places: places.features.length, reference_states: states.features.length }));
  app.get('/api/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2 || q.length > 180) throw new ServiceError('Enter a place name between 2 and 180 characters.');
    try {
      const data = await upstream(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '6', addressdetails: '1', 'accept-language': 'en' })}`);
      const results = data.map(p => ({ id: String(p.place_id), name: p.name || p.display_name.split(',')[0], label: p.display_name, lat: Number(p.lat), lon: Number(p.lon), type: p.addresstype || p.type, country: p.address?.country, bounds: p.boundingbox ? [Number(p.boundingbox[2]), Number(p.boundingbox[0]), Number(p.boundingbox[3]), Number(p.boundingbox[1])] : undefined, source: 'OpenStreetMap · Nominatim' }));
      res.json({ results: results.length ? results : localSearch(q), source: results.length ? 'live' : 'reference' });
    } catch (error) {
      const results = localSearch(q);
      if (!results.length) throw error;
      res.json({ results, source: 'reference', notice: 'Showing bundled Natural Earth places while live search is unavailable.' });
    }
  });
  app.get('/api/route', async (req, res) => {
    const from = parsePoint(req.query.from), to = parsePoint(req.query.to), mode = String(req.query.mode || 'car');
    if (!['car', 'ship', 'flight'].includes(mode)) throw new ServiceError('Choose car, ship, or flight.');
    if (distance(point(from), point(to)) < 0.1) throw new ServiceError('Choose two different places at least 100 metres apart.');
    if (mode !== 'car') return res.json(directRoute(from, to, mode));
    const data = await upstream(`https://router.project-osrm.org/route/v1/driving/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson&steps=false`);
    if (data.code !== 'Ok' || !data.routes?.length) throw new ServiceError('No road route connects these places. Try nearby locations or another mode.', 422);
    const route = data.routes[0];
    res.json({ type: 'Feature', geometry: route.geometry, properties: { mode, distance_km: route.distance / 1000, duration_s: route.duration, source: 'OSRM · OpenStreetMap', license: 'ODbL', description: 'Estimated road route; endpoints may snap to the nearest road. No live traffic.' } });
  });
  app.get('/api/boundaries', async (req, res) => {
    const lat = coordinate(req.query.lat, 'latitude'), lon = coordinate(req.query.lon, 'longitude');
    const level = String(req.query.level || 'state');
    const levels = { state: '4', district: '5|6', village: '8|9|10' };
    if (!(level in levels)) throw new ServiceError('Choose a state, district, or village boundary.');
    const query = `[out:json][timeout:25];is_in(${lat},${lon})->.a;rel(pivot.a)["boundary"="administrative"]["admin_level"~"^(${levels[level]})$"];out geom;`;
    const data = await upstream(`https://overpass-api.de/api/interpreter?${new URLSearchParams({ data: query })}`);
    if (data.remark) throw new ServiceError('The boundary query did not complete. Try again later.', 503);
    const geojson = osmtogeojson(data, { flatProperties: true });
    geojson.features = geojson.features.filter(f => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type) && !f.properties?.tainted).map(f => ({ ...f, properties: { ...f.properties, source: 'OpenStreetMap · Overpass', license: 'ODbL', requested_level: level, note: 'Administrative levels vary by country. Verify the returned name and admin_level; OSM coverage is incomplete.' } }));
    if (!geojson.features.length) throw new ServiceError(`No mapped ${level} polygon was found here. Coverage varies; choose another point or level.`, 404);
    res.json(geojson);
  });
  app.get('/api/elevation', async (req, res) => {
    const lat = coordinate(req.query.lat, 'latitude'), lon = coordinate(req.query.lon, 'longitude');
    const data = await upstream(`https://api.open-meteo.com/v1/elevation?${new URLSearchParams({ latitude: String(lat), longitude: String(lon) })}`);
    const elevation = data.elevation?.[0];
    if (!Number.isFinite(elevation)) throw new ServiceError('No elevation value is available at this point.', 404);
    res.json({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat, elevation] }, properties: { elevation_m: elevation, source: 'Open-Meteo · Copernicus GLO-90', license: 'CC BY 4.0', resolution_m: 90, description: 'Surface elevation; not a ground survey.' } });
  });
  app.get('/api/rainfall', async (req, res) => {
    const lat = coordinate(req.query.lat, 'latitude'), lon = coordinate(req.query.lon, 'longitude');
    const year = req.query.year === undefined ? new Date().getUTCFullYear() - 1 : Number(req.query.year);
    if (!Number.isInteger(year) || year < 1950 || year >= new Date().getUTCFullYear()) throw new ServiceError('Choose a completed year from 1950 through last year.');
    const data = await upstream(`https://archive-api.open-meteo.com/v1/archive?${new URLSearchParams({ latitude: String(lat), longitude: String(lon), start_date: `${year}-01-01`, end_date: `${year}-12-31`, daily: 'precipitation_sum', timezone: 'UTC', models: 'era5' })}`);
    res.json(rainfallSummary(data, lat, lon, year));
  });
  app.get('/api/dem', (req, res) => res.json(demTile(coordinate(req.query.lat, 'latitude'), coordinate(req.query.lon, 'longitude'))));
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
    app.get('/{*path}', (_req, res) => res.sendFile(fileURLToPath(new URL('../dist/index.html', import.meta.url))));
  }
  app.use((err, _req, res, _next) => {
    const status = err instanceof ServiceError ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : err.message });
  });
  return app;
}
