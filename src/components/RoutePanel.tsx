import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowDownUp, ArrowRight, Car, Check, ChevronRight, Circle, Clock3, Compass, LoaderCircle, MapPin, Plane, Route, Ship } from 'lucide-react';
import type { Feature } from 'geojson';
import { api, exportFeatures } from '../lib';
import type { Place } from '../types';
import PlaceSearch from './PlaceSearch';
const kochi: Place = { id: 'route-kochi', name: 'Kochi', label: 'Kochi, Kerala, India', lat: 9.9674, lon: 76.2673, type: 'city', country: 'India' };
const mumbai: Place = { id: 'route-mumbai', name: 'Mumbai', label: 'Mumbai, Maharashtra, India', lat: 18.96, lon: 72.82, type: 'city', country: 'India' };
export default function RoutePanel({ onRoute, onMessage }: { onRoute: (feature: Feature, name: string) => void; onMessage: (message: string) => void }) {
  const [mode, setMode] = useState('car'), [from, setFrom] = useState<Place | null>(kochi), [to, setTo] = useState<Place | null>(mumbai);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [route, setRoute] = useState<Feature | null>(null), [added, setAdded] = useState(false);
  const [fromValid, setFromValid] = useState(true), [toValid, setToValid] = useState(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function reset() { controller.current?.abort(); setBusy(false); setError(''); setRoute(null); setAdded(false); }
  async function calculate() {
    if (!from || !to || !fromValid || !toValid) { setError('Search and select both your origin and destination.'); return; }
    controller.current?.abort(); controller.current = new AbortController(); setBusy(true); setError(''); setRoute(null); setAdded(false);
    try {
      const data = await api<Feature>(`route?${new URLSearchParams({ from: `${from.lon},${from.lat}`, to: `${to.lon},${to.lat}`, mode })}`, controller.current.signal);
      setRoute(data); onRoute(data, `${from.name} → ${to.name}`); setAdded(true);
    } catch (err) { if ((err as Error).name !== 'AbortError') setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="route-panel">
    <div className="section-heading"><span>GO A LITTLE FURTHER</span><Compass size={15} /></div>
    <div className="route-modes">{[{ id: 'car', icon: Car, name: 'Car' }, { id: 'ship', icon: Ship, name: 'Ship' }, { id: 'flight', icon: Plane, name: 'Flight' }].map(({ id, icon: Icon, name }) => <button key={id} className={mode === id ? 'active' : ''} onClick={() => { reset(); setMode(id); }}><Icon size={20} strokeWidth={1.6} /><span>{name}</span></button>)}</div>
    <div className="route-endpoints"><div className="route-endpoint-line"><Circle size={12} /><span /><MapPin size={14} /></div><div className="route-fields"><PlaceSearch compact label="FROM" value={from} placeholder="Search departure place" onQueryChange={q => { reset(); setFromValid(q === from?.name); }} onSelect={p => { reset(); setFrom(p); setFromValid(true); }} /><PlaceSearch compact label="TO" value={to} placeholder="Search destination place" onQueryChange={q => { reset(); setToValid(q === to?.name); }} onSelect={p => { reset(); setTo(p); setToValid(true); }} /></div><button className="swap-button" aria-label="Swap origin and destination" disabled={!fromValid || !toValid} onClick={() => { reset(); setFrom(to); setTo(from); }}><ArrowDownUp size={16} /></button></div>
    <button className="primary-button full-width route-calculate" disabled={busy || !from || !to || !fromValid || !toValid} onClick={calculate}>{busy ? <LoaderCircle size={16} className="spin" /> : <Route size={16} />}{busy ? 'Finding your route…' : 'Find a route'}{!busy && <ArrowRight size={16} />}</button>
    {(!fromValid || !toValid) && <p className="route-mode-note">Press Enter to search, then select a place from the results.</p>}
    <p className="route-mode-note">{mode === 'car' ? 'Road routing powered by OpenStreetMap & OSRM. Travel times are estimates without traffic.' : mode === 'ship' ? 'Approximate sea lanes via the Eurostat network. Snaps to the nearest sea network points. Not for navigation.' : 'A great-circle path between two places. Not a scheduled flight or an air traffic route.'}</p>
    {error && <div className="inline-error" role="alert">{error}{mode === 'car' && <p>Flight paths and approximate sea lanes can also be calculated without a live routing service.</p>}</div>}
    {route && <div className="route-result"><div className="result-eyebrow"><span className="tiny-dot" />{mode === 'car' ? 'ROAD ROUTE' : mode === 'ship' ? 'APPROXIMATE SEA ROUTE' : 'GREAT-CIRCLE PATH'}{added && <Check size={14} />}</div><h3>{Number(route.properties?.distance_km).toLocaleString(undefined, { maximumFractionDigits: 1 })}<span>km</span></h3>{route.properties?.duration_s && <p><Clock3 size={13} />{Math.floor(Number(route.properties.duration_s) / 3600)} h {Math.round(Number(route.properties.duration_s) % 3600 / 60)} min estimated</p>}<div className="route-places"><span>{from?.name}</span><ChevronRight size={14} /><span>{to?.name}</span></div><button className="secondary-button full-width" onClick={() => { exportFeatures([route], `${from?.name}-to-${to?.name}-${mode}`); onMessage('Route exported as GeoJSON.'); }}><ArrowDownToLine size={15} />Export route</button></div>}
    <div className="route-tip"><span>EVERY JOURNEY STARTS SOMEWHERE</span><h3>By land, sea, or sky.</h3><p>Connect places. Discover the space between them.</p><div className="route-art"><i /><i /><i /><span><Plane size={21} /></span><b /><b /></div></div>
  </div>;
}
