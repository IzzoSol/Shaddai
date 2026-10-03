# OPUS FINAL AUDIT + UPGRADE: brief (hand this to Opus when the "ready" list below is green)

You are doing a one-time deep audit and upgrade pass on the SHADDAI 3D game (repo `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d`, deploys via `main`). Read first, in order: `docs/MASTER-PROMPT.md`, `docs/GAMEPLAY-EXPANSION-20261002.md` (the live checklist), `docs/QA-PROCESS.md`, `docs/RIG-AUDIT.md`, `docs/JOURNEY-LOG.md`, `docs/RACE-REFERENCES.md`, `docs/UNIFIED-BRAIN-DESIGN.md`.

## Rules (from the owner)
Quality over speed, no janky or half-built output, never delete files without asking, one heavy job at a time (laptop 8 GB; close Blender while the browser runs), screenshot-review every visual change with `node tools/_qa.cjs run|compare|bless`, add a node test for every rule, push `feat/world3d` + `main` (plumbing helper) + beta, log lessons in `docs/JOURNEY-LOG.md`. Everything the owner said is in the checklist; do not drop items. The race is original agentic hover-laser racing (not Mario Kart). Revenue streams must stay alive in every design (see MASTER-PROMPT).

## What to audit and upgrade (priority order)
1. **Cross-system regressions.** Stairs, realm hazards (strict wedge membership), passive/Void fight mode, riders seated in cars (rider tilt sign), hover-car slope tilt, race modes + difficulty + hit immunity, districts, footprints, loading slideshow. Read the diffs, run all tests, take the QA shots, compare against the baseline, fix anything worse.
2. **Collision and geometry.** `canon-colliders-v4.json` data is clean (6189 boxes, no deep overlaps); probe in-game for invisible walls and walk-through (collider vs visual mismatch) at each realm hub, building entrances, stairs, castle, Colosseum, bridges, and fix.
3. **Performance.** Profile draw calls, triangles, texture memory, GLB load sizes (7 council GLBs ~9 MB, lazy-load), three.js from CDN (self-host with a fallback), quality ladder, FPS in the city and on the race track. Budgets: 60 fps, < 80 draw calls where possible (see memory perf budgets). Keep the boot fast.
4. **Rigging and mechanics.** Use the owner's open Blender for small per-asset work: shared humanoid combat/dodge/hit/sit/mount clips, mount sockets (bull, gorilla, mammoth, hawk), dragons for Siege Day, boat/sub hulls, car pivots, castle doors. Verify with the loader tests and QA shots.
5. **Gameplay completion.** Colosseum lobby, vending, dynamic terrain, seating, spectating, modes; Navi controls and MODES toggles; NPCs, missions and quest chains; friend bots with gifts; fishing/farm/crafting loop; taming wired to the Academy; gear UI for masks and clothing; castle valley with skeleton homes and purple lava; Siege Day scaffold.
6. **Look.** Street and building organization by district role, signs, lighting day/dusk/night, terrain blending between realms, homes and villages per realm, atmosphere (fireflies, smoke, wolves, fires; real not overdone).
7. **Unified Brain** (main Shaddai repo, sparse copy at `C:\Users\Brittany\Shaddai-brain`, branch `feat/unified-brain`): provider chain fix (Groq model 404, HF routing), citations, then merge the 3D and Classic views into one scene with agent faces that open to tools/skills.
8. **Economy and legal safety.** Plots, Sparks, staking, rent accrual, NFT deeds: the owner has open decisions (see the V101.3 handoff). Do not decide; flag risks (securities/gambling/MLM) and propose options.

## Definition of done for the audit
All tests green; QA baseline blessed after Opus reviews every changed shot; no console errors on load; a short report in `docs/OPUS-AUDIT-REPORT.md` listing what changed, what was verified (how), what is still open, and the next 10 items.

## "Ready for Opus" checklist (owner/Sonnet tick these)
- [ ] All tests green (`for f in tools/tests/*.test.cjs`).
- [ ] QA run `r2` reviewed and a first baseline blessed (daylight shots).
- [ ] Collision probe tool exists (invisible-wall / walk-through checker) or the owner has a list of problem spots.
- [ ] Colosseum lobby + vending built to first version.
- [ ] Gear UI + crafting bench + material drops wired (taming/hazards usable).
- [ ] Castle valley + purple lava first pass, Siege Day scaffold.
- [ ] Friend bots with gifts, fishing first pass.
- [ ] Blender rigging session done for the shared humanoid clips and mounts (RIG-AUDIT updated).
- [ ] Unified Brain provider fix + citations done on `feat/unified-brain`.
