// Minimal Unsplash client for build-time use only.
//
// This never runs in the browser. The key lives in .env (git-ignored) and is read
// via node --env-file, so it is never bundled, committed, or sent to a visitor.
//
// Responses are cached under .cache/ so re-running the fetch costs zero requests —
// which matters because the dev-mode key allows 50 requests/hour.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const API      = 'https://api.unsplash.com';
const CACHE    = '.cache/unsplash';
const THROTTLE = 1100;   // ms between live requests — stay well under the limit

// Unsplash requires attribution links to carry these.
export const UTM = 'utm_source=atlas_globe&utm_medium=referral';

let lastCall = 0;

function key() {
    const k = process.env.UNSPLASH_ACCESS_KEY;
    if (!k) {
        throw new Error(
            'UNSPLASH_ACCESS_KEY is not set.\n' +
            'Put it in .env as UNSPLASH_ACCESS_KEY=... (the Access Key, not the Secret key).'
        );
    }
    return k;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function throttle() {
    const wait = THROTTLE - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
}

/** GET a path with caching. Returns parsed JSON. */
export async function get(path, params = {}) {
    const qs   = new URLSearchParams(params).toString();
    const url  = `${API}${path}?${qs}`;
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);
    const file = join(CACHE, `${hash}.json`);

    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));

    await throttle();
    const res = await fetch(url, {
        headers: {
            Authorization: `Client-ID ${key()}`,
            'Accept-Version': 'v1',
        },
    });

    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining !== null && Number(remaining) < 5) {
        console.warn(`  ! only ${remaining} requests left this hour`);
    }

    if (res.status === 403) {
        throw new Error(
            'Unsplash returned 403 — the hourly rate limit is spent (50/hr on a demo key).\n' +
            'Cached results are kept, so re-running later picks up where this left off.'
        );
    }
    if (!res.ok) throw new Error(`Unsplash ${res.status} for ${path}: ${await res.text()}`);

    const json = await res.json();
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(json));
    return json;
}

/** Search photos for a country. Returns our own trimmed shape. */
export async function search(query, perPage = 18) {
    const json = await get('/search/photos', {
        query,
        per_page: String(perPage),
        orientation: 'landscape',
        content_filter: 'high',
    });
    return (json.results ?? []).map(toPhoto);
}

function toPhoto(r) {
    return {
        id:      `unsplash-${r.id}`,
        url:     r.urls.raw,
        w:       r.width,
        h:       r.height,
        color:   r.color,
        title:   clean(r.description || r.alt_description),
        source:  'unsplash',
        licence: 'Unsplash',
        credit: {
            name: r.user?.name ?? 'Unknown',
            link: `${r.user?.links?.html ?? 'https://unsplash.com'}?${UTM}`,
        },
        // kept only for the curate view, stripped from the shipped file
        _thumb: r.urls.small,
        _page:  `${r.links?.html ?? ''}?${UTM}`,
    };
}

function clean(s) {
    if (!s) return '';
    const t = s.trim().replace(/\s+/g, ' ');
    return t.length > 60 ? t.slice(0, 57).trimEnd() + '…' : t;
}
