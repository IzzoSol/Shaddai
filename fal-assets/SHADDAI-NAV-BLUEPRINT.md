# SHADDAI — NAV & INFORMATION BLUEPRINT (draft for approval)
Goal: one clear home for everything, nothing buried, tabs not over-mixed. Journey renamed **The Ascent** (rises to the Crown). "Play the Ascent" = a persistent top-right corner button (out of the nav).

## PRINCIPLE
The top nav stays lean (7 tabs). The **CODEX** is the "almanac" = the one place that indexes EVERYTHING (lore + docs + full API reference + whitepaper + a directory of every page). So niche surfaces are always findable without cluttering the nav.

## GLOBAL CONVENTIONS (every page)
- **Home button** on EVERY page (arcade, codex, markets, all of them) — always a one-click way back to Home.
- **Persistent CORNER CLUSTER** (top corner, small & subtle — NOT big buttons): **Theme switch · Docs · Enter Dashboard · ▶ Ascend**. Same on the tab pages + Codex. This is the quiet funnel.
- **Command Deck (dashboard) is the hub** — Markets/data surfaces funnel into it via the subtle "Enter Dashboard".
- **Sign-in gate**: browsing is open everywhere; **creating/saving** (an agent in the Forge, etc.) requires sign-in.
- **AURA on Home**: keep a *small* touch only — the live "coin spared" ledger stat as a one-line proof point. Full AURA lives in its own tab.

---

## TOP NAV — 7 TABS

### ⟐ WORLDS — the ways in  *(was "ENTER"; the Ascend button lives in the corner, so this tab = the worlds/deck)*
- **Command Deck** → the 2D control dashboard (index.html / /dashboard) · LIVE
- **3D World** → walkable Three.js world (SHADDAI-WORLD-3D.html) · LIVE
- **Pixel City** → isometric agent city (pixel-city.html) · Preview
- *(The Ascent is the corner ▶ Ascend button, not a nav item)*

### ☰ THE COUNCIL — the seven + their halls
- **Meet the Seven** → agents.html (portraits + spinnable animated 3D) · LIVE
- **The Athenaeum** → athenaeum.html · LIVE
  - Oracle's Observatory → oracle-sky.html
  - Quill's Library → library.html
  - Turtle's Museum → museum.html
- *(removed: the Villain)*

### ⚒ CREATE — make things
- **The Forge** → forge.html — re-themed, **two parts: Pixel (2D) + 3D, both open**. Explore/design freely; **sign-in required to create & save an agent** (try-then-sign-up).
- **Creative Studio** → creative-studio.html — TURTLE: beats · melody · sonify · hertz · art
- **Video Clipper** → the clipper · *(soon)*
- *(removed Model Page — the COUNCIL already shows each agent's 3D model + HF art; no need to duplicate)*

### ◇ PLAY — the arcade
- **Overview** → play.html
- **The Arcade** → arcade.html · LIVE (games live inside; *no game list in the dropdown*)

### ₿ MARKETS — data & trading  *(distinct from AURA)*
- **Markets & Data** → data-api.html · LIVE (keyless crypto data)
- **Market Nexus** → zerox-markets.html / zerox-chart.html — ZEROX: live BTC · SOL · ETH · SpaceX
- **Sentiment** → Fear & Greed + basic dashboard view · **LIVE (done — add now)**
- **Telegram Bot** → the SHADDAI TG bot *(lives here, not ENTER)*
- **Signals** → *(soon)* memecoin + stock signals
- → **"Enter Dashboard"** button — Markets shows a *basic* form of the dashboard; the full version is the Command Deck.

### ⚖ AURA — the token-saver  *(its own tab, its own thing)*
- **What AURA is** → aura.html · LIVE
- **Live ledger** → coin spared, in ink (from /api/aura/stats)
- **Open-source** → npm `shaddai-aura` + MCP server

### ◈ SHOP — the bazaar / economy
- **Bazaar** → buy/sell/remix agents & items (marketplace-shop-v2.html)
- **Cosmetics** → skins, armor, cosmetics for your agents
- **Portal Rentals** → rent portals / space
- **Workflows** → buy/sell agent workflows
- **Knowledge** → sell `.md` packs (prompts, guides, playbooks)
- **Collectibles / NFTs** → collectibles-nft.html · nft-collection.html
- **Checkout** → Solana Pay (solana-pay.html)
- *(8th tab; sign-in to sell/buy)*

### ☽ CODEX — the almanac & reference (the "everything" hub)
- **The Codex** → codex.html · LIVE (the lore/illuminated almanac; keep its Terminal/Codex theme toggle)
- **Docs** → guides + setup (incl. Telegram-bot setup)
- **API Reference** → the FULL API list (DexScreener, CoinGecko, + many more, + the TG-bot API) *(expand well beyond the current two)*
- **Whitepaper** → whitepaper.html
- **Full Directory** → an index of every live surface (so nothing is ever buried)

---

## FUTURE FEATURES (reserved slots — separate builds, NOT this pass)
- **Pixel Forge + 3D Forge** (both open) — upgrade forge.html to two build modes.
- **Telegram Bot** + its APIs — nav entry under ENTER; docs/reference under CODEX.
- **Expanded API list** — many more than DexScreener/CoinGecko, listed under CODEX › API Reference.
- **Signals/Sentiment** — memecoin + stock signals under MARKETS.
- **Economy/Marketplace** — marketplace-shop-v2.html, nft-collection.html, collectibles-nft.html, SHADDAI-Collectables.html, teams-gallery.html, solana-pay.html. Park under CREATE ("sell your creations") OR a future **MARKET/ECONOMY** tab. *(decide later)*

## BUILD BACKLOG (ongoing work — separate specs, prioritize later)
- **SHADDAI API** — build/expand the core API.
- **AURA MCP** — the token-saver MCP server.
- **ZEROX Market Nexus** — the SpaceX feed + yin-yang piece are very basic → upgrade.
- **The Forge + Pixel Forge** — re-theme + build (Pixel after the pixel world is done). FLOW: **Forge → Rooms → Dashboard**. Remove the **"Awaken"** step (it doesn't run the skill) — just **Forge** the agent, which then **sends it to the Rooms tab**. Each forged agent gets a **Pixel version OR a 3D version** (not just 3D).
- **Command Deck flow** — Command Deck itself is fine; wire the Forge → Rooms → Dashboard handoff.
- **Arcade games** — make them actually use each agent's real skills & tools well; upgrade + polish.
- **Command Deck modules** — restyle thicker, bolder, neon, cooler, better organized.
- **Docs page** — build a real, dedicated Docs page (not just a Codex section).
- **AURA page** — deep revamp of aura.html (in-depth: what it is, how it works, the pillars incl. Distillation, live ledger, open-source/MCP).
- **Codex theme on Home** — REMOVED the Theme toggle from Home's corner (parchment-on-home looked bad); Home is neon-only. If a light Home theme is ever wanted, build a bespoke one (not a reskin).
- General: polish + upgrade all of the above over time.

## CODEX PAGE — REORGANIZE (fits the new IA; keep its loved illuminated-manuscript look + Terminal/Codex toggle)
The Codex = the almanac & record — "everything a codex would have." Home is overloaded → offload the reference stuff HERE (trim Home to awe/front-door). Sections:
1. **Preamble** — the illuminated intro (keep as-is; it's beautiful).
2. **The Ledger of Labour** — the AURA ledger stats (KEEP here — the Codex *is* "the ledger, set in ink"; canonical detailed ledger. The AURA *tab* = product page.).
3. **The Directory** *(was "Instruments")* — full index of every destination under Worlds · Council · Create · Play · Markets · AURA · Shop, so nothing is buried. *(remove "The Covenant"/pricing card.)*
4. **How It Works — Architecture Diagram** — a real diagram of the system: your context → the 7 → AURA (compress/compute/cache/distill) → output; **x402** payment rails, MCP, BYOK. (Build this — it's a strong "understand SHADDAI at a glance" piece.)
5. **Docs** — real docs *(dedicated page later)*.
6. **Whitepaper** — *(WIP — placeholder section + the diagram stands in for now)*.
7. **Plans / Roadmap** — where it's going.
8. **GitHub** — the repos (links).
9. **Socials** — Telegram @shaddaicircle · X @shaddaiai.
10. **Join the Circle** — email signup (keep).
- Chrome: keep the Codex's own manuscript bar, but add a **Home** button + the subtle **Enter Dashboard** funnel (do NOT force the neon mega-nav onto the parchment page — it would clash). The Codex's Terminal/Codex theme toggle stays (works well here).
- Duplicate detailed **Council roster** → trim to a light "the Seven" line that links to the Council tab (the full roster lives in agents.html).

## HOME PAGE FIX (the overlap you flagged)
Home and Codex currently overlap (both feel like landings). Fix: **trim Home** to the cinematic overview + gateways (the Ascent background, the 7, the tabs, a taste of each area). Move the deep/reference content (docs, API, long lore, ledgers-in-detail) to **CODEX**. Result: Home = the awe/front-door; Codex = the reference/almanac. Nothing duplicated.

## RETIRE / DEV-ONLY (not in nav)
Old or test surfaces to keep out of the nav: journey.html (old descent), SHADDAI-WORLD.html / -COMPLETE (old world builds), landing.html, learn.html + intelligence.html + create.html + play.html *(the pillar pages — keep create/play as overviews, retire learn/intelligence in favor of CODEX/MARKETS)*, marketplace-shop.html (v1), and everything `_*` / `*-test` / `*-preview` / `__*` / `*-baseline`.

---

## OPEN QUESTIONS
1. **7 tabs okay**, or fold PLAY into ENTER to get to 6? (Play is distinct enough to keep, IMO.)
2. **Economy/Marketplace**: under CREATE, or its own future tab?
3. **MARKETS vs AURA** confirmed separate — good?
4. Anything I mapped to the wrong home?
