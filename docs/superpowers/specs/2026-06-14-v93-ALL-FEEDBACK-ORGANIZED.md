# SHADDAI v93 — All Feedback, Organized (single source of truth)

> Every piece of direction you've given, organized by dashboard area, with status.
> **Legend:** ✅ done & verified · 🔧 in progress · 📋 documented/to-build · ⭐ new/important.
> Working file: `SHADDAI-DASHBOARD-v93.html` (copy of v92; v91 never touched).
> Plan/exec file: `.claude/plans/memoized-coalescing-knuth.md`. Backend: `backend/`.

---

## 0. GLOBAL RULES (apply everywhere)
- ✅ **Mouse must appear** — fixed (the global `cursor:none` custom-cursor hid it; restored `cursor:auto` + pointers/text cursors).
- ✅ **No "not valid JSON" crashes** — fixed with a global fetch guard (offline/HTML responses → soft `{ok:false}` instead of a thrown error). Covers News, APIs, CoinLore, Sentiment, etc.
- 📋 **No mock / no larp** — every button must do a real thing or be removed.
- ✅ **AURA wired as the cost layer** — created `backend/aura-routes.js` (`/api/aura/chat` cache-check, `/record`, `/stats`, `/route`) over `lib/aura.js`; mounted in `server-production.js` AND the preview harness. Chat already calls `auraChat()` → `/api/aura/chat` before any paid provider (returns "⚡ AURA Cache" on a hit), and now **records each provider answer** so identical future prompts are free. Verified by curl: record→`cached:true`, "18*4"→`72` solved locally (compute), stats accumulate. Sentiment/Automation can reuse `/api/aura/route` (next).
- ⭐ **Budget:** only Claude Code $20/mo — prioritize ruthlessly, maximize finished+perfect, no paid infra.
- ✅ **Nothing was lost from v91** — verified v92 == v91 + our additions (topBar, MRR, AURA, collectables, bottom arrows all present). The "missing top" was a preview-URL artifact, now noted.
- 📋 **Use HuggingFace** for real imagery (module icons, scenes, the 7 agent portraits) — NOT basic emojis. 4 HF keys rotating.

---

## 1. MAIN DASHBOARD (home)
- ✅ Remove the **"dopamine dashboard"** block from home — moved into Settings → Cost & AURA panel (`#settingsCostAura`).
- ✅ Move **token-efficiency / token-saved / cache-hits / cost-saved** into **Settings** ("Cost & AURA" panel `#settingsCostAura` — AURA stats row + Token Efficiency charts + This Week, all relocated; IDs preserved so JS still binds).
- 📋 Restore hierarchy: top summary → live agent state → core action panels → secondary analytics below.
- ✅ Keep (verified present): mission/header strip, MRR ticker, SHADDAI chat button, collectables area, token stats at top, bazaar entry, bottom carousel arrows.

## 2. CHAT
- ✅ **AURA is connected.** `getAgentResponse` checks `auraChat()` (→ `/api/aura/chat`) before the provider gateway; on a cache/compute hit it returns "⚡ AURA Cache" for $0, and records every real answer so repeats are free. Routine/repeated chat is now genuinely cheaper than calling the model directly.

## 3. AGENTS
- ✅ Remove **"Generate Avatars"** button — done.

## 4. MARKETPLACE  ·  BAZAAR  (high priority)
- 📋 Add a **center button → Marketplace Floor** (`SHADDAI-Marketplace-Floor.html`), embedded INSIDE the marketplace tab.
- ✅ **Forged agents are sellable in the Marketplace** — new "🛒 Forged Agents — For Sale" section (`#mktForSale`) reads `/api/operatives`, shows seller cards (portrait, rarity, tool count, **$/call + $/mo**) for any operative with `listing.forSale`. Deploy → 🛒 Market sets the listing (price via operatives PATCH, no schema rewrite). **Hire button → real `/api/x402/agent/<name>/hire`** rail (x402 — free locally, live in prod). Verified: card + price + button render. (Floor-canvas embed of agent desks still 📋.)
- ⭐ **Restore the BAZAAR** (`public/marketplace-shop.html`) — missing old-version elements to bring back:
  OPEN BAZAAR · THE VAULT · 🎨 Customize · Featured Agents (+List My Agent) · Job Board (+Post a Job) ·
  the **7 agent cards** (ORACLE/ZEROX/NEXUS/TURTLE/QUILL/PIKADON/SHADDAI w/ price + DEPLOY + SUB).
- ⭐ All of this lives **INSIDE shaddai** (wire the marketplace html into the tab), **HF art for aesthetics, not emojis.**

## 5. MARKETS  ·  WALLET  ·  COMMERCE
- 📋 **Markets:** good foundation, keep.
- ✅ **MoonPay agents:** hidden (`#moonpayAgentsCard` display:none) — was "planned/not-available" larp; commerce on-ramp text re-pointed to x402. Code kept for optional future on-ramp.
- 📋 **Wallet tab:** makes no sense standalone → **merge into Commerce** (real balances/functions, NO mock data). The Solana-Pay / Connect-Wallet / Agent-Earnings panels are currently larp.
- 📋 **Commerce = major pillar (deep-dive later):** pay other agents, top up credits, and eventually **agent-assisted purchases on Amazon/other sites**. Build the real foundation now.

## 6. SENTIMENT
- ✅ **Working & token-optimal.** Manual headline analysis uses local `calculateSentiment()` (keyword-based, **zero tokens** — already AURA-grade); live scan uses real on-chain APIs + `/api/council/consensus`. Verified: renders a real score. (Council-consensus LLM calls are a future *backend*-AURA target; no mock added.)

## 7. NEWS
- ✅ "not valid json" bug — fixed (global guard).

## 8. MEDIA
- ✅ **HF-generated real images** for each module — all 9 tiles (Image Gen, Video Studio, Music+Audio, Voice/TTS, AI Writer, Gallery, Video Clipper, Chart Signal, Content Series) now show real `/api/forge/art/module-*.png` art (generated by `scripts/gen-module-art.mjs`, cohesive teal/gold set), not emojis. Verified (9 icons, naturalWidth 1024). 4 extra Workflow-module images (automation/pipeline/scheduler/triggers) also generated, held for when Workflow gets a tile grid.
- ✅ Each module is **clickable → deeper screen** via `launchMediaModule(key)` (real overlays for all 9 keys: image/video/music/voice/content/gallery/clipper/signal/series).
- ✅ **Decluttered + future-forward (user redesign).** Default Media view = just the big categorized module grid + a **view-mode filter (⊞ grid / ≣ list / 🎠 swivel)** (persisted). The long inline studio cards (image/video/music) that had **leaked out** of the hidden `mediaClassicCards` wrapper are now hidden by default (`.media-extra-card`) — their full functionality lives in the module overlays — and the **Classic View** toggle (`toggleMediaClassic()`) restores them. No more "everything at once" scroll. Verified clean default + toggle.
- 📋 **Clipper:** deferred (owner choice) — Media clipper already works (cobalt+Groq); the standalone SHADDAI CLIPPER engine (verified bootable) to be finished/embedded later via opencode.
- 📋 Modules: Image Gen · Video Studio · Music+Audio · Voice/TTS · AI Writer · Gallery · **Video Clipper** (added when ready) · Chart Signal · Content Series.

## 9. SOCIAL
- 📋 Looks great — just **polish** + verify it works.

## 10. WORKFLOW
- 📋 Works — verify end-to-end. **Real images on modules** instead of emojis.

## 11. AUTOMATION
- ✅ **AURA wired.** The automation/workflow agent runner `_callAgent` (line ~12176) now checks AURA (`auraChat`) before its `/api/ollama` call and **records** the answer after — so repeated automation tasks are free (verified the cache round-trip returns `cached:true`). Identical behavior on a miss.

## 12. PROJECTS
- 📋 **Redesign** — current Kanban-heavy setup is clunky/too complicated/confusing. Keep the idea, simplify hard.

## 13. SKILLS / FORGE  (the centerpiece)
- ✅ **Builder = PRESET selectable body parts** — live SVG part-compositor wired into the dashboard (`#ofComposite`): swapping any of the 9 carousels instantly re-stacks a rig-aligned floating character (bg·aura·body·hair·outfit·headwear·eyes·handheld·accent), zero AI cost. Archetype presets show the polished FLUX hero art; custom swaps show the live composite; final FORGE renders the real FLUX portrait. Sprite map ported from `forge/sprites.mjs` + depth polish (gradients, ground shadow, vignette). NOTE: true *photoreal* per-part compositing isn't feasible with FLUX (opaque scenes, not aligned transparent layers) — pre-gen photoreal part images can layer in later per slot.
- ✅ **Swivel body-part picker DONE (option 3, user-requested "perfect").** Rebuilt the picker: a **slot rail** (9 slots w/ icons + current part) + a **cover-flow option swivel** (◀▶ like the API Swivel) where each option card is a **full live character preview** with that part applied, selected card glows by rarity; selecting live-updates the floating character (which also drag-rotates). `compositeSVG(slots)` pure-builder reused by stage + every option card (true WYSIWYG). Verified: 9 chips, 4 previews/slot, no errors.
- ✅ Add **personality + skill loadout** — persona textarea + searchable real-tool skill chips both present in-forge; whole flow is within the dashboard.
- 📋 **Deploy** the forged agent into: **Office (pixel office)**, **Marketplace**, or **Create New Room** (room selector/customize appears).
- ✅ Forged agent now **APPEARS** in **⬡ FORGED AGENTS** — fixed: gallery was reading the empty `/api/brains` stub; now reads the real `/api/operatives` store (persists in preview AND prod), merged with brain-only customs. Verified: GUARDIAN + DAITEST render. Cards redesigned into rarity-framed "classified dossier" cards (real FLUX portrait, rarity ribbon, tier chip, PWR/INT/SPD bars from real `stats`, tool count, hover **deploy tray → Office / Marketplace / Room** via real PATCH `/api/operatives/:id`).
- 🔧 **Real tools/skills** — chips come from `/api/agent/tools` (real in prod) + persist on the operative `tools[]`; RUN fires the real `/api/agent/run` tool loop. (Behavioral differentiation by tier still to deepen.)
- ✅ **Character sheet REAL not mock** — dossier cards show PWR/INT/SPD from the store's computed `stats` (rarity base + tool count). DEF/abilities visual upgrade = later.
- ✅ **BRAIN · COMPUTE TIER:** now shows only **Light / Balanced / Heavy** (model names removed → "cheap · chat & basics / mid · multi-step / premium · deep work") + a **"?"** help chip with tier-capability tooltip.
- ✅ **Guardrail:** forging is now **blocked** when `skills.size > tier cap` (light 3 / balanced 8 / heavy 99) with a shake + "remove N or upgrade to X" message. Verified (5 skills on LIGHT blocked).
- ✅ **HF 3D portraits of the 7 main agents** — generated via `scripts/gen-agent-portraits.mjs` (4-key HF rotation) → `backend/data/forge-art/agent-{id}.png`, served by `/api/forge/art/`. Wired as the agent-card avatars in `#agent3DGrid` (fallback to letter-code on 404). Verified: 7/7 cards load real portraits (TURTLE = green-hair anime in helmet, etc.).
- ⭐ **Add tools to an already-forged agent** + show **estimated token-usage increase** per tool (nice-to-have "maybe").

## 14. LIBRARY
- 📋 Audit doc-scan / note workflows actually work. Later: import notes from **Google Drive / external** → scan → posts.

## 15. OFFICE
- 📋 Import **forged agents** into the pixel office; they **move around + do tasks** like the existing ones.

## 16. API tab
- ✅ "not valid json" bug — fixed (global guard).
- ✅ **Removed** the larp blocks: "Agent API Connectors" (deleted) + "Live Data Feeds" (Jupiter/CoinGecko/Portfolio/CORE/Telegraph/Solana-RPC) + "Live Data Hub" (CoinLore/SerpApi/ZEROX Pulse) — hidden via display:none. Kept the real **API Key Vault**, API Directory, and **Your Custom APIs**.
- 📋 Consider removing the whole API tab if it's mostly noise; **keep the real API Key Vault**.

## 17. SECURITY
- 📋 Keep extensive, but align with the real product flow (x402 / Commerce as the payment path).

## 18. NAV / CHROME
- ✅ Dead **Orchestrator** link (`/orchestrator.html`) → now opens Office.
- 📋 Ensure bottom arrows + all top-level controls visible (they are; just don't hide them in previews).

---

## 19. PRODUCTION / STRATEGY (from the hard audit — bigger lifts, later)
- 📋 **Bridge the Gap:** wire dashboard "Run" buttons → `shaddai-orchestrator.js` `/api/jobs` (real job lifecycle).
- 📋 **AURA = AINL-grade:** semantic cache + context compression + model routing (pgvector = later; wire existing layer now).
- ✅/📋 **Clipper:** the standalone engine at `OneDrive\Desktop\SHADDAI CLIPPER` is **bootable & verified** — Fastify on `:8787`, ffmpeg-static binary resolves, Whisper/Transformers.js imports, endpoints respond, `tsc` clean, README written (start: `cd server && npm start`). Endpoint contract: `POST /sources` (upload→transcribe), `POST /generate`, poll `/batches/:id`. 📋 Remaining: trigger the one-time Whisper model download for a real end-to-end clip, then **embed into the Media → Video Clipper module** (tier + x402 gated).
- 📋 **Harden:** Firebase Auth + Stripe billing real, not simulated.
- 📋 **No-rug launch:** product-first (Stripe/Solana subs + Genesis NFT) or token-first (pump.fun + buyback/burn) — decide later.

---

## 20. ALREADY BUILT (keep — don't lose)
- ✅ Forge real FLUX archetype art + 9-slot part carousels (Skills `#operatorForge`).
- ✅ Collectables Vault — real 100 FLUX cards, earned/locked (color+frost), real unlock tracking, mint-later.
- ✅ Backend: `lib/operatives.js` (Operative store), `forge/` (`/api/forge` real FLUX + art), `collectables/`, `rooms/`, `lib/hf-keys.js` (4-key rotation). All mounted in `server-production.js`.

## Build order (user pick: cleanup-first → phased, verified per batch)
Phase 0 cleanup → 1 AURA-everywhere → 2 Forge rebuild → 3 Marketplace/Bazaar/Commerce/Wallet → 4 Media/Workflow/Social/Automation → 5 Projects/Library/Office → Clipper. Screenshot-verify each on the PLAIN served dashboard.
