# ქვის მეხსიერება — საქართველოს არქიტექტურა

Free public website (Georgian) with an interactive 3D scene, scroll-driven camera transitions,
a monuments catalog, and accounts: favorites, reviews, personal routes.

Static site — no build step. Libraries are vendored in `vendor/` (three.js 0.160, GSAP 3.12.5,
supabase-js 2.45, Noto Serif/Sans Georgian).

## Run locally
    python3 -m http.server 8000      # then open http://localhost:8000

Without Supabase keys the site runs in **demo mode** (accounts stored only in that browser).

## Go live for free (GitHub Pages + Supabase)
1. **Supabase** (supabase.com → New project, free tier).
   - SQL Editor → paste `supabase.sql` → Run.
   - Authentication → URL Configuration → Site URL = your GitHub Pages URL.
   - Project Settings → API → copy *Project URL* and *anon public* key into `config.js`.
     (The anon key is meant to be public; data is protected by the RLS policies in `supabase.sql`.)
2. **GitHub** → new public repository → upload all files of this folder (keep the structure).
   - Settings → Pages → Source: *Deploy from a branch* → `main` / root → Save.
   - The site appears at `https://<username>.github.io/<repo>/` in about a minute.

Optional: own domain in Settings → Pages → Custom domain.

## Files
- `index.html`, `styles.css` — layout and design
- `app.js` — UI, animations, auth, data layer (Supabase or local demo)
- `scene.js` — procedural 3D world (church, Svan towers, cave city, modernist block)
- `data.js` — eras and monuments (Georgian texts)
- `config.js` — Supabase keys
- `supabase.sql` — database tables and security policies

## Georgian voice
- Recorded narration for the 46 curated places and the greeting: ElevenLabs, voice "Giorgi" (`audio/ka/`).
- Everything else in Georgian is read by the free open Piper voice "ka_GE natia (medium)" (trained on RHVoice Natia data,
  https://huggingface.co/rhasspy/piper-voices) running in the browser with onnxruntime-web (MIT) and piper_phonemize/espeak-ng (GPL-3, WASM),
  files in `vendor/piper/`; the model is fetched from Hugging Face on first use and kept in Cache Storage `geoarch-voice-v1`.

## Photographs
Hero, chapter, era and monument photos come from Wikimedia Commons under their own free licences (CC BY / CC BY-SA / public domain);
author, licence and a link to the file page are shown on each photo and listed in `photos.js`. Files are resized copies in `photos/`.
