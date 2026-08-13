// Type to find a country. Small countries are hard to click on a globe, and this
// is also the keyboard route in — so it replaces the off-screen button list that
// used to serve that purpose.
//
// ↑/↓ move, Enter opens, Escape clears then closes, "/" from anywhere focuses.

import './search.css';

const MAX_RESULTS = 6;

export function createSearch({ countries, onPick, onPreview }) {
    const root = document.createElement('div');
    root.id = 'search';
    root.innerHTML = `
        <input id="search-input" type="text" role="combobox" autocomplete="off"
               aria-expanded="false" aria-controls="search-results"
               aria-label="Search countries" placeholder="Search a country">
        <ul id="search-results" role="listbox" aria-label="Matching countries"></ul>
    `;

    const input   = root.querySelector('#search-input');
    const results = root.querySelector('#search-results');

    let sorted  = [...countries].sort((a, b) => a.name.localeCompare(b.name));
    let matches = [];
    let active  = -1;

    function search(term) {
        const q = term.trim().toLowerCase();
        if (!q) return [];
        // name-start first, then anywhere in the name, then ISO code
        const starts = sorted.filter(c => c.name.toLowerCase().startsWith(q));
        const within = sorted.filter(c => !starts.includes(c) && c.name.toLowerCase().includes(q));
        const byIso  = sorted.filter(c => c.iso.toLowerCase() === q);
        return [...new Set([...starts, ...within, ...byIso])].slice(0, MAX_RESULTS);
    }

    function render() {
        results.innerHTML = matches.map((c, i) => `
            <li id="search-opt-${i}" role="option" aria-selected="${i === active}"
                class="${i === active ? 'active' : ''}" data-i="${i}">
                <span>${escape(c.name)}</span>
                <em>${c.photos.length}</em>
            </li>
        `).join('');
        root.classList.toggle('open', matches.length > 0);
        input.setAttribute('aria-expanded', String(matches.length > 0));
        if (active >= 0) input.setAttribute('aria-activedescendant', `search-opt-${active}`);
        else             input.removeAttribute('aria-activedescendant');
    }

    function setActive(i) {
        if (!matches.length) return;
        active = (i + matches.length) % matches.length;
        render();
        onPreview?.(matches[active]);      // fly the globe to the highlighted one
    }

    function close({ keepText = false } = {}) {
        matches = [];
        active  = -1;
        if (!keepText) input.value = '';
        render();
        onPreview?.(null);
    }

    function pick(i) {
        const country = matches[i];
        if (!country) return;
        input.value = '';
        close();
        input.blur();
        onPick(country);
    }

    input.addEventListener('input', () => {
        matches = search(input.value);
        active  = matches.length ? 0 : -1;
        render();
        if (active >= 0) onPreview?.(matches[0]);
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
        else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
        else if (e.key === 'Escape') {
            e.stopPropagation();               // don't also close a country behind us
            if (input.value) close();
            else input.blur();
        }
    });

    results.addEventListener('mousedown', e => {
        // mousedown, not click — blur would tear the list down first
        const li = e.target.closest('li');
        if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
    });

    input.addEventListener('blur', () => setTimeout(() => close({ keepText: true }), 120));

    // "/" is the conventional focus-search key; ignore it while typing elsewhere
    addEventListener('keydown', e => {
        if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        input.focus();
    });

    return {
        root,
        focus: () => input.focus(),
        close,
        /** The studio's list grows as photos come in. */
        setCountries(list) {
            sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        },
    };
}

function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
}
