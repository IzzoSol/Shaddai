# SHADDAI WORLD — FINISH PLAN (2026-10-16)
Owner order (2026-10-16): realms + buildings + roads → lag/FPS → off-road enemies → interiors with uses + NPCs → Navi wired to the
backend → SW plots halved + plots/homes for Sparks → Athenaeum lessons/rooms → players' agents (secure) + learning.
Sources: owner chat, SHADDAI planning pass (repo read), TURTLE visual notes, headless pass 2026-10-16 (scratch shots).
Rules: CLAUDE.md (server authoritative economy, one change per commit behind a flag, measure before optimizing, legal flag on money/NFT).

## Baseline facts (headless 2026-10-16, reef view, swiftshader)
- 3041 draw calls, 2.9 M triangles in one view (budget < 80 draws). 0 page errors. 40 failed loads (404 + backend refused on the static server).
- 10 realms (world-layout.js): grid, void, desert, volcano, forest, suburb, meadow, ocean, darkforest, arctic. Each has a K8 station + K10
  buildings + K19 props via world-realm-kits.js (hall, 2 shops, 2 towers per station). Home kits only forest (K21), desert (K18).
- Missing per realm: designed roads, snow/tree scatter, suburb + grid prop sets, solid colliders on 0-radius props, real building uses.

## Phases
| # | Phase | Lead | Key deliverables | Server-side | Done-check |
|---|---|---|---|---|---|
| P1 | Realm cities, roads, terrain, collisions | TURTLE + NEXUS | world-realm-kits.js prop sets (suburb, grid) + SOLID_R fixes · NEW world-realm-roads.js (station → hall → shops, collision strip) · NEW world-realm-terrain.js (snow + pines arctic, dead trees darkforest, forest/meadow trees, instanced) | spawn zones | headless shot per realm: road + 5 solid buildings, node test: every building has a collider |
| P2 | FPS | NEXUS | perf baseline JSON (world-perf-hud + tools/_fps.cjs) · ACADEMY_HALL 396k tris LOD · terrain tile merge · frustum culling back on · bloom/shadow quality ladder | — | before/after table, p95 frame < 33 ms, draws < 80 at spawn |
| P3 | Off-road enemies | NEXUS + TURTLE | world-mobs.js per-realm spawn tables keyed to "distance from road" · hazards + mobs one danger rule · NEW backend/mob-routes.js kill/loot | kill + loot + Sparks credit | node test spawn tables, headless: aggro at 40 m off-road, none on the road |
| P4 | Interiors with uses + NPCs | TURTLE + QUILL + NEXUS | NEW world-building-uses.js (every building → shop / job / home / service) · NPC roles (world-spawn.js) · dialogue copy | shop stock, job payouts | test: no building left "decor" — needs OWNER DESIGN PASS |
| P5 | Navi polish + wiring | NEXUS + TURTLE | NEW backend/navi-routes.js (/api/navi/signals, event signup, VS accept, bot enroll, mount equip) · define the 6 missing NaviHooks · HUD consolidation (fewer overlapping buttons) | all | node test per tab: HTTP 200 per action, no economy state in localStorage only |
| P6 | Plots + homes for Sparks | ZEROX + PIKADON | Sparks-debit buy in backend/lib/portal-plots-routes.js via economy-service (idempotent ledger) · homes via home-service.js · Navi PLOTS → buy → deed · SW half (done e9f51915, keep 0.25) | all | double-buy + replay test = one debit, one owner. LEGAL FLAG: no NFT/deed mint, no cash-out, no real-money → Sparks |
| P7 | Athenaeum lessons + rooms | TURTLE + QUILL + NEXUS | K15 rotunda room interiors · lessons bound to academy-routes.js · lesson copy (docs/SHADDAI_LESSON_PLANS_v1.0.md) | progress + badges | athenaeum tests + completion record via API |
| P8 | Player agents (secure) + learning | PIKADON + NEXUS | mount server/agents router with auth + vault · pikadon-kernel the only action path, read-only default grants · agents tab | all, approvals + kill switch | npm run test:agents + red-team (IDOR, injection, replay, SSRF) |

## Also open
- Race HQ car ownership is client-side (shd.raceGarage) → move into P6's economy service.
- SHADDAI orchestrator MCP is down: Groq retired `llama-3.1-8b-instant` (needs a model swap in the agent server config). TURTLE answers
  are generic; use them as a second opinion only.
- Branch: shared checkout is on agents/1 (owner to decide keep vs fast-forward feat/world3d).
