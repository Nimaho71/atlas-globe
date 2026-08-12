// Regenerates public/data/centroids.json — one lat/lng per country, used for the
// map markers and as the camera target when a country opens.
//
//   npm run centroids
//
// Only needs re-running if the country map data changes.

import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoCentroid, geoArea, geoContains } from 'd3-geo';

const topo = JSON.parse(readFileSync('public/data/countries-110m.json', 'utf8'));
const iso  = JSON.parse(readFileSync('public/data/iso.json', 'utf8'));

const out = {};
const moved = [];

for (const f of feature(topo, topo.objects.countries).features) {
    const meta = iso[String(f.id)];
    if (!meta) continue;                       // not an ISO country (Kosovo, Somaliland…)

    let [lng, lat] = geoCentroid(f);

    // A country with distant territories — France with French Guiana, the US
    // with Alaska and Hawaii — averages out into open ocean, and a marker
    // floating in the sea reads as a bug. When that happens, fall back to the
    // middle of the largest landmass instead.
    if (!geoContains(f, [lng, lat])) {
        const biggest = parts(f.geometry)
            .map(geometry => ({ geometry, area: geoArea(geometry) }))
            .sort((a, b) => b.area - a.area)[0];
        if (biggest) {
            const [l2, a2] = geoCentroid(biggest.geometry);
            moved.push(`${meta.a3} ${meta.name}`);
            lng = l2;
            lat = a2;
        }
    }

    out[meta.a3] = { lat: +lat.toFixed(3), lng: +lng.toFixed(3), name: meta.name };
}

/** A MultiPolygon's pieces as standalone Polygons; anything else as itself. */
function parts(geometry) {
    return geometry.type === 'MultiPolygon'
        ? geometry.coordinates.map(coordinates => ({ type: 'Polygon', coordinates }))
        : [geometry];
}

writeFileSync('public/data/centroids.json', JSON.stringify(out));
console.log(`centroids written for ${Object.keys(out).length} countries`);
if (moved.length) console.log(`moved onto the main landmass:\n  ${moved.join('\n  ')}`);
