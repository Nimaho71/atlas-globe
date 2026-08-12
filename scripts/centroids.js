// Regenerates public/data/centroids.json — one lat/lng per country, used for the
// map markers and as the camera target when a country opens.
//
//   npm run centroids
//
// Only needs re-running if the country map data changes.

import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoCentroid } from 'd3-geo';

const topo = JSON.parse(readFileSync('public/data/countries-110m.json', 'utf8'));
const iso  = JSON.parse(readFileSync('public/data/iso.json', 'utf8'));

const out = {};
for (const f of feature(topo, topo.objects.countries).features) {
    const meta = iso[String(f.id)];
    if (!meta) continue;                       // not an ISO country (Kosovo, Somaliland…)
    const [lng, lat] = geoCentroid(f);
    out[meta.a3] = { lat: +lat.toFixed(3), lng: +lng.toFixed(3), name: meta.name };
}

writeFileSync('public/data/centroids.json', JSON.stringify(out));
console.log(`centroids written for ${Object.keys(out).length} countries`);
