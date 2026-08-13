// Which country is this coordinate in? Ray-casting point-in-polygon against the
// Natural Earth shapes the globe already ships — no geocoding service, no key.
//
// Pure: the caller supplies the data, so this runs identically in Node (the
// import script) and in the browser (the studio).

/**
 * @param {Array} features  GeoJSON features, as produced by topojson feature()
 * @param {Object} isoMap   { [numericId]: { a3, name } }
 */
export function createLookup(features, isoMap) {
    const shapes = features
        .map(f => {
            const meta  = isoMap[String(f.id)];
            const rings = ringsOf(f.geometry);
            return { iso: meta?.a3 ?? null, name: meta?.name ?? '', rings, bbox: bboxOf(rings) };
        })
        .filter(s => s.iso);

    /** @returns {{iso: string, name: string} | null} */
    return function countryAt(lat, lng) {
        for (const s of shapes) {
            const [minLng, minLat, maxLng, maxLat] = s.bbox;
            // four comparisons reject almost everything before any ring walking
            if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
            if (s.rings.some(ring => inRing(lng, lat, ring))) {
                return { iso: s.iso, name: s.name };
            }
        }
        return null;
    };
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
