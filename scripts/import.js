// Import your own photographs onto the globe.
//
//   npm run import -- ~/Pictures/travel
//   npm run import -- ~/Downloads/Takeout/Google\ Photos
//   npm run import -- ~/Pictures/travel --dry
//
// Works with a plain folder of photos, or an unzipped Google Takeout export.
// Takeout matters because Google's *API* hands out no location data at all,
// while a Takeout export ships a JSON sidecar per photo containing the real
// coordinates.
//
// Coordinates come from, in order: EXIF GPS → Takeout sidecar → whatever you
// wrote by hand in own.json. Photos with none are still imported and listed as
// needing a home, so nothing you point this at is silently dropped.
//
// Everything is local: photos are resized into public/photos/ and never
// uploaded anywhere.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname, basename, dirname } from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import { countryAt } from './place.js';

const OWN     = 'src/data/own.json';
const OUT_DIR = 'public/photos';
const FULL_W  = 2000;   // cinema
const THUMB_W = 600;    // strip
const EXTS    = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff']);

const args   = process.argv.slice(2);
const dry    = args.includes('--dry');
const source = args.find(a => !a.startsWith('--'));

if (!source) {
    console.error('Usage: npm run import -- <folder> [--dry]');
    process.exit(1);
}
if (!existsSync(source)) {
    console.error(`No such folder: ${source}`);
    process.exit(1);
}

const own   = existsSync(OWN) ? JSON.parse(readFileSync(OWN, 'utf8')) : { photos: [] };
const known = new Map(own.photos.map(p => [p.id, p]));

const files = walk(source).filter(f => EXTS.has(extname(f).toLowerCase()));
console.log(`${files.length} image${files.length === 1 ? '' : 's'} under ${source}\n`);

const added = [];
const kept  = [];
const noGps = [];
const failed = [];

for (const file of files) {
    const id = 'own-' + createHash('sha1').update(await fingerprint(file)).digest('hex').slice(0, 12);

    if (known.has(id)) { kept.push(known.get(id)); continue; }

    try {
        const meta   = await sharp(file).metadata();
        const gps    = await gpsFor(file);
        const taken  = await dateFor(file);
        const place  = gps ? countryAt(gps.lat, gps.lng) : null;

        const photo = {
            id,
            source: 'own',
            file:   basename(file),
            url:    `/photos/${id}.webp`,
            thumb:  `/photos/${id}-thumb.webp`,
            w: meta.width ?? null,
            h: meta.height ?? null,
            ...(gps   ? { lat: round(gps.lat), lng: round(gps.lng) } : {}),
            ...(place ? { iso: place.iso } : {}),
            ...(taken ? { taken } : {}),
            title:   '',
            credit:  { name: own.photographer ?? 'Nils Högberg', link: '' },
            licence: 'Own work',
        };

        if (!dry) await render(file, id);

        added.push(photo);
        if (!gps)   noGps.push(photo);
        else if (!place) noGps.push(photo);   // at sea, or outside the 110m shapes

        const where = place ? place.name : gps ? 'no country matched' : 'no coordinates';
        console.log(`  + ${basename(file).padEnd(34).slice(0, 34)} ${where}`);
    } catch (err) {
        failed.push({ file, err: err.message.split('\n')[0] });
        console.log(`  ! ${basename(file).padEnd(34).slice(0, 34)} ${err.message.split('\n')[0]}`);
    }
}

const photos = [...kept, ...added].sort((a, b) => (a.taken ?? '').localeCompare(b.taken ?? ''));

if (!dry) {
    mkdirSync(dirname(OWN), { recursive: true });
    writeFileSync(OWN, JSON.stringify({ ...own, photos }, null, 1));
}

// ─── report ──────────────────────────────────────────────────────────────────

const placed = photos.filter(p => p.iso).length;
console.log(`\n${added.length} new, ${kept.length} already imported, ${placed}/${photos.length} placed on the map`);

if (noGps.length) {
    console.log(`\n${noGps.length} without a location — add "lat"/"lng" (or "iso") in ${OWN}:`);
    for (const p of noGps.slice(0, 12)) console.log(`   ${p.id}  ${p.file}`);
    if (noGps.length > 12) console.log(`   …and ${noGps.length - 12} more`);
    console.log('   (chat apps and most exports strip GPS; a Takeout export keeps it)');
}
if (failed.length) console.log(`\n${failed.length} could not be read (HEIC often needs a JPEG export)`);
if (dry) console.log('\n--dry: nothing written');
else console.log(`\nNext: npm run fetch   (merges these into photos.json)`);

// ─────────────────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.')) continue;
        const full = join(dir, entry);
        statSync(full).isDirectory() ? walk(full, out) : out.push(full);
    }
    return out;
}

/** Identity of a photo: its bytes, so re-running never duplicates or re-renders. */
async function fingerprint(file) {
    const { size } = statSync(file);
    return `${basename(file)}:${size}`;
}

/** EXIF first, then a Google Takeout sidecar. */
async function gpsFor(file) {
    try {
        const gps = await exifr.gps(file);
        if (gps?.latitude != null && gps?.longitude != null) {
            return { lat: gps.latitude, lng: gps.longitude };
        }
    } catch { /* unreadable EXIF is not fatal */ }

    const side = sidecarFor(file);
    const geo  = side?.geoData ?? side?.geoDataExif;
    // Takeout writes 0,0 when it has nothing — the Atlantic is not a location
    if (geo && (geo.latitude || geo.longitude)) {
        return { lat: geo.latitude, lng: geo.longitude };
    }
    return null;
}

async function dateFor(file) {
    try {
        const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
        const d = meta?.DateTimeOriginal ?? meta?.CreateDate;
        if (d) return new Date(d).toISOString().slice(0, 10);
    } catch { /* fall through */ }

    const side = sidecarFor(file);
    const ts   = side?.photoTakenTime?.timestamp;
    if (ts) return new Date(Number(ts) * 1000).toISOString().slice(0, 10);
    return null;
}

/**
 * Takeout's sidecar naming has changed repeatedly: "IMG_1.jpg.json",
 * "IMG_1.json", and more recently "IMG_1.jpg.supplemental-metadata.json",
 * which also gets truncated for long filenames. Try the known shapes.
 */
function sidecarFor(file) {
    const dir  = dirname(file);
    const base = basename(file);
    const stem = base.slice(0, base.length - extname(base).length);

    const candidates = [
        `${base}.json`,
        `${stem}.json`,
        `${base}.supplemental-metadata.json`,
        `${stem}.supplemental-metadata.json`,
    ];

    for (const name of candidates) {
        const path = join(dir, name);
        if (existsSync(path)) {
            try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
        }
    }
    // truncated supplemental names: match on the stem
    try {
        const hit = readdirSync(dir).find(f =>
            f.startsWith(stem) && f.endsWith('.json') && f.includes('supplemental'));
        if (hit) return JSON.parse(readFileSync(join(dir, hit), 'utf8'));
    } catch { /* ignore */ }
    return null;
}

/** Two WebPs per photo: one for the strip, one for the cinema. */
async function render(file, id) {
    mkdirSync(OUT_DIR, { recursive: true });
    const img = sharp(file).rotate();          // honour EXIF orientation
    await img.clone().resize({ width: FULL_W,  withoutEnlargement: true })
             .webp({ quality: 82 }).toFile(join(OUT_DIR, `${id}.webp`));
    await img.clone().resize({ width: THUMB_W, withoutEnlargement: true })
             .webp({ quality: 78 }).toFile(join(OUT_DIR, `${id}-thumb.webp`));
}

function round(n) { return Math.round(n * 1e4) / 1e4; }
