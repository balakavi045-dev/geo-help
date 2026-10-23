// Natural Earth is public domain. These regional reference layers also work offline.
import { mkdir, writeFile } from 'node:fs/promises';
import { simplify, bbox } from '@turf/turf';
const root = new URL('../public/data/', import.meta.url);
await mkdir(root, { recursive: true });
const base = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const regionalBox = [65, 4, 91, 30];
const intersects = feature => { const b = bbox(feature); return b[0] < regionalBox[2] && b[2] > regionalBox[0] && b[1] < regionalBox[3] && b[3] > regionalBox[1]; };
async function prepare(source, file, select, properties, tolerance) {
  console.log(`Preparing ${source}…`);
  const r = await fetch(`${base}${source}.geojson`, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Natural Earth: ${r.status}`);
  const data = await r.json();
  const features = data.features.filter(select).map(f => {
    const result = simplify(f, { tolerance, highQuality: true });
    result.properties = properties(f.properties);
    delete result.id;
    return result;
  });
  const result = { type: 'FeatureCollection', source: 'Natural Earth · public domain · reference data, not legal boundaries', features };
  await writeFile(new URL(file, root), JSON.stringify(result));
  console.log(`${file}: ${features.length} features`);
}
await prepare('ne_50m_admin_0_countries', 'countries.geojson', () => true,
  p => ({ name: p.NAME, code: p.ADM0_A3 }), 0.025);
await prepare('ne_10m_admin_1_states_provinces', 'states.geojson', f => ['IND', 'LKA'].includes(f.properties.adm0_a3),
  p => ({ name: p.name, country: p.admin, code: p.iso_3166_2, source: 'Natural Earth', license: 'Public domain', boundary_type: 'reference state / province' }), 0.004);
await prepare('ne_10m_roads', 'roads.geojson', intersects,
  p => ({ name: p.name || p.namealt || '', type: p.type, rank: p.scalerank }), 0.006);
await prepare('ne_10m_rivers_lake_centerlines', 'rivers.geojson', intersects,
  p => ({ name: p.name || '', rank: p.scalerank }), 0.004);
await prepare('ne_10m_populated_places_simple', 'places.geojson', () => true,
  p => ({ name: p.name, country: p.adm0name, state: p.adm1name, population: p.pop_max || 0, rank: p.scalerank }), 0.001);
