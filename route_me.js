// "How to get there": your position → the place, by car and on foot, with distance and travel time,
// drawn on the site's own map (OSRM routing from routing.openstreetmap.de).
import { t } from './i18n.js?v=58';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDur = (m) => {
  if (m == null) return '';
  if (m < 60) return t('r_min', { m: Math.max(1, Math.round(m)) });
  if (m < 60 * 24) return t('r_h', { h: Math.floor(m / 60), m: Math.round(m % 60) });
  return t('rt_days', { d: Math.floor(m / 1440), h: Math.round((m % 1440) / 60) });
};
const fmtKm = (km) => km < 1 ? `${Math.round(km * 1000)} ${t('pv_m')}` : `${km < 10 ? km.toFixed(1) : Math.round(km)} ${t('km')}`;

let me = null, meAt = 0;
export function locate() {
  if (me && Date.now() - meAt < 120000) return Promise.resolve(me);
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('nogeo'));
    navigator.geolocation.getCurrentPosition(
      (p) => { me = [p.coords.latitude, p.coords.longitude]; meAt = Date.now(); res(me); },
      (e) => rej(e), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}
async function osrm(mode, a, b) {
  const base = mode === 'foot' ? 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/' : 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
  const j = await fetch(`${base}${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`).then(r => r.json());
  const r = j.routes?.[0]; if (!r) throw new Error('noroute');
  return { geom: r.geometry, km: r.distance / 1000, min: r.duration / 60 };
}

const COLORS = { car: '#8fc8ea', foot: '#f5c84c' };
export function createMyRoute(map) {
  const ml = window.maplibregl;
  let marker = null, data = null, mode = 'car';
  const ensure = () => {
    if (map.getSource('myroute')) return;
    map.addSource('myroute', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'myroute-casing', type: 'line', source: 'myroute', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0b0e12', 'line-width': 9, 'line-opacity': .7 } });
    map.addLayer({ id: 'myroute-car', type: 'line', source: 'myroute', filter: ['==', ['get', 'mode'], 'car'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.car, 'line-width': 5 } });
    map.addLayer({ id: 'myroute-foot', type: 'line', source: 'myroute', filter: ['==', ['get', 'mode'], 'foot'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.foot, 'line-width': 5, 'line-dasharray': [1, 1.8] } });
  };
  function draw(m) {
    mode = m; if (!data?.[m]) return;
    ensure();
    map.getSource('myroute').setData({ type: 'Feature', properties: { color: COLORS[m], mode: m }, geometry: data[m].geom });
    const c = data[m].geom.coordinates, b = new ml.LngLatBounds(c[0], c[0]); c.forEach(x => b.extend(x));
    const wide = innerWidth > 900;
    // the map already keeps the left search panel out of its padding; leave room for the place card on the right
    const w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
    const pad = wide ? { top: 70, bottom: 70, left: 40, right: Math.min(440, w - 386 - 160) } : { top: 50, bottom: 50, left: 30, right: 30 };
    try { map.fitBounds(b, { padding: pad, pitch: 35, bearing: 0, duration: 1800, maxZoom: 15 }); } catch { map.fitBounds(b, { padding: 20, duration: 1200 }); }
    void h;
  }
  function clear() {
    data = null; marker?.remove(); marker = null;
    map.getSource('myroute')?.setData({ type: 'FeatureCollection', features: [] });
  }
  // fills `box` with the route panel for place p
  async function show(box, p) {
    box.hidden = false;
    box.innerHTML = `<p class="rt-status">${esc(t('rt_locating'))}</p>`;
    let from;
    try { from = await locate(); }
    catch (e) { box.innerHTML = `<p class="rt-status err">${esc(e?.code === 1 ? t('rt_denied') : t('rt_nogeo'))}</p>`; return; }
    if (!marker) { const d = document.createElement('div'); d.className = 'me-dot'; marker = new ml.Marker({ element: d }); }
    marker.setLngLat([from[1], from[0]]).addTo(map);
    box.innerHTML = `<p class="rt-status">${esc(t('rt_calc'))}</p>`;
    const [car, foot] = await Promise.all([osrm('car', from, [p.la, p.lo]).catch(() => null), osrm('foot', from, [p.la, p.lo]).catch(() => null)]);
    if (!car && !foot) { box.innerHTML = `<p class="rt-status err">${esc(t('rt_fail'))}</p>`; return; }
    data = { car, foot };
    const btn = (m, r, icon) => r ? `<button class="rt-mode" data-m="${m}" style="--rc:${COLORS[m]}"><b>${icon} ${esc(fmtDur(r.min))}</b><span>${esc(fmtKm(r.km))} · ${esc(t(m === 'car' ? 'rt_car' : 'rt_foot'))}</span></button>` : '';
    box.innerHTML = `<div class="rt-modes">${btn('car', car, '🚗')}${btn('foot', foot, '🚶')}</div>
      <p class="rt-note">${esc(t('rt_note'))} <a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${from[0]},${from[1]}&destination=${p.la},${p.lo}&travelmode=${'driving'}">${esc(t('rt_google'))}</a></p>`;
    const pick = (m) => { box.querySelectorAll('.rt-mode').forEach(b => b.classList.toggle('on', b.dataset.m === m)); draw(m); };
    box.querySelector('.rt-modes').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) pick(b.dataset.m); };
    pick(car && (!foot || foot.km > 3) ? 'car' : 'foot');
  }
  return { show, clear };
}
