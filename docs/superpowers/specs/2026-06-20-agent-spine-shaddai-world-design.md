# SHADDAI — Sub-project A: Agent Spine + Walkable SHADDAI WORLD v1

**Date:** 2026-06-20
**Status:** Design (awaiting user review → implementation plan)
**Working file:** `SHADDAI-DASHBOARD-v93.html` (incremental edits, no rewrites) + `backend/`
**Preview:** `node _dash93.cjs` → http://localhost:8099/ (PLAIN url)

---

## North star (the whole vision, for context)

**SHADDAI WORLD** — a walkable, Tron / Ready-Player-One–style agentic world that grows piece by
piece. People forge AI agents, customize their rooms, list them in a living marketplace, hire each
other's agents (x402) to do real work, sell skills/image-packs in a bazaar, earn NFTs for completing
tasks, and eventually play games/competitions. The marketplace is **a place you go into**, not a list.

This world is decomposed into sub-projects, built in order: **A → B → C → F** (then D, E, G).
- **A (this spec):** the agent spine — forge → My Agents → list → appear in a walkable world. + tools wired + add-more-tools.
- **B:** Agent Rooms built from layouts (place collectables + agent body; body gated Pro/Max).
- **C:** Marketplace v2 money loop — Pro-gated storefront, x402 hire, approve/deny work handshake, BYOK → get paid.
- **F:** SHADDAI WORLD expansion — enter rooms, bazaar, realtime multiplayer.
- Later: **D** Bazaar, **E** NFT task-rewards, **G** agent games & upgrades.

---

## Goals (Sub-project A)

1. **One clean agent lifecycle** every later sub-project reuses: forge → My Agents → (room | listed | working).
2. **My Agents roster** — a real "stable" the user manages (not buried in the Skills/Forge tab).
3. **Tools/skills genuinely connected + expandable** — equipped tools == callable tools (done), plus a Tool Catalog to add more after creation.
4. **A walkable, MMO-shaped SHADDAI WORLD v1** — a "🌐 SHADDAI WORLD" button (below Rooms) opens the upgraded marketplace floor, populated by **all users' listed agents**, with a player avatar + movement + proximity-to-hire. Feels alive/MMO without paid realtime infra.
5. Keep v91/v93 features intact; incremental edits; real data only (no mock).

## Non-goals (explicitly deferred)

- Room *building* from layouts → **B**.
- Approve/deny work handshake + BYOK get-paid execution → **C**.
- Realtime multiplayer (WebSocket presence/state-sync) → **F phase** (needs paid infra; architected for but not built).
- Bazaar skill/image-pack selling → **D**. NFT task-rewards → **E**. Games → **G**.

---

## The agent lifecycle (data model + states)

One record per agent in the existing **Operative store** (`/api/operatives`, `backend/lib/operatives*`).
Fields today: `owner, codename, archetype, rarity, portrait, brain{tier,brainId,persona}, tools[], look, deployedTo, listing{...}`.

**Add a single `status` field** (derived/normalized from existing `deployedTo`/`listing`):
- `draft` — just forged, lives in My Agents only.
- `roomed` — placed in a Room (B).
- `listed` — on the Marketplace → **appears in SHADDAI WORLD** (`listing.forSale=true`).
- `working` — assigned a task (C).

One agent, one record, one lifecycle. No duplicate "marketplace copies."

---

## Components (isolated units)

### 1. My Agents roster — `#myAgentsView` (new nav button "🧬 MY AGENTS")
- Renders the user's operatives (`GET /api/operatives` filtered by `owner`), reusing the premium card style from the revamped agent cards (hero portrait + rarity frame + skill/tool chips + status badge).
- Per-card actions: **Edit/Equip** (opens Tool Catalog + persona/brain), **Send to Room** (B stub), **List on Marketplace** (sets `listing.forSale`+price, status→listed), **Assign Work** (C stub), **Delete**.
- Forge already POSTs to `/api/operatives` on FORGE — so "save to My Agents" is automatic; this view just surfaces it. Agent portrait also linked into the Media tab (reference, not a copy).
- **Depends on:** `/api/operatives` (exists). **Interface:** reads operatives by owner; writes via PATCH/DELETE.

### 2. Tool system — belt + catalog
- An agent's `tools[]` is its callable belt. Already wired end-to-end (forge picker → `/api/operatives` → engine `options.tools` allow-list → execution; verified live on Ollama).
- **Tool Catalog modal** (`openToolCatalog(agentId)`): lists the real 182 tools (`GET /api/agent/tools`), grouped/searchable, multi-select pre-checked to the agent's current `tools[]`; Save → `PATCH /api/operatives/:id {tools}`.
- Validation: only names present in `/api/agent/tools` are saveable, so picked == callable.
- **Future hook (not built):** some catalog tools flagged `locked` → unlock via Bazaar purchase (D).
- **Depends on:** `/api/agent/tools` (engine registry), `/api/operatives/:id` PATCH.

### 3. Marketplace listing
- "List on Marketplace" → `PATCH /api/operatives/:id {listing:{forSale:true, pricePerCall, pricePerMonth}}`, status→listed. (Endpoint/shape already used by the Forge gallery's deploy flow.)
- Listed operatives are the feed for SHADDAI WORLD. **Gated: Pro** (see gating).

### 4. Walkable SHADDAI WORLD v1 — `#shaddaiWorldView` (new nav button "🌐 SHADDAI WORLD", below Rooms)
Upgrade `Desktop/SHADDAI-Marketplace-Floor.html` (canvas neon-exchange floor; `AGENTS` array drawn as glowing avatars; `drawFloor`/`drawAgent`; requestAnimationFrame loop) into a dashboard view:
- **Data-driven population:** replace the hardcoded `AGENTS` array with a live feed of **all** listed operatives (`GET /api/operatives?listed=1` — add a query filter, returns every owner's listed agents → the "MMO-shaped" crowd). Each = a booth/avatar at a floor position (hash of id → stable position; world grows as more list).
- **Player avatar + movement:** WASD / arrow keys move a player marker on the floor (single-player-smooth; no server). Camera follows.
- **Proximity interaction:** walking near a booth opens a panel → **View** (agent dossier) / **Hire (x402)** (rail exists; full handshake is C). 
- **MMO feel, no paid infra:** ambient idle drift on booths; populated by everyone's agents. The render layer consumes a "world-state" shape so a later F phase can swap the static feed for a **WebSocket presence layer** (realtime players) — a backend swap, not a rewrite.
- **Depends on:** `/api/operatives?listed`, the floor canvas code (ported into the dashboard view). **Interface:** `renderWorld(worldState)` where `worldState = {agents:[{id,codename,portrait,color,price,x,y}], player}`.

---

## Data flow

```
Forge (Skills tab)
  └─ POST /api/operatives  ──►  Operative store  ◄── My Agents roster (GET by owner)
                                     │  PATCH {tools}        (Tool Catalog)
                                     │  PATCH {listing}      (List on Marketplace, status→listed)
                                     ▼
                         GET /api/operatives?listed=1
                                     ▼
                         SHADDAI WORLD view  → renderWorld(worldState)  → canvas floor + player + booths
                                     │ proximity → View / Hire(x402)
```

---

## Tier gating (simple flags; reuse existing tier check)

- **Free:** Forge, My Agents roster, Tool Catalog, Send to Room.
- **Pro:** List on Marketplace (i.e. make an agent appear in SHADDAI WORLD).
- **Pro/Max:** show the agent's full **body/figure** in Rooms and on the World floor (Free sees bust/portrait only).
- Gating = a `tierAllows('pro')` guard on the List + body-render paths; no new billing work in A.

---

## Build order inside A (so the world is never empty)

1. **My Agents roster + `status` normalization** — the foundation; agents to manage.
2. **Tool Catalog** (add-more-tools) — confirm equipped == callable.
3. **List on Marketplace** → `listing.forSale` + `?listed` feed endpoint.
4. **SHADDAI WORLD view** — port the floor into a dashboard view; render the live listed-agents feed (static crowd first).
5. **Walkability** — player avatar + WASD movement + proximity Hire/View panel.
6. **Tier gating flags.**

Each step is independently testable (screenshot-verified on :8099) before the next.

---

## Architecture / isolation notes

- **Reuse, don't rebuild:** the Operative store, `/api/operatives`, `/api/agent/tools`, the agent-engine tool loop, the floor canvas, and the premium card markup all already exist. A is mostly *wiring + 2 new views + 1 modal + 1 query filter + a `status` field*.
- **Clear boundaries:** roster (reads operatives) · catalog (edits tools) · world view (renders a world-state) — each understandable and testable alone.
- **Single-file constraint:** new views are added incrementally to `SHADDAI-DASHBOARD-v93.html` following existing `#xxxView` + nav-button patterns; world canvas code ported from the standalone floor file. Back up v93 before risky edits.

## Risks / open questions

- **Floor performance** with many listed agents → cap rendered booths to nearest N around the player; paginate/cluster the rest.
- **`?listed` exposes all owners' agents** (intended for the MMO feel) — ensure no private fields leak (return only codename, portrait, archetype, rarity, price, public stats).
- **Player avatar identity** — generic marker vs the user's primary agent? (Default: generic neon avatar in v1.)
- **Body-render gating** depends on having full-figure art per agent (forge already generates portraits; "body" = same portrait for now, distinct full-body render is a B/Pro asset task).
