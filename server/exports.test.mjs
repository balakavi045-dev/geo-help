import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { kml, shapefile } from './exports.mjs';
const features = [
 {type:'Feature', properties:{name:'River & stream', source:'OpenStreetMap', license:'ODbL'},geometry:{type:'LineString',coordinates:[[76,10],[76.1,10.1],[76.2,10.2]]}},
 {type:'Feature',properties:{name:'Village'},geometry:{type:'Polygon',coordinates:[[[76,10],[77,10],[77,11],[76,11],[76,10]],[[76.2,10.2],[76.2,10.3],[76.3,10.3],[76.3,10.2],[76.2,10.2]]]}},
 {type:'Feature',properties:{name:'Point'},geometry:{type:'Point',coordinates:[76,10,50]}},
 {type:'Feature',properties:{name:'Multi'},geometry:{type:'MultiPoint',coordinates:[[76,10],[77,11]]}}
];
const fc={type:'FeatureCollection',features};
test('KML escapes labels and retains properties, holes and altitude',()=>{const xml=kml(fc); assert.match(xml,/River &amp; stream/); assert.match(xml,/<innerBoundaryIs>/); assert.match(xml,/76,10,50/); assert.match(xml,/Data name="license"/); assert.match(xml,/<MultiGeometry>/);});
test('Shapefile archive includes each geometry family and valid file headers',()=>{const zip=shapefile(fc); let pos=0,count=0;while(zip.readUInt32LE(pos)===0x04034b50){const size=zip.readUInt32LE(pos+18), n=zip.readUInt16LE(pos+26), name=zip.toString('utf8',pos+30,pos+30+n),data=zip.subarray(pos+30+n,pos+30+n+size);if(name.endsWith('.shp')){assert.equal(data.readUInt32BE(0),9994);assert.equal(data.readUInt32BE(24)*2,data.length);assert.equal(data.readUInt32LE(28),1000);count++;}pos+=30+n+size;}assert.equal(count,4);assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);mkdirSync('work', { recursive: true });writeFileSync('work/export-fixture.zip',zip);});
