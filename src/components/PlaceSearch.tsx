import { useEffect, useRef, useState } from 'react';
import { Search, MapPin, ArrowUpLeft, LoaderCircle, X } from 'lucide-react';
import { api } from '../lib';
import type { Place } from '../types';

export default function PlaceSearch({ onSelect, onQueryChange, placeholder = 'Search a place, discover more…', compact = false, value, label }: { onSelect: (place: Place) => void; onQueryChange?: (query: string) => void; placeholder?: string; compact?: boolean; value?: Place | null; label?: string }) {
  const [query, setQuery] = useState(value?.name || '');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null), ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setQuery(value?.name || ''); setResults([]); setOpen(false); }, [value?.id]);
  useEffect(() => { const handler = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', handler); return () => { document.removeEventListener('mousedown', handler); request.current?.abort(); }; }, []);
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) { setError('Enter at least two characters to search.'); setOpen(true); return; }
    request.current?.abort(); request.current = new AbortController(); setBusy(true); setError(''); setNotice(''); setOpen(true);
    try {
      const data = await api<{ results: Place[]; notice?: string }>(`search?q=${encodeURIComponent(query.trim())}`, request.current.signal);
      setResults(data.results); setNotice(data.notice || '');
      if (!data.results.length) setError('No places found. Try a nearby city or a longer name.');
    } catch (err) { if ((err as Error).name !== 'AbortError') { setError((err as Error).message); setResults([]); } }
    finally { setBusy(false); }
  }
  return <div className={`place-search ${compact ? 'compact' : ''}`} ref={ref}>
    {label && <label>{label}</label>}
    <form onSubmit={search} className="search-form">
      {compact ? <MapPin size={17} /> : <Search size={19} />}
      <input aria-label={label || 'Search places'} value={query} onChange={e => { setQuery(e.target.value); setError(''); onQueryChange?.(e.target.value); }} onFocus={() => { if (results.length || error) setOpen(true); }} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }} placeholder={placeholder} autoComplete="off" />
      {query && !busy && <button type="button" className="icon-button search-clear" aria-label="Clear search" onClick={() => { setQuery(''); setResults([]); setOpen(false); onQueryChange?.(''); }}><X size={14} /></button>}
      <button className="search-submit" aria-label="Find place" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : compact ? <Search size={15} /> : <span>↵</span>}</button>
    </form>
    {open && <div className="search-results">
      {busy ? <div className="search-message"><LoaderCircle className="spin" size={16} /> Looking around the world…</div> : <>
        {notice && <div className="search-notice">Reference places · live search unavailable</div>}
        {error && <div className="search-message">{error}</div>}
        {results.map(p => <button key={p.id} type="button" onClick={() => { onSelect(p); setQuery(p.name); setOpen(false); }}><MapPin size={17} /><span><strong>{p.name}</strong><small>{p.label}</small></span><ArrowUpLeft size={15} /></button>)}
      </>}
    </div>}
  </div>;
}
