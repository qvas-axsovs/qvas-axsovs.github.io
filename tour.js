// Side-panel features: ready-made routes, "near me", the century timeline, the traveller's passport, offline save.
import { t, LANG } from './i18n.js?v=58';
import { ROUTES } from './routes_data.js?v=58';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (o) => (o && (o[LANG] || o.en)) || '';
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

// ---------- passport (stored in this browser) ----------
const PK = 'geoarch-passport';
const keyOf = (p) => `${p.la.toFixed(5)},${p.lo.toFixed(5)}`;
export const passport = {
  read() { try { return JSON.parse(localStorage.getItem(PK)) || {}; } catch { return {}; } },
  has(p) { return !!this.read()[keyOf(p)]; },
  toggle(p) {
    const d = this.read(), k = keyOf(p);
    if (d[k]) delete d[k]; else d[k] = { at: Date.now() };
    try { localStorage.setItem(PK, JSON.stringify(d)); } catch { /* storage off */ }
    window.dispatchEvent(new CustomEvent('passport-change', { detail: { p, on: !!d[k] } }));
    return !!d[k];
  },
};

export function setupTour(api) {
  const { map, ml, places, nm, CATS, root } = api;
  const $ = (s) => root.querySelector(s);
  const byKey = new Map(places.map((p, i) => [keyOf(p), i]));

  // ---- tabs ----
  const tabs = $('.side-tabs');
  const show = (name) => {
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    root.querySelectorAll('.side-pane').forEach(p => { p.hidden = p.dataset.pane !== name; });
    if (name === 'pass') renderPassport();
    if (name !== 'routes') clearRoute();
  };
  tabs.addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });

  // ---- near me ----
  const nearBtn = $('#nearMe');
  nearBtn.onclick = () => {
    if (!navigator.geolocation) { nearBtn.textContent = t('near_err'); return; }
    nearBtn.classList.add('busy'); nearBtn.textContent = t('near_wait');
    navigator.geolocation.getCurrentPosition(pos => {
      nearBtn.classList.remove('busy'); nearBtn.textContent = t('near_me');
      const { latitude: la, longitude: lo } = pos.coords;
      api.setRadius(10);
      api.selectPoint(la, lo, t('near_here'));
      meMarker.setLngLat([lo, la]).addTo(map);
    }, () => { nearBtn.classList.remove('busy'); nearBtn.textContent = t('near_err'); setTimeout(() => nearBtn.textContent = t('near_me'), 4000); },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  const meEl = document.createElement('div'); meEl.className = 'me-dot';
  const meMarker = new ml.Marker({ element: meEl });

  // ---- century timeline ----
  const STOPS = [-40, -20, -10, -5, -1, ...Array.from({ length: 21 }, (_, i) => i + 1), 99];
  const tlR = $('#tlRange'), tlV = $('#tlVal'), tlPlay = $('#tlPlay');
  tlR.max = STOPS.length - 1; tlR.value = STOPS.length - 1;
  const label = (v) => {
    if (v === 99) return t('tl_all');
    if (v <= -10) return t('tl_mil', { m: -v / 10 });
    if (v < 0) return t('tl_bc', { c: ROMAN[-v] });
    return t('tl_upto', { c: LANG === 'en' ? ROMAN[v] : ROMAN[v] });
  };
  const applyTl = () => {
    const v = STOPS[+tlR.value]; tlV.textContent = label(v);
    api.setExtraFilter(v === 99 ? null : ['<=', ['get', 'cy'], v]);
    root.querySelector('.map-time').classList.toggle('active', v !== 99);
  };
  tlR.addEventListener('input', () => { stopPlay(); applyTl(); });
  let playT = 0;
  const stopPlay = () => { clearInterval(playT); playT = 0; tlPlay.textContent = '▶'; };
  tlPlay.onclick = () => {
    if (playT) return stopPlay();
    if (+tlR.value >= STOPS.length - 1) tlR.value = 0;
    tlPlay.textContent = '❚❚'; applyTl();
    playT = setInterval(() => { if (+tlR.value >= STOPS.length - 1) return stopPlay(); tlR.value = +tlR.value + 1; applyTl(); }, 900);
  };
  applyTl();

  // ---- routes ----
  map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8, 'line-opacity': .85 } });
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4.5 } });
  let stopMarkers = [], routeJob = 0;
  function clearRoute() { stopMarkers.forEach(m => m.remove()); stopMarkers = []; map.getSource('route')?.setData({ type: 'FeatureCollection', features: [] }); routeJob++; }

  const routeCache = new Map();
  async function legGeometry(stops, mode) {
    const key = mode + stops.map(p => keyOf(p)).join(';'); if (routeCache.has(key)) return routeCache.get(key);
    const coords = stops.map(p => `${p.lo},${p.la}`).join(';');
    const base = mode === 'foot' ? 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/' : 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
    const job = fetch(`${base}${coords}?overview=full&geometries=geojson`).then(r => r.json()).then(j => {
      const r = j.routes?.[0]; if (!r) throw 0;
      return { geom: r.geometry, km: r.distance / 1000, min: r.duration / 60 };
    }).catch(() => ({ geom: { type: 'LineString', coordinates: stops.map(p => [p.lo, p.la]) }, km: null, min: null }));
    routeCache.set(key, job); return job;
  }
  const fmtDur = (m) => m == null ? '' : m < 60 ? t('r_min', { m: Math.round(m) }) : t('r_h', { h: Math.floor(m / 60), m: Math.round(m % 60) });

  const list = $('#routeList');
  list.innerHTML = `<p class="muted small-text">${esc(t('r_intro'))}</p>` + ROUTES.map(r => `
    <article class="route-card" data-r="${r.id}" style="--rc:${r.color}">
      <header><b>${esc(L(r.t))}</b><span>${esc(t('r_days', { n: r.days.length }))} · ${esc(r.mode === 'foot' ? t('r_foot') : t('r_car'))}</span></header>
      <p>${esc(L(r.d))}</p>
      <div class="route-body" hidden></div>
    </article>`).join('');
  list.addEventListener('click', async e => {
    const stopEl = e.target.closest('[data-stop]');
    if (stopEl) { e.stopPropagation(); const p = places[+stopEl.dataset.stop]; api.openPlace(p); map.flyTo({ center: [p.lo, p.la], zoom: 14.5, pitch: 60, duration: 1800 }); return; }
    const card = e.target.closest('.route-card'); if (!card) return;
    const r = ROUTES.find(x => x.id === card.dataset.r);
    const open = card.classList.toggle('open');
    list.querySelectorAll('.route-card').forEach(c => { if (c !== card) { c.classList.remove('open'); c.querySelector('.route-body').hidden = true; } });
    const body = card.querySelector('.route-body'); body.hidden = !open;
    if (!open) return clearRoute();
    api.stopTour();
    clearRoute(); const job = routeJob;
    let n = 0; const all = [];
    body.innerHTML = r.days.map((day, di) => `<div class="route-day"><h6>${esc(t('r_day', { n: di + 1 }))} <em data-leg="${di}"></em></h6><ol>` +
      day.map(i => { n++; const p = places[i]; all.push(p); return `<li data-stop="${i}"><i style="background:${r.color}">${n}</i><span>${esc(nm(p.n))}</span>${passport.has(p) ? '<b class="stamp-mini">✓</b>' : ''}</li>`; }).join('') + '</ol></div>').join('');
    // numbered markers
    all.forEach((p, k) => {
      const el = document.createElement('button'); el.className = 'route-pin'; el.style.background = r.color; el.textContent = k + 1;
      el.onclick = (ev) => { ev.stopPropagation(); api.openPlace(p); };
      stopMarkers.push(new ml.Marker({ element: el }).setLngLat([p.lo, p.la]).addTo(map));
    });
    const b = all.reduce((bb, p) => bb.extend([p.lo, p.la]), new ml.LngLatBounds([all[0].lo, all[0].la], [all[0].lo, all[0].la]));
    map.fitBounds(b, { padding: { top: 70, bottom: 70, left: 70, right: innerWidth > 900 ? 420 : 70 }, pitch: 45, duration: 1600, maxZoom: 14 });
    // road geometry per day (connect days through the last stop of the previous day)
    const feats = [];
    for (let di = 0; di < r.days.length; di++) {
      const stops = (di ? [places[r.days[di - 1].at(-1)]] : []).concat(r.days[di].map(i => places[i]));
      const g = stops.length > 1 ? await legGeometry(stops, r.mode) : null;
      if (job !== routeJob) return;
      if (g) {
        feats.push({ type: 'Feature', properties: { color: r.color }, geometry: g.geom });
        map.getSource('route').setData({ type: 'FeatureCollection', features: feats });
        const em = body.querySelector(`[data-leg="${di}"]`);
        if (em && g.km != null) em.textContent = `${Math.round(g.km)} ${t('km')} · ${fmtDur(g.min)}`;
      }
    }
  });

  // ---- passport ----
  const sync = () => { const d = passport.read(); for (const k of Object.keys(d)) { const i = byKey.get(k); if (i != null) map.setFeatureState({ source: 'places', id: i }, { visited: true }); } };
  sync();
  window.addEventListener('passport-change', (e) => {
    const i = byKey.get(keyOf(e.detail.p)); if (i != null) map.setFeatureState({ source: 'places', id: i }, { visited: e.detail.on });
    if (!root.querySelector('[data-pane="pass"]').hidden) renderPassport();
  });
  const BADGES = [
    { id: 'first', test: (v) => v.length >= 1, icon: '🌱' },
    { id: 'ten', test: (v) => v.length >= 10, icon: '🧭' },
    { id: 'fifty', test: (v) => v.length >= 50, icon: '🏔️' },
    { id: 'churches', test: (v) => v.filter(p => p.c === 'church').length >= 10, icon: '⛪' },
    { id: 'forts', test: (v) => v.filter(p => p.c === 'fort').length >= 5, icon: '🏰' },
    { id: 'nature', test: (v) => v.filter(p => ['waterfall', 'lake', 'canyon', 'cave', 'nature'].includes(p.c)).length >= 5, icon: '💧' },
    { id: 'unesco', test: (v) => v.filter(p => p.wh).length >= 3, icon: '🏛️' },
    { id: 'ancient', test: (v) => v.some(p => p.dt && ((p.dt.c && Math.min(...p.dt.c) <= 6) || p.dt.m)), icon: '🏺' },
  ];
  function renderPassport() {
    const d = passport.read();
    const v = Object.entries(d).map(([k, x]) => ({ p: places[byKey.get(k)], at: x.at })).filter(x => x.p).sort((a, b) => b.at - a.at);
    const vp = v.map(x => x.p);
    const cats = {}; vp.forEach(p => { cats[p.c] = (cats[p.c] || 0) + 1; });
    $('#passport').innerHTML = `
      <div class="pass-cover"><span class="pass-emblem">ქ</span><div><b>${esc(t('pass_title'))}</b><small>${esc(t('pass_count', { n: v.length }))}</small></div></div>
      <div class="pass-badges">${BADGES.map(b => { const ok = b.test(vp); return `<div class="badge${ok ? ' ok' : ''}" title="${esc(t('bd_' + b.id))}"><span>${b.icon}</span><small>${esc(t('bd_' + b.id))}</small></div>`; }).join('')}</div>
      ${Object.keys(cats).length ? `<p class="pass-cats">${Object.entries(cats).map(([c, n]) => `<span><i style="background:${CATS[c]}"></i>${esc(t('c_' + c))} ${n}</span>`).join('')}</p>` : ''}
      ${v.length ? `<div class="stamps">${v.map(x => `<button class="stamp" data-k="${keyOf(x.p)}" style="--sc:${CATS[x.p.c]}"><b>${esc(nm(x.p.n))}</b><small>${new Date(x.at).toLocaleDateString(LANG)}</small></button>`).join('')}</div>`
        : `<p class="muted">${esc(t('pass_empty'))}</p>`}
      <p class="muted small-text">${esc(t('pass_note'))}</p>
      <div class="offline-box"><b>${esc(t('off_title'))}</b><p class="muted small-text">${esc(t('off_text'))}</p><button class="btn btn-ghost small" id="offSave">${esc(t('off_btn'))}</button><span id="offState" class="small-text"></span></div>`;
    $('#passport').querySelectorAll('.stamp').forEach(b => b.onclick = () => { const p = places[byKey.get(b.dataset.k)]; api.openPlace(p); map.flyTo({ center: [p.lo, p.la], zoom: 14, pitch: 55, duration: 1800 }); });
    $('#offSave').onclick = saveOffline;
  }

  // ---- offline: save the visible area's map tiles + data into the service-worker cache ----
  async function saveOffline() {
    const st = $('#offState');
    if (!('caches' in window) || !navigator.serviceWorker?.controller) { st.textContent = ' ' + t('off_nosw'); return; }
    const b = map.getBounds(); const z0 = Math.max(6, Math.floor(map.getZoom()) - 1), z1 = Math.min(14, z0 + 5);
    const tj = await fetch('https://tiles.openfreemap.org/planet').then(r => r.json()).catch(() => null);
    const vt = tj?.tiles?.[0];
    const urls = [];
    const lon2x = (lo, z) => Math.floor((lo + 180) / 360 * 2 ** z), lat2y = (la, z) => Math.floor((1 - Math.log(Math.tan(la * Math.PI / 180) + 1 / Math.cos(la * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
    for (let z = z0; z <= z1; z++) {
      const x0 = lon2x(b.getWest(), z), x1 = lon2x(b.getEast(), z), y0 = lat2y(b.getNorth(), z), y1 = lat2y(b.getSouth(), z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        if (vt) urls.push(vt.replace('{z}', z).replace('{x}', x).replace('{y}', y));
        if (z <= 12) urls.push(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
      }
    }
    const shards = new Set(); places.forEach(p => { if (p.h && p.hd && b.contains([p.lo, p.la])) shards.add(`data/desc/${p.h % 256}.json?v=20261121b`); });
    const all = [...urls.slice(0, 2500), ...shards];
    const cache = await caches.open('geoarch-tiles');
    let done = 0;
    const work = async () => { while (all.length) { const u = all.shift(); try { const r = await fetch(u, { mode: u.startsWith('http') ? 'cors' : 'same-origin' }); if (r.ok) await (u.startsWith('data/') ? caches.open('geoarch-data') : Promise.resolve(cache)).then(c => c.put(u, r)); } catch { /* skip */ } done++; st.textContent = ` ${done}…`; } };
    st.textContent = ' 0…';
    await Promise.all(Array.from({ length: 6 }, work));
    st.textContent = ' ' + t('off_done', { n: done });
  }
}
