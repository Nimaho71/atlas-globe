// Credits, generated from the same photos.json the globe reads — so the page
// can never fall out of step with what is actually on the site.

const attr = escape;   // same escaping, named for where it's used

const data = await fetch('/data/photos.json').then(r => r.json());

const photographers = new Set();

document.getElementById('list').innerHTML = data.countries.map(country => `
    <section>
        <h2>${escape(country.name)}</h2>
        <ul>
            ${country.photos.map(p => {
                photographers.add(p.credit.name);
                return `<li>
                    <a class="thumb" href="${attr(p.credit.link)}" target="_blank" rel="noopener">
                        <img src="${attr(p.url)}&w=200&q=60&auto=format" alt="" loading="lazy" width="80" height="56">
                    </a>
                    <span class="who">
                        <a href="${attr(p.credit.link)}" target="_blank" rel="noopener">${escape(p.credit.name)}</a>
                        <em>${escape(p.title || 'Untitled')}</em>
                    </span>
                    <span class="licence">${escape(p.licence)}</span>
                </li>`;
            }).join('')}
        </ul>
    </section>
`).join('');

const totalPhotos = data.countries.reduce((n, c) => n + c.photos.length, 0);
document.getElementById('count').textContent =
    `${totalPhotos} photographs · ${photographers.size} photographers · ${data.countries.length} countries · last updated ${data.generated}`;

function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
}
