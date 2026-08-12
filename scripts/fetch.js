// Builds public/data/photos.json from Unsplash — once, on a developer machine.
//
//   npm run fetch -- --candidates    pull search results for every country
//   npm run fetch                    build photos.json from the curated `keep` lists
//   npm run fetch -- --candidates --only ISL,NOR
//
// The site itself never calls the API; it only reads the JSON this writes.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { search } from './unsplash.js';

const CONFIG     = 'src/data/countries.config.json';
const CANDIDATES = 'src/data/candidates.json';
const OUT        = 'public/data/photos.json';
const PER_COUNTRY = 5;

const args  = process.argv.slice(2);
const only  = value('--only')?.split(',').map(s => s.trim().toUpperCase());
const mode  = args.includes('--candidates') ? 'candidates' : 'build';

const config    = JSON.parse(readFileSync(CONFIG, 'utf8'));
const centroids = JSON.parse(readFileSync('public/data/centroids.json', 'utf8'));

const codes = Object.keys(config).filter(c => !only || only.includes(c));

if (mode === 'candidates') await pullCandidates();
else                       await build();

// ─────────────────────────────────────────────────────────────────────────────

async function pullCandidates() {
    const store = existsSync(CANDIDATES) ? JSON.parse(readFileSync(CANDIDATES, 'utf8')) : {};
    let pulled = 0;

    for (const code of codes) {
        const { query } = config[code];
        try {
            const photos = await search(query);
            store[code] = { query, photos };
            pulled++;
            console.log(`  ${code}  ${String(photos.length).padStart(2)} candidates  "${query}"`);
        } catch (err) {
            console.error(`  ${code}  FAILED — ${err.message.split('\n')[0]}`);
            if (err.message.includes('rate limit')) break;
        }
    }

    writeFileSync(CANDIDATES, JSON.stringify(store, null, 1));
    console.log(`\n${pulled}/${codes.length} countries pulled → ${CANDIDATES}`);
    console.log('Next: npm run curate   (pick the keepers, then npm run fetch)');
}

async function build() {
    if (!existsSync(CANDIDATES)) {
        console.error(`No ${CANDIDATES}. Run: npm run fetch -- --candidates`);
        process.exit(1);
    }
    const store = JSON.parse(readFileSync(CANDIDATES, 'utf8'));

    const countries = [];
    const problems  = [];

    for (const code of Object.keys(config)) {
        const place = centroids[code];
        if (!place) { problems.push(`${code}: no centroid — not an ISO country in the map data`); continue; }

        const pool = store[code]?.photos ?? [];
        const keep = config[code].keep ?? [];
        // curated ids win; otherwise fall back to the first N of the search
        const chosen = keep.length
            ? keep.map(id => pool.find(p => p.id === id)).filter(Boolean)
            : pool.slice(0, PER_COUNTRY);

        if (!chosen.length) { problems.push(`${code}: no photos — run --candidates, then curate`); continue; }
        if (keep.length && chosen.length < keep.length) {
            problems.push(`${code}: ${keep.length - chosen.length} kept id(s) missing from candidates`);
        }

        countries.push({
            iso:  code,
            name: place.name,
            lat:  place.lat,
            lng:  place.lng,
            photos: chosen.map(p => ({ ...strip(p), place: place.name })),
        });
    }

    // Every photo must carry attribution — that is the whole deal with these APIs,
    // so a missing credit fails the build rather than shipping quietly.
    const uncredited = countries.flatMap(c =>
        c.photos.filter(p => !p.credit?.name || !p.credit?.link).map(p => `${c.iso}/${p.id}`));
    if (uncredited.length) {
        console.error('Refusing to write: photos without attribution:\n  ' + uncredited.join('\n  '));
        process.exit(1);
    }

    mkdirSync('public/data', { recursive: true });
    writeFileSync(OUT, JSON.stringify({
        generated: new Date().toISOString().slice(0, 10),
        source: 'unsplash',
        countries,
    }, null, 1));

    const total = countries.reduce((n, c) => n + c.photos.length, 0);
    console.log(`${countries.length} countries, ${total} photos → ${OUT}`);
    if (problems.length) console.log('\nNeeds attention:\n  ' + problems.join('\n  '));
}

/** Drop the curate-only fields so they don't ship. */
function strip({ _thumb, _page, ...rest }) {
    return rest;
}

function value(flag) {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
}
