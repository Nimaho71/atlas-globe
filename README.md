# Atlas

An interactive 3D globe of photographs. Spin the world, open a country, and its photos
play back like a film — full-bleed, Ken Burns drift, letterbox, hard cuts.

Built with vanilla JS + [globe.gl](https://github.com/vasturiano/globe.gl) (Three.js).
No framework.

See [PLAN.md](PLAN.md) for the full design, photo-sourcing decisions and roadmap.

## Run locally

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Static build into `dist/` |
| `npm run seed` | Regenerates the **placeholder** `photos.json` + country centroids |
| `npm run fetch` | *(Phase 1)* Pulls real photos from Unsplash into `photos.json` |

## Data

The site loads one static file, `public/data/photos.json`, and never calls a photo API
at runtime. That file is generated once on a developer machine and committed — so the
photo set is fixed, there's no API key in the browser, and no rate limits apply to
visitors.

**`photos.json` is currently placeholder data** (nature-gallery images spread across ten
countries; they are not pictures of those countries). It gets replaced in Phase 1.

Country shapes are Natural Earth 110m via
[world-atlas](https://github.com/topojson/world-atlas), committed to `public/data/`.

## Structure

```
index.html          globe page
gallery/            the original nature gallery, kept at /gallery
src/globe/          globe, polygons, camera flights
src/strip/          the drag-scroll photo strip
src/cinema/         the full-screen cinematic viewer
src/ui/             cursor blob
scripts/seed.js     placeholder data generator
```

## Deploy

Vercel, framework preset Vite (`vercel.json` sets build command and output dir).
The previous static gallery is preserved at `/gallery` and tagged `v1-nature-gallery`.
