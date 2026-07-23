# SHADDAI — WORLD DESIGN BIBLE
### "AIN SOPH" — One Connected Continent · The Tree of Life You Walk
*Isometric 2.5D MMO · pure HTML5 Canvas 2D · everything code-drawn · TW=84 TH=42*

---

## 0. THE THESIS (why it "looks right")

The seven regions are **not seven maps**. They are the **ten sephirot of the Kabbalah Tree of Life projected onto ONE continent**. The 7 inhabited sephirot are the playable regions; the 3 hidden/supernal sephirot are impassable sacred wilderness (snowcap range, the abyssal gorge, the estuary); and the **22 paths of the Tree literally become the roads, rivers, rails and mountain passes** you travel between them.

This is not decoration — the geography's *mood matches the mysticism*:
- **North = Crown/Keter = high, sacred, cool** → SHADDAI City on the dormant volcano, just below impassable snow-peaks.
- **South = Kingdom/Malkuth = low, warm, material** → Sunny Harbor on the ocean.
- **East = Pillar of Mercy = fertile, generous** → Green Meadow (Chesed), Wildwood (Netzach).
- **West = Pillar of Severity = harsh, restrictive** → Emberfields (Gevurah/fire), Dust Canyon (Hod).
- **Center = Beauty/Tiferet = the heart where all paths cross** → Downtown.

You are never "selecting a level." You are climbing the Tree.

---

## 1. WORLD ARCHITECTURE — "CHUNKED CONTINENT" (decision)

**Build ONE continuous grid (architecture A), authored with per-region modular discipline (architecture B), rendered as streamed chunks.**

| Layer | Design |
|---|---|
| **Coordinate space** | Single global grid `world[gx][gy]`, gx,gy ∈ [0,239] = **240×240 tiles**. One true coordinate per tile — a river at gx=120 is the *same* river everywhere. |
| **Authoring** | 7 region modules (each authored in its own local ~48–80 grid) + wilderness modules, **painted into** the global grid by `terrain.js paintRegion(grid, regionDef, originX, originY)`. Local city coords (below) map to world via each region's origin. |
| **Storage** | Per-region typed-array blobs + a thin wilderness sheet, stitched into `Uint16Array(240*240)` × 3 layers (ground/object/overlay) ≈ **345 KB resident**. |
| **Render** | **16×16-tile chunks** (225 chunks). Only chunks in the camera frustum draw (~6–12 on screen). Static layers bake once to an offscreen `<canvas>` per chunk (dirty-flag invalidation); dynamic layer (players/NPCs/animated lava/water) draws live on top, depth-sorted by `(gx+gy)`. Static world = ~10 `drawImage`/frame. |
| **Sim / netcode** | Interest-managed: only entities within ~3 chunks of a player tick each frame; server broadcasts only your chunk-neighborhood. One map, spatial interest culling → **scales to many players** without sharding. |

**Why not pure stitched 60×60 maps (B):** an edge-swap loading screen kills the wilderness-between-regions the whole vision needs — no continuous river, no seeing the next region on the horizon. B is "a loading screen in a trenchcoat."
**Why not naive 240×240 (A):** 57,600 tiles × fills+strokes = melts phones. Chunking + offscreen bake is the 20–40× win that makes A viable.

**Targets:** 60fps desktop, 30fps floor on mid phones (POTATO tier). DPR-cap ≤2; drop animated overlays + mid-field bake under POTATO.

---

## 2. THE CONTINENT MAP (global tile coords, 240×240)

```
        NORTH (gy≈0) = SACRED / HIGH / COSMIC
   ┌──────────────────────────────────────────────────────────────┐
 0 │        ░░░ SNOWCAP SUPERNAL RANGE (impassable) ░░░            │
20 │   ▲ volc ▲     ╔════════════════════╗      ▲ peaks ▲          │
40 │   ▲▲▲▲▲        ║  SHADDAI CITY (◎)  ║       ▲▲▲▲▲             │
   │               ║  KETER — Crown     ║                          │
   │               ║  ctr (120, 40)     ║                          │
60 │ ◣EMBERFIELDS◢  ╚═════════╤══════════╝     ✿ GREEN MEADOW ✿    │
80 │ ◣ GEVURAH  ◢   ROAD ║ RIVER NAHAR         ✿ CHESED  ✿        │
   │ ◣ (55,90)  ◢   (Middle Pillar spine)      ✿ (185,85) ✿       │
100│      \\        ╔═════════╪══════════╗          //             │
120│ ▒ DUST    ▒    ║   DOWNTOWN         ║     ▓ WILDWOOD ▓        │
140│ ▒ CANYON  ▒    ║  TIFERET — heart   ║     ▓ NETZACH  ▓        │
   │ ▒ HOD     ▒    ║  ctr (120,120)     ║     ▓ (190,150)▓        │
160│ ▒ (50,150)▒    ╚═════════╤══════════╝     ▓ +castle ▓        │
180│   \            ║ Nahar Gorge (Da'at)║        ||               │
200│ YESOD marsh→   ║  SUNNY HARBOR      ║   [Kingsroad]           │
220│               ║  MALKUTH ⚓ (120,205)║                         │
   │≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈  O C E A N  ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈       │
240└──────────────────────────────────────────────────────────────┘
        SOUTH (gy≈240) = MATERIAL / SEA / KINGDOM
```

### Region registry (authoritative)
| # | Region | Sephira / Pillar | World center | Footprint | Biome | Transit |
|---|---|---|---|---|---|---|
| 1 | **SHADDAI City** | Keter — Crown / Mid | (120, 40) | 44×40 | Neon sacred capital + dormant volcano | road·rail·**air hub** |
| 2 | **Green Meadow** | Chesed — Mercy / East | (185, 85) | 48×46 | Farm/orchard | road·rail |
| 3 | **Wildwood** | Netzach — Victory / East | (190,150) | 46×48 | Deep forest + castle | road only |
| 4 | **Downtown** | Tiferet — Beauty / Center | (120,120) | 44×44 | Dense grid city | road·rail |
| 5 | **Dust Canyon** | Hod — Splendor / West | (50,150) | 46×48 | Desert mesas | road only |
| 6 | **Emberfields** | Gevurah — Severity / West | (55, 90) | 44×42 | Volcanic + LIVE vent | road·rail |
| 7 | **Sunny Harbor** | Malkuth — Kingdom / South | (120,205) | 52×40 | Coast + docks + ocean | road·rail·**boat** |

**Physical geography:** Ocean = full south edge (hard border, you sail). Supernal Range = full north edge (hard border). The **River Nahar** springs at SHADDAI's caldera (120,52), flows due south down the Middle Pillar through Downtown, plunges into the **Nahar Gorge** (the hidden Da'at, bridged by the Great Viaduct), widens to the Yesod estuary, empties into the Harbor sea — **one continuous river crown→ocean** = the strongest "one world" signal on the map.

---

## 3. THE 7 CITIES (each authored in a local grid, placed at its world origin)

> Local coords below use each region's own grid; the region's **local center maps to its world center** from §2. All hex colors are literal fills.

### 3.1 ⭐ SHADDAI CITY — the sacred capital (flagship, local 80×80, center 40,40, heptagon R=17)
Reads as a **glowing mandala on obsidian**: dormant volcano dead-center, 7 agent HQ towers on a perfect heptagon (a 7-point color star), Seed-of-Life ring roads + 7 radial spoke avenues + Flower-of-Life lattice for outer towers, octagon wall + 4 gates + moat. Neon-tron streets that **ignite at night**.

**Concentric districts:** Caldera Core (r0–6, volcano + 7 chakra altars) → Heptagon of Adepts (r14–20, the 7 towers) → Metatron Plaza / Tech Ring (r20–30, Forge, Athenaeum, x402 Exchange, Metatron's-Cube inlay) → The Honeycomb (r30–38, Flower-of-Life residential/commercial + player agent-rooms) → Octagon Wall & Gates (r38–40 + moat).

**The 7 HQ towers** — `col=round(40+17·cosθ)`, `row=round(40+17·sinθ)`, `θ_i = −90°+i·51.43°`:
| Agent | Tile | Tower | Accent |
|---|---|---|---|
| SHADDAI (N) | (40,23) | Crown Spire, 6×6, 14fl, floating keter halo ring | `#c9a6ff`/gold |
| ORACLE | (53,29) | Scrying Obelisk, 5×5, 11fl, all-seeing eye lens | `#8b7bf0` |
| QUILL | (57,44) | Codex Library-Tower, 6×5, 9fl, quill-nib spire | `#5fe0ff` |
| TURTLE | (47,55) | Living Greenhouse, 7×6, 8fl, shell dome + gardens | `#00ff9c` |
| NEXUS | (33,55) | Engine Ziggurat, 7×7, 10fl, gold reactor gyro-ring | `#e8c45c` |
| ZEROX | (23,44) | Mint Vault, 6×6, 10fl, coin-stack + Solana orb | `#ff9a3c` |
| PIKADON | (27,29) | Sentinel Keep, 6×6, 11fl, crimson bastion + turrets | `#ff5a4d` |

**Roads:** ring roads (neon-tron, width 2) at r=7/17/24/34/37.5; 7 arterial spokes (width 3) each glowing its wedge-agent accent; collector streets = Flower-of-Life lattice edges; alleys width 1.
**Sacred landmarks:** the Volcano (13×13 base, 7 chakra altars on r=6), Metatron's Cube Plaza (40,58), walkable Tree-of-Life Monument (10 sephirot nodes (40,32)→(40,15)), Ring Tram/monorail on r=17 + hub at S gate, 4 Great Gates N(40,3)/E(77,40)/S(40,77)/W(3,40).
**Enterable:** The Forge, The Athenaeum, x402 Exchange/Bank, Grand Bazaar, Player Agent-Rooms (link to dashboard later), Sanctum Tavern.

### 3.2 🌳 GREEN MEADOW (Chesed) — farm valley, the anti-grid
Silver stream snakes NW→SE; **no straight road** (every lane arcs, blocks are irregular polygons); big tilled farm lots west, tight cottage knot SE. Icons: spinning **red-capped windmill**, three corrugated **silos**, arched stone **footbridge** at the only crossing, central **market green** with six-petal hex-cobble + a great oak.
**Buildings:** farmhouse (gable, plaster+timber-frame X), barn (gambrel red), silo (cylinder+dome), cottage (whitewash+tile), windmill, market stall (striped awning), chapel (rose-window sacred motif). Earth tones only — no glass, no towers.
**Terrain:** mottled 3-green grass + brown corduroy tilled rows; stream `#3a8fd0` with mud banks + reeds; dirt paths with wheel ruts.
**Life/jobs:** farmers, miller, shepherd+sheep; harvest, mill-run, market-delivery, fishing. Dusk → everyone to the glowing tavern.

### 3.3 ⛵ SUNNY HARBOR (Malkuth) — coastal, everything faces the sea
Sea fills the SW half on a diagonal (animated 3-band water + foam line). A pale **boardwalk spine** runs parallel to the coast with **three finger-piers** jutting into the water (comb pattern). **Red-white striped lighthouse** on a rocky point (beam sweeps at night), **yellow cargo cranes**, moored sailboats, a small Ferris-wheel ring.
**Buildings:** warehouse (corrugated flat roof), fish market (open gable + awning), cannery (sawtooth roof + stack), pastel beach cottages (sea-facing porch), crane, boardwalk shops. Palms, not oaks.
**Terrain:** deep→mid→shallow water bands, wet-sand→dry-sand→sandy-green upland, plank boardwalk/piers.
**Life/jobs:** fishermen, dockworkers, lighthouse keeper, tourists; fishing, cargo-haul (crane minigame), café shift, night beacon duty.

### 3.4 🏙️ DOWNTOWN (Tiferet) — dense modern grid, the heart
**Strict Manhattan grid**, streets every 3 tiles, wide avenues every 3rd line with medians. **Glass skyscrapers spike at center (10–14fl) and step down in rings** to low brick edges = a visible skyline pyramid. **Elevated train** on pillars runs an L across the map with lit stations. Central **circular fountain plaza with a hexagram inlay** = the one curve. Parking garages, brownstones, copper-domed city hall.
**Terrain:** grey concrete + asphalt (crosswalks, medians, yellow centerlines); green only in thin medians/planters; night = window-speckle + billboards + streetlamp pools + hover-car underglow.
**Life/jobs:** office workers, banker, commuters, traffic + hover-cars; courier, bank-run, barista, transit-conductor, window-washer.

### 3.5 🌲 WILDWOOD (Netzach) — deep forest, castle at the end (DANGER)
Near-solid dark canopy with **one wiggly tan trail** (Catmull-Rom spline, never straight >6 tiles, width 1 except clearings) from the SW rail halt to the grey **castle "Kether Keep"** pinned in the far NE. Buildings ONLY in the 7 clearings on the trail. Colossal ancient tree **"Yggdra"** (crown r7) with spiraling treehouses; a plank **rope-bridge** over a water gorge (chokepoint); ridge watchtower with brazier.
**Survival:** safe by day; at night **wolves/boars** spawn in canopy >4 tiles from a lantern, a **Dire Wolf** miniboss guards the Deep Woods before the castle. Weapons from the Trapper's Outfitter (knife/short-bow/spear) + Last Camp (longbow). Lantern bubbles = moving safe zones; the tension is between them.
**Jobs:** hunting (pelts), ranger quests, foraging.

### 3.6 🌵 DUST CANYON (Hod) — desert mesa town (DANGER: sun)
Warm tan plain with a **flat-topped MESA "Da'at Butte" dead-center** (4-terrace stepped ziggurat), **teal oasis pool + palm collar** at its south foot, a **zig-zag switchback road** up the mesa face. Town is **radial**: an octagon Ring Road (~r10 from center 30,32) + 6 spokes, adobe pueblo blocks fanning out, cactus fields stippling into open heat-shimmer sand.
**Buildings:** stacked ochre **adobe pueblo** (flat roofs, viga log-ends, ladders), forge, well, market stalls, watchtower. Mesa-top lookout + air pad.
**Survival:** the sun = heat/stamina drain on open sand (day); night brings **coyotes + giant scorpions + a Sand Wraith**. Grand Forge crafts up to Sunsteel Blade from mesa ore. Set-piece: the exposed switchback climb.
**Jobs:** forging, mining (mesa adit), caravan escort.

### 3.7 🌋 EMBERFIELDS (Gevurah) — volcanic, live vent (DANGER: deadly day & night)
**Black-and-orange bullseye of doom:** a **live vent "Gevurah Mouth" dead-center** (pulsing molten `#ff7a1a`), cracked-lava fissures radiating out, ground **cooling by radius** (lava → glowing-crack obsidian → grey ash). Inner ring of **forges + obsidian spires** hugs the vent; outer ash ring of **ember huts** = the only survivable ground; **lava bridges** arc over molten rivers = single-file chokepoints.
**Buildings:** forge (molten bay), Great Smelter "Tubal Works" (ore-cart rails), obsidian spire (cyan Kabbalistic sigil bands + air pad at "Binah Needle"), ember hut (ash-brick dome). No green anywhere.
**Survival:** the deadliest region — lava burn, fissure heat, telegraphed **vent spurts**; night **lava hounds, magma golems, cinder wraiths, a Vent Behemoth**. THE endgame smithy: crafts Magma Maul / Obsidian Blade (t4–t5) from vent-ore; ember-cloak armor for heat.
**Jobs:** forging (best gear), ore hauling, bridge-guard, fire-warding quests.

---

## 4. THE WILDERNESS BETWEEN (~55% of the map — where the world breathes)

Each gap has a character, a danger rating, and a **signature landmark** (so no border is anonymous, and each doubles as a fast-travel unlock beacon — you must reach it on foot ONCE):

| Corridor | Between | Fill | Danger | Landmark |
|---|---|---|---|---|
| Verdant Mile | City ↔ Meadow | foothills, wildflower, fences | low/med | wayshrine + windmill |
| The Ashfall | City/Downtown ↔ Emberfields | grass→ash→basalt | med→high | Cinder Watchtower |
| The Long Green | Meadow ↔ Wildwood | orchard→hedgerow→forest | low→med | the Boundary Oak |
| Nahar Valley | Downtown ↔ spine | riverbanks, reeds, highway | low (Gorge=high) | Great Viaduct |
| Dust Crossing | Ember/Downtown ↔ Canyon | hardpan, dead riverbed | high | Mesa Arch |
| The Kingsroad | Wildwood ↔ Harbor | forest→heath→dunes | med→low | Old Lighthouse |
| Marsh Verge | Canyon ↔ Harbor | wash→estuary→salt marsh | med | sunk boat wreck |

**Danger gradient:** safe heart (Downtown) → gentle east (Meadow/Harbor) → roads → harsh west (Severity) & deep-night wilderness. Day roads are patrolled/lit; night spawns predators → **this is why you carry a weapon and why fast-travel is earned, not given**. You can see the next region on the horizon (Emberfields glow, Downtown towers, the lighthouse) via cheap parallax silhouette sprites.

---

## 5. TRANSIT — the 22 paths (node/edge graph)

**Nodes:** N1 SHADDAI Gate (120,60) road·rail·air · N2 Downtown Plaza (120,120) road·rail (central junction) · N3 Harbor Docks (120,192) road·rail·boat · N4 Meadow Gate (185,95) · N5 Wildwood Gate (190,138) road · N6 Emberfields Gate (62,96) · N7 Canyon Gate (60,148) road · N8 Viaduct (120,160) · N9 Yesod Landing (95,200) road·boat · N10 SHADDAI Airport (105,55) air hub.

- **ROAD** (walkable continent): full Middle-Pillar spine + east ringway (Meadow→Wildwood→Harbor) + west ringway (Ember→Canyon→estuary→Harbor) + steep basalt City→Ember.
- **RAIL** (the Sephirot Line): ONE main line City↔Downtown↔Viaduct↔Harbor + Meadow spur + Emberfields spur. **Wildwood & Canyon have NO rail** — the wild ends you earn by road.
- **BOAT:** Harbor is the only port (ferry to Yesod estuary + open sea).
- **AIR:** SHADDAI Airport = fast-travel hub reaching every unlocked region beacon (sacred logic: only the Crown reaches all sephirot instantly). Wildwood/Canyon air only unlocks after on-foot arrival.

---

## 6. THE REGION SELECTOR = THE OVERWORLD MAP = A MANDALA (one screen)

Press **[M]** → camera pulls up into the continent rendered as the **Tree-of-Life / Metatron mandala**, and **this view IS the selector** (no separate menu). SHADDAI City = the central hub; the 6 regions = luminous nodes on a hex/heptagon ring; the 3 hidden sephirot shimmer as dim unenterable nodes so the Tree is complete.

**Node math** (default Layout A — hub + hex ring): center `C=(W/2, H/2−20)`, ring `R=min(W,H)·0.34`; for i in 0..5: `θ=−90°+i·60°`, node = `C + R·(cosθ,sinθ)`; nodeR=`R·0.17`, hubR=`R·0.22`. Order CW from top: Meadow, Harbor, Downtown, Wildwood, Emberfields, Dust Canyon.

**Composition (canvas glow + DOM crisp text):** obsidian vignette + starfield → Seed-of-Life (6% emerald) + Metatron's-Cube lattice (10% gold) underlay → travel lines (gold road / cyan-dashed rail / violet-dotted boat / white-dash air; locked routes ghost at 20%) → biome territory glows → nodes (code-drawn mini-emblems, NOT emoji; chakra rings; out-of-phase bre0athing pulse) → particles → **DOM overlay**: wordmark bar, slide-in info card (name · biome · danger dots 1–5 · "what's there" · jobs · live node art), legend, bottom **confirm bar** (not a modal).
**States:** hover (ring brightens, land lights up, card slides in <200ms), selected (rotating dashed ring + TRAVEL enables), locked (desaturate + gold padlock + unlock condition on hover + denied shake). **Confirm fly-in** = ~750ms zoom-toward-node + gold flash → cuts into the world scene.
**Suggested unlocks:** City + Meadow + Downtown open; Harbor (Lv3), Wildwood (Lv5), Canyon (Lv8), Emberfields (Lv12) locked.

---

## 7. THE PIXEL FORGE (character creator + agent picker)

A **sacred anvil chamber** (obsidian walls, central pedestal on a pulsing Seed-of-Life platform, braziers with ember particles). Arrival = two doors: **FORGE A TRAVELER** (build your own) vs **CHOOSE AN AGENT** (play as one of 7). Shared pedestal preview; header toggle switches instantly.

**Creator layout:** left **category tab rail** (Casual/Business/Athletic/Formal/Elder/Punk/Robots/Agents — ~12 presets each, so you scan 12 not 100) → center **big live rotating/idle-animated preview** on the pedestal (`PixelPeople.draw(ctx,rig,sx,sy,scale≈9,t)`, facing cycles front→3⁄4→side→back or drag-to-spin) → right **customize panel** = swatch rows (SKIN 8 tones / HAIR / CAP / SHIRT-or-OUTFIT / PANTS / SHOES) + toggles (Glasses, Beard, Hood Up, Robot→LED eyes+antenna) → **filmstrip** of tiny live-canvas thumbnails + 🎲 RANDOM → **name field + ENTER WORLD**. Every swatch click mutates `rig.*` → live re-render (single source of truth). **WYSIWYG:** the exact rig on the pedestal is the exact rig that spawns.

**7-Agent picker** (matches the selector's mandala language): true heptagon `θ_i=−90°+i·(360/7)`, each node = the agent's live pixel character in a pulsing chakra-accent double ring + name/role chip; center pedestal shows the selected agent large. Crown SHADDAI at top → clockwise ORACLE, QUILL, TURTLE, NEXUS (robot), ZEROX, PIKADON.

**Shared code:** a `sacred-geo.js` helper (Seed-of-Life, Flower-of-Life, Metatron's Cube, heptagram, hex/heptagon node math) used by BOTH the selector and the forge, so the visual language is literally the same code.

---

## 8. BUILD ORDER (collision-safe, incremental, verifiable)

**Phase 0 — Foundations (single source of truth).**
`world/registry.js` (region table §2.3 + transit graph §5 + mandala-node layout §6) + `sacred-geo.js` (shared geometry helpers). Everything downstream reads these.

**Phase 1 — The three the owner named "all three":**
1. **Finish SHADDAI City right** — the mandala must be *legible at gameplay zoom* (glowing ring roads + 7-point color star + walkable Metatron/Tree-of-Life inlays), volcano unmistakably centered, night ignition. (Fixes the current "I can't see it.")
2. **Region Selector mandala** (§6) — replace the "horrible" painterly map.
3. **Pixel Forge** (§7) — replace the thrown-together picker.

**Phase 2 — The connected continent (architecture §1).**
Chunked 240×240 grid + `terrain.js paintRegion` + offscreen chunk bake/cull; the River Nahar crown→ocean; wilderness belts §4; transit graph §5; biome-blend seam bands + gate landmarks.

**Phase 3 — The 6 other cities.**
Each via the road-first 4-stage generator (arterials → subdivide → zone → landmarks/plaza → fill) with its own topology + palette from §3.2–3.7, so no two regions look alike.

**Phase 4 — Living world.**
Survival loop (weapons, night animals, danger gradient), the Wildwood castle traversal, economy + x402/Solana hooks, interiors (`interiors.js`), player agent-rooms → dashboard bridge, jobs/mayors/animals.

---

## 9. MASTER "LOOKS RIGHT" CHECKLIST (ship gate)

1. **One river, unbroken** — Nahar traceable from SHADDAI's caldera to the Harbor sea.
2. **Biome-blend bands, never hard cuts** — every seam cross-fades over 3–4 tiles.
3. **You can SEE the next region before you arrive** — horizon silhouettes/glows.
4. **Roads on the map = roads you walk** — the mandala spline overlays real in-world roads.
5. **Coherent light/elevation** — north high/cool/sacred, south low/warm/sea; water flows downhill; ash blows east off the vent.
6. **Danger radiates believably** — safe heart → perilous west & deep-night wild; you intuit *why* an area is dangerous from its look.
7. **Every seam has a landmark** — viaduct, Boundary Oak, Mesa Arch, Cinder Watchtower, Old Lighthouse, Neon Crown Gate.
8. **The sacred layout survives zoom-out** — at continent zoom it unmistakably reads as the Tree of Life (3 pillars, crown north, kingdom on the sea, Downtown the radiant heart).
9. **SHADDAI City reads as a mandala at gameplay zoom** — not a random neon grid.
10. **Selector + Forge feel like one premium product** — same rings, same Seed/Flower-of-Life, same palette + fonts; everything placed by math.

---
*Modules: `world/registry.js` (new, source of truth) · `sacred-geo.js` (new, shared geometry) · `terrain.js` (per-region painters + seam blend + wilderness) · `landmarks.js` (spline/gates/viaduct/lighthouse/airport/docks) · `interiors.js` (castle/towers/tavern/caldera sanctum) · `pixel-people.js` (rig). Everything code-drawn, $0, scales to many players.*
