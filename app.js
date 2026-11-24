import { PHOTOS, photoCredit } from './photos.js?v=58';
import { ERAS, MONUMENTS, MODEL_LABEL } from './data.js?v=58';
import { t, L, LANG, LANGS, setLang } from './i18n.js?v=58';
import { initMap } from './map.js?v=58';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = Object.fromEntries(MONUMENTS.map(m => [m.id, m]));

/* ================= i18n ================= */
document.documentElement.lang = LANG;
document.title = t('title');
$$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
$$('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
$$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
$$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
$('#heroTitle').innerHTML = `${esc(t('hero_1'))}<br><em>${esc(t('hero_2'))}</em>`;
$('#langSel').innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${k === LANG ? ' selected' : ''}>${v}</option>`).join('');
$('#langSel').onchange = e => {
  const l = e.target.value; setLang(l);
  const u = new URL(location.href); u.searchParams.set('lang', l); // the address wins over saved choice, so keep it in sync
  location.replace(u.toString());
};
document.documentElement.lang = LANG;

/* ================= DATA LAYER ================= */
const CFG = window.GEOARCH_CONFIG || {};
const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);

function makeLocalStore() {
  const K = 'geoarch-demo';
  const read = () => { try { return JSON.parse(localStorage.getItem(K)) || { users: {}, session: null, fav: {}, reviews: [], routes: [] }; } catch { return { users: {}, session: null, fav: {}, reviews: [], routes: [] }; } };
  const write = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch {} };
  const hash = async (s) => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
  let listeners = [];
  const emit = () => listeners.forEach(f => f(api.user()));
  const api = {
    mode: 'demo',
    user() { const d = read(); const u = d.session && d.users[d.session]; return u ? { id: u.email, email: u.email, name: u.name } : null; },
    onChange(f) { listeners.push(f); },
    async signUp(name, email, pw) {
      const d = read(); email = email.toLowerCase();
      if (d.users[email]) throw new Error(t('err_exists'));
      d.users[email] = { email, name: name || email.split('@')[0], pw: await hash(pw) }; d.session = email; write(d); emit();
      return { needsConfirm: false };
    },
    async signIn(email, pw) {
      const d = read(); email = email.toLowerCase(); const u = d.users[email];
      if (!u || u.pw !== await hash(pw)) throw new Error(t('err_creds'));
      d.session = email; write(d); emit();
    },
    async signOut() { const d = read(); d.session = null; write(d); emit(); },
    async favorites() { const u = api.user(); if (!u) return []; return read().fav[u.id] || []; },
    async toggleFav(id) { const u = api.user(); const d = read(); const l = new Set(d.fav[u.id] || []); l.has(id) ? l.delete(id) : l.add(id); d.fav[u.id] = [...l]; write(d); return l.has(id); },
    async reviews(mid) { return read().reviews.filter(r => r.monument_id === mid).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async addReview(mid, rating, text) { const u = api.user(); const d = read(); d.reviews.push({ id: crypto.randomUUID(), user_id: u.id, author_name: u.name, monument_id: mid, rating, text, created_at: new Date().toISOString() }); write(d); },
    async myReviews() { const u = api.user(); return read().reviews.filter(r => r.user_id === u.id); },
    async routes() { const u = api.user(); return read().routes.filter(r => r.user_id === u.id); },
    async addRoute(title, ids) { const u = api.user(); const d = read(); d.routes.push({ id: crypto.randomUUID(), user_id: u.id, title, monument_ids: ids, created_at: new Date().toISOString() }); write(d); },
    async delRoute(id) { const d = read(); d.routes = d.routes.filter(r => r.id !== id); write(d); },
  };
  return api;
}

function makeSupabaseStore() {
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  let session = null, listeners = [];
  const toUser = (s) => s ? { id: s.user.id, email: s.user.email, name: s.user.user_metadata?.display_name || s.user.email.split('@')[0] } : null;
  sb.auth.getSession().then(({ data }) => { session = data.session; listeners.forEach(f => f(toUser(session))); });
  sb.auth.onAuthStateChange((_e, s) => { session = s; listeners.forEach(f => f(toUser(session))); });
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const api = {
    mode: 'live',
    user() { return toUser(session); },
    onChange(f) { listeners.push(f); },
    async signUp(name, email, pw) {
      const data = chk(await sb.auth.signUp({ email, password: pw, options: { data: { display_name: name || email.split('@')[0] }, emailRedirectTo: location.origin + location.pathname } }));
      return { needsConfirm: !data.session };
    },
    async signIn(email, pw) {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw new Error(/confirm/i.test(error.message) ? t('err_confirm') : t('err_creds'));
    },
    async signOut() { await sb.auth.signOut(); },
    async favorites() { if (!session) return []; return chk(await sb.from('favorites').select('monument_id')).map(r => r.monument_id); },
    async toggleFav(id) {
      const has = (await api.favorites()).includes(id);
      if (has) chk(await sb.from('favorites').delete().eq('monument_id', id).eq('user_id', session.user.id));
      else chk(await sb.from('favorites').insert({ monument_id: id, user_id: session.user.id }));
      return !has;
    },
    async reviews(mid) { return chk(await sb.from('reviews').select('*').eq('monument_id', mid).order('created_at', { ascending: false }).limit(50)); },
    async addReview(mid, rating, text) { const u = api.user(); chk(await sb.from('reviews').insert({ monument_id: mid, rating, text, user_id: u.id, author_name: u.name })); },
    async myReviews() { return chk(await sb.from('reviews').select('*').eq('user_id', session.user.id)); },
    async routes() { return chk(await sb.from('routes').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })); },
    async addRoute(title, ids) { chk(await sb.from('routes').insert({ title, monument_ids: ids, user_id: session.user.id })); },
    async delRoute(id) { chk(await sb.from('routes').delete().eq('id', id)); },
  };
  return api;
}

const store = LIVE ? makeSupabaseStore() : makeLocalStore();

/* ================= UI helpers ================= */
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), 2600); }
function openModal(el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(el) { el.classList.remove('open'); document.body.style.overflow = ''; }
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModal(m); }));
addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal.open').forEach(closeModal); });

const ART = {
  church: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 92h80M18 92V56l32-14 32 14v36M18 56h64M38 42V30h24v12M36 30l14-12 14 12M50 18V8M46 12h8M44 92V74a6 6 0 0 1 12 0v18M28 66v8M72 66v8"/></svg>',
  tower: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 92h84M38 92l4-66h16l4 66M38 26h24v-6H38zM40 20l10-12 10 12M50 40v6M50 58v6M18 92V70l12-8 12 8M70 92V64h14v28"/></svg>',
  cave: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 92h92M8 92C10 60 6 34 30 20s52-8 62 10v62M22 44h8v8h-8zM40 36h10v10H40zM62 40h8v10h-8zM26 66h10v10H26zM50 60h8v12h-8zM70 64h10v10H70z"/></svg>',
  house: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 92h84M14 92V40l36-22 36 22v52M14 58h72M14 62h72M22 58v-6M34 58v-6M46 58v-6M58 58v-6M70 58v-6M82 58v-6M26 74h12v18H26zM56 72h18v10H56z"/></svg>',
  modern: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 92h88M24 92V10M70 92V10M10 70h84v-12H10zM20 40h60V28H20zM40 58V40M8 64h86M18 34h64"/></svg>',
};

/* ================= eras / grid ================= */
const ERA_PHOTO = { ancient: 'uplistsikhe', early: 'jvari', golden: 'gelati', late: 'ananuri', tbilisi: 'balconies', modern: 'peace' };
const eraPh = (id) => PHOTOS[ERA_PHOTO[id]] || PHOTOS[{ golden: 'bagrati', tbilisi: 'tbilisi', late: 'kazbegi' }[id]];
$('#erasTrack').innerHTML = ERAS.map((e, i) => `
  <article class="era${eraPh(e.id) ? ' has-photo' : ''}">${eraPh(e.id) ? `<img class="era-img" alt="" loading="lazy" decoding="async" src="${eraPh(e.id).card}">` : ''}<span class="era-num">${String(i + 1).padStart(2, '0')}</span>
    <div><div class="era-years">${esc(L(e.years))}</div><h3>${esc(L(e.title))}</h3></div>
    <p>${esc(L(e.text))}</p></article>`).join('');

let filter = 'all', favs = new Set();
$('#filters').innerHTML = [['all', t('all')], ...ERAS.map(e => [e.id, L(e.title)])].map(([id, tt]) => `<button class="chip${id === 'all' ? ' active' : ''}" data-f="${id}">${esc(tt)}</button>`).join('');
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return; filter = b.dataset.f;
  $$('.chip').forEach(c => c.classList.toggle('active', c === b)); renderGrid(true);
});
function renderGrid(animate) {
  const list = MONUMENTS.filter(m => filter === 'all' || m.era === filter);
  $('#grid').innerHTML = list.map(m => `
    <article class="card${PHOTOS[m.id] ? ' has-photo' : ''}" data-id="${m.id}" tabindex="0">
      ${PHOTOS[m.id] ? `<img class="card-img" alt="" loading="lazy" decoding="async" src="${PHOTOS[m.id].card}">` : `<div class="card-art">${ART[m.model]}</div>`}
      <button class="fav${favs.has(m.id) ? ' on' : ''}" data-fav="${m.id}" aria-label="${esc(t('fav_add'))}">${favs.has(m.id) ? '♥' : '♡'}</button>
      <div class="card-top"><span class="card-meta">${esc(L(m.place))} · ${esc(L(m.century))}</span></div>
      <div><h3>${esc(L(m.name))}</h3><p>${esc(L(m.text))}</p></div>
      <div class="card-foot"><span>${esc(L(MODEL_LABEL[m.model]))}</span>${m.unesco ? `<span class="badge">${esc(t('unesco'))}</span>` : '<span>→</span>'}</div>
    </article>`).join('');
  if (animate && window.gsap) gsap.from('#grid .card', { y: 40, opacity: 0, duration: .7, stagger: .06, ease: 'power3.out' });
}
$('#grid').addEventListener('click', e => {
  const f = e.target.closest('[data-fav]');
  if (f) { e.stopPropagation(); return toggleFav(f.dataset.fav); }
  const c = e.target.closest('.card'); if (c) openMonument(c.dataset.id);
});
$('#grid').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('card')) openMonument(e.target.dataset.id); });

async function toggleFav(id) {
  if (!store.user()) { toast(t('need_login_fav')); return openAuth('login'); }
  try { const on = await store.toggleFav(id); on ? favs.add(id) : favs.delete(id); toast(on ? t('fav_added') : t('fav_removed')); renderGrid(); renderCabinet(); syncMonFav(); }
  catch (err) { toast(err.message); }
}

/* ================= monument modal ================= */
let curMon = null, rating = 5;
$('#stars').innerHTML = [1, 2, 3, 4, 5].map(n => `<button type="button" data-r="${n}">★</button>`).join('');
const paintStars = () => $$('#stars button').forEach(b => b.classList.toggle('on', +b.dataset.r <= rating));
$('#stars').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { rating = +b.dataset.r; paintStars(); } });
paintStars();
function syncMonFav() { if (curMon) $('#monFav').textContent = favs.has(curMon.id) ? t('fav_in') : t('fav_add'); }
function openMonument(id) {
  const m = byId[id]; curMon = m;
  $('#monMeta').textContent = `${L(m.place)} · ${L(m.century)}${m.unesco ? ' · ' + t('unesco') : ''}`;
  $('#monTitle').textContent = L(m.name); $('#monText').textContent = L(m.text); syncMonFav();
  openModal($('#monModal')); loadReviews();
}
async function loadReviews() {
  const ul = $('#reviewList'); ul.innerHTML = `<li class="muted">${esc(t('loading'))}</li>`;
  try {
    const list = await store.reviews(curMon.id);
    $('#monAvg').textContent = list.length ? `· ${(list.reduce((a, r) => a + r.rating, 0) / list.length).toFixed(1)} ★ (${list.length})` : '';
    ul.innerHTML = list.length ? list.map(r => `<li><div class="who"><span>${esc(r.author_name || t('traveler'))}</span><span>${'★'.repeat(r.rating)}</span></div>${esc(r.text)}</li>`).join('')
      : `<li class="muted">${esc(t('no_reviews'))}</li>`;
  } catch (err) { ul.innerHTML = `<li class="muted">${esc(err.message)}</li>`; }
}
$('#monFav').onclick = () => curMon && toggleFav(curMon.id);
$('#monMap').onclick = () => { closeModal($('#monModal')); $('#map').scrollIntoView({ behavior: 'smooth' }); const m = curMon; ensureMap().then(api => api && api.focus(m.lat, m.lon, L(m.name))); };
$('#reviewForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!store.user()) { toast(t('need_login_rev')); return openAuth('login'); }
  const text = $('#reviewText').value.trim(); if (text.length < 3) return toast(t('review_more'));
  try { await store.addReview(curMon.id, rating, text); $('#reviewText').value = ''; toast(t('review_ok')); loadReviews(); renderCabinet(); }
  catch (err) { toast(err.message); }
});

/* ================= auth ================= */
let authMode = 'login';
function openAuth(mode = 'login') { setAuthMode(mode); $('#authMsg').textContent = ''; openModal($('#authModal')); setTimeout(() => $('#authForm [name=' + (mode === 'register' ? 'name' : 'email') + ']').focus(), 300); }
function setAuthMode(mode) {
  authMode = mode; $('.auth-box').classList.toggle('register', mode === 'register');
  $$('.auth-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === mode));
  $('#authSubmit').textContent = mode === 'register' ? t('create_btn') : t('login');
  $('#authTitle').textContent = mode === 'register' ? t('create_title') : t('welcome');
  $('#authForm [name=password]').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
}
$$('.auth-tabs button').forEach(b => b.onclick = () => setAuthMode(b.dataset.tab));
$('#modeNote').textContent = store.mode === 'demo' ? t('demo_note') : t('live_note');
$('#authBtn').onclick = async () => { if (store.user()) { await store.signOut(); toast(t('bye')); } else openAuth('login'); };
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target), msg = $('#authMsg'), btn = $('#authSubmit');
  btn.disabled = true; msg.textContent = '…';
  try {
    if (authMode === 'register') {
      const r = await store.signUp(f.get('name').trim(), f.get('email').trim(), f.get('password'));
      if (r.needsConfirm) { msg.textContent = t('check_email'); btn.disabled = false; return; }
      toast(t('created'));
    } else { await store.signIn(f.get('email').trim(), f.get('password')); toast(t('logged_in')); }
    e.target.reset(); closeModal($('#authModal'));
  } catch (err) { msg.textContent = /password/i.test(err.message) ? t('err_pw') : err.message; }
  btn.disabled = false;
});

/* ================= cabinet ================= */
async function renderCabinet() {
  const body = $('#cabinetBody'), u = store.user();
  if (!u) {
    body.innerHTML = `<div class="panel cta-panel"><h3>${esc(t('cab_create'))}</h3><p class="muted">${esc(t('cab_lead'))}</p>
      <button class="btn btn-solid" data-open-auth="register">${esc(t('register'))}</button></div>
      <div class="panel"><h3>${esc(t('cab_await'))}</h3><ul><li>${esc(t('cab_f'))}</li><li>${esc(t('cab_r'))}</li><li>${esc(t('cab_ro'))}</li></ul></div>`;
    $$('[data-open-auth]', body).forEach(b => b.onclick = () => openAuth(b.dataset.openAuth));
    return;
  }
  let fl = [], rv = [], rt = [];
  try { [fl, rv, rt] = await Promise.all([store.favorites(), store.myReviews(), store.routes()]); } catch (err) { toast(err.message); }
  favs = new Set(fl);
  body.innerHTML = `
    <div class="panel"><p class="kicker">${esc(t('profile'))}</p><h3>${esc(t('hello', { n: u.name }))}</h3><p class="muted">${esc(u.email)}</p>
      <p class="muted" style="margin-top:12px">${esc(t('counts', { f: fl.length, r: rv.length, ro: rt.length }))}</p></div>
    <div class="panel"><h3>${esc(t('favs'))}</h3>${fl.length ? `<ul>${fl.map(id => byId[id] ? `<li><a href="#monuments" data-open-mon="${id}">${esc(L(byId[id].name))}</a><button data-unfav="${id}" aria-label="✕">✕</button></li>` : '').join('')}</ul>` : `<p class="empty">${esc(t('favs_empty'))}</p>`}</div>
    <div class="panel"><h3>${esc(t('routes'))}</h3>
      ${rt.length ? `<ul>${rt.map(r => `<li><span><b>${esc(r.title)}</b><br><span class="muted">${(r.monument_ids || []).map(i => byId[i] && L(byId[i].name)).filter(Boolean).map(esc).join(' → ')}</span></span><button data-delroute="${r.id}" aria-label="✕">✕</button></li>`).join('')}</ul>` : `<p class="empty">${esc(t('routes_empty'))}</p>`}
      <form class="route-form" id="routeForm"><input name="title" placeholder="${esc(t('route_ph'))}" maxlength="60" required>
        <div class="route-picks">${MONUMENTS.map(m => `<label><input type="checkbox" value="${m.id}"><span>${esc(L(m.name))}</span></label>`).join('')}</div>
        <button class="btn btn-solid small" type="submit">${esc(t('route_create'))}</button></form></div>`;
  $$('[data-unfav]', body).forEach(b => b.onclick = () => toggleFav(b.dataset.unfav));
  $$('[data-open-mon]', body).forEach(a => a.onclick = (e) => { e.preventDefault(); openMonument(a.dataset.openMon); });
  $$('[data-delroute]', body).forEach(b => b.onclick = async () => { await store.delRoute(b.dataset.delroute); toast(t('route_del')); renderCabinet(); });
  $('#routeForm').onsubmit = async e => {
    e.preventDefault(); const ids = $$('.route-picks input:checked', e.target).map(i => i.value);
    if (ids.length < 2) return toast(t('route_min'));
    try { await store.addRoute(e.target.title.value.trim(), ids); toast(t('route_ok')); renderCabinet(); } catch (err) { toast(err.message); }
  };
  renderGrid();
}
store.onChange(u => { $('#authBtn').textContent = u ? t('logout') : t('login'); renderCabinet(); });
$('#authBtn').textContent = store.user() ? t('logout') : t('login');
renderGrid(); renderCabinet();

/* ================= map (lazy) ================= */
let mapPromise = null;
function ensureMap() { if (!mapPromise) mapPromise = window.maplibregl ? initMap($('#map')).catch(err => { console.error(err); $('#mapList').textContent = err.message; return null; }) : Promise.resolve(null); return mapPromise; }
new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { ensureMap(); o.disconnect(); } }, { rootMargin: '600px' }).observe($('#map'));

/* ================= photos: hero slideshow + chapter backdrops ================= */
const HERO = ['gergeti', 'mestia', 'kazbegi', 'svetitskhoveli', 'ananuri', 'tbilisi'].filter(k => PHOTOS[k]);
const heroMedia = $('#heroMedia'), heroCap = $('#heroCap');
heroMedia.innerHTML = HERO.map((k, i) => `<img alt="" decoding="async" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} src="${PHOTOS[k].src}">`).join('');
let heroI = 0;
const heroShow = (i) => {
  const imgs = heroMedia.children; if (!imgs.length) return;
  [...imgs].forEach((im, k) => im.classList.toggle('on', k === i));
  const k = HERO[i]; heroCap.textContent = photoCredit(k); heroCap.href = PHOTOS[k].page;
};
heroShow(0);
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => { if (!document.hidden) heroShow(heroI = (heroI + 1) % HERO.length); }, 7000);
$$('.chapter[data-photo]').forEach(sec => {
  const k = sec.dataset.photo, ph = PHOTOS[k]; if (!ph) return;
  sec.querySelector('.ch-photo').style.backgroundImage = `url("${ph.src}")`;
  const cap = sec.querySelector('.ch-cap'); cap.textContent = photoCredit(k); cap.href = ph.page;
});

$$('.split').forEach(el => {
  const walk = (node) => [...node.childNodes].map(n => {
    if (n.nodeType === 3) return n.textContent.split(/(\s+)/).map(w => /^\s+$/.test(w) ? w : `<span class="w">${[...w].map(c => `<span class="ch">${esc(c)}</span>`).join('')}</span>`).join('');
    if (n.nodeName === 'BR') return '<br>';
    return `<${n.nodeName.toLowerCase()}>${walk(n)}</${n.nodeName.toLowerCase()}>`;
  }).join('');
  el.innerHTML = walk(el);
});

addEventListener('scroll', () => $('.nav').classList.toggle('scrolled', scrollY > 40), { passive: true });

function intro() {
  const g = window.gsap;
  if (!g) { $('#loader').remove(); return; }
  g.registerPlugin(ScrollTrigger);
  const num = { v: 0 };
  g.timeline()
    .to(num, { v: 100, duration: 1.6, ease: 'power2.inOut', onUpdate: () => { $('.loader-num').textContent = Math.round(num.v); $('.loader-bar span').style.width = num.v + '%'; } })
    .to('.loader-letter', { scale: 1.6, opacity: 0, duration: .6, ease: 'power3.in' }, '-=.2')
    .to('#loader', { clipPath: 'inset(0 0 100% 0)', duration: .9, ease: 'power4.inOut' }, '-=.2')
    .set('#loader', { display: 'none' })
    .from('.hero h1 .ch', { yPercent: 110, rotate: 6, duration: 1, stagger: .025, ease: 'power4.out' }, '-=.35')
    .from('.hero .reveal', { y: 30, opacity: 0, duration: .9, stagger: .12, ease: 'power3.out' }, '-=.7')
    .from('.nav', { y: -40, opacity: 0, duration: .7 }, '-=.8');
  $$('.split').forEach(h => { if (h.closest('.hero')) return;
    g.from($$('.ch', h), { yPercent: 110, duration: .9, stagger: .018, ease: 'power4.out', scrollTrigger: { trigger: h, start: 'top 85%' } }); });
  $$('.reveal').forEach(el => { if (el.closest('.hero')) return;
    g.from(el, { y: 30, opacity: 0, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }); });
  $$('.chapter-card').forEach(c => g.from(c, { clipPath: 'inset(100% 0 0 0 round 22px)', duration: 1.1, ease: 'power4.out', scrollTrigger: { trigger: c, start: 'top 80%' } }));
  $$('.ch-photo').forEach(ph => g.fromTo(ph, { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: ph.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }));
  const track = $('#erasTrack');
  const dist = () => Math.max(0, track.scrollWidth - innerWidth);
  g.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.eras', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true } });
  g.from('.era', { y: 80, opacity: 0, stagger: .1, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.eras', start: 'top 70%' } });
  g.from('.map-wrap', { y: 60, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.map-wrap', start: 'top 85%' } });
  g.from('.footer-big', { yPercent: 40, opacity: 0, duration: 1.2, ease: 'power4.out', scrollTrigger: { trigger: '.footer', start: 'top 85%' } });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(intro); else addEventListener('load', intro);

/* ================= offline (PWA) ================= */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
const offBar = document.createElement('div'); offBar.className = 'offline-bar'; offBar.textContent = t('off_bar'); document.body.appendChild(offBar);
const net = async () => {
  let off = !navigator.onLine;
  if (off) { try { await fetch('https://tiles.openfreemap.org/planet?ping=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }); off = false; } catch { off = true; } }
  offBar.classList.toggle('on', off);
};
addEventListener('online', net); addEventListener('offline', net); net();

/* ================= catalogue of all places ================= */
let catStarted = false;
const startCatalog = () => {
  if (catStarted) return; catStarted = true;
  import('./catalog.js?v=58').then(m => m.initCatalog($('#monuments'), {
    openPlace: (i) => {
      const w = $('.map-wrap'); scrollTo({ top: w.getBoundingClientRect().top + scrollY - (innerWidth > 900 ? 76 : 70), behavior: 'smooth' });
      ensureMap().then(api => api && setTimeout(() => api.openIndex(i), 500));
    },
  })).catch(err => console.error('catalog', err));
};
new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { startCatalog(); o.disconnect(); } }, { rootMargin: '900px' }).observe($('#monuments'));

// content that loads later (catalogue cards, photos, the map) changes the page height:
// re-measure the scroll animations so the pinned "eras" strip and the chapter effects stay in the right place
{
  let lastH = 0, tm = 0;
  new ResizeObserver(() => {
    const h = document.documentElement.scrollHeight; if (Math.abs(h - lastH) < 40) return; lastH = h;
    clearTimeout(tm); tm = setTimeout(() => window.ScrollTrigger?.refresh(), 250);
  }).observe(document.querySelector('main'));
}
