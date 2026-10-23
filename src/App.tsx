import { useCallback, useEffect, useRef, useState } from 'react';
import { area, booleanPointInPolygon, point } from '@turf/turf';
import type { Feature, FeatureCollection } from 'geojson';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, CloudRain, Compass, Database, Eye, EyeOff, FileJson, Globe2, Layers, Leaf, LocateFixed, Map, MapPin, Maximize, Minus, Mountain, MousePointer2, MoveUpRight, Navigation, Pencil, Pentagon, Plus, Route, Search, Settings2, ShieldCheck, Sparkles, Square, Trash2, Undo2, Upload, X } from 'lucide-react';
import MapCanvas, { type MapHandle } from './components/MapCanvas';
import PlaceSearch from './components/PlaceSearch';
import RoutePanel from './components/RoutePanel';
import DataPanel from './components/DataPanel';
import { exportFeatures, measure, validateImport, workspaceFeature } from './lib';
import { INITIAL_PLACE, SAMPLE_FEATURES, type Dataset, type DrawTool, type Place, type Tab, type WorkspaceFeature } from './types';

const STORAGE_KEY = 'terra-workspace-v1';
function initialWorkspace() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (data && Array.isArray(data.features)) {
      if (data.features.length) validateImport({ type: 'FeatureCollection', features: data.features });
      return { features: data.features as WorkspaceFeature[], name: typeof data.name === 'string' ? data.name.slice(0, 60) : 'My first exploration' };
    }
  } catch { /* A corrupt or old workspace must not prevent the map from opening. */ }
  return { features: SAMPLE_FEATURES, name: 'My first exploration' };
}
const DATASETS = [
  { id: 'boundary' as Dataset, icon: Layers, title: 'Administrative boundaries', text: 'States, districts & villages', tag: 'GeoJSON', color: 'green' },
  { id: 'elevation' as Dataset, icon: Mountain, title: 'Elevation & terrain', text: 'Point heights & DEM tiles', tag: 'GeoTIFF', color: 'sand' },
  { id: 'rainfall' as Dataset, icon: CloudRain, title: 'Rainfall & climate', text: 'Explore the monthly patterns', tag: 'GeoJSON', color: 'blue' },
];

export default function App() {
  const [initial] = useState(initialWorkspace);
  const [features, setFeatures] = useState<WorkspaceFeature[]>(initial.features);
  const [workspaceName, setWorkspaceName] = useState(initial.name), [renaming, setRenaming] = useState(false);
  const [tab, setTab] = useState<Tab>('draw'), [tool, setTool] = useState<DrawTool | null>(null), [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initial.features[0]?.properties.id || null);
  const [place, setPlace] = useState<Place>(INITIAL_PLACE), [states, setStates] = useState<Feature[]>([]);
  const [insightsOpen, setInsightsOpen] = useState(true), [dataset, setDataset] = useState<Dataset>('boundary');
  const [coords, setCoords] = useState([10.8505, 76.2711]), [basemap, setBasemap] = useState<'reference' | 'street' | 'terrain'>('reference'), [basemapOpen, setBasemapOpen] = useState(false);
  const [modal, setModal] = useState<'export' | 'catalog' | 'help' | null>(null), [exportIds, setExportIds] = useState<string[]>([]), [exportName, setExportName] = useState('my-exploration');
  const [toast, setToast] = useState(''), [saved, setSaved] = useState(true), [storageError, setStorageError] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const mapRef = useRef<MapHandle>(null), importRef = useRef<HTMLInputElement>(null), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useRef<WorkspaceFeature[][]>([]);
  const message = useCallback((text: string) => { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 6500); }, []);
  useEffect(() => { fetch('/data/states.geojson').then(r => r.json()).then((data: FeatureCollection) => setStates(data.features)).catch(() => message('Reference boundaries could not load.')); }, [message]);
  useEffect(() => {
    setSaved(false);
    const timer = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ features, name: workspaceName })); setSaved(true); setStorageError(false); } catch { setStorageError(true); } }, 350);
    return () => clearTimeout(timer);
  }, [features, workspaceName]);
  useEffect(() => { if (editing) mapRef.current?.edit(true); }, [features, editing]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const boundary = states.find(f => f.properties?.code === place.boundaryKey) || null;
  const visibleFeatures = features.filter(f => f.properties.visible);
  const polygons = visibleFeatures.filter(f => f.geometry.type.includes('Polygon') && f.properties.kind !== 'boundary');
  const totalArea = polygons.reduce((total, f) => total + area(f), 0) / 1e6;

  function updateFeatures(next: WorkspaceFeature[]) { history.current = [...history.current.slice(-29), features]; setFeatures(next); }
  function addFeature(feature: Feature, name: string, kind = 'drawing') {
    const f = workspaceFeature(feature, name, kind, kind === 'route' ? '#b47d49' : kind === 'boundary' ? '#6d8b79' : '#477b52');
    updateFeatures([...features, f]); setSelectedId(f.properties.id); return f;
  }
  function chooseTool(next: DrawTool) {
    setEditing(false); setTab('draw');
    if (tool === next) { setTool(null); mapRef.current?.cancel(); }
    else { setTool(next); mapRef.current?.draw(next); }
    setMobileSidebar(false);
  }
  function selectPlace(p: Place) { mapRef.current?.cancel(); setTool(null); setEditing(false); setPlace(p); setInsightsOpen(true); mapRef.current?.goTo(p); }
  function pickPoint(lat: number, lon: number) {
    let state: Feature | undefined;
    try { state = states.find(f => booleanPointInPolygon(point([lon, lat]), f as Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)); } catch { /* points outside the bundled region are still inspectable */ }
    setPlace({ id: `pin-${lat.toFixed(6)}-${lon.toFixed(6)}`, name: 'Pinned location', label: state ? `${state.properties?.name}, ${state.properties?.country}` : 'Selected coordinates', lat, lon, type: 'location', country: state?.properties?.country, boundaryKey: state?.properties?.code }); setInsightsOpen(true);
  }
  function undo() {
    const previous = history.current.pop();
    if (previous) { setFeatures(previous); setSelectedId(null); setEditing(false); mapRef.current?.cancel(); message('Last change undone.'); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { message('Choose a GeoJSON file smaller than 12 MB.'); return; }
    try {
      const imported = validateImport(JSON.parse(await file.text())).map((f, i) => workspaceFeature(f, String(f.properties?.name || `${file.name.replace(/\.(geo)?json$/i, '')} ${i + 1}`), 'import'));
      updateFeatures([...features, ...imported]); setSelectedId(imported[0].properties.id); mapRef.current?.fit(imported[0]); message(`${imported.length} ${imported.length === 1 ? 'feature' : 'features'} added to your workspace.`);
    } catch (error) { message(error instanceof SyntaxError ? 'That file is not valid JSON. Choose a .geojson file.' : (error as Error).message); }
    finally { if (importRef.current) importRef.current.value = ''; }
  }
  function openExport() { setExportIds(features.filter(f => f.properties.visible).map(f => f.properties.id)); setExportName(workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'terra-export'); setModal('export'); }
  function switchTab(next: Tab) { setTab(next); setTool(null); setEditing(false); mapRef.current?.cancel(); }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Terra workspace" onClick={e => { e.preventDefault(); switchTab('draw'); }}><TerraMark /><span>terra<span className="brand-period">.</span></span></a>
      <span className="brand-divider" /><span className="brand-tagline">Your world, mapped.</span>
      <nav className="main-nav" aria-label="Main navigation"><button className="active" onClick={() => { setModal(null); }}>Workspace</button><button onClick={() => setModal('catalog')}>Data catalog<ArrowUpRight size={12} /></button><button onClick={() => setModal('help')}>How it works</button></nav>
      <div className="topbar-actions"><span className="open-data-badge"><span className="tiny-dot" />Built on open data</span><button className="icon-button top-help" title="Help & data sources" aria-label="Help and data sources" onClick={() => setModal('help')}><CircleHelp size={19} /></button><button className="primary-button export-top" disabled={!features.length} onClick={openExport}><ArrowDownToLine size={16} /><span>Export GeoJSON</span></button></div>
    </header>

    <div className="workspace-bar"><div className="workspace-breadcrumb"><button className="mobile-menu icon-button" aria-label="Toggle workspace tools" onClick={() => setMobileSidebar(!mobileSidebar)}><Settings2 size={18} /></button><span className="breadcrumb-icon"><Layers size={15} /></span><span className="breadcrumb-home">Workspace</span><ChevronRight size={13} />{renaming ? <input className="workspace-title-input" aria-label="Workspace name" autoFocus maxLength={60} value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} onBlur={() => { if (!workspaceName.trim()) setWorkspaceName('My exploration'); setRenaming(false); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} /> : <button className="workspace-title" onClick={() => setRenaming(true)}>{workspaceName}<Pencil size={12} /></button>}</div><div className="save-state"><span className={`tiny-dot ${storageError ? 'error-dot' : ''}`} />{storageError ? 'Storage full · export to save' : saved ? 'Saved to this browser' : 'Saving…'}<span className="workspace-private"><ShieldCheck size={13} />Personal workspace</span></div></div>

    <main className="workspace-main">
      <aside className={`sidebar ${mobileSidebar ? 'mobile-open' : ''}`} aria-label="Workspace tools">
        <div className="sidebar-intro"><div className="eyebrow"><span className="mini-spark">✳</span> A LITTLE CURIOSITY GOES A LONG WAY</div><h1>A world to explore.<br/><span>Make it yours.</span></h1><p>Draw your ideas. Discover a place.<br/>Take the data with you.</p></div>
        <div className="workspace-tabs" role="tablist" aria-label="Workspace mode">{[{ id: 'draw' as Tab, icon: Pentagon, name: 'Draw' }, { id: 'route' as Tab, icon: Route, name: 'Routes' }, { id: 'data' as Tab, icon: Database, name: 'Explore data' }].map(({ id, icon: Icon, name }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => switchTab(id)}><Icon size={15} />{name}</button>)}</div>
        <div className="sidebar-scroll">
          {tab === 'draw' && <>
            <div className="draw-section"><div className="section-heading"><span>START WITH A SHAPE</span><span className="keyboard-hint">Esc to cancel</span></div><div className="draw-tools">{[{ id: 'Polygon' as DrawTool, icon: Pentagon, title: 'Polygon', detail: 'Define an area' }, { id: 'Line' as DrawTool, icon: MoveUpRight, title: 'Polyline', detail: 'Trace a path' }, { id: 'Marker' as DrawTool, icon: MapPin, title: 'Point', detail: 'Mark a location' }, { id: 'Rectangle' as DrawTool, icon: Square, title: 'Rectangle', detail: 'Select a region' }].map(({ id, icon: Icon, title, detail }) => <button key={id} className={`draw-tool ${tool === id ? 'active' : ''}`} onClick={() => chooseTool(id)}><span className="draw-tool-icon"><Icon size={21} strokeWidth={1.5} /></span><strong>{title}</strong><small>{detail}</small>{tool === id && <span className="tool-active-dot" />}</button>)}</div><div className={`drawing-hint ${tool ? 'is-drawing' : ''}`}><MousePointer2 size={15} /><span>{tool === 'Marker' ? 'Click on the map to place your point.' : tool === 'Rectangle' ? 'Click two corners to draw a rectangle.' : tool ? 'Click to add points. Double-click to finish.' : 'Pick a tool, then let the map be your canvas.'}</span></div></div>
            <div className="layers-section"><div className="section-heading"><span>YOUR LAYERS <b>{String(features.length).padStart(2, '0')}</b></span><div className="layer-heading-actions"><button className="icon-button" aria-label="Import GeoJSON" title="Import GeoJSON" onClick={() => importRef.current?.click()}><Upload size={15} /></button><button className="icon-button" aria-label="Zoom to all layers" title="Zoom to all layers" disabled={!features.length} onClick={() => mapRef.current?.fit()}><Maximize size={15} /></button></div></div>
              <div className="layer-list">{features.length ? features.map(f => <div key={f.properties.id} className={`layer-item ${selectedId === f.properties.id ? 'selected' : ''} ${!f.properties.visible ? 'hidden-layer' : ''}`}><button className="layer-select" onClick={() => { setSelectedId(f.properties.id); mapRef.current?.fit(f); }}><span className={`layer-symbol ${f.geometry.type === 'Point' ? 'point-symbol' : f.geometry.type.includes('Line') ? 'line-symbol' : ''}`} style={{ '--layer-color': f.properties.color } as React.CSSProperties}>{f.geometry.type === 'Point' ? <MapPin size={17} /> : f.geometry.type.includes('Line') ? <Route size={17} /> : <Pentagon size={18} />}</span><span><strong>{f.properties.name}</strong><small>{f.geometry.type === 'Point' ? 'Point' : f.geometry.type.includes('Line') ? f.properties.kind === 'route' ? 'Route' : 'Polyline' : 'Polygon'}<i />{measure(f)}</small></span></button><div className="layer-actions"><button className="icon-button" aria-label={`${f.properties.visible ? 'Hide' : 'Show'} ${f.properties.name}`} onClick={() => updateFeatures(features.map(a => a.properties.id === f.properties.id ? { ...a, properties: { ...a.properties, visible: !a.properties.visible } } : a))}>{f.properties.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button><button className="icon-button delete-layer" aria-label={`Delete ${f.properties.name}`} onClick={() => { updateFeatures(features.filter(a => a.properties.id !== f.properties.id)); if (selectedId === f.properties.id) setSelectedId(null); }}><Trash2 size={13} /></button></div></div>) : <div className="empty-layers"><Layers size={24} strokeWidth={1.2} /><strong>A fresh perspective</strong><p>Draw a shape or import a GeoJSON file to begin.</p></div>}</div>
              <button className="import-layer-button" onClick={() => importRef.current?.click()}><Plus size={15} />Import a GeoJSON layer<span>.geojson</span></button>
              {features.some(f => f.properties.example) && <div className="sample-notice"><Sparkles size={12} /><span>A sample to get you started.</span><button onClick={() => { updateFeatures(features.filter(f => !f.properties.example)); setSelectedId(null); }}>Clear</button></div>}
            </div>
          </>}
          {tab === 'route' && <RoutePanel onRoute={(f, name) => { const next = features.filter(a => a.properties.kind !== 'route'); const route = workspaceFeature(f, name, 'route', '#b47d49'); updateFeatures([...next, route]); setSelectedId(route.properties.id); mapRef.current?.fit(f); }} onMessage={message} />}
          {tab === 'data' && <div className="data-sidebar"><div className="section-heading"><span>THE STORIES BENEATH THE MAP</span></div><p className="data-sidebar-intro">Every place has a story. Start with a location, then explore its layers.</p><div className="selected-location"><MapPin size={19} /><div><small>EXPLORING</small><strong>{place.name}</strong></div><span className="tiny-dot" /></div>{DATASETS.map(({ id, icon: Icon, title, text, tag, color }) => <button key={id} className={`dataset-card ${dataset === id ? 'active' : ''}`} onClick={() => { setDataset(id); setInsightsOpen(true); }}><span className={`dataset-icon ${color}`}><Icon size={21} strokeWidth={1.5} /></span><span><strong>{title}</strong><small>{text}</small><em>{tag}</em></span><ChevronRight size={15} /></button>)}<div className="data-selection-tip"><MousePointer2 size={18} /><p>Click anywhere on the map to inspect a point, or use search to find a specific place.</p></div><button className="text-link" onClick={() => setModal('catalog')}>View all data sources<ArrowUpRight size={14} /></button></div>}
          <div className="sidebar-bottom-card"><div className="bottom-card-heading"><span className="leaf-circle"><Leaf size={17} /></span><span>Open by nature.</span><ArrowUpRight size={16} /></div><p>Good maps start with shared knowledge.<br/>Yours to explore. Yours to build on.</p><button onClick={() => setModal('catalog')}>Meet the data behind Terra<ArrowRight size={14} /></button><span className="card-contour contour-one" /><span className="card-contour contour-two" /><span className="card-contour contour-three" /></div>
        </div>
        <div className="sidebar-footer"><Globe2 size={13} /><span>One planet. Infinite perspectives.</span><span className="footer-flower">✳</span></div>
      </aside>

      <section className={`map-workspace ${insightsOpen ? 'insights-visible' : ''}`} aria-label="Map workspace">
        <MapCanvas ref={mapRef} features={features} selectedId={selectedId} boundary={boundary} basemap={basemap} onCreate={f => { addFeature(f, `${f.geometry.type === 'Point' ? 'Point' : f.geometry.type.includes('Line') ? 'Path' : 'Area'} ${features.filter(a => !a.properties.example).length + 1}`); message('Your feature is ready. Export it whenever you like.'); }} onUpdate={(f, id) => updateFeatures(features.map(a => a.properties.id === id ? { ...a, geometry: f.geometry } : a))} onSelect={setSelectedId} onPick={pickPoint} onCoordinates={(lat, lon) => setCoords([lat, lon])} onDrawEnd={() => setTool(null)} onMessage={message} />
        <div className="map-search"><PlaceSearch onSelect={selectPlace} /></div>
        <div className="map-tools" aria-label="Map tools"><button className={!tool && !editing ? 'active' : ''} aria-label="Select and inspect" title="Select and inspect" onClick={() => { setTool(null); setEditing(false); mapRef.current?.cancel(); }}><MousePointer2 size={19} /></button><span /><button className={tool === 'Polygon' ? 'active' : ''} aria-label="Draw polygon on map" title="Draw polygon" onClick={() => chooseTool('Polygon')}><Pentagon size={19} /></button><button className={tool === 'Line' ? 'active' : ''} aria-label="Draw polyline on map" title="Draw polyline" onClick={() => chooseTool('Line')}><MoveUpRight size={20} /></button><button className={tool === 'Marker' ? 'active' : ''} aria-label="Add point to map" title="Add point" onClick={() => chooseTool('Marker')}><MapPin size={19} /></button><span /><button className={editing ? 'active' : ''} aria-label="Edit drawn features" title="Edit drawn features" disabled={!features.length} onClick={() => { setTool(null); mapRef.current?.cancel(); setEditing(!editing); mapRef.current?.edit(!editing); message(editing ? 'Finished editing.' : 'Drag vertices to edit your shapes. Click the pencil again to finish.'); }}><Pencil size={17} /></button><button aria-label="Undo last change" title="Undo last change" disabled={!history.current.length} onClick={undo}><Undo2 size={18} /></button></div>
        {tool && <div className="active-drawing-badge"><span className="tiny-dot" />{tool === 'Marker' ? 'Placing a point' : `Drawing ${tool === 'Line' ? 'a path' : `a ${tool.toLowerCase()}`}`}<button onClick={() => { setTool(null); mapRef.current?.cancel(); }}>Cancel<X size={12} /></button></div>}
        {insightsOpen ? <DataPanel place={place} boundary={boundary} dataset={dataset} onDataset={setDataset} onAdd={(f, name, kind) => { addFeature(f, name, kind); message(`${name} added to your workspace.`); }} onClose={() => setInsightsOpen(false)} onFit={f => mapRef.current?.fit(f)} onMessage={message} /> : <button className="show-insights secondary-button" onClick={() => setInsightsOpen(true)}><Database size={16} />Place insights<ChevronDown size={14} /></button>}
        <div className="map-view-controls"><button aria-label="Use my location" title="Use my location" onClick={() => mapRef.current?.locate()}><LocateFixed size={19} /></button><div><button aria-label="Zoom in" title="Zoom in" onClick={() => mapRef.current?.zoom(1)}><Plus size={20} /></button><span /><button aria-label="Zoom out" title="Zoom out" onClick={() => mapRef.current?.zoom(-1)}><Minus size={20} /></button></div><button aria-label="Fit all workspace layers" title="Fit all layers" onClick={() => mapRef.current?.fit()}><Maximize size={17} /></button></div>
        <div className="map-bottom-left"><div className="basemap-control"><button className="basemap-trigger" onClick={() => setBasemapOpen(!basemapOpen)} aria-expanded={basemapOpen}><span className="basemap-thumbnail"><i /><i /><i /></span><span><strong>{basemap === 'reference' ? 'Light map' : basemap === 'street' ? 'Street map' : 'Terrain map'}</strong><small>{basemap === 'reference' ? 'Open reference' : 'Live tiles'}</small></span><ChevronDown size={14} /></button>{basemapOpen && <div className="basemap-options">{[{ id: 'reference' as const, title: 'Light reference', text: 'Bundled Natural Earth · works offline' }, { id: 'street' as const, title: 'Street detail', text: 'CARTO & OpenStreetMap · live tiles' }, { id: 'terrain' as const, title: 'Terrain', text: 'OpenTopoMap · live tiles' }].map(option => <button key={option.id} onClick={() => { setBasemap(option.id); setBasemapOpen(false); }}><Map size={18} /><span><strong>{option.title}</strong><small>{option.text}</small></span>{basemap === option.id && <Check size={15} />}</button>)}</div>}</div><div className="map-coordinate-bar"><span className="tiny-dot" /><strong>WGS 84</strong><span className="coord-divider" />{Math.abs(coords[0]).toFixed(4)}° {coords[0] < 0 ? 'S' : 'N'}<span className="coordinate-comma">,</span>{Math.abs(coords[1]).toFixed(4)}° {coords[1] < 0 ? 'W' : 'E'}</div></div>
        <div className="map-attribution">{basemap === 'reference' ? <span>Natural Earth · Public domain</span> : basemap === 'street' ? <><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a><span>© CARTO</span></> : <><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a><a href="https://opentopomap.org/about" target="_blank" rel="noreferrer">© OpenTopoMap · CC BY-SA</a></>}<button onClick={() => setModal('help')}>Data credits<ArrowUpRight size={10} /></button></div>
        <div className="map-corner-note"><Compass size={14} /><span>A little closer to the world.</span></div>
      </section>
    </main>
    <footer className="app-footer"><span><span className="tiny-dot" />{visibleFeatures.length} visible {visibleFeatures.length === 1 ? 'layer' : 'layers'}<i />{polygons.length ? `${totalArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} km² drawn area` : 'Ready for your next idea'}</span><span><ShieldCheck size={12} />No account. Just exploration.<button onClick={() => setModal('help')}>Help & shortcuts<ArrowUpRight size={11} /></button></span></footer>
    <input ref={importRef} type="file" accept=".geojson,.json,application/geo+json,application/json" className="sr-only" aria-label="Import GeoJSON file" onChange={e => importFile(e.target.files?.[0])} />
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}

    {modal === 'export' && <Modal title="Take your discoveries with you." eyebrow="YOUR DATA, YOUR NEXT CHAPTER" onClose={() => setModal(null)}><p className="modal-description">An open format for an open world. Choose the layers you’d like to export.</p><div className="export-summary"><div className="file-icon"><FileJson size={24} /></div><div><strong>GeoJSON FeatureCollection</strong><small>WGS 84 · longitude, latitude · .geojson</small></div><span className="format-tag">OPEN FORMAT</span></div><div className="export-layer-list">{features.map(f => <label key={f.properties.id}><input type="checkbox" checked={exportIds.includes(f.properties.id)} onChange={e => setExportIds(e.target.checked ? [...exportIds, f.properties.id] : exportIds.filter(id => id !== f.properties.id))} /><span><strong>{f.properties.name}</strong><small>{f.geometry.type} · {measure(f)}</small></span><Layers size={17} /></label>)}</div><label className="field-label export-name-label">FILE NAME<div className="filename-field"><input aria-label="Export file name" value={exportName} onChange={e => setExportName(e.target.value.replace(/[\/\\]/g, '-'))} /><span>.geojson</span></div></label><div className="export-modal-footer"><span><ShieldCheck size={14} />Downloaded directly to your device</span><button className="primary-button" disabled={!exportIds.length || !exportName.trim()} onClick={() => { exportFeatures(features.filter(f => exportIds.includes(f.properties.id)), exportName.trim()); setModal(null); message(`${exportIds.length} ${exportIds.length === 1 ? 'layer' : 'layers'} exported. Your next adventure awaits.`); }}><ArrowDownToLine size={16} />Export {exportIds.length} {exportIds.length === 1 ? 'layer' : 'layers'}</button></div></Modal>}
    {modal === 'catalog' && <Modal title="Shared knowledge. New perspectives." eyebrow="THE OPEN DATA CATALOG" wide onClose={() => setModal(null)}><p className="modal-description">Explore trusted open datasets. Every source is credited, and every discovery stays yours.</p><div className="catalog-grid">{[
      { icon: Map, title: 'OpenStreetMap', tag: 'PLACES & BOUNDARIES', description: 'Community-mapped places, roads, and administrative boundaries via Nominatim and Overpass. Village polygon coverage varies by region.', license: 'ODbL 1.0', href: 'https://www.openstreetmap.org/copyright', dataset: 'boundary' as Dataset },
      { icon: Globe2, title: 'Natural Earth', tag: 'REFERENCE GEOGRAPHY', description: 'Bundled country, state, river, road, and city layers. A reference basemap that works offline; not a source of legal boundaries.', license: 'Public domain', href: 'https://www.naturalearthdata.com/about/terms-of-use/', dataset: 'boundary' as Dataset },
      { icon: Mountain, title: 'Copernicus DEM', tag: 'ELEVATION & TERRAIN', description: 'GLO-90 point elevations via Open-Meteo and GLO-30 surface elevation tiles via AWS. Download full 1° GeoTIFF tiles, not clipped rasters.', license: 'Copernicus DEM terms', href: 'https://registry.opendata.aws/copernicus-dem/', dataset: 'elevation' as Dataset },
      { icon: CloudRain, title: 'Open-Meteo', tag: 'RAINFALL & CLIMATE', description: 'Historical ERA5-Land modeled precipitation, aggregated from daily values into monthly and annual summaries. Approximately 9 km resolution.', license: 'CC BY 4.0', href: 'https://open-meteo.com/en/docs/historical-weather-api', dataset: 'rainfall' as Dataset },
      { icon: Route, title: 'OSRM', tag: 'ROAD ROUTING', description: 'Road paths and estimated driving times from OpenStreetMap. Uses the public demo service; no live traffic or service guarantee.', license: 'BSD 2-Clause · OSM data ODbL', href: 'https://project-osrm.org/', dataset: null },
      { icon: Navigation, title: 'Searoute & Turf.js', tag: 'SEA LANES & FLIGHT PATHS', description: 'Approximate Eurostat maritime network paths and spherical great-circle flight visualizations. Not for navigation or scheduled travel.', license: 'MIT', href: 'https://github.com/eurostat/searoute', dataset: null },
    ].map(({ icon: Icon, title, tag, description, license, href, dataset: target }) => <article className="catalog-card" key={title}><div className="catalog-card-top"><span className="dataset-icon green"><Icon size={22} strokeWidth={1.5} /></span><a href={href} target="_blank" rel="noreferrer" aria-label={`${title} source documentation`}><ArrowUpRight size={18} /></a></div><small>{tag}</small><h3>{title}</h3><p>{description}</p><footer><span>{license}</span><button onClick={() => { setModal(null); if (target) { switchTab('data'); setDataset(target); setInsightsOpen(true); } else switchTab('route'); }}>Explore<ArrowRight size={13} /></button></footer></article>)}</div><p className="catalog-footnote"><Leaf size={14} />Public services have usage limits. For a production deployment, review each provider’s terms and use your own service instance where required.</p></Modal>}
    {modal === 'help' && <Modal title="Let your curiosity lead." eyebrow="A FIELD GUIDE TO TERRA" onClose={() => setModal(null)}><p className="modal-description">A simple workspace for exploring the world, one shape, route, or data point at a time.</p><div className="help-steps">{[
      { icon: Pentagon, title: 'Draw something worth exploring.', text: 'Choose polygon, polyline, point, or rectangle. Click the map to add vertices; double-click or click the first vertex to finish. Press Esc to cancel. The pencil lets you edit vertices.' },
      { icon: Route, title: 'See how places connect.', text: 'In Routes, search for each place and press Enter, then select a result. Choose car, ship, or flight. Road routes need the live OSRM service; ship and flight calculations work locally.' },
      { icon: Database, title: 'Look beneath the surface.', text: 'Search or click the map, then use Place insights to get boundaries, point elevations, DEM links, and rainfall. District and village boundaries depend on OpenStreetMap coverage.' },
      { icon: ArrowDownToLine, title: 'Make the data yours.', text: 'Export chosen workspace layers as GeoJSON. Boundaries and measured datasets also have their own exports. Rainfall exports as a point with monthly properties; DEM raster tiles are GeoTIFF.' },
    ].map(({ icon: Icon, title, text }, i) => <div className="help-step" key={title}><span><Icon size={21} strokeWidth={1.5} /></span><div><small>0{i + 1}</small><h3>{title}</h3><p>{text}</p></div></div>)}</div><div className="privacy-note"><ShieldCheck size={20} /><p>Your layers are saved in this browser, not in an account. Export them to keep a backup. Searches and requested coordinates are sent to the credited data providers. Sea and flight paths are visualizations, not navigation advice.</p></div><button className="primary-button full-width" onClick={() => setModal(null)}>Let’s explore<ArrowRight size={15} /></button></Modal>}
  </div>;
}

function TerraMark() { return <svg className="terra-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 3v34M3 20h34M8 8l24 24M32 8 8 32" stroke="currentColor" strokeWidth="5"/><circle cx="20" cy="20" r="7" fill="#fbfcf9" stroke="currentColor" strokeWidth="4"/></svg>; }
function Modal({ title, eyebrow, wide = false, onClose, children }: { title: string; eyebrow: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusable = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]');
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler); return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? 'wide-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref} tabIndex={-1}><button className="modal-close icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button><div className="eyebrow">{eyebrow}</div><h2 id="modal-title">{title}</h2>{children}</div></div>;
}
