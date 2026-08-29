# SHADDAI — Front-End / Iso-World Build Handoff
*For the other terminal. Everything below lives under `public/` in `SHADDAI MASTER FINAL BUILD`.*

## What this build is
A cinematic front door + a playable isometric 2.5D world, all pure HTML5 Canvas 2D, code-drawn (no image assets except the AI region backdrops). Three standalone screens that chain together:

```
[Pixel Forge] ──Enter──▶ [Region Selector] ──Travel──▶ [Game World]
 pixel-forge.html         region-select.html            game.html
 build character          sacred mandala map            walkable iso world
```

## Entry points (files in public/)
| Screen | File | State | Notes |
|---|---|---|---|
| **Pixel Forge** | `pixel-forge.html` | ✅ done | character creator; 100 presets + full per-part customization; "Enter World" saves to `localStorage.shaddai.player` → goes to selector |
| **Region Selector** | `region-select.html` | ✅ done, **preview-locked** | sacred-geometry mandala; AI hero backdrops per realm; **all realms 🔒 for the landing page** (see flag below) |
| **Game World** | `game.html` | ✅ playable | 6 distinct regions, walkable, day/night, transit, interiors |

## The lock flag (landing page)
In `region-select.html` near the top of the script:
```js
const WORLDS_LOCKED = true;   // true = every realm shows 🔒 "Coming soon" (landing page)
                              // false = City/Meadow/Downtown open, others gated by level
```
Flip to `false` when the world is ready for the public to enter.

## game.html flow + URL params
- Boots to **Create → Region map → Enter**. Has its own in-world **Transit Hub** (walk to a Station/Airport, press **E**) to hop between all 6 regions.
- Reads `localStorage.shaddai.player` + `shaddai.region` to auto-spawn (the Forge→Selector hand-off).
- `?menu` (or `?fresh`) in the URL **clears the saved region** so the create+picker always shows. Use `game.html?menu=1` for a clean entry.
- Controls: **WASD** move · **E** doors/transit · **Shift** run · **T** day/night · **wheel** zoom.

## Regions (6, each a distinct generator)
`world-regions/{meadow,beach,city,forest,desert,volcano}.js` — each registers `window.RegionGen['<id>']` and is called by game.html's `genWorld()`. Green Meadow (farm), Sunny Harbor (coast+boats), Downtown (grid city), Wildwood (forest+**castle**), Dust Canyon (mesa+oasis, adobe), Emberfields (volcanic).

## Supporting modules (public/)
- `pixel-people.js` — modular voxel character rig (`PixelPeople.draw`, 100 presets). **Locked art.**
- `terrain.js` — per-region ground textures (`window.Terrain.tile`).
- `landmarks.js` — hero landmarks (`window.Landmarks.draw`) incl. `castle`, windmill, lighthouse, forge, treehouse, tower, airport, station, pyramid.
- `interiors.js`, `region-map.js` — used by game.html.
- `hero/` — 7 AI-generated region backdrop PNGs (used by the selector).

## Performance (important)
- The entire detailed ground is **baked once per region** to an offscreen canvas and blitted as one image/frame → rich terrain costs ~nothing per frame.
- **GPU fix:** the bake is scaled to stay **≤4000px** (under the common 4096 GPU texture limit) — an over-limit canvas renders corrupted on real hardware (was the "glitch/not loading fully" bug; fixed).
- An **FPS governor** (`LOW` flag) auto-drops ambient effects if a device dips below ~42fps.
- Buildings/props draw live but cheap; per-prop seed variation is free.

## Known / TODO
- `home-btn.js` is referenced by game.html for dashboard integration (guarded with `onerror`); provide it or ignore.
- SHADDAI City (`agentcity`) is the sacred-geometry capital — functional but the least polished region.
- **Systems not built yet:** leveling/XP/jobs/economy (so the selector's level-gates don't unlock anything yet), x402/Solana payments.

## To put on the landing page NOW
Link **Pixel Forge** (`/pixel-forge.html`) and **Region Selector** (`/region-select.html`); keep the **World** (`/game.html`) behind a 🔒 badge (selector already shows every realm locked). Nothing new to build — just surface the two links + the locked card.
