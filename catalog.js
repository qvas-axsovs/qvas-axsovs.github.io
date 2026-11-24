// Catalogue of every place on the map, grouped like a guidebook: churches, fortresses, monuments, views, nature…
// Each card gets a real photo (Wikidata → Wikipedia → heritage register → nearby Commons photo) and opens the
// full place card on the site's map (photos, history, guide, 360° walk, route from where you are).
import { t, LANG } from './i18n.js?v=58';
import { DATA_V, CATS } from './map.js?v=58';
import { localizeNames, fmtDate } from './names.js?v=58';
import { PHOTOS } from './photos.js?v=58';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nm = (n) => (n && (n[LANG] || n.en || n.ka)) || '';
const dist = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 6371; };

export const GROUPS = [
  { id: 'church', cats: ['church'] },
  { id: 'fort', cats: ['fort'] },
  { id: 'monument', cats: ['monument'] },
  { id: 'views', cats: ['view', 'peak', 'canyon'] },
  { id: 'nature', cats: ['waterfall', 'lake', 'cave', 'nature', 'spring'] },
  { id: 'arch', cats: ['arch'] },
  { id: 'museum', cats: ['museum'] },
  { id: 'sight', cats: ['sight'] },
];
const label = (g) => ({ church: t('c_church'), fort: t('c_fort'), monument: t('c_monument'), views: t('g_views'), nature: t('g_nature'), arch: t('c_arch'), museum: t('c_museum'), sight: t('c_sight') }[g.id]);

// curated local photos for the best-known places (matched by English name)
const LOCAL = { 'Jvari': 'jvari', 'Svetitskhoveli': 'svetitskhoveli', 'Bagrati': 'bagrati', 'Gelati': 'gelati', 'Vardzia': 'vardzia', 'Ushguli': 'ushguli', 'Narikala': 'narikala', 'Ananuri': 'ananuri', 'Gergeti': 'gergeti', 'Uplistsikhe': 'uplistsikhe', 'Sameba': 'sameba', 'Holy Trinity Cathedral of Tbilisi': 'sameba' };
const localPhoto = (p) => { const en = p.n?.en || ''; for (const [k, v] of Object.entries(LOCAL)) if (en.includes(k) && PHOTOS[v]) return { src: PHOTOS[v].card, credit: `${PHOTOS[v].author}, ${PHOTOS[v].lic}` }; return null; };

function score(p) {
  return (p.cu != null ? 1000 : 0) + (p.wh ? 600 : 0) + (p.st === 2 ? 200 : p.st === 1 ? 40 : 0) + (p.wd ? 160 : 0) + (p.w ? 140 : 0) + (p.sf ? 80 : 0)
    + (p.n?.en ? 30 : 0) + (p.c === 'peak' && p.e ? Math.min(120, p.e / 40) : 0) + (p.c === 'view' ? 110 : p.c === 'canyon' ? 150 : p.c === 'waterfall' || p.c === 'lake' ? 40 : 0) + (p.s && p.s <= 2 ? 15 : 0);
}

/* ---------- photo lookup, batched and cached ---------- */
const photoCache = new Map();
async function wikidataImages(qids) {
  const out = {}; if (!qids.length) return out;
  const q = new URLSearchParams({ action: 'wbgetentities', ids: qids.join('|'), props: 'claims', format: 'json', origin: '*' });
  const d = await fetch('https://www.wikidata.org/w/api.php?' + q).then(r => r.json()).catch(() => null);
  for (const [id, e] of Object.entries(d?.entities || {})) {
    const f = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (f) out[id] = { src: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=500`, credit: 'Wikimedia Commons' };
  }
  return out;
}
async function wikiImages(titles) { // titles like "en:Gudarekhi"
  const by = {}; titles.forEach(x => { const [l, ...r] = x.split(':'); (by[l] ||= []).push(r.join(':')); });
  const out = {};
  await Promise.all(Object.entries(by).map(async ([l, ts]) => {
    const q = new URLSearchParams({ action: 'query', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: 500, titles: ts.join('|'), redirects: 1, format: 'json', formatversion: 2, origin: '*' });
    const d = await fetch(`https://${l}.wikipedia.org/w/api.php?` + q).then(r => r.json()).catch(() => null);
    const back = {}; (d?.query?.redirects || []).forEach(r => back[r.to] = r.from); (d?.query?.normalized || []).forEach(r => back[r.to] = back[r.to] || r.from);
    for (const pg of d?.query?.pages || []) if (pg.thumbnail) { const orig = back[pg.title] || pg.title; out[`${l}:${orig}`] = { src: pg.thumbnail.source, credit: 'Wikipedia' }; out[`${l}:${pg.title}`] = out[`${l}:${orig}`]; }
  }));
  return out;
}
const shards = new Map();
const shard = (h) => { const k = h % 256; if (!shards.has(k)) shards.set(k, fetch(`data/desc/${k}.json?v=${DATA_V}`).then(r => r.json()).catch(() => ({}))); return shards.get(k); };
async function registryImage(p) {
  const d = (await shard(p.h))[p.h];
  return d?.ph ? { src: `https://memkvidreoba.gov.ge:60/Files?id=${d.ph}`, credit: t('pv_agency') } : null;
}
async function commonsNear(p, wide = false) {
  const r = wide ? (['peak', 'canyon', 'view', 'nature', 'lake'].includes(p.c) ? 10000 : 3000) : (p.c === 'peak' ? 3000 : 800);
  const q = new URLSearchParams({ action: 'query', generator: 'geosearch', ggscoord: `${p.la}|${p.lo}`, ggsradius: r, ggsnamespace: 6, ggslimit: wide ? 12 : 6,
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: 500, format: 'json', formatversion: 2, origin: '*' });
  const d = await fetch('https://commons.wikimedia.org/w/api.php?' + q).then(r => r.json()).catch(() => null);
  const pages = (d?.query?.pages || []).filter(pg => { const ii = pg.imageinfo?.[0]; return ii && ii.width >= 800 && ii.width > ii.height * 1.1 && /\.jpe?g$/i.test(pg.title); });
  const pg = pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0]; if (!pg) return null;
  const a = (pg.imageinfo[0].extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 40);
  return { src: pg.imageinfo[0].thumburl, credit: a || 'Wikimedia Commons' };
}
async function photosFor(list) {
  const need = list.filter(x => !photoCache.has(x.i));
  const wd = await wikidataImages([...new Set(need.filter(x => x.p.wd).map(x => x.p.wd))].slice(0, 50));
  const wk = await wikiImages([...new Set(need.filter(x => x.p.w && !wd[x.p.wd]).map(x => x.p.w))].slice(0, 50));
  await Promise.all(need.map(async ({ p, i }) => {
    let ph = localPhoto(p) || wd[p.wd] || wk[p.w] || null;
    if (!ph && p.h) ph = await registryImage(p);
    if (!ph) ph = await commonsNear(p);
    if (!ph) ph = await commonsNear(p, true);
    photoCache.set(i, ph);
  }));
}

/* ---------- UI ---------- */
export async function initCatalog(root, { openPlace }) {
  const data = await fetch('data/places.json?v=' + DATA_V).then(r => r.json());
  const { places, cities, muni } = data; localizeNames(places);
  const nearest = (p) => { let b = null; for (const c of cities) { const d = dist(p.la, p.lo, c.la, c.lo); if (!b || d < b.d) b = { d, name: nm(c.n) }; } return b && b.d < 60 ? b : null; };
  const key = (p) => nm(p.n).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const dedupe = (arr) => { const seen = new Map(); return arr.filter(x => { const k = key(x.p), l = seen.get(k) || []; if (l.some(y => dist(y[0], y[1], x.p.la, x.p.lo) < 1)) return false; l.push([x.p.la, x.p.lo]); seen.set(k, l); return true; }); };
  const lists = Object.fromEntries(GROUPS.map(g => [g.id, dedupe(places.map((p, i) => ({ p, i })).filter(x => g.cats.includes(x.p.c) && nm(x.p.n)).sort((a, b) => score(b.p) - score(a.p)))]));
  let group = 'church', shown = 0, query = '';
  const PAGE = 12;

  root.querySelector('#catTabs').innerHTML = GROUPS.filter(g => lists[g.id].length).map(g =>
    `<button data-g="${g.id}" class="${g.id === group ? 'on' : ''}"><i style="background:${CATS[g.cats[0]]}"></i>${esc(label(g))} <span>${lists[g.id].length.toLocaleString()}</span></button>`).join('');
  const grid = root.querySelector('#catGrid'), more = root.querySelector('#catMore'), qIn = root.querySelector('#catSearch');

  const card = ({ p, i }) => {
    const near = nearest(p), where = (p.mu != null && muni[p.mu]) ? (LANG === 'ka' ? muni[p.mu] : near?.name || '') : near?.name || '';
    const meta = [where, fmtDate(p.dt), p.e ? `${p.e} ${t('pv_m')}` : ''].filter(Boolean).join(' · ');
    const badge = p.wh ? t('pv_unesco') : p.st === 2 ? t('pv_national') : '';
    return `<article class="card cat-card" data-i="${i}" tabindex="0" style="--c:${CATS[p.c]}">
      <div class="cat-ph shimmer"></div>
      <div class="cat-top"><span class="cat-chip"><i></i>${esc(t('c_' + p.c))}</span>${badge ? `<span class="badge">${esc(badge)}</span>` : ''}</div>
      <div class="cat-body"><h3>${esc(nm(p.n))}</h3>${meta ? `<p>${esc(meta)}</p>` : ''}</div>
      <div class="card-foot"><span>${esc(t('cat_open'))}</span><small class="cat-credit"></small></div>
    </article>`;
  };
  async function fillPhotos(items) {
    await photosFor(items);
    for (const { i, p } of items) {
      const el = grid.querySelector(`.cat-card[data-i="${i}"]`); if (!el) continue;
      const ph = photoCache.get(i), box = el.querySelector('.cat-ph');
      box.classList.remove('shimmer');
      if (ph) {
        const img = new Image(); img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.className = 'card-img';
        img.onload = () => { el.classList.add('has-photo'); box.replaceWith(img); el.querySelector('.cat-credit').textContent = '📷 ' + ph.credit; };
        img.onerror = () => { box.classList.add('cat-noph'); };
        img.src = ph.src;
      } else box.classList.add('cat-noph');
    }
  }
  const filtered = () => { const q = query.toLowerCase(); return q ? lists[group].filter(x => Object.values(x.p.n).join(' ').toLowerCase().includes(q)) : lists[group]; };
  function render(reset) {
    const all = filtered();
    if (reset) { shown = 0; grid.innerHTML = ''; }
    const items = all.slice(shown, shown + PAGE); shown += items.length;
    grid.insertAdjacentHTML('beforeend', items.map(card).join('') || (reset ? `<p class="muted">${esc(t('map_none'))}</p>` : ''));
    more.hidden = shown >= all.length;
    more.textContent = t('cat_more', { n: Math.min(PAGE, all.length - shown) });
    fillPhotos(items);
  }
  root.querySelector('#catTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-g]'); if (!b) return; group = b.dataset.g;
    root.querySelectorAll('#catTabs button').forEach(x => x.classList.toggle('on', x === b)); const tb = b.parentElement; tb.scrollTo({ left: b.offsetLeft - tb.clientWidth / 2 + b.offsetWidth / 2, behavior: 'smooth' }); render(true);
  });
  let qT = 0; qIn.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { query = qIn.value.trim(); render(true); }, 220); });
  more.onclick = () => render(false);
  // keep loading as you scroll: when the end of the grid comes near, add the next page
  let busy = false;
  new IntersectionObserver((es) => {
    if (!es.some(e => e.isIntersecting) || busy || more.hidden || shown >= (innerWidth < 640 ? 24 : 48)) return; // after 4 pages: button, so the rest of the page stays reachable
    busy = true; render(false); setTimeout(() => { busy = false; }, 600);
  }, { rootMargin: '700px 0px' }).observe(root.querySelector('.cat-more-wrap'));
  const go = (el) => { const i = +el.dataset.i; openPlace(i); };
  grid.addEventListener('click', e => { const c = e.target.closest('.cat-card'); if (c) go(c); });
  grid.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('cat-card')) go(e.target); });
  render(true);
}
