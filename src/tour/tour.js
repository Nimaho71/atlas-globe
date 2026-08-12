// The world tour: fly to a country, name it, play a few shots, fly to the next.
//
//   fly (1.6s) → title card (1.1s) → N shots (4s each, hard cuts) → fly on
//
// Escape or a click stops it wherever it is.

import './tour.css';

const FLY_MS   = 1600;
const TITLE_MS = 1100;
const SHOT_MS  = 4000;
const SHOTS    = 3;

export function createTour({ world, cinema, countries, onStart, onStop }) {
    const el = document.createElement('div');
    el.id = 'tour';
    el.innerHTML = `
        <div id="tour-card">
            <span id="tour-place"></span>
            <span id="tour-index"></span>
        </div>
        <button id="tour-exit" class="pill">Esc to exit</button>
    `;
    document.body.appendChild(el);

    const elPlace = el.querySelector('#tour-place');
    const elIndex = el.querySelector('#tour-index');

    let running = false;
    let token   = 0;        // bumped on stop so a stale loop exits quietly

    async function start() {
        if (running) return;
        running = true;
        const mine = ++token;

        document.body.classList.add('touring');
        world.autoRotate(false);
        onStart?.();
        addEventListener('keydown', onKey);
        el.addEventListener('click', stop);

        const order = route(countries);

        for (const [i, country] of order.entries()) {
            if (token !== mine) return;

            // 1 — fly there, with the globe in view
            world.flyTo(country.lat, country.lng, 1.7, FLY_MS);
            await wait(FLY_MS * 0.75);
            if (token !== mine) return;

            // 2 — name it
            showCard(country.name, i + 1, order.length);
            await wait(TITLE_MS);
            hideCard();
            if (token !== mine) return;

            // 3 — the shots
            const shots = country.photos.slice(0, SHOTS);
            preload(order[i + 1]);
            await cinema.playAll(shots, { shotMs: SHOT_MS });
            if (token !== mine) return;

            cinema.close();
            await wait(400);            // let the viewer dissolve before the next flight
        }

        stop();
    }

    function stop() {
        if (!running) return;
        running = false;
        token++;
        removeEventListener('keydown', onKey);
        el.removeEventListener('click', stop);
        hideCard();
        document.body.classList.remove('touring');
        cinema.close();
        world.home(1400);
        world.autoRotate(true);
        onStop?.();
    }

    function onKey(e) {
        if (e.key === 'Escape') stop();
    }

    function showCard(name, n, total) {
        elPlace.textContent = name;
        elIndex.textContent = `${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
        el.classList.add('card-in');
    }

    const hideCard = () => el.classList.remove('card-in');

    return { start, stop, get running() { return running; } };
}

// ─── route ───────────────────────────────────────────────────────────────────

/**
 * Shuffle, then avoid back-to-back neighbours: the flight between countries is
 * the spectacle, and Norway → Sweden is a boring flight.
 */
function route(countries) {
    const pool = [...countries].sort(() => Math.random() - 0.5);
    const out  = [pool.shift()];

    while (pool.length) {
        const from = out[out.length - 1];
        // of the candidates, keep the farther half, then pick one at random
        const ranked = pool
            .map((c, i) => ({ i, d: distance(from, c) }))
            .sort((a, b) => b.d - a.d);
        const far  = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
        const pick = far[Math.floor(Math.random() * far.length)];
        out.push(pool.splice(pick.i, 1)[0]);
    }
    return out;
}

/** Great-circle distance in km. */
function distance(a, b) {
    const R = 6371, rad = d => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const wait = ms => new Promise(r => setTimeout(r, ms));

// exactly one country ahead, never the whole route
const seen = new Set();
function preload(country) {
    if (!country) return;
    for (const p of country.photos.slice(0, SHOTS)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        const img = new Image();
        img.src = `${p.url}&w=2000&q=85&auto=format`;
    }
}
