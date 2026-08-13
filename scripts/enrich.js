// Fills in where each photo was taken — Unsplash carries a location on the
// single-photo endpoint, which search results don't include.
//
//   npm run enrich              work through everything still missing
//   npm run enrich -- --only ISL,NOR
//
// One request per photo against a 50/hour key, so this is a slow crawl by
// design: it caches every response, stops when the hour is spent, and picks up
// where it left off next run. Run it a few times over a couple of days.
//
// Output: src/data/locations.json, keyed by photo id. `npm run fetch` folds it
// into photos.json.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { get } from './unsplash.js';

const CONFIG    = 'src/data/countries.config.json';
const LOCATIONS = 'src/data/locations.json';

const args = process.argv.slice(2);
const onlyArg = args.indexOf('--only');
const only = onlyArg === -1 ? null
    : args[onlyArg + 1]?.split(',').map(s => s.trim().toUpperCase());

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const store  = existsSync(LOCATIONS) ? JSON.parse(readFileSync(LOCATIONS, 'utf8')) : {};

// every curated photo, in country order
const wanted = [];
for (const [iso, cfg] of Object.entries(config)) {
    if (only && !only.includes(iso)) continue;
    for (const id of cfg.keep ?? []) wanted.push({ iso, id });
}

const todo = wanted.filter(w => !(w.id in store));
console.log(`${wanted.length} curated photos · ${wanted.length - todo.length} already located · ${todo.length} to go\n`);

let done = 0;
let hitLimit = false;

for (const { iso, id } of todo) {
    const bare = id.replace(/^unsplash-/, '');
    try {
        const full = await get(`/photos/${bare}`, {});
        const loc  = full.location ?? {};
        const pos  = loc.position ?? {};

        store[id] = {
            name:    loc.name    ?? null,
            city:    loc.city    ?? null,
            country: loc.country ?? null,
            lat:     pos.latitude  ?? null,
            lng:     pos.longitude ?? null,
        };
        done++;
        console.log(`  ${iso}  ${store[id].name ?? '(no location given)'}`);
    } catch (err) {
        const msg = err.message.split('\n')[0];
        if (msg.includes('rate limit') || msg.includes('403')) {
            hitLimit = true;
            console.log(`\nHourly limit reached after ${done} — progress saved.`);
            break;
        }
        console.error(`  ${iso}  ${bare} failed: ${msg}`);
        store[id] = { name: null, city: null, country: null, lat: null, lng: null };
    }
}

writeFileSync(LOCATIONS, JSON.stringify(store, null, 1));

const located = Object.values(store).filter(l => l.name).length;
const remaining = wanted.filter(w => !(w.id in store)).length;

console.log(`\n${Object.keys(store).length} photos looked up · ${located} have a place name · ${remaining} still to do`);
if (hitLimit || remaining) console.log('Run `npm run enrich` again in an hour to continue.');
else console.log('All done — run `npm run fetch` to fold these into photos.json.');
