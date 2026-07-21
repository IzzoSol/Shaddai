# SHADDAI Dashboard — Fix Handoff for OpenCode (2026-07-21)

**Repo:** `SHADDAI MASTER FINAL BUILD` → GitHub `IzzoSol/Shaddai` branch `main` → auto-deploys to Render (`shaddai-g81x.onrender.com`).
**Server:** one Node/Express service, `node backend/server-production.js` on `:3000`. Static files in `public/`. CommonJS.
**Pattern to follow:** self-contained JS modules included from `index.html` (see `command-terminal.js`, `theme-switcher.js`, `media-studio.js`, `free-use-tracker.js`). Avoid deep edits to the 55k-line `index.html` when a module will do. Bump the `?v=N` query on the `<script>` include when you change a module so browsers reload it.
**Verify pattern:** puppeteer-core + system Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`, `headless:'new'`, args `--no-sandbox --use-gl=swiftshader`). Use `page.keyboard.press()` for real key events (synthetic `KeyboardEvent` has `bubbles:false`).

Core UX principle the owner keeps repeating: **NO windows-inside-windows.** Content renders ON the tab natively or opens FULL — never an iframe embedded inside a panel.

---

## ✅ DONE this session (already pushed — context only)
- **Theme switcher** (`theme-switcher.js` + Command Hub dropdown): the 6 skins `glitch/terminal/brutalist/serif/void/amber` (defined in `index.html` `html[data-theme-skin="…"]` ~L3774–3870) are now switchable + persisted (`localStorage 'shd_theme_skin'`, `window.setThemeSkin(id)`). Floating picker bottom-left; Command Hub `#shdtTheme` drives the same key.
- **Command Hub**: single `◈ Command Hub` nav button; Office/Forge/Rooms consolidated (old tabs hidden) in `command-terminal.js consolidateNav()`.
- **Media Studio takeover reverted** (`media-studio.js` no longer hijacks the Media nav button).
- **SECURITY: cross-user data leak fixed** — `/api/tasks/receipts` scoped per user; do NOT regress this (see `SHADDAI_CROSS_USER_LEAK_FIX_20260721`).

---

## 1. HF images covering Media + Home tab buttons
**Goal:** the tool buttons in the **Media** view and the **Home/dashboard** cards show a full-cover image (HuggingFace-generated art) as the button background, not a tiny 18×18 icon.

**Where:**
- Nav/tool buttons already reference art via `<img src="/api/forge/art/module-*.png" …>` (e.g. `index.html` L4161–4186). The art endpoint is `/api/forge/art/:name.png`.
- Media view content buttons: search `index.html` for `generateContent('thread'|'image'|'video'|'music')` and the `stab_panel_*` blocks (~L41968+).

**Fix approach (two parts):**
1. **Generate the art (HF):** for each button, generate a themed image via HuggingFace (FLUX) and save to `public/assets/buttons/<key>.png` (or serve through `/api/forge/art`). Keys needed: `image, video, music, thread, research, market, safety` (Media) + the Home cards. Prompt style = SHADDAI obsidian/emerald/sacred-geometry. (Owner has HF keys in `backend/.env` — never commit them.)
2. **CSS full-cover:** give each button a background image that covers it, with a dark scrim so text stays legible. Do it in a small module `button-art.js` (mount on load), mapping `[data-btn-art="image"]` → the asset, applying:
   ```css
   .btn-art{position:relative;background-size:cover;background-position:center;color:#fff}
   .btn-art::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,8,11,.15),rgba(6,8,11,.72));border-radius:inherit}
   .btn-art > *{position:relative;z-index:1}
   ```
   Add `data-btn-art="<key>"` to the target buttons (or select them by their existing onclick) and set `el.style.backgroundImage='url(/assets/buttons/<key>.png)'`.
**Acceptance:** each Media/Home button shows a full-cover image with readable label; no layout shift; falls back to current icon if the image 404s (`onerror`).

---

## 2. Office tab = ONLY a customizable office (APPROVED design)
**Problem:** `command-terminal.js renderOffice()` loads `game.html?embed=office` (the WHOLE city) in an iframe — that's the "it opens the city" bug.

**Target:** an office-only manager (no game engine in the tab), **persistent to the real game**:
- **Pick a preset office** (ready-made themes so users don't have to build one).
- **Select / switch an open city lot** in SHADDAI City (others can visit that address).
- **Name + visibility** (private / visitable / hireable-studio).
- Decor/furnishing = LATER (not now).

**Backend (`backend/office-service.js`, routes in `server-production.js`):**
- Office already has `getOffice/claimOffice/officeWithRooms/cityOffices/slotCoords`. Add persisted fields `preset`, `name`, `visibility`, `slot` to the office record.
- Add `PATCH /api/office` (softAuth) to update `{name,preset,visibility}`.
- Add `POST /api/office/switch-lot` (softAuth) `{slot}` → validate the lot is not taken (check `cityOffices()`), then set `office.slot`. `game.html` Founders' Row already renders owned offices from `/api/city/offices` by `slot`, so the change shows in the game automatically.
- Keep everything scoped by `req.userId` (softAuth) — do not leak other users' offices.

**Frontend (`command-terminal.js renderOffice()`):** replace the iframe with:
- Header: office name + address (lot #) + visibility badge.
- Preset row: clickable preset cards → `PATCH /api/office {preset}` and show the preset's preview image.
- Lot selector: list from `/api/city/offices` marking open vs taken; "Set up here" / "Switch" → `POST /api/office/switch-lot`.
- Name input + visibility select → `PATCH /api/office`.
- A single **"Visit my office in the game →"** button that opens `game.html?embed=office&uid=<ownerUserId>` **FULL** (`window.location`/`window.open`), NOT an embedded iframe.
**Acceptance:** the Office tab never loads the city inline; changing preset/name/visibility/lot persists and is reflected when you open the game.

---

## 3. Forge renders on the tab, not in an iframe window
**Problem:** `command-terminal.js renderForge()` embeds `/forge.html` / `/pixel-forge.html` in `#shdtForgeStage` as an iframe = window-in-window.

**Fix:** the "Make your own" method cards (`data-mk`) should **navigate full** to the forge tool (`window.location.href = src`) instead of injecting an iframe into `#shdtForgeStage`. Presets already navigate to `/_LAUNCH.html`. Remove the `#shdtForgeStage` iframe branch entirely.
**Acceptance:** clicking a build method opens the real forge full-screen; no iframe nested in the Command Hub.

---

## 4. Forge: users generate their OWN 3D models → marketplace
**Goal:** the make-your-own lanes (Image→3D / Three.js / Meshy / Upload) actually PRODUCE a 3D model and let the user **list it on the marketplace**.
**Approach:**
- Image→3D / Meshy: wire to the model pipeline (Meshy needs a key in `.env`; Three.js procedural needs no key — ship that lane first). Save output to the user's gallery (`/api/collectibles` or a models store, scoped by `req.userId`).
- Add a "List on marketplace" action on a finished model → creates a marketplace listing (existing `showView('marketplace')` / collectibles system).
**Acceptance:** a user can generate/upload a 3D model, see it in their gallery, and list it for others.

---

## 5. AURA renders natively in the dashboard (no iframe / no redirect)
**Problem:** the AURA "Live console" (`index.html` ~L10337–10349) is an `#auraFrame` iframe loading `/aura.html` via `activateAura()`, and it navigates to the home page.
**Fix:** render the AURA console content directly in the AURA view (inline DOM / a module), or at minimum make "Full screen" open `/aura.html` in a new tab and remove the embedded iframe + the home redirect. Find `activateAura()` and stop it from navigating away.
**Acceptance:** AURA stays in the dashboard; no iframe-in-panel; no bounce to home.

---

## 6. Remove leftover AURA demo widgets
In `index.html` AURA view:
- **"Try it — live optimizer"** block: `#auraOpt` (~L10264–10334), including its self-contained `<script>` (`window.__auraOptInit`). Delete the whole `<div class="aura-sec cy" id="auraOpt" …>…</div>`.
- **"TRY AURA — type anything (FREE vs PAID miss)"** ask widget (examples: `average of 12, 18, 30`, `255 in hex`, `roman numeral for 2025`, `3 hours in minutes`, `20% off 80`, output placeholder `awaiting a prompt…`). Find by those strings and remove the block.
**Acceptance:** neither demo widget renders in the AURA tab.

---

## 7. Gallery leftover "Anime Girl" item
A stale item `🖼 IMAGE · Jul 6 · "Anime Beautiful Anime Girl Rated R"` shows in the Gallery. It is NOT hardcoded and `backend/data/gallery.json` is empty `{}`.
**Find the real source:** it's a saved record — check `/api/collectibles/list`, `/api/media`, or per-browser `localStorage` (the item has a 🗑 delete already). Grep the render for the gallery list (`index.html` ~L45277 `/api/collectibles`, ~L26023 media item render).
**Fix:** remove the record from whichever store holds it, and ensure the gallery seeds empty (no demo items) for new/guest users. If it's in the live Render data, delete it from that data file/store.
**Acceptance:** clean gallery by default; no NSFW/demo leftovers.

---

## 8. LATER (owner said NOT now)
The **"What do you want done? Tap one"** quick-action launcher (Make a picture / Make a song / Write a post / Research a coin / Check the market / Is this safe?). Has duplicates (**Research a coin == Check the market**) and the tools aren't good/working. Plan: consolidate, remove the dupes, or move to mobile only. **Do not do yet.**

---

### Guardrails
- Never commit secrets/`.env` (gitignored). Keep every read endpoint scoped by `req.userId` (softAuth) — the cross-user leak fix must not regress.
- Bump `?v=N` on changed module includes. Verify headless (0 console errors on the touched view) before pushing. Push to `main` = live in minutes; owner views the DEPLOYED site, not localhost.
