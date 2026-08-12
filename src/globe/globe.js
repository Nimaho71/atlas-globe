// The globe: country polygons for places we have photos for, markers, camera flights.
// globe.gl wraps three-globe/Three.js — this module owns everything WebGL.
//
// The look is deliberately texture-free: a dark vector world where the only bright
// things are the countries that have photos. Nothing to download, and the photos
// stay the brightest thing on screen.

import Globe from 'globe.gl';
import { feature } from 'topojson-client';
import { MeshPhongMaterial, Color } from 'three';

const PALETTE = {
    marker:      '#8bd75f',
    atmosphere:  '#3ea5b2',
    visited:       'rgba(139, 215, 95, 0.30)',
    visitedEdge:   'rgba(139, 215, 95, 0.75)',
    hover:         'rgba(139, 215, 95, 0.62)',
    spotlight:     'rgba(180, 255, 130, 0.85)',
    spotlightEdge: 'rgba(220, 255, 190, 1)',
    land:        'rgba(255, 255, 255, 0.07)',
    landEdge:    'rgba(255, 255, 255, 0.15)',
    ocean:       '#05080d',
};

export async function createGlobe(el, { countries, onCountryClick, onCountryHover } = {}) {
    const [topo, iso] = await Promise.all([
        fetch('/data/countries-110m.json').then(r => r.json()),
        fetch('/data/iso.json').then(r => r.json()),
    ]);

    const all = feature(topo, topo.objects.countries).features;
    const byIso = new Map(countries.map(c => [c.iso, c]));

    // Tag each polygon with its ISO code + whether we have photos for it.
    for (const f of all) {
        const meta = iso[String(f.id)];
        f.properties.iso  = meta?.a3 ?? null;
        f.properties.name = meta?.name ?? f.properties.name;
        f.properties.data = meta ? byIso.get(meta.a3) ?? null : null;
    }

    const globe = new Globe(el)
        .backgroundColor('#00000000')
        .showAtmosphere(true)
        .atmosphereColor(PALETTE.atmosphere)
        .atmosphereAltitude(0.18)
        .pointsData(countries)
        .pointLat('lat').pointLng('lng')
        .pointColor(() => PALETTE.marker)
        .pointAltitude(0.02)
        .pointRadius(c => 0.28 + Math.min(c.photos.length, 12) * 0.035)
        .pointsMerge(false)
        .pointLabel(label)
        .onPointClick(c => onCountryClick?.(c));

    // Someone who asked the system for less motion doesn't want a globe that
    // spins on its own or swoops between countries.
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

    globe.controls().autoRotate = !calm;
    globe.controls().autoRotateSpeed = 0.35;
    globe.controls().minDistance = 160;
    globe.controls().maxDistance = 620;

    // cap DPR — phones report 3 and triple the pixel count for no visible gain
    globe.renderer().setPixelRatio(Math.min(devicePixelRatio, 2));

    let hovered   = null;
    let spotlight = null;   // ISO the tour is flying to

    const capColor = f =>
        f.properties.iso === spotlight        ? PALETTE.spotlight
      : f === hovered && f.properties.data    ? PALETTE.hover
      : f.properties.data                     ? PALETTE.visited
      : PALETTE.land;

    const strokeColor = f =>
        f.properties.iso === spotlight ? PALETTE.spotlightEdge
      : f.properties.data              ? PALETTE.visitedEdge
      : PALETTE.landEdge;

    const altitude = f =>
        f.properties.iso === spotlight ? 0.03
      : f.properties.data              ? 0.012
      : 0.006;

    const repaint = () => globe
        .polygonCapColor(capColor)
        .polygonStrokeColor(strokeColor)
        .polygonAltitude(altitude);

    globe.globeMaterial(oceanMaterial())
         .polygonsData(all)
         .polygonCapColor(capColor)
         .polygonSideColor(() => 'rgba(139, 215, 95, 0.10)')
         .polygonStrokeColor(strokeColor)
         .polygonAltitude(altitude)
         .polygonsTransitionDuration(220)
         .onPolygonHover(f => {
             const next = f?.properties.data ? f : null;
             if (next === hovered) return;
             hovered = next;
             el.style.cursor = hovered ? 'pointer' : '';
             onCountryHover?.(hovered?.properties.data ?? null);
             repaint();
         })
         .onPolygonClick(f => f?.properties?.data && onCountryClick?.(f.properties.data));

    // ─── camera ──────────────────────────────────────────────────────────────
    const flyTo = (lat, lng, altitude = 1.4, ms = 1200) =>
        globe.pointOfView({ lat, lng, altitude }, calm ? 0 : ms);

    const home = (ms = 1200) => globe.pointOfView({ altitude: 2.5 }, calm ? 0 : ms);

    // don't render what nobody can see
    let paused = false;
    const setPaused = p => {
        if (p === paused) return;
        paused = p;
        p ? globe.pauseAnimation() : globe.resumeAnimation();
    };
    document.addEventListener('visibilitychange', () => setPaused(document.hidden));

    const resize = () => globe.width(innerWidth).height(innerHeight);
    addEventListener('resize', resize);
    resize();

    return {
        globe,
        flyTo,
        home,
        setPaused,
        autoRotate: on => { globe.controls().autoRotate = on && !calm; },
        /** Light up one country — the tour uses this to show where it's heading. */
        spotlight: isoCode => { spotlight = isoCode; repaint(); },
    };
}

function label(c) {
    return `<div class="globe-label">
        <strong>${c.name}</strong>
        <span>${c.photos.length} photo${c.photos.length === 1 ? '' : 's'}</span>
    </div>`;
}

// Dark, slightly glossy ocean instead of a photographic earth texture — keeps the
// look graphic and costs nothing to load.
function oceanMaterial() {
    return new MeshPhongMaterial({
        color: new Color(PALETTE.ocean),
        shininess: 18,
        specular: new Color('#16323a'),
    });
}
