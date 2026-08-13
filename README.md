# Atlas

An interactive 3D globe of photographs. Spin the world, open a country, and its photos
play back like a film — full-bleed, Ken Burns drift, letterbox, hard cuts.

Or hit **World tour** and the camera flies country to country on its own: arrive, name
the place, play three shots, fly on. Escape stops it. Deep links: `?country=ISL`,
`?tour=1`.

Built with vanilla JS + [globe.gl](https://github.com/vasturiano/globe.gl) (Three.js).
No framework.

Hovering a country names it; the tour lights the next country up before flying to it and
draws the leg it just flew, so the route accumulates across the globe as it runs.
Press `/` to search — small countries are hard to click, and the field doubles as the
keyboard route in (arrows walk the results, Enter opens).
Every photographer is credited at [/credits](credits/), generated from the same data the
globe reads. `prefers-reduced-motion` turns off the auto-spin, the camera swoops, the
dashed arcs and the Ken Burns drift.

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
| `npm run fetch -- --candidates` | Pulls ~18 Unsplash candidates per country into `candidates.json` |
| `npm run curate` | Contact sheet at :4321 — click to pick keepers, writes them to the config |
| `npm run fetch` | Builds `photos.json` from the curated picks (top 5 if none curated) |

## Your own photographs

Point the importer at a folder and your photos join the globe, ahead of the stock ones
for that country:

```bash
npm run import -- ~/Pictures/travel
npm run fetch          # merges them into photos.json
```

Coordinates are read from EXIF GPS, or from the JSON sidecars in an unzipped **Google
Takeout** export — worth knowing that Takeout is the only Google route that carries
location at all, since the Photos API returns camera settings and no coordinates
whatsoever. Point the importer straight at the export:

```bash
npm run import -- ~/Downloads/Takeout/Google\ Photos
```

Which country a coordinate falls in is worked out offline, against the same Natural
Earth shapes the globe draws — no geocoding service involved.

Photos are resized into `public/photos/` (a 2000px copy for the cinema, 600px for the
strip) and nothing is uploaded anywhere. Anything without a location is still imported
and listed at the end of the run; give it a `lat`/`lng` or an `iso` in
`src/data/own.json` and it will place itself on the next build. Set `photographer` in
that file to have your name appear under your shots.

Making this your own globe: fork, delete `src/data/candidates.json` and the `keep`
lists in `src/data/countries.config.json` if you want only your own photographs, then
run the two commands above.

## Data

The site loads one static file, `public/data/photos.json`, and never calls a photo API
at runtime. That file is generated once on a developer machine and committed — so the
photo set is fixed, there's no API key in the browser, and no rate limits apply to
visitors.

`photos.json` holds 40 countries x 5 photos from Unsplash. Every photo carries the
photographer name and a profile link with the UTM parameters Unsplash requires — the
build refuses to write a photo without attribution.

The API key lives in `.env` (git-ignored) and is only read by the scripts. Responses are
cached in `.cache/` so re-running costs no requests against the 50/hour demo limit.

Country shapes are Natural Earth 110m via
[world-atlas](https://github.com/topojson/world-atlas), committed to `public/data/`.

## Structure

```
index.html          globe page
credits/            photographer credits, built from photos.json
gallery/            the original nature gallery, kept at /gallery
src/globe/          globe, polygons, camera flights
src/strip/          the drag-scroll photo strip
src/cinema/         the full-screen cinematic viewer
src/tour/           the automated world tour
src/search/         country search / keyboard route in
src/ui/             cursor blob
scripts/fetch.js    Unsplash fetch + photos.json build
scripts/curate.js   local contact sheet for picking photos
```

## Deploy

Vercel, framework preset Vite (`vercel.json` sets build command and output dir).
The previous static gallery is preserved at `/gallery` and tagged `v1-nature-gallery`.
