# SHADDAI — DISTRICTS + BUILDING USES PLAN (2026-10-16)
Owner brief: too many buildings/plots/offices with no use; bots (not agents) work the buildings, people's agents take the posts later;
consolidate without remaking; references `Downloads/image (68), (69), (72), (90), (91), (66), (67), (84)`; Grok + Copilot plans read.
Our call: keep every built asset, cut what is drawn, give each district ONE job, staff it with bots, make claims visible.

## 1. The realm (image 91 / 68 = what the game already has)
Grid in the middle, maglev ring, one station per biome. Matches world-layout.js — no moves needed:
Arctic Outpost N · Rift Gate NE (void) · Desert Terminal E · Emberfall Forge SE (volcano) · Meadowfields + Colosseum S ·
Harbor Line SW (ocean + the two reefs) · Darkvault W (darkforest) · + forest / suburb stations. Race HQ + Dragon Gate E of the Grid.
Each realm town = station + hall + 2 shops + 2 towers + inn + workshop + 4 buyable homes (trimmed 2026-10-16) + its crossing dragon.

## 2. The Grid = five districts (image 90), mapped onto the quarters we already built (City Brief v2)
| District (image 90) | Grid quarter today | Job | Key buildings (existing) |
|---|---|---|---|
| CORE: Athenaeum + Job Hall | centre (Source Temple plaza) | quests, jobs board, onboarding | Source Temple, Athenaeum K15, council towers |
| ACADEMY | NE (Campus) | lessons, agent training, skill books | Academy hall, Athenaeum classes |
| TRADE / MARKET EXCHANGE | SE (Commons) | shops, market screens, auctions | storefronts, Commons plaza, deed office |
| FORGE / WORKSHOPS | NW (Race quarter) | crafting, board + ship upgrades, model shop | Forge frames, hoverskate park, workshops |
| RESIDENTIAL | SW (Plots) | homes, agent dorms, claimable plots | PLOT-CITY lots (all kept), SW plots (12% shown) |

## 3. Six building uses (every enterable building is ONE of these; no "decor")
| Use | What you do there | Backend that already exists | Staffed by |
|---|---|---|---|
| Storefront | buy items, boards, skins | WorldShops + economy-service | shop bot |
| Home / Dorm | own it (Sparks deed), furnish, park agents | home-deed-routes, home-service | — (owner) |
| Terminal | market screens, jobs for agents | jobs/workflow routes | terminal bot |
| Workshop / Forge | craft + upgrade boards, ships | Forge, mounts store | forge bot |
| Hall / Venue | events, tickets, races, fights | Colosseum, race-run | host bot |
| Training Yard | lessons, practice, qualifiers | academy-routes, Athenaeum | trainer bot |
Rule: the district decides the use (NE = Academy halls + yards, SE = storefronts + terminals, NW = workshops, SW = homes, core = halls).
Bots (K14 Grok/Muse, world-interior-agents.js) stand at the post; later a player's own agent can take the post (that is the job).

## 4. Done 2026-10-16 (code)
- Grid fabric 15% -> 7% (~145 buildings), SW plots 25% -> 12%, realm towns 26 -> 11 buildings per station.
- Interiors staffed by bots (static, cheap) instead of rigged agents; no seated characters.
- Modes + Mounts & Travel inside the Navi; Navi ring grouped by use; TG signals off the ring.
- ROOT CAUSE fixed: agents/player never appeared (three r180 skinned Box3 threw -> loader "failure") -> board now has a rider.

## 5. Next (in order, one commit each, behind a flag)
1. world-building-uses.js: assign each kept fabric building its district use from its angle around the Grid centre (table above);
   sign + door marker + bot at the post; E opens that use's panel (existing shops / jobs / academy / deed UIs).
2. Hide the remaining fabric buildings that get no use (keep = only buildings with a use + landmarks).
3. Claimed homes glow (owner colour + banner) so the city visibly fills as people buy.
4. Ground pass: realm ground materials + tree/rock density per biome (world-fill-v4 knobs), city avenues + green space between districts.
5. Dragons at each realm crossing: verify they spawn (the Box3 fix likely unblocks the rigged dragon), then tune.
