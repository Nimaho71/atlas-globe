import './style.css';
import { createCinema } from './cinema/cinema.js';
import { createStrip } from './strip/strip.js';
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

const world = await createGlobe(app, {
    countries: data.countries,
    onCountryClick: country => openCountry(country),
});

function openCountry(country) {
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

// deep link: ?country=ISL
const wanted = new URLSearchParams(location.search).get('country');
const found  = wanted && data.countries.find(c => c.iso === wanted.toUpperCase());
if (found) openCountry(found);

boot.classList.add('gone');
