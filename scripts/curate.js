// Contact sheet for picking which candidate photos make the cut.
//
//   npm run curate   → http://localhost:4321
//
// Click photos to keep/drop, hit Save, and the `keep` lists in
// countries.config.json are rewritten. Then `npm run fetch` builds photos.json
// from exactly those ids.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CONFIG     = 'src/data/countries.config.json';
const CANDIDATES = 'src/data/candidates.json';
const PORT       = 4321;
const TARGET     = 5;

if (!existsSync(CANDIDATES)) {
    console.error(`No ${CANDIDATES} yet. Run: npm run fetch -- --candidates`);
    process.exit(1);
}

const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/save') {
        const body = await read(req);
        const keep = JSON.parse(body);
        const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
        for (const [code, ids] of Object.entries(keep)) {
            if (config[code]) config[code].keep = ids;
        }
        writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
        const total = Object.values(keep).reduce((n, a) => n + a.length, 0);
        console.log(`saved — ${total} photos kept across ${Object.keys(keep).length} countries`);
        res.writeHead(200).end('ok');
        return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page());
});

server.listen(PORT, () => {
    console.log(`curate → http://localhost:${PORT}`);
    console.log('Click to keep/drop, then Save. Ctrl-C when done.');
});

function read(req) {
    return new Promise(resolve => {
        let b = '';
        req.on('data', c => (b += c));
        req.on('end', () => resolve(b));
    });
}

function page() {
    const config     = JSON.parse(readFileSync(CONFIG, 'utf8'));
    const candidates = JSON.parse(readFileSync(CANDIDATES, 'utf8'));

    const data = Object.entries(candidates).map(([code, { query, photos }]) => ({
        code,
        query,
        keep: config[code]?.keep ?? [],
        photos: photos.map(p => ({ id: p.id, thumb: p._thumb, title: p.title, by: p.credit?.name })),
    }));

    return `<!doctype html><meta charset="utf-8"><title>Curate</title>
<style>
  :root { color-scheme: dark; }
  body { background:#0b0e12; color:#e8eaed; font:14px/1.5 ui-monospace,Menlo,monospace; margin:0; padding:24px 24px 96px; }
  h1 { font-size:16px; letter-spacing:.2em; text-transform:uppercase; margin:0 0 4px; }
  .sub { color:#7c8794; margin-bottom:28px; }
  section { margin-bottom:34px; }
  .head { align-items:baseline; display:flex; gap:12px; margin-bottom:10px; }
  .code { color:#8bd75f; font-weight:700; letter-spacing:.12em; }
  .query { color:#7c8794; }
  .count { margin-left:auto; color:#7c8794; }
  .count.ok { color:#8bd75f; }
  .grid { display:grid; gap:8px; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
  figure { cursor:pointer; margin:0; position:relative; }
  img { aspect-ratio:3/2; border-radius:4px; display:block; object-fit:cover; width:100%;
        opacity:.42; transition:opacity .15s, outline-color .15s; outline:2px solid transparent; }
  figure.on img { opacity:1; outline-color:#8bd75f; }
  .pos { background:#8bd75f; border-radius:50%; color:#06240a; display:none; font-weight:700;
         height:22px; line-height:22px; position:absolute; right:6px; text-align:center; top:6px; width:22px; }
  figure.on .pos { display:block; }
  figcaption { color:#5f6b78; font-size:11px; overflow:hidden; padding-top:4px;
               text-overflow:ellipsis; white-space:nowrap; }
  #bar { backdrop-filter:blur(6px); background:rgba(11,14,18,.92); border-top:1px solid #1e262f;
         bottom:0; display:flex; gap:16px; align-items:center; left:0; padding:14px 24px; position:fixed; right:0; }
  button { background:#8bd75f; border:0; border-radius:6px; color:#06240a; cursor:pointer;
           font:inherit; font-weight:700; padding:9px 20px; }
  button:disabled { background:#2a323b; color:#6b7684; cursor:default; }
  #status { color:#7c8794; }
</style>
<h1>Curate</h1>
<div class="sub">Pick ${TARGET} per country. Order of clicking is the order they appear.</div>
<div id="app"></div>
<div id="bar">
  <button id="save">Save to config</button>
  <span id="status"></span>
</div>
<script>
const DATA = ${JSON.stringify(data)};
const TARGET = ${TARGET};
const keep = Object.fromEntries(DATA.map(d => [d.code, [...d.keep]]));

const app = document.getElementById('app');
app.innerHTML = DATA.map(d => \`
  <section data-code="\${d.code}">
    <div class="head">
      <span class="code">\${d.code}</span>
      <span class="query">\${d.query}</span>
      <span class="count" id="c-\${d.code}"></span>
    </div>
    <div class="grid">
      \${d.photos.map(p => \`
        <figure data-id="\${p.id}">
          <img src="\${p.thumb}" loading="lazy" alt="">
          <span class="pos"></span>
          <figcaption>\${(p.title || 'untitled')} · \${p.by || ''}</figcaption>
        </figure>\`).join('')}
    </div>
  </section>\`).join('');

function paint() {
  for (const d of DATA) {
    const list = keep[d.code];
    const el = document.getElementById('c-' + d.code);
    el.textContent = list.length + ' / ' + TARGET;
    el.className = 'count' + (list.length === TARGET ? ' ok' : '');
    for (const fig of document.querySelectorAll(\`section[data-code="\${d.code}"] figure\`)) {
      const i = list.indexOf(fig.dataset.id);
      fig.classList.toggle('on', i !== -1);
      fig.querySelector('.pos').textContent = i === -1 ? '' : i + 1;
    }
  }
}

app.addEventListener('click', e => {
  const fig = e.target.closest('figure');
  if (!fig) return;
  const code = fig.closest('section').dataset.code;
  const list = keep[code];
  const i = list.indexOf(fig.dataset.id);
  if (i === -1) list.push(fig.dataset.id); else list.splice(i, 1);
  paint();
});

document.getElementById('save').addEventListener('click', async () => {
  const btn = document.getElementById('save');
  btn.disabled = true;
  await fetch('/save', { method:'POST', body: JSON.stringify(keep) });
  const total = Object.values(keep).reduce((n,a) => n + a.length, 0);
  document.getElementById('status').textContent =
    'saved ' + total + ' photos — now run: npm run fetch';
  btn.disabled = false;
});

paint();
</script>`;
}
