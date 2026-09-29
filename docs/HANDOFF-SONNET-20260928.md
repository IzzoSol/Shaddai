# HANDOFF — new terminal (Sonnet), 2026-09-28 night

**Repo:** `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d`, NOT pushed. Render deploys `main` only, so ask the owner before pushing or merging.
**Owner:** new to code, focused on vision. Wants lean token use, code-first building, and to see results in Blender and screenshots.

## Read first (in this order)
1. `docs/WORLD-COMPLETION-PLAN.md`: ordered checklist + status block at the top.
2. `docs/GAME-SYSTEMS-PLAN.md`: agent movesets, gear/orbs, items, shops, plots, passes, SPARKS loop, agent phone.
3. Module docs as needed: `TRAIN-RIDE.md`, `DRAGON-ELEMENTS.md`, `WEAPONS.md`, `ANIMATION-LIBRARY.md`, `RIDERS.md`, `INTERIORS-V3.md`, `FAL-MODEL-MAP.md`.

## Shipped today (committed on feat/world3d)
| Area | Commit(s) | Notes |
|---|---|---|
| Interiors v3 (3,349 enterable buildings, sand houses, farm tower) | ae96627d, 50db19ea | host snippet NOT pasted yet (INTERIORS-V3.md) |
| Train v2 (code-built) + walkable ride, seat classes, `addStation` hook for the Colosseum | 8c823f92, 50ad68f3, 98216ea3 | wired in host |
| Dragon elements ×7 + slow/root/respawn wiring | 7aae7643, 48e25947 | wired |
| 7 agents, Meshy v6 (T-pose, 50k, rigged 1.8 m) | b25bbbcd | files in `fal-assets/characters/<name>/`; old versions in `_attempt-hunyuan-20260928/` and `_prev-20260928b/` |
| Weapons ×7 (code) | a739cae4 | attach by bone name; NOT wired in host |
| Animation library, 75 clips, speed-matched locomotion | 8b1d4e0e | NOT wired in host yet |
| Hoverboards ×9 (fly + tricks) + rider system | e69d65c0 | check RIDERS.md for what's wired |

## In flight when this session ended
- **Load-speed helper:** the owner reported a 5-minute load and a frozen laptop, and dislikes the old intro. It has uncommitted edits in `public/SHADDAI-WORLD-3D.html` (timing marks, progressive/time-sliced loading, light loading screen, old intro behind `?intro=cinematic`), with results due in `docs/PERF-LOAD.md`.
  **First job:** run `git diff public/SHADDAI-WORLD-3D.html`. If there's no commit named "perf"/"load" in the log, finish that work: measure → fix → commit. It is the TOP PRIORITY.
- **Realm cities from refs:** cut off at the start, so nothing was built. The brief is in the plan: new `tools/blender/canon/realm_cities_v1.py` (STEP 8b), one realm per headless Blender run, refs in `fal-assets/production/atlas-refs.js` + `Downloads\shaddai-realms-visual-bible.md`. The owner wants cities integrated into the terrain "matching the reference images perfectly, the bridge look and everything".

## Test status at handoff
- All green: hoverboards 12/12, riders 8/8, weapons 15/15, train-v2 8/8, train-ride 14/14, dragon-elements 11/11.
- **world-anim 12/13:** the only failure is the strict heap micro-check `update() allocates nothing`. The animator logic measures 17 B/call against a limit of 4, which is about 1 KB/s and has no visible effect. The anim helper was stopped before it tuned this. Fix it by finding the boxed-double write in `public/world-anim.js` `update()`/`setLocomotion` (write only on change, like the note in the test says). Do NOT loosen the test.

## Next, in order
1. Finish/verify the load speed (above).
2. **Wire into the host:** new agent GLBs (compress to `public/assets/agents/`), animation library, weapons, riders/hoverboards, interiors v3 snippet. One module at a time, node tests + one owner browser check.
3. **Blender placement board:** the owner's live `C:\Users\Brittany\OneDrive\Documents\Shaddai3D.blend` (light, 85 objects + the "TODAY 2026-09-28" collection). Add a LAYOUT collection of markers for hubs, Colosseum + underground station, lairs, castles, shops, farm towers, skate park, skeleton zones and the train ring. Write an export script (markers → JSON the game reads) and an import script (game → markers). Use the Blender MCP.
4. Realm cities (above), then import them into the owner's Blender.
5. Items/inventory + **agent phone** (Map, Inventory, Jobs, Marketplace, News, Chat); WAIT for the owner's phone visual refs.
6. Shops (agent-run/human-run), SPARKS wiring, jobs, then the day/night pass, then a final review.

## Rules (owner)
- **Code first; fal only when truly needed.** About $50 of fal credit is left. Characters use `node fal-assets/character-pipeline.mjs <name> <tpose.png> --meshy6 --guide-texture`, NEVER the default path. FAL_KEY comes from `../Shaddai/.env`; never print it.
- **Ask before any delete or fal spend.** Move old files aside instead.
- **Laptop limits:** Intel HD 620 / 8 GB. ONE heavy job at a time (headless Blender OR headless browser). Never open the full canon .blend. No visible browser automation.
- **Don't build without the owner's go:** the lava castle villain (ref saved), the Sky City (reached by sky ship), the hover skate park + fal video cutscenes.
- **SPARKS:** closed loop, no cash-out. Futuristic look only. Run node tests with `< /dev/null` (stdin hang).
- Don't push or merge to `main` without an owner OK.

## Paste this into the new terminal
> Continue the SHADDAI 3D world. Read `C:\Users\Brittany\Shaddai-3d\docs\HANDOFF-SONNET-20260928.md` first, then `docs/WORLD-COMPLETION-PLAN.md`. Start with the load-speed work (check `git diff public/SHADDAI-WORLD-3D.html`), then follow "Next, in order". Work lean, one helper at a time, code-first.
