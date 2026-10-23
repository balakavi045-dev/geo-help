import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { centroid } from '@turf/turf';
import type { Feature, FeatureCollection } from 'geojson';
import type { DrawTool, Place, WorkspaceFeature } from '../types';

export type MapHandle = {
  draw: (tool: DrawTool) => void; cancel: () => void; zoom: (amount: number) => void;
  fit: (feature?: Feature) => void; goTo: (place: Place) => void;
  locate: () => void; edit: (active: boolean) => void; invalidate: () => void;
};
type Props = {
  features: WorkspaceFeature[]; selectedId: string | null; boundary: Feature | null;
  basemap: 'reference' | 'street' | 'terrain';
  onCreate: (feature: Feature) => void; onUpdate: (feature: Feature, id: string) => void;
  onSelect: (id: string) => void; onPick: (lat: number, lon: number) => void;
  onCoordinates: (lat: number, lon: number) => void;
  onDrawEnd: () => void; onMessage: (message: string) => void;
};
const MapCanvas = forwardRef<MapHandle, Props>((props, ref) => {
  const element = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null);
  const drawn = useRef<L.FeatureGroup>(L.featureGroup()), boundaryLayer = useRef<L.GeoJSON | null>(null);
  const latest = useRef(props); latest.current = props;
  const tile = useRef<L.TileLayer | null>(null), labelGroup = useRef<L.LayerGroup | null>(null);
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false);
  useImperativeHandle(ref, () => ({
    draw(tool) { map.current?.pm.disableDraw(); map.current?.pm.disableGlobalEditMode(); map.current?.pm.enableDraw(tool, { snappable: true, snapDistance: 12, allowSelfIntersection: false, finishOn: 'dblclick', pathOptions: { color: '#3d7454', fillColor: '#7caa66', fillOpacity: 0.18, weight: 2 }, templineStyle: { color: '#3d7454', dashArray: '5,5' }, hintlineStyle: { color: '#3d7454', dashArray: '5,5' } }); },
    cancel() { map.current?.pm.disableDraw(); map.current?.pm.disableGlobalEditMode(); },
    zoom(amount) { map.current?.zoomIn(amount); },
    fit(feature) {
      const m = map.current; if (!m) return;
      if (feature?.geometry.type === 'Point') { m.flyTo([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], 11); return; }
      const bounds = feature ? L.geoJSON(feature).getBounds() : drawn.current.getBounds();
      if (bounds.isValid()) m.fitBounds(bounds, { paddingTopLeft: [80, 90], paddingBottomRight: [310, 100], maxZoom: 12, animate: true });
    },
    goTo(place) {
      if (place.bounds && place.bounds[2] - place.bounds[0] > 0.01) map.current?.fitBounds([[place.bounds[1], place.bounds[0]], [place.bounds[3], place.bounds[2]]], { paddingTopLeft: [60, 70], paddingBottomRight: [300, 60], maxZoom: 12 });
      else map.current?.flyTo([place.lat, place.lon], place.type === 'state' ? 7 : 10);
    },
    locate() {
      if (!navigator.geolocation) { latest.current.onMessage('Your browser does not support location access. Search for a place instead.'); return; }
      navigator.geolocation.getCurrentPosition(p => {
        map.current?.flyTo([p.coords.latitude, p.coords.longitude], 11); latest.current.onPick(p.coords.latitude, p.coords.longitude);
      }, () => latest.current.onMessage('Location access is unavailable. You can search for a place or click the map.'), { timeout: 10000 });
    },
    edit(active) {
      map.current?.pm.disableDraw();
      if (active) drawn.current.eachLayer(layer => { const editable = layer as L.Layer & { pm?: { enable: (options?: object) => void } }; editable.pm?.enable({ allowSelfIntersection: false, snappable: true }); });
      else map.current?.pm.disableGlobalEditMode();
      if (!active) drawn.current.eachLayer(layer => (layer as L.Layer & { pm?: { disable: () => void } }).pm?.disable());
    },
    invalidate() { map.current?.invalidateSize(); },
  }));

  useEffect(() => {
    if (!element.current) return;
    const m = L.map(element.current, { center: [10.75, 76.0], zoom: 7, zoomControl: false, attributionControl: false, minZoom: 2, maxZoom: 18, preferCanvas: true, doubleClickZoom: false });
    map.current = m;
    m.createPane('land'); m.getPane('land')!.style.zIndex = '200';
    m.createPane('reference'); m.getPane('reference')!.style.zIndex = '220';
    m.createPane('labels'); m.getPane('labels')!.style.zIndex = '350'; m.getPane('labels')!.style.pointerEvents = 'none';
    m.createPane('tiles'); m.getPane('tiles')!.style.zIndex = '300';
    m.createPane('selectedBoundary'); m.getPane('selectedBoundary')!.style.zIndex = '360';
    drawn.current.addTo(m);
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 110 }).addTo(m);
    let lastMove = 0;
    m.on('mousemove', e => { if (Date.now() - lastMove > 100) { lastMove = Date.now(); latest.current.onCoordinates(e.latlng.lat, e.latlng.lng); } });
    m.on('click', e => { if (!m.pm.globalDrawModeEnabled() && !m.pm.globalEditModeEnabled()) latest.current.onPick(e.latlng.lat, e.latlng.lng); });
    m.on('pm:create', e => {
      const layer = e.layer as L.Layer & { toGeoJSON: () => Feature };
      latest.current.onCreate(layer.toGeoJSON()); m.removeLayer(layer); m.pm.disableDraw(); latest.current.onDrawEnd();
    });
    const resize = new ResizeObserver(() => m.invalidateSize()); resize.observe(element.current);
    let cancelled = false;
    Promise.all(['countries', 'states', 'roads', 'rivers', 'places'].map(name => fetch(`/data/${name}.geojson`).then(r => { if (!r.ok) throw new Error('Reference data unavailable'); return r.json() as Promise<FeatureCollection>; }))).then(([countries, states, roads, rivers, places]) => {
      if (cancelled) return;
      L.geoJSON(countries, { pane: 'land', interactive: false, style: { fillColor: '#f3f1e7', fillOpacity: 1, color: '#c8d1c4', weight: 1 } }).addTo(m);
      L.geoJSON(states, { pane: 'reference', interactive: false, style: f => ({ fillColor: f?.properties?.name === 'Kerala' ? '#e4ebd9' : '#eff0e3', fillOpacity: 0.75, color: '#bdc5b3', weight: 0.8, dashArray: '3,4' }) }).addTo(m);
      L.geoJSON(rivers, { pane: 'reference', interactive: false, style: { color: '#b7d2d1', weight: 1.4, opacity: 0.85 } }).addTo(m);
      L.geoJSON(roads, { pane: 'reference', interactive: false, style: f => ({ color: f?.properties?.type === 'Major Highway' ? '#dccb9d' : '#ded7bb', weight: 1.15, opacity: 0.85 }) }).addTo(m);
      const labels = L.layerGroup().addTo(m); labelGroup.current = labels;
      const renderLabels = () => {
        labels.clearLayers();
        const zoom = m.getZoom(), bounds = m.getBounds().pad(0.2);
        const candidates = places.features.filter(f => {
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          return bounds.contains([coords[1], coords[0]]) && Number(f.properties?.rank) <= (zoom >= 9 ? 10 : zoom >= 7 ? 7 : zoom >= 6 ? 4 : zoom >= 5 ? 2 : 0);
        }).sort((a, b) => Number(b.properties?.population) - Number(a.properties?.population));
        const positions: L.Point[] = [];
        for (const f of candidates.slice(0, 200)) {
          const c = (f.geometry as GeoJSON.Point).coordinates, projected = m.latLngToContainerPoint([c[1], c[0]]);
          if (positions.some(p => Math.abs(p.x - projected.x) < 76 && Math.abs(p.y - projected.y) < 24)) continue;
          positions.push(projected);
          const node = document.createElement('span'); node.className = Number(f.properties?.population) > 800000 ? 'city-label major' : 'city-label'; node.textContent = String(f.properties?.name);
          L.marker([c[1], c[0]], { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'map-place-label', html: node, iconSize: [120, 20], iconAnchor: [5, 10] }) }).addTo(labels);
        }
        if (zoom >= 5 && zoom <= 8) {
          for (const f of states.features.filter(f => ['Kerala', 'Tamil Nadu', 'Karnataka', 'Andhra Pradesh', 'Goa', 'Maharashtra'].includes(String(f.properties?.name)))) {
            const c = centroid(f).geometry.coordinates;
            const node = document.createElement('span'); node.className = 'state-label'; node.textContent = String(f.properties?.name).toUpperCase();
            L.marker([c[1], c[0]], { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'map-state-label', html: node, iconSize: [160, 20], iconAnchor: [80, 0] }) }).addTo(labels);
          }
        }
        const sea = document.createElement('span'); sea.className = 'sea-label'; sea.innerHTML = 'Arabian<br/>Sea';
        L.marker([10.5, 73.5], { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'map-sea-label', html: sea, iconSize: [130, 80], iconAnchor: [65, 40] }) }).addTo(labels);
      };
      m.on('moveend', renderLabels); renderLabels(); setReady(true);
    }).catch(() => { if (!cancelled) { setLoadError(true); latest.current.onMessage('The reference map could not load. Refresh the page to try again.'); } });
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { m.pm.disableDraw(); latest.current.onDrawEnd(); } };
    document.addEventListener('keydown', key);
    return () => { cancelled = true; document.removeEventListener('keydown', key); resize.disconnect(); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    drawn.current.clearLayers();
    for (const feature of props.features.filter(f => f.properties.visible)) {
      const selected = feature.properties.id === props.selectedId;
      const group = L.geoJSON(feature, {
        style: { color: feature.properties.color, weight: selected ? 2.7 : 2, fillColor: feature.properties.color, fillOpacity: selected ? 0.23 : 0.13, dashArray: feature.properties.kind === 'route' ? undefined : '5,4' },
        pointToLayer: (_f, latlng) => L.marker(latlng, { icon: L.divIcon({ className: 'workspace-pin', html: `<span style="--pin-color:${/^#[0-9a-f]{6}$/i.test(feature.properties.color) ? feature.properties.color : '#477b52'}"><i></i></span>`, iconSize: [28, 38], iconAnchor: [14, 34] }) }),
        onEachFeature: (_f, layer) => {
          layer.on('click', e => { L.DomEvent.stopPropagation(e); latest.current.onSelect(feature.properties.id); });
          layer.on('pm:edit', () => latest.current.onUpdate((layer as L.Polygon).toGeoJSON() as Feature, feature.properties.id));
          layer.on('pm:dragend', () => latest.current.onUpdate((layer as L.Polygon).toGeoJSON() as Feature, feature.properties.id));
          if (feature.geometry.type !== 'Point' && feature.properties.kind !== 'boundary') {
            const label = document.createElement('div'); label.className = 'feature-tooltip'; label.textContent = feature.properties.name;
            layer.bindTooltip(label, { permanent: true, direction: 'center', className: 'drawing-label', interactive: false });
          } else if (feature.geometry.type === 'Point') {
            const label = document.createElement('span'); label.textContent = feature.properties.name;
            layer.bindTooltip(label, { direction: 'right', offset: [8, -17], className: 'point-tooltip' });
          }
        },
      });
      group.eachLayer(layer => drawn.current.addLayer(layer));
    }
  }, [props.features, props.selectedId, ready]);

  useEffect(() => {
    if (!map.current) return;
    boundaryLayer.current?.remove();
    if (props.boundary) boundaryLayer.current = L.geoJSON(props.boundary, { pane: 'selectedBoundary', interactive: false, pmIgnore: true, style: { color: '#739278', weight: 1.5, dashArray: '4,5', fillOpacity: 0.03 } }).addTo(map.current);
  }, [props.boundary, ready]);

  useEffect(() => {
    if (!map.current) return;
    tile.current?.remove();
    if (props.basemap === 'reference') { labelGroup.current?.addTo(map.current); return; }
    const terrain = props.basemap === 'terrain';
    const layer = L.tileLayer(terrain ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', { pane: 'tiles', maxZoom: terrain ? 17 : 19, subdomains: 'abc', crossOrigin: true });
    let notified = false;
    layer.on('tileerror', () => { if (!notified) { notified = true; latest.current.onMessage('Live map tiles are unavailable. The open reference map remains visible.'); } });
    layer.addTo(map.current); tile.current = layer;
    return () => { layer.remove(); };
  }, [props.basemap, ready]);
  return <><div className="map-canvas" ref={element} aria-label="Interactive geographic map. Use the drawing tools to add features, or click to inspect a location." />{!ready && !loadError && <div className="map-loading"><span className="loading-orbit" />Unfolding your world…</div>}</>;
});
export default MapCanvas;
