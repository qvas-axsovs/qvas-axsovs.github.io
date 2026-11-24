// Turn written text into what the guide should say aloud, per language: abbreviations in full
// ("г." → "город", "XII в." → "двенадцатого века", "ქ." → "ქალაქი"), centuries in words, units, eras.
import { sayKa } from './ka_say.js?v=58';
import { sakartvelo } from './sakartvelo.js?v=58';

const RV = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const roman = (s) => { let n = 0; for (let i = 0; i < s.length; i++) { const v = RV[s[i]], w = RV[s[i + 1]] || 0; n += v < w ? -v : v; } return n; };
const ROM = '(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})';
const NB = '(?<![A-Za-zА-Яа-яЁёІіЇїЄє])', NA = '(?![A-Za-zА-Яа-яЁёІіЇїЄє])';
const cap = (w) => /^[A-ZА-ЯЁІЇЄ]/.test(w || '');

/* ---------- Russian ---------- */
const RU = ['', 'перв', 'втор', 'трет', 'четвёрт', 'пят', 'шест', 'седьм', 'восьм', 'девят', 'десят', 'одиннадцат', 'двенадцат', 'тринадцат',
  'четырнадцат', 'пятнадцат', 'шестнадцат', 'семнадцат', 'восемнадцат', 'девятнадцат', 'двадцат'];
function ruOrd(n, c) { // c: nom | gen | prep | dat
  if (n > 20 && n < 30) return 'двадцать ' + ruOrd(n - 20, c);
  const st = RU[n]; if (!st) return String(n);
  const soft = n === 3, hard = [2, 6, 7, 8].includes(n);
  if (c === 'gen') return soft ? 'третьего' : st + 'ого';
  if (c === 'prep') return soft ? 'третьем' : st + 'ом';
  if (c === 'dat') return soft ? 'третьему' : st + 'ому';
  return soft ? 'третий' : st + (hard ? 'ой' : 'ый');
}
const ruCaseBefore = (prev) => /(^|\s)(в|во|на|о|об)\s*$/i.test(prev) ? 'prep' : /(^|\s)к\s*$/i.test(prev) ? 'dat' : 'gen';
const ruNum = (n, one, few, many) => { const a = n % 100, b = n % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many; };
function sayRu(s) {
  s = ' ' + s + ' ';
  s = s.replace(/до\s+н\.\s*э\.?/g, 'до нашей эры').replace(/(^|[^А-Яа-я])н\.\s*э\.?/g, '$1нашей эры')
    .replace(/т\.\s*е\./g, 'то есть').replace(/т\.\s*н\./g, 'так называемый').replace(/и\s+т\.\s*д\./g, 'и так далее').replace(/и\s+т\.\s*п\./g, 'и тому подобное');
  // centuries: "в XII в.", "XII–XIII вв.", "XII века"
  s = s.replace(new RegExp(`(\\S*\\s?)${NB}(${ROM})(?:\\s*[-–—]\\s*(${ROM}))?\\s*(вв?\\.|век(?:а|е|у|ов|ах|ами|ом)?${NA})`, 'g'), (m, prev, a, b, w) => {
    let c = ruCaseBefore(prev);
    if (/^век/.test(w)) c = { 'век': 'nom', 'века': 'gen', 'веке': 'prep', 'веку': 'dat', 'веков': 'gen', 'веках': 'prep' }[w] || c;
    const pl = !!b || w === 'вв.';
    const noun = w.endsWith('.') ? (pl ? { gen: 'веков', prep: 'веках', dat: 'векам', nom: 'века' } : { gen: 'века', prep: 'веке', dat: 'веку', nom: 'век' })[c] : w;
    return prev + ruOrd(roman(a), c) + (b ? ' — ' + ruOrd(roman(b), c) : '') + ' ' + noun;
  });
  s = s.replace(new RegExp(`([А-ЯЁ][а-яё]+)\\s+(${ROM})${NA}`, 'g'), (m, name, r) => {
    if (!r) return m; const n = roman(r); if (n < 1 || n > 20) return m;
    const c = /(а|я)$/.test(name) ? 'gen' : /(у|ю)$/.test(name) ? 'dat' : /(ом|ем|ём)$/.test(name) ? 'ins' : /(е)$/.test(name) ? 'prep' : 'nom';
    let o = c === 'ins' ? ruOrd(n, 'nom').replace(/(ый|ой|ий)$/, 'ым').replace(/третьым$/, 'третьим') : ruOrd(n, c);
    return name + ' ' + o[0].toUpperCase() + o.slice(1);
  });
  s = s.replace(new RegExp(`${NB}(${ROM})${NA}`, 'g'), (m, r) => r ? String(roman(r)) : m);
  // years
  s = s.replace(/(\S*\s?)(\d{3,4})\s*[-–—]\s*(\d{2,4})\s*гг\./g, (m, prev, a, b) => prev + a + '–' + b + (/(^|\s)в\s*$/i.test(prev) ? ' годах' : ' годы'));
  s = s.replace(/(\S*\s?)(\d{3,4})\s*г\./g, (m, prev, a) => prev + a + (/(^|\s)(в|во)\s*$/i.test(prev) ? ' году' : /(^|\s)(с|до|от|после|около|начале|конце|середине)\s*$/i.test(prev) ? ' года' : ' год'));
  // units after numbers
  s = s.replace(/(\d+)\s*км(?!\p{L})/gu, (m, n) => n + ' ' + ruNum(+n, 'километр', 'километра', 'километров'))
    .replace(/(\d+)\s*м(?!\p{L})/gu, (m, n) => n + ' ' + ruNum(+n, 'метр', 'метра', 'метров'))
    .replace(/(\d+)\s*тыс\./g, '$1 тысяч').replace(/(\d+)\s*млн\.?/g, '$1 миллионов');
  // places and titles before names
  const PL = { 'г': ['город', 'городе', 'города', 'городу'], 'с': ['село', 'селе', 'села', 'селу'], 'д': ['деревня', 'деревне', 'деревни', 'деревне'],
    'р': ['река', 'реке', 'реки', 'реке'], 'оз': ['озеро', 'озере', 'озера', 'озеру'], 'пос': ['посёлок', 'посёлке', 'посёлка', 'посёлку'] };
  s = s.replace(/(\S*)(\s)(г|с|д|р|оз|пос)\.\s*(?=[А-ЯЁ])/g, (m, prev, sp, k) => {
    const f = PL[k], p = prev.toLowerCase();
    const i = /^(в|во|на|о|об|при)$/.test(p) ? 1 : /^(от|до|из|у|около|близ|возле|вблизи|недалеко|окрестностях|окрестности|центре|центр|районе|жителей|для|без|после)$/.test(p) ? 2 : p === 'к' ? 3 : 0;
    return prev + sp + f[i] + ' ';
  });
  s = s    .replace(/(\s)ул\.\s*/g, '$1улица ')
    .replace(/(\s)пр\.\s*(?=[А-ЯЁ])/g, '$1проспект ').replace(/(\s)пл\.\s*(?=[А-ЯЁ])/g, '$1площадь ').replace(/(\s)обл\./g, '$1область')
    .replace(/(\s)р-н(?=\s|,|\.)/g, '$1район').replace(/(\s)муниц\./g, '$1муниципалитет').replace(/(\s)им\.\s*/g, '$1имени ')
    .replace(/(\s)ок\.\s*/g, '$1около ').replace(/(\s)ст\.\s*(?=[А-ЯЁ])/g, '$1станция ')
    .replace(/(\s)св\.\s*(\S+)/g, (m, sp, w) => sp + (/[ыи]$/.test(w) ? 'святой ' : /[яа]$/.test(w) ? 'святого ' : /(ым|ом)$/.test(w) ? 'святым ' : 'святой ') + w)
    .replace(/(\s)свв\.\s*/g, '$1святых ');
  return s.replace(/\s+/g, ' ').trim();
}

/* ---------- Ukrainian ---------- */
const UK = ['', 'перш', 'друг', 'трет', 'четверт', "п'ят", 'шост', 'сьом', 'восьм', "дев'ят", 'десят', 'одинадцят', 'дванадцят', 'тринадцят',
  'чотирнадцят', "п'ятнадцят", 'шістнадцят', 'сімнадцят', 'вісімнадцят', "дев'ятнадцят", 'двадцят'];
function ukOrd(n, c) {
  if (n > 20 && n < 30) return 'двадцять ' + ukOrd(n - 20, c);
  const st = UK[n]; if (!st) return String(n);
  const soft = n === 3;
  if (c === 'gen') return soft ? 'третього' : st + 'ого';
  if (c === 'loc') return soft ? 'третьому' : st + 'ому';
  return soft ? 'третій' : st + 'ий';
}
function sayUk(s) {
  s = ' ' + s + ' ';
  s = s.replace(/до\s+н\.\s*е\.?/g, 'до нашої ери').replace(/(^|[^А-Яа-яІіЇїЄє])н\.\s*е\.?/g, '$1нашої ери').replace(/тобто/g, 'тобто')
    .replace(/т\.\s*зв\./g, 'так званий').replace(/і\s+т\.\s*д\./g, 'і так далі');
  s = s.replace(new RegExp(`(\\S*\\s?)${NB}(${ROM})(?:\\s*[-–—]\\s*(${ROM}))?\\s*(ст\\.|століттях|столітті|століття|століть|стол\\.)`, 'g'), (m, prev, a, b) => {
    const c = /(^|\s)(у|в)\s*$/i.test(prev) ? 'loc' : 'gen';
    return prev + ukOrd(roman(a), c) + (b ? ' — ' + ukOrd(roman(b), c) : '') + (c === 'loc' ? ' столітті' : ' століття');
  });
  s = s.replace(new RegExp(`([А-ЯІЇЄҐ][а-яіїєґ']+)\\s+(${ROM})${NA}`, 'g'), (m, name, r) => {
    if (!r) return m; const n = roman(r); if (n < 1 || n > 20) return m;
    const c = /(а|я)$/.test(name) ? 'gen' : /(ом|ем|єм)$/.test(name) ? 'ins' : /(ові|еві|у|ю|і)$/.test(name) ? 'loc' : 'nom';
    let o = c === 'ins' ? ukOrd(n, 'nom').replace(/ій$/, 'ім').replace(/ий$/, 'им') : ukOrd(n, c);
    return name + ' ' + o[0].toUpperCase() + o.slice(1);
  });
  s = s.replace(new RegExp(`${NB}(${ROM})${NA}`, 'g'), (m, r) => r ? String(roman(r)) : m);
  s = s.replace(/(\S*\s?)(\d{3,4})\s*[-–—]\s*(\d{2,4})\s*рр\./g, (m, prev, a, b) => prev + a + '–' + b + (/(^|\s)(у|в)\s*$/i.test(prev) ? ' роках' : ' роки'));
  s = s.replace(/(\S*\s?)(\d{3,4})\s*р\./g, (m, prev, a) => prev + a + (/(^|\s)(у|в)\s*$/i.test(prev) ? ' році' : /(^|\s)(з|до|від|після|близько)\s*$/.test(prev) ? ' року' : ' рік'));
  s = s.replace(/(\d+)\s*км(?!\p{L})/gu, '$1 кілометрів').replace(/(\d+)\s*м(?!\p{L})/gu, '$1 метрів').replace(/(\d+)\s*тис\./g, '$1 тисяч');
  const UP = { 'м': ['місто', 'місті', 'міста'], 'с': ['село', 'селі', 'села'], 'р': ['річка', 'річці', 'річки'] };
  s = s.replace(/(\S*)(\s)(м|с|р)\.\s*(?=[А-ЯІЇЄ])/g, (m, prev, sp, k) => { const p = prev.toLowerCase(); const i = /^(у|в|на)$/.test(p) ? 1 : /^(від|до|з|із|біля|поблизу|околиці|центрі|для|після)$/.test(p) ? 2 : 0; return prev + sp + UP[k][i] + ' '; });
  s = s
    .replace(/(\s)вул\.\s*/g, '$1вулиця ').replace(/(\s)обл\./g, '$1область').replace(/(\s)р-н(?=\s|,|\.)/g, '$1район')
    .replace(/(\s)ім\.\s*/g, '$1імені ').replace(/(\s)бл\.\s*/g, '$1близько ').replace(/(\s)св\.\s*/g, '$1святого ');
  return s.replace(/\s+/g, ' ').trim();
}

/* ---------- English / German / French / Turkish ---------- */
const enOrd = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
function sayEn(s) {
  return (' ' + s + ' ')
    .replace(new RegExp(`${NB}(${ROM})(?:\\s*[-–—]\\s*(${ROM}))?(?=\\s*(?:th\\s+)?centur)`, 'g'), (m, a, b) => a ? enOrd(roman(a)) + (b ? ' to ' + enOrd(roman(b)) : '') : m)
    .replace(/(\d+)(st|nd|rd|th)?\s*c\.(?=\s)/g, (m, n) => enOrd(+n) + ' century')
    .replace(/(\s)c\.\s*(?=\d)/g, '$1circa ').replace(/(\s)ca\.\s*/g, '$1circa ').replace(/(\s)St\.\s*/g, '$1Saint ').replace(/(\s)Mt\.\s*/g, '$1Mount ')
    .replace(/(\d+)\s*km(?![a-z])/g, '$1 kilometres').replace(/(\d+)\s*m(?![a-z])/g, '$1 metres').replace(/(\d)\s*BC(E)?\b/g, '$1 B C').replace(/\be\.g\./g, 'for example').replace(/\bi\.e\./g, 'that is')
    .replace(/\s+/g, ' ').trim();
}
function sayDe(s) {
  return (' ' + s + ' ')
    .replace(new RegExp(`${NB}(${ROM})\\.?(?=\\s*Jh)`, 'g'), (m, a) => a ? roman(a) + '.' : m)
    .replace(/Jhs?\.|Jhdts?\./g, (m) => /s\./.test(m) ? 'Jahrhunderts' : 'Jahrhundert')
    .replace(/v\.\s*Chr\./g, 'vor Christus').replace(/n\.\s*Chr\./g, 'nach Christus').replace(/(\s)ca\.\s*/g, '$1circa ').replace(/(\s)St\.\s*/g, '$1Sankt ')
    .replace(/(\s)z\.\s*B\./g, '$1zum Beispiel').replace(/(\s)bzw\./g, '$1beziehungsweise').replace(/(\s)u\.\s*a\./g, '$1unter anderem')
    .replace(/(\d+)\s*km(?![a-z])/g, '$1 Kilometer').replace(/(\d+)\s*m(?![a-z])/g, '$1 Meter').replace(/\s+/g, ' ').trim();
}
function sayFr(s) {
  return (' ' + s + ' ')
    .replace(new RegExp(`${NB}(${ROM})(?:e|ème)?(?=\\s*(?:s\\.|siècle))`, 'g'), (m, a) => a ? (roman(a) === 1 ? 'premier' : roman(a) + 'e') : m)
    .replace(/(\s)s\.(?=\s)/g, '$1siècle').replace(/av\.\s*J\.-C\./g, 'avant Jésus-Christ').replace(/apr\.\s*J\.-C\./g, 'après Jésus-Christ')
    .replace(/(\s)env\.\s*/g, '$1environ ').replace(/(\s)St(e?)[.\s-]+(?=[A-Z])/g, (m, sp, e) => sp + (e ? 'Sainte ' : 'Saint '))
    .replace(/(\d+)\s*km(?![a-z])/g, '$1 kilomètres').replace(/(\d+)\s*m(?![a-z])/g, '$1 mètres').replace(/\s+/g, ' ').trim();
}
function sayTr(s) {
  return (' ' + s + ' ')
    .replace(new RegExp(`${NB}(${ROM})\\.?(?=\\s*(?:yy|yüzyıl))`, 'g'), (m, a) => a ? roman(a) + '.' : m)
    .replace(/yy\.?(?=\s|,|$)/g, 'yüzyıl').replace(/(\s)MÖ(?=\s)/g, '$1milattan önce').replace(/(\s)MS(?=\s)/g, '$1milattan sonra')
    .replace(/(\s)yak\.\s*/g, '$1yaklaşık ').replace(/(\d+)\s*km(?![a-zçğıöşü])/g, '$1 kilometre').replace(/\s+/g, ' ').trim();
}

/* ---------- Georgian additions on top of ka_say ---------- */
function sayKaFull(s) {
  s = ' ' + s + ' ';
  const SUR = /(შვილ|ძე|ძის|ძემ|ია|იამ|იას|ავა|უა)[ა-ჰ]{0,3}$/, OBLW = /(ში|ის|ზე|დან|თან|ით|ს|მდე)$/;
  const place = (full, st) => (m, sp, w) => sp + (SUR.test(w) ? '' : (OBLW.test(w) ? st : full) + ' ') + w;
  s = s.replace(/(\s)ქ\.\s*([ა-ჰ]+)/g, place('ქალაქი', 'ქალაქ')).replace(/(\s)ს\.\s*([ა-ჰ]+)/g, place('სოფელი', 'სოფელ'))
    .replace(/(\s)სოფ\.\s*([ა-ჰ]+)/g, (m, sp, w) => sp + (OBLW.test(w) ? 'სოფელ ' : 'სოფელი ') + w)
    .replace(/რ-ნ(ის|ში|ზე|ი)?(?![ა-ჰ])/g, (m, e) => 'რაიონ' + (e || 'ი')).replace(/(\s)მუნ\./g, '$1მუნიციპალიტეტი')
    .replace(/(\s)სახ\./g, '$1სახელობის').replace(/(\s)მაგ\./g, '$1მაგალითად').replace(/(\s)დაახ\./g, '$1დაახლოებით')
    .replace(/(\s)წმ\./g, '$1წმინდა').replace(/და\s+ა\.\s*შ\./g, 'და ასე შემდეგ').replace(/(\s)ე\.\s*ი\./g, '$1ესე იგი')
    .replace(/(\s)კვ\./g, '$1კვადრატული').replace(/(\d)\s*სმ(?![ა-ჰ])/g, '$1 სანტიმეტრი').replace(/(\d)\s*ჰა(?![ა-ჰ])/g, '$1 ჰექტარი')
    .replace(/(\s)ათ\.\s*/g, '$1ათასი ').replace(/(\s)მლნ\.?/g, '$1მილიონი').replace(/(\s)ეკლ\./g, '$1ეკლესია').replace(/(\s)მონ\./g, '$1მონასტერი');
  return sayKa(s);
}

export function sayText(text, lang) {
  const s = lang === 'ka' ? String(text ?? '') : sakartvelo(text);
  switch (lang) {
    case 'ka': return sayKaFull(s);
    case 'ru': return sayRu(s);
    case 'uk': return sayUk(s);
    case 'en': return sayEn(s);
    case 'de': return sayDe(s);
    case 'fr': return sayFr(s);
    case 'tr': return sayTr(s);
    default: return s;
  }
}
