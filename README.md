# Terra — Your world, mapped.

A complete React + TypeScript map workspace for drawing, routing, exploring open geographic data, and exporting GeoJSON. Includes a Node/Express data API and a bundled Natural Earth reference basemap that works without tile services.

## Run locally

Requires **Node.js 24.5+** (uses Node's verified environment-proxy support) and npm.

**Opening `index.html` directly shows an empty page.** This React app needs its development server and data API. On Windows, install Node.js 24, then double-click `START-WINDOWS.bat`. Keep the terminal open and visit **http://localhost:5173**. Alternatively, use the commands below on Windows, macOS, or Linux.

```bash
npm ci
npm run dev
```

Vite serves the interface on port **5173** and proxies `/api` to Express on port **3001**. Open the Vite address in your browser. No API keys are required for the configured public services. The existing reference data and fonts are included in the repository; data preparation is optional.

```bash
npm run build       # TypeScript check and production bundle
npm test            # API and geographic calculation tests
npm start           # Serve production app and API together on port 3001
```

Set `PORT` to change the production port. Deploy to any host that runs a persistent Node.js service; **GitHub Pages alone cannot run the API**. Use HTTPS for browser geolocation and clipboard features. Public provider availability is independent of application availability.

## Features

- Draw polygons, polylines, markers, and rectangles; edit vertices, undo changes, hide/delete layers, and measure area/distance.
- Import GeoJSON and export selected layers in WGS 84 longitude/latitude order. Local workspace persistence; no account or application database.
- Submit a place search using Nominatim, with bundled Natural Earth place/state results as a fallback. Search is submitted explicitly, not autocomplete.
- Car routes using OSRM and OpenStreetMap; approximate sea lanes using the bundled Searoute.js/Eurostat network; great-circle flight paths using Turf.js.
- Export bundled reference state boundaries, or request mapped state, district, and village polygons containing a point through Overpass. Verify returned administrative levels and names: levels vary between countries, and small-area coverage is incomplete.
- Get surface elevation at a selected point via Open-Meteo and export it as a 3D GeoJSON point.
- Locate the full 1° Copernicus GLO-30 DEM GeoTIFF tile for a point. These potentially large raster downloads are **not clipped to drawn polygons**. Raster data is GeoTIFF, not GeoJSON.
- Get historical ERA5 precipitation, view monthly totals, and export a point with monthly/annual rainfall properties. This is modeled reanalysis, not observed station rainfall.
- Light reference basemap, live CARTO street tiles, and live OpenTopoMap terrain tiles.
- Responsive interface, keyboard cancellation, accessible controls, and downloadable open data credits.

The initial workspace includes two clearly removable example features around Kerala, India. Search and calculations support worldwide coordinates. The bundled detailed roads, rivers, and state boundaries cover India and the surrounding region; country outlines and place search are worldwide.

## Data, attribution, and limitations

| Source | Used for | License / terms |
|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) | Bundled countries, states, rivers, roads, places | Public domain; reference data, not legal boundaries |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Nominatim search, Overpass boundaries, OSRM road data | ODbL 1.0; preserve attribution and applicable share-alike requirements |
| [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | Submitted place lookup | Public service usage policy; API serializes requests to at most one per second and caches successful results |
| [OSRM](https://project-osrm.org/) | Road paths and estimated travel times | BSD 2-Clause software, OSM data ODbL; demo service has no uptime guarantee |
| [Searoute.js](https://www.npmjs.com/package/searoute-js) / [Eurostat](https://github.com/eurostat/searoute) | Approximate maritime network paths | MIT; visualization only, not marine navigation |
| [Turf.js](https://turfjs.org/) | Geodesic measurements and great-circle paths | MIT; flight geometry is not a scheduled flight or aviation route |
| [Open-Meteo](https://open-meteo.com/en/terms) | GLO-90 point elevations and ERA5 precipitation | Data CC BY 4.0; free endpoint is subject to non-commercial usage limits; review terms before commercial deployment |
| [Copernicus DEM](https://registry.opendata.aws/copernicus-dem/) | 30 m full surface elevation raster tiles | Copernicus DEM license; terrain includes vegetation/buildings, and some ocean tiles are absent |
| [CARTO](https://carto.com/attributions) | Optional street tiles | CARTO and OpenStreetMap attribution; review basemap service terms |
| [OpenTopoMap](https://opentopomap.org/about) | Optional terrain tiles | Map style CC BY-SA; OSM and SRTM source credits |
| Google Fonts: DM Sans / Manrope | Bundled local fonts | SIL Open Font License; notices in `public/fonts/` |

For production scale, use your own geocoding, routing, and Overpass infrastructure or providers with appropriate contracts and quotas. The app does not guarantee live traffic, port accessibility, legal administrative accuracy, surveying accuracy, or navigational safety. Open-Meteo public endpoints are not an unrestricted commercial service.

## Network access

The server requires HTTPS egress to:

```text
nominatim.openstreetmap.org
router.project-osrm.org
overpass-api.de
api.open-meteo.com
archive-api.open-meteo.com
```

Optional browser resources: `*.basemaps.cartocdn.com`, `*.tile.opentopomap.org`, and DEM downloads from `copernicus-dem-30m.s3.amazonaws.com`. Bundled reference maps, local place search fallback, sea-lane calculations, drawing, imports, exports, and flight-path calculations remain functional without these services. Live failures produce explicit messages; the app never substitutes invented weather or elevation values.

Coordinates and searches are sent only to the applicable credited provider when requested. Workspace layers remain in the current browser's local storage. Export a file for a durable backup; browser storage is not a cloud account.

## Refresh reference data

```bash
npm run data:prepare
```

This optional script downloads the five public-domain source GeoJSON datasets from [Natural Earth's repository](https://github.com/nvkelso/natural-earth-vector), selects the regional layers, and simplifies geometry. It preserves source/license metadata. These generalized boundaries are for exploration rather than current official boundary certification.

## Browser smoke checks

With the development servers running and Chromium installed:

```bash
CHROMIUM_PATH=/usr/bin/chromium node scripts/smoke-test.mjs
```

The smoke check verifies real UI drawing, valid GeoJSON downloads, route generation, local persistence, and a mobile viewport. Screenshots are written to ignored `test-results/`. Live road/weather/Overpass access is checked separately because upstream services may be blocked or unavailable.
