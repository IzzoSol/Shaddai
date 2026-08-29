# SHADDAI — "How should I organize my media/creation tools?" (brief for Perplexity)

> Paste this whole file into Perplexity (or any LLM) and ask the questions at the bottom.
> It contains the full architecture of my app + my video Clipper so you can give grounded advice.

---

## 0. TL;DR of the decision I'm stuck on

I have two things:
1. **SHADDAI** — a big AI-agent dashboard (one giant HTML file) with a **Media tab** that generates images/video/music, and a **Workflows tab** that hides a **Simple Mode** creator.
2. **SHADDAI Clipper** — a separate, fully-working app that turns long videos into captioned vertical shorts.

I want to **combine the Clipper + the video generator + image/music + a gallery into one clean place** (working name **"Shaddai Media"**), **without making it cluttered**. I also want to **move Simple Mode out of Workflows** to a prominent dashboard button (maybe "Quick Create"), and **upgrade the tab emojis/icons**.

**Should these tools be one unified tab, or stay separate? And how do I keep it clean given I already have 28 top-level tabs?**

---

## 1. SHADDAI dashboard — what it is

- **Product:** an AI-agent marketplace / operator dashboard. 7 branded agents (SHADDAI, NEXUS, ZEROX, ORACLE, TURTLE, QUILL, PIKADON).
- **Architecture:** a **single ~52,000-line `public/index.html`** (vanilla JS, no framework — incremental edits only, no React rewrite) + a Node/Express backend. Deployed on **Render** (auto-deploys on push to `main`).
- **Navigation:** one function `showView('<id>')` switches ~**28 top-level tabs**:
  `agents, apis, aura, automation, billing, chat, content-studio, dash, documents, forge, grid, library-notes, marketplace, media, news, office, oracle, pipeline, projects, security, sentiment, settings, skills, social, toolbrowser, turtle, workflow, zerox`
- **Pop-out modules:** tools open as floating panels via one function `expandModule(cfg)` (`cfg = {title, content, accentColor, icon}`) — used by agent chat, video studio, music, writer, etc.

### 1a. The Media tab (`showView('media')`) — current + planned
- **Now:** generates image / video / music through pop-out modules.
- **Approved spec** (already written) adds:
  - **Free video that works at $0:** free FLUX image → animate on `<canvas>` (pan/zoom) → record with `MediaRecorder` → downloadable `.webm` (100% client-side, always works). Plus an honest "real AI video (beta)" button via HuggingFace LTX/Wan free tier. Plus **BYOK** (user's own fal.ai key). Plus a **funded/paid** path that's dormant until an env var `FAL_KEY` is set.
  - **Real per-user gallery:** signed in → saves to `/api/gallery` (persists across redeploys); anonymous → browser `localStorage` only.
  - **Agentic-HUD pop-out restyle:** thick agent-colored borders, corner brackets, bold ✕ close, draggable by header, better spacing/legibility — applied once in `expandModule` so every panel inherits it.
- **Backend files:** `backend/video-routes.js`, `backend/media-gen.js`, `backend/media-save.js`, `backend/gallery-routes.js`, `backend/video-providers.js`, `backend/turtle-video-endpoints.js`.

### 1b. Workflows tab + Simple Mode
- `showView('workflow')` holds the workflow builder **and** a **"Simple Mode"** guided creator.
- **Problem:** I love the Workflow tab **without** Simple Mode, but Simple Mode is buried/unseen there. I want to **move Simple Mode to the main dashboard as a button** (e.g. **"Quick Create"**) so beginners find it.

### 1c. Known constraints
- No framework rewrite; incremental edits to the one big HTML file.
- Image gen uses **HuggingFace FLUX** (Pollinations is banned in this project).
- Cost-conscious: no paid API spend until subscription revenue exists.

---

## 2. SHADDAI Clipper — the full spec

A **separate, fully-working app** (its own repo `IzzoIzzoIzzo/Shaddai-Clipper-Feature-`, folder `SHADDAI CLIPPER`). It turns a long video into short, captioned, vertical clips.

### 2a. Tech stack (important: it's self-hosted and $0 per use)
- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + Zustand. Multi-page SPA.
- **Engine:** Fastify (Node 18+). **Whisper transcription runs locally in-process** via `@huggingface/transformers` (Transformers.js, ONNX/WASM) — **no API key, no per-call fee.** **ffmpeg-static** for all video cut/scale/caption-burn. Narration has a deterministic fallback (no LLM key needed).
- **Runs on port 8787.** Serves its own built UI. One-command launch (`START-CLIPPER.bat`).
- **Cost model:** **near-zero marginal cost** — only server CPU/RAM/disk/bandwidth. No metered APIs.

### 2b. Features (all built + verified this month)
- **Upload** a long video (multipart).
- **Transcription:** local Whisper (`tiny.en` default, `base.en`/`small.en` via env). **Windowed** (2-min chunks) with **live progress %** so a 25-min video shows a climbing bar instead of freezing.
- **Highlight detection:** real per-window **audio-energy (RMS)** scoring + linguistic/sentiment/question signals + **timeline diversity** (spreads picks across the video, not clustered).
- **Render:** true **9:16 vertical** (1080×1920) for TikTok/Reels/Shorts and **16:9** (1920×1080) for X/LinkedIn, H.264 MP4.
- **Burned-in captions:** TikTok-style subtitles baked into the MP4 (toggle).
- **Transcript tools:** download **.SRT / .TXT**, inline **edit** (persists), client-side **search**.
- **Per-clip covers** (real ffmpeg frame; optional HF FLUX stylized when a token is set).
- **AURA token-saver** integrated (caches LLM/HF calls; free/offline-safe).
- **4 switchable art themes** (Cutting Room dark / Arcade cartoon / Abstract Gallery / Luxury Editorial) + a cinematic boot sequence, each with distinct fonts.
- **Media Gallery** page — browse/play/download all rendered clips (its own gallery, per-clip).
- **Credits system (free during beta):** balance/spend/gate plumbing built, `BETA_FREE=true` = unlimited free now; flip one flag to start charging.
- **Concurrency queue:** caps simultaneous Whisper/ffmpeg jobs (`MAX_JOBS`, default 2) and queues the rest, so a burst of users degrades gracefully instead of crashing.

### 2c. Key API endpoints (mounted at `/api/clips/v1`)
- `POST /sources` (upload) · `GET /sources` · `GET /sources/:id` (transcript + candidates)
- `GET /sources/:id/transcript.srt` / `.txt` · `PATCH /sources/:id/transcript` (edit) · `DELETE /sources/:id`
- `POST /generate {sourceId, candidateIds[], platforms[], burnCaptions}` · `GET /batches/:id`
- `GET /aura/stats` · files served at `/files/...`

### 2d. Current dashboard integration
- The dashboard **embeds the Clipper via an `<iframe>`** (dev `http://localhost:8787/clips`, prod placeholder `https://shaddai-clipper.onrender.com`). It's **Pro-gated** in the dashboard today.
- Decision made earlier: the Clipper **deploys as its own always-on Render service** (not merged into the dashboard backend) to keep Whisper's RAM off the main product; the dashboard just embeds it.

### 2e. Scaling reality (so advice is grounded)
- **Browsing:** hundreds fine (static UI + tiny JSON).
- **Transcribing/rendering simultaneously:** single Node process, CPU-bound Whisper + ffmpeg, in-memory state → realistically **~2–4 concurrent heavy jobs**. The queue lets ~100 people *use* it (they wait in line during spikes). True 100-simultaneous needs a GPU/worker fleet later.

---

## 3. What I'm trying to decide (the actual question)

I want a **single "Shaddai Media" surface** that feels **organized and clean**, holding: **Create** (image/video/music generation), the **Clipper**, and a **unified Gallery**. I also want the **video generator reachable inside the Clipper** (e.g. drop a generated image/clip in as an intro card / b-roll). And I want to **move Simple Mode → a "Quick Create" button** on the main dashboard, and **upgrade the tab emojis/icons** (ideally custom, not basic).

The candidate structure I'm considering:
```
🎬 SHADDAI MEDIA  (one top-level tab)
   ├─ ✦ Create    → Image (free FLUX) · Video (free motion-clip + HF beta + BYOK) · Music
   ├─ ✂ Clipper   → the full Clipper app (embedded iframe today)
   └─ ▦ Gallery   → ONE unified per-user gallery (Create outputs + Clipper clips)
```

---

## 4. Questions for you (Perplexity)

1. **One unified "Shaddai Media" tab (with Create / Clipper / Gallery sub-tabs) vs. keeping the Clipper as its own separate tab** — which is better for UX and for a solo maker to maintain, given the app already has 28 tabs and the Clipper is a heavy, iframe-embedded, separately-deployed app? What are the trade-offs?
2. **Gallery:** should the Clipper's own gallery and the dashboard's `/api/gallery` **merge into one**, or stay separate? If merge, what's the cleanest way (the Clipper is a different origin/service)?
3. **Reducing clutter:** with 28 top-level tabs, how should I **group/consolidate** them (e.g. into a smaller set of sections or a command palette) so adding "Shaddai Media" doesn't make it worse?
4. **Simple Mode → "Quick Create":** best pattern for surfacing a beginner one-click creator on a crowded dashboard — a prominent primary button that opens a modal? a hero card on the home tab? Something else?
5. **Iframe vs. deeper fusion:** is embedding the Clipper via iframe the right long-term call, or should I eventually port it into the dashboard? What signals would tell me to switch?
6. **"Video generator inside the Clipper":** what's the cleanest UX for letting someone generate an image/clip and drop it into a video they're clipping (intro card / b-roll) without bloating either tool?
7. **Emojis/icons:** for a neon/agentic brand, are custom SVG/generated icons worth it over emoji for top-level tabs, and how do I keep a set consistent?

Please recommend a concrete structure with reasoning, and flag anything risky for a solo, cost-constrained, single-HTML-file build.
