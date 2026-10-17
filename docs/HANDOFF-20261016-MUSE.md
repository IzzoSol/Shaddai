# HANDOFF 2026-10-16 — Muse Spark session (for Opus terminal)

Branch: `agents/1`. No push to main. No deletes. Twin-reef experiment reverted.

## Commits (linear, on agents/1)
- `4c231619` city: SW plots hide (keep 0.34), keep PLOT-CITY always; `?v=20261016a` in
  `public/world-city-v3.js` + script-tag bump in `public/SHADDAI-WORLD-3D.html`
- `3dacc90c` reef twin (?reef=2) — REVERTED, do not build on it
- `08e7a0ff` revert of twin (single `?reef=1` restored, gate line 528 verified)
- `877a7df9` re-applied `?v=20261016a` bump (rode in the reverted commit)
- `e9f51915` city: SW keep 0.25 (hide ~75%). Verified by static sim
  (`C:\Users\Brittany\AppData\Local\Temp\opencode\swcount.cjs`, outside repo):
  keep=0.25 → 536 kept (328/1275 SW + 208/208 CITY), 947 hidden.
  Flags: `?fullcity=1` all, `?swhalf=0` off, `?swkeep=0..1` tune.

## Verified, not changed
- K5 hover ships ARE wired: 5 GLBs in `public/assets/kits/shaddai_ship_*_v01.glb`,
  `world-hovercars.js:201-221` loadShips, host boot `:5535-5540`, `?shipglb=0` fallback.
- Tests: arena 17/17, transit-kit-glb 4/4, `node --check world-city-v3.js` clean.
- Single reef intact: gate `?reef=1`, tube Harbor link, elevator + underwater stop,
  cutscene J unchanged. Dragon Gate default unchanged.

## Blender live scene (UNSAVED — world .blend on disk untouched)
- Empties `Reef_Site_A` (-1308,-1308) / `Reef_Site_B` (-1644,-1524): v4 dock math
  (harbor compass 225 @1850m). Owner confirmed area on screen.
- `SHOW_*` preview set imported at Site A (hub + home-M + shop + dome + station
  + elevator, ~0.5MB total). Delete via outliner `SHOW_*` search if unwanted.

## Next (needs Blender CLOSED — 8GB one-heavy-job rule)
1. Baseline: `_boot-smoke.cjs`, `_drawcall-audit.cjs`, `_fps.cjs`
   at spawn / Grid centre / park / race start / Colosseum lobby / realm town.
2. First FPS target: `ACADEMY_HALL` single mesh ~396k tris in `canon-v4.glb`
   (see HANDOFF-20261016-WORLD.md §4 + HANDOFF-OPENCODE-GLM5-20260929.md:60).
3. Local open: `cd public; python -m http.server 3013` →
   `?perf=1`, `?reef=1`, `?shipglb=0` compare, `?swhalf=0` / `?fullcity=1` escape hatches.
