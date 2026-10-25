// Dependency-free WGS84 GIS writers. Each Shapefile geometry family has its own layer.
export function kml(fc) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const coords = a => a.map(p => p.join(',')).join(' ');
  function geometry(g) {
    if (g.type === 'Point') return `<Point><coordinates>${g.coordinates.join(',')}</coordinates></Point>`;
    if (g.type === 'LineString') return `<LineString><coordinates>${coords(g.coordinates)}</coordinates></LineString>`;
    if (g.type === 'Polygon') return `<Polygon>${g.coordinates.map((r,i) => `<${i?'inner':'outer'}BoundaryIs><LinearRing><coordinates>${coords(r)}</coordinates></LinearRing></${i?'inner':'outer'}BoundaryIs>`).join('')}</Polygon>`;
    const type = {MultiPoint:'Point',MultiLineString:'LineString',MultiPolygon:'Polygon'}[g.type];
    if (!type) throw new Error('Unsupported geometry');
    return `<MultiGeometry>${g.coordinates.map(c => geometry({type,coordinates:c})).join('')}</MultiGeometry>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${fc.features.map(f => `<Placemark><name>${esc(f.properties?.name)}</name><ExtendedData>${Object.entries(f.properties || {}).map(([k,v]) => `<Data name="${esc(k)}"><value>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</value></Data>`).join('')}</ExtendedData>${geometry(f.geometry)}</Placemark>`).join('')}</Document></kml>`;
}
const projection = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
function bounds(points) { const b=[Infinity,Infinity,-Infinity,-Infinity]; for(const p of points) { b[0]=Math.min(b[0],p[0]); b[1]=Math.min(b[1],p[1]); b[2]=Math.max(b[2],p[0]); b[3]=Math.max(b[3],p[1]); } return b; }
function box(b, offset, values) { values.forEach((v,i)=>b.writeDoubleLE(v,offset+i*8)); }
function orient(ring, outer) {
  const sum = ring.reduce((s,p,i)=> { const n=ring[(i+1)%ring.length]; return s+(n[0]-p[0])*(n[1]+p[1]); },0);
  return (sum>0) === outer ? ring : [...ring].reverse();
}
function shape(g, type) {
  if(type===1) { const b=Buffer.alloc(20); b.writeInt32LE(1); box(b,4,g.coordinates.slice(0,2)); return {b,points:[g.coordinates]}; }
  let parts;
  if(type===3) parts=g.type==='LineString'?[g.coordinates]:g.coordinates;
  if(type===5) parts=(g.type==='Polygon'?[g.coordinates]:g.coordinates).flatMap(p=>p.map((r,i)=>orient(r,i===0)));
  if(type===8) parts=[g.coordinates];
  const points=parts.flat(), n=points.length;
  const b=Buffer.alloc(type===8?40+16*n:44+4*parts.length+16*n); b.writeInt32LE(type); box(b,4,bounds(points));
  let offset;
  if(type===8) { b.writeInt32LE(n,36); offset=40; }
  else { b.writeInt32LE(parts.length,36); b.writeInt32LE(n,40); let index=0; parts.forEach((p,i)=>{b.writeInt32LE(index,44+i*4); index+=p.length;}); offset=44+parts.length*4; }
  points.forEach((p,i)=>box(b,offset+i*16,p.slice(0,2))); return {b,points};
}
function header(size,type,extent) { const b=Buffer.alloc(100); b.writeInt32BE(9994); b.writeInt32BE(size/2,24); b.writeInt32LE(1000,28); b.writeInt32LE(type,32); box(b,36,extent); return b; }
function dbf(features) {
  const keys=[...new Set(features.flatMap(f=>Object.keys(f.properties||{})))].slice(0,100);
  if(!keys.length) keys.push('name');
  const widths=keys.map(k=>Math.max(1,Math.min(254,...features.map(f=>Buffer.byteLength(String(f.properties?.[k]??''),'utf8')))));
  const recordSize=1+widths.reduce((a,b)=>a+b,0), headSize=33+32*keys.length;
  const b=Buffer.alloc(headSize+recordSize*features.length+1,32), now=new Date();
  b.fill(0,0,headSize); b[0]=3; b[1]=now.getUTCFullYear()-1900; b[2]=now.getUTCMonth()+1; b[3]=now.getUTCDate(); b.writeUInt32LE(features.length,4); b.writeUInt16LE(headSize,8); b.writeUInt16LE(recordSize,10);
  const names=new Set(); keys.forEach((k,i)=>{let name=k.replace(/[^a-zA-Z0-9_]/g,'_').slice(0,10)||'field'; let suffix=1; while(names.has(name)) name=k.slice(0,6)+'_'+suffix++; names.add(name); b.write(name,32+32*i,10,'ascii'); b[43+32*i]=67; b[48+32*i]=widths[i];}); b[headSize-1]=13;
  features.forEach((f,i)=>{let pos=headSize+i*recordSize+1; keys.forEach((k,j)=>{let value=String(f.properties?.[k]??''); while(Buffer.byteLength(value)>widths[j]) value=value.slice(0,-1); b.write(value,pos,widths[j],'utf8'); pos+=widths[j];});}); b[b.length-1]=26; return b;
}
function crc32(data) { let crc=0xffffffff; for(const byte of data) {crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); } return (crc^0xffffffff)>>>0; }
export function zip(files) {
  const local=[],central=[]; let offset=0;
  for(const [name,value] of Object.entries(files)) { const data=Buffer.from(value), filename=Buffer.from(name), crc=crc32(data), h=Buffer.alloc(30), c=Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4); h.writeUInt32LE(crc,14); h.writeUInt32LE(data.length,18); h.writeUInt32LE(data.length,22); h.writeUInt16LE(filename.length,26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt32LE(crc,16); c.writeUInt32LE(data.length,20); c.writeUInt32LE(data.length,24); c.writeUInt16LE(filename.length,28); c.writeUInt32LE(offset,42);
    local.push(h,filename,data); central.push(c,filename); offset+=h.length+filename.length+data.length;
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length,8); end.writeUInt16LE(Object.keys(files).length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16); return Buffer.concat([...local,directory,end]);
}
export function shapefile(fc) {
  const files={}, types={Point:1,MultiPoint:8,LineString:3,MultiLineString:3,Polygon:5,MultiPolygon:5};
  for(const type of [1,3,5,8]) {
    const features=fc.features.filter(f=>types[f.geometry.type]===type); if(!features.length) continue;
    const shapes=features.map(f=>shape(f.geometry,type));
    const extent=shapes.reduce((e,s)=>{const b=bounds(s.points); return [Math.min(e[0],b[0]),Math.min(e[1],b[1]),Math.max(e[2],b[2]),Math.max(e[3],b[3])];},[Infinity,Infinity,-Infinity,-Infinity]);
    let offset=100; const records=[], index=[];
    shapes.forEach((s,i)=>{const h=Buffer.alloc(8), x=Buffer.alloc(8); h.writeInt32BE(i+1); h.writeInt32BE(s.b.length/2,4); x.writeInt32BE(offset/2); x.writeInt32BE(s.b.length/2,4); records.push(h,s.b); index.push(x); offset+=8+s.b.length;});
    const name={1:'points',3:'lines',5:'polygons',8:'multipoints'}[type];
    files[`${name}.shp`]=Buffer.concat([header(offset,type,extent),...records]); files[`${name}.shx`]=Buffer.concat([header(100+8*shapes.length,type,extent),...index]); files[`${name}.dbf`]=dbf(features); files[`${name}.prj`]=projection; files[`${name}.cpg`]='UTF-8';
  }
  files['README.txt']='WGS84 EPSG:4326. Attributes stored as text. DBF names limited to 10 characters and values to 254 bytes. Shapefile coordinates are 2D. Source properties retain data attribution; OSM data is ODbL. Full precision attributes and heights: use GeoJSON.';
  return zip(files);
}
