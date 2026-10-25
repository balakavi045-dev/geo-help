import { area, length, featureCollection } from '@turf/turf';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { WorkspaceFeature } from './types';

export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed. Try again.');
  return data;
}
export function measure(feature: Feature): string {
  try {
    if (feature.geometry.type.includes('Polygon')) return `${(area(feature) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })} km²`;
    if (feature.geometry.type.includes('Line')) return `${length(feature as Feature<GeoJSON.LineString>).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
    if (feature.geometry.type === 'Point') return `${feature.geometry.coordinates[1].toFixed(3)}°, ${feature.geometry.coordinates[0].toFixed(3)}°`;
    return feature.geometry.type;
  } catch { return feature.geometry.type; }
}
export function downloadJSON(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename.endsWith('.geojson') ? filename : `${filename}.geojson`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type ExportFormat = 'geojson' | 'kml' | 'shp';
export async function exportFeatures(features: Feature[], filename: string, format: ExportFormat = 'geojson') {
  const cleaned = features.map(f => { const { id, color, visible, ...properties } = f.properties || {}; return { ...f, properties }; });
  const collection = featureCollection(cleaned);
  if (format === 'geojson') { downloadJSON(collection, filename); return; }
  const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format, collection }) });
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Export failed.'); }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a'); a.href = url; a.download = `${filename}.${format === 'shp' ? 'zip' : 'kml'}`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function workspaceFeature(f: Feature, name: string, kind = 'drawing', color = '#477b52'): WorkspaceFeature {
  return { ...f, properties: { ...f.properties, id: crypto.randomUUID(), name, kind, color, visible: true } };
}
export function validateImport(data: unknown): Feature[] {
  const object = data as FeatureCollection | Feature;
  if (!object || typeof object !== 'object') throw new Error('Choose a valid GeoJSON file.');
  const features = object.type === 'FeatureCollection' ? object.features : object.type === 'Feature' ? [object] : [];
  if (!Array.isArray(features) || !features.length) throw new Error('This file has no GeoJSON features.');
  if (features.length > 1000) throw new Error('Import up to 1,000 features at a time.');
  const types = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'];
  let count = 0;
  function walk(value: unknown): void {
    if (!Array.isArray(value) || !value.length) throw new Error('The GeoJSON contains empty or invalid coordinates.');
    if (typeof value[0] === 'number') {
      if (value.length < 2 || !value.every(n => typeof n === 'number' && Number.isFinite(n)) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error('Coordinates must use WGS 84 longitude, latitude.');
      if (++count > 150000) throw new Error('This file is too detailed. Simplify it before importing.');
    } else value.forEach(walk);
  }
  for (const feature of features) {
    if (feature.type !== 'Feature' || !feature.geometry || !types.includes(feature.geometry.type)) throw new Error('Use GeoJSON point, line, or polygon features.');
    walk((feature.geometry as Exclude<Geometry, GeoJSON.GeometryCollection>).coordinates);
    const g = feature.geometry;
    const validRing = (ring: number[][]) => ring.length >= 4 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1];
    if (g.type === 'Point' && typeof g.coordinates[0] !== 'number') throw new Error('Invalid point coordinates.');
    if (g.type === 'LineString' && g.coordinates.length < 2) throw new Error('A line needs at least two positions.');
    if (g.type === 'Polygon' && !g.coordinates.every(validRing)) throw new Error('Polygon rings must be closed and contain at least four positions.');
    if (g.type === 'MultiPolygon' && !g.coordinates.every(p => p.every(validRing))) throw new Error('Polygon rings must be closed and contain at least four positions.');
  }
  return features;
}
