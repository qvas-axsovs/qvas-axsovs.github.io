import { t, LANG } from './i18n.js?v=60';
import { createPlaceView, autoGuide, setAutoGuide } from './placeview.js?v=60';
import { createGuide } from './guide.js?v=60';
import { localizeNames } from './names.js?v=60';
import { setupTour } from './tour.js?v=60';
export const DATA_V = '20261121b';

export const CATS = {
  church: '#e8b75a', fort: '#e0765c', arch: '#c2a585', monument: '#aab6c2', waterfall: '#4fc3f7', lake: '#6f9cf0', cave: '#b192e6',
  canyon: '#e39b5f', peak: '#95a3ad', view: '#f07aa8', museum: '#7fd18c', nature: '#5cc28a', spring: '#4fd6c8', sight: '#f5c84c',
};
const CAT_ORDER = ['church', 'fort', 'arch', 'monument', 'waterfall', 'lake', 'cave', 'canyon', 'peak', 'view', 'museum', 'nature', 'spring', 'sight'];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function firstCentury(dt) {
  if (!dt) return 99;
  if (dt.y) return Math.ceil(dt.y[0] / 100);
  if (dt.m) return -10 * Math.max(...dt.m);
  if (dt.c) return dt.bc ? -Math.max(...dt.c) : Math.min(...dt.c);
  return 99;
}
const nm = (n) => (n && (n[LANG] || n.en || n.ka)) || '';
const sub = (n) => { const a = nm(n), b = n && n.ka; return b && b !== a ? b : ''; };
function dist(a, b, c, d) { const R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r; const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function circlePoly(lat, lon, km, n = 96) {
  const out = []; for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; out.push([lon + (km / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)]); }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [out] }, properties: {} };
}
const closeRing = (r) => (r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1]) ? r : [...r, r[0]];


// Night basemap: turn OpenFreeMap "liberty" into a dark map by remapping every colour's lightness
// (land and roads go dark, labels go light), keeping a little of the original hue.
function parseColor(c) {
  if (typeof c !== 'string') return null;
  let m = c.match(/^#([0-9a-f]{3,8})$/i);
  if (m) { let h = m[1]; if (h.length <= 4) h = [...h].map(x => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); return rgb2hsl((n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1); }
  m = c.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i);
  if (m) return rgb2hsl(+m[1], +m[2], +m[3], m[4] != null ? +m[4] : 1);
  m = c.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+([\d.]+))?\s*\)$/i);
  if (m) return { h: +m[1], s: +m[2] / 100, l: +m[3] / 100, a: m[4] != null ? +m[4] : 1 };
  return null;
}
function rgb2hsl(r, g, b, a) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return { h, s, l, a };
}
function darkenColors(v, prop) {
  if (Array.isArray(v)) return v.map(x => darkenColors(x, prop));
  const c = parseColor(v); if (!c) return v;
  let l, s = c.s * .55;
  if (/text-color/.test(prop)) l = .92 - c.l * .35;                 // dark labels → light
  else if (/halo/.test(prop)) { l = .07; s = .1; }                  // light halos → dark
  else if (c.h >= 180 && c.h <= 250 && c.s > .2) { l = .1 + (1 - c.l) * .12; s = Math.min(.45, c.s * .6); } // water: deep blue
  else l = .085 + (1 - c.l) * .3 + (c.l > .97 ? .1 : 0);             // land dark; white roads become a lighter grey line
  return `hsla(${c.h.toFixed(0)}, ${(s * 100).toFixed(0)}%, ${(Math.min(.95, l) * 100).toFixed(0)}%, ${c.a})`;
}

// Basemap: OpenFreeMap "liberty" (roads, rivers, villages, 3D buildings), with commercial POIs and
// de-facto borders removed, and labels switched to the visitor's language.
async function loadStyle() {
  let style;
  try { style = await fetch(STYLE_URL).then(r => { if (!r.ok) throw 0; return r.json(); }); }
  catch { return { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e9e4da' } }] }; }
  const drop = (id) => /^poi_|^boundary_|^label_country|^label_state|^label_city|^label_town|^highway-shield|^road_shield/.test(id);
  const label = ['coalesce', ['get', 'name:' + LANG], LANG === 'ka' ? ['get', 'name'] : ['get', 'name:latin'], ['get', 'name']];
  style.layers = style.layers.filter(l => !drop(l.id)).map(l => {
    if (l.layout && l.layout['text-field'] && JSON.stringify(l.layout['text-field']).includes('name')) l.layout['text-field'] = label;
    if (l.paint) for (const [k, v] of Object.entries(l.paint)) if (/color$/.test(k)) l.paint[k] = darkenColors(v, k);
    return l;
  });
  return style;
}

export async function initMap(root) {
  const ml = window.maplibregl;
  const [data, borders, style] = await Promise.all([fetch('data/places.json?v=' + DATA_V).then(r => r.json()), fetch('data/borders.json?v=' + DATA_V).then(r => r.json()), loadStyle()]);
  const { places, cities } = data;
  localizeNames(places);
  const active = new Set(CAT_ORDER.filter(c => c !== 'peak'));
  let radius = 25, center = null, centerLabel = '', is3d = true;

  root.querySelector('#mapCats').innerHTML = CAT_ORDER.map(c => `<button class="cat${active.has(c) ? ' on' : ''}" data-c="${c}"><i style="background:${CATS[c]}"></i>${esc(t('c_' + c))}</button>`).join('');
  root.querySelector('#mapCount').textContent = t('map_count', { n: places.length.toLocaleString() });

  const map = new ml.Map({
    container: root.querySelector('#leaf'), style, center: [43.45, 42.2], zoom: 6.7, pitch: 48, bearing: -10, minZoom: 5.6, maxZoom: 18, maxPitch: 78,
    maxBounds: [[37.5, 39.3], [49.5, 45.2]], attributionControl: { compact: true }, antialias: true, fadeDuration: 150,
  });
  map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new ml.ScaleControl({ maxWidth: 90 }), 'bottom-left');
  map.touchZoomRotate.enableRotation();

  // custom 3D / tour buttons
  const box = root.querySelector('.map-box');
  const ctr = document.createElement('div'); ctr.className = 'map-ctl';
  ctr.innerHTML = `<button data-k="3d" class="on">3D</button><button data-k="tour">${esc(t('map_tour'))}</button>`;
  box.appendChild(ctr);
  const hint = document.createElement('div'); hint.className = 'map-hint'; hint.textContent = t('map_tilt'); box.appendChild(hint);
  setTimeout(() => hint.classList.add('gone'), 7000);

  await new Promise(r => map.on('load', r));
  // on wide screens the search panel floats over the left of the map: keep the camera's centre in the visible part
  const fitPad = () => map.setPadding({ left: innerWidth > 900 ? 386 : 0, top: 0, right: 0, bottom: 0 });
  fitPad(); addEventListener('resize', fitPad);

  // terrain + hillshade + sky
  map.addSource('dem', { type: 'raster-dem', tiles: DEM_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Terrain: Mapzen / AWS Open Data' });
  map.addSource('dem-hs', { type: 'raster-dem', tiles: DEM_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
  const firstSymbol = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
  const firstRoad = map.getStyle().layers.find(l => /^(tunnel_|road_|aeroway_)/.test(l.id))?.id || firstSymbol;
  map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem-hs', paint: { 'hillshade-exaggeration': .55, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#6f7f8c', 'hillshade-accent-color': '#1b232b' } }, firstRoad);
  // make the road network read clearly over the relief
  map.getStyle().layers.filter(l => l.type === 'line' && /^(road|bridge|tunnel)_(motorway|trunk|secondary|link|minor)/.test(l.id) && !/casing/.test(l.id)).forEach(l => {
    try { map.setPaintProperty(l.id, 'line-width', ['interpolate', ['exponential', 1.4], ['zoom'], 6, /motorway|trunk/.test(l.id) ? 1.6 : .5, 10, /motorway|trunk/.test(l.id) ? 3.2 : 1.4, 16, /motorway|trunk/.test(l.id) ? 14 : 8]); } catch { /* keep style default */ }
  });
  const setTerrain = (on) => { map.setTerrain(on ? { source: 'dem', exaggeration: 1.5 } : null); if (map.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', on ? 'visible' : 'none'); };
  setTerrain(true);
  // keep the camera's pivot on the real ground after each flight (avoids looking past the target in mountains)
  map.on('moveend', () => {
    if (!map.getTerrain()) return;
    const e = map.queryTerrainElevation(map.getCenter());
    if (e != null && map.setCenterElevation && Math.abs(e - map.getCenterElevation()) > 15) map.setCenterElevation(e);
  });
  try { map.setSky({ 'sky-color': '#0b1a2b', 'horizon-color': '#2a3c52', 'fog-color': '#121a23', 'sky-horizon-blend': .6, 'horizon-fog-blend': .6, 'fog-ground-blend': .35, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 6, .8, 12, .2] }); } catch { /* older engines */ }

  // mask outside Georgia, Georgia border, occupied territories
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  map.addSource('mask', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [world, ...borders.georgia.map(closeRing)] } } });
  map.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': '#0b0e12', 'fill-opacity': .62 } }, firstSymbol);
  map.addSource('geo', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: borders.georgia.map(closeRing) } } });
  map.addLayer({ id: 'geo-glow', type: 'line', source: 'geo', paint: { 'line-color': '#8fc8ea', 'line-width': 8, 'line-opacity': .18, 'line-blur': 5 } });
  map.addLayer({ id: 'geo-line', type: 'line', source: 'geo', paint: { 'line-color': '#8fc8ea', 'line-width': 1.6 } });
  const occ = ['abkhazia', 'tskhinvali'].map(k => ({ type: 'Feature', properties: { k }, geometry: { type: 'Polygon', coordinates: borders[k].map(closeRing) } }));
  map.addSource('occ', { type: 'geojson', data: { type: 'FeatureCollection', features: occ } });
  map.addLayer({ id: 'occ-fill', type: 'fill', source: 'occ', paint: { 'fill-color': '#d2546f', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, .14, 11, .04] } }, firstSymbol);
  map.addLayer({ id: 'occ-line', type: 'line', source: 'occ', paint: { 'line-color': '#d2546f', 'line-width': 1.6, 'line-dasharray': [3, 2] } });
  [['abkhazia', [41.25, 43.25]], ['tskhinvali', [44.05, 42.5]]].forEach(([k, pos]) => {
    const el = document.createElement('div'); el.className = 'occ-label'; el.innerHTML = `<span>${esc(t(k))}</span><small>${esc(t('occupied'))}</small>`;
    const m = new ml.Marker({ element: el }).setLngLat(pos).addTo(map); m._minZ = 0; m._maxZ = 10.5; occMarkers.push(m);
  });

  // radius circle
  map.addSource('radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#8fc8ea', 'fill-opacity': .06 } }, firstSymbol);
  map.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#8fc8ea', 'line-width': 1.4, 'line-dasharray': [2, 1.5] } });

  // places
  const fc = { type: 'FeatureCollection', features: places.map((p, i) => ({ type: 'Feature', id: i, properties: { i, c: p.c, imp: (p.wh || p.sf || p.cu != null || p.w || p.wd || p.st === 2) ? 2 : 0, cy: firstCentury(p.dt) }, geometry: { type: 'Point', coordinates: [p.lo, p.la] } })) };
  map.addSource('places', { type: 'geojson', data: fc });
  const colorExpr = ['match', ['get', 'c'], ...CAT_ORDER.flatMap(c => [c, CATS[c]]), '#ffd27a'];
  map.addLayer({
    id: 'places', type: 'circle', source: 'places', layout: { 'circle-sort-key': ['get', 'imp'] },
    paint: {
      'circle-color': colorExpr,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['match', ['get', 'imp'], 2, 3.4, 1.1], 9, ['match', ['get', 'imp'], 2, 5.5, 2.4], 12, ['match', ['get', 'imp'], 2, 8, 5.5]],
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'visited'], false], '#d9ad55', '#0e1217'],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['boolean', ['feature-state', 'visited'], false], 2.5, ['match', ['get', 'imp'], 2, 1, .3]], 12, ['case', ['boolean', ['feature-state', 'visited'], false], 3.5, 1.8]],
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, ['match', ['get', 'imp'], 2, .95, .55], 10, .95],
      'circle-pitch-alignment': 'viewport', 'circle-pitch-scale': 'viewport',
    },
  });
  // names of places when zoomed in
  map.addLayer({
    id: 'places-label', type: 'symbol', source: 'places', minzoom: 12.5,
    layout: { 'text-field': ['get', 'nm'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 },
    paint: { 'text-color': '#e6ebef', 'text-halo-color': '#0e1217', 'text-halo-width': 1.4 },
  });
  fc.features.forEach(f => { f.properties.nm = nm(places[f.properties.i].n); });
  map.getSource('places').setData(fc);
  let extraFilter = null;
  const applyFilter = () => { const f = ['all', ['in', ['get', 'c'], ['literal', [...active]]], ...(extraFilter ? [extraFilter] : [])]; map.setFilter('places', f); map.setFilter('places-label', f); };
  applyFilter();

  let hovered = null;
  map.on('mousemove', 'places', e => { map.getCanvas().style.cursor = 'pointer'; if (hovered !== null) map.setFeatureState({ source: 'places', id: hovered }, { hover: false }); hovered = e.features[0].id; map.setFeatureState({ source: 'places', id: hovered }, { hover: true }); });
  map.on('mouseleave', 'places', () => { map.getCanvas().style.cursor = ''; if (hovered !== null) map.setFeatureState({ source: 'places', id: hovered }, { hover: false }); hovered = null; });
  map.on('click', e => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ['places'] })[0];
    if (hit) { openPopup(places[hit.properties.i]); return; }
    selectPoint(e.lngLat.lat, e.lngLat.lng, `${e.lngLat.lat.toFixed(3)}, ${e.lngLat.lng.toFixed(3)}`, false);
  });

  // city labels (DOM, our fonts, user's language)
  const cityMarkers = cities.map(c => {
    const el = document.createElement('div'); el.className = 'city-label' + (c.c ? ' big' : '') + (c.occ ? ' occ' : '');
    el.innerHTML = `<i></i><span>${esc(nm(c.n))}</span>`;
    el.addEventListener('click', ev => { ev.stopPropagation(); selectPoint(c.la, c.lo, nm(c.n), true); });
    const m = new ml.Marker({ element: el, anchor: 'left', offset: [-4, 0] }).setLngLat([c.lo, c.la]).addTo(map);
    m._minZ = c.c ? 0 : (c.p > 15000 ? 7.6 : 8.8); m._maxZ = 99; return m;
  });
  function syncMarkers() { const z = map.getZoom(); [...cityMarkers, ...occMarkers].forEach(m => { m.getElement().style.display = z >= m._minZ && z <= m._maxZ ? '' : 'none'; }); }
  map.on('zoom', syncMarkers); syncMarkers();

  // popups
  function linkFor(p) {
    const out = [];
    if (p.w) { const [lg, ...rest] = p.w.split(':'); out.push(`<a target="_blank" rel="noopener" href="https://${lg}.wikipedia.org/wiki/${encodeURIComponent(rest.join(':').replace(/ /g, '_'))}">${esc(t('map_wiki'))}</a>`); }
    else if (p.wd) out.push(`<a target="_blank" rel="noopener" href="https://www.wikidata.org/wiki/${p.wd}">Wikidata</a>`);
    out.push(`<a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${p.la}&mlon=${p.lo}#map=16/${p.la}/${p.lo}">${esc(t('map_osm'))}</a>`);
    out.push(`<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.la},${p.lo}">${esc(t('map_route'))}</a>`);
    return out.join('');
  }
  function popupHtml(p) {
    const d = center ? ` · ${dist(center[0], center[1], p.la, p.lo).toFixed(1)} ${esc(t('km'))}` : '';
    return `<div class="pp"><span class="pp-cat" style="--c:${CATS[p.c]}">${esc(t('c_' + p.c))}${p.e ? ` · ${p.e} m` : ''}${d}</span>
      <b>${esc(nm(p.n))}</b>${sub(p.n) ? `<em>${esc(sub(p.n))}</em>` : ''}${p.o ? `<small class="pp-occ">${esc(t(p.o === 'A' ? 'abkhazia' : 'tskhinvali'))} — ${esc(t('occupied'))}</small>` : ''}
      <div class="pp-links">${linkFor(p)}</div></div>`;
  }
  const nearestCity = (p) => { let best = null; for (const c of cities) { const d = dist(p.la, p.lo, c.la, c.lo); if (!best || d < best.d) best = { d, name: nm(c.n) }; } return best && best.d < 60 ? best : null; };
  const pv = createPlaceView(box, {
    map, CATS, nm, sub, nearestCity, muni: data.muni,
    onExplore(p) {
      stopTour(); if (!is3d) ctr.querySelector('[data-k="3d"]').click();
      map.flyTo({ center: [p.lo, p.la], zoom: 16.6, pitch: 72, bearing: map.getBearing() + 70, duration: 3200, essential: true });
      map.once('moveend', () => { touring = true; ctr.querySelector('[data-k=tour]').classList.add('on'); spin(); });
    },
  });
  const sel = new ml.Marker({ element: Object.assign(document.createElement('div'), { className: 'map-sel' }) });
  const curPlaces = places.filter(q => q.cu != null);
  function openPopup(p) {
    if (p.cu == null && p._cu === undefined) { const c = curPlaces.find(q => q.c === p.c && dist(p.la, p.lo, q.la, q.lo) < 0.5); p._cu = c ? c.cu : null; } sel.setLngLat([p.lo, p.la]).addTo(map); pv.open(p); }

  // select point → radius + list, cinematic fly
  function selectPoint(lat, lon, label, fly) {
    center = [lat, lon]; centerLabel = label;
    map.getSource('radius').setData(circlePoly(lat, lon, radius));
    pin.setLngLat([lon, lat]).addTo(map);
    if (fly) {
      stopTour();
      const zoom = Math.max(8, Math.min(13.5, Math.log2(40075 * Math.cos(lat * Math.PI / 180) * map.getContainer().clientWidth / (256 * radius * 2.6)) - 1.3));
      map.flyTo({ center: [lon, lat], zoom, pitch: is3d ? 58 : 0, bearing: is3d ? map.getBearing() - 25 : 0, duration: 2600, curve: 1.5, essential: true });
    }
    renderList();
  }
  const pinEl = document.createElement('div'); pinEl.className = 'map-pin';
  const pin = new ml.Marker({ element: pinEl });

  function renderList() {
    const el = root.querySelector('#mapList');
    if (!center) { el.innerHTML = `<p class="muted">${esc(t('map_pick'))}</p>`; return; }
    const near = places.map((p, i) => [p, i]).filter(([p]) => active.has(p.c)).map(([p, i]) => [p, i, dist(center[0], center[1], p.la, p.lo)]).filter(x => x[2] <= radius).sort((a, b) => a[2] - b[2]);
    const groups = {}; near.forEach(x => (groups[x[0].c] ||= []).push(x));
    el.innerHTML = `<div class="near-head"><b>${esc(centerLabel)}</b><span>${esc(t('map_near', { n: near.length, r: radius }))}</span></div>` +
      (near.length ? CAT_ORDER.filter(c => groups[c]).map(c => `<div class="near-group"><h5><i style="background:${CATS[c]}"></i>${esc(t('c_' + c))} <span>${groups[c].length}</span></h5><ul>` +
        groups[c].slice(0, 60).map(([p, i, d]) => `<li data-i="${i}"><span>${esc(nm(p.n))}${p.e ? ` <small>${p.e} m</small>` : ''}</span><em>${d.toFixed(1)} ${esc(t('km'))}</em></li>`).join('') + '</ul></div>').join('')
        : `<p class="muted">${esc(t('map_none'))}</p>`);
  }
  root.querySelector('#mapList').addEventListener('click', e => {
    const li = e.target.closest('li[data-i]'); if (!li) return; const p = places[+li.dataset.i];
    stopTour();
    openPopup(p);
    map.flyTo({ center: [p.lo, p.la], zoom: Math.max(map.getZoom(), 14.2), pitch: is3d ? 62 : 0, bearing: map.getBearing() + 30, duration: 2200, essential: true, padding: { right: innerWidth > 900 ? 380 : 0 } });
    if (innerWidth < 900) root.querySelector('#leaf').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  root.querySelector('#mapCats').addEventListener('click', e => {
    const b = e.target.closest('.cat'); if (!b) return; const c = b.dataset.c;
    active.has(c) ? active.delete(c) : active.add(c); b.classList.toggle('on'); applyFilter(); renderList();
  });
  const rIn = root.querySelector('#mapRadius'), rOut = root.querySelector('#mapRadiusVal');
  rIn.addEventListener('input', () => { radius = +rIn.value; rOut.textContent = `${radius} ${t('km')}`; if (center) map.getSource('radius').setData(circlePoly(center[0], center[1], radius)); renderList(); });
  rOut.textContent = `${radius} ${t('km')}`;

  // 3D toggle + slow orbit ("tour")
  let touring = false, raf = 0;
  function spin() { if (!touring) return; map.setBearing(map.getBearing() + 0.07); raf = requestAnimationFrame(spin); }
  function stopTour() { touring = false; cancelAnimationFrame(raf); ctr.querySelector('[data-k=tour]').classList.remove('on'); }
  ['mousedown', 'touchstart', 'wheel'].forEach(ev => map.getCanvas().addEventListener(ev, stopTour, { passive: true }));
  ctr.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k === '3d') {
      is3d = !is3d; b.classList.toggle('on', is3d); b.textContent = is3d ? '3D' : t('map_flat');
      setTerrain(is3d); map.easeTo({ pitch: is3d ? 55 : 0, bearing: is3d ? map.getBearing() : 0, duration: 1200 });
      if (!is3d) stopTour();
    } else {
      if (touring) { stopTour(); return; }
      if (!is3d) ctr.querySelector('[data-k="3d"]').click();
      touring = true; b.classList.add('on'); map.easeTo({ pitch: 62, duration: 900 }); setTimeout(spin, 900);
    }
  });

  // search (cities + places, any language)
  const sIn = root.querySelector('#mapSearch'), sOut = root.querySelector('#mapSuggest');
  const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const index = [...cities.map(c => ({ c: true, o: c })), ...places.map(p => ({ c: false, o: p }))].map(x => ({ ...x, k: norm(Object.values(x.o.n).join(' | ')) }));
  sIn.addEventListener('input', () => {
    const q = norm(sIn.value.trim()); if (q.length < 2) { sOut.innerHTML = ''; return; }
    const rank = (x) => x.c ? 100 : (x.o.cu != null ? 40 : 0) + (x.o.wh ? 30 : 0) + (x.o.w || x.o.wd ? 20 : 0) + (x.o.st === 2 ? 10 : 0) + (x.o.sf ? 10 : 0);
    // Georgian names change their stem in the genitive (სვეტიცხოველი → სვეტიცხოვლის), so also match a shortened stem
    const stem = /[ა-ჰ]/.test(q) && q.length > 6 ? q.slice(0, -3) : null;
    const hits = index.filter(x => x.k.includes(q) || (stem && x.k.includes(stem)))
      .sort((a, b) => (rank(b) - rank(a)) || ((b.k.includes(q) ? 1 : 0) - (a.k.includes(q) ? 1 : 0)) || (a.k.indexOf(stem || q) - b.k.indexOf(stem || q)))
      // the same place often exists twice (map data + heritage register): show it once
      .filter((x, i, arr) => !arr.slice(0, i).some(y => nm(y.o.n).replace(/[,.]/g, '') === nm(x.o.n).replace(/[,.]/g, '') && dist(y.o.la, y.o.lo, x.o.la, x.o.lo) < 1)).slice(0, 8);
    sOut.innerHTML = hits.map((x, i) => `<button data-h="${i}"><i style="background:${x.c ? '#fff' : CATS[x.o.c]}"></i>${esc(nm(x.o.n))}<small>${esc(x.c ? t('map_cities') : t('c_' + x.o.c))}</small></button>`).join('');
    sOut._hits = hits;
  });
  sOut.addEventListener('click', e => {
    const b = e.target.closest('[data-h]'); if (!b) return; const x = sOut._hits[+b.dataset.h]; sOut.innerHTML = ''; sIn.value = nm(x.o.n);
    selectPoint(x.o.la, x.o.lo, nm(x.o.n), true); if (!x.c) openPopup(x.o);
  });

  // quick city chips
  root.querySelector('#mapCities').innerHTML = cities.filter(c => c.c || c.p > 20000).slice(0, 14).map(c => `<button data-la="${c.la}" data-lo="${c.lo}">${esc(nm(c.n))}</button>`).join('');
  root.querySelector('#mapCities').addEventListener('click', e => { const b = e.target.closest('button'); if (b) selectPoint(+b.dataset.la, +b.dataset.lo, b.textContent, true); });

  renderList();
  window.geoMap = map;
  // the little guide standing on the map: greets, invites to pick a place, can be muted
  const mapGuide = createGuide(box); mapGuide.el.classList.add('guide-map');
  const gBtn = document.createElement('button'); gBtn.className = 'guide-toggle';
  const gLabel = () => { gBtn.textContent = autoGuide() ? t('guide_on') : t('guide_off'); };
  gLabel(); mapGuide.el.querySelector('.guide-bubble').appendChild(gBtn);
  gBtn.onclick = (e) => { e.stopPropagation(); setAutoGuide(!autoGuide()); gLabel(); mapGuide.greet(autoGuide() ? t('guide_hello') : t('guide_muted'), 2000, autoGuide() ? HELLO_REC : null); };
  const HELLO_REC = LANG === 'ka' ? 'audio/ka/hello.mp3?v=1' : null;
  setTimeout(() => mapGuide.greet(t('guide_hello'), 3200, HELLO_REC), 1200);
  new MutationObserver(() => { const open = !!document.querySelector('.pv.open'); mapGuide.el.classList.toggle('away', open); }).observe(box, { subtree: true, attributes: true, attributeFilter: ['class'] });
  const api = {
    map, ml, places, nm, CATS, root, box,
    openPlace: openPopup, selectPoint: (la, lo, label, fly = true) => selectPoint(la, lo, label, fly),
    setExtraFilter(f) { extraFilter = f; applyFilter(); },
    setRadius(r) { radius = r; rIn.value = r; rOut.textContent = `${radius} ${t('km')}`; },
    stopTour,
  };
  setupTour(api);
  const openIndex = (i) => {
    const p = places[i]; if (!p) return; stopTour();
    selectPoint(p.la, p.lo, nm(p.n), false); openPopup(p);
    map.flyTo({ center: [p.lo, p.la], zoom: 14.2, pitch: is3d ? 62 : 0, bearing: map.getBearing() + 30, duration: 2600, essential: true, padding: { left: innerWidth > 900 ? 386 : 0, right: innerWidth > 900 ? 420 : 0 } });
  };
  return { map, focus(lat, lon, label) { selectPoint(lat, lon, label, true); }, openIndex };
}
const occMarkers = [];
