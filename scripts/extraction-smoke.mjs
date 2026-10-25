import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/extract?**',route=>route.fulfill({json:{type:'FeatureCollection',features:[1,2].map(i=>({type:'Feature',properties:{name:`Fixture river ${i}`,source:'OpenStreetMap',license:'ODbL'},geometry:{type:'LineString',coordinates:[[76,10+i/10],[76.1,10.1+i/10]]}}))}}));
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Extract geography',exact:true}).click();
 await page.getByText('2 features · OpenStreetMap · ODbL 1.0').waitFor();
 for(const format of ['kml','shp']) {
  await page.getByLabel('DOWNLOAD FORMAT').selectOption(format);
  const event=page.waitForEvent('download');await page.getByRole('button',{name:`Download ${format.toUpperCase()}`,exact:true}).click();const file=await event;const bytes=await readFile(await file.path());
  if(format==='kml') assert.match(bytes.toString(),/Fixture river 2/);else assert.equal(bytes.readUInt32LE(),0x04034b50);
 }
 await page.getByRole('button',{name:'Add to workspace',exact:true}).click();
 assert.equal(await page.locator('.layer-item').count(),4);
 await page.getByRole('button',{name:'Export data',exact:true}).click();
 await page.getByLabel('EXPORT FORMAT').selectOption('shp');
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'Export 4 layers',exact:true}).click();assert.match((await event).suggestedFilename(),/\.zip$/);
 assert.deepEqual(errors,[]);console.log('PASS extraction panel, KML and Shapefile downloads, batch workspace add, and mixed-layer export (fixture data).');
} finally { await browser.close(); }
