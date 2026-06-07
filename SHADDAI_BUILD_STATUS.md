# SHADDAI — Build Status & Session Log (master index)

*Single source of truth for what's built, what's verified, what's left. Repo: `IzzoIzzoIzzo/Shaddai` (private, branch `foundation-hardening`).*

## 🗺️ THE THREAD (2026-06-07, v83) — read this first if lost

**APPROACH (locked):** keep the single-file build, NO rewrite (see memory `shaddai-build-approach`). Launch-first → Render beta → 10-100 users → revenue → token. Backup before risky work (`v83.33` tag exists). Push to `main` for Render auto-deploy. Pollinations BANNED.

**SHIPPED THIS SESSION (v83, all pushed to `main`, verified live — no mock):**
- Simple Mode 3-step wizard (What→Who→GO) in Workflow — real `/api/agent/run` (verified NEXUS→calculate→144)
- **Human Design souls** for all 7 agents (Type/Strategy/Authority/Profile) injected into agent loop AND `/api/llm/chat` (verified PIKADON speaks as Splenic Projector) · esoteric corpus folder `backend/data/esoteric/`
- News tab: live free feeds + token-free sentiment + per-headline **AI Post/Summary → Save to Notes** (real QUILL)
- Real PIKADON security scanner (scanUrl/scanCode/scanSkill)
- Multi-engine image gen: **HuggingFace FLUX default** (free token) + fal/NanoBanana/DALL-E BYOK; **Pollinations REMOVED**; in-app render + Save-to-Gallery
- Layout: dashboard sits BESIDE left tabs (bulletproof CSS for all 12 outside views) · default side-nav on desktop, top-nav mobile · Plan tab removed (in Settings)
- Office agent status from unified backend (all 7 ONLINE, no `:800X` port pings)
- Marketplace: honest "● NEW / No runs yet" (removed fake 4.9★/1847-deployments/VERIFIED/3 fiction bots) · test-job spam purged (server + localStorage)
- **Production fetch-shim**: rewrites hardcoded `localhost:PORT`→same-origin on live host (Render works for beta); AURA panel→same-origin
- Vercel removed (`vercel.json` deleted — Render is the real host)
- `main` brought current (was 4 days stale)

**NEXT UP (cooking now):** x402 everyday-commerce (storefront view + make x402 the visible primary rail; backend `lib/x402.js` already real). Then: Office command-floor overhaul + agent movement · Skills-made-real + Forge upgrade · content-calendar AI-fill · Social-tab Notes reader · real video gen (BYOK only — no free API).

**Render env to set (free):** `GROQ_API_KEY` (instant agents), `HF_TOKEN` (free FLUX images), optional `ADMIN_TOKEN` (locks admin routes).

---

## 🗺️ THE THREAD (2026-06-05) — read this first if lost

**DONE + pushed + tested (90/90):** security foundation · LLM groq-first+6-provider fallback (chat ~300ms) · 182 real tools · 73 skill→tool bindings · **Forge gives agents REAL tools** (fakes filtered) · **agent SOUL** (`data/agents/*.md` injected) · **AURA token-saver** (live: "5×5"→free) · **Security scans** (`/api/security`) · **BYOK vault** (`/api/vault`) · **News** (`/api/news`) · **Collectible-rewards** (`/api/collectibles/rewards`, earn-by-work+perks) · Orchestrator · The Vault (NFT mint, devnet-ready) · embeddable `<shaddai-agent>` (x402 pay + per-customer memory) · marketplace backend · nav side-fit fix · agent-bar pin · version/dropdown fixes · port-label cleanup · Chain tab removed.

**PENDING (serial `index.html` UI work — the big overhaul list):**
office commands do real work · agent-room buttons + decorate flow · **Collectables own tab** (swap Plan; Vault+minting+earn UI) · Bazaar (theme/emojis/names, back-button bug) · help-`?` remove-button+themed UI · **MoonPay→Wallet** (relocate + full x402/moonpay orchestration view) · Sentiment→Markets · **Media/Creation suite** (clickable modules → simple connected tools) · Tools/work modules bigger · **API tab** (curated catalog + BYOK password-lock, surface the vault) · surface AURA savings + Security tab → `/api/security` · agent-port tiles repoint (no ports on Render) · API-usage expander removal · arrows + SHADDAI button moveable/hideable · SHADDAI-menu redesign (pick agent+tools) · Social Command reorganize · News tab UI · Workflow + Office **Simple mode** · agents scan+write documents · x402 buy/sell everyday items.

**PENDING (design, awaiting decision):** the 7-layer **Cognitive Architecture** spec (soul/HD/cognition/knowledge/memory/tools) + Human Design charts + esoteric corpus — one open question: lean prompt-assembler (recommended) vs all-layers-always.


## Run / deploy
- **Local:** `npm install` → `npm start` (serves frontend + API on `$PORT`, default 3000). Open `/`.
- **Deploy:** `render.yaml` → Render web service (`npm start` → `backend/server-production.js`, health `/api/model/health`, Node 20). Set secrets in Render dashboard: `GROQ_API_KEY` (free), `OPENROUTER_API_KEY` (free). Local keys live in `backend/.env` (gitignored).
- **Served frontend:** `public/index.html` (the v80 build) — the **single canonical build**. Retired builds live in `archive/` (not served). `public/` keeps only `index.html` + linked sub-pages (`marketplace-shop.html`, `SHADDAI-Collectables.html`).

## Build & backup topology (2026-06-03)
- **DEV** = this repo + `backend/.env` (your real keys; gitignored) — run/test locally anytime.
- **SHIP** = `ship/` — 2 keyless snapshots (`SHADDAI-latest.html`, rotate prev on each ship) tracking exactly what we deploy.
- **GitHub** = private `IzzoIzzoIzzo/Shaddai`; `.env` gitignored; secret-scan CI blocks any committed key.
- **Render** = keys set in the dashboard only (never in code). See `render.yaml`.
- **Obsidian** = docs/spec mirror (second backup).
- **Ironclad rule:** secrets live ONLY in `backend/.env` + Render dashboard — never in a build file, ship copy, GitHub, or Obsidian.

## ✅ Built / fixed this session
- **Brains & personas** (`backend/brains.js`, `/api/brains`) — per-agent model routing (Ollama/Groq/OpenRouter/Claude tiers), 7 council personas + **custom agents**, `agentLLM()` + usage metering hook. `llm-client.js` honors per-agent brain choice with fallback.
- **Billing de-mocked** (`billing-service/routes`, `pay-guard`) — real free/pro/elite tiers, credit ledger, `recordUsage` chokepoint, tier-gating, Stripe lazy-loaded, MoonPay → `/api/moonpay`.
- **MoonPay Agents** (`backend/moonpay-agent.js`, `/api/moonpay`) — non-custodial (Option A: keys in user's local `@moonpay/cli`), PIKADON kill-switch (default ON), paper-trade, ZEROX trade intents, **`pay-agent`** (agent-economy: pay a SHADDAI agent for work). Frontend MoonPay Agents section (Markets).
- **Operator Forge** (Skills tab) — build-your-own-agent UI: swivel 3D operator, COMPUTE-CORE meter (brain tier = compute), equip real tools, FORGE/TEST RUN → `/api/brains`; gallery of forged agents, archetype presets, localStorage skills.
- **2D Bazaar** (`public/marketplace-shop.html`) — user-owned shops, shop builder, `/api/marketplace/*`, top-bar 🏪 BAZAAR link.
- **Mobile** — responsive `@media`, quick-actions grid, first-run onboarding overlay.
- **PIKADON safety gate** (`backend/auth-guard.js`) — rate-limit on `/api/brains` + `/api/moonpay`; create-agent + kill-switch behind `ADMIN_TOKEN` (permissive locally, enforced in prod via `ADMIN_TOKEN`/`REQUIRE_AUTH`).
- **Tools:** calendar (`schedule_task`/`list_scheduled_tasks`), `generate_image` model choice + free no-key Pollinations fallbacks; OpenRouter added to registry; `/api/pikadon/audit` empty-body crash fixed; health env-var bug fixed; 7× `phi:latest` → installed model.

## 🔬 Verified (empirical, this session)
- **Tools: 135/135 pass** (`scripts/tool-audit.js`). 7 skipped (need keys/local: Discord/Telegram/GitHub/Solana-pay/local-LLM).
- **Workflows hardened** — pre-validation, per-step isolation (no break-on-failure), failed steps recorded, Groq fallback, `completed/partial/failed` status.
- **Connections:** DexScreener health fixed (was a 404 probe path) → 8/14 live; keys validated (Groq + OpenRouter configured, Suno lyric-gen returns real lyrics, `/api/market/*` live).
- **Build-your-own-agent** proven end-to-end (created + ran custom agent "SCOUT" on its model).

## ⚠️ Known gaps / TODO (honest)
1. **🔴 CRITICAL — client key leak:** a live OpenRouter key is hardcoded in `public/index.html` (~line 27235). ROTATE it + route all LLM calls through the server (keys never in the browser). See `SHADDAI_PIKADON_AUDIT.md`.
2. **🔴 CRITICAL — billing auth:** `authenticateUser` trusts `x-user-id` header (no token verify); `/admin/*` unauth. Add Firebase JWT verify + protect admin before multi-user launch.
3. **⚠️ skill→tool binding:** `skill-router` "skills" return canned text, NOT wired to the 133 real tools. Connecting them is a real, focused task (a one-shot agent attempt failed). 
4. **HIGH:** sandbox `run_js`/`run_python`; escape user-supplied strings before `innerHTML` (XSS).
5. Many near-duplicate HTML builds in repo → pick one canonical (`public/index.html`).

## 📚 Docs in this repo (also mirrored to Obsidian)
- `SHADDAI_WHITEPAPER.md` — technical state for external review
- `SHADDAI_VISION.md` — vision + revenue model + agentic commerce/MoonCard + PWA
- `SHADDAI_PIKADON_AUDIT.md` — security audit (2 CRITICAL, fixes ordered)
- `SHADDAI_REVIEW_QUESTIONS.md` — questions for Grok/Perplexity/Copilot
- `SHADDAI_TOOLS_AGENTS_COMPLETION_PLAN.md` — tools/agents review + roadmap
- `ZEROX_MOONPAY_AGENT_SKILL.md` — ZEROX MoonPay playbook
- `SHADDAI_BUILD_STATUS.md` — this file
