# SHADDAI OVERNIGHT LOOP — BACKLOG & STATE (owner asleep, autonomous)

Owner ran `/loop` overnight: finish tasks thoroughly, audit the landing 3×, fix issues, push to Render each batch. Owner views the LIVE Render site (`shaddai-g81x.onrender.com`, deploys from `IzzoSol/Shaddai` main). Theme = obsidian `#06080b` / emerald `#00ff9c` / gold `#e8c45c` / cyan `#5fe0ff`; Cinzel Decorative / Chakra Petch / Fraunces / IBM Plex Mono.

Local server: `node backend/server-production.js` on :3000 (running in background). Verify with headless Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`).

## ✅ DONE THIS SESSION (all pushed to main)
- **DEPLOY CRASH FIXED** — `backend/lib/respond.js` + `backend/crypto-data-routes.js` were untracked; `server-production.js:22` top-level `require('./lib/respond')` crashed Render on boot. Committed (5a71e0a). Server now boots through all mounts.
- **Landing = site root** — `app.get('/')` served codex.html → now serves **home.html**; Codex → `/codex`, dashboard → `/dashboard` (823efa4). Verified locally.
- **Landing page** — Explore-SHADDAI 8 gateways, faint step art, agent action backgrounds, arcade cover art, Signals API + News API in Signals nav → `/api`, "SHADDAI World · Preview" section (Region Selector + Pixel Forge live, The World locked). Home button on every page. data-api retired from nav.
- **Council portraits** — SHADDAI/ORACLE/ZEROX PuLID face portraits (exact likeness) + QUILL darker; cache-busted; 3D viewer shows all clips.
- **3D world** — intro de-lagged + re-themed emerald; demo/test operatives filtered from plaza; elevators faster (speed 9→17, dwell 2.6→1.6).
- **pixel-forge.html** — Home button added (was a dead-end).
- **Landing audit ×3** (parallel agents): 0 broken links, 0 broken assets, 13/14 pages 0 JS errors.

## ⬜ REMAINING — work a batch per loop iteration, then commit+push

### Landing / theme (from the 3× audit)
- ⬜ **`/api` serves the OLD glitch dashboard locally** (green `#00ff88`, `opOwner is not defined` + 2 inline-script syntax errors at ~line 6595). The Signals/News API nav links point to `/api`. On Render the API terminal's `public-api-routes.js` should serve `public/api.html` instead — VERIFY post-deploy that `/api` = the themed docs+signup page, not the dashboard. If `/api` still falls through to the SPA, add an explicit `app.get('/api'…)` → api.html (coordinate: the other terminal owns public-api-routes.js).
- ⬜ **arcade.html off-theme** — Orbitron + Share Tech Mono + neon-magenta (old look). Re-skin to obsidian/emerald/gold + Chakra Petch/Cinzel.
- ⬜ **Font drift** on marketplace-shop-v2 (Orbitron/Rajdhani/violet), zerox-markets (Share Tech Mono/cyan), forge (Spectral/amber) — standardize to Chakra Petch (HUD) / IBM Plex Mono (data), per-page accent OK.
- ⬜ codex parchment theme — confirmed intentional (has Home). Leave.

### Telegram — "fix all the stuff we said with the TG"
- ⬜ CLARIFY/RECALL scope. Candidates: surface the SHADDAI Telegram bot/signals on the landing (a TG CTA in the Signals area), and/or the TG bot config from memory [[TG_SIGNALS_BOT_20260718]] (`backend/telegram-*.js`). The API terminal already did the bot rug-cut optimization. Likely landing-side: add a "Get signals on Telegram" link. Owner to confirm exact ask in AM.

### 3D world bugs (owner screenshots 2026-07-19)
- ⬜ ZEROX standing sideways at default (body rotation.y in queueAgentBody).
- ⬜ PIKADON on the bike/elevator pole (mis-placement).
- ⬜ No walk animation for NEXUS/QUILL/SHADDAI (SHADDAI tilts; gliding ok — add walk clips).
- ⬜ Weird spawn at QUILL's spawn.
- ⬜ Walking off an elevator = stuck glitch (collision/ground snap on exit, both dirs).
- ⬜ Second floors unfinished/janky.
- ⬜ Top ceiling mini-bridges blocked by an invisible collider line (both directions).
- ⬜ Portal rental cramped/janky + unknown object behind it.
- ⬜ Random circle w/ chair-like things placed in map.
- ⬜ Floating glitch square boxes in the sky (stray meshes).
- ⬜ Square boxes around the ATTACK move (debug boxes on attack VFX).
- ⬜ Billboards glitched into pillars; one empty billboard.
- ⬜ General: shading/lighting polish, lag/slow-down audit.

### Security (PIKADON)
- ⬜ backend `npm audit`: 42 findings (33 mod, 9 high) — almost all transitive Solana/metaplex deps + one `ws` DoS via engine.io-client. DO NOT `npm audit fix --force` (breaks Solana + risks re-breaking deploy). Plan: after deploy stable, non-force `npm audit fix` in isolation, boot-test, then push. Most not in direct request attack surface.

## Push cadence: commit + push after each coherent batch. Keep commits frontend/world-scoped; never re-touch backend/*.js without syntax+boot check (avoid re-breaking deploy).
