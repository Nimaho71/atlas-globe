// Generates a PLACEHOLDER public/data/photos.json so the globe has something to
// render before the real Unsplash fetch exists (Phase 1).
//
// The photos are the eight images from the original nature gallery, spread across
// a handful of countries. They are NOT pictures of those countries — this file is
// scaffolding for development only and must be replaced by `npm run fetch`
// before anything is deployed publicly.

import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoCentroid } from 'd3-geo';

const topo = JSON.parse(readFileSync('public/data/countries-110m.json', 'utf8'));
const iso  = JSON.parse(readFileSync('public/data/iso.json', 'utf8'));
const feats = feature(topo, topo.objects.countries).features;

const centroid = {};
for (const f of feats) {
    const meta = iso[String(f.id)];
    if (!meta) continue;
    const [lng, lat] = geoCentroid(f);
    centroid[meta.a3] = { lat: +lat.toFixed(3), lng: +lng.toFixed(3), name: meta.name };
}

const IMAGES = [
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e',
    'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b',
    'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d',
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb',
    'https://images.unsplash.com/photo-1552083375-1447ce886485',
    'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8',
    'https://images.unsplash.com/photo-1433086966358-54859d0ed716',
];

const SEED = ['ISL', 'NOR', 'JPN', 'NZL', 'CHL', 'CAN', 'CHE', 'ZAF', 'AUS', 'PRT'];

const countries = SEED.map((code, ci) => {
    const c = centroid[code];
    if (!c) throw new Error(`no centroid for ${code}`);
    const n = 4 + (ci % 3);
    return {
        iso: code,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        photos: Array.from({ length: n }, (_, i) => {
            const url = IMAGES[(ci * 3 + i) % IMAGES.length];
            return {
                id: `seed-${code}-${i}`,
                url: `${url}?auto=format&fit=crop&w=1200&q=80`,
                w: 1200, h: 800,
                color: '#16202a',
                title: `${c.name} — placeholder ${i + 1}`,
                source: 'unsplash',
                credit: { name: 'Unsplash', link: 'https://unsplash.com' },
                licence: 'Unsplash',
                placeholder: true,
            };
        }),
    };
});

writeFileSync('public/data/photos.json', JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    placeholder: true,
    countries,
}, null, 1));

writeFileSync('public/data/centroids.json', JSON.stringify(centroid));

console.log(`seeded ${countries.length} countries, ${countries.reduce((n, c) => n + c.photos.length, 0)} photos`);
console.log('centroids written for', Object.keys(centroid).length, 'countries');
