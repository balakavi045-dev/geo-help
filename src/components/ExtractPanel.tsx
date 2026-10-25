import { useEffect, useRef, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import type { Place } from '../types';
import { api, exportFeatures, type ExportFormat } from '../lib';
export default function ExtractPanel({ place, onAddMany, onFit, onMessage }: { place: Place; onAddMany: (features: Feature[]) => void; onFit: (f: Feature) => void; onMessage: (s: string) => void }) {
  const [kind, setKind] = useState('rivers'), [radius, setRadius] = useState('5'), [format, setFormat] = useState<ExportFormat>('geojson');
  const [data, setData] = useState<FeatureCollection | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { controller.current?.abort(); setData(null); setBusy(false); setError(''); return () => controller.current?.abort(); }, [place.id, kind, radius]);
  async function extract() {
    const c = new AbortController(); controller.current = c; setBusy(true); setError(''); setData(null);
    try { const result = await api<FeatureCollection>(`extract?${new URLSearchParams({ lat: String(place.lat), lon: String(place.lon), kind, radius })}`, c.signal); if (!c.signal.aborted) { setData(result); onFit(result.features[0]); } }
    catch (e) { if (!c.signal.aborted) setError((e as Error).message); }
    finally { if (!c.signal.aborted) setBusy(false); }
  }
  return <div>
    <div className="section-label">DOWNLOAD GEOGRAPHY</div>
    <p className="data-note">Extract real OpenStreetMap features around {place.name}. Search or click the map to change the center.</p>
    <label className="field-label">DATASET<select value={kind} onChange={e => setKind(e.target.value)}><option value="rivers">Rivers, streams & canals (lines)</option><option value="roads">Roads & paths (lines)</option><option value="lakes">Lakes & water bodies (polygons)</option><option value="villages">Villages & hamlets (points)</option></select></label>
    <label className="field-label">SEARCH RADIUS<select value={radius} onChange={e => setRadius(e.target.value)}>{[0.5,1,2,5,10,20].map(r => <option key={r} value={r}>{r} km</option>)}</select></label>
    <button className="primary-button full-width" disabled={busy} onClick={extract}>{busy ? 'Extracting…' : 'Extract geography'}</button>
    <p className="data-note">Returns full features intersecting the search radius, without clipping. Up to 1,000 features. Village points are settlements; use Boundaries → Village for mapped administrative polygons.</p>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {data && <><div className="source-caption">{data.features.length} features · OpenStreetMap · ODbL 1.0</div><label className="field-label">DOWNLOAD FORMAT<select value={format} onChange={e => setFormat(e.target.value as ExportFormat)}><option value="geojson">GeoJSON</option><option value="kml">KML</option><option value="shp">Shapefile ZIP</option></select></label><button className="primary-button full-width" disabled={busy} onClick={async () => { setBusy(true); try { await exportFeatures(data.features, `${place.name}-${kind}`, format); onMessage('Geography downloaded.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Download {format.toUpperCase()}</button><button className="text-link" onClick={() => { onAddMany(data.features); onMessage('Features added. Open the workspace export to choose any format.'); }}>Add to workspace</button><p className="data-note">Shapefile exports are 2D, with text attributes truncated to 254 bytes and field names to 10 characters. GeoJSON preserves full attributes.</p></>}
  </div>;
}
