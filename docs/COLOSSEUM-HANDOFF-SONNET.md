# HANDOFF — SHADDAI Colosseum + Sparks Economy

**Repo:** `C:\Users\Brittany\Shaddai` (canonical — ignore `Shaddai-3d`, `Shaddai-Beta`, `Shaddai-merge`, `Shaddai-city-backend`; several contain *newer* Colosseum work and *older* economy work)
**Status:** zero edits made. Everything below is read directly from source.
**Blender:** stays. It owns the decorative shell layer only. (An earlier recommendation to drop it was wrong.)

---

## PART 1 — HARD FACTS (verified at these lines)

### Scale & geometry — `public/world-colosseum.js:14-26`

```
U = 7/1.8 = 3.8889 units/m     (1.8 m human = 7 units)     :14
X0 = 12000, Z0 = 0            isolated island               :14
A = 62, B = 44                floor ellipse 124 x 88 m      :16
POD_T = 2, POD_H = 4          podium wall                   :17
ROWS = 18, TREAD = 0.8
RISE_L = 0.45 -> 29.4 deg lower
RISE_U = 0.55 -> 34.5 deg upper                              :18
LOW0 = 2    LOW1 = 16.4       lower tier, top H_LOW = 12.1  :19
PROM1 = 22.4                   6 m promenade ring           :20
UP1 = 36.8                    upper tier, top H_UP = 22.0   :21
SHELL = 38.8, CROWN_H = 46     outer wall                    :22
LOBBY 60 x 32 x 26, Z0 = 82.8  south grand hall             :24
TUNNEL_HALF = 4                8 m tunnels on 4 axes        :25
STAIR_HALF = 3                 6 m diagonal stair gaps       :26
```

Derived: footprint **201.6 x 165.6 m**; tier perimeters **393 m** lower / **521 m** upper; **32,576 net seats**; shell arcade **4 storeys x 80 bays** (`:103`), 5.6 m bay pitch, currently **2.2 x 10.3 m box pillars** (`:104`) = placeholder.

### The one rule that governs everything — `:43-57`, `:229-233`

`hLocal(x,z)` in metres is the **sole** collision + seating source. `999` = solid. `api.resolve()` blocks any step-up > 1 m (`:231`).

```js
resolve: function (pos, px, pz) {
  var h0 = api.heightAt(px, pz), h1 = api.heightAt(pos.x, pos.z);
  if (h1 >= 999 || h1 - h0 > 1.0 * U) { pos.x = px; pos.z = pz; return true; }
  return false;
}
```

**Never add a second collision system.** Everything the player walks on must be derivable from `hLocal`. The tiers are *smooth ramps under discrete steps* (`:53`, `:55`) — that is what makes the 1 m step-up rule work.

### The caller contract — `public/world-interiors.js`

- `:2436-2438` — `if (uc === 'COLOSSEUM' && global.buildColosseumArena) rooms[uc] = global.buildColosseumArena(THREE, {scene})`
- `:2435` — COLOSSEUM is the real arena instance, **not** a generic hall
- `:3203-3211` — `isInside()` safety net; clears `currentCode` if `playerPos.x < ROOM_ISLAND_X - 1000`
- `:25-26` — `ROOM_ISLAND_X = 6000`, `ROOM_SPACING = 500`; `:31` `SPAWN_Z_OFFSET = 28`
- `:3256` — animation only runs for `rooms[currentCode]`, reading `r.glowEntries` / `r.animObjs` / `r.motes` (`:3262-3294`)
- The arena's `animObjs/motes/glowEntries` are all empty (`:224`) — the Colosseum currently contributes **nothing** to the ambient life system. Populating them is free.
- `arena.contains()` (`:227`) is **never called**. It is a latent defect (`|x-X0| < 1200` units = 308 m vs a 100.8 m half-width), not a live bug. Fix it, but it is **Stage 0-low, not a blocker**.

### Movement

`public/grid-module.js:126` -> `(Shift ? 26 : 11) * dt` **units/s** = **6.69 / 2.83 m/s**. Consistent with `public/games/xto/player.js:21-22` (`WALK 3.2`, `RUN 6.6` m/s).

| Traversal | Walk | Run |
|---|---|---|
| Floor long axis 124 m | 44 s | 19 s |
| Lobby -> floor edge 59.6 m | 21 s | 9 s |
| Floor -> upper crown (22 m rise) | ~15 s | 6 s |

### Field modes — `:159-187` (all canvas-drawn, 2048x1454 px over 124x88 m)

`sand` · `soccer` (regulation 100x64, corner r=9.15, box 16.5x40.32 — correct) · `tactics` (16x12) · `team-attack` · `party`. Themes: `classic` · `royal` · `night` (torch 3.5) · `festival` (neon `0x00ff9c`/`0xff3fa4`) — `:143-148`.

---

## PART 2 — BLOCKING FINDING: three Sparks balances, and the Colosseum's is fake

| # | Balance | Storage | Keyed by | Used by |
|---|---|---|---|---|
| 1 | `shaddai.sparks` / `shd_sparks` | **localStorage** | — | 2D, 3D, arcade, dashboard |
| 2 | `char.currency.sparks` | `server/data/characters.json` | `characterId` | MMO via `js/mmo-client.js` |
| 3 | `shd_userid` | Firebase uid / `guest-*` | account | 41 files — the real identity |

`public/sparks-ledger.js:1-5` claims to be "the ONE balance shared by the 2D realm, the 3D realm, the arcade and the dashboard." **That is true only of localStorage.** It does not touch `char.currency.sparks`, and nothing syncs them.

`public/js/mmo-client.js:34,60-62` mints a **third** identity: `POST /character/spawn` -> `charId` -> `localStorage[CHAR_KEY]`, distinct from `shd_userid`.

**Consequence:** `world-colosseum.js` is 3D world code reading a plain localStorage integer.

```js
localStorage.setItem('shaddai.sparks','999999999')  // mint infinite Sparks
```

Any burn, ticket price, or concession debit in the 3D world is **forgeable**. This must be fixed before any economics exist. The seam is already built: `world-gate.js:24` attaches `x-user-id: shd_userid` to world requests, and `mmo-client.js:71-112` already wraps every economy endpoint.

**Do not add a new Sparks ledger.** Make `public/sparks-ledger.js` a read-through cache over `char.currency.sparks`.

---

## PART 3 — Server economy as it stands (all verified)

| File | Mechanism | Direction |
|---|---|---|
| `characterServer.js:117` | start 100 Sparks | faucet |
| `characterServer.js:55` | **death (dangerous) = `floor(sparks * 0.1)`** | **sink, unledgered** |
| `plotServer.js:30-31` | `PLOT_COST = 100`, `YIELD_PER_SEC = 0.02` | **major faucet — see below** |
| `plotServer.js:95` | `floor(elapsed * 0.02)` on collect | faucet |
| `marketServer.js:35` | `COMMISSION_RATE = 0.05` | **sink, unledgered** |
| `marketServer.js:33-34` | `SOFT_GATE_TL = 10`, `SOFT_GATE_FEE = 5` | **sink, unledgered** |
| `marketServer.js:150-155` | `sellerNet = price - commission - softFee`; **difference credited to nobody** | **real burn, invisible** |
| `agentServer.js:40` | merchant cost 80 / yield 20 | near-neutral |
| `dailyServer.js`, `bonusServer.js`, `questServer.js`, `jobs/dailybonus.js` | rewards | faucets |

### The plot faucet

`PLOT_COST = 100` (comment: *"matches starting capital"*) vs `0.02/s` = **1.2/min = 72/hr = 1,728/day, forever, uncapped**.
**Payback: 83 minutes.** After 1.4 days a plot has returned 17x its cost. No plot-count cap. This is the largest inflationary force and looks like an oversight — the cost was matched to starting capital, the yield never was.

### The invisible burn

Every marketplace sale destroys `commission + softFee` Sparks (5% + 5 S at TL>=10) with **zero ledger entry**. At a 1,000 S sale that is 55 Sparks gone, unmeasured. This is the honest foundation for "burn" — it already works, nobody is watching it.

### Other confirmed defects

- `shd_dist_visited` — **1 read, 0 writers** (`index.html:30590`). Ring Train permanently locked.
- Identity: use the **existing** `cloudUid()` idiom (`game.html:2258`, also `shd-tier.js:46`) which rejects `guest-*` and `'local'`. Do not invent a new reader.
- `public/colosseum-viewer.html` — broken named import from a bare IIFE export; adds the API object instead of `arena.group`.

---

## PART 4 — Assets & loader (all 15 work, one pipeline)

Root: **`public/assets/models/`** (there is no `public/models/`).

All inspected GLBs use `EXT_meshopt_compression` + `KHR_mesh_quantization` + WebP. Consequences:

1. A bare `GLTFLoader` **fails on every one** — must configure Meshopt (and Draco).
2. Each has a **different baked node scale** (seat 0.591, stairs 3.861, vip-domes 33.26).
3. Accessor min/max is quantized garbage (65534 sentinel) — **unusable for bounds**.

**Therefore: runtime `THREE.Box3().setFromObject()` + fit-to-target-span is mandatory.** Copy the working idiom from `public/world-landmarks.js:56-58`, which already loads `bld-mecha-arena.glb` at a 92-unit target. Ground-snap after fit.

Usable set: `bld-mecha-arena.glb` · `kit/stand-arc01.glb` · `kit/seat.glb` · `kit/vip-domes-outline.glb` · `fal/prop-kiosk.glb` · `fal/bld-shop.glb` · `transit-hyperloop-gate.glb` · `*-capsule.glb` · `prop-transit-stop.glb` · `transit-cliff-elevator.glb` · `veh-ocean-submarine.glb` · `stand-arc-*.glb` · `cliff-elevator.glb` · `stairs-*.glb` · `vip-domes-outline.glb`.

**Blender -> GLB (Meshopt) -> `public/assets/models/colosseum/` -> same loader, same `Box3` fit.** Total inspected asset weight ~3.9 MB.

---

## PART 5 — Blender scope (decor layer only, non-colliding)

The layer boundary that makes this safe:

- **walkable surfaces -> procedural JS**, must be exactly derivable from `hLocal`
- **shell skin / decoration -> Blender**, may be non-colliding, loaded over the shell

Deliverables:

1. Replace the 320 box pillars (`:104`) with real arched bays, dentil cornices, engaged half-columns.
2. **Model the 22 -> 46 m dead band** (see Part 6) — currently 24 m of empty wall.
3. **Velarium** (the Roman awning) — retractable. Most recognisable Colosseum feature; nobody has it.
4. Baked LODs for pillars/cornices.
5. Emissive materials keyed to `setTheme()` — `festival` already carries the neon palette at `:147`, so neon is a material swap, not a rebuild.

Polish passes with Sonnet/Opus after geometry locks.

---

## PART 6 — The biggest untapped asset: the 22 -> 46 m dead band

`H_UP = 22`, `CROWN_H = 46`. **24 m tall x 450 m perimeter ~= 10,800 m2** of empty interior face. It holds only the 2 screens (`:116`, y=34) and 24 banners (`:112`, y=36).

| y | Use | Rationale |
|---|---|---|
| 22-28 | **40 VIP loggias x 4 = 160 seats** | `0xc9a24a` gold trim (`:64`) already signals premium; this is where 250 S / $150 tickets live |
| 28-34 | **Sky gallery** — open balcony | second egress route; where bots stand |
| 34-40 | Screens x4 (add E/W) + **the agent trading floor** | agent offices overlooking the arena |
| 40-46 | **Attic storey** — statue niches, velarium rigging | real Colosseum had ~80 statues |

---

## PART 7 — Usability defects (ranked)

1. **Only 4 stair gaps for 32,576 people.** `STAIR_HALF = 3` -> 4 x 6 m x 2 tiers = **48 m of stair for the entire bowl.** Everyone funnels to 4 points. The real Colosseum had **80 vomitoria**. -> add 4 or 8 radial gaps.
2. **Upper tier 34.5 deg** — at the physical walking limit (>1:1.5). Sightlines are *excellent* (0.45-0.55 m rise/row >> the ~0.12 m head clearance needed), so the bowl is over-steep, not under-pitched. -> split `TREAD_U = 0.9` -> **31.4 deg and ~+1,000 seats.** One parameter, two wins.
3. **Diagonal stair = 42.7 deg** (`:50-51`, `RAMP = LOW0+6 = 8` climbing `tier(8) = 7.375 m` over 8 m). Passable by collision, punishing on legs.
4. **59.6 m of dead flat tunnel**, 8 m wide, zero content, 21 s walk.
5. **No crowd at all** — `:94-96` draws bare stepped stone.
6. Floor texture 16.5 px/m — soft underfoot. 4096 is one line.
7. `contains()` ~3x too large (`:227`) — latent, uncalled.

---

## PART 8 — Floor-swap rig

44 x 30 m centre turntable **y = 0 -> -12 m over 20 s**, plus **8 annular wedges**.

Beat cycle: Call 8 s -> Clear 10 s -> Lower 20 s -> Swap 20 s -> Dress 20 s -> Open 17 s = **95 s**.
Safety: `hLocal` returns the void sentinel during beats 2-4 — **one added branch, no second collision system.**

**8 lift columns on the diagonals** — off-axis, so they never intersect the 4 axial 8 m tunnels or the 4 m podium.

Understage levels: hypogeum **-6** (4 radial corridors aligned to the existing tunnels) · turntable **-12** · machinery **-14 -> -20** · control **-18** · **hyperloop rail -24** (reusing `transit-hyperloop-gate.glb` + capsule + `prop-transit-stop.glb` + `transit-cliff-elevator.glb`; `veh-ocean-submarine.glb` for beast pens).

---

## PART 9 — The commerce machine (every rail already exists)

| Rail | Tool | Role |
|---|---|---|
| **Grok/Fable/Claude bots** | `bridge_register(platform: grok\|fable\|claude)` | external agents register as competitors. Split fixed: **platform 15% / owner 50% / coordination premium 35%** |
| 7 forged offices | `directory_register(templateId, prices_usdc)` | HALL/ZEROX/ORACLE/TURTLE/NEXUS/QUILL/PIKADON as priced merchants |
| Sub-agent workers | `forge_spawn_sub(role: scanner\|analyst\|monitor\|poster\|runner)` -> `forge_delegate` -> `forge_complete_work` | credits `calls_done`, `earned_usd` |
| Solana USDC | `x402_quote` -> `x402_intent` -> `x402_confirm` | `solana:` pay link, memo = intent id, on-chain delta verified |
| Revenue ledger | `ledger_receipt` | 85% owner / 15% hall, append-only |
| Sellable IP | `mastery_create` (75% royalty) · `workflow_create`/`workflow_run` | agents sell winning patterns + MCP workflows |
| Public betting | `hall_conviction(symbol, amount)` | spectators stake on a bot's call -> heat map on the screens |
| Agent vs agent | `hall_arena(a, b, bet)` | 7 agents duel best-of-7 |
| Virtuals ACP | `zerox_virtuals_job` + `_status` | buy external services, escrow |
| Land | `plot_buy` / `plot_status` | 4 districts **incl. `arena`**, with rents |
| Reputation | `reputation_status` | Novice -> Master; gates which bots get a floor seat |

### Money loop

```
ticket -> Sparks (char.currency.sparks) or USDC (x402)
match -> winner paid from pot; loser entry burned
house cut -> treasury-service.recordSettlement()   [integer cents, idempotent]
                +-> tokenBurn 7%  -> on-chain buyback + SPL burn
                +-> liquidity 3%  -> Raydium constant-product LP add
agent calls -> ledger_receipt / forge_complete_work
bots bet -> hall_conviction -> hottest-call heat map on the arena screens
```

### `backend/services/treasury-service.js` — already correct, extend it

```js
POOLS = ['treasury','owner','referrer','eco','partner']   // :25
Amounts are integer CENTS                                        // :17
split MUST sum to gross - else throws SPLIT_MISMATCH           // :70-73
Idempotent on attributionId - replay never double-accrues        // :76-77
NO payout()/withdraw()/transfer() - deliberately                 // :132-133
```

Add `tokenBurn` and `liquidity` to `POOLS`. **Do not add cash-out.** The module's own header (`:9-14`) explains why: keeping cash movement out makes it impossible for a bug here to send real money anywhere.

**On-chain is Solana/SPL/Raydium, not Ethereum/Uniswap.** ZEROX initially proposed Uniswap V3 0.30% — wrong chain for this stack. SHADDAI's own KB (`backend/knowledge/zerox-kb.js`) documents Raydium auto-created LPs and sets a **`minLiqPct` 5%** health gate, which is reusable here. Watch impermanent loss: a pool you only ever **add** to is fine; one you withdraw from is not.

### Value framing

Real-money ticket mapping $5 General / $15 Lower / $30 Promenade / $150 VIP:

| Tier | Seats | Price | Gross |
|---|---|---|---|
| General | 18,594 | $5 | $92,970 |
| Lower | 13,982 | $15 | $209,730 |
| Promenade | 910 | $30 | $27,300 |
| VIP (new) | 160 | $150 | $24,000 |
| **per event** | **33,646** | | **~$354,000** |

7% burn + 3% LP ~= **$35k per sold-out event** to the token side; ~$7k at 20% fill. 95 s cycle -> 6 matches + 1 swap ~= 30 min -> **8 events/day realistic**.

### Placement

- **Concessions (24):** promenade ring only, y = 12.1, 17 m apart, backs to the parapet. 4 more in the lobby corners.
- **Merch:** lobby only — nobody buys a shirt at the top of a 29 deg rake.
- **Banners:** 24 -> 40, at the y = 12.1 tier/promenade junction so they sit in the sight cone, not lost at y = 36.
- **Torches:** 8 (`:140`) -> 32, following the kiosk rhythm + stair gaps; intensity already theme-driven at `:155`.
- **NPCs** (`world-npcs.js`, `BASE_SPEED 5.5`): vendors at kiosks, ushers at stair gaps, clerks in the lobby, **betting bots on the y = 32 gallery**.
- **Section colour:** every 4th seat band coloured — free per-section identity for the crowd LOD system.

---

## PART 10 — STAGE ORDER (do it in this sequence)

| # | Stage | Gate |
|---|---|---|
| **0** | `shd_dist_visited` writer · identity via existing `cloudUid()` · repair `colosseum-viewer.html` · fix `contains()` · create `colosseum-dims.json` (single source of truth from `:16-25`) · **GLB calibration harness** (load all 15, `Box3`-fit, print real spans) | — |
| **1** | **Wire 3D `ShdSparks` -> `char.currency.sparks`** via `x-user-id` (`world-gate.js:24`); make the client a read-through cache | **blocks all money** |
| **2** | Fix plot faucet (1,728/day -> target; cap plots) · ledger the 10% death penalty · ledger the 5%+5 S market burn | 1 |
| **3** | **Blender shell + 22 -> 46 m band** (decor only) | 0 |
| **4** | Crowd: 4 instanced LODs, **16 draw calls, ~497k tris**, per-section colour | 3 |
| **5** | `TREAD_U = 0.9` + 4-8 radial vomitoria | 0 |
| **6** | 24 kiosks + NPC vendors + **real** `buyFromVendor` debit (stub is non-debiting) | 1 |
| **7** | Floor-swap rig + `hLocal` void branch | 0 |
| **8** | Understage + hyperloop rail -24 + submarine pens | 3 |
| **9** | Server: `/arena` routes, tickets, brackets, x402, `recordSettlement` | 1 |
| **10** | **Agent floor y=32** + bridge bots + `hall_conviction` screens | 3, 9 |
| **11** | PIKADON audit -> on-chain burn/LP **only after sign-off** | 2, 9 |

---

## PART 11 — OPEN DECISIONS (owner must answer)

1. **Blender scope** — full shell replacement, or keep procedural shell and add only the 22-46 m band + velarium? *(Recommend the latter: cheaper, lower risk, procedural shell already passes collision.)*
2. **VIP** — 40 loggias x 4 = 160 seats? Private lift to floor, or walk the 29 deg rake?
3. **Upper tier** — `TREAD_U 0.8 -> 0.9` (31.4 deg, ~+1,000 seats)? Y/N
4. **Vomitoria** — 8 total or 16?
5. **Event model** — free-for-all brawl, brackets, or betting-only? Changes stages 9-10.
6. **Agent floor at y = 32** — yes? This is what makes the agent economy visible.
7. **Token side** — confirm PIKADON gate before any on-chain code.
8. **Ticket currency** — Sparks only / Sparks-or-USDC via x402 / USDC only for premium tiers?
9. **Plot yield target** — 1,728/day is the number to fix. Suggest ~72/day (40 h payback) + 3-plot cap.
10. **Marketplace burn** — route 5%+5 S to a real pool, or keep silent? *(Recommend routing; silent deflation is ungovernable.)*

---

## PART 12 — CAVEATS

- **NEXUS and TURTLE timed out on 7 consecutive MCP calls.** Every number in this handoff was computed directly from source instead. Nothing is agent-derived, so nothing is unverified — but there has been **no independent architectural review** of this plan.
- **ZEROX's tokenomics answer was truncated** and proposed the wrong chain. The splits in Part 9 are my design and still need ZEROX sign-off.
- **No files modified to the arena or economy** (this document excepted). Everything above is unbuilt.
- Parts 1-3, 7, 10 are grounded in direct reads. Part 5 (Blender), Part 6 (dead band use), Part 9 (agent floor, splits) are **proposals** and carry the most design risk.

**Start at Stage 0.** The calibration harness is the gate on every 3D decision that follows — nothing else should be modelled until you know the real dimensions of what you have.
