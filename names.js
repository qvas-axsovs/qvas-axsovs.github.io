// Names, dates and translation helpers for register-based places.
import { t, LANG } from './i18n.js?v=60';
import { TYPES, DEDS } from './names_data.js?v=60';

const KA = 'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ';
const LAT = ['a','b','g','d','e','v','z','t','i','k','l','m','n','o','p','zh','r','s','t','u','p','k','gh','q','sh','ch','ts','dz','ts','ch','kh','j','h'];
const CYR = ['а','б','г','д','е','в','з','т','и','к','л','м','н','о','п','ж','р','с','т','у','п','к','г','к','ш','ч','ц','дз','ц','ч','х','дж','х'];
const TL = Object.fromEntries([...KA].map((c, i) => [c, LAT[i]])), TC = Object.fromEntries([...KA].map((c, i) => [c, CYR[i]]));
const cap = (s) => s.replace(/(^|[\s(«"-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export const translit = (s, lang = LANG) => {
  if (!s || lang === 'ka' || !/[ა-ჰ]/.test(s)) return s || '';
  const m = (lang === 'ru' || lang === 'uk') ? TC : TL;
  return cap([...s].map(c => m[c] ?? c).join(''));
};

// fill in a readable name in the visitor's language for places that only have a Georgian register name
export function localizeNames(places) {
  const langs = [...new Set([LANG, 'en'])];
  for (const p of places) {
    if (!p.n || p.n[LANG] || !p.n.ka) continue;
    for (const l of langs) {
      if (p.n[l]) continue;
      const v = p.v ? translit(p.v, l) : '';
      if (p.nt != null) {
        const tl = TYPES[p.nt][l] || TYPES[p.nt].en, dd = p.nd != null ? (DEDS[p.nd][l] || DEDS[p.nd].en) : '';
        const s = dd ? ({ en: `${tl} of ${dd}`, tr: `${dd} ${tl.toLowerCase()}` }[l] || `${tl} ${dd}`) : tl;
        p.n[l] = v ? (dd ? `${s} (${v})` : `${s}, ${v}`) : s;
      } else p.n[l] = translit(p.n.ka, l);
    }
  }
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const cen = (n) => LANG === 'en' ? ord(n) : (LANG === 'ka' ? `მე-${n}` : ROMAN[n] || n);
export function fmtDate(dt) {
  if (!dt) return '';
  const bc = dt.bc ? ' ' + t('pv_bc') : '';
  if (dt.y) return dt.y.length > 1 ? `${dt.y[0]}–${dt.y[1]}` : t('dt_y', { y: dt.y[0] });
  if (dt.m) return (dt.m.length > 1 ? t('dt_mm', { a: dt.m[0], b: dt.m[1] }) : t('dt_m', { a: dt.m[0] })) + bc;
  if (dt.c) {
    if (dt.c.length > 1) return t('dt_cc', { a: cen(dt.c[0]), b: cen(dt.c[1]) }) + bc;
    return t(dt.q ? 'dt_' + dt.q : 'pv_century', { c: cen(dt.c[0]) }) + bc;
  }
  return '';
}

// Wikimedia's open machine translation (MinT). Cached per text in the browser.
const memo = new Map();
export async function translate(paras, from, to = LANG) {
  if (!paras.length || from === to) return paras;
  const key = from + to + paras.join('\u0001').slice(0, 4000);
  if (memo.has(key)) return memo.get(key);
  const job = (async () => {
    try { const c = localStorage.getItem('mt:' + hash(key)); if (c) return JSON.parse(c); } catch { /* private mode */ }
    const out = [];
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const html = batch.map(x => `<p>${x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>`).join('');
      const r = await fetch(`https://cxserver.wikimedia.org/v2/translate/${from}/${to}/MinT`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) });
      if (!r.ok) throw new Error('mt ' + r.status);
      const j = await r.json();
      const doc = new DOMParser().parseFromString(j.contents || '', 'text/html');
      out.push(...[...doc.querySelectorAll('p')].map(p => p.textContent.trim()));
      batch = [];
    };
    let len = 0;
    for (const p of paras) { if (len + p.length > 2500) { await flush(); len = 0; } batch.push(p); len += p.length; }
    await flush();
    try { localStorage.setItem('mt:' + hash(key), JSON.stringify(out)); } catch { /* quota */ }
    return out;
  })();
  memo.set(key, job);
  job.catch(() => memo.delete(key));
  return job;
}
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
