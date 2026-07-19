# SHADDAI 3D WORLD — BUG / POLISH BACKLOG (owner-reported 2026-07-19)

Loop task: fix bugs, lag, slow-downs; full audit; polish shading + lighting; keep on-theme with the landing page (obsidian / emerald `#00ff9c` / gold `#e8c45c` / cyan `#5fe0ff`). Owner runs `/loop every 20 mins` — work a batch each iteration, owner tests in-world between iterations.

Files: `public/SHADDAI-WORLD-3D.html` (main), `world-elevators.js`, `world-buildings.js`, `world-collision.js`, `world-interiors.js`, `world-layout.js`, `world-terrain.js`, character system (`_pcPreload` / queueAgentBody in the main file).

## STATUS KEY  ✅ done · 🔧 in progress · ⬜ todo

### Loading / performance
- ⬜ **Loading freezes / janky** — world build blocks the main thread so the loading screen stutters. GOAL: build the world in the BACKGROUND (chunk/yield across frames) so the loader animates smoothly and entry is instant. The loading screen middle-man exists precisely to hide build time — it must not freeze.
- 🔧 **Intro de-lag** — removed animated box-shadow/filter/mix-blend; canvas DPR 1.5→1, 30→24fps, streaks 160→90, dust 50→28. Owner still reports lag → investigate the synchronous world build (above) as the real culprit.
- ⬜ **Intro colors/theme still don't match** — title is now emerald Cinzel neon, but the portal canvas is cyan/gold/purple and the world palette skews purple. Re-tint the intro portal canvas toward emerald-dominant landing palette.
- ⬜ General: bugs, lag, slow-downs full audit; polish shading + lighting everywhere.

### Agents
- ✅ **Two test agents in the middle** — filtered demo/test/seed operatives out of the world spawn (SHADDAI-WORLD-3D.html ~L264).
- ⬜ **ZEROX standing sideways at default** — body rotation.y wrong at spawn (queueAgentBody / body placement).
- ⬜ **PIKADON on the bike** — PIKADON mis-placed onto an elevator pole/bike ride.
- ⬜ **No walking animation for NEXUS / QUILL / SHADDAI** — SHADDAI tilts to the side (gliding is acceptable, but add a walk). Add/assign walk clips for these rigs.
- ⬜ **Weird spawn at QUILL's spawn** — player spawns in a bad spot/orientation near Quill.

### Geometry / collision / navigation
- ⬜ **Elevators too slow** — raise lift speed.
- ⬜ **Walking off an elevator = stuck in a glitch** — collision/ground snap issue on elevator exit (both directions).
- ⬜ **Second floors unfinished / janky** — upper floors need completion + cleanup.
- ⬜ **Top ceiling level closed off** — can't walk the mini-bridges to each agent station; an invisible line/collider blocks you (both directions of the bridge).
- ⬜ **Portal rental too cramped / janky** + a random unknown object behind it.
- ⬜ **Random circle with chair-like things** placed randomly in the map — identify + remove or fix.
- ⬜ **Floating glitch square boxes in the air** (visible in sky) — stray meshes to remove.
- ⬜ **Square boxes around the ATTACK move** — remove/fix the debug boxes on the attack VFX.

### Props / decoration
- ⬜ **Billboards glitched into pillars** — reposition so they don't intersect columns.
- ⬜ **Empty billboard** — populate or remove.

## Notes
- Backups: `SHADDAI-WORLD-3D.html.bak-introdelag-*`, `.bak-intro`.
- Owner views the live site; verify in-world each loop. Serve on :3000 (`node backend/server-production.js`).
- BUILDINGS_SOLID must stay false (owner: "buildings stay walkable 1000%").
