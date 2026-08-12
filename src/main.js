import './style.css';
import { createCinema } from './cinema/cinema.js';
import { createStrip } from './strip/strip.js';
import { createTour } from './tour/tour.js';
import { createSearch } from './search/search.js';
import { startBlob } from './ui/blob.js';

const boot = document.getElementById('boot');
const app  = document.getElementById('globe');

startBlob(document.getElementById('blob'));

const data = await fetch('/data/photos.json').then(r => r.json());

// Globe (and Three.js with it) is the heavy chunk — loaded after first paint so
// the title is on screen immediately.
const { createGlobe } = await import('./globe/globe.js');

const cinema = createCinema({
    onOpen:  () => world.setPaused(true),
    onClose: () => world.setPaused(false),
});

const strip = createStrip({
    onPhotoClick: (photos, i, el) => cinema.open(photos, i, el),
});

const hoverName = document.getElementById('hover-name');

const world = await createGlobe(app, {
    countries: data.countries,
    onCountryClick: country => openCountry(country),
    onCountryHover: country => {
        hoverName.textContent = country
            ? `${country.name} · ${country.photos.length} photos`
            : '';
        hoverName.classList.toggle('on', !!country);
    },
});

if (import.meta.env.DEV) window.__world = world;   // handle for debugging

const tour = createTour({
    world,
    cinema,
    countries: data.countries,
    onStop: () => history.replaceState(null, '', location.pathname),
});

const playBtn = document.getElementById('tour-play');
playBtn.hidden = false;
playBtn.addEventListener('click', () => {
    closeCountry();
    tour.start();
});

// A WebGL canvas can't be tabbed into, so search doubles as the keyboard route
// in: Tab reaches the field, arrows walk the results, Enter opens.
const search = createSearch({
    countries: data.countries,
    onPick: country => openCountry(country),
    onPreview: country => {
        world.spotlight(country?.iso ?? null);
        if (country) world.flyTo(country.lat, country.lng, 1.8, 700);
    },
});
document.body.appendChild(search.root);

function openCountry(country) {
    search.close();
    world.autoRotate(false);
    world.flyTo(country.lat, country.lng, 1.5, 1200);
    document.body.classList.add('country-open');
    strip.show(country);
    history.replaceState(null, '', `?country=${country.iso}`);
}

function closeCountry() {
    strip.hide();
    document.body.classList.remove('country-open');
    world.home(1200);
    world.autoRotate(true);
    history.replaceState(null, '', location.pathname);
}

strip.root.querySelector('#strip-close').addEventListener('click', closeCountry);

addEventListener('keydown', e => {
    if (e.key === 'Escape' && strip.visible && !cinema.isOpen) closeCountry();
});

// deep links: ?country=ISL opens a country, ?tour=1 starts the tour
const params = new URLSearchParams(location.search);
const wanted = params.get('country');
const found  = wanted && data.countries.find(c => c.iso === wanted.toUpperCase());
if (found)             openCountry(found);
if (params.has('tour')) tour.start();

boot.classList.add('gone');
