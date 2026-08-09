# SHADDAI — Region Lead-Up & Life-Skill Design (v1, 2026-08-05)

> **READ THIS FIRST.** Companion to `SIEGE_ECONOMY_BUILD_SPEC.md`. Where that spec
> locks the *economy doctrine + on-chain money flow* for the castle siege, this doc
> locks the *world loop* that feeds it: what each of the 8 regions does during the
> 4-week lead-up, what is inside each building, how gathering/crafting/combat work,
> and how every resource either reaches the siege or gets removed from the game.
>
> **Cadence note:** the monthly siege replaces "Siege Sunday" from spec v1. The
> world runs on a monthly loop (4 lead-up weeks → siege day). All numbers below are
> grounded in the live game file (`public/game.html`, 254 KB) + `world-regions/*.js` —
> they are the current shipped values, not guesses.

---

## 1. Grounding (what already ships in `game.html`)

Every design below plugs into systems that already exist and were read from source:

| System | Shipped value |
|---|---|
| Regions | 8 real regions in `const REGIONS` (SHADDAI City, Green Meadow, Sunny Harbor, Downtown, Wildwood, Dust Canyon, Emberfields, The Suburbs) |
| Travel fares | `const FARE` — suburb 6, meadow 8, forest 9, beach 10, city 12, desert 14, volcano 16, agentcity 20 |
| Jobs | `const JOBS` — per-region wage job, 6 s cooldown, e.g. volcano "Work the Forge" [25–55] |
| Fish | `const FISH` — minnow 6 / bass 12 / salmon 22 / tuna 48 (big) / leviathan 130 (big) |
| Fishing | `castFish()` — stand near `WATER`/`DOCK`, 15–30 s bite, 22 % miss, size roll |
| Woodcutting | `doGather()` wood — 3 hits, +1 🪵/hit, +2 XP, felled +2, regrows 30 s |
| Mining | `doGather()` ore — 4 hits, +1 🪨/hit, 1.05 s per swing |
| Trade goods | `const GOODS` — wood 5, hide 9, water 4, ore 8, trinket 16 (base value) |
| Regional prices | `const MARKET_DEMAND` — per-region multiplier on base value; `agentcity:{ALL:1.5}` |
| Weapons | `const FORGE` — sword 3 fish/$30, bow 4/$45, axe 6/$70, staff 10/$120; upgrade 40·(lvl+1)+2·(lvl+1) fish, max +3 |
| Store tools | `const STORE` — pickaxe 45, fishing rod 40, potion 20, lantern 25; weapons shield 70, sword 60, bow 80, axe 120, staff 200 |
| Inventory | `inv`, `fish`, `stash` (home chest), `weaponUp`, `equippedWeapon` — saved in `shaddai.econ` |
| Homes | Suburb houses + `moveIn()` → `shaddai.home`; `shaddai.office` (level 5 + 500) in SHADDAI City |
| Interiors | `interiors.js` — kinds: hub, market, transit, diner, bank, tavern, pub, forge, library, office, home (`interiorKindFor()`) |
| Economy | `money`(sparks), `credits`(XP → level `1+⌊√(c/45)⌋`), `bank`, `coin`+`coinPrice`, 2 % protocol burn on Bazaar sales |
| Plots | `DISTRICT_YIELD` + `PLOT_TIERS` (RAW → DEVELOPED → LANDMARK) — region credit income |
| Combat | `combat.js` — FFTA-style tactical grid overlay (`#tacticsOverlay`) |

---

## 2. The monthly loop (4-week lead-up → siege day)

```
WEEK 1  GATHER        raw stockpile: cut, mine, fish, hunt, collect water
WEEK 2  REFINE/CRAFT  raw → planks/ingots/leather/rations → weapons & consumables
WEEK 3  WAR CHEST     arbitrage trade → money/bank, stockpile stash, gear up, form squad in SHADDAI City
WEEK 4  SIEGE DAY     gates open at Kether Keep (Wildwood); entry = ticket OR sub OR plot-owner
```

Design intent per the siege spec: **gathering/farming print value; the siege deletes it.**
So Weeks 1–3 are the *faucet phase* (you accumulate), siege day is the *sink phase*
(repair, consumables, siege mats, auction fees consume what you built — the economy
shrinks slightly every siege, never inflates).

---

## 3. What each region is FOR (non-siege loop) — and how it feeds the siege

| # | Region (emoji) | Signature resource / function | Regional demand edge | Feeds siege as… |
|---|---|---|---|---|
| 1 | 🌀 SHADDAI City | Command, banking, bazaar, offices | **ALL ×1.5** — best sell-everything price | War room, treasury/bank, squad assembly, siege registration |
| 2 | 🌳 Green Meadow | Farming, water, cooking, rest | water ×0.7 (cheap → refine, don't sell) | Food rations + feast buffs for siege day |
| 3 | ⛵ Sunny Harbor | Fishing capital | **fish ×1.3** — best fish price | Smoked fish rations + fish forge-mats (legacy FORGE) |
| 4 | 🏙️ Downtown | Finance, shopping, couriers | **trinket ×1.4, ore ×1.3** | War treasury (bank), supply purchases, courier quests |
| 5 | 🌲 Wildwood | Wood, hide, hunting, the KEEP | wood ×0.7 (surplus → refine/craft) | **Siege battlefield (Kether Keep)** + siege engines (ladders/rams), bows |
| 6 | 🌵 Dust Canyon | Smithing, water, trading post | **water ×1.9**, wood ×1.6 (import hungry) | Blacksmithing (siege weapons/repair kits), iron stockpile |
| 7 | 🌋 Emberfields | Top-tier smelting, obsidian | **water ×2.3**, hide ×1.4, wood ×1.5 | Obsidian weapon tier + ram parts; high-risk/high-reward farm |
| 8 | 🏘️ The Suburbs | Housing, storage, rest | ALL ×1.0 (flat) | Home base: stash, sleep/full-rest, resupply between raids |

### Region-by-region (the detail)

**🌀 SHADDAI City (`agentcity`, FARE 20, signal drain 0)**
- The command district — "Home of the 7 agents" (`REGIONS` desc). Transit hub (rail).
- Home to the 7 agent districts (from `SHADDAI_DISTRICTS.md`): QUILL's Library,
  ORACLE's Esoteric Archive, PIKADON's Security Station, TURTLE's Museum/Gallery,
  NEXUS's Navigator, ZEROX's Agora/Bazaar, SHADDAI's The Source.
- **Job:** Agent Bounty [30–60]. **Plots:** Sparks (DISTRICT_YIELD). **Office:**
  level 5 + 500 cost (`OFFICE_REQ_LVL/OFFICE_COST`).
- **Lead-up role:** the only region that buys *everything* at 1.5× → the war-chest
  liquidation hub. Also the siege **registration desk**: tickets, squad roster,
  banner pickup. Every unit is rallying here in Week 3.

**🌳 Green Meadow (FARE 8, drain 0.8)**
- Farmland + silver stream. Farm, windmill, bakery, chapel, well, inn, station.
- **Lead-up role: the pantry.** Water demand ×0.7 = don't sell water here; *cook*
  it. Farm + well → rations; bakery/diner → feast buff. Feeding the siege army is
  this region's job.

**⛵ Sunny Harbor (FARE 10, drain 1.5)**
- The port. Fish market, cannery, lighthouse, warehouse, pier/crane, pub/inn/cafe,
  cottages. **Job:** Haul Dock Cargo [18–40].
- **Lead-up role: the sea.** Fish sells best here (×1.3); cannery converts fish→
  smoked rations; warehouse = extra stash. Legacy FORGE eats fish → Harbor feeds
  the forge between events.

**🏙️ Downtown (`city`, FARE 12, drain 1.2)**
- Towers, shops, bank, hotel, central station, city hall, plaza, mall.
- **Job:** Courier Run [20–45].
- **Lead-up role: the war treasury.** Bank holds your Sparks; trinket/ore sell
  high here (×1.4/×1.3); city hall = alliance/leaderboards; courier quests fund
  Week-3 purchasing.

**🌲 Wildwood (`forest`, FARE 9, drain 0.8)**
- Deep pine forest. Treehouses, watchtowers, trapper, ranger lodge, log cabins,
  rope bridges, **Kether Keep** (the castle!). **Job:** Hunt & Forage [16–38].
- **Lead-up role: the timber + battlefield.** Wood cuts cheap-fast here (surplus,
  ×0.7 → refine into planks/bows rather than sell). Trapper → hide/leather.
  Watchtowers scout. **The monthly siege happens at Kether Keep.** Siege engines
  (ladders, battering rams) are built from Wildwood timber in Week 2.

**🌵 Dust Canyon (`desert`, FARE 14, drain 3.0)**
- Adobe pueblo, mesa, oasis, well, **Grand Forge**, trading post, bazaar, air pad,
  watchtowers, inn. **Job:** Mine the Mesa [18–42].
- **Lead-up role: the smithy + caravan.** Ore mined here feeds the Grand Forge
  (weapon blacksmithing). Water is scarce → ×1.9, best mid-tier cash farm.
  Trading post = arbitrage hub (buy low in surplus regions, sell here).

**🌋 Emberfields (`volcano`, FARE 16, drain 3.0 — hardest)**
- Obsidian, lava rivers, ember huts, **Great Smelter**, Ash Forge, Obsidian Spire,
  Binah Needle, The Keeper. **Job:** Work the Forge [25–55] (highest wage).
- **Lead-up role: the foundry.** Top-tier smelting → obsidian-tier weapons, ram
  parts, cannon bolts. Everything else is expensive here (water ×2.3, hide ×1.4,
  wood ×1.5) → you import to Emberfields, never sell raw. High signal drain = only
  high-level players farm it. Highest risk, highest reward, best siege gear.

**🏘️ The Suburbs (FARE 6, drain 0)**
- 20 homes (Maple/Oak/Rose/Willow/Elm houses, cottages, villas), Nexus Flats/Lofts,
  Tower B/C, pond, marina. **No job.** ALL ×1.0.
- **Lead-up role: the home base.** Cheapest travel, zero drain, move-in + home
  storage chest (`stash`), sleep = full restore. Resupply + safe logout between
  raids. The soft-economy refuge — nothing to sell, everything to store.

---

## 4. Inside each building (per region)

Interiors are wired by `interiorKindFor(b)` in `game.html` — name/regex → interior
kind. Proposed inside-contents extend the *furniture/interaction* of each kind
without changing the render engine (`interiors.js` renders rooms from
`intRoom = {w,h,door,furniture,order,npc}`).

### 🌳 Green Meadow
| Building | Kind | Inside |
|---|---|---|
| Farm / Barn | `home`-farm | Hay bales, sheep, chicken pen, milk/juice press; **farming station** (plant/seed → crop → rations) |
| Windmill / Mill | `market`-mill | Grinding station: wheat→flour→bread (meal crafting) |
| Bakery / Diner / Store | `diner` | Cook stove; converts fish/water/grain → rations; sells cookware |
| Well | `market` | **Water station**: collect 💧 Fresh Water (free, small cooldown) |
| Chapel | `tavern`-calm | Rest altar → buff (blessing, +XP for 10 min) |
| Inn / Tavern / Bar | `tavern` | Sleep/rest, rumored siege tips, sell rations |
| Cottage homes | `home` | Move-in homes (like suburb), storage chest |
| Station | `transit` | Rail gate → other regions |

### ⛵ Sunny Harbor
| Building | Kind | Inside |
|---|---|---|
| Fish Market | `market` | Buys fish at ×1.3; sells rods/bait |
| Cannery | `market`-craft | **Smoking station**: 1 fish + 1 water → 2 smoked rations |
| Lighthouse | lookout | Regional map view + alert relay (siege countdown) |
| Warehouse | storage | Extra stash slots (rentable) |
| Pier / Dock / Crane | open | Fishing spots + "Haul Dock Cargo" job, boat rides |
| Pub / Bar / Cafe / Inn | `tavern`/`diner` | Rest + crew hire rumors |
| Cottage | `home` | Move-in home, storage |

### 🏙️ Downtown
| Building | Kind | Inside |
|---|---|---|
| Bank / Exchange | `bank` | Deposit Sparks, interest, safe for war chest |
| Mall / Shops | `market` | Biggest store inventory (weapons, tools, home) |
| Central Station | `transit` | Rail hub to all regions |
| Hotel | `tavern` | Premium rest + rentable room |
| Office towers | `office` | **Your office** (level 5 + 500) — same office as dashboard |
| City Hall | `hub` | Alliance roster, siege leaderboards, mayor NPC |
| Pub | `pub` | Fight club / arena PvE side-game |

### 🌲 Wildwood
| Building | Kind | Inside |
|---|---|---|
| Trapper | `market`-craft | **Tanning station**: hide → leather; sells traps |
| Ranger Lodge | `home` | Rest + ranger gear quests |
| Treehouse / Log Cabin | `home` | Move-in homes, rope-bridge access |
| Watchtower / Forest Lookout | lookout | Scouting view, archery range (bow skill) |
| Kether Keep | **siege target** | Gates, ram slots, flag points — battle on siege day |
| Campsite | open | Fast campfire buff, respawn point |

### 🌵 Dust Canyon
| Building | Kind | Inside |
|---|---|---|
| Adobe homes / Pueblo | `home` | Move-in homes, storage |
| Well / Oasis | `market` | **Water station** (rare & valuable ×1.9) |
| Grand Forge | `forge` | **Blacksmith station**: ore→ingots→weapons, repair kits |
| Trading Post / Bazaar | `market` | Arbitrage prices, caravan merchant |
| Watchtower | lookout | Mesa view, ambush-spot |
| Inn | `tavern` | Rest + caravan tips |
| Air Pad | `transit` | Air gate (desert↔beach↔volcano) |

### 🌋 Emberfields
| Building | Kind | Inside |
|---|---|---|
| Ember Hut | `home` | Move-in homes (lava-safe), storage |
| Ash Forge / Great Smelter | `forge` | **Top smelter**: ore→obsidian ingots, obsidian weapons, ram/cannon parts |
| Obsidian Spire / Binah Needle | lookout | High-ground view of whole realm |
| The Keeper | `tavern` | Legendary vendor — sells siege-exclusive mats, rare recipes |

### 🏘️ The Suburbs
| Building | Kind | Inside |
|---|---|---|
| Houses/Cottages/Villas (Maple/Oak/Rose/Willow/Elm) | `home` | Move-in, decorate, storage chest, sleep |
| Nexus Flats / Lofts / Tower B / Tower C | `home`-apartment | Smaller homes, apartment view |
| Pond / Marina | open | Beginner fishing, picnic bench |

---

## 5. Life-skill mechanics

One rule ties all skills together: **skill XP is a separate counter per skill, level
via the same curve** (`levelFor(c) = 1+⌊√(c/45)⌋`), persisted in `shaddai.econ`.
Higher skill level → faster actions, bigger yields, better rarity, unlocked recipes.

### 🌲 5.1 Cutting / Woodcutting (already ships)
- Swing a tree: 3 hits, +1 🪵/hit, +2 XP, felled tree pays +2 🪵, **regrows in 30 s**
  (`doGather`, gather cooldown 0.85 s).
- **Proposed tiers:** fists (as shipped) → axe tool → upgraded axe (`weaponUp` +1..+3)
  → fewer hits per tree, chance of double log. Level unlocks **planks** (refine
  3 wood → 1 plank) and **siege engine recipes** (ladders, ram frame).

### ⛏️ 5.2 Mining (already ships)
- Swing ore node: 4 hits, +1 🪨/hit, 1.05 s per swing. Requires pickaxe in hand
  (STORE pick, 45) — without it the node is "too hard".
- **Proposed:** node tiers by region — meadow ore is basic, Dust Canyon mesa ore
  yields richer veins, Emberfields obsidian nodes need pick +lv2 and drop
  obsidian shards. Level unlocks **smelting** (2 ore → 1 ingot).

### 🎣 5.3 Fishing (already ships)
- Stand within 2 tiles of `WATER`/`DOCK` (`isNearWater`), cast → 15–30 s bite →
  22 % miss → size roll → weighted fish (minnow 6, bass 12, salmon 22, tuna 48,
  leviathan 130).
- **Proposed:** rod tiers (STORE rod 40 + upgrades), region fish pools (beach =
  tuna/levi, suburb pond = minnow, volcano lava = emberfish), **fish are both
  currency (FORGE) and food** (cook → rations).

### 🏹 5.4 Hunting & Foraging (partially ships)
- `GOODS.hide` (9) drops from animals; forest job "Hunt & Forage" [16–38] is the
  standing income.
- **Proposed:** animal spawns in Wildwood/meadow → fight or trap → hide; berry
  bushes (forage, free, restores small HP); mushroom spots in forest (rare, craft
  potions). Level unlocks **leather** (2 hide → 1 leather).

### 💧 5.5 Water collection (partially ships)
- `GOODS.water` (4) is collected at wells/oasis/streams/docks on a cooldown.
- Water is the **arbitrage king**: ×0.7 meadow (refine it) → ×1.9 desert →
  ×2.3 volcano. Hauling water across regions is the intended caravan trade.

### 🍲 5.6 Cooking (new)
- Station: bakery/diner (meadow, beach cannery, city mall food court).
- Recipes: 1 fish + 1 water → **2 rations**; 2 wheat (farm) + 1 water → **feast**
  (party-wide +dmg on siege day); fish + berries → potion.
- Rations are **siege-day consumables** → eaten in battle → a sink.

### ⚒️ 5.7 Smithing / Forging (partially ships)
- `FORGE` (fish + money) stays as the legacy material sink: sword 3 f/$30, bow
  4/$45, axe 6/$70, staff 10/$120; upgrade 40·(lvl+1)+2·(lvl+1), max +3.
- **Proposed additive material recipes** (ore-based, at Grand Forge / Great Smelter):
  - Iron Sword = 2 ingots + 1 hide
  - War Bow = 2 planks + 1 hide
  - Battle Axe = 3 ingots + 2 planks
  - Obsidian Blade = 2 obsidian ingots + 1 ingot (Emberfields only)
  - Repair Kit = 1 ingot + 1 hide → fixes broken siege gear (sink)
- Blacksmith level gates which stations/recipes open.

### ⚔️ 5.8 Combat (ships — `combat.js`)
- FFTA-style tactical grid (`#tacticsOverlay`), weapons via `WeaponArt`, HP,
  downed→respawn at plaza. `quest.kills` tracks bounty-board kills.
- **Proposed:** siege day reuses the tactical overlay with flags/gates/rams as
  objectives; damage/heals feed the contribution ledger.

---

## 6. Item & weapon building — the crafting graph

```
RAW (gather)              REFINED (skill stations)            GEAR / CONSUMABLES
────────────────────────────────────────────────────────────────────────────────
🪵 Wood        ─(cutting lvl)→  Planks          ─→  War Bow, ladders, ram frame
🪨 Ore         ─(mining lvl)→  Ingots          ─→  Iron Sword, Battle Axe, bolts
🌋 Obsidian    ─(volcano)→      Obsidian Ingot  ─→  Obsidian Blade, ram head, cannon
🟫 Hide        ─(hunting)→      Leather         ─→  armor pad, bowstring, Repair Kit
💧 Water       ─(well)→         (clean water)   ─→  rations, potions, feast
🐟 Fish        ─(fishing)→      (as-is)         ─→  legacy FORGE mats + smoked rations
💎 Trinkets    ─(loot/quest)→   (as-is)         ─→  sold in Downtown (×1.4)
```

**Weapon ladder (ships + additive):**
1. Fists → store-bought Iron Sword (60) / Short Bow (80) / Shield (70)
2. Legacy FORGE: sword/bow/axe/staff (fish + money) — unchanged
3. Material smithing: Iron/War/Battle tiers (ore/hide) — new
4. Emberfields: Obsidian tier — siege-day power ceiling
5. `weaponUp` +1..+3 upgrade path (40·(lvl+1)+2·(lvl+1)) — unchanged

**Consumables (sink candidates):** Health Potion (STORE 20), Rations (siege day),
Repair Kit (post-siege), Banner (clan), Feast (party buff), Lantern (25).

---

## 7. Resource decisions — keep vs remove

The player-facing question every session: **"sell now, bank, refine, or hoard?"**
The design gives each good a clean answer:

| Good | SELL it in… (best ×) | KEEP/REFINE it for… | REMOVE it via… |
|---|---|---|---|
| 🪵 Wood | Dust Canyon ×1.6, Emberfields ×1.5 | planks → bows/engines | burning (lvl skill), cheap Wildwood sale ×0.7 |
| 🪨 Ore | Downtown ×1.3, Dust Canyon ×1.1 | ingots → smithing | Emberfields ×0.9 = refine locally, never sell raw |
| 🟫 Hide | Emberfields ×1.4, Beach ×0.9 | leather → gear/repair | forest sale ×0.8 |
| 💧 Water | Emberfields ×2.3, Desert ×1.9 | cooking/potions | meadow ×0.7 = always refine, never sell |
| 🐟 Fish | Beach ×1.3, Emberfields ×1.3 | FORGE mats, rations | meadow ×0.9 |
| 💎 Trinket | Downtown ×1.4 | nothing | everywhere else weak — always Downtown |
| 💵 Sparks | — | bank, tools, tickets | bazaar 2 % burn (avoid if possible), forge, upgrades |

**Flow (end to end):**
```
Gather (W1) ─→ Refine/Craft (W2) ─→ Stockpile: stash + bank (W3)
                        │
                        ▼
   Arbitrage trade: buy cheap (meadow water, forest wood) → sell high
   (desert/volcano/city) → Sparks → war chest
                        │
                        ▼
         SIEGE DAY (W4, Kether Keep) — CONSUMES: tickets, rations,
         repair, consumables, siege mats, auction fees  =  SINK
                        │
                        ▼
         Siege mats drop → forge (between events) → loop restarts
```

**Remove decisions (why things leave the game):**
1. **Spent:** tickets, rations, potions, repair kits, forge mats (all sink).
2. **Burned:** 2 % protocol burn on every Bazaar sale (existing).
3. **Sold cheap:** surplus you chose not to refine (opportunity cost of hoarding).
4. **Sold high:** your *income* — this is the faucet that funds the war chest.
5. **Never removed:** hides/ores/water you refined into gear — those compound.

---

## 8. Monthly cadence HUD + gates (for the build)

- **Siege countdown** in HUD (28-day cycle; persistent in `shaddai.econ`).
- **Entry gate** (per siege spec): paid ticket (x402 USDC) **OR** active monthly
  sub **OR** owns a plot in the realm (Metacore deed).
- **Rewards** (per siege spec): 40 % contribution-weighted winning side / 25 %
  top-3 MVP / 20 % random-eligible / 15 % SHADDAI treasury — distributed from a
  PDA, never a hot wallet.
- **Sinks tuned so the month nets slightly negative** → no inflation, ever.

## 9. Additive wiring notes (all non-breaking)

- New persisted keys in `shaddai.econ`: `skillXP:{cut,fish,mine,hunt,water,cook,smith}`,
  `materials:{plank,ingot,obsidian_ingot,leather,rations,...}` (or reuse `inv`),
  `siegeWindow` (epoch of next siege).
- New data tables in `game.html` (pure additions): `RECIPES`, `SKILLS`, `WAR_CHEST`.
- New panels: Skills (life-skill levels), Crafting (station recipes), Siege
  (countdown + roster + registration).
- `interiorKindFor` already routes Forge/Smelter→forge, Diner/Cafe→diner, etc. —
  only *contents/interactions* are added per station, no render-engine change.

## 10. RAG grounding (this doc's knowledge source)

Expanded the brain for life-skills/MMO-region design (see
`scripts/add_freebies.py`, new blocks `freebies_lifeskill` + `freebies_region`):
woodcutting/mining/fishing/farming/smithing survival-craft loops, building
interiors, resource sinks, MMO region loops, monthly event cadence, castle-siege
lead-up. Query via MCP `rag_search`/`rag_ask` per agent before implementing.
