# Handoff for OpenCode / "Big Pickle" (written 2026-09-20)

Paste this to Big Pickle: **"Read docs/HANDOFF-OPENCODE-BIGPICKLE.md in C:\Users\Brittany\Shaddai, then do the tasks in order, ONE per turn. After each: run the check listed, commit, and stop for review. Never spend fal credit or commit secrets. Never run `git pull --rebase` or `git stash`."**

Repo `C:\Users\Brittany\Shaddai`. Two branches matter: `feat/world3d` (the 3D world; use the worktree `C:\Users\Brittany\Shaddai-3d`) and `main` (Render deploys from it — do NOT push main without asking).

## Setup
- Serve: `cd C:\Users\Brittany\Shaddai-3d` then `python -m http.server 8790 --directory public`, open http://localhost:8790/world3d.html
- Syntax check after every edit: extract the `<script type="module">` body of `public/world3d.html` to a `.mjs` file and run `node --check`.
- Read `docs/HANDOFF-3D-WORLD-2026-09-20.md` for architecture and known bugs.
- Rule: futuristic only. No ordinary houses/roads. Gold #e8c45c, obsidian #06080b, emerald #00ff9c, cyan #5fe0ff.

## SMALL TASKS (safe for a smaller model; each is independent)
1. **Mount seat heights.** In `public/world3d.html` find `addMount(...)` calls in `boot`. For Canopy Gorilla, Sky Hawk, Hover Pod, Hover Pod II add `seatY` (fraction of model height, try 0.9-1.1) until the rider is visibly on top or in the cockpit. Verify with a screenshot (`node tools/w3d-mount.cjs 8790 zerox` writes `fal-assets/spike/mount-sheet.png`; needs `NODE_PATH=C:/Users/Brittany/Shaddai/node_modules`).
2. **Rider scale** on mounts feels small: after `mount()` you may scale nothing; instead raise `seatY`. Do not scale characters.
3. **Terrain use.** Tiles exist in `public/assets/terrain/*.webp` (road, sidewalk, snow, rock, dunes, river, meadow, ocean-deep, plus grass, sand, lava, obsidian, water, harvest, frost, root-moss). Use `tex('name', repeat)` in `buildTerrain()`: put `neon-road` on the four avenues (replace the cobble roads), `sidewalk-tiles` as 3 m borders, `dunes` around the desert, `snow` and `mountain-rock` for a new north tundra area at z<-400.
4. **Rocks, trees, street props.** Models exist in `public/assets/models/`: `prop-street-lamp, prop-bench, prop-kiosk, prop-transit-stop, prop-holo-fountain, prop-statue-shaddai, prop-neon-tree, prop-crystal-cluster, prop-ore-node, prop-obsidian-rocks, prop-signpost`. Scatter them with `place(name,{x,z,h:...})` along the ring road (radius ~104) and avenues. Keep total added objects under 80.
5. **Pause menu.** Add an Esc overlay (`#pause`) with tabs Resume / Map / Inventory / Controls / Graphics (graphics calls `applyTier`). Reuse existing CSS variables. No new libraries.
6. **Inventory screen.** Show `save.inv` (array of names) and `save.sparks` in a grid, key `I`.
7. **Interior template.** `buildInterior()` builds one shop. Use models `fur-shop-counter, fur-vending, fur-shelf, fur-terminal, fur-plant-pot, fur-floor-lamp` (in public/assets/models) to furnish it.
8. **Building interiors for more buildings.** Add a second interior (forge): `fur-forge-station, fur-workbench, fur-storage-crate`. Entry via `nearest()` 'enter' kind + `enterInterior(id)`.

## BIG TASKS (need a stronger model or the owner)
- **Deformed characters.** Meshy rigs limit motion. Test: regenerate one hero via `M6_POLY=80000 OUTDIR=fal-assets/characters/<n>-hq node fal-assets/character-pipeline.mjs <n>-hq fal-assets/spike/char-<n>-council-tpose.png 0 --meshy6 --height 1.8 --guide-texture` (four `*-hq` versions were started 2026-09-20; check `fal-assets/characters/*-hq/`). Compare `headshot.mjs`, walk/run frames. fal credit is fine but do NOT generate 8 unverified ones.
- **Merge the old 3D world** `public/SHADDAI-WORLD-3D.html` (365 KB, standalone) into the City hub as a district (port its scene, not a link). Owner wants it IN the world with the new characters.
- Illustrated map screen, real construction stages (foundation/frame/shell with costs and timers), forge crafting UI, planned avenues + districts, dragon/siege boss, city↔realm highways.

## Prompts and pipeline
Model pipeline: concept image with `fal-assets/generate.mjs <batch> --go` (batches in `fal-assets/batches/`), 3D with `node fal-assets/character-pipeline.mjs <name> <img> --meshy6 --static`, compress with `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024`. Prompts: isolated single object, flat grey bg, soft light, solid opaque, 3/4 view, no text. Owner reference images go in `fal-assets/refs/world/`.

## SKATE ARCADE (written by QUILL)
Repo IzzoSol/Shaddai-Arcade, local `C:\Users\Brittany\Shaddai-Royale`, branch `feat/hall-platform-phase1`. Also see memory notes SHADDAI_SKATE_GATE_A_COMPLETE_20260918 and SHADDAI_ARCADE_SKATE_REAL_VISION_20260918.
State: Gate A complete (9dd1883); `hall/packs/skate.js` is a zero-RNG hidden-simultaneous RPS trick mechanic (flip/air/grind counters), 8/8 tests green. Owner rejected the text/CSS beta ("no visuals, a simulator, not a game"). Wants full-body characters, a real fal video per trick attempt (~18 per match), play-while-it-generates, later open-roam. Board-select screen (3 cosmetic boards) exists. Owner must rotate FAL_KEY before Gate C. Rules: small steps, `npm test` after every change, never commit secrets, ask before spending fal.
Tasks (each one turn):
1. Placeholder full-body sprite sheet (idle/flip/air/grind) in assets/characters, drawn per trick state. Check: each trick shows its frame.
2. `utils/falVideo.js` `generateTrickVideo(trickId): Promise<string>` returning a mock URL; 2 unit tests.
3. `TrickVideoPlayer` overlay: spinner while the promise resolves, then plays; must not block the game loop.
4. Wire the real fal call behind flag `ENABLE_FAL` (default off, fallback to mock on error). Ask the owner before enabling.
5. Cache generated URLs in `cache/videoMap.json` keyed `<matchId>_<trickIndex>`.
6. Board-select thumbnails + persist choice in localStorage and apply to the arena.
7. Play-while-generate queue: max 2 concurrent fal calls, videos shown in order.
8. Docs: README/handoff with how to rotate FAL_KEY, enable the flag, run the tests.

## ADDED 2026-09-20 (owner requests, highest priority for the next session)
1. **MERGE, don't rebuild: the 3D world on the landing page IS "SHADDAI City" and is more complete than `world3d.html`.** Find it (likely `public/SHADDAI-WORLD-3D.html`, 365 KB, or the scene embedded in `home.html`/`journey.html`). Make it the City hub district of `world3d.html`: port its buildings/streets/scene into `buildCity()`, keep the ring-road plan, keep the new realms (ocean, volcano, desert, castle) around it, keep all 7 new heroes. Do not remake it; move and merge.
2. **2D Forge glitch** (screenshot `Screenshot 2026-09-20 130402.png`, screen "Choose your operative", buttons "Forge a character" / "Pick from Gallery" / "Enter the World" in `public/game.html`): the big character preview box is EMPTY (dark rectangle) so no character is shown. Diagnose the preview canvas: check its size (may be 0x0 when created hidden), that `PP.draw(cctx, player.rig, ...)` runs (see the `state==='create'` draw in the game loop, `ccv` canvas), and that the sprite path `PP.draw` -> `drawSprite` doesn't fail when `rig.sprite` is unset. Verify in a browser. Also game.html already has two pre-existing script errors from the embedded tactics iframe (`export` token, `CLAN_NAMES` in `public/games/tactics-main.js`).
3. **Character arms too short** (measured 0.65-0.76 of height). Lengthen arms ~1.25x in `makeActor`: scale `LeftForeArm/LeftHand/RightForeArm/RightHand` bone `position` and remove those bones' position tracks in `fixClip`. Verify with walk + attack frames.
4. **Character texture quality is low.** Source textures from Meshy are small (a full hero GLB is only ~1.2 MB even at 2048 pack). Options: `fal-ai/hyper3d/rodin/v2` with `addons:["HighPack"]` (4K textures) but Meshy rigging rejected one Rodin mesh, so rig with `tripo3d/tripo/v2.5/rig`; or run each texture through a fal upscaler and re-embed.
5. **Map reference** (`Screenshot 2026-09-17 160017.png`): a regional 3D isometric island map with named zones and level ranges (Greenwood Lv 1-6, Sunveil Desert 30-45, Mistwood Jungle 45-60, Winterspire, Copper Highlands, Oakheart Coast, etc.), a "Find me" button, +/- zoom, click-to-set-waypoint, drag to rotate, scroll to zoom. Build the SHADDAI map screen in this style (realm zones, level bands, waypoint). Other screenshots (2026-09-17 160028, 160830) are further map/UI references, not yet reviewed.
6. **LF2 style/clothing reference folder** `C:\Users\Brittany\OneDrive\Pictures\LF2` (not yet read) is for character clothing and fighting-game style.

## Owner request 2026-09-20 (2D game fixes)
- DONE on main (f730b37): removed the empty operative preview box (#createCanvasWrap hidden in public/game.html).
- Browser popups (alert/confirm/prompt) must become in-game toasts/modals. Exact spots:
    public/game.html:1703:function renameRoom(id){ const rooms=loadRooms(); const r=rooms.find(x=>x.id===id); if(!r)return; const raw=prompt('Rename room:
    public/game.html:1766:  const raw=prompt('Name your '+pre.label+':', pre.label); if(raw===null) return;
    public/game.html:1772:function deleteRoom(id){ if(!confirm('Delete this room? (its decor is also removed)'))return;
    public/game.html:1826:  var raw=prompt('Name your office (your brand):','My Command Office'); if(raw===null)return;
    public/pixel-forge.html:474:  if(!opId){ alert('Could not reach the gallery — try again.'); return; }
    public/pixel-forge.html:487:      alert(msg);
    public/pixel-forge.html:489:  }catch(_){ alert('Could not reach the vault — try again.'); }
    public/js/market.js:55:      alert('You must reach Total Level 5 before using the market.');
    public/js/market.js:137:      alert('Your bid must exceed the current price.');
    public/js/market.js:168:      alert('Bid could not be processed.');
    public/js/market.js:226:    alert('Listing created successfully.');
    public/js/market.js:266:    alert('Sale completed!');
    public/js/skills.js:97:  alert(`🛠️ New skill tier unlocked: ${tree} Tier ${tier.id}\nTL increased by ${tier.effect.tlGain}.`);
- Forge (public/pixel-forge.html): customization/cosmetics catalog does not fit the characters; rebuild options around the 7 Council heroes + Citizen kits (see docs/superpowers/specs/2026-09-18-shaddai-world-character-system-design.md sections 3 and 11) and remove items that do not fit.
- Spawn: player should spawn at a defined point in the City hub plaza, not random/edge; check state 'world' entry in public/game.html.
- Sign-ins: verify that different accounts (email, wallet, Google) merge to ONE identity and do not overwrite each other (see public/auth.js and backend/auth routes; memory note SHADDAI_AUTH_WORLD_DASH_20260714).

## CONFIRMED 2026-09-20: which file is the landing-page 3D world
`public/home.html` links its "3D World" menu item to **`/SHADDAI-WORLD-3D.html`** (365 KB, 33 script blocks; on `main`). That is "SHADDAI City" to merge into `public/world3d.html` (branch `feat/world3d`). Steps: (1) read SHADDAI-WORLD-3D.html and list its scene pieces (city, agents, controls); (2) port them into a `buildCity()` in world3d.html keeping the ring-road plan; (3) keep ocean/volcano/desert/castle realms and the 7 new heroes; (4) when done, point the home.html "3D World" links at `/world3d.html` and remove the old link button in world3d.html. Merge `feat/world3d` into `main` only after the owner approves (Render deploys main).
Popups: `public/js/ingame-dialogs.js` now overrides alert (toast), prompt (returns default, auto-names) and confirm (two-step). Rename flows now keep the existing name — add a real in-game rename field later.

## BETA-TEST READINESS CHECKLIST (owner: 2D + 3D need to be beta-ready, mobile included)
2D (`public/game.html`, on main): DONE: mobile viewport/zoom/overscroll/selection basics, on-screen D-pad already exists, onboarding popups off, alert/prompt/confirm non-blocking. TODO: test on a real phone (portrait + landscape); check every menu fits; make sure the 2D Council sprites (public/assets/characters) load on mobile; confirm sign-in flows; run through spawn -> shop -> forge -> room without any console error.
3D (`public/world3d.html`, branch feat/world3d): TODO for beta: (a) merge SHADDAI-WORLD-3D.html city; (b) place the packaged models (public/assets/models/*: props, furniture, buildings, hover vehicles); (c) verify mobile joystick + E/F buttons work (exist, untested); (d) arms fix; (e) fps check on a mid phone (perf governor exists: Shift+G cycles quality); (f) keep loading under ~15 s on mobile data (models are 0.7-1.2 MB each; total ~50 MB, consider lazy-loading realms).
Model batch 5 (38 assets): first launch timed out (all at once). `fal-assets/world/retry.sh` re-runs failures 7 at a time; `fal-assets/world/ship-models.sh` packages finished ones into `Shaddai-3d/public/assets/models` and pushes. Re-run both if they stopped: `bash fal-assets/world/retry.sh` then `bash fal-assets/world/ship-models.sh` from C:\Users\Brittany\Shaddai (list files have CRLF: strip `\r` when reading).
