# SHADDAI — Master Build Plan
**Date:** 2026-08-04  
**RAG Brain:** 10,614 chunks · 573 videos · 38,730 terms  
**Status:** Approved design — implementation-ready  
**Rule:** Nothing here tears down what already works. Every phase adds depth.

---

## What SHADDAI Is (Identity Statement)

SHADDAI is the only platform where AI agents **earn, own, and operate** inside a living economy.

Three things make it real:
1. **You own your agents** — forged, customized, deployed, not rented from a cloud
2. **Your agents earn for you** — they run skills, hold property, collect passive yield, pay each other via x402
3. **The world is real** — walkable 2D city + 3D world, real Sparks economy with enforced reserve rules, actual land deeds, tenant rent, transit fares

Not a chatbot wrapper. Not a hype product. The economy is the product.

---

## The Seven Systems

```
FORGE → AGENTS → WORLD → MARKETPLACE → ECONOMY → MCP → DASHBOARD
  ↓         ↓        ↓          ↓           ↓        ↓        ↓
Create    Power    Operate    Trade       Sustain  Extend  Command
```

Each system is self-contained but feeds into the next.

---

## System 1: THE FORGE

### What it is now
- **Pixel Forge** (`pixel-forge.html`): 2D pixel agent builder, color/skin/name/tools, free, drops into Gallery
- **3D Forge** (iframe to `forge.html`): Operator Forge with swivel 3D model, Pro-gated, Meshy/NVIDIA pipeline dormant

### What the RAG says to build

**From cosmetic_sales + agents domain:**
> "Each agent great at one thing. Narrow scope per agent. Sub-agents for specialized tasks."
> "Minecraft marketplace: sell maps, mods, add-ons, skins — many people made it their full-time job."
> "Creator economy: let users build → list → earn. Same model as Roblox Devex."

**Forge needs two distinct lanes with clear value:**

#### Lane A — Pixel Forge (Free, everyone)
**Current:** color, skin, name, 4 presets  
**Add:**
- **Trait system**: 6 trait slots (Speed, Focus, Creativity, Logic, Empathy, Grit) — drag sliders, shows as radar chart
- **Skill binding**: pick 3 skills from the Skills Library to bake into this agent at forge time (shows on agent card forever)
- **Personality preset**: 8 preset "personalities" (Hustler, Analyst, Creator, Guardian, Diplomat, Tactician, Dreamer, Enforcer) — affects system prompt weight
- **Voice sample**: pick from 5 pre-baked voice styles (shown as waveform preview)
- **Export to Gallery** → agent card shows traits, skills, voice style
- **Deploy to World**: send forged agent into game.html as a companion NPC
- **Monetize**: listing forged agents on the Marketplace (Phase G)

#### Lane B — 3D Realms Forge (Pro)
**Current:** iframe to forge.html, Meshy pipeline dormant  
**Add:**
- **Model generation**: text prompt → GLB via Meshy API (keys in `.env`) with progress bar
- **Body customization**: 6 body types, 12 armor sets, 12 weapon classes (pulled from `/docs/SHADDAI_TOM_ARMOR_BODY_SPEC.md`)
- **Motion binding**: assign one of 20 clips (idle/walk/run/vault/dance) from the existing TURTLE GLB
- **Room assignment**: "Deploy to your Founders Row office" — agent appears in 3D world room
- **3D Marketplace listing**: list your GLB agent for sale in USDC via x402 (Phase F+)
- **Credits system**: 1 Pixel agent = 1 credit (free), 1 3D agent = 50 Sparks or 1 Pro credit

#### RAG Principle: The Forge is the top of the funnel
> PLG source: "Your product sells itself. The customer journey starts with self-service."
> "Freemium works when: the free version delivers real value AND creates desire for paid."

Forge Rule: **Pixel Forge must feel complete and powerful** (not a teaser). Users forge real agents with real skills. The 3D lane is a genuine upgrade, not a paywall on core function.

---

## System 2: AGENTS

### What they are now
7 council agents (SHADDAI/ZEROX/ORACLE/NEXUS/TURTLE/QUILL/PIKADON) + user-forged agents. Each has a personality, skills list, and HTTP port (8000–8008). The Boardroom lets all 7 debate a topic.

### What the RAG says to build

**From agents domain (LangChain/LangGraph/ReAct):**
> "Memory needs to be application-specific. Short-term = working context. Long-term = episodic memory of past interactions + semantic memory of facts + procedural memory of how to do things."
> "ReAct: Reason → Act → Observe loop. Tool call → environment feedback → next action."
> "Sub-agent specialization: code-writer agent + code-reviewer agent. Never one agent doing everything."

**Agent architecture upgrades:**

#### Agent Memory (using AURA)
- **Short-term**: conversation context window (already works)
- **Long-term episodic**: store last 50 interactions per agent in `backend/data/agent-{name}-memory.jsonl`
- **Semantic**: distilled facts per agent (AURA Distill, already specced) — who the user is, what projects they're working on, their preferences
- **Procedural**: skills list IS the procedural memory — the Skills Library already has this
- Wire: when agent completes a task, write a 1-sentence "lesson" to their episodic store

#### Agent Tool Registry (NEXUS domain)
- Every agent has a declared tool set: `[web_search, code_exec, image_gen, data_fetch, sparks_transfer, x402_pay]`
- MCP tools are exposed as items in this registry
- "Assign skill to agent" = adding a tool to their registry
- Skills can be gated by tier (free tools / Pro tools / credit-burn tools)

#### Agent Specialization in the World
- Forged agents in the Gallery can be sent on **missions**: Research / Draft / Audit / Trade
- Mission runs in background, completion fires a toast + logs to Kanban
- Mission reward: Sparks (small amount — motivator, not income)
- Council agents auto-assign to missions by domain (ZEROX → Revenue, ORACLE → Research, etc.)

#### x402 Agent Payments
**From RAG:** "Client sends HTTP request → server returns 402 → client encodes signed payment authorization → sends proof of payment. No human intervention."

- Agent calls a paid API (weather, data feed, model) → gets 402 → signs with user's wallet → sends proof → gets data
- SHADDAI holds a custodial wallet per user (Sparks balance = on-chain USDC equivalent for MVP)
- Agent can spend up to user-set daily limit without confirmation
- Logged to audit trail (PIKADON domain)

---

## System 3: THE WORLD (2D + 3D)

### What exists now
- `game.html`: 2D pixel world, 8 regions (separate, region selector screen)
- `public/index.html` 3D world (Three.js, 7 council agent rooms, walkable buildings)
- Phase A shipped: Signal HUD, CITY_PLOTS[30] deed model, accrue() streaming, Signal Drop

### What the RAG says to build

**From land_system domain:**
> "True player ownership — if you buy a land deed and you're done using it, you can sell it to another player. The majority of the game is player-owned, player-operated, player-driven."
> "Smallest deed = homestead (tiny house). Ownership gives: income rights, governance vote, identity anchor."

**From transit domain:**
> "Theory: design transit to match population density. Ring routes for outer districts. Spoke routes for center-to-district direct. Stations = social hubs, not just waypoints."

**Phase B — Connected 3×3 World Map (next big game.html build)**

Replace the 8-region selector with one seamless tile map:
```
[ Forest(TURTLE) ]  [ Nexus Heights ]  [ Beach(ORACLE) ]
[ Meadow(QUILL)  ]  [ SHADDAI CITY  ]  [ Desert(PIKADON)]
[ Suburb         ]  [ Oracle Sky    ]  [ Zerox District ]
```

- Player spawns in SHADDAI City, walks anywhere
- District borders are visible on map (color shift, ambient change)
- Signal drain starts when you cross a border
- Each district has its own tile palette, buildings, and ambient music

**SHADDAI City Buildings (revamp)**
- Founders Row: 30 glowing office plots (emerald = owned, dim = available, gold = your slot)
- Guild Hall: NPC quests, mission board
- Transit Hub: Ring Train + Subway departure board
- Bank/Vault: boost deposits, Sparks ledger
- Market Plaza: item/agent listings (Phase G)
- Signal Tower: visual landmark, regen zone

**District Buildings (per district)**
Each district gets: Transit Station · 3 residential buildings (8 rooms each) · 1 landmark building (unique per district)

**Phase C — Transit System**
- Ring Train stops at all 8 outer district stations
- Visual: gold train car that animates across the map
- Subway spokes: instant warp lines from SHADDAI City center
- Fare UI: toast shows "10 Sparks — Ring Train to Forest" → confirm button → deduct → warp
- Unlock gates: Ring Train after 3 district visits, Subway after owning 1 room

**3D World Upgrades** (separate from game.html)
- Council agent rooms already walkable
- Add: Founders Row exterior — 30 office exterior tiles visible in 3D, your office glows
- Add: Pixel Office bridge — your 2D forged agents appear as sprites in your 3D office room
- Add: x402 payment kiosk in 3D world (pay for Pro upgrade without leaving world)

---

## System 4: MARKETPLACE

### What exists now
- `marketplace-shop-v2.html`: the Bazaar (shop client)
- `Shop.open()` call from dashboard buttons
- Basic listing structure exists

### What the RAG says to build

**From marketplace domain (NFT + AMM):**
> "NFT marketplace must-haves: wallet integration, listing status, ratings for sellers, authentication process."
> "Constant product AMM: x * y = k. Add/remove liquidity. Swap one token for another. Fee on every swap goes to LPs."
> "Fee splitters: route fees to: 60% Founders Row offices, 30% district reserves, 10% buyback."

**From cosmetic_sales domain:**
> "R6 Marketplace: minimum price floor, always a buyer at floor, flip mechanic. Makes it feel like real trading."
> "Creator economy: user creates item → lists it → earns on every sale. Platform takes 5-10%."

**Three marketplace layers:**

#### Layer 1 — Agent Marketplace
- List forged agents (Pixel or 3D) for Sparks
- Seller sets price, SHADDAI takes 5% fee → treasury
- Buyer gets the agent in their Gallery, removed from seller's Gallery
- Ratings: 1-5 stars after 7 days of ownership ("is this agent actually useful?")
- Filter: by type / price / skill set / trait

#### Layer 2 — Cosmetics & Items
- Pixel skins (backgrounds, overlays, accessory layers for Pixel Forge)
- 3D GLB models (armor sets, weapon skins for 3D Forge)
- Collectible items (holiday drops, milestone badges, rare trait unlocks)
- **Creator flow**: user uploads pixel art or GLB → review → listed → earns 85% of each sale
- Price floor: 10 Sparks. No ceiling.

#### Layer 3 — Plot & Room Exchange
- Founders Row plot deed listings (when transfer is enabled, Phase G)
- Room listings (buy/sell room ownership)
- AMM pool: token swaps between district yield assets and Sparks
  - `x * y = k` constant product
  - 0.3% swap fee → district reserve
  - Liquidity providers earn fee share

**Marketplace anti-inflation rules (from RAG GDC talk):**
> "Monitor currency supply, inflation rate, and median item price weekly. Alert when any metric drifts 15% in 7 days. Roll back or add a sink."
- Every listing requires a 1 Spark listing fee (small sink)
- Items that don't sell in 30 days → refunded listing fee, removed (prevents dead inventory)
- Price history chart on every listing (transparency)

---

## System 5: ECONOMY

### What exists now
- `economy-service.js`: integer Sparks, BigInt, `spend(userId, amount, reason, key)` — solid foundation
- `CITY_PLOTS[30]`: deed model, accrue(), CITY_RESERVE, Signal Drop fee
- Referral flywheel (built, uncommitted to main)
- Treasury service (built, uncommitted)

### What the RAG says to build

**From tokenomics domain (GDC inflation talk + MOBA vault model):**
> "Vault system: allocate token supply across 6 vaults. Each vault rewards different player actions."
> "Lock-to-earn vault: amount locked × duration = weekly rewards. Reduces circulating supply, stabilizes economy."
> "Monitor inflation weekly: currency supply, median price, velocity. Alert at 15% drift."

**Complete SHADDAI Sparks Economy:**

#### Faucets (Sparks in)
| Source | Rate | Gate |
|--------|------|------|
| Plot streaming | 0.5 Sparks/sec (base, boostable) | Own a Founders Row plot |
| Room rent | Weekly, per tenant | Own a room |
| Office residuals | Weekly, from transit + marketplace fees | Own a Founders Row office |
| District yield | Per-district credit, swappable to Sparks | Own outer district plot |
| Mission rewards | 1–10 Sparks per completed agent mission | Always |
| Referral bonus | 50 Sparks per referred signup who stays 7 days | Always |
| Daily login | 2 Sparks/day (from Daily Login Vault) | Always |

#### Sinks (Sparks out)
| Use | Amount | Where it goes |
|-----|--------|---------------|
| Boost lock | Variable | Stays in reserve (released on unlock) |
| Amenity purchase | 50–500 Sparks | Burned permanently |
| Transit fare | 10–25 Sparks per trip | City Treasury |
| Signal Drop rescue | 50 Sparks flat | Treasury |
| Marketplace listing fee | 1 Spark | Burned |
| Marketplace sale fee | 5% of sale price | Treasury → split |
| Room buyout | 500–2000 Sparks | Seller |
| Plot transfer fee | 2% of plot value | Treasury |
| 3D Forge credit | 50 Sparks | Burned (credits the Meshy API cost) |

#### Six-Vault Allocation (from MOBA model, adapted)
```
SPARKS_SUPPLY_VAULTS = {
  play:      50%,   // mission rewards, plot streaming, room rent
  daily:     10%,   // login bonus, daily quests
  referral:  10%,   // referral bonuses
  boost:     10%,   // locked supply (lock-to-earn)
  staking:   10%,   // Founders Row office holders
  reserve:   10%    // buyback, emergency sink
}
```
- Each vault has a balance; faucets draw from it
- When a vault hits 10% of initial allocation → refill event (treasury vote or scheduled)
- This prevents runaway emission

#### Inflation Monitor
- Weekly automated check (node cron): compute total Sparks in circulation, median listing price, trade velocity
- Log to `backend/data/economy-health.json`
- Dashboard Economy tab shows these metrics with green/yellow/red status lights

---

## System 6: MCP MONETIZATION

### What exists now
- AURA MCP server (`shaddai-aura` npm package) — Phase 1 shipped, 51 tests green
- Agent HTTP ports (8000–8008) as makeshift MCP endpoints
- Skills Library with 3,437 skills (md/json format)

### What the RAG says to build

**From mcp_selling domain:**
> "Remote hosted MCP server: accessible internally across organization or by a vendor to allow AI agents to interact. Connect via HTTP."
> "MCP tools: search tool, fetch tool, agent tool, database tool. Prompts are predefined — developers know best what to prompt."
> "Monetize: tools that call paid APIs charge users. Rate limiting per tier."

**SHADDAI MCP Product:**

#### Public SHADDAI MCP Server
- Hosted at `shaddai-api.onrender.com/mcp/v1`
- Exposes SHADDAI's 7 agents as callable MCP tools
- Any Claude Code user, any AI IDE, any agent framework can connect
- **Free tier**: 10 calls/day to ORACLE + QUILL
- **Pro tier**: 500 calls/day to all 7 agents
- **BYOK**: bring your own LLM keys → unlimited

#### MCP Tool Catalog (what you sell)
```
shaddai_research(topic, depth)       → ORACLE runs research, returns structured report
shaddai_write(brief, tone, format)   → QUILL drafts content
shaddai_audit_security(code_or_url)  → PIKADON security review
shaddai_build_api(spec)              → NEXUS generates Express routes + tests
shaddai_price_model(product, market) → ZEROX unit economics model
shaddai_design_ux(description)       → TURTLE wireframe + copy
shaddai_decide(question, context)    → SHADDAI strategic decision
```

#### MCP Tool Marketplace
- Third-party developers can submit tools
- Listed at `/docs` page under "Open Source / MCP"
- SHADDAI takes 20% of any revenue share if tool uses SHADDAI infrastructure
- Tools rated by users (1-5 stars, # calls this week)

---

## System 7: DASHBOARD TAB UPGRADES

### Tab 1 — 🏢 Command (Executive War Room)

**Current gaps:** static HUD, unwired Kanban, empty "Your Property"

**Build:**
- HUD strip wired to live data:
  - Sparks balance (pull from `/api/economy/balance`)
  - Today's plot yield (sum `CITY_PLOTS[].claimable` from localStorage)
  - Active missions count (from Kanban running column)
  - Agent online count (real ping results)
- Kanban wired to `/api/tasks` — show real job queue, not placeholder text
- "Your Property" widget: office slot number + plot yield streaming live + Signal reading (from localStorage, refreshed every 3s)
- World Activity feed: pull last 10 events from `shaddai.city` localStorage — plot claims, signal drops, boost activations — shown as timestamped log

### Tab 2 — 🌆 City (SHADDAI City Hub)

**Current gaps:** Signal bar only, no district view, no Founders Row grid, no reserve data

**Build:**
- **District overview**: 8 cards in 2×4 grid — agent icon + name + yield type + Signal drain rate + your status (have plot / no plot)
- **Founders Row grid**: 3 rows × 10 cols (30 slots) — gold = yours, lit = owned, dim = available — click to claim or view
- **Live yield ticker**: your plot's `claimable` incrementing every 2s (JS reads localStorage, math = rate × elapsed)
- **Boost vault**: "Lock Sparks" input → preview multiplier curve → "Boost" button → calls `/api/city/boost`
- **Transit status**: 3 unlock levels with progress (visited districts count, rooms owned count)
- **Treasury readout**: 3 reserve bars with percentages

### Tab 3 — 🚪 Rooms (Your Properties)

**Current gaps:** skeleton only, no data, no wiring

**Build:**
- Portfolio header: total rooms | combined weekly rent | total Sparks earned
- Pull rooms from `CITY_PLOTS` localStorage — flatten all `plot.rooms[]`, filter by `owner === userId`
- Room cards: district badge + building name + tenant archetype icon + weekly rent + rating stars + "Claim" button
- Empty state includes "Buy a Room" CTA → district picker → shows available room slots in each building
- "Claim All" collects all pending room rents in one action

### Tab 4 — 🖼 Gallery (Your Agents)

**Current gaps:** delegated to command-terminal.js, may render nothing

**Build:**
- Pull from `shaddai.gallery` (localStorage) + `/api/agents` for council
- Grid: portrait + name + type badge (Pixel/3D/Council) + 3 bound skills chips + status (Active/Idle/On Mission)
- Filter bar: All / Pixel / 3D / Council
- "Deploy to World" → opens game.html with `?agent=<id>`
- "List for Sale" → routes to Marketplace listing flow
- Council 7 pinned at top, non-deletable

### Tab 5 — ◆ Economy (Treasury & Ledger)

**Current gaps:** empty shdterm-scope div

**Build:**
- Sparks balance (large, prominent)
- Faucet/Sink table (live): plot stream rate + room rents vs. boost locks + sinks paid this week
- City Treasury reserves: 3 bars (transit pool / district reserves / buyback reserve)
- Inflation monitor: supply, velocity, median price — green/yellow/red status
- Referral stats: code + refs + Sparks earned
- Transaction history: last 20 Sparks movements
- "Cash Out" placeholder (greyed, Phase G)

### Tab 6 — ⚡ Skills (minimal)
- Add "Assign to Agent" button on each skill card → picks agent from dropdown → calls `PATCH /api/skills/equip`
- Tab button shows skill count badge

### Tab 7 — 📚 Library (Knowledge Base)
- RAG search bar → `POST /api/rag/query { query }` → backend runs `python rag/query.py` → returns top 5 chunks
- Agent memory feed: last 5 episodic memories per agent (what each agent learned)
- Top sources: 6 most-relevant video transcripts for current session context

---

## Build Order (Phases)

### Now — Phase B (game.html world rebuild)
Connected 3×3 world. Biggest remaining game task. Can start in parallel with dashboard.

### Now — Dashboard Tab Upgrades
City tab → Economy tab → Command tab → Rooms tab → Gallery tab → Library tab.
All are `index.html` only. Safe to build without touching game.html.

### After dashboard tabs — Phase C (Transit)
Ring Train + Subway in game.html. Needs Phase B world map first.

### After transit — Phase D (Boost Vaults)
Lock UI in City tab + `/api/city/boost` backend route. Needs economy-service.js wired to server.

### After boost — Phase E (Rooms/Tenants)
8-slot room system per building, tenant archetypes, weekly rent. Major game + backend work.

### After rooms — Marketplace Layer 1 (Agent listings)
Forged agent listings. Uses existing Bazaar UI shell + new `/api/marketplace` routes.

### After marketplace — MCP Public Server
Expose 7 agents as MCP tools. Rate limiting per tier. List at `/docs`.

### After MCP — x402 Integration
Per-user custodial wallet. Agent daily spend limit. 402 → sign → pay flow.

---

## What NOT to Touch

- `backend/server-production.js` economy-service.js core — add routes, don't rewrite
- The 7 council agent ports (8000–8008) — they work, don't change ports
- `pixel-forge.html` core loop — add trait system ON TOP, don't rewrite
- `game.html` Signal mechanic + CITY_PLOTS — built in Phase A, extend not replace
- AURA MCP package — it's on npm, breaking changes = versioned
- Any committed push — never force-push main

---

## The North Star

> "SHADDAI is the first platform where your AI agents run a business while you sleep."
> The city is the proof of life. The marketplace is the value exchange. The economy is what makes it real.

When a user forges an agent, gives it skills, sends it on missions, buys a Founders Row plot, locks a boost vault, and then wakes up to 47 Sparks accrued overnight — **that's the product working**. Everything we build points to that moment.
