# SHADDAI City — Master Build + Systems Brief **v2** (curated 2026-09-27)

v1 was the owner's pasted brief (Grok/ChatGPT draft). v2 keeps its heart: the loop, the dopamine design, the success test and the hard-no list. It is corrected against **what the scene and the backend actually contain**. Every change has a reason in §1.

---

## 1. Audit of v1: keep / change / cut

| v1 said | Reality check | v2 decision |
|---|---|---|
| Centre = "The Grid, 7 agent houses + station" | In the canon, **The Grid** is the whole 1600 m district. The 7 agent buildings are **Shaddai City** (the existing 3D core, r ≈ 167 m). | Centre = **Shaddai City core**, the existing 3D city. It lives inside the first Grid ring road (r 170 m). **Do not touch.** |
| The centre is "finished" | `build_canon.py` step 1 also puts a 60 m monument, Central Station deck, the Agora and 7 agent pads at/near 0,0, which **overlaps the existing city**. | Canon centre pieces get **removed or moved out of r < 170 m** (step 13a). |
| "5–7 o'clock canal / water-stripe petal: don't pave canals" | The blue stripes are **not canals**. They are the Blender water disc (`DISC_Water`, water level 2 m) showing through flat ground: a viewport artifact. | No canal rule. Check that the stripes don't appear in-game; if they do, fix the ground height, not the design. |
| Petals by clock guesses (2–4 dense, 8–10 empty…) | The real Grid has **16 wedges**. Only 4 are built (N 0–22.5°, E 90–112.5°, S 180–202.5°, W 270–292.5°). The white areas are **4 empty petals of 67.5° each**. | Petals are re-mapped to real bearings (§2). |
| Campus at 10–1 | Emberfall (fire realm, dragon lairs) sits at 54° outside the ring. | **Campus + Perch in the NE petal, facing Emberfall.** Forge heat points toward the fire realm and dragons fly in from their home. Stronger story, same brief. |
| West petal "stays empty (player plots later)" | Owner wants the white areas filled. Plots are already real: `plot_buy` / `plot_status` exist in the SHADDAI MCP. | SW petal = **Plot District**: subdivided, claimable pads with holo claim-frames. It is dark at night *until players build*. It's filled, but unfinished on purpose. |
| Housing = convert dense existing towers | The 4 built wedges are exactly that. | Convert all 4 built wedges (windows lit 45–60 %, arcade bands, courier pads). The **SE petal = Commons**: new housing + shop streets, built from the new building library. |
| SPARKS earn/spend | **Already built.** `economy-service.js` is the only module that writes the Sparks ledger (`sparks_balance`, `spark_transactions`, idempotent). | Use it as-is. Every in-world earn/spend calls the existing economy API. |
| Academy / Hire / Skills / PayBox / x402 | **All exist:** `academy-routes` (`/catalog /quote /open_tab /spend /close_tab`), `hire-routes` (`/api/hire/rates`, `/api/hire/:agent`), `x402-agent-routes` (`/:name/hire`), `skills-market-routes` (`/api/skills/market…`, `/:agent/paybox`), `paybox-routes`, `x402-routes`, `bazaar-routes`, `work-sessions`. | World objects **bind to these endpoints** (§6). Nothing new gets invented where a route exists. |
| Phase 2: "plot yield = cut of city fees, then optional vault" | **Cut.** Sparks is closed-loop and one-way *by design*: no withdraw, cash-out or redeem, and "none may be added" (money-transmitter risk). | Plot income is **Sparks only**, from in-game rent/stall fees, never cash, yield or vault. x402/PayBox are **inbound rails only** (paying for actions / buying Sparks). |
| "No casinos" | The Hall (blackjack/arcade) is a shipped product. | The Hall lives **inside an existing agent building** (ZEROX lounge), never as a new casino building. The rule holds. |
| Collections 00_–06_ | The canon file already uses 00_–16_. | New collections are **20_–26_** (§8) so nothing collides. |
| Race on "existing outer ring road" | The Grid's outer ring road is r 1600 m (10.0 km lap). The gold maglev ring is r 2829 m, raised 6 m (trains, not racing). | TRACK_MAIN = **Grid outer ring road r 1600 m**, counter-clockwise, as v1 said. |
| Perch "tallest new thing" | Canon already has a 100 m sky-megatower (Suburbs, outside the Grid). | Perch ≤ 90 m, tallest thing **inside the Grid**. |

## 2. The real map (Blender metres: +X east, +Y north; bearing 0 = north, clockwise)

```
            N 0°  (Deep Void beyond the ring)
   NW petal         |         NE petal
 292.5°–360°   [N wedge built]  22.5°–90°  → Emberfall 54°, Sand Sea 31°
 RACE QUARTER       |         CAMPUS + PERCH
W 270° [W built] —— CORE —— [E built] 90° E (Suburbs beyond)
 SW petal           |         SE petal
 202.5°–270°   [S wedge built]  112.5°–180°  → Meadowfields 142°
 PLOT DISTRICT      |         COMMONS (housing + shops)
            S 180°  (Colosseum beyond)
```

Radii:
- Core (existing Shaddai City) r < 170 m.
- Ring roads at r 170, 576, 992 and 1600 m, with 16 spokes (12 m streets).
- Grid edge 1600 m; gold maglev ring 2829 m.

## 3. Districts (v1 content, re-seated)

### 3.1 Housing conversion: the 4 built wedges + Commons (SE petal)
- **Built wedges:**
  - Ground-floor arcade band (3–4 m canopy, cyan lintels).
  - 45–60 % of windows lit warm `#FFF2D0`, irregular.
  - Courier pads (2–3 m discs) on the 8–12 tallest roofs.
- **Commons (SE petal):**
  - Built with the new **Shaddai building library** (`tools/blender/assets/shaddai-buildings.py`): storefront-s/l, office, market hall, garden court, teleport plaza, ad pylon.
  - Commercial streets on the spokes, housing behind them. The Agora (stall market) moves here from the core.
- **Markers:**
  - `HUB_HOME_A…F`: at least 2 in the Commons, the rest spread over the built wedges.
  - `STALL_001…012`: on the Commons arcades.
  - `NODE_MAIL`: at the Commons end of a spoke.
- **Hub props:** `slot_type`, `rent_sparks_per_day: 5`, `vendor_enabled`, `agent_capacity 1-3`, `dashboard_id home.<letter>`.

### 3.2 Forge + Academy campus: NE petal, outer third, facing the core
- **Layout:**
  - `CAMPUS_PLAZA`: dark stone oval with a cyan clock-ring inlay and a canopy spine.
  - **Forge wing** on the Emberfall side (east); **Academy wing** on the core side (west). You walk out of heat into cool stone in 20 steps.
- **Plaza objects:** `OBJ_HIRING_BOARD` (the most important social object), `OBJ_SPARKS_KIOSK`, `SPAWN_TRAINEE`, `SPAWN_TEACHER`, `SPAWN_HIRE`.
- **Forge:**
  - `FORGE_HALL`, `BAY_01…06` (ember `#FF4A1A` only in the bay throats).
  - `FRAME_01…03` (winged frames have no extra hands).
  - `NODE_SKILL_INSTALL` (the chip slot: flashes cyan, then holds).
  - `NODE_REPAIR`. Roof glyph: anvil + circuit.
- **Academy:**
  - `ACADEMY_HALL`, `CLASS_01…04`, `ARCHIVE`, `DECK_OBSERVE`.
  - `OBJ_GRADUATION_DAIS`, `OBJ_CLASS_BOARD`. Roof glyph: open ring / eye.
- **Sound** (goes in DOC_WORLD): low hum, occasional clang, chip-seat click.

### 3.3 Perch: NE rim (~50°), behind the campus, off the race line
- `PERCH_SPIRE` ≤ 90 m. The crown `PERCH_MAIN` fits 2–3 dragon-scale bodies, with pads `PERCH_A…D`, a void-purple `#7A3DFF` crown lip only, and cyan approach chevrons.
- Dragons already fly in the game (`world-dragons.js`). The Perch is where tamed ones land.
- `ROUTE_COURIER` curve runs Perch → core edge → `GATE_START`.

### 3.4 Race Quarter: NW petal + TRACK_MAIN
- **Track:**
  - `TRACK_MAIN` = the r 1600 m ring road: darker running surface, cyan edge lines, counter-clockwise.
  - `CP_00…07` every 45°. `CP_00` / `GATE_START` sits at the N spoke (0°), next to the Race Quarter.
- **Race Quarter pieces:** `PIT_01…08`, `TOWER_RACE`, `PLAZA_SKATE` (ties to the existing SKATE pack in the Hall), `PAD_VEHICLE_SHOP` with the 6 `VEH_*` blockouts and their skill gates (v1 table unchanged).
- Gate and tower are the only "wow" meshes; the pits stay low.

### 3.5 Plot District: SW petal
- A subdivided plot grid (pads matching the Grid block sizes) with holo claim-frames showing `plot_status`.
- A claimed plot lights up, and the owner builds on it with the building library as the first catalogue.
- It is dark by night until built. That contrast is the story v1 wanted, and the owner's white area is still filled.

## 4. Look / material language (v1, unchanged except as noted)
- **Palette:**
  - Dark steel / charcoal / graphite structure.
  - Cyan `#3DFFF0` for civic, track and UI.
  - Forge ember `#FF4A1A` (contained slits only).
  - Academy cool glass and pale stone.
  - Perch void-purple `#7A3DFF` (lip only).
  - Housing warm `#FFF2D0` windows.
- **SHADDAI brand emerald `#00ff9c`** stays the Shaddai City / building-library trim. Cyan is civic/track and emerald is commerce/home, so the two read as different systems.
- **Art:** owner art on billboards and a few building sides only, not too much. The library already exports every art surface as `artslot-NN-*`, so new art swaps in by name.
- Every official building has a readable **roof glyph** for the top-down camera.

## 5. Dopamine loop (v1, unchanged)
Home → Academy/Forge → Job (race, teach, shop, hire) → SPARKS → Home.

| Hit | Examples |
|---|---|
| Short | window lights, stall sale ping, chip seat |
| Session | class finished, heat won, agent hired |
| Overnight | vendor sold while away, trainee graduated, SPARKS arrived |
| Status | Perch landing, race gate in your colours, academy rank on the hiring board |

**If a building can't create one of these hits, it isn't built.**

## 6. World object → REAL endpoint binding
Custom props on each marker: `endpoint`, `paybox_merchant_id`, `dashboard_id`.

| Object | Binds to (exists today) | Earn/Spend |
|---|---|---|
| `OBJ_SPARKS_KIOSK` | `economy-routes` `/balance /catalog /catalog/purchase` | shows balance; buy |
| `STALL_*` | `bazaar-routes` + `lib/bazaar-checkout.js` | offline vendor sales → earn |
| `HUB_HOME_*` | **new** `home` service (the only new backend piece): rent via `economy /spend` | rent → spend; daily check-in → earn (`/grant`) |
| `OBJ_CLASS_BOARD`, `CLASS_*` | `academy-routes` `/catalog /quote /open_tab /spend /close_tab`, `lib/academy-engine.js` | tuition → spend; finish → earn |
| `NODE_SKILL_INSTALL` | `skills-market-routes` `/api/skills/market/:id/run`, `/receipts` | install → spend |
| `OBJ_HIRING_BOARD` | `hire-routes` `/api/hire/rates`, `/api/hire/:agent`; `x402-agent-routes` `/:name/hire`; `work-sessions` `/assign /active` | hire → spend; hired → earn |
| `GATE_START`, `PIT_*` | **new** `race` endpoints on the existing economy (entry fee `/spend`, prize `/grant`) | entry → spend; place → earn |
| agent payments | `paybox-routes` + `paybox-guard.js` (scoped grants, caps, approval) | PayBox checks the grant; above cap → human passkey |
| pay-per-action | `x402-routes`, `lib/x402-v2.js`, `lib/economy-x402-bridge.js` | **inbound only**: 402 → pay → unlock / credit Sparks |

## 7. Money rules (non-negotiable; from `economy-service.js`)
1. SPARKS is the only number the city shows. It is **closed-loop and one-way**.
2. **No** cash-out, withdraw, redeem, transfer-out, yield, APY, vault or "land prints money". Not in the doc, not on signage.
3. PayBox and x402 are **rails in** (humans authorize agents; agents pay for actions). Chains (Solana, Base/EVM, Hedera) live in software, never as meshes.
4. Plot "income" = Sparks from in-game rent and stall fees. That sentence stays separate from anything about real money.

## 8. Blender structure
- New collections go in the canon file after the existing 00_–16_:
  - `20_HOUSING`, `21_ACADEMY_FORGE`, `22_PERCH`, `23_TRACK`, `24_PLOTS`, `25_MARKERS`, `26_DOCS`
- Text objects: `DOC_WORLD`, `DOC_SKILLS`, `DOC_DASHBOARD`, `DOC_PAYMENTS`.
- **The game and dashboard read the same file:** markers export to `public/assets/world/markers-v4.json` (`name`, `pos_m`, `props`), next to `canon-v4.glb`. Blender == game == dashboard ids.
- **Agents contract** (v1 §8, unchanged): `home_id`, `job_id`, schedule (≥ 3 beats), `skills[]`, Sparks ledger id, optional `paybox_client_id`. Max 8 `AGENT_PROXY_*`.
- **Cameras:** `CAM_TOP`, `CAM_GATE`, plus one approval render per step.

## 9. Build order (each step = render + owner approval before the next)
- **13a** Core clean-up: move canon centre pieces out of r < 170 m (Agora → Commons, monument → removed or relocated). The existing Shaddai City sits there.
- **13b** Housing conversion of the 4 built wedges (lights, arcades, courier pads) + hubs/stalls.
- **13c** Commons (SE) from the building library.
- **13d** Campus (NE): plaza, Forge, Academy, hiring board, kiosk.
- **13e** Perch + courier curve.
- **13f** Track overlay, gate, pits, Race Quarter (NW), vehicle blockouts, checkpoints.
- **13g** Plot District (SW) grid + claim frames.
- **13h** DOC_* texts + `markers-v4.json` export + game hook-up.

## 10. Hard-no list (v1, plus v2 additions)
The v1 list stands. v2 adds:
- No cash-out/yield language anywhere.
- Don't place anything in core r < 170 m.
- Don't replace the owner's existing 3D city.

## 11. Success test (v1, re-seated)
A stranger hovering over the disk says:

> "The middle is the old city. The bright wedges and the south-east are where people live and shop. Top-right they train and rebuild, and the spike is where the dragons land. The ring is a race, and the north-west is the pits. The south-west is plots nobody has built yet."

If they can't say that, something added noise. Remove it.

## Open decisions for the owner
1. Petal assignment in §2 (Campus NE toward Emberfall, Race NW, Commons SE, Plots SW). The alternative is v1's campus at the NW.
2. Canon monument at the core: remove it, or move it to the Commons plaza?
3. Plot District size: the whole SW petal, or half, with the other half as Commons overflow?
