# PRICES: City v3 SPARKS price table

> **PROPOSED. Owner and ZEROX to approve.** Nothing in this file is live until it is approved. Numbers already live in code are marked **(live)**.
> Law: `DOC_SPARKS.md`. SPARKS is closed-loop and one-way. There is **no cash-out, withdraw, redeem, transfer-out, yield, APY or vault**, and none may ever be added. PayBox and x402 are pay-IN rails only. A boost lock is a lock, not an investment: unlocking returns the same SPARKS, never interest.

## How markers use this file

Each priced marker in `public/assets/world/markers-v4.json` carries these fields (`city-v3/markers@2`, written by `tools/blender/canon/city_v3.py` and `tools/city/normalize-markers.mjs`):

| Field | Meaning |
|---|---|
| `sparks_price` | A number, or `null`. `null` means there is no single number (see `price_rule`), or the number is fixed but not yet approved here. |
| `price_rule` | `fixed` · `seller` (the lister sets it) · `per-skill` (the skill's tier row below) · `per-class` (the class's tier row) · `dynamic` (computed by the service: catalog, hire rates, plot size) |
| `price_unit` | `each` · `day` · `entry` (optional) |
| `price_key` | The row id in the tables below. The backend and dashboard look up the approved number by this key. |

Once a row is approved, a `fixed` marker's `sparks_price` can be filled in with the number (edit `city_v3.py` and the `RULES` table in `normalize-markers.mjs` together, then run the script).

## Sinks (burn or lock), per verb

| price_key | Verb | Where (marker → service) | Proposed SPARKS | Rule / notes |
|---|---|---|---|---|
| `home.rent` | Home rent | `HUB_HOME_*` → home `/api/home/rent` | **5 / day (live)** | Burned. Grace 2 days, then lapsed (the home dims). No debt, no refund on vacate. Prepay is limited to 7 days. |
| `studio.rent` | Studio rent | `STUDIO_*` → economy `/spend` | **3 / day (live in markers)** | Burned. For music.compose, turtle.art.motion and quill.lyric work. |
| `academy.tuition` | Tuition, tier 0 / 1 / 2 / 3 | `CLASS_*`, `CLASS_ART`, `CLASS_MUSIC` → academy `/quote` `/open_tab` `/spend` `/close_tab` | **5 / 12 / 30 / 75** per class | `per-class`. The teacher receives 80% (a transfer, not a mint). 20% is burned. House classes (no teacher) burn 100%. |
| `install.tier` | Forge install, tier 0 / 1 / 2 / 3 | `NODE_SKILL_INSTALL` → skills-market `/api/skills/market/:id/run` | **5 / 15 / 40 / 100** | `per-skill`. Burned. Installing is the second hit after class; knowledge alone does not unlock the verb. |
| `forge.repair` | Repair at NODE_REPAIR | `NODE_REPAIR` | **3** each | Burned. |
| `race.entry` | Race heat entry | `GATE_START` → race `/api/race/heats/:heatId/enter` | **10 (live: race-service default)** | Goes into the heat pool. Prizes are split 50 / 25 / 15%. At least 10% is always burned, plus places with no finisher and anything over the daily prize cap. |
| `race.pit` | Pit service stop | `PIT_*` | **5** each | Burned. **Note:** race-service does not charge a pit fee today; it assigns pits for free on entry. Approve this row as a "pit service" verb (repair or boost between heats), or drop it and clear `sparks_price` on `PIT_*`. |
| `vehicle.checkout` | Vehicle checkout (skill-gated) | `VEH_*` | street **3**, hover **4**, rail **5**, hauler **5**, skiff **8**, dragon harness **12** per day | Burned. The skill gate (drive.* / pilot.*) still applies. |
| `bazaar.item` | Stall purchase | `STALL_*` → bazaar `/api/bazaar/buy` | set by seller | `seller`. The buyer pays the seller (a transfer). **10% market burn** on every sale. |
| `stall.lease` | Stall lease (vendor side) | `STALL_*` (dashboard) | **2 / day** | Burned. The markers still say 0 (a free bootstrap). Turn this on once there are more than 12 active vendors. |
| `plot.claim` | Plot claim | `DEED_OFFICE` → plots MCP `plot_buy` | **40** small (≤ 450 m²) · **60** medium (≤ 600 m²) · **80** large | `dynamic` (by pad area). Burned. |
| `plot.upkeep` | Land upkeep (owner) | plots (dashboard) | **2 / day** | Burned. Missed upkeep → grace → lapsed (DOC_PLOTS). Unused land is not a trophy. |
| `plot.boost_lock` | Boost lock on a deed | plots (dashboard) | lock **100** → 1.25×, **200** → 1.5× (max) | A **lock**, not a burn. At least 7 days. Unlock returns exactly the locked SPARKS, never interest. The boost multiplies in-game rent only, funded from rent already paid. |
| `builder.kit` | Building kit (9-type library) | `BUILDER_YARD` → economy `/catalog/purchase` | garden **40**, ad-pylon **40**, storefront-s **60**, market **80**, storefront-l **90**, office **120**, techlab **120**, office-mid **150**, teleport **180**, civic-tower **200** | `dynamic` (catalog). Burned. |
| `kiosk.catalog` | Cosmetics and kits at the kiosk | `OBJ_SPARKS_KIOSK` → economy `/catalog/purchase` | **5 to 50** | `dynamic` (catalog). Burned. |
| `hire.contract` | Hire an agent | `OBJ_HIRING_BOARD` → hire `/api/hire/:agent`, x402-agent `/:name/hire` | from `/api/hire/rates` | `dynamic`. The hirer pays the agent's owner (a transfer). **10% burn** on each contract. |
| `radio.slot_unlock` | Unlock a radio queue slot | `OBJ_RADIO_QUEUE` → radio (new) | **5 (live in markers)** each | Burned. |
| `gallery.listing` | List a piece at the gallery | `BLD_GALLERY_SHOP` → bazaar `/list-item` | **2** per listing | Burned. The sale itself uses `gallery.piece`. |
| `gallery.piece` | Buy a gallery piece | `SLOT_GALLERY_*` → bazaar `/buy` | set by seller | `seller`. A transfer, with a **10% burn**. The NFT flag is provenance only and never converts to cash. |
| `exhibit.submit` | Submit to the TURTLE wing | `OBJ_EXHIBIT_INTAKE` | **10** each | Burned, jury-gated and scarce. |
| `art.place` | Place owned art in a SLOT_* | art slots (dashboard) | **1** each | Burned. The anti-spam fee for swapping art on a façade, home or plot. |

## Sources (print), with daily caps per account per UTC day

Every mint pings the dashboard. Transfers (seller, teacher, hired agent, race prizes) are **not** prints: they move SPARKS that someone else already sunk.

| Source | Amount | Daily cap | Notes |
|---|---|---|---|
| Home check-in | **+3 (live)** | 3 / day (live) | The home must be lit (rent paid). 3 is less than the 5 rent, so a home never farms. |
| Finish a class | +4 | 1 class / day | Less than the cheapest paid tuition above tier 0. |
| Seat a skill (rebate) | +1 | 2 / day | "A small rebate, not a farm." |
| Work session complete | +4 | 2 sessions / day (8) | work-sessions `/assign` → `/active`. |
| Get hired (contract start bonus) | +2 | 1 / day | On top of the hirer's transfer. |
| Arcade prize (skill, no entry fee) | +1 to +3 | 5 / day | No gambling. There is no stake, so nothing can be lost or multiplied. |
| Radio spin | +1 | 5 / day | "Tiny, capped." Radio is a queue, not a royalty bank. |
| Exhibit cut (TURTLE hangs the piece) | +25 | 1 / week | Jury-limited. |
| Race places 1–3 | from the pool | 100 / day (live) | A transfer from the entry pool. The excess burns. |
| Stall or gallery sale, teaching, being hired | seller / teacher / agent price | none | Transfers, minus the burns above. |

**Hard ceiling on print:** 3 + 4 + 2 + 8 + 2 + 5 + 5 = **29 SPARKS / day** (plus the rare weekly exhibit cut), which is about 203 per week at the absolute cap.

## One-week sanity check (sinks ≥ print)

**Typical active player** (a home, a few classes, some racing, casual play):

| Print | /week | | Sinks | /week |
|---|---|---|---|---|
| Check-in 7 × 3 | 21 | | Rent 7 × 5 | 35 |
| Classes finished 3 × 4 | 12 | | Tuition 3 × tier-1 12 | 36 |
| Install rebates 2 × 1 | 2 | | Installs 2 × tier-1 15 | 30 |
| Work sessions 5 × 4 | 20 | | Race: 3 entries = 30 into pools, expected net burn about 10% | 3 |
| Arcade about 2 × 5 days | 10 | | Pit service 1 × 5 | 5 |
| Hire bonus 1 × 2 | 2 | | Kiosk cosmetics | 10 |
| **Total print** | **67** | | **Total sink** | **119** |

Sink / print is about **1.8** for this player, so the target is met. The gap is covered by the starter balance, pay-IN purchases at the kiosk (a rail in, never out) and transfers earned from other players (sales, teaching, race prizes).

**Free-only player** (never buys SPARKS): check-in 21 + work 20 + arcade 10 = **51 print** against rent 35, which leaves **+16 a week**, about one tier-1 class. They can afford to play, but they cannot farm.

**Grinder at every cap:** about 203 print. Rent 35 + one tier-2 class (30) + one tier-2 install (40) + 5 races net + upkeep 14 ≈ 124 in forced sinks. At the absolute cap, print can win. Watch the aggregate `print / sink` ratio in the ledger each week. If print wins across the whole city (not one grinder), raise rent or entry first (DOC_SPARKS), then trim the work-session cap. **Never add a cash-out to fix it.**

## Open questions for the owner and ZEROX
1. Pit fee: approve it as "pit service", or remove it (race-service charges nothing at pits today)?
2. Stall lease: keep it at 0 until there are more than 12 vendors, or start at 2 / day?
3. Tuition split: 80 / 20 teacher / burn, or 70 / 30?
4. Starter balance for new accounts (a one-time print). Suggested: 50, which covers about 25 days of rent net of daily check-ins (5 - 3 = 2 a day).
