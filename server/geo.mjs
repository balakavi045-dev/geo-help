import { greatCircle, point, distance, featureCollection } from '@turf/turf';
import searoute from 'searoute-js';

export class ServiceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function coordinate(value, axis) {
  if (value === undefined || value === null || String(value).trim() === '') throw new ServiceError(`A ${axis} coordinate is required.`);
  const n = Number(value), max = axis === 'latitude' ? 90 : 180;
  if (!Number.isFinite(n) || Math.abs(n) > max) throw new ServiceError(`Invalid ${axis}.`);
  return n;
}
export function parsePoint(value) {
  if (typeof value !== 'string' || value.split(',').length !== 2) throw new ServiceError('Coordinates must use longitude,latitude.');
  const [lon, lat] = value.split(',');
  return [coordinate(lon, 'longitude'), coordinate(lat, 'latitude')];
}
export function directRoute(from, to, mode) {
  if (distance(point(from), point(to)) < 0.1) throw new ServiceError('Choose two different places at least 100 metres apart.');
  if (mode === 'flight') {
    const feature = greatCircle(point(from), point(to), { npoints: 128 });
    feature.properties = { mode, distance_km: distance(point(from), point(to)), source: 'Great-circle calculation · Turf.js', description: 'Shortest path on a sphere. Not a scheduled flight or an air traffic route.' };
    return feature;
  }
  if (mode === 'ship') {
    const feature = searoute(point(from), point(to), 'kilometers');
    if (!feature?.geometry?.coordinates?.length || !Number.isFinite(feature.properties.length) || feature.properties.length <= 0) throw new ServiceError('No sea route was found. Try two different coastal places.', 422);
    feature.properties = { ...feature.properties, mode, distance_km: feature.properties.length, source: 'Searoute.js · Eurostat maritime network', description: 'Approximate sea-lane visualization between nearest network points. Land connections and port access are not included. Not for navigation.' };
    return feature;
  }
  throw new ServiceError('Unsupported route mode.');
}
export function rainfallSummary(data, lat, lon, year) {
  if (!Array.isArray(data.daily?.time) || !Array.isArray(data.daily?.precipitation_sum) || data.daily.time.length !== data.daily.precipitation_sum.length || !data.daily.time.length) throw new ServiceError('The rainfall provider returned incomplete data.', 502);
  const monthly = Array(12).fill(0), missing = Array(12).fill(0), days = Array(12).fill(0);
  for (let i = 0; i < data.daily.time.length; i++) {
    const m = Number(data.daily.time[i].slice(5, 7)) - 1;
    if (m < 0 || m > 11) throw new ServiceError('The rainfall provider returned invalid dates.', 502);
    const value = data.daily.precipitation_sum[i];
    days[m]++;
    if (value === null || !Number.isFinite(value)) missing[m]++;
    else monthly[m] += value;
  }
  const expectedDays = monthly.map((_, m) => new Date(Date.UTC(year, m + 1, 0)).getUTCDate());
  const complete = monthly.map((n, m) => days[m] === expectedDays[m] && !missing[m] ? Number(n.toFixed(1)) : null);
  const total = complete.every(n => n !== null) ? Number(complete.reduce((a, b) => a + b, 0).toFixed(1)) : null;
  return {
    year, monthly_mm: complete, annual_mm: total, missing_days: missing.reduce((a, b, m) => a + b + Math.max(0, expectedDays[m] - days[m]), 0),
    feature: { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { year, annual_precipitation_mm: total, monthly_precipitation_mm: complete, source: 'Open-Meteo · ERA5', license: 'CC BY 4.0', resolution: 'Approximately 25 km', data_kind: 'Modeled reanalysis, not a rain gauge observation' } },
  };
}
export function demTile(lat, lon) {
  // Copernicus GLO-30 tiles are named for the south-west corner of each degree.
  const south = Math.floor(lat), west = Math.floor(lon);
  const ns = `${south < 0 ? 'S' : 'N'}${String(Math.abs(south)).padStart(2, '0')}`;
  const ew = `${west < 0 ? 'W' : 'E'}${String(Math.abs(west)).padStart(3, '0')}`;
  const name = `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`;
  return { name, url: `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`, bounds: [west, south, west + 1, south + 1], resolution_m: 30, format: 'GeoTIFF (COG)', source: 'Copernicus GLO-30 via AWS Open Data', note: 'Surface elevation including buildings and vegetation. Full 1° tile; not clipped to your drawing. Some ocean tiles are absent. Files can exceed 100 MB.' };
}
export const asCollection = feature => featureCollection([feature]);
