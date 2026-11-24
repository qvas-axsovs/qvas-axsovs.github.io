// Free neural voices for the guide: open Piper (VITS) models running entirely in the visitor's browser.
//   ka → "natia", ru → "dmitri" (male), uk → "ukrainian_tts" speaker "mykyta" (male).
// Files are downloaded once (model 63–77 MB + shared engine ≈ 30 MB) and kept in Cache Storage, so it then works offline.
// Phonemes: piper_phonemize (espeak-ng, WASM). Inference: onnxruntime-web (WASM, single thread).
const BASE = new URL('vendor/piper/', location.href).href;
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/';
export const VOICES = {
  ka: { model: HF + 'ka/ka_GE/natia/medium/ka_GE-natia-medium.onnx', size: 63.2e6, sid: null, speed: 1 },
  ru: { model: HF + 'ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx', size: 63.2e6, sid: null, speed: 1.3 },
  uk: { model: HF + 'uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium.onnx', size: 76.7e6, sid: 1, speed: 1, stress: 'data/uk_stress.json' },
};
const CACHE = 'geoarch-voice-v1';

const script = (src) => new Promise((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) return res();
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s);
});

// fetch through our own cache, reporting download progress
async function cached(url, prog) {
  let c = null; try { c = await caches.open(CACHE); } catch { /* no Cache Storage */ }
  const hit = c && await c.match(url); if (hit) return hit.arrayBuffer();
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  const total = +r.headers.get('Content-Length') || 0, rd = r.body?.getReader(), parts = []; let got = 0;
  if (!rd) { const b = await r.arrayBuffer(); c?.put(url, new Response(b)); return b; }
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; prog?.(got, total); }
  const blob = new Blob(parts); try { await c?.put(url, new Response(blob)); } catch { /* quota */ }
  return blob.arrayBuffer();
}

export const hasVoice = (lang) => !!VOICES[lang];
export const voiceCached = async (lang = 'ka') => { try { return !!(await (await caches.open(CACHE)).match(VOICES[lang].model)); } catch { return false; } };

// the engine (phonemizer + onnxruntime) is shared by all languages
let engine = null;
function loadEngine(p) {
  return engine ||= (async () => {
    await Promise.all([script(BASE + 'ort.wasm.min.js'), script(BASE + 'piper_phonemize.js')]);
    const [wasm, data, ortWasm] = await Promise.all([
      cached(BASE + 'piper_phonemize.wasm', p?.('w')), cached(BASE + 'piper_phonemize.data', p?.('d')), cached(BASE + 'ort-wasm-simd.wasm', p?.('o')),
    ]);
    const ort = window.ort;
    ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = { 'ort-wasm-simd.wasm': URL.createObjectURL(new Blob([ortWasm], { type: 'application/wasm' })), 'ort-wasm.wasm': BASE + 'ort-wasm.wasm' };
    return { wasm, data, ort };
  })().catch(e => { engine = null; throw e; });
}

const ready = {};
// progress(fraction 0..1) is called while the big files download the first time
export function loadVoice(progress, lang = 'ka') {
  const v = VOICES[lang]; if (!v) return Promise.reject(new Error('no voice ' + lang));
  return ready[lang] ||= (async () => {
    const SIZES = { m: v.size, w: 0.64e6, d: 18.1e6, o: 10.7e6 }, done = { m: 0, w: 0, d: 0, o: 0 };
    const all = Object.values(SIZES).reduce((a, b) => a + b, 0);
    const p = (k) => (got) => { done[k] = got; progress?.(Math.min(1, Object.values(done).reduce((a, b) => a + b, 0) / all)); };
    const [E, cfgBuf, model, stressBuf] = await Promise.all([loadEngine(p), cached(v.model + '.json'), cached(v.model, p('m')),
      v.stress ? cached(new URL(v.stress, location.href).href).catch(() => null) : null]);
    const cfg = JSON.parse(new TextDecoder().decode(cfgBuf));
    // word → which vowel carries the stress (from the open Ukrainian stress dictionary, lang-uk/ukrainian-word-stress)
    cfg.stress = stressBuf ? new Map(Object.entries(JSON.parse(new TextDecoder().decode(stressBuf)))) : null;
    const session = await E.ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
    return { ...E, cfg, session, v };
  })().catch(e => { ready[lang] = null; throw e; });
}

function phonemeIds(V, text) {
  return new Promise((res, rej) => {
    let got = false;
    window.createPiperPhonemize({
      print: (l) => { if (got) return; try { got = true; res(JSON.parse(l).phoneme_ids); } catch (e) { rej(e); } },
      printErr: () => {},
      wasmBinary: V.wasm,
      getPreloadedPackage: () => V.data,
      locateFile: (f) => BASE + f,
    }).then(m => {
      m.callMain(['-l', V.cfg.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
      setTimeout(() => { if (!got) rej(new Error('phonemize: no output')); }, 4000);
    }, rej);
  });
}

const UK_V = 'аеєиіїоуюя';
import { UK_NAMES } from './uk_names.js?v=60';
const UK_STEMS = Object.keys(UK_NAMES).sort((a, b) => b.length - a.length);
function addStress(text, dict) {
  if (!dict) return text;
  return text.replace(/[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ'’]+/g, (w) => {
    const lw = w.toLowerCase().replace(/’/g, "'");
    let k = dict.get(lw);
    if (!k) { const st = UK_STEMS.find(x => lw.startsWith(x)); if (st) k = UK_NAMES[st]; }
    if (!k) return w;
    let n = 0;
    for (let i = 0; i < w.length; i++) if (UK_V.includes(lw[i]) && ++n === k) return w.slice(0, i + 1) + '\u0301' + w.slice(i + 1);
    return w;
  });
}
function letterIds(cfg, text) {
  text = addStress(text, cfg.stress);
  const map = cfg.phoneme_id_map, pad = map._[0], out = [...map['^'], pad];
  for (const ch of text.toLowerCase().replace(/[«»„“”"()\[\]]/g, '').replace(/[–]/g, '—').normalize('NFD')) {
    const id = map[ch] ?? (ch === '’' || ch === 'ʼ' ? map["'"] : null);
    if (id) { out.push(...id, pad); }
  }
  out.push(...map.$);
  return out;
}

export { sayKa as speakableKa } from './ka_say.js?v=60';
import { sayText } from './say.js?v=60';

// one sentence → { pcm: Float32Array, rate }
export async function synth(text, lang = 'ka') {
  const V = await loadVoice(null, lang);
  // most voices use espeak phonemes; some (Ukrainian) are trained on letters: map each letter, Piper-style, with pads between
  const ids = V.cfg.phoneme_type === 'text' ? letterIds(V.cfg, sayText(text, lang)) : await phonemeIds(V, sayText(text, lang));
  if (!ids?.length) return null;
  const { ort, cfg, v } = V, inf = cfg.inference;
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    // a touch slower and a little more expressive than default: reads like a guide, not a machine
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale, inf.length_scale * v.speed, inf.noise_w]), [3]),
  };
  if (Object.keys(cfg.speaker_id_map || {}).length) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(v.sid ?? 0)]), [1]);
  const out = await V.session.run(feeds);
  // even loudness between voices and sentences: bring the peak to about -1 dB
  const pcm = out.output.data; let peak = 0; for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
  if (peak > 0.01) { const g = Math.min(4, 0.89 / peak); for (let i = 0; i < pcm.length; i++) pcm[i] *= g; }
  return { pcm, rate: cfg.audio.sample_rate };
}
