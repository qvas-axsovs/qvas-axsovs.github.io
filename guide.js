// Audio guide: a small animated guide figure that tells the story aloud (Web Speech API) with live subtitles.
import { t, LANG } from './i18n.js?v=60';
import { loadVoice, synth, voiceCached, hasVoice } from './voice_ka.js?v=60';
import { sayText } from './say.js?v=60';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BCP = { ka: 'ka-GE', en: 'en-GB', ru: 'ru-RU', uk: 'uk-UA', tr: 'tr-TR', de: 'de-DE', fr: 'fr-FR' };

const FIGURE = `
<svg class="guide-fig" viewBox="0 0 80 120" aria-hidden="true">
  <ellipse cx="40" cy="116" rx="20" ry="3.5" fill="rgba(0,0,0,.35)"/>
  <g class="g-body">
    <path d="M30 112 L33 84 L47 84 L50 112 Z" fill="#3a2c1e"/>
    <rect x="31" y="108" width="8" height="5" rx="2" fill="#1a1511"/><rect x="41" y="108" width="8" height="5" rx="2" fill="#1a1511"/>
    <path d="M26 86 Q27 58 40 56 Q53 58 54 86 Z" fill="#7a2e14"/>
    <path d="M40 57 L36 86 M40 57 L44 86" stroke="#b88a30" stroke-width="1.4" fill="none" opacity=".8"/>
    <rect x="28" y="70" width="24" height="3" rx="1.5" fill="#b88a30"/>
    <path d="M52 66 Q60 72 56 82 L50 80 Z" fill="#a88a64"/>
    <g class="g-arm-l"><path d="M28 62 Q20 72 23 82" stroke="#7a2e14" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="23" cy="83" r="3.2" fill="#e8c9a4"/></g>
    <g class="g-arm-r">
      <path d="M52 62 Q60 56 63 46" stroke="#7a2e14" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="63.5" cy="45" r="3.2" fill="#e8c9a4"/>
      <line x1="64" y1="48" x2="64" y2="14" stroke="#3a2c1e" stroke-width="1.6"/>
      <path class="g-flag" d="M64 14 L78 18 L64 23 Z" fill="#b88a30"/>
    </g>
    <g class="g-head">
      <rect x="36" y="48" width="8" height="8" rx="3" fill="#e8c9a4"/>
      <circle cx="40" cy="40" r="11" fill="#e8c9a4"/>
      <path d="M29 37 Q40 22 51 37 Z" fill="#3a2c1e"/>
      <ellipse cx="40" cy="31" rx="17" ry="3.2" fill="#2a2018"/>
      <path d="M32 31 Q40 20 48 31 Z" fill="#2a2018"/><rect x="32" y="28" width="16" height="2.4" fill="#b88a30"/>
      <g class="g-eyes"><circle cx="36" cy="40" r="1.4" fill="#1a1511"/><circle cx="44" cy="40" r="1.4" fill="#1a1511"/></g>
      <path d="M35 37 Q36.5 36 38 37 M42 37 Q43.5 36 45 37" stroke="#3a2c1e" stroke-width=".9" fill="none"/>
      <ellipse class="g-mouth" cx="40" cy="46" rx="2.6" ry=".9" fill="#7a2e14"/>
      <circle cx="33.5" cy="43.5" r="1.8" fill="#e8a08a" opacity=".5"/><circle cx="46.5" cy="43.5" r="1.8" fill="#e8a08a" opacity=".5"/>
    </g>
  </g>
</svg>`;

// abbreviations after which a dot does not end the sentence (Georgian register style: "XII ს.", "1966 წ.", "ძვ. წ.")
const ABBR = /(?:^|[\s\d.,(-])(?:ს|სს|წ|წწ|ძვ|ახ|დას|ნახ|აღმ|სამხ|ჩრდ|სოფ|მდ|ქ|კმ|ტ|მ|ა|ღ|ე|ი|შ|მუნ|სახ|მაგ|დაახ|წმ|კვ|ათ|მლნ|ეკლ|მონ|[A-ZА-ЯІЇЄ]|[IVX]+|св|свв|г|гг|в|вв|ул|им|ок|оз|пос|обл|тыс|млн|муниц|д|р|с|м|ст|рр|вул|бл|ім|тис|н|э|е|т|зв|St|Ste|Dr|Mt|ca|c|Jh|Jhs|Chr|bzw|z|u|env|av|apr|yy|yak)\.$/;
function sentences(text) {
  const parts = String(text).replace(/\s+/g, ' ').match(/[^.!?…;]+[.!?…;]*\s*/g)?.map(s => s.trim()).filter(Boolean) || [];
  const out = [];
  for (const p of parts) { const last = out[out.length - 1]; if (last && (ABBR.test(last) || /\d\.$/.test(last) || last.length < 12)) out[out.length - 1] = last + ' ' + p; else out.push(p); }
  return out.filter(s => s.length > 1);
}
// browser voices good enough to keep (neural voices in Edge / Safari); otherwise the guide uses its own neural voice
const greatVoice = (v) => !!v && /(natural|neural|premium|enhanced|siri)/i.test(v.name);
function pickVoice(lang) {
  const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith(lang));
  const score = (v) => (/(premium|enhanced|natural|neural)/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  return vs.sort((a, b) => score(b) - score(a))[0] || null;
}
const voicesReady = new Promise(res => {
  if (!('speechSynthesis' in window)) return res();
  if (speechSynthesis.getVoices().length) return res();
  speechSynthesis.onvoiceschanged = () => res(); setTimeout(res, 1500);
});

export function createGuide(host) {
  const el = document.createElement('div'); el.className = 'guide'; el.hidden = true;
  el.innerHTML = `${FIGURE}<div class="guide-bubble"><p class="guide-line"></p><small class="guide-note"></small>
    <div class="guide-ctl"><button data-a="pause" aria-label="pause">❚❚</button><button data-a="stop" aria-label="stop">■</button></div></div>`;
  host.appendChild(el);
  const line = el.querySelector('.guide-line'), note = el.querySelector('.guide-note');
  let queue = [], idx = 0, playing = false, paused = false, timer = 0, voice = null, run = 0, audio = null, ctx = null, src = null, mode = '';

  const talk = (on) => el.classList.toggle('talking', on);
  function stop() {
    run++; playing = false; paused = false; clearTimeout(timer);
    try { speechSynthesis.cancel(); } catch { /* none */ }
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
    if (src) { try { src.onended = null; src.stop(); } catch { /* ended */ } src = null; }
    if (mode === 'piper') ctx?.resume?.(); mode = '';
    talk(false); el.classList.remove('on'); setTimeout(() => { if (!playing) el.hidden = true; }, 400);
  }
  function next(my) {
    if (my !== run) return;
    if (idx >= queue.length) { talk(false); line.textContent = t('guide_end'); playing = false; setTimeout(() => { if (my === run && !playing) stop(); }, 3500); return; }
    const s = queue[idx++]; line.textContent = s;
    if (voice) {
      const u = new SpeechSynthesisUtterance(sayText(s, LANG)); u.voice = voice; u.lang = voice.lang; u.rate = .96; u.pitch = 1;
      u.onstart = () => talk(true);
      u.onboundary = () => { el.classList.add('beat'); setTimeout(() => el.classList.remove('beat'), 120); };
      u.onend = () => { talk(false); timer = setTimeout(() => next(my), 220); };
      u.onerror = () => { talk(false); timer = setTimeout(() => next(my), 200); };
      speechSynthesis.speak(u);
    } else {
      talk(true); timer = setTimeout(() => { talk(false); next(my); }, Math.max(1800, s.length * 65));
    }
  }
  el.querySelector('.guide-ctl').onclick = (e) => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'stop') return stop();
    if (a === 'pause') {
      paused = !paused; e.target.textContent = paused ? '▶' : '❚❚';
      if (audio) paused ? audio.pause() : audio.play();
      else if (mode === 'piper') paused ? ctx.suspend() : ctx.resume();
      else if (voice) paused ? speechSynthesis.pause() : speechSynthesis.resume();
      else if (paused) clearTimeout(timer); else next(run);
      talk(!paused);
    }
  };
  // recorded narration (e.g. Georgian, where browsers have no voice): subtitles follow the audio clock
  function playRec(text, url, my) {
    queue = sentences(text); idx = 0; playing = true; note.textContent = '';
    const a = audio = new Audio(url); a.preload = 'auto';
    const tot = queue.reduce((n, q) => n + q.length, 0) || 1;
    const marks = []; let acc = 0; for (const q of queue) { marks.push(acc / tot); acc += q.length; }
    a.ontimeupdate = () => {
      if (my !== run || !a.duration) return;
      const f = a.currentTime / a.duration; let i = 0; while (i + 1 < marks.length && marks[i + 1] <= f) i++;
      if (line.textContent !== queue[i]) line.textContent = queue[i];
      el.classList.add('beat'); setTimeout(() => el.classList.remove('beat'), 120);
    };
    a.onplay = () => talk(true); a.onpause = () => talk(false);
    a.onended = () => { if (my !== run) return; talk(false); line.textContent = t('guide_end'); playing = false; audio = null; setTimeout(() => { if (my === run && !playing) stop(); }, 3500); };
    a.onerror = () => { if (my !== run) return; audio = null; speakTTS(text, my); };
    a.play().catch(() => { if (my !== run) return; audio = null; speakTTS(text, my); });
  }
  // Georgian without a browser voice: the free in-browser Piper voice, one sentence ahead
  async function speakPiper(text, my) {
    queue = sentences(text); idx = 0; playing = true; mode = 'piper';
    el.hidden = false; requestAnimationFrame(() => el.classList.add('on'));
    line.textContent = '…'; note.textContent = '';
    try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); await ctx.resume(); } catch { /* resumes on play */ }
    if (!(await voiceCached(LANG)) && my === run) note.textContent = t('voice_dl', { p: 0 });
    try { await loadVoice(f => { if (my === run) note.textContent = t('voice_dl', { p: Math.round(f * 100) }); }, LANG); }
    catch (e) { console.warn('voice', e); if (my !== run) return; mode = ''; voice = 'speechSynthesis' in window ? pickVoice(LANG) : null; note.textContent = voice ? '' : t('guide_novoice'); return next(my); }
    if (my !== run) return; note.textContent = '';
    const jobs = new Map(); let chain = Promise.resolve();
    const get = (i) => { if (i >= queue.length) return null; if (!jobs.has(i)) jobs.set(i, chain = chain.then(() => synth(queue[i], LANG)).catch(() => null)); return jobs.get(i); };
    const step = async () => {
      if (my !== run) return;
      if (idx >= queue.length) { talk(false); line.textContent = t('guide_end'); playing = false; mode = ''; setTimeout(() => { if (my === run && !playing) stop(); }, 3500); return; }
      const i = idx++; line.textContent = queue[i];
      const a = await get(i); get(i + 1);
      if (my !== run) return;
      if (!a) return step();
      const buf = ctx.createBuffer(1, a.pcm.length, a.rate); buf.copyToChannel(a.pcm, 0);
      const s = src = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination);
      s.onended = () => { if (src === s) src = null; talk(false); if (my === run) timer = setTimeout(step, 160); };
      talk(true); s.start();
    };
    step();
  }
  async function speakTTS(text, my) {
    await voicesReady; if (my !== run) return;
    audio = null; voice = 'speechSynthesis' in window ? pickVoice(LANG) : null;
    if (hasVoice(LANG) && !greatVoice(voice)) return speakPiper(text, my);
    note.textContent = voice ? '' : t('guide_novoice');
    queue = sentences(text); idx = 0; playing = true;
    el.hidden = false; requestAnimationFrame(() => el.classList.add('on'));
    line.textContent = '…';
    setTimeout(() => next(my), 500);
  }
  async function speak(text, rec) {
    stop(); const my = ++run;
    el.hidden = false; requestAnimationFrame(() => el.classList.add('on'));
    if (rec) { line.textContent = '…'; return playRec(text, rec, my); }
    return speakTTS(text, my);
  }
  // a short line in the bubble, said aloud when possible (recorded file for languages without a browser voice).
  // Browsers forbid sound before the visitor's first tap, so then it waits for that tap.
  function greet(text, ms = 2600, rec = null) {
    const my = ++run; clearTimeout(timer); playing = false; paused = false;
    try { speechSynthesis.cancel(); } catch { /* none */ }
    if (audio) { audio.pause(); audio = null; }
    if (src) { try { src.onended = null; src.stop(); } catch { /* ended */ } src = null; } mode = '';
    el.hidden = false; requestAnimationFrame(() => el.classList.add('on'));
    note.textContent = ''; line.textContent = text;
    talk(true); timer = setTimeout(() => talk(false), ms);
    const later = (fn) => {
      const go = () => { off(); setTimeout(() => { if (my === run && !document.querySelector('.pv.open')) fn(); }, 350); };
      const off = () => ['pointerdown', 'keydown', 'touchstart'].forEach(ev => removeEventListener(ev, go, true));
      ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, go, { capture: true, once: true }));
    };
    const say = async () => {
      if (my !== run) return;
      if (rec) {
        const a = audio = new Audio(rec);
        a.onplay = () => { clearTimeout(timer); talk(true); }; a.onended = () => { talk(false); if (audio === a) audio = null; };
        try { await a.play(); } catch (e) { if (audio === a) audio = null; if (e?.name === 'NotAllowedError') later(say); }
        return;
      }
      await voicesReady; if (my !== run) return;
      const bv = 'speechSynthesis' in window ? pickVoice(LANG) : null;
      if (hasVoice(LANG) && LANG !== 'ka' && !greatVoice(bv) && await voiceCached(LANG)) {
        try {
          const a = await synth(text.replace(/[🎧🔊🔇“”„«»]/gu, ''), LANG); if (my !== run || !a) return;
          ctx ||= new (window.AudioContext || window.webkitAudioContext)(); await ctx.resume();
          if (ctx.state !== 'running') { later(say); return; }
          const buf = ctx.createBuffer(1, a.pcm.length, a.rate); buf.copyToChannel(a.pcm, 0);
          const s2 = src = ctx.createBufferSource(); s2.buffer = buf; s2.connect(ctx.destination);
          s2.onended = () => { if (src === s2) src = null; talk(false); };
          clearTimeout(timer); talk(true); s2.start(); return;
        } catch { /* fall back to the browser voice */ }
      }
      if (!('speechSynthesis' in window)) return;
      const v = bv; if (!v) return;
      const u = new SpeechSynthesisUtterance(sayText(text.replace(/[🎧🔊🔇“”„«»]/gu, ''), LANG)); u.voice = v; u.lang = v.lang; u.rate = .98;
      u.onstart = () => { clearTimeout(timer); talk(true); }; u.onend = () => talk(false);
      u.onerror = (e) => { talk(false); if (e.error === 'not-allowed') later(say); };
      speechSynthesis.speak(u);
    };
    say();
  }
  return { speak, stop, greet, el, get playing() { return playing; } };
}
export const guideLang = () => BCP[LANG];
export { esc as _esc };
