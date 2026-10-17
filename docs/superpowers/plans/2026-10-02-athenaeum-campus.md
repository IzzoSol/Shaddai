# The Athenaeum Campus: 3D building, world wiring, Navi (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). TDD; verify visually with the headless viewer before claiming polish.

**Goal:** One massive futuristic campus building, built like the colosseum (its own island interior), holding the Athenaeum's halls around a central Arcade concourse, with the Academy's subject rooms, press counters, exam pods and teacher lecterns, wired to `/api/school`, to the world's door system, and to Navi.

**Spec:** `docs/superpowers/specs/2026-10-02-shaddai-academy-design.md` section 5. **Builds on:** Plans 1-3b (the whole backend is done).

## Architecture
- `public/athenaeum-layout.js` (pure, UMD): metre-space layout (rooms, stations, colliders, walkability, resolve). Testable in node.
- `public/world-athenaeum.js`: Three.js builder `window.buildAthenaeumCampus(THREE, {scene})` returning a colosseum-style room record (`group, code, origin, contains, heightAt, resolve, glowEntries, motes, animObjs, tick, stations`). Static geometry merged, repeated pieces instanced, few lights.
- `public/world-athenaeum-gate.js`: the visible gate arch in the city at the academy-hall marker (the door sector has no visual of its own, doors are proximity only).
- `public/world-academy-client.js`: `/api/school` client, panels for each station kind, state store.
- Hooks: `world-interiors.js` (ATHENAEUM sector, theme, build case, island band), `SHADDAI-WORLD-3D.html` (scripts, movement resolve and ground height like the colosseum, E on stations), `world-navi.js` Academy module (live data, enter pin), `athenaeum.html` links.
- `public/athenaeum-viewer.html` + `tools/_athenaeum-shot.cjs`: standalone viewer and headless screenshots (same pattern as the colosseum viewer).

## Layout (metres, local; +x east, +z south; angles clockwise from north)
Rotunda r=34 (the Arcade concourse). Six wings at 30, 90, 150, 210, 270, 330 degrees (Observatory NE, Library E, Museum SE, Forge SW, Sound Studio W, Council NW), each 36 wide and 52 long. North apse (Dean's Atrium, SHADDAI) and a south gate corridor (entrance). Stations ring the rotunda wall at 60, 120, 240, 300 degrees (Hall of Teachers, Trophy Gallery, Skill Directory, Trading Desk) with six exam pods on an inner ring at 15 + 60k degrees and a skill-tree dais at the centre.

## Global Constraints
Local commits only. Perf: static geometry merged; at most 90 draw calls and 8 point lights for the visible campus; no per-frame allocation in `tick`. Futuristic only (obsidian `#06080b`, emerald `#00ff9c`, gold `#e8c45c`). Every station must be reachable on foot. No fal spend (everything is code-built).

## Tasks
1. **Layout module** + `tools/tests/athenaeum-layout.test.cjs`: rooms cover every faculty room, stations inside the walkable area and outside colliders, BFS reachability from the spawn with player clearance, resolve slides and blocks, nearest-station, press rooms match the backend Press rooms.
2. **Campus builder** + `tools/tests/world-athenaeum.test.cjs` (real three): record contract, merged static geometry, draw-call and light budgets, no allocation in tick, dispose frees geometries.
3. **Interiors and world hooks**: sector, theme, build case, island band, movement resolve and ground height, E on stations; static checks plus syntax.
4. **Gate arch, client panels, Navi, Athenaeum page**: panels for directory, exam pods (run your agent), press shelves, lectern class board, trophy and teachers boards, import dock; Navi Academy tab goes live; `athenaeum.html` links to the campus wings.
5. **Polish**: viewer, headless screenshots from several angles, fix what looks wrong, perf check.

## Review Focus
1. A station that cannot be reached, or a collider that traps the spawn. 2. Anything that runs per frame allocating or looping over all static geometry. 3. Hooks that could break the existing colosseum or other interiors (the same code paths are shared). 4. The client showing an action the server would refuse (admin door for non-admins, buying without Sparks) without a clear message.
