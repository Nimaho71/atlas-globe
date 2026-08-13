// Studio: build your own globe from your own photographs, entirely in the browser.
//
// Drop photos → read EXIF GPS → resolve the country offline against the same map
// data the globe draws → downscale → keep in IndexedDB. Nothing is uploaded, and
// nothing needs an API key. Photos without GPS (most things sent through a chat
// app) are placed by picking the photo and clicking a country.

import './studio.css';
import exifr from 'exifr';
import { feature } from 'topojson-client';
import { createLookup } from '../src/lib/point-in-country.js';
import { createGlobe } from '../src/globe/globe.js';
import * as store from './store.js';

const FULL_W  = 2000;
const THUMB_W = 600;

const el = {
    drop:      document.getElementById('drop'),
    picker:    document.getElementById('picker'),
    status:    document.getElementById('status'),
    unplaced:  document.getElementById('unplaced'),
    unplacedList:  document.getElementById('unplaced-list'),
    unplacedCount: document.getElementById('unplaced-count'),
    placed:      document.getElementById('placed'),
    placedList:  document.getElementById('placed-list'),
    placedCount: document.getElementById('placed-count'),
    exportBtn: document.getElementById('export'),
    clearBtn:  document.getElementById('clear'),
};

// ─── map data, shared with the globe ─────────────────────────────────────────

const [topo, isoMap, centroids] = await Promise.all([
    fetch('/data/countries-110m.json').then(r => r.json()),
    fetch('/data/iso.json').then(r => r.json()),
    fetch('/data/centroids.json').then(r => r.json()),
]);

const countryAt = createLookup(feature(topo, topo.objects.countries).features, isoMap);

// ─── state ───────────────────────────────────────────────────────────────────

let photos   = await store.all();          // {id, iso, lat, lng, taken, name, full: Blob, thumb: Blob}
let selected = null;                       // id awaiting a country click
const urls   = new Map();                  // id -> object URL, revoked on removal

const world = await createGlobe(document.getElementById('globe'), {
    countries: [],
    anyCountry: true,                      // every country is clickable here
    onCountryClick: onCountryPicked,
});

if (import.meta.env.DEV) window.__world = world;   // handle for debugging

render();

// ─── taking photos in ────────────────────────────────────────────────────────

el.picker.addEventListener('change', e => intake([...e.target.files]));

for (const type of ['dragenter', 'dragover']) {
    el.drop.addEventListener(type, e => { e.preventDefault(); el.drop.classList.add('over'); });
}
for (const type of ['dragleave', 'drop']) {
    el.drop.addEventListener(type, () => el.drop.classList.remove('over'));
}
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', async e => {
    e.preventDefault();
    el.drop.classList.remove('over');
    intake(await filesFrom(e.dataTransfer));
});

/** A dropped folder arrives as directory entries — walk them for images. */
async function filesFrom(dt) {
    const entries = [...(dt.items ?? [])]
        .map(i => i.webkitGetAsEntry?.())
        .filter(Boolean);
    if (!entries.length) return [...dt.files];

    const out = [];
    const walk = entry => new Promise(resolve => {
        if (entry.isFile) return entry.file(f => { out.push(f); resolve(); });
        const reader = entry.createReader();
        const readMore = () => reader.readEntries(async batch => {
            if (!batch.length) return resolve();
            await Promise.all(batch.map(walk));
            readMore();
        });
        readMore();
    });
    await Promise.all(entries.map(walk));
    return out;
}

async function intake(files) {
    const images = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|tiff?)$/i.test(f.name));
    const sidecars = new Map(                       // Google Takeout metadata
        files.filter(f => f.name.endsWith('.json')).map(f => [f.name, f]));

    if (!images.length) {
        say('No images in that — photos or a Takeout folder, please.');
        return;
    }

    let added = 0, failed = 0;
    for (const [i, file] of images.entries()) {
        say(`Reading ${i + 1} of ${images.length}…`);
        try {
            const record = await ingest(file, sidecars);
            if (photos.some(p => p.id === record.id)) continue;   // already here
            await store.put(record);
            photos.push(record);
            added++;
        } catch {
            failed++;
        }
    }

    const space = await store.quota();
    say([
        added  ? `${added} photo${added === 1 ? '' : 's'} added.` : 'Nothing new.',
        failed ? `${failed} couldn't be read (HEIC often needs a JPEG export).` : '',
        space && space.pct > 0.8 ? 'Your browser storage is nearly full.' : '',
    ].filter(Boolean).join(' '));

    render();
}

async function ingest(file, sidecars) {
    const id  = await fingerprint(file);
    const gps = await gpsFor(file, sidecars);
    const at  = gps ? countryAt(gps.lat, gps.lng) : null;

    const bitmap = await createImageBitmap(file);
    const full   = await downscale(bitmap, FULL_W);
    const thumb  = await downscale(bitmap, THUMB_W);
    bitmap.close?.();

    return {
        id,
        name:  file.name,
        iso:   at?.iso ?? null,
        place: at?.name ?? null,
        ...(gps ? { lat: gps.lat, lng: gps.lng } : {}),
        taken: await dateFor(file, sidecars),
        full,
        thumb,
    };
}

/** Same bytes = same photo, so re-dropping a folder never duplicates. */
async function fingerprint(file) {
    const head   = await file.slice(0, 64 * 1024).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-1', head);
    const hex    = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `own-${hex.slice(0, 12)}-${file.size}`;
}

async function gpsFor(file, sidecars) {
    try {
        const gps = await exifr.gps(file);
        if (gps?.latitude != null) return { lat: gps.latitude, lng: gps.longitude };
    } catch { /* unreadable EXIF is not fatal */ }

    const side = await sidecarFor(file, sidecars);
    const geo  = side?.geoData ?? side?.geoDataExif;
    // Takeout writes 0,0 when it knows nothing; the Atlantic is not a holiday
    if (geo && (geo.latitude || geo.longitude)) return { lat: geo.latitude, lng: geo.longitude };
    return null;
}

async function dateFor(file, sidecars) {
    try {
        const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
        const d = meta?.DateTimeOriginal ?? meta?.CreateDate;
        if (d) return new Date(d).toISOString().slice(0, 10);
    } catch { /* fall through */ }
    const side = await sidecarFor(file, sidecars);
    const ts = side?.photoTakenTime?.timestamp;
    return ts ? new Date(Number(ts) * 1000).toISOString().slice(0, 10) : null;
}

/** Takeout's sidecar naming has changed repeatedly — try the known shapes. */
async function sidecarFor(file, sidecars) {
    if (!sidecars?.size) return null;
    const stem = file.name.replace(/\.[^.]+$/, '');
    const names = [
        `${file.name}.json`,
        `${stem}.json`,
        `${file.name}.supplemental-metadata.json`,
        `${stem}.supplemental-metadata.json`,
    ];
    let hit = names.map(n => sidecars.get(n)).find(Boolean);
    if (!hit) {
        for (const [name, f] of sidecars) {
            if (name.startsWith(stem) && name.includes('supplemental')) { hit = f; break; }
        }
    }
    if (!hit) return null;
    try { return JSON.parse(await hit.text()); } catch { return null; }
}

/** Canvas downscale to WebP — a 4MB original becomes a few hundred KB. */
function downscale(bitmap, width) {
    const scale  = Math.min(1, width / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
}

// ─── placing what has no GPS ─────────────────────────────────────────────────

function onCountryPicked(country) {
    if (!selected) return;
    const photo = photos.find(p => p.id === selected);
    if (!photo) return;

    photo.iso   = country.iso;
    photo.place = country.name;
    store.put(photo);
    selected = null;
    say(`Placed in ${country.name}.`);
    render();
}

// ─── rendering ───────────────────────────────────────────────────────────────

function urlFor(photo) {
    if (!urls.has(photo.id)) urls.set(photo.id, URL.createObjectURL(photo.thumb));
    return urls.get(photo.id);
}

function render() {
    const placed   = photos.filter(p => p.iso);
    const unplaced = photos.filter(p => !p.iso);

    el.unplaced.hidden = !unplaced.length;
    el.placed.hidden   = !placed.length;
    el.exportBtn.hidden = !placed.length;
    el.clearBtn.hidden  = !photos.length;
    el.unplacedCount.textContent = unplaced.length ? `· ${unplaced.length}` : '';
    el.placedCount.textContent   = placed.length ? `· ${placed.length}` : '';

    el.unplacedList.replaceChildren(...unplaced.map(p => card(p, true)));
    el.placedList.replaceChildren(...placed.map(p => card(p, false)));

    // group into the shape the globe wants
    const byIso = new Map();
    for (const p of placed) {
        if (!byIso.has(p.iso)) byIso.set(p.iso, []);
        byIso.get(p.iso).push(p);
    }
    world.setCountries([...byIso].map(([iso, list]) => {
        const home = centroids[iso] ?? {};
        return {
            iso,
            name: list[0].place ?? home.name ?? iso,
            lat:  list[0].lat ?? home.lat ?? 0,
            lng:  list[0].lng ?? home.lng ?? 0,
            photos: list.map(p => ({ id: p.id, url: urlFor(p), source: 'own' })),
        };
    }));
}

function card(photo, needsHome) {
    const div = document.createElement('div');
    div.className = 'card' + (selected === photo.id ? ' picked' : '');

    const img = document.createElement('img');
    img.src = urlFor(photo);
    img.alt = '';
    img.loading = 'lazy';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<strong>${photo.place ?? 'Not placed'}</strong>
        <em>${[photo.name, photo.taken].filter(Boolean).join(' · ')}</em>`;

    const del = document.createElement('button');
    del.className = 'x';
    del.textContent = '✕';
    del.title = 'Remove';
    del.addEventListener('click', async e => {
        e.stopPropagation();
        await store.remove(photo.id);
        URL.revokeObjectURL(urls.get(photo.id));
        urls.delete(photo.id);
        photos = photos.filter(p => p.id !== photo.id);
        render();
    });

    if (needsHome) {
        div.addEventListener('click', () => {
            selected = selected === photo.id ? null : photo.id;
            say(selected ? 'Now click a country on the globe.' : '');
            render();
        });
    } else {
        div.addEventListener('click', () => {
            const home = centroids[photo.iso];
            if (home) world.flyTo(photo.lat ?? home.lat, photo.lng ?? home.lng, 1.5, 900);
        });
    }

    div.append(img, meta, del);
    return div;
}

const say = msg => { el.status.textContent = msg; };

// ─── export ──────────────────────────────────────────────────────────────────

el.exportBtn.addEventListener('click', async () => {
    const placed = photos.filter(p => p.iso);
    const manifest = {
        photographer: 'Your name here',
        photos: placed.map(p => ({
            id: p.id,
            source: 'own',
            file: p.name,
            url: `/photos/${p.id}.webp`,
            thumb: `/photos/${p.id}-thumb.webp`,
            iso: p.iso,
            ...(p.lat != null ? { lat: p.lat, lng: p.lng } : {}),
            ...(p.taken ? { taken: p.taken } : {}),
            title: '',
            credit: { name: 'Your name here', link: '' },
            licence: 'Own work',
        })),
    };
    download('own.json', new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' }));
    say('own.json saved — drop it into src/data/ in your fork, alongside the photos.');
});

// Two-step rather than confirm(): a native modal blocks the page, and this is
// destructive enough to deserve a deliberate second click either way.
let armed = false;
el.clearBtn.addEventListener('click', async () => {
    if (!armed) {
        armed = true;
        el.clearBtn.textContent = `Really remove all ${photos.length}? Click again`;
        el.clearBtn.classList.add('armed');
        setTimeout(() => {
            armed = false;
            el.clearBtn.textContent = 'Remove everything';
            el.clearBtn.classList.remove('armed');
        }, 4000);
        return;
    }
    armed = false;
    el.clearBtn.textContent = 'Remove everything';
    el.clearBtn.classList.remove('armed');

    await store.clear();
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
    photos = [];
    selected = null;
    say('Cleared.');
    render();
});

function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
