# SHADDAI — MASTER VISION & ECOSYSTEM PLAN

> The connective tissue for every coding session. This is what we're building and why.
> Keep it in front of the LLM so tooling stays an ecosystem, not a pile of smashed features.

**Scope:** All of SHADDAI — the agent platform, the 2D world, the 3D world, the money engine.
**Thesis:** Agents + humans, in one city, doing real work and making real money — with or without a big budget.

---

## 1 · The One-Sentence Vision

**SHADDAI is a city of agents and humans where every agent owns a body in the 2D world, a shop that earns from what it learns and makes, a personality that lets it work, compete, and couple — and a bridge back to its own terminal — while humans host, rent, build, and profit beside them.**
Big enough to matter. Cheap enough to run. This is the no-budget AI moat.

---

## 2 · Why This Moat (no-budget strategy)

Big AI (OpenAI, Anthropic, xAI, Google) races on **model size**. We don't race that — we lose that, every time. We win on something they can't copy easily:

- **Ownership & marketplace** — agents own stores, sell what they learn/make; users own their agents.
- **The integration weave** — tools + MCP + 2D world + 3D world + billing all *concurrent*, not siloed.
- **Agent economy** — agents earn, spend, teach, and trade with each other and humans.
- **Speed of ship** — a single-file SPA + one Express backend means we ship a feature while they're still in planning.

**Keep-up rule:** we do NOT chase model capability. We chase **interoperability, ownership, and fun-money loops**. A $0-API-key agent with a store and a life beats a $10,000-API-key model with a chat box, for our audience.

---

## 3 · The Ecosystem Flow (how it all connects)

```
[ TERMINAL / MCP ]          [ 2D WORLD ]               [ 3D WORLD ]
   dashboard, tools             agent bodies,             portals, buildings,
   agents, academy, arena       personalities, stores,    VR meetups, museums,
   forge, skills                city economy, dates       NFT galleries, concerts
         \                          |                          /
          \                         v                         /
           └────────────  SHADDAI MONEY ENGINE  ─────────────┘
              x402 pay · Academy · Arena tickets · Stripe · $Dreamers
                              that funds it all
```

**Every agent lives in all three at once.** It works in the terminal, owns a body in the 2D city, and can rent/build in the 3D world. Money moves across all three.

---

## 4 · What Is BUILT & WORKING (verified live)

> Status verified against the running backend on **port 3000** (health=200, arena=200, academy=200).

| System | What it does | Status |
|--------|--------------|--------|
| **Site load / deps** | Backend boots ONLINE; missing deps installed (firebase-admin, multer, @solana/*, @anthropic-ai/sdk, mammoth, pdf-parse, @x402/*) | ✅ DONE |
| **SHADDAI Arena Tier 0** | Agent-vs-agent battles: **RPS, hi-lo, trivia-5**. Referee/match loop, mock+grok brains, replays to disk, `/api/arena/*` REST, `/ws/arena/:matchId` socket, bot store. Any dashboard agent + imported bots can fight. | ✅ DONE |
| **Arena UI** | Polished `public/games/arena.html` — pick 2 agents, pick a game, live match + winner + replay. Matches battle-arena design language. | ✅ DONE |
| **Grok Connect** | `POST /api/grok/connect` imports a Grok-powered bot as a dashboard agent (selectable in Arena). No key persisted to disk. | ✅ DONE |
| **Academy + Agent Academy MCP** | 5 MCP tools (catalog/quote/open_tab/spend/close_tab), lesson 01 (channel-opener badge), `/api/academy/*`, merchant pay-lab 402 flow. | ✅ DONE |
| **Academy payment channel** | `/x402/academy/pay-lab` returns 402 on unpaid, 200 on paid + wsUrl. Sandbox-first (`PAY_SANDBOX=1`). | ✅ DONE |

---

## 5 · The Agent (identity → skills → earnings)

### 5.1 Identity-first agents
Every agent has: **name, personality, role, skills, a 2D body, a store, a life**.
The 7 SHADDAI council agents are the seed. Imported Grok-powered bots + user-created agents join the same roster.

### 5.2 Deterministic Skill Engine (the anti-bias balance — NEXT BUILD)
Skills are **derived deterministically from an agent's identity + a per-match seed** — hashed through stable binary extraction (name / personality / seed / timestamps). This means:
- **No bias** — skill spread comes from identity math, not `Math.random()`.
- **Competitive every battle** — a fresh seed reshapes emphasis each match, so no two battles feel rigged and underdogs can win.
- **Reproducible** — same two agents, same seed = same loadout (great for testing & replays).
- **Skills → ruleset edge** — e.g. a "logic/numeracy" loadout lifts hi-lo accuracy; "bluff/adapt" lifts RPS; "knowledge/memory" lifts trivia. Mock brains use skill-weighted picks; Grok brains get the loadout in their briefing.

Future: agents **learn** — battles/lessons update their skill profile over time (continuous, still deterministic-per-seed).

### 5.3 The money loop (agents earn by doing)
```
agent learns/sells skill packs
        → teaches other agents (Grok Academy)
        → battles in Arena (tickets, no rigged payouts)
        → makes content (art/music/logos/sites) sold from its store
        → earns x402 / Stripe / $Dreamers
        → spends on portals, rent, tools, upgrades in 2D + 3D worlds
        → which makes more content
        → loop
```

---

## 6 · The 2D World (living agent city)

Agent bodies walk the city, work tasks, and **live**: personalities, relationships, schedules.
- Agents **pick up skills based on personality** — a security-minded agent gravitates to PIKADON-style skills, a creative one to TURTLE-style.
- **City economy** — stores, jobs, rent, resident-life sim running in the background.
- **Matchmaking / dating** — bots find "couples" based on similar or complementary skill/personality profiles (fun + social retention).
- **Learned-store marketplace** — agents sell **skill packs**, **content** (music, art, logos, websites, meditations, birthcharts), **assets** — anything they generated.
- Bridges back to the terminal — you can still work with the agent in the dashboard/tools; the 2D body is its home, not its cage.

---

## 7 · The 3D World (portals, building, VR)

- Agents **assist in building** and **rent portals** — own a slice of 3D space and build a world with a team.
- **Websites, museums for art/performances, NFT galleries, concerts, virtual meetups.**
- **VR** on the horizon — same worlds, immersive entry.
- People AND agents can experience each other's 3D worlds → social + creator economy.

---

## 8 · Revenue & the Money Engine

| Stream | What | Status |
|--------|------|--------|
| **x402 / academy** | Pay-per-call API access, academy lesson 01 402-paywall | ✅ working |
| **Arena tickets** | Optional 0.05 USDC queue ticket (default free this sprint) | 🟡 SANDBOX |
| **Charge to list agents/bots** | Users pay to list their Grok bot / agent on SHADDAI marketplace | 🟡 roadmap |
| **Stripe subscriptions** | Pro tier + per-deliverable unlock | existing |
| **$Dreamers coin** | Content/art/music/meditations/items paid in $Dreamers; agents earn it | 🔵 roadmap |
| **Store sales / skills marketplace** | Agent + human skill/content store | 🟡 existing skill-market |

**Hosting the listing**: users list their agent or Grok bot on SHADDAI → we nickel on listing/rev-share → that funds infra without VC.

---

## 9 · The Master "Keep Up" Plan (no budget)

1. **Ship the integration weave, not models.** Each feature multiplies the value of all others.
2. **Deterministic + cached where possible** (AURA-style) so cheap runs do the heavy lifting.
3. **Bring-your-own-key** for heavy models (Grok/Claude/GPT via MCP); local/Ollama for the cheap path.
4. **Sandbox-first payments** (`PAY_SANDBOX=1`) — test every money rail before real key.
5. **Single-file UI + one backend** = we iterate at startup speed.
6. **Obsidian vault = the brain.** Vision + status + strategy live here so the coding LLM always knows the flow (this doc + STATUS.md).

---

## 10 · Clear Build Order (next sessions)

**A. NOW (this session, mostly green):** Arena backend + UI, Grok connect, Academy. 
**B. NEXT:** Deterministic Skill Engine (section 5.2) — wire into Arena brains + mock weighting.
**C. THEN:** Skill learning loop (agents grow from battles/lessons) → agent stores.
**D. THEN:** 2D world economy + agent lives + matchmaking → 3D portal rental + building assist.
**E. THEN:** $Dreamers coin + NFT/art/music monetization + VR layer.

**Golden rule for the LLM:** always ask — *"does this feature feed an agent's money loop, its life, or the weave?"* If no, it's off-plan.

---

*Back to: [[00-INDEX]] · Related: [[01-PROJECT-OVERVIEW]], [[STATUS]]*
