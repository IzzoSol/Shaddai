# Handoff to GLM5 — 2026-10-11 (Shaddai-3d, branch feat/world3d, all pushed to origin/main @ 32f1186c+)

Read `docs/REMOVED-FOR-ALPHA-20261011.md` first (every switch/flag for things that were removed).
Nothing from this session was verified in a real browser; the tests (87 files, `node --test tools/tests/*.test.cjs`) are green.

## Open items, in the owner's priority order
1. **/rag is not the real RAG brain.** Route: `backend/server-production.js:3337` serves `public/rag.html` (25 KB, the "ONE unified brain page" from commit 0e9a02f5, 2026-10-02).
   The owner's previous brain pages were replaced by redirect stubs in that commit. Originals:
   `git show 0e9a02f5^:public/brain.html` (149 KB) and `git show 0e9a02f5^:public/rag-cockpit.html` (50 KB). Ask the owner which one is "the real one"
   (memory refs: RAG_BRAIN_REBUILD_20260823, RAG_BRAIN_VISUAL_CONCEPT_20260823), restore it to `public/rag.html` (or point `/rag` at it), keep `/brain` + `/rag-cockpit` redirecting.
2. **Landing page layout**: wants all button squares visible in a grid, not the horizontal swivel/carousel. Page = `public/home.html` (and/or `public/index.html`);
   find the horizontal carousel container and switch it to a wrapping CSS grid (no JS scroll/rotate).
3. **Characters render black** (owner screenshot 140718, race screenshots). Applied: player body forced to emissive 0.8 from its painted map (`setPlayerCharacter` in
   `public/SHADDAI-WORLD-3D.html`), plus `agentBodyFix` on /assets/agents|forge-models|characters loads. Root cause NOT found. Suspects: meshopt/quantized normals,
   `EXT_texture_webp` bind failure, NaN palette lights (sky module guarded now). Needs a console log from a real browser.
4. **MODES > Colosseum = black screen** (door entry works differently). Need console output; `_interiors.enter('COLOSSEUM')` path, `__wiRoomReady`.
5. **Lag / speed**: no measurements yet. `?perf=1` HUD now shows sim vs render-submit CPU. Ideas parked: terrain tile merge (~190 draws), shared building materials,
   city fabric already thinned to 30% + 570 pieces cleared off race decks (`public/assets/world/track-clear-v4.json`).
6. **Terrain/floors look basic**: detail normal tightened (`world-terrain-v4.js`). Needs screenshot-led polish.
7. Colosseum: entrance wanted on the far side; forecourt off (`?forecourt=1`); 6 south-arc promenade kiosks removed.
8. Owner says the removed volcano/dragon are "not the real ones, from long ago": the real Emberfall/dragons should be rebuilt later (flag `?volcano=1` shows the old one).

## What was fixed this session (pushed)
Door-entry vs mount E conflict + 2 s vehicle guard on keep entry · mounts all owned (alpha) + auto-board + Sky Hawk GLBs finally committed (were gitignored) ·
ships/cars drivable from the I panel · train: auto-board 7 s, failsafe attaches walkable maglev, stale-menu guard · race: EXIT button + Backspace, parked board hidden ·
auto cursor for panels (no Tab) · sky: no clouds / frozen clear day / NaN-proof · realm doorless models, clusters, waystations, islands + their colliders removed ·
signals links -> /simple-signals.html · cache-busted changed script tags.

## Gotchas
- `*.glb` is gitignored; new models need `git add -f`.
- Script tags carry `?v=` query strings; bump when editing or browsers keep old copies.
- Do not run headless browser probes without asking the owner (hardware: HD 620 / 8 GB, one heavy job).
- Prod push = `git push origin HEAD:main` (auto-deploys Render g81x).
