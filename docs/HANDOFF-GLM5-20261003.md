# Handoff for GLM-5 (NVIDIA) — side tasks until Thursday (2026-10-03)

Claude (Opus) audits and merges this work on Thursday. Work on a NEW branch off `feat/world3d`: `glm5/side-tasks`. Commit small, one task per commit. **Never push to `main`.**

## Hard rules (owner)
- **Never delete files** without the owner saying yes. Hide or flag-gate instead (`?flag=1`).
- **FPS must not drop.** Every visible addition costs ≤ 3 draw calls, shares geometry and materials, adds no new lights, and allocates nothing per frame.
- **No basic three.js look.** Theme is obsidian `#06080B`, emerald `#00FF9C`, gold `#E8C45C`. Futuristic only: no ordinary houses, roads or rooms.
- **No personal info** (names, emails, local paths) in shipped code.
- Do not touch `SHADDAI-WORLD-3D.html` core loops, `world-interiors.js`, `world-transit.js` or `world-elevators.js` (Claude is mid-work there). New code goes in **new files** and is wired in with one `<script>` tag plus one guarded init block.
- Test with the static server: `cd public && python -m http.server 3013`, then open `SHADDAI-WORLD-3D.html`. Headless checks are in `tools/_boot-smoke.cjs` and `tools/_academy-probe.cjs` (need 1 GB of free RAM).

## Tasks (in order)
1. **Arcade "screen" (no machines yet).** New `public/world-arcade-screen.js`. In the Arcade building (`BLD_ARCADE` marker, see `public/world-goto.js`), add a single wall screen. Press E to open a full-screen menu listing every finished game (Dreamers Climb, Gridiron, Neon Hoops, Dodgeball, Starfall, Skate). Each card shows **1 Spark to play** (UI only; spending goes through the existing Sparks economy calls, look at `world-actions.js`), plus a banner "Arcade machines coming soon". The menu opens each game's existing page in an overlay iframe and closes with Esc. Mobile: the cards are tappable.
2. **Item catalog data (no 3D yet).** New `public/config/items-gear.js` exporting `window.SHADDAI_GEAR = [...]`: id, name, tier, price in Sparks, slot (head/back/belt/feet/hand/deployable), effect (one line), and an icon placeholder. Items: tactical computer, e-binoculars, cellular regenerator, psi helmet, zero-G backpack, long-range communicator, translation unit, respirator, bug, alarm sensor, holoprojector, cryostasis unit, hoverboard, geiger counter, dressing spray, medical scanner, tac-com relay, mechanoid, rappelling belt, gravbelt, holowall, military scanner, magboots, EMP, jetpack, rope. Balanced, closed-loop Sparks (no cash-out, no yield).
3. **NAVI polish (CSS only).** In `public/world-navi.js` / its CSS: solid button style (bevel, inner glow, press state), consistent 8 px grid, readable 14 px minimum, no backdrop-blur below HIGH quality. Owner refs: `Desktop/New folder/Downloads/image (40).jpg, (13), (28), (36), (37)`. Before/after screenshots go in `docs/wip/navi-polish/`.
4. **Arctic trike concept as a code model** (optional if time). `public/world-trike.js` exports `buildArcticTrike(THREE)`, a white-and-orange armored 3-wheel bike with huge drum wheels (owner image in the queue). Under 3 materials, merged per material, under 6k tris. Don't wire it into the game; give it a viewer `public/trike-preview.html`.

## Deliver
- Branch `glm5/side-tasks`, plus a short `docs/wip/GLM5-REPORT.md` saying what changed, how it was tested, and any open questions.
- For tasks 1 and 3: before/after screenshots and draw-call numbers.

## Added 2026-10-04 (Opus, end of week budget) � finish these next
5. **Hoverskate feel pass** (`public/world-hoverboard.js`, tests in `tools/tests/world-hoverboard*.test.cjs` must stay green):
   - Ramp launch + apex hangtime were just added (search `RAMP LAUNCH`, `HANGTIME`). Tune on the v2 park kickers: launch threshold, `1.05` launch gain, `0.55` apex gravity. Owner wants a "drop and swoosh": a strong dive after the apex, a satisfying landing compression, a camera FOV kick on launch.
   - Drop tower (south of the v2 park): make it reachable (elevator pad or a jump-pad at the base, top deck at 14 m), so the drop-in ramp into the bowl works.
   - Half-pipes: verify the board rides up the walls (`heightAt` gives the U profile) and pops vert at the coping.
6. **Hoverpark v2 visual polish** (`public/world-hoverpark-v2.js`): it's laid out to the owner's plan (`Downloads/` hub image). Add texture/detail without extra draws: emissive edge lines on the kickers, zone sign plates (canvas text) for HALF-PIPES / RAILS / RAMPS / DROP TOWER, a brighter gold ring. Keep it at one merged mesh per material.
7. **Petal race course** (owner drawing): a 4-petal circuit around the city, sweeping out over the open wedges and back through the centre. Add it to `CIRCUITS` / `TRACKS` in `public/world-race.js`, following the existing pattern (`pol`, `arc`). Ask the owner which city layout the open wedges come from (canon city vs `grid-city-v4.json`).

8. **Car upgrade** (owner video: Desktop/New folder/Downloads/CF891529-8EE3-42A6-884D-71CA0475439E.mp4 shows the bought car + road look basic). Rebuild the purchasable car model in code (`public/world-hovercars.js` TYPES / buildGroup): sculpted body panels via ExtrudeGeometry/Lathe, glass canopy, emissive light strips, thruster pods; under 3 materials merged per material, under 8k tris. Keep the physics/handling untouched (owner: mechanics are good). Road/street surface: emissive lane lines + panel seams on the existing road meshes, no extra draws.
