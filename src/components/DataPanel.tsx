import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, CloudRain, Database, ExternalLink, Layers, LoaderCircle, MapPin, Mountain, Plus, ScanLine, X } from 'lucide-react';
import type { Feature, FeatureCollection } from 'geojson';
import { api, exportFeatures, measure } from '../lib';
import type { Dataset, Place } from '../types';

import ExtractPanel from './ExtractPanel';

type Rain = { year: number; monthly_mm: (number | null)[]; annual_mm: number | null; missing_days: number; feature: Feature };
type DEM = { url: string; name: string; note: string; bounds: number[] };
export default function DataPanel({ place, boundary, dataset, onDataset, onAdd, onAddMany, onClose, onFit, onMessage }: {
  onAddMany: (features: Feature[]) => void;
  place: Place; boundary: Feature | null; dataset: Dataset; onDataset: (dataset: Dataset) => void;
  onAdd: (feature: Feature, name: string, kind: string) => void; onClose: () => void; onFit: (feature: Feature) => void; onMessage: (message: string) => void;
}) {
  const [level, setLevel] = useState('state'), [remoteBoundaries, setRemoteBoundaries] = useState<Feature[]>([]), [boundaryIndex, setBoundaryIndex] = useState(0);
  const [elevation, setElevation] = useState<Feature | null>(null), [dem, setDem] = useState<DEM | null>(null);
  const [rain, setRain] = useState<Rain | null>(null), [year, setYear] = useState(new Date().getFullYear() - 1);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [added, setAdded] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort(); setBusy(false); setError(''); setRemoteBoundaries([]); setBoundaryIndex(0); setElevation(null); setRain(null); setDem(null); setAdded(''); setLevel('state');
    return () => controller.current?.abort();
  }, [place.id]);
  const activeBoundary = remoteBoundaries[boundaryIndex] || (level === 'state' ? boundary : null);
  async function request(kind: Dataset) {
    controller.current?.abort(); controller.current = new AbortController();
    setBusy(true); setError(''); setAdded('');
    const params = new URLSearchParams({ lat: String(place.lat), lon: String(place.lon) });
    try {
      if (kind === 'boundary') {
        params.set('level', level);
        const data = await api<FeatureCollection>(`boundaries?${params}`, controller.current.signal);
        setRemoteBoundaries(data.features); setBoundaryIndex(0); onFit(data.features[0]);
      } else if (kind === 'elevation') {
        const result = await api<Feature>(`elevation?${params}`, controller.current.signal); setElevation(result);
      } else {
        params.set('year', String(year)); setRain(await api<Rain>(`rainfall?${params}`, controller.current.signal));
      }
    } catch (err) { if ((err as Error).name !== 'AbortError') setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function getDEM() {
    setBusy(true); setError('');
    try { setDem(await api<DEM>(`dem?lat=${place.lat}&lon=${place.lon}`)); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  function add(feature: Feature, name: string, kind: string) { onAdd(feature, name, kind); setAdded(name); }
  return <aside className="insights-card" aria-label="Place insights">
    <div className="insights-heading"><span><span className="status-dot" /> PLACE INSIGHTS</span><button className="icon-button" aria-label="Close place insights" onClick={onClose}><X size={16} /></button></div>
    <div className="place-heading"><div className="place-illustration"><MapPin size={25} strokeWidth={1.4} /><span /></div><div><h2>{place.name}</h2><p>{place.type === 'location' ? place.label : place.country || 'Selected place'}<span> · </span>{place.type === 'state' ? 'State' : place.type === 'location' ? 'Map point' : 'Place'}</p></div></div>
    <button className="place-coordinates" title="Copy coordinates" onClick={() => { navigator.clipboard?.writeText(`${place.lon.toFixed(5)}, ${place.lat.toFixed(5)}`).then(() => onMessage('Coordinates copied: longitude, latitude.')).catch(() => onMessage(`${place.lon.toFixed(5)}, ${place.lat.toFixed(5)}`)); }}><ScanLine size={13} />{Math.abs(place.lat).toFixed(4)}° {place.lat < 0 ? 'S' : 'N'}<span>·</span>{Math.abs(place.lon).toFixed(4)}° {place.lon < 0 ? 'W' : 'E'}</button>
    <div className="insights-stats"><div><small>BOUNDARY AREA</small><strong>{boundary ? measure(boundary) : 'Select a boundary'}</strong></div><div><small>DATA ACCESS</small><strong><span className="tiny-dot" /> Open source</strong></div></div>
    <div className="dataset-tabs" role="tablist" aria-label="Geographic datasets">
      <button role="tab" aria-selected={dataset === 'extract'} className={dataset === 'extract' ? 'active' : ''} onClick={() => { onDataset('extract'); setError(''); }}><Database size={15} />Extract</button>
      <button role="tab" aria-selected={dataset === 'boundary'} className={dataset === 'boundary' ? 'active' : ''} onClick={() => { onDataset('boundary'); setError(''); }}><Layers size={15} />Boundaries</button>
      <button role="tab" aria-selected={dataset === 'elevation'} className={dataset === 'elevation' ? 'active' : ''} onClick={() => { onDataset('elevation'); setError(''); }}><Mountain size={15} />Elevation</button>
      <button role="tab" aria-selected={dataset === 'rainfall'} className={dataset === 'rainfall' ? 'active' : ''} onClick={() => { onDataset('rainfall'); setError(''); }}><CloudRain size={15} />Rainfall</button>
    </div>
    <div className="dataset-content">
      {dataset === 'extract' && <ExtractPanel place={place} onAddMany={onAddMany} onFit={onFit} onMessage={onMessage} />}
      {dataset === 'boundary' && <>
        <div className="section-label">ADMINISTRATIVE BOUNDARIES</div>
        <div className="boundary-levels">{['state', 'district', 'village'].map(l => <button key={l} className={level === l ? 'active' : ''} onClick={() => { setLevel(l); setRemoteBoundaries([]); setBoundaryIndex(0); setError(''); setAdded(''); }}>{l}</button>)}</div>
        {activeBoundary ? <>
          {remoteBoundaries.length > 1 && <label className="field-label">Choose returned boundary<select value={boundaryIndex} onChange={e => setBoundaryIndex(Number(e.target.value))}>{remoteBoundaries.map((f, i) => <option key={i} value={i}>{String(f.properties?.name || f.properties?.['name:en'] || `Boundary ${i + 1}`)} · level {String(f.properties?.admin_level || '—')}</option>)}</select></label>}
          <div className="boundary-file"><div className="file-icon"><Layers size={20} /><span>GEO</span></div><div><strong>{String(activeBoundary.properties?.name || activeBoundary.properties?.['name:en'] || `${place.name} boundary`)}</strong><p>GeoJSON <span>·</span> WGS 84</p></div><span className="available-dot" title="Available" /></div>
          <div className="source-caption"><span className="tiny-dot" />{remoteBoundaries.length ? 'OpenStreetMap · ODbL' : 'Natural Earth · Public domain'}</div>
          <div className="boundary-actions"><button className="primary-button" onClick={() => { exportFeatures([activeBoundary], `${place.name.toLowerCase().replaceAll(' ', '-')}-${level}`); onMessage('Boundary exported as GeoJSON.'); }}><ArrowDownToLine size={15} />Export boundary</button><button className="outline-icon-button" aria-label="Add boundary to workspace" title="Add to workspace" onClick={() => add(activeBoundary, `${activeBoundary.properties?.name || place.name} boundary`, 'boundary')}>{added ? <Check size={17} /> : <Plus size={17} />}</button></div>
          <p className="data-note">{remoteBoundaries.length ? 'Verify the returned name and admin level. Administrative levels and coverage vary by country.' : 'Reference boundaries for exploration. Administrative limits may differ from current official records.'}</p>
          <button className="text-link" disabled={busy} onClick={() => request('boundary')}>{busy ? <LoaderCircle size={13} className="spin" /> : <ArrowUpRight size={13} />}Look up OpenStreetMap boundary</button>
        </> : <div className="dataset-empty"><div className="empty-data-icon"><Layers size={26} strokeWidth={1.3} /></div><h3>Find the finer details</h3><p>Look up the mapped {level} containing this location. Availability varies by place.</p><button className="primary-button" disabled={busy} onClick={() => request('boundary')}>{busy ? <LoaderCircle className="spin" size={15} /> : <SearchIcon />}Find {level} boundary</button></div>}
      </>}
      {dataset === 'elevation' && <>
        <div className="section-label">A DIFFERENT POINT OF VIEW</div>
        <div className="elevation-art"><svg viewBox="0 0 250 65" aria-hidden="true"><path d="M0 65 30 47 52 51 85 25 100 37 137 5 166 38 185 28 217 49 250 57V65" fill="#dce7d6"/><path d="m0 65 38-14 22 7 39-19 28 8 41-28 32 29 25-9 25 18" fill="none" stroke="#83a382" strokeWidth="1.5"/><path d="m120 20 17-15 16 18-17-8Z" fill="#f8f9f3"/></svg><div><small>SURFACE ELEVATION</small><strong>{elevation ? `${elevation.properties?.elevation_m} m` : '—'}<span>above sea level</span></strong></div></div>
        <p className="data-note">Point elevation from Copernicus GLO-90 via Open-Meteo. A 90 m surface model, not a ground survey.</p>
        <button className="primary-button full-width" disabled={busy} onClick={() => request('elevation')}>{busy ? <LoaderCircle className="spin" size={15} /> : <Mountain size={15} />}{elevation ? 'Refresh elevation' : 'Get point elevation'}</button>
        {elevation && <button className="text-link" onClick={() => { exportFeatures([elevation], `${place.name}-elevation`); onMessage('Elevation point exported with a height coordinate.'); }}><ArrowDownToLine size={14} />Export elevation as GeoJSON</button>}
        <div className="data-divider" /><div className="dem-heading"><div><h3>Need the terrain itself?</h3><p>Copernicus GLO-30 · 30 m</p></div><span className="format-tag">GeoTIFF</span></div>
        {!dem ? <button className="secondary-button full-width" onClick={getDEM} disabled={busy}><ExternalLink size={14} />Find DEM tile</button> : <div className="dem-result"><p>1° × 1° surface elevation tile. Full raster, not clipped to your drawing. May exceed 100 MB; ocean tiles may be absent.</p><a className="text-link" href={dem.url} target="_blank" rel="noreferrer">Open GeoTIFF tile<ArrowUpRight size={14} /></a></div>}
      </>}
      {dataset === 'rainfall' && <>
        <div className="rain-heading"><div><div className="section-label">ANNUAL RAINFALL</div><strong>{rain?.annual_mm != null ? `${rain.annual_mm.toLocaleString()} mm` : 'Explore the patterns'}</strong></div><label className="year-select"><select aria-label="Rainfall year" value={year} onChange={e => { setYear(Number(e.target.value)); setRain(null); setError(''); }}>{Array.from({ length: 40 }, (_, i) => new Date().getFullYear() - 1 - i).map(y => <option key={y}>{y}</option>)}</select><ChevronDown size={12} /></label></div>
        <div className={`rain-chart ${rain ? '' : 'empty-chart'}`} aria-label={rain ? `Monthly rainfall for ${rain.year}` : 'Load rainfall data to see the monthly chart'}>{Array.from({ length: 12 }, (_, i) => <div className="rain-column" key={i}><div className="rain-bar-space"><span className={rain?.monthly_mm[i] == null ? 'missing' : ''} style={{ height: rain ? `${Math.max(1, (rain.monthly_mm[i] || 0) / Math.max(1, ...rain.monthly_mm.map(n => n || 0)) * 100)}%` : '2px' }} title={rain ? `${new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}: ${rain.monthly_mm[i] == null ? 'No data' : `${rain.monthly_mm[i]} mm`}` : 'No data loaded'} /></div><small>{'JFMAMJJASOND'[i]}</small></div>)}</div>
        <p className="data-note">ERA5 modeled precipitation at approximately 25 km resolution. Daily data aggregated by month; not a rain gauge observation.</p>
        <button className="primary-button full-width" disabled={busy} onClick={() => request('rainfall')}>{busy ? <LoaderCircle className="spin" size={15} /> : <CloudRain size={15} />}Load {year} rainfall</button>
        {rain && <><div className="source-caption">Open-Meteo · CC BY 4.0{rain.missing_days > 0 && ` · ${rain.missing_days} missing days`}</div><button className="text-link" onClick={() => { exportFeatures([rain.feature], `${place.name}-rainfall-${year}`); onMessage('Rainfall exported as a point with monthly precipitation properties.'); }}><ArrowDownToLine size={14} />Export rainfall as GeoJSON</button></>}
      </>}
      {error && <div className="inline-error" role="alert">{error}<button className="text-link" onClick={() => request(dataset)}>Try again <ArrowUpRight size={13} /></button></div>}
    </div>
    <div className="insights-footer"><Database size={13} /><span>Open data. Endless possibilities.</span><ArrowUpRight size={13} /></div>
  </aside>;
}
function SearchIcon() { return <MapPin size={15} />; }
