// "Walk" mode: real street-level / visitor 360° imagery around a place.
// 1) Google Street View at the place (roads, courtyards and visitors' 360° photo-spheres, walkable with arrows)
// 2) Spherical 360° panoramas from Wikimedia Commons (often interiors), shown with Pannellum.
import { t, LANG } from './i18n.js?v=60';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function commons360(p) {
  const out = [];
  for (const r of [300, 1200]) {
    const q = new URLSearchParams({ format: 'json', origin: '*', action: 'query', generator: 'geosearch', ggscoord: `${p.la}|${p.lo}`, ggsradius: r, ggsnamespace: 6, ggslimit: 50,
      prop: 'imageinfo|categories', iiprop: 'size|url|extmetadata', iiurlwidth: 6000, cllimit: 'max' });
    const d = await fetch('https://commons.wikimedia.org/w/api.php?' + q).then(x => x.json()).catch(() => null);
    for (const pg of Object.values(d?.query?.pages || {})) {
      const ii = pg.imageinfo?.[0]; if (!ii) continue;
      const cats = (pg.categories || []).map(c => c.title).join(' ');
      const sphere = Math.abs(ii.width / ii.height - 2) < .03 && ii.width >= 3000 && /360|spheric|equirect|photosphere|panoramas? of/i.test(cats);
      if (sphere && !out.some(o => o.title === pg.title)) {
        const m = ii.extmetadata || {};
        out.push({ title: pg.title, src: ii.thumburl || ii.url, thumb: (ii.thumburl || ii.url).replace(/\/\d+px-/, '/320px-'), page: ii.descriptionurl, author: strip(m.Artist?.value).slice(0, 50), lic: strip(m.LicenseShortName?.value), d: pg.index });
      }
    }
    if (out.length >= 3) break;
  }
  return out.slice(0, 8);
}

let pannellumReady = null;
function loadPannellum() {
  return pannellumReady ||= new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/pannellum/pannellum.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'vendor/pannellum/pannellum.js'; s.onload = () => res(window.pannellum); s.onerror = rej; document.head.appendChild(s);
  });
}

export function openWalk(box, p, title) {
  document.querySelector('.walk')?.remove();
  const host = innerWidth < 900 ? document.body : box;
  const el = document.createElement('section'); el.className = 'walk'; host.appendChild(el);
  const sv = `https://maps.google.com/maps?layer=c&cbll=${p.la},${p.lo}&cbp=12,0,0,0,0&hl=${LANG}&output=svembed`;
  const gm = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}%20${p.la},${p.lo}`;
  el.innerHTML = `
    <header class="walk-top">
      <div class="walk-title"><small>${esc(t('walk_k'))}</small><b>${esc(title)}</b></div>
      <div class="walk-modes"><button data-m="sv" class="on">${esc(t('walk_street'))}</button><button data-m="pano" disabled>${esc(t('walk_360'))} <span>…</span></button></div>
      <a class="walk-gm" target="_blank" rel="noopener" href="${gm}">${esc(t('walk_gm'))} ↗</a>
      <button class="walk-x" aria-label="${esc(t('close'))}">×</button>
    </header>
    <div class="walk-stage"><iframe title="Street View" allowfullscreen loading="eager" referrerpolicy="no-referrer-when-downgrade" src="${sv}"></iframe></div>
    <div class="walk-strip" hidden></div>
    <p class="walk-hint">${esc(t('walk_hint'))}</p>`;
  requestAnimationFrame(() => el.classList.add('open'));
  let viewer = null;
  const stage = el.querySelector('.walk-stage'), strip_ = el.querySelector('.walk-strip'), hint = el.querySelector('.walk-hint');
  const close = () => { viewer?.destroy?.(); el.classList.remove('open'); setTimeout(() => el.remove(), 450); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.querySelector('.walk-x').onclick = close;

  let panos = [];
  async function showPano(i) {
    const P = await loadPannellum(); viewer?.destroy?.();
    stage.innerHTML = '<div id="walkPano" class="walk-pano"></div>';
    viewer = P.viewer('walkPano', { type: 'equirectangular', panorama: panos[i].src, autoLoad: true, autoRotate: -1.5, compass: false, showZoomCtrl: true, hfov: 105, crossOrigin: 'anonymous' });
    strip_.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
    hint.innerHTML = `📷 <a target="_blank" rel="noopener" href="${esc(panos[i].page)}">${esc(panos[i].author || 'Wikimedia Commons')}</a>${panos[i].lic ? ' · ' + esc(panos[i].lic) : ''}`;
  }
  el.querySelector('.walk-modes').onclick = (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    el.querySelectorAll('.walk-modes button').forEach(x => x.classList.toggle('on', x === b));
    if (b.dataset.m === 'sv') { viewer?.destroy?.(); viewer = null; stage.innerHTML = `<iframe title="Street View" allowfullscreen src="${sv}"></iframe>`; strip_.hidden = true; hint.textContent = t('walk_hint'); }
    else { strip_.hidden = false; showPano(0); }
  };
  strip_.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) showPano(+b.dataset.i); };

  commons360(p).then(list => {
    panos = list; const btn = el.querySelector('[data-m=pano]');
    btn.querySelector('span').textContent = list.length ? `(${list.length})` : '—';
    btn.disabled = !list.length; btn.hidden = !list.length;
    strip_.innerHTML = list.map((x, i) => `<button data-i="${i}" style="background-image:url('${esc(x.thumb)}')" aria-label="360 ${i + 1}"></button>`).join('');
  });
  return { close };
}
