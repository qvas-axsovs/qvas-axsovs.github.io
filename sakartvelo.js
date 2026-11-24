// The country is called Sakartvelo: use that name instead of the exonym in every language,
// also in texts that come from Wikipedia or machine translation.
const RULES = [
  [/Грузи(?:я|и|ю|ей|ею)(?![а-яё])/g, 'Сакартвело'],
  [/Грузі(?:я|ї|ю|єю)(?![а-яіїє])/g, 'Сакартвело'],
  [/Грузинськ/g, 'Картвельськ'], [/грузинськ/g, 'картвельськ'],
  [/Грузинск/g, 'Картвельск'], [/грузинск/g, 'картвельск'],
  [/(?<![а-яё])([Гг])рузин(ы|ам|ами|ах|ов|и|ів)?(?![а-яёіїє])/g, (m, g, e) => (g === 'Г' ? 'К' : 'к') + 'артвел' + (e || '')],
  [/\bGeorgia\b(?! (?:Institute|Tech|State|Bank|Power))/g, 'Sakartvelo'],
  [/\bGeorgiens\b/g, 'Sakartwelos'], [/\bGeorgien\b/g, 'Sakartwelo'],
  [/\ben Géorgie\b/g, 'au Sakartvelo'], [/\bde la Géorgie\b/g, 'du Sakartvelo'], [/\bde Géorgie\b/g, 'du Sakartvelo'], [/\bla Géorgie\b/g, 'le Sakartvelo'], [/Géorgie/g, 'Sakartvelo'],
  [/Gürcistan'ın/g, "Sakartvelo'nun"], [/Gürcistan'a/g, "Sakartvelo'ya"], [/Gürcistan'da/g, "Sakartvelo'da"], [/Gürcistan'dan/g, "Sakartvelo'dan"], [/Gürcistan'ı/g, "Sakartvelo'yu"], [/Gürcistan/g, 'Sakartvelo'],
];
export const sakartvelo = (s) => { s = String(s ?? ''); for (const [a, b] of RULES) s = s.replace(a, b); return s; };
