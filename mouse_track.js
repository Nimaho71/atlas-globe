const helperText = document.querySelector('.helper_text');
const track      = document.getElementById("image-track");
const blob       = document.getElementById("blob");
const images     = Array.from(track.getElementsByClassName('image'));

// ─── BLOB ────────────────────────────────────────────────────────────────────
const blobPos    = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const blobTarget = { x: blobPos.x, y: blobPos.y };
const blobStart  = Date.now();

// ─── TRACK ───────────────────────────────────────────────────────────────────
// rAF lerp replaces WAAPI → smooth wheel scroll, single source of truth
let trackTarget = 0;
let trackCurr   = 0;
let trackActive = false;

// Hand off from CSS intro animation to JS after 5 s
setTimeout(() => {
    track.style.animation = 'none';
    trackActive = true;
}, 5000);

// ─── SINGLE TICK LOOP ────────────────────────────────────────────────────────
(function tick() {
    // blob
    const angle = ((Date.now() - blobStart) / 20000) * 360;
    blobPos.x  += (blobTarget.x - blobPos.x) * 0.06;
    blobPos.y  += (blobTarget.y - blobPos.y) * 0.06;
    blob.style.transform = `translate(${blobPos.x - 250}px, ${blobPos.y - 250}px) rotate(${angle}deg)`;

    // track
    if (trackActive) {
        trackCurr += (trackTarget - trackCurr) * 0.055;
        const p = Math.round(trackCurr * 100) / 100;
        track.style.transform = `translate(${p}%, -50%)`;
        for (const img of images) img.style.objectPosition = `${100 + p}% 50%`;
    }

    requestAnimationFrame(tick);
})();

// ─── POINTER DRAG ────────────────────────────────────────────────────────────
let isDown     = false;
let isDragging = false;
let dragStartX = 0;
let dragStartP = 0;

window.onpointerdown = e => {
    if (isOverlayOpen) return;          // let overlay handle its own events
    e.preventDefault();
    isDown     = true;
    isDragging = false;
    dragStartX = e.clientX;
    dragStartP = trackTarget;
    helperText.classList.add('hider');
};

window.onpointerup = e => {
    if (!isDown) return;
    const wasClick = !isDragging;
    isDown = false;
    if (wasClick) {
        const idx = images.indexOf(e.target);
        if (idx !== -1) openCard(idx, e.target);
    }
};

window.onpointercancel = () => { isDown = false; };

window.onpointermove = e => {
    blobTarget.x = e.clientX;
    blobTarget.y = e.clientY;
    if (!isDown) return;
    e.preventDefault();
    const delta = e.clientX - dragStartX;
    if (Math.abs(delta) > 5) isDragging = true;
    if (!isDragging) return;
    trackTarget = Math.max(Math.min(dragStartP + (delta / (window.innerWidth / 2)) * 100, 0), -100);
};

// ─── WHEEL SCROLL ────────────────────────────────────────────────────────────
window.addEventListener('wheel', e => {
    e.preventDefault();
    if (isOverlayOpen) return;
    trackTarget = Math.max(Math.min(trackTarget - e.deltaY * 0.055, 0), -100);
}, { passive: false });

// ─── CINEMA OVERLAY ──────────────────────────────────────────────────────────
let isOverlayOpen = false;
let cardIdx       = 0;

const overlay = document.createElement('div');
overlay.id = 'card-overlay';
overlay.innerHTML = `
    <div id="card-frame">
        <div id="card-shot"><img id="card-img" draggable="false" /></div>
        <div id="card-vignette"></div>
        <div id="card-grain"></div>
        <div id="card-flash"></div>
    </div>
    <div class="bar top"></div>
    <div class="bar bottom"></div>
    <div id="card-info">
        <span id="card-location"></span>
        <span id="card-counter"></span>
    </div>
    <button class="card-nav" id="card-prev">&#8249;</button>
    <button class="card-nav" id="card-next">&#8250;</button>
    <button id="card-close">&#x2715;</button>
`;
document.body.appendChild(overlay);

const frame   = overlay.querySelector('#card-frame');
const shot    = overlay.querySelector('#card-shot');
const cardImg = overlay.querySelector('#card-img');
const flash   = overlay.querySelector('#card-flash');

const OPEN_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

// clip-path matching a thumbnail's position on screen
function insetFor(rect) {
    return `inset(${rect.top}px ${window.innerWidth - rect.right}px ` +
           `${window.innerHeight - rect.bottom}px ${rect.left}px round 4px)`;
}

function openCard(idx, sourceEl) {
    cardIdx = idx;
    isOverlayOpen = true;
    overlay.classList.add('open');
    document.addEventListener('keydown', onCardKey);

    renderCard(true);

    // FLIP: the frame unfolds from exactly where the thumbnail sits
    const rect = (sourceEl || images[idx]).getBoundingClientRect();
    frame.animate(
        [{ clipPath: insetFor(rect) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
        { duration: 950, easing: OPEN_EASE, fill: 'both' }
    );
    armIdle();
}

function closeCard() {
    if (!isOverlayOpen) return;
    isOverlayOpen = false;
    document.removeEventListener('keydown', onCardKey);
    clearTimeout(idleTimer);
    overlay.classList.remove('idle', 'titles-in');

    // fold back into the thumbnail it came from
    const rect = images[cardIdx].getBoundingClientRect();
    const back = frame.animate(
        [{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: insetFor(rect) }],
        { duration: 620, easing: 'cubic-bezier(0.7, 0, 0.84, 0)', fill: 'both' }
    );
    overlay.style.transitionDelay = '0.25s';
    overlay.classList.remove('open');
    back.onfinish = () => {
        overlay.style.transitionDelay = '';
        shot.className = '';
    };
}

function goCard(dir) {
    cardIdx = (cardIdx + dir + images.length) % images.length;
    renderCard(false);
    armIdle();
}

function renderCard(instant) {
    const img   = images[cardIdx];
    const hqSrc = img.src.replace(/w=\d+/, 'w=1200').replace(/q=\d+/, 'q=85');

    const start = () => {
        cardImg.src = hqSrc;
        // restart the ken burns drift with a different move each shot
        shot.className = '';
        void shot.offsetWidth;
        shot.classList.add('kb-' + (cardIdx % 4));

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

    document.getElementById('card-location').textContent = img.dataset.location || '';
    document.getElementById('card-counter').textContent  =
        `SHOT ${String(cardIdx + 1).padStart(2, '0')} / ${String(images.length).padStart(2, '0')}`;
}

// let the controls melt away so you just watch the shot
let idleTimer = null;
function armIdle() {
    clearTimeout(idleTimer);
    overlay.classList.remove('idle');
    idleTimer = setTimeout(() => {
        if (isOverlayOpen) overlay.classList.add('idle');
    }, 2600);
}
overlay.addEventListener('pointermove', armIdle);

overlay.addEventListener('click', e => {
    const onBackdrop = e.target === overlay || e.target === frame || e.target === cardImg ||
                       e.target.id === 'card-vignette' || e.target.id === 'card-grain' ||
                       e.target.classList.contains('bar');
    if (!onBackdrop) return;
    if (swipedAway) { swipedAway = false; return; }
    // first tap after the controls faded just brings them back
    if (overlay.classList.contains('idle')) { armIdle(); return; }
    closeCard();
});

// swipe between shots on touch
let swipeX     = null;
let swipedAway = false;
overlay.addEventListener('pointerdown', e => { swipeX = e.clientX; armIdle(); });
overlay.addEventListener('pointerup', e => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 60) { swipedAway = true; goCard(dx < 0 ? 1 : -1); }
});
document.getElementById('card-close').addEventListener('click', closeCard);
document.getElementById('card-prev').addEventListener('click', () => goCard(-1));
document.getElementById('card-next').addEventListener('click', () => goCard(1));

function onCardKey(e) {
    if (e.key === 'Escape')     closeCard();
    if (e.key === 'ArrowLeft')  goCard(-1);
    if (e.key === 'ArrowRight') goCard(1);
}

// ─── HACKER TEXT SCRAMBLE ────────────────────────────────────────────────────
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
let scrambleInterval = null;

function triggerScramble() {
    let iterations = 0;
    clearInterval(scrambleInterval);
    scrambleInterval = setInterval(() => {
        document.querySelector("h1").innerText = document
            .querySelector("h1").innerText.split("")
            .map((letter, index) => {
                if (index < iterations) return document.querySelector("h1").dataset.value[index];
                return letters[Math.floor(Math.random() * 26)];
            }).join("");
        if (iterations >= document.querySelector("h1").dataset.value.length) clearInterval(scrambleInterval);
        iterations += 1 / 5;
    }, 30);
}

(function scrambleLoop() {
    triggerScramble();
    setTimeout(scrambleLoop, 3500);
})();
