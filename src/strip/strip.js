// Horizontal drag-scroll photo strip — the track from the nature gallery,
// rebuilt as a mountable component fed by a country's photo list.

import './strip.css';
import { sized } from '../cinema/cinema.js';

export function createStrip({ onPhotoClick } = {}) {
    const root = document.createElement('div');
    root.id = 'strip-root';
    root.innerHTML = `
        <div id="strip-head">
            <h2 id="strip-country"></h2>
            <span id="strip-count"></span>
            <button id="strip-close" aria-label="Back to globe">&#x2715;</button>
        </div>
        <div id="strip-track"></div>
    `;
    document.body.appendChild(root);

    const track   = root.querySelector('#strip-track');
    const elName  = root.querySelector('#strip-country');
    const elCount = root.querySelector('#strip-count');

    let photos  = [];
    let target  = 0;
    let curr    = 0;
    let maxPan  = 0;
    let visible = false;
    let raf     = null;

    function show(country) {
        photos = country.photos;
        elName.textContent  = country.name;
        elCount.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;

        track.innerHTML = '';
        for (const [i, p] of photos.entries()) {
            const img = document.createElement('img');
            img.className = 'strip-img';
            img.src       = sized(p, 600);
            img.alt       = p.title || country.name;
            img.draggable = false;
            img.loading   = i < 4 ? 'eager' : 'lazy';
            img.style.background = p.color || '#111';
            track.appendChild(img);
        }

        target = curr = 0;
        root.classList.add('open');
        visible = true;
        requestAnimationFrame(measure);
        loop();
    }

    function hide() {
        root.classList.remove('open');
        visible = false;
        cancelAnimationFrame(raf);
        raf = null;
    }

    function measure() {
        maxPan = Math.max(0, track.scrollWidth - innerWidth + 80);
    }

    function loop() {
        curr += (target - curr) * 0.09;
        track.style.transform = `translateX(${-curr.toFixed(2)}px)`;
        raf = requestAnimationFrame(loop);
    }

    // ─── drag + wheel ────────────────────────────────────────────────────────
    let down = false, dragging = false, startX = 0, startT = 0, downEl = null;

    track.addEventListener('pointerdown', e => {
        down = true; dragging = false;
        startX = e.clientX; startT = target;
        // remember what was under the cursor: pointer capture retargets pointerup
        // to the track itself, so e.target there is useless for picking a photo
        downEl = e.target;
        track.setPointerCapture(e.pointerId);
    });

    track.addEventListener('pointermove', e => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 5) dragging = true;
        if (!dragging) return;
        target = clamp(startT - dx, 0, maxPan);
    });

    track.addEventListener('pointerup', e => {
        if (!down) return;
        down = false;
        if (dragging) return;
        const i = [...track.children].indexOf(downEl);
        if (i !== -1) onPhotoClick?.(photos, i, downEl);
    });

    track.addEventListener('pointercancel', () => { down = false; });

    root.addEventListener('wheel', e => {
        if (!visible) return;
        e.preventDefault();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        target = clamp(target + d, 0, maxPan);
    }, { passive: false });

    addEventListener('resize', measure);

    return { show, hide, root, get visible() { return visible; } };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
