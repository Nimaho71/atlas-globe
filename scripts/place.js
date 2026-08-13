// Which country is this coordinate in?
//
// Answered offline, against the same Natural Earth shapes the globe renders —
// no geocoding API, no key, no requests. Ray-casting point-in-polygon: count
// crossings of the polygon edges by a ray heading east; odd means inside.

import { readFileSync } from 'node:fs';
import { feature } from 'topojson-client';

let shapes = null;

function load() {
    if (shapes) return shapes;
    const topo = JSON.parse(readFileSync('public/data/countries-110m.json', 'utf8'));
    const iso  = JSON.parse(readFileSync('public/data/iso.json', 'utf8'));

    shapes = feature(topo, topo.objects.countries).features.map(f => {
        const meta = iso[String(f.id)];
        // pre-compute a bounding box so most countries are rejected by four
        // number comparisons instead of a full ring walk
        const rings = ringsOf(f.geometry);
        return { iso: meta?.a3 ?? null, name: meta?.name ?? '', rings, bbox: bboxOf(rings) };
    }).filter(s => s.iso);

    return shapes;
}

/** @returns {{iso: string, name: string} | null} */
export function countryAt(lat, lng) {
    for (const s of load()) {
        const [minLng, minLat, maxLng, maxLat] = s.bbox;
        if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
        if (s.rings.some(ring => inRing(lng, lat, ring))) {
            return { iso: s.iso, name: s.name };
        }
    }
    return null;
}

function ringsOf(geometry) {
    if (geometry.type === 'Polygon')      return geometry.coordinates;
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
    return [];
}

function bboxOf(rings) {
    let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
    for (const ring of rings) {
        for (const [lng, lat] of ring) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        }
    }
    return [minLng, minLat, maxLng, maxLat];
}

function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const straddles = (yi > y) !== (yj > y);
        if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
