// The globe: country polygons for places we have photos for, markers, camera flights.
// globe.gl wraps three-globe/Three.js — this module owns everything WebGL.

import Globe from 'globe.gl';
import { feature } from 'topojson-client';
import { MeshPhongMaterial, Color } from 'three';

const COLORS = {
    ocean:     '#05080d',
    land:      'rgba(255, 255, 255, 0.055)',
    landEdge:  'rgba(255, 255, 255, 0.13)',
    visited:   'rgba(139, 215, 95, 0.30)',
    hover:     'rgba(139, 215, 95, 0.62)',
    marker:    '#8bd75f',
    atmosphere:'#3ea5b2',
};

export async function createGlobe(el, { countries, onCountryClick } = {}) {
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

    const visited = all.filter(f => f.properties.data);

    const globe = new Globe(el)
        .backgroundColor('#00000000')
        .showGlobe(true)
        .showAtmosphere(true)
        .atmosphereColor(COLORS.atmosphere)
        .atmosphereAltitude(0.18)
        .globeMaterial(oceanMaterial())
        // every country, flat and dim — cheap context so the world reads as a world
        .polygonsData(all)
        .polygonCapColor(f => f.properties.data ? COLORS.visited : COLORS.land)
        .polygonSideColor(() => 'rgba(0, 0, 0, 0)')
        .polygonStrokeColor(() => COLORS.landEdge)
        .polygonAltitude(f => f.properties.data ? 0.012 : 0.006)
        .polygonsTransitionDuration(0)
        // markers only where there are photos
        .pointsData(countries)
        .pointLat('lat').pointLng('lng')
        .pointColor(() => COLORS.marker)
        .pointAltitude(0.02)
        .pointRadius(c => 0.28 + Math.min(c.photos.length, 12) * 0.035)
        .pointsMerge(false)
        .pointLabel(c => label(c));

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.35;
    globe.controls().enableZoom = true;
    globe.controls().minDistance = 160;
    globe.controls().maxDistance = 620;

    // cap DPR — phones report 3 and triple the pixel count for no visible gain
    globe.renderer().setPixelRatio(Math.min(devicePixelRatio, 2));

    // ─── interaction ─────────────────────────────────────────────────────────
    let hovered = null;

    const applyColors = () => globe.polygonCapColor(f =>
        f === hovered && f.properties.data ? COLORS.hover
      : f.properties.data                  ? COLORS.visited
      : COLORS.land);

    globe.onPolygonHover(f => {
        const next = f?.properties.data ? f : null;
        if (next === hovered) return;
        hovered = next;
        el.style.cursor = hovered ? 'pointer' : '';
        applyColors();
    });

    const pick = f => f?.properties.data && onCountryClick?.(f.properties.data);
    globe.onPolygonClick(pick);
    globe.onPointClick(c => onCountryClick?.(c));

    // ─── camera ──────────────────────────────────────────────────────────────
    const flyTo = (lat, lng, altitude = 1.4, ms = 1200) =>
        globe.pointOfView({ lat, lng, altitude }, ms);

    const home = (ms = 1200) => globe.pointOfView({ altitude: 2.5 }, ms);

    // pause rendering when the globe is covered or the tab is hidden
    let paused = false;
    const setPaused = p => {
        if (p === paused) return;
        paused = p;
        globe.pauseAnimation ? (p ? globe.pauseAnimation() : globe.resumeAnimation()) : null;
    };
    document.addEventListener('visibilitychange', () => setPaused(document.hidden));

    const resize = () => globe.width(innerWidth).height(innerHeight);
    addEventListener('resize', resize);
    resize();

    const autoRotate = on => { globe.controls().autoRotate = on; };

    return { globe, flyTo, home, setPaused, autoRotate, visited, all };
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
        color: new Color(COLORS.ocean),
        shininess: 18,
        specular: new Color('#16323a'),
    });
}
