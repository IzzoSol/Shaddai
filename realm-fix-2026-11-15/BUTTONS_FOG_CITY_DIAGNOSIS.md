# Realm Diagnosis — Buttons / Fog / City / Dismount / Respawn

**Date:** 2026-11-15 · **Repo:** `~/workspace/shaddai-repo`, branch `realm-fix-for-main-2026-11-15`
**Method:** read-only code audit of `public/world-main.js` (6,688 lines), `public/SHADDAI-WORLD-3D.html`, and the `world-*.js` modules the HTML loads. No edits, no deploys.
**Labels:** `FACT` = read directly from code/data on disk. `INFERENCE` = deduced runtime behaviour from those facts (the branch a live session takes can't be observed from here). LIVE = this is the code that ships on a default load of the main realm.

---

## SYMPTOM 1 — Buttons hang the page (Navi wheel / panel switching)

### How Navi works (FACT)
- `world-navi.js` (810 lines): one shell + 15 modules (MAP, MODES, JOBS, ITEMS, SHOP, HOMES, WALLET, SPARKS, AGENTS, ACADEMY, CHAT, MARKETS, NEWS, RADIO, SETTINGS).
- **Every** interaction funnels into `render()` (`world-navi.js:719`): row click (`:724`), action button (`:725`), hex-strip click (`:729`), `setModule()` (`:738`). `render()` re-runs the module factory `M[S.module]()` from live game state, then rebuilds **both plates, the 7-hex swivel strip and the KPI strip via `innerHTML`** and rebinds handlers. Nothing is cached; nothing is diffed.
- The world sim **never pauses** behind Navi (by design — `world-navi.js:2` "The world keeps running behind it"), so all of the below lands on a main thread already saturated by the frame loop on an integrated GPU (the static-merge comment at `world-main.js:5250` cites ~1,250 draw calls pre-merge on an HD 620).

### Worst offenders, ranked (FACT unless noted)

**1. Navi open/close forces a full quality-tier round-trip — a render-target teardown on every use.**
- `world-navi.js:740` `open()`: if the current tier is > 2 (HIGH/ULTRA), it calls `window.__setQualityTier(2, 1e6)` — cap at MEDIUM. `close()` (`:748`) restores the old tier with `__setQualityTier(capped, 6)`.
- `__setQualityTier` (`world-main.js:5399`) calls `_applyQualityTier` (`world-main.js:5208`), which does `renderer.setPixelRatio` + `renderer.setSize` + `composer.setPixelRatio` + `composer.setSize` (all composer/bloom render targets reallocated), toggles `bloom.enabled`, and calls `_v4Sky.setQuality()` → `setShadowMapSize` disposes and recreates the shadow map (`world-sky-v4.js`, `setShadowMapSize`).
- On Israel's laptop the governor climbs (his videos show 102–144 FPS counters, and `_applyQualityTier` is exactly what the governor steps up through), so a normal Navi open/close = **two** full GPU target teardowns. On an HD 620-class iGPU each is a visible multi-hundred-ms hitch; stacked with #2 it is the "panel switching lags badly" he filmed. (Magnitude = INFERENCE; the calls themselves are FACT.)

**2. Full-DOM rebuild + live-state rescan on every click.**
Module factories re-scan the world on each `render()`:
- ITEMS → `realInventory()` (`world-navi.js:252`): walks `WorldOperatives.list()`, `WorldMounts.owned()`, the whole `ShdInv.all()` bag and rebuilds the item array.
- MAP → `knownPins()` / `harvestPins()` (`world-navi.js:304–318`): rebuilds pins from transit stations, `window.__entrances`, and up to 40 city-action markers; `detail()` then loops all pins to place radar dots.
- MODES → `WorldGameModes.sections()` rebuilt + `WorldBuffs.active()` + realm-zone state (`world-navi.js`, `M.modes`).
- AGENTS → `WB.ROSTER.map` + `WB.rec()` per bot + live-agent lookups; SHOP → `WorldShowcase.list()` + ad-slot state per render.
Each rebuild also forces style/layout of two `overflow:auto` plates with heavy CSS (clip-paths, gradients, `backdrop-filter` on `.hq`, animated sheen/float keyframes running continuously).

**3. The mouse-wheel handler turns scrolling into a render storm.**
`world-navi.js:239`: every `wheel` event outside a plate calls `setModule(step(±1))` → full `render()` + a `spin` class add/remove. One physical scroll gesture fires dozens of wheel events → dozens of full rebuilds back-to-back.

**4. Background re-renders land mid-click.**
`render()` is also invoked by: the live-feeds callback (`world-navi.js:428`; `world-live-feeds.js:30` re-polls every 30 s), the WorldLink dashboard hook (AGENTS/ACADEMY), the signals fetch completing (`sigLoad`), every incoming chat message (`chatRerender`), and a 1 s interval while ACADEMY is open. Any of these can fire between a user's click and its paint.

**5. Race starts can block for seconds (the single longest synchronous block found).**
MODES → PLAY on a city circuit (quarter-loop / grid-ring / meridian / grand-course) reaches `window.__raceBuild` → `loadCH()` → `WorldCityHeights.build({ plan: grid-city-v4.json, cell: 2 })` (`world-main.js:5633–5638`): a synchronous raster fill over the 318-building plan (`world-city-heights.js:20–55`, per-box cell loops). The code's own comment admits it: *"The 2 m height raster takes ~2-4 s to build"* (`world-main.js:5634`). A 2–4 s main-thread block is, by itself, enough for Chrome's "Page Unresponsive — SHADDAI WORLD · 3D" dialog.

**6. Pointer-lock interplay (FACT).**
- The game spawns in **CURSOR mode** (`world-main.js:3627`: "land in CURSOR mode — the player can immediately click the HUD/menus").
- Navi `open()` records `wasLocked` and calls `document.exitPointerLock()` (`world-navi.js:746`); `close()` re-requests pointer lock on the renderer canvas (`:757`). Chrome enforces a cooldown on re-lock after an exit (especially after Esc), so the re-lock can silently fail — the world then ignores mouse-look and feels "hung" until the player clicks back in. (Cooldown behaviour = browser fact; whether it bit in his session = INFERENCE.)
- Navi's capture-phase keydown handler (`world-navi.js:764`) swallows Y / ` / Q / E / arrows with `stopImmediatePropagation` while open — E is also the world's interact key, so key behaviour changes depending on Navi state.

---

## SYMPTOM 2 — White fog (left half washed white/lavender, right half black sky)

### The fog facts (FACT)
- `world-main.js:128`: `scene.fog = new THREE.FogExp2(0x070b1a, 0.0006)`; `scene.background = 0x04060d` (`:127`).
- Fog density is then **forced to 0 on every default path**:
  - `world-main.js:2263` sets `0.0006` → `:2266` MAP_V4 sets `0.000026` → `:2268–2269`: `window.__SHD_FOG_ON = /[?&]fog=1/.test(location.search)`; `if (!__SHD_FOG_ON) scene.fog.density = 0`.
  - `world-sky-v4.js:373` (per frame): `fog.density = window.__SHD_FOG_ON ? baseFogDensity * min(pal.fog, 1.5) : 0` — and `baseFogDensity` was captured at build time (`:284`) **after** the zeroing, so it is 0 anyway.
  - Terrain presets (`world-main.js:2086–2088`, `applyTerrain`) gate density on `__SHD_FOG_ON` too; the theme engine writes fog density only under `?themefx=1` (`world-themes.js:418`, `:484`, `:390`).
- **Conclusion (FACT): on a default load, scene fog density is 0. Distant buildings cannot be fading via `scene.fog` — there is effectively no fog.** The "white fog" is a lighting/background problem, not a fog-density problem.

### The sky facts (FACT)
- **Both sky domes are hidden by default.** The old gradient dome is hidden when MAP_V4 (`world-main.js:2271`); the sky-v4 shader dome is hidden unless `?skyfx=1` (`world-sky-v4.js:340`, comment: *"the white film/sky stuff is gone — a flat horizon-colour sky via scene.background"*). The visible sky is therefore one **flat `scene.background` colour**.
- **The theme engine always wins at boot.** `world-themes.js:531–541` (`_init`): 80 ms after load it runs `applyTheme(saved || 'tron')`, where `saved` is `?theme=` or `localStorage 'shaddai_world_theme'`. The ⚙ terrain-panel buttons were redirected into `applyTheme` (`world-main.js:3650–3652`) and `applyTheme` persists the choice (`world-themes.js:452`) — one tap on "snow" in any past session is restored forever.
- Applying a theme sets `window._themeLocked = true` (`world-main.js:3646`, via `onAfterTheme`). From then on:
  - sky-v4's per-frame `apply()` **skips** writing hemi colour, fog colour and `scene.background` (`world-sky-v4.js:369–375`, the `themed` check);
  - `updateSkyForBiome` bails (`world-main.js:2253`); the DAYNIGHT background lerp bails (`world-main.js:690`).
  - The theme's own snap writes the background: `_snapNow` sets `scene.background` to the theme fog colour (`world-themes.js:390–392`). 'tron' → `0x03080f` (near-black). 'snow' → `0xaecce4` (pale blue-white), with sky horizon `0xbcd6ec`, hemi `0xdcecff` @ 1.15, ambient `0x9cbdda` @ 0.95, sun `0xf2f9ff` @ 1.35 (`world-themes.js:96–113`).
- **The sky clock is paused by default** (`world-sky-v4.js:282`: `paused = !/[?&]skyclock=1/`; start time 0.46 → sun elevation ≈ 0.92). sky-v4 still drives light *intensities* and exposure every frame from a fixed **day** palette: sun 2.4, hemi 1.05 (day keyframe `hSky 0xc4dcf4`), exposure = `renderer.toneMappingExposure` base 0.97 × 1.0 (`world-main.js:123`, `world-sky-v4.js:377`). Bloom: strength 0.14 at MEDIUM, up to 0.28 ULTRA, threshold 0.92 (`world-main.js:2299`).
- **Governor/cull interplay (FACT): none for fog.** `camera.far` is 6000 (`world-main.js:132`); `_applyQualityTier` (`:5222–5226`) only lowers it via `FAR_M` {POTATO 4000 m, LOW 6000 m} × 3.889 = 15,556 u / 23,333 u — both above 6000, so the guard never fires and far stays 6000. Tier `cullR` (170 / 230 / 220 / 360 / 9999, `world-main.js:5191–5195`) gates prop/NPC *updates* and aura visibility (`:6465–6472`), not fog. There is no fog-far < cull mismatch — because fog is off entirely.

### Root cause (mechanism FACT, session specifics INFERENCE)
**Split-brain sky ownership.** Three systems can own the sky — sky-v4, the theme engine, the biome/DAYNIGHT lerps — and the boot sequence hands it to the theme lock while hiding both domes and zeroing the fog. What remains is a flat frozen background colour plus a fixed day-strength light rig (sun 2.4 + pale hemi) over night-built art. If the persisted theme is a pale one ('snow': bg/fog `0xaecce4`, hemi `0xdcecff` @ 1.15, ambient `0x9cbdda` @ 0.95), everything lit washes white/lavender while unlit faces and the frozen background read near-black — exactly the video's white-left / black-right split. Even under default 'tron', the background is frozen at `0x03080f` black while day lighting blows out pale untextured geometry against it ("buildings fade to white against a black sky" — they don't fade; they *are* white-lit, with zero fog depth-cueing to separate them from the sky). **The single misconfiguration: fog colour/density, sky and lighting have no shared owner on a default load — fog is hard-off, both domes are hidden, and a persisted theme locks the background while sky-v4 keeps day lighting.**

---

## SYMPTOM 3 — City / buildings missing

### What SHOULD be in the city (data on disk, FACT)
| Source | Contents |
|---|---|
| `assets/world/grid-city-v4.json` | **318 buildings**, 199 plazas, 302 parks, 1,301 lamps; grid radius 1,600 m, core radius 170 m, centred on origin |
| `assets/world/grid-fabric-v4.json` | **4,183 items** — commons 1,833 (centre 573, −847 m), ne-campus 1,132 (812, 553 m), nw-race 1,218 (−576, 822 m) |
| `assets/world/canon-v4.glb` (4.66 MB) | Blender canon city: Grid streets + blocks, SHADDAI monument, Central Station, Agora, Meadowfields; 1,686 colliders in `canon-colliders-v4.json` |
| `assets/world/realm-clusters-v4.json` | 179 items in 7 realm clusters, centres 2.0–4.4 km (metres) from origin |
| `world-layout.js` | city radius 650 u; 7 council sectors on an r ≈ 260 u hexagon; spawn `[0, 2, 70]` (`:35–36`, `:80–89`) |

### What a default load actually instantiates (FACT)
1. **The plaza cluster is all that `buildWorldBuildings` makes.** Kicked at `world-main.js:855` / `:1262–1266`, `world-buildings.js` builds only the **7 sector hero towers** (SHADDAI spire, NEXUS dome, QUILL library, ORACLE spires, TURTLE gallery, PIKADON fortress, ZEROX exchange) around the spawn plaza. That is the "gold gazebo + some towers" in the videos — and it is the *entire* procedural building count.
2. **The canon city's dense blocks are clipped away by default.** Loader step 'canon' (`world-main.js:856–867`) loads `canon-v4.glb`, but `world-canon-v4.js:56–77` (default path; `?cityspread=0` opts out) triangle-clips the three dense filler meshes — `ACADEMY_HALL`, `CULTURE_LANE`, `BLD_Grid_CardinalWedges`, i.e. the actual city blocks — to the four drawn zone loops in `city-zones-v1.json`, and drops filler colliders outside the loops. The shipped file's `buildingZones` is `[]`; the 2026-11-11 fix falls back to `buildingZones_drawn` (4 loops, bboxes within ±1,281 m). The EMB terrace towers are hidden by default (`world-canon-v4.js:36–38`), and the replacement consolidated city (120 academy blocks + 240 culture-lane buildings) is **dead code**: `if (false) consolidated = …` at `world-canon-v4.js:75` and `:77`. Net: canon contributes streets, plazas and landmarks — not a standing city.
3. **The grid fabric exists, but ~1 km away and only as far-LOD blocks from spawn.** Step 'grid-fabric' (`world-main.js:868–876`) streams `grid-fabric-v4.json` in *after* the loader ("don't wait for the fabric — it streams in behind the loading screen"). `world-clusters-v4.js:50`: bands near 250 m / far 900 m / hide 2,600 m, 250 m cells. District centres sit ~1,020–1,050 m from spawn — past the far band — so from the plaza they render only as lod2 block silhouettes (where lod2 models exist): "the city is a tiny cluster on the horizon" is literally what the LOD bands produce. Cells hide entirely beyond 2,600 m from the player.
4. **ROOT CAUSE (FACT): the designed Grid city is never built.** `grid-city-v4.json`'s 318 buildings / 199 plazas / 302 parks / 1,301 lamps have exactly **one** runtime consumer: `WorldCityHeights.build`, a *height raster* used for race-track deck clearance, loaded only when a city race circuit is requested (`world-main.js:5633–5638`, `needCity` gate). No code path instantiates the plan as meshes on a normal load. The empty grey plain around the plaza is precisely the plan's footprint (grid radius 1,600 m, core 170 m — centred on origin, under the player).
5. Roads/plots are drawn, buildings aren't: `bootCityLayout` (`world-main.js:5614–5618`) builds `world-city-layout.js` roads + claimable plots from `window.__cityLayout` (set by `world-clusters-v4.js:174` from `grid-fabric-districts-v1.json`). Interiors (`world-interiors.js`) only appear on E-entry; city-v3 (markers/plots/art slots from the 1.87 MB `art-slots-v4.json`) is interaction dressing, not geometry.
6. Realm clusters (step 'clusters', `world-main.js:936`) are realm dressing at ~7,800–17,000 u from origin — mostly beyond `camera.far` 6000 from spawn; irrelevant to the city.
7. Speck culling (minor, FACT + INFERENCE): `world-perf-guard.js` moves any non-instanced mesh under 2 px on screen (or past the far plane) to hidden layer 31, re-scanning every 1.5 s (`:12`, `:37–47`). At 3–4 km on a laptop panel, individual canon/building meshes sit near that threshold and can flicker out; the merged canon meshes' large bounding spheres mostly exempt them (magnitude = INFERENCE).

### The NEXUS HELP DESK map (FACT)
`SHADDAI-WORLD-3D.html:729–845`: the 280 px canvas map draws **only** the 7 `WORLD_LAYOUT.sectors`, the player, and the NEXUS portal ring, scaled by `half = 2600` (`world-layout.js:35`). All 7 sectors sit within r ≈ 260 u of origin → they crowd into the centre ~26 px of the canvas. Stations (r 1,150), districts, fabric and buildings are never read by the map. An almost-empty grid with one central "Spawn" dot (the SHADDAI sector at [0,0]) is exactly what this code draws — the map's data source is the problem, not the city data.

### Why the plaza cluster looks flat/washed (minor, INFERENCE)
Facade art is applied only in `__onWorldBuildingsDone` (marble texture on 6 named buildings + library art, `world-main.js:1178–1185`), the building body material is "very dark graphite + 18% tint" (`world-buildings.js` header), and Symptom 2's day-strength lighting + zero fog removes all depth cueing.

---

## SYMPTOM 4 — Dismount teleports back to where you got on

### Facts
- **No code stores a mount-start position or restores one.** A grep across all `world-*.js` finds no saved-position / return-position / pre-ride symbols. (FACT)
- **Every dismount implementation places the player beside the vehicle at its current position** (FACT):
  - `world-mount-ride.js:120–123` — `playerPos.x = M.x + cos(yaw)·3u; playerPos.z = M.z − sin(yaw)·3u; playerPos.y = gY(...)` (M = the mount's live state).
  - `world-dragon-ride.js:180–199` — beside the dragon's live `D.x/D.z`, or onto the perch pad under it.
  - `world-hoverboard.js:269–275` — `pos` set beside the board's live `s.x/s.z`.
  - `world-actions.js:658–659` — bike step-off beside the bike's live `s.x/s.z`.
- **During a ride the ride owns `playerPos`** and writes the saddle position into it every frame (mount-ride `update()`: `if (ride) { playerPos.x = SAD.x; … }`; dragon-ride `:351` same). The host calls these updates at `world-main.js:5969–5971`, *before* the movement chain. (FACT)
- **The stale variable:** the host player controller `_pctl` (`world-player-controller.js`) keeps its **own internal `pos`** (exposed via `getPos()`, `:636`). Its `step()` is gated off for the whole ride — `_pctlOn` includes `!(_rideOn())` (`world-main.js:6003–6004`) — so the controller's internal pos **stays frozen at the mount point** from the moment you get on until something resyncs it. (FACT)
- **The only resync lives in the pointer-locked branch:** `world-main.js:6035–6038` — `if (!_pctlWasOn) _pctl.setPos(playerPos.x, undefined, playerPos.z); else if (|playerPos − _cp| > 1e-3) _pctl.setPos(playerPos.x, playerPos.y, playerPos.z);`
- **The unlocked branch has no resync:** `world-main.js:6112–6114` — `if (_pctlOn && _pctlWasOn) { _pctlOut = _pctl.step(dt, {}, …); playerPos.set(_pctlOut.pos.x, _pctlOut.pos.y, _pctlOut.pos.z); }` — it steps the controller from its internal pos and **stamps the result into `playerPos`**, unconditionally.

### Root cause (INFERENCE — code path verified; which branch a given session takes depends on pointer-lock state at dismount)
Dismount while **not** pointer-locked — the common case, because the game spawns in CURSOR mode (`world-main.js:3627`) and mount-ride input is *not* lock-gated (`world-main.js:5971` gates only on UI-open, unlike the dragon's lock-gated input at `:5966`):
1. Frame 1 after dismount: `_pctlOn` = true, `_pctlWasOn` = false → the unlocked branch does nothing; at frame end `_pctlWasOn := _pctlOn` = true (`world-main.js:6119`).
2. Frame 2 onward: the unlocked branch's guard now passes, so every frame it steps `_pctl` from its **frozen mount-point pos** with empty input and overwrites `playerPos` with it.
3. The ride no longer writes `playerPos` (not riding), so nothing fights the stamp: **the player is teleported back to where they got on and held there** until a pointer-locked frame finally runs the `:6035` resync — which by then adopts the already-teleported `playerPos`, making the mount point permanent.

The same unlocked-branch stale step threatens **any** external `playerPos` write made while unlocked — e.g. Navi MAP → TRAVEL (`world-navi.js`, `act 'go'` writes `playerPos.x/z` directly, then closes Navi) and race warp/respawn event handlers (`world-main.js:5786`).

**Fix direction:** give the unlocked branch the same divergence guard as the locked branch (compare `_pctl.getPos()` to `playerPos`; `setPos` on divergence before stepping), or resync `_pctl` at every external-teleport site.

---

## SYMPTOM 5 — Death respawn in the sky

### Facts
- Death path: `world-survival.js:77` `die(kind)` → 1,800 ms fade → `respawn()` (`:71`). Triggers include `damage()` (mobs, dragons, hazards, drowning, lava) and the dragon-kill check at `world-main.js:4222`.
- **The exact respawn coordinate source** (`world-survival.js:72`):
  ```js
  var s = active(), p = pp(); if (!p) return; p.x = s.x; p.z = s.z; if (s.y != null) p.y = s.y;
  ```
  X/Z come from the active spot. **Y is copied only if the spot has one — and no spot ever does.** Spots are `{id, kind, name, x, z}` end to end: `spots()`, `addSpot()`, `saveHere()` (`:54`, stores only `x: r.x, z: r.z` from the rest point), and `bazaar()` (`:30`, returns `{…, x: p[0], z: p[1]}`). So `s.y` is always `null` and **`p.y` is never reset on respawn** — the player keeps whatever Y they had at the moment of death. (FACT)
- The default spot: `active()` (`:36`) falls back to `bazaar()`, which searches `WORLD_LAYOUT.stations` for `id === 'bazaar'` — **no such station exists** (station ids: central, rift, desert, forge, suburb, meadow, harbor, darkvault, arctic — `world-layout.js:64…`). It therefore always uses the hardcoded fallback `[-100, 100]`, which coincidentally matches the real Bazaar (`world-main.js:3350`, `BAZAAR.pos = (-100, 0, 100)`). XZ lands correctly at the Bazaar; Y does not land at all. (FACT)
- `world-survival.js` never samples terrain height anywhere — it holds only `pp()` (the player position); no `heightAt` is passed to it. (FACT)
- The stale Y propagates into the controller: the post-respawn resync (`world-main.js:6037–6038`) adopts `playerPos` *including* Y into `_pctl` (`setPos` with a Y → `groundQuery` from that Y, `world-player-controller.js:613–626`), so the controller also starts airborne. (FACT)
- The fallback death path has the same bug: `world-main.js:4222` (used if `WorldSurvival` is absent) sets `playerPos.x/z` to `stations[0].pos` (Central Station `[0, 700]`) and never touches `playerPos.y`. (FACT)

### Root cause (FACT mechanism; death-context INFERENCE)
**Respawn is a 2D teleport in a 3D world.** Deaths typically happen airborne or elevated — falling (Israel's first video: "YOU DIED" at ~0:34 right after flight/falling), on a flying mount/dragon, drowning at dive depth, knockback — and the 1.8 s death fade keeps simulating, so Y at respawn time is the death-fall's Y, not even the death-start Y. Respawn then writes the Bazaar's X/Z and leaves that Y untouched: die at y ≈ 300 u over the mountains → reappear over the Bazaar at y ≈ 300 u → fall from the sky (and, depending on fall damage, potentially die again).

**Fix direction:** in `respawn()` (and the `world-main.js:4222` fallback), always set `p.y` from terrain height at `(s.x, s.z)` — the host must supply it (e.g. `window.__w3dDebug.terrainV4.heightAt` or a host hook registered by world-main) — then resync `_pctl` to the respawn point.

---

## Fix-wave summary (for the GitHub issue)

1. **Buttons:** stop the Navi open/close quality-tier round-trip (or make it cost-free: no composer/shadow realloc for a UI overlay); cache module factories / render only the changed plate; throttle the wheel handler; guard background `render()` calls while the user is mid-interaction; build the city-heights raster lazily/async (or in a Worker) instead of synchronously on race start.
2. **Fog/sky:** pick ONE sky owner. Un-hide a real sky (sky-v4 shader dome or the gradient dome), restore a fog whose colour tracks the sky horizon, and stop the theme engine from locking `scene.background`/fog at boot (or make the lock also drive fog colour + density coherently). Reconcile the fixed day light rig with the night art direction.
3. **City:** instantiate `grid-city-v4.json` (318 buildings + plazas/parks/lamps) as real geometry — it is currently data for a race heightmap only. Revisit the canon zone-clip that removes the dense blocks, the dead `if (false)` consolidated city, and the fabric LOD bands that keep the districts as horizon blocks from spawn. Feed the Help Desk map real markers (stations, districts, buildings), not just the 7 sectors.
4. **Dismount:** add the locked branch's divergence resync to the unlocked branch at `world-main.js:6112–6114` (root cause: `_pctl`'s internal `pos` goes stale during any ride/teleport).
5. **Respawn:** make respawn a 3D teleport — sample terrain height at the spot in `world-survival.js:71` (host-supplied `heightAt`) and in the `world-main.js:4222` fallback; spots should store Y when saved.
