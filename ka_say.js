// Georgian text → words for the speech engine: numbers, years, centuries (Roman numerals, "მე-12"), and the
// abbreviations of the heritage register ("ს-ის", "სს.", "წწ.", "ძვ. წ.", "ინ-ტი"…), with the right case endings.

const U = ['', 'ერთი', 'ორი', 'სამი', 'ოთხი', 'ხუთი', 'ექვსი', 'შვიდი', 'რვა', 'ცხრა', 'ათი', 'თერთმეტი', 'თორმეტი', 'ცამეტი',
  'თოთხმეტი', 'თხუთმეტი', 'თექვსმეტი', 'ჩვიდმეტი', 'თვრამეტი', 'ცხრამეტი'];
const TW = ['', 'ოც', 'ორმოც', 'სამოც', 'ოთხმოც']; // vigesimal: 20, 40, 60, 80
const H = ['', 'ას', 'ორას', 'სამას', 'ოთხას', 'ხუთას', 'ექვსას', 'შვიდას', 'რვაას', 'ცხრაას'];

function under100(n) {
  if (n < 20) return U[n];
  const t = Math.floor(n / 20), r = n % 20;
  return r ? TW[t] + 'და' + U[r] : TW[t] + 'ი';
}
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  if (!h) return under100(r);
  return r ? H[h] + ' ' + under100(r) : H[h] + 'ი';
}
export function cardinal(n) {
  n = Math.floor(+n); if (!isFinite(n)) return '';
  if (n === 0) return 'ნული';
  if (n >= 1e6) return String(n);
  const th = Math.floor(n / 1000), r = n % 1000;
  if (!th) return under1000(r);
  const head = th === 1 ? 'ათას' : under1000(th) + ' ათას';
  return r ? head + ' ' + under1000(r) : head + 'ი';
}
// the form a numeral takes before a noun in an oblique case ("ორ წელს", "ცხრაას სამ წელს") or before a suffix
const stem = (w) => w.replace(/ი$/, '');
// ordinal: 1 → პირველი, 2 → მეორე, 21 → ოცდამეერთე, 40 → მეორმოცე
export function ordinal(n) {
  n = +n; if (n === 1) return 'პირველი';
  const c = cardinal(n);
  const m = c.match(/^(.*(?:და| ))(.+)$/); // compound: only the last part becomes ordinal
  const tail = (w) => 'მე' + w.replace(/[ია]$/, '') + 'ე';
  if (m && !/^(ას|ათას)/.test(m[2])) return m[1] + (m[2] === 'ერთი' ? 'მეერთე' : tail(m[2]));
  return tail(c);
}

const RV = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const roman = (s) => { let n = 0; for (let i = 0; i < s.length; i++) { const v = RV[s[i]], w = RV[s[i + 1]] || 0; n += v < w ? -v : v; } return n; };
const ROM = '(?:X{0,3})(?:IX|IV|V?I{0,3})';

// "ს", "სს", "ს-ის", "სს-ით", "ს.-ში" … → century noun with its case (suf = the ending after the hyphen)
function century(suf, plural) {
  suf = suf || '';
  const b = plural ? 'საუკუნეებ' : 'საუკუნე', g = plural ? 'საუკუნეების' : 'საუკუნის';
  if (/^ის/.test(suf)) return g + suf.slice(2);
  if (/^ით/.test(suf)) return (plural ? 'საუკუნეებით' : 'საუკუნით') + suf.slice(2);
  if (/^(ში|ზე|მდე|თან)/.test(suf)) return b + suf;
  if (/^დან/.test(suf)) return (plural ? 'საუკუნეებიდან' : 'საუკუნიდან') + suf.slice(3);
  if (suf === 'ს') return plural ? 'საუკუნეებს' : 'საუკუნეს';
  return plural ? 'საუკუნეები' : 'საუკუნე';
}
const CENT = '(სს|ს)(?:\\.?-(?:ბ)?([ა-ჰ]+)|\\.)?(?![ა-ჰ])';
const OBL = '(?=\\s+[ა-ჰ]+(?:ს|ში|ზე|დან|მდე|თან|ით|ისა)(?![ა-ჰ]))';

export function sayKa(text) {
  let s = ' ' + String(text).replace(/\r?\n/g, ' ') + ' ';
  s = s.replace(/[XY]\s*\d{5,}(?:\s*[XY]\s*\d{5,})?/g, ' ')                         // map coordinates
    .replace(/\d+\.\d{3,}/g, ' ').replace(/\d{5,}(?:\s*\/\s*\d{5,})?/g, ' ')
    .replace(/(^|[^ა-ჰ])ე\.\s*წ\./g, '$1ეგრეთ წოდებული ')
    .replace(/წ\.\s*წ\./g, 'წწ.')
    .replace(/[–—]/g, '-').replace(/\s*-\s*(?=მე-|[IVX]+\b)/g, ' - ')
    .replace(/ძვ\.?\s*წ\.?(?:\s*ა?ღ?\.)?/g, ' ძველი წელთაღრიცხვით ')
    .replace(/ახ\.?\s*წ\.?(?:\s*ა?ღ?\.)?/g, ' ახალი წელთაღრიცხვით ');

  // centuries with Roman numerals: "XII-XIII სს-ით", "IX - X ს-ის", "XVIIIს."
  s = s.replace(new RegExp(`(?<![A-Za-z])(?=[IVX])(${ROM})\\s*(?:-\\s*(${ROM}))?\\s*${CENT}`, 'g'), (m, a, b, cc, suf) =>
    ordinal(roman(a)) + (b ? ' და ' + ordinal(roman(b)) : '') + ' ' + century(suf, cc === 'სს' || !!b) + ' ');
  // "მე-9 ს-ით", "მე-10 - მე-11 ს.", "მე-20 სს"
  s = s.replace(new RegExp(`მე-(\\d+)\\s*(?:-\\s*მე-(\\d+))?\\s*${CENT}`, 'g'), (m, a, b, cc, suf) =>
    ordinal(a) + (b ? ' და ' + ordinal(b) : '') + ' ' + century(suf, cc === 'სს' || !!b) + ' ');
  s = s.replace(new RegExp(`მე-(\\d+)\\s*-\\s*(\\d+)\\s*${CENT}`, 'g'), (m, a, b, cc, suf) => ordinal(a) + ' და ' + ordinal(b) + ' ' + century(suf, true) + ' ');
  s = s.replace(/მე-(\d+)/g, (m, a) => ordinal(a));
  // remaining Roman numerals (floors, numbered sites, "XVII საუკუნეს") → ordinals
  s = s.replace(new RegExp(`(?<![A-Za-z])(?=[IVX])(${ROM})(?![A-Za-z])`, 'g'), (m, r) => r ? ordinal(roman(r)) : m);

  // years: "1966 წ.", "1985-88 წწ.", "1637-39 წლებში"
  const yr = (a, b) => { b = b && b.length < a.length ? a.slice(0, a.length - b.length) + b : b; return [a, b]; };
  s = s.replace(/(\d{3,4})(?:\s*-\s*(\d{2,4}))?\s*წწ\.?/g, (m, a, b) => { [a, b] = yr(a, b); return (b ? stem(cardinal(a)) + ' - ' + stem(cardinal(b)) : stem(cardinal(a))) + ' წლებში '; });
  s = s.replace(/(\d{3,4})\s*წ["”]?\.+(?![ა-ჰ])/g, (m, a) => stem(cardinal(a)) + ' წელს ');
  s = s.replace(new RegExp('(\\d+)\\s*-\\s*(\\d+)' + OBL, 'g'), (m, a, b) => { [a, b] = yr(a, b); return stem(cardinal(a)) + ' - ' + stem(cardinal(b)); });
  s = s.replace(/(\d+)\s*-\s*(\d+)(?=\s+(წლ|წელ))/g, (m, a, b) => { [a, b] = yr(a, b); return cardinal(a) + ' - ' + cardinal(b); });
  // number + suffix: "1910-იანი", "90-იან", "1-ის"
  s = s.replace(/(\d+)\s*-\s*(იან[ა-ჰ]*|[ა-ჰ]{1,4})(?![ა-ჰ])/g, (m, a, suf) => stem(cardinal(a)) + suf);
  // a number right before a noun in an oblique case loses its final ი ("1903 წელს" → "… სამ წელს")
  s = s.replace(new RegExp('(\\d+)' + OBL, 'g'), (m, a) => stem(cardinal(a)));
  s = s.replace(/\d+/g, (a) => cardinal(a));

  s = s.replace(new RegExp('პირველი' + OBL, 'g'), 'პირველ');
  // other register abbreviations
  s = s.replace(/ინ-ტ(ის|ი)/g, 'ინსტიტუტ$1').replace(/(\s)სოფ\./g, '$1სოფელი').replace(/(\s)მდ\./g, '$1მდინარე')
    .replace(/(\s)აღმ\./g, '$1აღმოსავლეთ').replace(/(\s)სამხ\./g, '$1სამხრეთ').replace(/(\s)ჩრდ\./g, '$1ჩრდილოეთ')
    .replace(/(\s)დას\.(?=\s*(?:კედ|ფას|მხ|ნაწ|ნაპ))/g, '$1დასავლეთ').replace(/(\s)დას\./g, '$1დასაწყისი')
    .replace(/(\s)ნახ\./g, '$1ნახევარი').replace(/(\s)კმ(-ის)?(?![ა-ჰ])/g, (m, sp, g) => sp + (g ? 'კილომეტრის' : 'კილომეტრი'))
    .replace(/(\s)მ\.(?=\s)/g, '$1მეტრი').replace(/(\s)ტ\.(?=\s)/g, '$1ტომი')
    .replace(/UNESCO-?ს?/g, 'იუნესკოს')
    .replace(/[«»„“"”()\\]|,,/g, ' ').replace(/\?{2,}/g, '?').replace(/\s+-\s+/g, ', ')
    .replace(/\s+([.,;:!?])/g, '$1').replace(/\s+/g, ' ');
  return s.trim();
}
