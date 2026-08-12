// The globe: country polygons for places we have photos for, markers, camera flights.
// globe.gl wraps three-globe/Three.js — this module owns everything WebGL.
//
// Three visual styles, switchable at runtime (?style=graphic|photo|dots):
//   graphic — dark vector world, no textures, loads instantly
//   photo   — NASA night-lights texture on the sphere
//   dots    — countries drawn as hex-dot grids, GitHub/Stripe style

import Globe from 'globe.gl';
import { feature } from 'topojson-client';
import { MeshPhongMaterial, Color, TextureLoader } from 'three';

export const STYLES = ['graphic', 'photo', 'dots'];

const PALETTE = {
    marker:     '#8bd75f',
    atmosphere: '#3ea5b2',
    visited:    'rgba(139, 215, 95, 0.30)',
    hover:      'rgba(139, 215, 95, 0.62)',
    land:       'rgba(255, 255, 255, 0.055)',
    landEdge:   'rgba(255, 255, 255, 0.13)',
    ocean:      '#05080d',
};

export async function createGlobe(el, { countries, onCountryClick, style = 'graphic' } = {}) {
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

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.35;
    globe.controls().minDistance = 160;
    globe.controls().maxDistance = 620;

    // cap DPR — phones report 3 and triple the pixel count for no visible gain
    globe.renderer().setPixelRatio(Math.min(devicePixelRatio, 2));

    let hovered = null;
    let current = null;

    const capColor = f =>
        f === hovered && f.properties.data ? PALETTE.hover
      : f.properties.data                  ? PALETTE.visited
      : PALETTE.land;

    const hexColor = f =>
        f === hovered && f.properties.data ? PALETTE.hover
      : f.properties.data                  ? 'rgba(139, 215, 95, 0.85)'
      : 'rgba(255, 255, 255, 0.22)';

    const onHover = paint => f => {
        const next = f?.properties.data ? f : null;
        if (next === hovered) return;
        hovered = next;
        el.style.cursor = hovered ? 'pointer' : '';
        paint();
    };

    const pick = f => f?.properties?.data && onCountryClick?.(f.properties.data);

    function applyStyle(name) {
        if (name === current) return;
        current = STYLES.includes(name) ? name : 'graphic';

        // reset every layer, then switch on the one this style uses
        globe.polygonsData([]).hexPolygonsData([]);

        if (current === 'photo') {
            globe.globeImageUrl('/textures/earth-night.jpg')
                 .bumpImageUrl('/textures/earth-topology.png')
                 .globeMaterial(new MeshPhongMaterial({ shininess: 8 }))
                 // only the visited countries get an overlay here — the texture
                 // already carries the world, so drawing 177 polygons is waste
                 .polygonsData(all.filter(f => f.properties.data))
                 .polygonCapColor(capColor)
                 .polygonSideColor(() => 'rgba(139, 215, 95, 0.12)')
                 .polygonStrokeColor(() => 'rgba(139, 215, 95, 0.6)')
                 .polygonAltitude(0.014)
                 .polygonsTransitionDuration(0)
                 .onPolygonHover(onHover(() => globe.polygonCapColor(capColor)))
                 .onPolygonClick(pick);
        } else if (current === 'dots') {
            // Only the dots themselves take the raycast — the gaps between them
            // hit nothing, and a transparent polygon layer behind does NOT catch
            // them (it can't sit in front either: a transparent cap still writes
            // depth and would hide the dots). So the margin is kept tight to
            // shrink the dead zones, and the marker point stays the sure target.
            const repaint = () => globe.hexPolygonColor(hexColor);
            globe.globeImageUrl(null)
                 .bumpImageUrl(null)
                 .globeMaterial(oceanMaterial())
                 .hexPolygonsData(all)
                 .hexPolygonResolution(3)
                 .hexPolygonMargin(0.12)
                 .hexPolygonUseDots(false)
                 .hexPolygonAltitude(f => f.properties.data ? 0.012 : 0.006)
                 .hexPolygonColor(hexColor)
                 .polygonsData(all)
                 .polygonCapColor(() => 'rgba(0, 0, 0, 0)')
                 .polygonSideColor(() => 'rgba(0, 0, 0, 0)')
                 .polygonStrokeColor(() => null)
                 .polygonAltitude(0.004)
                 .polygonsTransitionDuration(0)
                 .onPolygonHover(onHover(repaint))
                 .onPolygonClick(pick)
                 .onHexPolygonHover(onHover(repaint))
                 .onHexPolygonClick(pick);
        } else {
            globe.globeImageUrl(null)
                 .bumpImageUrl(null)
                 .globeMaterial(oceanMaterial())
                 .polygonsData(all)
                 .polygonCapColor(capColor)
                 .polygonSideColor(() => 'rgba(0, 0, 0, 0)')
                 .polygonStrokeColor(() => PALETTE.landEdge)
                 .polygonAltitude(f => f.properties.data ? 0.012 : 0.006)
                 .polygonsTransitionDuration(0)
                 .onPolygonHover(onHover(() => globe.polygonCapColor(capColor)))
                 .onPolygonClick(pick);
        }
        return current;
    }

    applyStyle(style);

    // ─── camera ──────────────────────────────────────────────────────────────
    const flyTo = (lat, lng, altitude = 1.4, ms = 1200) =>
        globe.pointOfView({ lat, lng, altitude }, ms);

    const home = (ms = 1200) => globe.pointOfView({ altitude: 2.5 }, ms);

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
        applyStyle,
        autoRotate: on => { globe.controls().autoRotate = on; },
        get style() { return current; },
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
