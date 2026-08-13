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
    arcLive:       'rgba(196, 255, 160, 0.95)',
    land:        'rgba(255, 255, 255, 0.07)',
    landEdge:    'rgba(255, 255, 255, 0.15)',
    ocean:       '#05080d',
};

export async function createGlobe(el, {
    countries,
    onCountryClick,
    onCountryHover,
    // the studio places photos by clicking, so there every country is a target
    anyCountry = false,
} = {}) {
    const [topo, iso] = await Promise.all([
        fetch('/data/countries-110m.json').then(r => r.json()),
        fetch('/data/iso.json').then(r => r.json()),
    ]);

    const all = feature(topo, topo.objects.countries).features;

    for (const f of all) {
        const meta = iso[String(f.id)];
        f.properties.iso  = meta?.a3 ?? null;
        f.properties.name = meta?.name ?? f.properties.name;
    }

    // Tag each polygon with the country data we hold for it, if any.
    function tag(list) {
        const byIso = new Map(list.map(c => [c.iso, c]));
        for (const f of all) f.properties.data = byIso.get(f.properties.iso) ?? null;
    }
    tag(countries ?? []);

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
        .onPointClick(c => onCountryClick?.(c))
        // The leg the camera is currently flying: one lit dash travelling the
        // arc for the flight's duration, then gone. Solid colour, because a
        // gradient fades the dash out exactly where it starts.
        .arcStartLat('fromLat').arcStartLng('fromLng')
        .arcEndLat('toLat').arcEndLng('toLng')
        .arcColor(() => PALETTE.arcLive)
        .arcStroke(0.75)
        // enough lift that a leg reads as a flight rather than a line on a map
        .arcAltitudeAutoScale(0.62)
        .arcDashLength(0.4)
        .arcDashGap(0.6)
        .arcDashInitialGap(1)
        .arcDashAnimateTime(d => d.ms)
        .arcsTransitionDuration(0);

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
    let legs      = [];     // flight path accumulated during a tour

    const hoverable = f => !!f?.properties.data || (anyCountry && !!f?.properties.iso);

    // Natural Earth carries a few shapes with no ISO code (N. Cyprus, Somaliland,
    // Kosovo), so their iso is null — and a bare `iso === spotlight` would light
    // all three up whenever nothing is spotlit at all.
    const isSpotlit = f => spotlight != null && f.properties.iso === spotlight;

    const capColor = f =>
        isSpotlit(f)                    ? PALETTE.spotlight
      : f === hovered && hoverable(f)   ? PALETTE.hover
      : f.properties.data               ? PALETTE.visited
      : PALETTE.land;

    const strokeColor = f =>
        isSpotlit(f)         ? PALETTE.spotlightEdge
      : f.properties.data    ? PALETTE.visitedEdge
      : PALETTE.landEdge;

    const altitude = f =>
        isSpotlit(f)         ? 0.03
      : f.properties.data    ? 0.012
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
             const next = hoverable(f) ? f : null;
             if (next === hovered) return;
             hovered = next;
             el.style.cursor = hovered ? 'pointer' : '';
             onCountryHover?.(hovered?.properties.data ?? null);
             repaint();
         })
         .onPolygonClick(f => {
             if (!hoverable(f)) return;
             // with anyCountry, a country we hold nothing for still identifies itself
             onCountryClick?.(f.properties.data ??
                 { iso: f.properties.iso, name: f.properties.name, photos: [] });
         });

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

    // Size to the host element, not the window — the studio insets the globe
    // beside a panel, and a canvas wider than its box both crops the globe and
    // throws off the raycast that hover and clicks depend on.
    const resize = () => globe
        .width(el.clientWidth || innerWidth)
        .height(el.clientHeight || innerHeight);

    new ResizeObserver(resize).observe(el);
    resize();

    return {
        globe,
        flyTo,
        home,
        setPaused,
        autoRotate: on => { globe.controls().autoRotate = on && !calm; },
        /** Swap the whole set — the studio rebuilds it as photos come in. */
        setCountries(list) {
            tag(list);
            globe.pointsData(list);
            repaint();
        },
        /** Light up one country — the tour uses this to show where it's heading. */
        spotlight: isoCode => { spotlight = isoCode; repaint(); },

        /**
         * Draw the leg the camera is about to fly: a lit dash that travels the
         * arc over `ms`, matching the flight, and disappears on landing. Nothing
         * is left behind — a tour's worth of leftover arcs is just noise.
         */
        addLeg(from, to, ms = 1600) {
            if (calm) return;                   // no flying dashes under reduced motion

            const leg = {
                fromLat: from.lat, fromLng: from.lng,
                toLat:   to.lat,   toLng:   to.lng,
                ms,
            };
            legs = [...legs, leg];
            globe.arcsData(legs);

            setTimeout(() => {
                legs = legs.filter(l => l !== leg);
                globe.arcsData(legs);
            }, ms);
        },
        clearLegs() {
            legs = [];
            globe.arcsData(legs);
        },
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
