// Place card: real photos (Wikimedia Commons), real history (Wikipedia, in the visitor's language when it exists)
// rolling like film credits, an optional real 3D scan (Sketchfab), and an exterior fly-around on the live 3D map.
import { t, LANG } from './i18n.js?v=58';
import { openWalk } from './walk.js?v=58';
import { fmtDate, translate, translit } from './names.js?v=58';
import { createGuide } from './guide.js?v=58';
import { passport } from './tour.js?v=58';
import { createMyRoute } from './route_me.js?v=58';
import { sakartvelo } from './sakartvelo.js?v=58';
let curatedP = null;
export const autoGuide = () => { try { return localStorage.getItem('geoarch-autoguide') !== '0'; } catch { return true; } };
export const setAutoGuide = (v) => { try { localStorage.setItem('geoarch-autoguide', v ? '1' : '0'); } catch { /* */ } };
const curated = () => curatedP ||= fetch('data/curated.json?v=20261121b').then(r => r.json()).catch(() => ({}));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const API = (host, params) => fetch(`https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', origin: '*', ...params })).then(r => r.json());
const WIKI_ORDER = (LANG === 'uk' ? [LANG, 'ru', 'en', 'ka'] : [LANG, 'en', 'ru', 'ka']).filter((v, i, a) => a.indexOf(v) === i);
const BUILDINGS = new Set(['church', 'fort', 'arch', 'monument', 'museum', 'sight']);
const cache = new Map();

async function wikidata(qid) {
  const d = await API('www.wikidata.org', { action: 'wbgetentities', ids: qid, props: 'claims|sitelinks|descriptions', languages: WIKI_ORDER.join('|') });
  const e = d.entities?.[qid]; if (!e) return {};
  const claim = (p) => (e.claims?.[p] || []).map(c => c.mainsnak?.datavalue?.value).filter(Boolean);
  const imgs = claim('P18').slice(0, 3);
  const inc = claim('P571')[0]?.time; // +1106-00-00T00:00:00Z
  let year = null; if (inc) { const y = parseInt(inc.slice(0, 5), 10); if (!isNaN(y)) year = y; }
  const site = WIKI_ORDER.map(l => e.sitelinks?.[l + 'wiki'] && [l, e.sitelinks[l + 'wiki'].title]).find(Boolean);
  const desc = sakartvelo(e.descriptions?.[LANG]?.value || '');
  return { imgs, year, site, desc };
}

async function wikiText(lang, title) {
  const d = await API(`${lang}.wikipedia.org`, { action: 'query', prop: 'extracts|pageprops', explaintext: 1, exsectionformat: 'plain', exchars: 3200, redirects: 1, titles: title });
  const pg = Object.values(d.query?.pages || {})[0]; if (!pg || pg.missing !== undefined) return null;
  const paras = String(pg.extract || '').split(/\n+/).map(s => s.trim())
    .filter(s => s.length > 40 && !/^(См\. также|Примечания|Литература|Ссылки|References|See also|Notes|External links|Gallery|Галерея)/i.test(s));
  return { lang, title: pg.title, paras: paras.slice(0, 8).map(sakartvelo), qid: pg.pageprops?.wikibase_item };
}

// No direct link in OSM: look for a Wikipedia article about this exact spot whose title matches the place's name.
const normT = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const STOP = new Set('church monastery cathedral fortress castle tower monument museum saint holy the of and церковь монастырь собор крепость башня памятник святой святого святых храм ეკლესია მონასტერი ტაძარი ციხე წმინდა'.split(' '));
const tokens = (x) => new Set((normT(x).match(/[\p{L}]{4,}/gu) || []).filter(w => !STOP.has(w)));
async function geoArticle(p) {
  const want = new Set(Object.values(p.n || {}).flatMap(v => [...tokens(v)]));
  if (!want.size) return null;
  for (const lang of WIKI_ORDER) {
    const d = await API(`${lang}.wikipedia.org`, { action: 'query', list: 'geosearch', gscoord: `${p.la}|${p.lo}`, gsradius: BUILDINGS.has(p.c) ? 400 : 1500, gslimit: 15 }).catch(() => null);
    const hit = (d?.query?.geosearch || []).find(g => [...tokens(g.title)].some(w => want.has(w)));
    if (hit) return wikiText(lang, hit.title).catch(() => null);
  }
  return null;
}

async function commonsInfo(titles) {
  if (!titles.length) return [];
  const d = await API('commons.wikimedia.org', { action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: 1000, titles: titles.map(x => 'File:' + x).join('|') });
  return Object.values(d.query?.pages || {}).filter(p => p.imageinfo).map(toPhoto);
}
async function commonsNear(p, r) {
  const d = await API('commons.wikimedia.org', { action: 'query', generator: 'geosearch', ggscoord: `${p.la}|${p.lo}`, ggsradius: r, ggsnamespace: 6, ggslimit: 12, prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: 1000 });
  return Object.values(d.query?.pages || {}).filter(x => x.imageinfo && /jpeg|png|webp/.test(x.imageinfo[0].mime) && !/map|karte|карта|logo|flag|coat|diagram|plan\b|scheme/i.test(x.title)).map(toPhoto);
}
function toPhoto(pg) {
  const ii = pg.imageinfo[0], m = ii.extmetadata || {};
  return { src: ii.thumburl || ii.url, page: ii.descriptionurl, author: strip(m.Artist?.value).slice(0, 60) || 'Wikimedia Commons', lic: strip(m.LicenseShortName?.value) };
}

const shardCache = new Map();
async function heritage(p) {
  if (!p.h || !p.hd) return null;
  const k = p.h % 256;
  if (!shardCache.has(k)) shardCache.set(k, fetch(`data/desc/${k}.json?v=20261121b`).then(r => r.json()).catch(() => ({})));
  return (await shardCache.get(k))[p.h] || null;
}

// story of the village / town the monument stands in: Wikipedia in the visitor's language, else Georgian article translated
const settleCache = new Map();
async function settlement(v, muni) {
  if (!v) return null;
  const key = v + '|' + muni; if (settleCache.has(key)) return settleCache.get(key);
  const job = (async () => {
    const s = await API('ka.wikipedia.org', { action: 'query', list: 'search', srsearch: `${v} ${muni || ''}`, srlimit: 5, srnamespace: 0 });
    const hit = (s.query?.search || []).find(x => x.title === v || x.title.startsWith(v + ' (') || x.title.startsWith(v + ','));
    if (!hit) return null;
    const ll = await API('ka.wikipedia.org', { action: 'query', prop: 'langlinks|extracts', lllang: LANG, titles: hit.title, explaintext: 1, exintro: 1, redirects: 1 });
    const pg = Object.values(ll.query?.pages || {})[0];
    const local = pg?.langlinks?.[0]?.['*'];
    if (LANG !== 'ka' && local) {
      const x = await API(`${LANG}.wikipedia.org`, { action: 'query', prop: 'extracts', explaintext: 1, exintro: 1, redirects: 1, titles: local });
      const q = Object.values(x.query?.pages || {})[0];
      const paras = String(q?.extract || '').split(/\n+/).map(z => z.trim()).filter(z => z.length > 30);
      if (paras.length) return { lang: LANG, title: q.title, paras: paras.slice(0, 4).map(sakartvelo) };
    }
    const paras = String(pg?.extract || '').split(/\n+/).map(z => z.trim()).filter(z => z.length > 30);
    return paras.length ? { lang: 'ka', title: pg.title, paras: paras.slice(0, 4) } : null;
  })().catch(() => null);
  settleCache.set(key, job); return job;
}

async function load(p) {
  const key = p.la + ',' + p.lo; if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    let wd = {}, text = null;
    let qid = p.wd;
    const her = heritage(p);
    if (!qid && p.w) { const [lg, ...rest] = p.w.split(':'); text = await wikiText(lg, rest.join(':')).catch(() => null); qid = text?.qid; }
    if (!qid && !text) { text = await geoArticle(p); qid = text?.qid; }
    if (qid) wd = await wikidata(qid).catch(() => ({}));
    if (wd.site && (!text || text.lang !== wd.site[0])) text = (await wikiText(wd.site[0], wd.site[1]).catch(() => null)) || text;
    const reg = await her;
    let photos = [];
    if (reg?.ph) photos.push({ src: `https://memkvidreoba.gov.ge:60/Files?id=${reg.ph}`, page: `https://memkvidreoba.gov.ge/objects/immovable/immovableObject?id=${p.h}`, author: t('pv_agency'), lic: '' });
    photos.push(...await commonsInfo(wd.imgs || []).catch(() => []));
    if (photos.length < 4) {
      const near = await commonsNear(p, BUILDINGS.has(p.c) ? 150 : 400).catch(() => []);
      const seen = new Set(photos.map(x => x.src)); photos = [...photos, ...near.filter(x => !seen.has(x.src))].slice(0, 6);
    }
    return { wd, text, photos, reg };
  })();
  cache.set(key, job); return job;
}

const century = (y) => { if (!y) return ''; const c = Math.ceil(Math.abs(y) / 100); const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'][c] || c; return t('pv_century', { c: roman }) + (y < 0 ? ' ' + t('pv_bc') : ''); };

let MUNI = [];
export function createPlaceView(box, { map, CATS, nm, sub, nearestCity, onExplore, muni }) {
  MUNI = muni || [];
  const el = document.createElement('aside'); el.className = 'pv'; el.setAttribute('aria-live', 'polite'); box.appendChild(el);
  let cur = null, raf = 0, paused = false, pos = 0, slide = 0, slideTimer = 0;

  let guide = null;
  const myRoute = createMyRoute(map);
  function close() { guide?.stop(); myRoute.clear(); el.classList.remove('open'); cancelAnimationFrame(raf); clearInterval(slideTimer); cur = null; const f = el.querySelector('iframe'); if (f) f.remove(); }

  function roll() {
    const wrap = el.querySelector('.pv-credits'), r = el.querySelector('.pv-roll'); if (!wrap || !r) return;
    cancelAnimationFrame(raf); pos = wrap.clientHeight * .55; let last = performance.now();
    const step = (now) => {
      const dt = Math.min(64, now - last); last = now;
      if (!paused) pos -= dt * 0.028; // ~28 px/s, like film credits
      if (pos < -r.offsetHeight) pos = wrap.clientHeight; // loop
      r.style.transform = `translateY(${pos}px)`; raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function setPhotos(photos, title) {
    const m = el.querySelector('.pv-media'); clearInterval(slideTimer); slide = 0;
    if (!photos.length) { m.innerHTML = `<div class="pv-nophoto"><span>${esc(t('pv_nophoto'))}</span></div>`; return; }
    m.innerHTML = photos.map((ph, i) => `<img class="${i ? '' : 'on'}" src="${esc(ph.src)}" alt="${esc(title)}" loading="${i ? 'lazy' : 'eager'}" referrerpolicy="no-referrer">`).join('') +
      (photos.length > 1 ? `<div class="pv-dots">${photos.map((_, i) => `<button class="${i ? '' : 'on'}" data-s="${i}" aria-label="${i + 1}"></button>`).join('')}</div>` : '') +
      `<a class="pv-credit" target="_blank" rel="noopener" href="${esc(photos[0].page)}">📷 ${esc(photos[0].author)}${photos[0].lic ? ' · ' + esc(photos[0].lic) : ''}</a>`;
    const show = (i) => {
      slide = (i + photos.length) % photos.length;
      m.querySelectorAll('img').forEach((im, k) => im.classList.toggle('on', k === slide));
      m.querySelectorAll('.pv-dots button').forEach((b, k) => b.classList.toggle('on', k === slide));
      const c = m.querySelector('.pv-credit'), ph = photos[slide]; c.href = ph.page; c.textContent = `📷 ${ph.author}${ph.lic ? ' · ' + ph.lic : ''}`;
    };
    m.querySelector('.pv-dots')?.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { show(+b.dataset.s); clearInterval(slideTimer); } });
    m.querySelectorAll('img').forEach(im => im.addEventListener('error', () => { im.remove(); }));
    if (photos.length > 1) slideTimer = setInterval(() => show(slide + 1), 5200);
  }

  async function open(p) {
    cur = p; close(); cur = p;
    const host = innerWidth < 900 ? document.body : box; if (el.parentNode !== host) host.appendChild(el);
    const title = nm(p.n), near = nearestCity(p);
    const nearTxt = near ? (near.d < 4 ? t('pv_in', { c: near.name }) : t('pv_from', { d: near.d.toFixed(0), c: near.name })) : '';
    const facts = [t('c_' + p.c), p.e ? `${p.e} ${t('pv_m')}` : '', nearTxt].filter(Boolean).join(' · ');
    el.innerHTML = `
      <button class="pv-x" aria-label="${esc(t('close'))}">×</button>
      <div class="pv-media"><div class="pv-nophoto shimmer"></div></div>
      <div class="pv-tabs">
        <button data-v="photo" class="on">${esc(t('pv_photo'))}</button>
        <button data-v="guide" class="guide-btn">${esc(t('guide_btn'))}</button>
        <button data-v="walk" class="walk-btn">${esc(t('walk_btn'))}</button>
        ${p.sf ? `<button data-v="model">${esc(t('pv_model'))}</button>` : ''}
        <button data-v="explore">${esc(t('pv_explore'))}</button>
      </div>
      <div class="pv-head"><span class="pv-cat" style="--c:${CATS[p.c]}">${esc(facts)}</span><h3>${esc(title)}</h3>${sub(p.n) ? `<em>${esc(sub(p.n))}</em>` : ''}
        ${p.o ? `<small class="pp-occ">${esc(t(p.o === 'A' ? 'abkhazia' : 'tskhinvali'))} — ${esc(t('occupied'))}</small>` : ''}</div>
      <div class="pv-route"><button class="pv-go" data-go>🧭 ${esc(t('rt_go'))}</button><div class="pv-rt" hidden></div></div>
      <div class="pv-credits"><div class="pv-roll"><p class="pv-wait">${esc(t('loading'))}</p></div></div>
      <div class="pv-links"></div>`;
    el.classList.add('open');
    el.querySelector('.pv-x').onclick = close;
    el.querySelector('[data-go]').onclick = (e) => { e.currentTarget.hidden = true; guide?.stop(); myRoute.show(el.querySelector('.pv-rt'), p); };
    guide?.stop(); guide = createGuide(el);
    async function startGuide() {
      await data; await new Promise(r => setTimeout(r, 50));
      if (cur !== p) return;
      const roll_ = el.querySelector('.pv-roll');
      const pick = (sel) => [...roll_.querySelectorAll(sel)].map(x => x.textContent.trim()).filter(Boolean);
      let txt = pick('[data-k="cur"] p:not(.pv-note)').join(' ');
      if (!txt) {
        const head = pick('h4').concat(pick('.pv-sub'));
        const body = pick('[data-k="wiki"] .pv-body p, [data-k="wiki"] > p:not(.pv-note), [data-k="reg"] .pv-body p, [data-k="reg"] > p:not(.pv-note)');
        txt = head.join('. ') + '. ' + body.join(' ');
        if (body.length === 0) txt += ' ' + pick('.pv-roll > p:not(.pv-note):not(.pv-sub):not(.pv-facts)').join(' ');
      }
      const town = pick('[data-k="town"] p:not(.pv-note)').slice(0, 1).join(' ');
      txt = txt.slice(0, 1600) + (town ? ' ' + t('guide_town') + ' ' + town.slice(0, 500) : '');
      paused = true; // let the guide lead; credits wait
      const cid = p.cu ?? p._cu, curTxt = pick('[data-k="cur"] p:not(.pv-note)').join(' ');
      if (LANG === 'ka' && cid != null && curTxt) return guide.speak(curTxt, `audio/ka/${cid}.mp3?v=1`);
      guide.speak(txt);
    }
    const credits = el.querySelector('.pv-credits');
    credits.onmouseenter = () => paused = true; credits.onmouseleave = () => paused = false;
    credits.ontouchstart = () => paused = !paused;
    credits.onwheel = (e) => { e.preventDefault(); pos -= e.deltaY * .6; };

    el.querySelector('.pv-tabs').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v === 'walk') { guide?.stop(); openWalk(box, p, title); return; }
      if (b.dataset.v === 'guide') { startGuide(); return; }
      el.querySelectorAll('.pv-tabs button').forEach(x => x.classList.toggle('on', x === b));
      const m = el.querySelector('.pv-media');
      el.classList.toggle('model', b.dataset.v === 'model');
      if (b.dataset.v === 'model') {
        clearInterval(slideTimer);
        m.innerHTML = `<iframe title="${esc(title)} 3D" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen src="https://sketchfab.com/models/${esc(p.sf)}/embed?autostart=1&ui_theme=dark&ui_infos=0&ui_watermark_link=0&dnt=1"></iframe>`;
      } else if (b.dataset.v === 'explore') {
        el.classList.add('mini'); onExplore(p);
        el.querySelector('.pv-tabs [data-v=photo]').classList.add('on'); b.classList.remove('on');
      } else { el.classList.remove('mini'); data.then(d => cur === p && setPhotos(d.photos, title)); }
    };

    const data = load(p);
    const d = await data; if (cur !== p) return;
    setPhotos(d.photos, title);

    // the "credits": real text, as it is in the sources
    const roll_ = el.querySelector('.pv-roll');
    const when = fmtDate(p.dt) || (BUILDINGS.has(p.c) ? century(d.wd.year) : '');
    const status = [p.wh ? t('pv_unesco') : '', p.st === 2 ? t('pv_national') : p.st === 1 ? t('pv_listed') : ''].filter(Boolean)[0] || '';
    const parts = [`<h4>${esc(title)}</h4>`];
    const subl = [d.wd.desc, when, status].filter(Boolean);
    if (subl.length) parts.push(`<p class="pv-sub">${esc(subl.join(' · '))}</p>`);
    const place = [p.v ? translit(p.v) : '', p.mu != null && MUNI[p.mu] ? t('pv_muni', { m: translit(MUNI[p.mu]) }) : ''].filter(Boolean).join(', ');
    const factsL = [place, p.s ? t('pv_state') + ': ' + t('st_' + p.s) : '', p.e ? t('pv_elev', { e: p.e }) : ''].filter(Boolean);
    if (factsL.length) parts.push(`<p class="pv-facts">${factsL.map(esc).join('<br>')}</p>`);
    const mtNote = (l) => `<p class="pv-note">${esc(t('pv_mt', { l: l.toUpperCase() }))}</p>`;
    let any = false;
    const cuId = p.cu ?? p._cu; const cur_ = cuId != null ? (await curated())[cuId] : null;
    if (cur_) {
      any = true;
      const own = cur_[LANG];
      parts.push(`<div class="pv-sec pv-cur" data-k="cur"><h5>${esc(t('pv_s_guide'))}</h5>${own ? '' : mtNote('en')}<p>${esc(own || cur_.en)}</p></div>`);
    }
    if (d.text?.paras.length) {
      any = true;
      parts.push(`<div class="pv-sec" data-k="wiki"><h5>${esc(t('pv_s_wiki'))}</h5>${d.text.lang !== LANG ? mtNote(d.text.lang) : ''}${d.text.paras.map(x => `<p>${esc(x)}</p>`).join('')}</div>`);
    }
    const regParas = d.reg?.t ? d.reg.t.split(/\n+/).map(x => x.trim()).filter(x => x.length > 2) : [];
    if (regParas.length) {
      any = true;
      parts.push(`<div class="pv-sec" data-k="reg"><h5>${esc(t('pv_s_reg'))}</h5>${LANG !== 'ka' ? mtNote('ka') : ''}${regParas.map(x => `<p>${esc(x)}</p>`).join('')}</div>`);
    }
    if (d.reg?.cx && d.reg.cx !== p.n.ka) parts.push(`<p class="pv-facts">${esc(t('pv_complex'))}: ${esc(LANG === 'ka' ? d.reg.cx : translit(d.reg.cx))}</p>`);
    parts.push(`<div class="pv-sec" data-k="town" hidden></div>`);
    if (!any) {
      parts.push(`<p>${esc(near ? t('pv_auto_' + (BUILDINGS.has(p.c) ? 'b' : 'n'), { cat: t('c_' + p.c).toLowerCase(), near: nearTxt }) : t('c_' + p.c))}</p>`);
      parts.push(`<p class="pv-note">${esc(t('pv_nohist'))}</p>`);
    }
    parts.push('<div class="pv-end">');
    if (d.text) parts.push(`<p><span>${esc(t('pv_text'))}</span>Wikipedia (${esc(d.text.lang)}) · CC BY-SA 4.0</p>`);
    if (d.reg) parts.push(`<p><span>${esc(t('pv_s_reg'))}</span>${esc(t('pv_agency'))}</p>`);
    if (LANG !== 'ka' && (regParas.length || (d.text && d.text.lang !== LANG))) parts.push(`<p><span>${esc(t('pv_mt_by'))}</span>Wikimedia MinT</p>`);
    if (d.photos.length) parts.push(`<p><span>${esc(t('pv_photos'))}</span>${d.photos.map(x => esc(x.author)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</p>`);
    parts.push(`<p><span>${esc(t('pv_map'))}</span>OpenStreetMap · OpenFreeMap</p><p class="pv-fin">ქვის მეხსიერება</p></div>`);
    roll_.innerHTML = parts.join('');
    roll();
    if (autoGuide()) setTimeout(() => { if (cur === p) startGuide(); }, 900);
    else guide.greet(t('guide_offer'));

    // translate in place, then add the story of the village/town
    const swap = (k, from, paras) => translate(paras, from).then(tr0 => { const tr = tr0.map(sakartvelo);
      if (cur !== p) return; const sec = roll_.querySelector(`[data-k="${k}"]`); if (!sec) return;
      const orig = [...sec.querySelectorAll('p:not(.pv-note)')].map(x => x.outerHTML).join('');
      sec.querySelectorAll('p:not(.pv-note)').forEach(x => x.remove());
      const trHtml = tr.map(x => `<p>${esc(x)}</p>`).join('');
      sec.insertAdjacentHTML('beforeend', `<div class="pv-body">${trHtml}</div>`);
      const note = sec.querySelector('.pv-note');
      if (note) {
        note.insertAdjacentHTML('beforeend', ` · <button class="pv-orig">${esc(t('pv_orig'))}</button>`);
        let showOrig = false;
        note.querySelector('.pv-orig').onclick = (e) => { e.stopPropagation(); showOrig = !showOrig; sec.querySelector('.pv-body').innerHTML = showOrig ? orig : trHtml; e.target.textContent = t(showOrig ? 'pv_tr' : 'pv_orig'); };
      }
    }).catch(() => {});
    if (cur_ && !cur_[LANG]) swap('cur', 'en', [cur_.en]);
    if (d.text && d.text.lang !== LANG && d.text.paras.length) swap('wiki', d.text.lang, d.text.paras);
    if (LANG !== 'ka' && regParas.length) swap('reg', 'ka', regParas);
    if (p.v) settlement(p.v, MUNI[p.mu]).then(async (st) => {
      if (!st || cur !== p) return;
      const sec = roll_.querySelector('[data-k="town"]'); if (!sec) return;
      let paras = st.paras;
      if (st.lang !== LANG) paras = await translate(paras, st.lang).catch(() => paras);
      paras = paras.map(sakartvelo);
      if (cur !== p) return;
      sec.innerHTML = `<h5>${esc(t('pv_s_town', { v: translit(p.v) }))}</h5>${st.lang !== LANG ? mtNote(st.lang) : ''}${paras.map(x => `<p>${esc(x)}</p>`).join('')}`;
      sec.hidden = false;
    });

    const links = [];
    if (p.h) links.push(`<a target="_blank" rel="noopener" href="https://memkvidreoba.gov.ge/objects/immovable/immovableObject?id=${p.h}">${esc(t('pv_reglink'))}</a>`);
    if (d.text) links.push(`<a target="_blank" rel="noopener" href="https://${d.text.lang}.wikipedia.org/wiki/${encodeURIComponent(d.text.title.replace(/ /g, '_'))}">${esc(t('map_wiki'))}</a>`);
    if (d.text && d.text.lang !== LANG) links.push(`<a target="_blank" rel="noopener" href="https://translate.google.com/translate?sl=${d.text.lang}&tl=${LANG}&u=${encodeURIComponent(`https://${d.text.lang}.wikipedia.org/wiki/${d.text.title.replace(/ /g, '_')}`)}">${esc(t('pv_translate'))}</a>`);
    const vb = `<button class="pv-visit${passport.has(p) ? ' on' : ''}" data-visit>${esc(passport.has(p) ? t('pass_been') : t('pass_mark'))}</button>`;
    links.unshift(vb);
    links.push(`<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.la},${p.lo}">${esc(t('map_route'))}</a>`);
    links.push(`<a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${p.la}&mlon=${p.lo}#map=17/${p.la}/${p.lo}">OSM</a>`);
    el.querySelector('.pv-links').innerHTML = links.join('');
    el.querySelector('[data-visit]').onclick = (e) => { const on = passport.toggle(p); e.target.classList.toggle('on', on); e.target.textContent = t(on ? 'pass_been' : 'pass_mark'); if (on) { e.target.classList.add('pop'); setTimeout(() => e.target.classList.remove('pop'), 700); } };
  }

  return { open, close };
}
