// Node-side country lookup: loads the map data, then defers to the shared
// point-in-polygon core that the studio uses in the browser.

import { readFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { createLookup } from '../src/lib/point-in-country.js';

let lookup = null;

/** @returns {{iso: string, name: string} | null} */
export function countryAt(lat, lng) {
    if (!lookup) {
        const topo = JSON.parse(readFileSync('public/data/countries-110m.json', 'utf8'));
        const iso  = JSON.parse(readFileSync('public/data/iso.json', 'utf8'));
        lookup = createLookup(feature(topo, topo.objects.countries).features, iso);
    }
    return lookup(lat, lng);
}
