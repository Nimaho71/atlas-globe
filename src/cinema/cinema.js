// Cinematic photo viewer — full-bleed shot, Ken Burns drift, letterbox, grain, titles.
// Ported from the nature gallery and generalised: it now takes any photo list.
//
// photo shape: { url, title, credit: { name, link }, source }

import './cinema.css';

const OPEN_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

export function createCinema({ onOpen, onClose } = {}) {
    const overlay = document.createElement('div');
    overlay.id = 'card-overlay';
    overlay.innerHTML = `
        <div id="card-frame">
            <div id="card-shot"><img id="card-img" draggable="false" alt="" /></div>
            <div id="card-vignette"></div>
            <div id="card-grain"></div>
            <div id="card-flash"></div>
        </div>
        <div class="bar top"></div>
        <div class="bar bottom"></div>
        <div id="card-info">
            <span id="card-location"></span>
            <span id="card-counter"></span>
            <span id="card-credit"></span>
        </div>
        <button class="card-nav" id="card-prev" aria-label="Previous photo">&#8249;</button>
        <button class="card-nav" id="card-next" aria-label="Next photo">&#8250;</button>
        <button id="card-close" aria-label="Close">&#x2715;</button>
    `;
    document.body.appendChild(overlay);

    const frame    = overlay.querySelector('#card-frame');
    const shot     = overlay.querySelector('#card-shot');
    const cardImg  = overlay.querySelector('#card-img');
    const flash    = overlay.querySelector('#card-flash');
    const elTitle  = overlay.querySelector('#card-location');
    const elCount  = overlay.querySelector('#card-counter');
    const elCredit = overlay.querySelector('#card-credit');

    let photos    = [];
    let idx       = 0;
    let isOpen    = false;
    let originEl  = null;   // element we unfolded from, to fold back into
    let idleTimer = null;
    let autoTimer = null;   // set while the tour is driving playback
    let autoEnd   = null;   // resolve fn for playAll()

    // clip-path matching an element's position on screen
    const insetFor = r =>
        `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 4px)`;

    /**
     * Play a list of photos hands-free, one shot every `shotMs`.
     * Resolves when the last shot has had its time — or immediately if the
     * viewer is closed part-way through (the tour treats that as "stop").
     */
    function playAll(list, { shotMs = 4000 } = {}) {
        return new Promise(resolve => {
            if (!list?.length) return resolve();
            autoEnd = resolve;
            open(list, 0, null, { auto: true });
            queueShot(shotMs);
        });
    }

    function queueShot(shotMs) {
        clearTimeout(autoTimer);
        autoTimer = setTimeout(() => {
            if (!isOpen) return;
            if (idx >= photos.length - 1) return finishAuto();
            go(1);
            queueShot(shotMs);
        }, shotMs);
    }

    function finishAuto() {
        clearTimeout(autoTimer);
        autoTimer = null;
        const done = autoEnd;
        autoEnd = null;
        done?.();
    }

    function open(list, startIdx = 0, sourceEl = null, { auto = false } = {}) {
        if (!list?.length) return;

        // A finished close() keeps its collapsed clip-path (fill: 'both'), so drop
        // any leftover animation before showing the frame again — otherwise the
        // tour, which skips the unfold, inherits the last thumbnail's rectangle.
        frame.getAnimations().forEach(a => a.cancel());

        overlay.classList.toggle('auto', auto);
        photos   = list;
        idx      = startIdx;
        originEl = sourceEl;
        isOpen   = true;
        overlay.classList.add('open');
        document.addEventListener('keydown', onKey);
        render(true);

        // The tour dissolves between globe and photos; only a click on a
        // thumbnail unfolds from the thumbnail itself.
        if (!auto) {
            const rect = sourceEl?.getBoundingClientRect();
            frame.animate(
                [{ clipPath: rect ? insetFor(rect) : 'inset(50% 50% 50% 50% round 4px)' },
                 { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
                { duration: 950, easing: OPEN_EASE, fill: 'both' }
            );
        }
        armIdle();
        onOpen?.();
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        document.removeEventListener('keydown', onKey);
        clearTimeout(idleTimer);
        finishAuto();
        overlay.classList.remove('idle', 'titles-in');

        if (overlay.classList.contains('auto')) {
            overlay.classList.remove('open');
            shot.className = '';
            onClose?.();
            return;
        }

        const rect = originEl?.getBoundingClientRect();
        const back = frame.animate(
            [{ clipPath: 'inset(0px 0px 0px 0px round 0px)' },
             { clipPath: rect ? insetFor(rect) : 'inset(50% 50% 50% 50% round 4px)' }],
            { duration: 620, easing: 'cubic-bezier(0.7, 0, 0.84, 0)', fill: 'both' }
        );
        overlay.style.transitionDelay = '0.25s';
        overlay.classList.remove('open');
        back.onfinish = () => {
            overlay.style.transitionDelay = '';
            shot.className = '';
            cardImg.src = '';
        };
        onClose?.();
    }

    function go(dir) {
        idx = (idx + dir + photos.length) % photos.length;
        render(false);
        armIdle();
    }

    function render(instant) {
        const p = photos[idx];

        const start = () => {
            cardImg.src = sized(p, 2000);
            cardImg.alt = p.title || '';
            // restart the ken burns drift, different move per shot
            shot.className = '';
            void shot.offsetWidth;
            shot.classList.add('kb-' + (idx % 4));

            flash.classList.remove('fire');
            void flash.offsetWidth;
            flash.classList.add('fire');

            overlay.classList.remove('titles-in');
            void overlay.offsetWidth;
            overlay.classList.add('titles-in');
        };

        if (instant) {
            cardImg.style.opacity = '1';
            start();
        } else {
            // film cut: dip through black, then the next shot rolls
            cardImg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'both' });
            overlay.classList.remove('titles-in');
            setTimeout(() => {
                start();
                cardImg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: 'ease-out', fill: 'both' });
            }, 280);
        }

        // The place is the title card — stock photo descriptions ramble, and a
        // film slate wants the location, not a caption.
        elTitle.textContent = p.place || p.title || '';
        elCount.textContent = `SHOT ${String(idx + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}`;
        elCredit.innerHTML  = creditHTML(p);
        preload(photos[(idx + 1) % photos.length]);
    }

    // let the controls melt away so you just watch the shot
    function armIdle() {
        clearTimeout(idleTimer);
        overlay.classList.remove('idle');
        idleTimer = setTimeout(() => { if (isOpen) overlay.classList.add('idle'); }, 2600);
    }

    function onKey(e) {
        if (e.key === 'Escape')     close();
        if (e.key === 'ArrowLeft')  go(-1);
        if (e.key === 'ArrowRight') go(1);
    }

    overlay.addEventListener('pointermove', armIdle);

    let swipeX = null, swipedAway = false;
    overlay.addEventListener('pointerdown', e => { swipeX = e.clientX; armIdle(); });
    overlay.addEventListener('pointerup', e => {
        if (swipeX === null) return;
        const dx = e.clientX - swipeX;
        swipeX = null;
        if (Math.abs(dx) > 60) { swipedAway = true; go(dx < 0 ? 1 : -1); }
    });

    overlay.addEventListener('click', e => {
        if (e.target.closest('#card-credit')) return;   // let credit links through
        const onBackdrop = e.target === overlay || e.target === frame || e.target === cardImg ||
                           e.target.id === 'card-vignette' || e.target.id === 'card-grain' ||
                           e.target.classList.contains('bar');
        if (!onBackdrop) return;
        if (swipedAway) { swipedAway = false; return; }
        if (overlay.classList.contains('idle')) { armIdle(); return; }
        close();
    });

    overlay.querySelector('#card-close').addEventListener('click', close);
    overlay.querySelector('#card-prev').addEventListener('click', () => go(-1));
    overlay.querySelector('#card-next').addEventListener('click', () => go(1));

    return { open, close, go, playAll, get isOpen() { return isOpen; } };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// Ask the CDN for the size we actually display. Both Unsplash and Pexels
// accept a `w` query param on their image URLs.
export function sized(photo, w) {
    const url = photo.url;
    if (!/^https?:/.test(url)) return url;
    const u = new URL(url);
    u.searchParams.set('w', String(w));
    if (u.hostname.includes('unsplash')) {
        u.searchParams.set('q', '85');
        u.searchParams.set('auto', 'format');
    }
    return u.toString();
}

// Unsplash's API terms require the photographer's full name AND Unsplash itself
// to be attributed and linked, with referral parameters on both.
const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=atlas_globe&utm_medium=referral';

function creditHTML(p) {
    if (p.source === 'own') return 'Shot by Nils';
    const c = p.credit;
    if (!c?.name) return '';
    const who = c.link
        ? `<a href="${c.link}" target="_blank" rel="noopener">${escapeHTML(c.name)}</a>`
        : escapeHTML(c.name);
    const where = p.source === 'unsplash'
        ? ` on <a href="${UNSPLASH_HOME}" target="_blank" rel="noopener">Unsplash</a>`
        : p.licence ? ` / ${escapeHTML(p.licence)}` : '';
    return `Photo by ${who}${where}`;
}

const preloaded = new Set();
function preload(p) {
    if (!p || preloaded.has(p.id)) return;
    preloaded.add(p.id);
    const img = new Image();
    img.src = sized(p, 2000);
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
