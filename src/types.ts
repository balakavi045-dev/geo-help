import type { Feature, FeatureCollection, Geometry } from 'geojson';
export type WorkspaceFeature = Feature<Geometry, { id: string; name: string; color: string; visible: boolean; kind: string; [key: string]: unknown }>;
export type Place = { id: string; name: string; label: string; lat: number; lon: number; type: string; country?: string; source?: string; boundaryKey?: string; bounds?: number[] };
export type Dataset = 'boundary' | 'elevation' | 'rainfall' | 'extract';
export type DrawTool = 'Polygon' | 'Line' | 'Marker' | 'Rectangle';
export type Tab = 'draw' | 'route' | 'data';
export type GeoData = FeatureCollection;
export const INITIAL_PLACE: Place = { id: 'state-IN-KL', name: 'Kerala', label: 'Kerala, India', country: 'India', lat: 10.8505, lon: 76.2711, type: 'state', boundaryKey: 'IN-KL', source: 'Natural Earth · reference boundary' };
export const SAMPLE_FEATURES: WorkspaceFeature[] = [
  { type: 'Feature', properties: { id: 'sample-area', name: 'Western Ghats study', color: '#477b52', visible: true, kind: 'drawing', example: true }, geometry: { type: 'Polygon', coordinates: [[[76.23,10.65],[76.62,10.76],[76.81,10.43],[76.5,10.19],[76.17,10.34],[76.23,10.65]]] } },
  { type: 'Feature', properties: { id: 'sample-point', name: 'Kochi', color: '#b98654', visible: true, kind: 'drawing', example: true }, geometry: { type: 'Point', coordinates: [76.2673,9.9674] } },
];
