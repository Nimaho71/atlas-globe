// The cursor-following gradient blob from the nature gallery.
export function startBlob(el) {
    if (!el) return;
    const pos    = { x: innerWidth / 2, y: innerHeight / 2 };
    const target = { ...pos };
    const start  = performance.now();

    addEventListener('pointermove', e => {
        target.x = e.clientX;
        target.y = e.clientY;
    });

    (function tick(now) {
        const angle = ((now - start) / 20000) * 360;
        pos.x += (target.x - pos.x) * 0.06;
        pos.y += (target.y - pos.y) * 0.06;
        el.style.transform = `translate(${pos.x - 250}px, ${pos.y - 250}px) rotate(${angle}deg)`;
        requestAnimationFrame(tick);
    })(start);
}
