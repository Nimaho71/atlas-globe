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
const LOCATIONS  = 'src/data/locations.json';
const OWN        = 'src/data/own.json';
const OUT        = 'public/data/photos.json';
const PER_COUNTRY = 5;

const args  = process.argv.slice(2);
const only  = value('--only')?.split(',').map(s => s.trim().toUpperCase());
const mode  = args.includes('--candidates') ? 'candidates' : 'build';

const config    = JSON.parse(readFileSync(CONFIG, 'utf8'));
const centroids = JSON.parse(readFileSync('public/data/centroids.json', 'utf8'));
const locations = existsSync(LOCATIONS) ? JSON.parse(readFileSync(LOCATIONS, 'utf8')) : {};
const ownPhotos = existsSync(OWN) ? (JSON.parse(readFileSync(OWN, 'utf8')).photos ?? []) : [];

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

    // Your own photographs lead their country's set — they're the point, the
    // stock photos are the backdrop.
    const ownByIso = new Map();
    for (const p of ownPhotos) {
        if (!p.iso) continue;
        if (!ownByIso.has(p.iso)) ownByIso.set(p.iso, []);
        ownByIso.get(p.iso).push(p);
    }

    // an own photo in a country with no Unsplash config still gets a place
    const allCodes = new Set([...Object.keys(config), ...ownByIso.keys()]);

    for (const code of allCodes) {
        const place = centroids[code];
        if (!place) { problems.push(`${code}: no centroid — not an ISO country in the map data`); continue; }

        const pool = store[code]?.photos ?? [];
        const keep = config[code]?.keep ?? [];
        // curated ids win; otherwise fall back to the first N of the search
        const chosen = keep.length
            ? keep.map(id => pool.find(p => p.id === id)).filter(Boolean)
            : pool.slice(0, PER_COUNTRY);

        const mine = ownByIso.get(code) ?? [];

        if (!chosen.length && !mine.length) {
            problems.push(`${code}: no photos — run --candidates, then curate`);
            continue;
        }
        if (keep.length && chosen.length < keep.length) {
            problems.push(`${code}: ${keep.length - chosen.length} kept id(s) missing from candidates`);
        }

        countries.push({
            iso:  code,
            name: place.name,
            lat:  place.lat,
            lng:  place.lng,
            photos: [
                ...mine.map(p => ({ ...p, place: p.place || place.name })),
                ...chosen.map(p => ({
                    ...strip(p),
                    place: prettyPlace(locations[p.id], place.name),
                    ...coords(locations[p.id]),
                })),
            ],
        });
    }

    // Every photo must carry attribution — that is the whole deal with these APIs,
    // so a missing credit fails the build rather than shipping quietly.
    // (your own photos need a name but no profile link — there's nowhere to link to)
    const uncredited = countries.flatMap(c =>
        c.photos
            .filter(p => !p.credit?.name || (p.source !== 'own' && !p.credit?.link))
            .map(p => `${c.iso}/${p.id}`));
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

/**
 * Turn Unsplash's location string into a caption.
 *
 * These are typed by the photographer and then geocoded, so they arrive long
 * and in the uploader's own language: "Chureito Pagoda, ２丁目-4-1 Asama,
 * Fujiyoshida, Prefettura di Yamanashi, Giappone". Keep the leading landmark
 * and pair it with our own English country name, so captions read consistently
 * whoever uploaded them. No location: fall back to the country.
 */
function prettyPlace(loc, countryName) {
    if (!loc?.name) return countryName;

    const parts = loc.name.split(',').map(s => s.trim()).filter(Boolean);
    // skip street-ish leading fragments — "Unnamed Road", "2-4-1 Asama"
    const vague = s => /unnamed|^\d|road$|street$|straße$/i.test(s);
    const head  = parts.find(s => !vague(s)) ?? loc.city ?? parts[0];

    if (!head) return countryName;
    // "Iceland, Iceland" helps nobody
    return head.toLowerCase() === countryName.toLowerCase()
        ? countryName
        : `${head}, ${countryName}`;
}

/**
 * Keep coordinates only when they say something a country dot doesn't. Some
 * uploaders just tag the country, which geocodes to its centre — a pin there
 * claims precision the data hasn't got.
 */
function coords(loc) {
    if (loc?.lat == null || loc?.lng == null) return {};
    return { lat: round(loc.lat), lng: round(loc.lng) };
}

function round(n) { return Math.round(n * 1e4) / 1e4; }

function value(flag) {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
}
