# SHADDAI v92 — Master Cohesive Design (The Operative Lifecycle)

> One persistent Operative flows through five surfaces that share one data model,
> one visual language, and one economy. Every image is real FLUX. No crude SVG,
> no duplicates, no mock. This is the single source of truth for v92.

**Status:** Design (brainstorm) · **Date:** 2026-06-14
**Root:** `C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD\`
**Already done (Steps 0–1):** duplicate tabs removed; `hf-keys.js` rotation; dead image
endpoint fixed; 8 premium archetype portraits generated (`backend/data/forge-art/`).

### 0. Original-vision coverage (every ask → correct location)
| Your ask | Lives where (correct location) | Spec § |
|---|---|---|
| Agent Forge (heads/headwear/clothing, swivels) | **Skills** `#operatorForge` — upgrade in place (NOT a new tab) | §2 / A |
| Forge "in skills or its own forge tab, old forge moved/integrated/deleted" | Old crude forge **integrated/replaced in place**; duplicate I added = **deleted** | §2 / A |
| Marketplace = `SHADDAI-Marketplace-Floor.html` | Embed its canvas floor into existing `marketplaceView` | §4 / C |
| Rooms — **exact v91 rooms code** must be in the updated one | v92 **is** a copy of v91, so the v91 rooms (`renderAgentDesks`/`openAgentRoom`/`shd_room_*`) are already present; we **upgrade them in place** | §3 / B |
| Rooms = edit agent look, browse bought files / earned collectables, wearables | Room detail: wearables bay + My Files + My Collectables shelves | §3 / B |
| Collectables = `shaddai-nft-art-v2/collectables.html` (real 100) at top-right where old ones are | Wire `openCollectiblesShop()` modal **and** `SHADDAI-Collectables.html` to real `/api/collectables` (100 cards) | §5 / D |
| Unlock by using dashboard; **mint later** | Real `/api/collectables/unlock` from real actions; mint = honest "coming soon" | §5 / D |
| Use HuggingFace to update rooms & things | All room/operative art = real FLUX via `hf-keys` rotation | §3,§8,§9 |
| LATER: SHADDAI Games (soccer/basketball, agent-playable, watch, x402 wager) | Parked but **designed-for now** (Operative `stats`, room/marketplace hooks) | §6b / F |
| Clipper (`OneDrive\Desktop\SHADDAI CLIPPER`) — finish it | Finish engine + integrate into Media/Content Studio, tier+x402 gated | §6c / G |
| Save to Obsidian | This spec + the v92 master plan saved to the Obsidian vault | — |
| No mock, no bugs, full integration, master quality | Art rule + verification gates throughout | §8,§11 |
| One organized final version (v92), don't break anything | v92 = backed-up copy; in-place, additive, verified per step | §10,§11 |

---

## 1. The spine — the Operative entity (single source of truth)

Every surface reads/writes ONE record. Stored server-side (`backend/data/operatives.json`,
atomic writes), keyed by `id`. Owned by a user (`owner` = profile email).

```jsonc
{
  "id": "op_<buildHash>_<ts>",     // stable unique id
  "tokenId": 1,                     // sequential mint counter (NFT identity)
  "owner": "user@email",
  "codename": "VERDANT-7",
  "archetype": "gaia-link",
  "rarity": "legendary",            // computed from look (forge-core.rarityOf)
  "look": { "archetype":"gaia-link", "slots": { /* 9 forge slots */ } },
  "portrait": "/api/forge/image/forge-1.png",   // real FLUX custom portrait
  "brain":  { "tier":"alpha", "brainId":"claude", "persona":"…" },
  "tools":  ["web_search","sentiment", …],       // real, executable (agent-engine)
  "room":   { "theme":"crystal-cavern", "scene":"/api/rooms/image/…png", "wearablesLook": {…} },
  "inventory": { "files":[…], "collectables":[ "c1","c20", … ] }, // owned/earned ids
  "economy": { "auraEarned":0, "creditsSpent":0, "jobsDone":0, "earnings":0 },
  "stats":   { "speed":0, "power":0, "iq":0 },   // computed from rarity+tools; read-only; feeds Games (Pillar F)
  "createdAt": 0, "updatedAt": 0
}
```

**Backend store:** `backend/lib/operatives.js` — `create()`, `get(id)`, `listByOwner()`,
`update(id, patch)` (atomic). All five pillars call this; nothing keeps its own copy.
The existing `/api/brains/custom` agent record is linked by `id` (the working brain);
the Operative record is the "body + identity + inventory" wrapper around it.

---

## 2. Pillar A — FORGE (lives in **Skills**, `#operatorForge`)

**Purpose:** birth an Operative — its look AND its brain, in one premium screen.

**Layout (3 zones, casting-chamber aesthetic):**
- **Left — Casting Chamber (stage):** the operative shown as **real FLUX art**. Default =
  the pre-generated archetype portrait (`/api/forge/art/arch-<archetype>.png`) so it looks
  premium instantly. Drag = swivel (subtle 3D tilt/parallax on the portrait, not a spinning
  capsule). A **rarity halo** (gold/purple/teal) frames it. Below: `★ LEGENDARY` badge.
- **Middle — Builder:** archetype preset chips (8, each shows its real art on hover) + the
  **9 slot carousels** (body/headwear/outfit/aura/handheld/hair/eyes/background/accent) with
  ‹›. Changing a slot updates the rarity badge instantly; the stage shows the nearest
  pre-generated art and a "✦ custom — FORGE to render" hint when the build diverges from a
  preset (so users know the final art is generated on Forge).
- **Right — Brain panel:** CODENAME, PERSONALITY DIRECTIVE, BRAIN TIER (Free/Pro/Alpha →
  ollama/groq/claude), EQUIP TOOLS chips (real tool ids), then **⬡ FORGE OPERATIVE**.

**Forge flow (the money moment):**
1. `POST /api/forge` → real **custom FLUX portrait** of the exact build + rarity + NFT metadata.
2. `POST /api/brains/custom` `{codename, persona, brainId, tools, look, portrait, rarity}` →
   the real working agent.
3. `POST /api/operatives` → persist the unified Operative record (links both).
4. Stage swaps to the freshly-rendered portrait; gallery refreshes from
   `/api/forge/operatives?owner=`; toast "⚒️ Forged VERDANT-7 (legendary)".

**Replace in place:** delete the crude capsule (`of-rotor/of-body/of-head3/of-visor`); keep
codename/persona/tier/skills/gallery; swap the 5 weak presets for the 8 real archetypes.

**Quality bar:** the stage NEVER shows blocks — it always shows real FLUX art (archetype
art before Forge, custom portrait after).

---

## 3. Pillar B — ROOM (lives in **Marketplace**, `openAgentRoom()`)

**Purpose:** the Operative's lived-in home; where you dress it and review what it owns/earned.

**Entry:** Marketplace "Agent Floor" desks (`renderAgentDesks()`) — each desk card gets a
**real room-scene thumbnail** + an earned-collectables badge + outfit preview. "ENTER ROOM"
opens the room detail.

**Room detail (modal/overlay, casting-chamber + depth):**
- **Scene:** real **FLUX room background** via `POST /api/rooms/scene {owner,theme}` (themes:
  neon-loft, crystal-cavern, trading-floor, art-studio, void-sanctum…). The operative's
  **portrait** stands in the scene with perspective/ambient glow (lived-in, not flat).
- **Wearables bay ("change clothes"):** cycles the **same forge slots** → `POST /api/rooms/wearable`
  (validates vs `forge-core.ASSETS`); re-renders the operative (re-forge portrait on bigger
  changes, debounced, real FLUX). Rarity recomputes live.
- **Shelves:** **My Files** (marketplace purchases) and **My Collectables** (earned cards,
  real art). A "🎮 Launch into Games — soon" hook (parked).

**Data:** all on the Operative record (`room`, `inventory`). Reuses existing `shd_room_*`
localStorage for instant desk paint, server `/api/rooms` for truth.

---

## 4. Pillar C — MARKETPLACE (the trade floor)

**Purpose:** operatives create value. Three real actions:
- **Hire** an operative (yours or others') → x402 pay-to-hire (stub rail now, Solana later) →
  routes a job to that agent's brain.
- **Sell** a skill/pack/operative listing (existing `/api/market`).
- **Shop** for wearables/parts/room themes (spend AURA/credits) → adds to inventory, usable
  in Forge/Rooms.

**Surface:** the existing `marketplaceView` (Agent Floor + listings grid). Upgrade desk cards
(Pillar B) and wire the shop to the Operative inventory + economy.

**Floor visual:** `Desktop/SHADDAI-Marketplace-Floor.html` is a standalone canvas "agent floor"
(7 agents walking a 2D floor). Integrate it as the marketplace's **live floor view** (embed
its canvas renderer into `marketplaceView`, fed by real operatives from `/api/operatives`),
so the marketplace reads as a populated trading floor, not just cards.

---

## 5. Pillar D — COLLECTABLES (top-right, both surfaces)

**Purpose:** earning rewards. The **real 100 FLUX cards** (`/api/collectables/list`) replace
the procedural DiceBear cards in BOTH the `openCollectiblesShop()` modal AND
`SHADDAI-Collectables.html`.

**UX:** grid of real card art; **earned** = full color + shimmer, **locked** = greyscale +
"🔒 unlock by: <action milestone>". A progress header (`X / 100`). Per-card **Mint** button →
honest `/api/collectables/mint` "on-chain mint coming soon" (real unlock now, mint later).

**Earning (real, automatic):** real dashboard actions report to `POST /api/collectables/unlock`
via `window.collectablesReportAction(action, n)` — hooked into the actual code paths:
aura-save, analyze-news, clip-video, connect-api, generate-image, forge-agent, sell-skill,
build-workflow, etc. Crossing a milestone unlocks card(s) + toasts.

---

## 6. Pillar E — OFFICE (the work loop, mostly exists)

The Operative works jobs in the Office (existing pixel office + job board), earning **AURA/
credits** recorded on `operative.economy`. This closes the loop: earnings fund Forge re-rolls,
wearables, and unlock progress. Minimal new work — just write earnings back to the Operative
record and surface "your operatives at work."

---

## 6b. Pillar F — SHADDAI GAMES (future — "later later later", but designed-for now)

**Vision:** operatives are **playable**. Agent-vs-agent **soccer / basketball / arena**; owners
**spectate** their operative play; later **x402 wagering** on matches. Parked for build, but the
architecture is forward-compatible NOW so we never rebuild:
- The Operative record already carries everything a player needs (rarity, look, stats, economy).
- Rooms have a "🎮 Launch into Games — soon" hook; Marketplace will list "match tickets".
- Add (later) `backend/games/` (match sim engine, deterministic, server-authoritative) +
  `/api/games/*` (create match, sim, results) + an x402 wager ledger (reuse `x402-ledger`).
- Operative `stats` derive from rarity + equipped tools (e.g. speed/power/iq) — define the
  `stats` field on the Operative record **now** (computed, read-only) so games can use it.

## 6c. Workstream G — THE CLIPPER (premium feature — finish + integrate)

**Vision:** video → short clips, a premium tier feature. Real engine at
`C:\Users\Brittany\OneDrive\Desktop\SHADDAI CLIPPER` (Vite/React UI + Fastify `server/` with
`ffmpeg-static` + `ffprobe-static` + `@huggingface/transformers` Whisper). Owner thought it
done; it needs finishing, running, and wiring.
- **Finish the engine:** install, run `server/`, produce a real clip end-to-end (transcribe +
  cut), fix ffprobe/HF/Windows bugs. *(Note: a subagent was blocked because the folder is under
  `OneDrive\Desktop` — outside its sandbox; the MAIN agent has access and handles this directly.)*
- **Integrate into the dashboard:** surface in the existing **Media/Content Studio** as a real
  "Clip a video" action → proxy to the clipper service; gate by **tier** + **x402 metering**;
  an operative can "narrate"/own the clip job (ties to the Operative + economy). No mock.
- Clipper output files feed the operative's room **My Files** shelf (Pillar B).

## 7. Cohesion layer — how it all connects

**The lifecycle loop (one sentence each):**
- Forge **creates** the Operative (look+brain+NFT).
- Room is its **home** (dress, store, review).
- Marketplace **monetizes** it (hire/sell/shop).
- Office is where it **works** (earns AURA).
- Collectables is what you **earn** by doing all the above (unlock the 100).

**Navigation/IA:** no new top-level tabs (we just deleted the dupes). Each pillar lives where
users already expect it. Cross-links: a forged operative gets a "🏠 Open Room" + "🛒 List on
Marketplace" button in the Forge gallery; a room links to "⚒️ Re-forge look"; collectables
earned show on the room shelf.

**Economy (single ledger):** AURA + SHAD-credits already exist (`lib/aura.js`, billing). The
Operative's `economy` mirrors per-agent; spending in Forge/Rooms/Marketplace debits the same
ledger; Office credits it.

---

## 8. Quality & aesthetic system (the "feels like one product" layer)

A shared design token block (CSS vars) applied to all five surfaces:
- **Palette:** bg `#06080d`/`#0a1020`; primary teal `#22d3ee`; gold `#d4af37`; rarity colors
  legendary `#d4af37`, epic `#c084fc`, rare `#22d3ee`, common `#9fb0e0`.
- **Type:** display `Share Tech Mono`/`Chakra Petch`; body the dashboard's existing stack.
- **Texture:** subtle film-grain + vignette + scanline overlays (from the prototype shell),
  volumetric glow, holographic edges. Perspective/depth on stages.
- **Art rule (non-negotiable):** every operative/room/collectable image is **real FLUX**.
  SVG only for tiny UI chrome (icons, frames), never for the operative itself.
- **Motion:** staggered reveals on open, hover glow, swivel/parallax on stages.

---

## 9. Tech architecture

**Backend (Express, `backend/`):**
- `lib/hf-keys.js` ✅ (key pool + rotation) — used by forge/rooms/api-proxy.
- `lib/operatives.js` *(new)* — the unified Operative store (atomic JSON).
- `forge/` ✅ (`/api/forge` real FLUX + `/api/forge/art/:file` premium archetype art).
- `rooms/` ✅ (`/api/rooms/scene|wearable|image`).
- `collectables/` ✅ (`/api/collectables/list|unlock|mint|image`).
- `routes mounted` ✅ in `server-production.js`.
- **Canonical backend:** mirror all of the above into the `Shaddai-clone` repo that deploys
  to Render; `HF_TOKENS` in Render env; gitignored `runtime-keys.json` for local.

**Frontend (`SHADDAI-DASHBOARD-v92.html`, in place):**
- Forge → `#operatorForge` (Pillar A). Rooms → `openAgentRoom`/`renderAgentDesks` (Pillar B).
- Collectables → `openCollectiblesShop` + `SHADDAI-Collectables.html` (Pillar D).
- Dead `orchestrator.html` nav (~line 3340) → repoint to an existing view or remove.
- A shared `<style id="shaddai-tokens">` design-token block + small JS helpers
  (`shaddaiArt(url)`, `shaddaiToast`) reused by all pillars.

**Art pipeline:** `scripts/gen-forge-art.mjs` ✅ (archetypes). Extend to pre-generate room
theme scenes + any other fixed art, all via `hf-keys` (rotation, never blocks the UI).

---

## 10. Build order (phased, each verified before next)

1. **A — Forge upgrade** (real art stage + custom FLUX forge + unified record). *Most visible.*
2. **Operative store** (`lib/operatives.js`) — underpins everything; build alongside A.
3. **D — Collectables** wiring (both surfaces, real 100 + unlock).
4. **B — Rooms** upgrade (scene + wearables + shelves).
5. **C — Marketplace** desk cards + shop wiring.
6. **E — Office** earnings write-back + cross-links.
7. **Dead link fix + canonical backend mirror + aesthetic-token pass.**
8. **Workstream G — Clipper** (independent codebase; finish engine + integrate into Studio, tier+x402). Can run in parallel with 1–7 since it's a separate folder.
9. **Pillar F — Games** (PARKED; only the forward-compat hooks — Operative `stats`, room/marketplace stubs — land now).

## 11. Verification (end-to-end, real — no mock)
- Backend running with keys; open the **served** dashboard (not file://).
- Forge: build → FORGE → real custom FLUX portrait + working agent + Operative record; gallery shows real portraits; **no blocks anywhere**.
- Room: ENTER ROOM → real FLUX scene; change clothes persists + re-renders; files/collectables show.
- Collectables: modal + Collect page show real 100; trigger a real action → a card unlocks live.
- Marketplace: hire routes a job; shop adds to inventory.
- Office: a completed job credits AURA on the operative.
- Dead orchestrator link gone. Screenshots of each pillar for sign-off.
- `node --test backend/forge/*.test.js` + collectables/rooms harnesses green.
