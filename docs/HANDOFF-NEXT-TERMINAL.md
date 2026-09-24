# HANDOFF — CLAUDE (2026-09-23, from the GLM/opencode sessions)

Read docs/MASTER-PLAN.md FIRST: §4 gates (fal one-shot rules), §12 THE DECISION,
§14 build bible ($111 fal ledger), §15 status log. Obsidian has the vision-session
MASTER-WORLD-SPEC-v2.md (spatial law, tactics, economy/dopamine, AI architecture).

## STATE (everything committed + pushed, nothing mid-work)
- Repo: C:\Users\Brittany\Shaddai (main, live) + worktree C:\Users\Brittany\Shaddai-3d
  (feat/world3d, same tip). Beta static site: github.com/IzzoSol/Shaddai-Beta → Render
  static (root=landing; 2D at /game.html; arcade at /games/*; 3D excluded until polished).
- Main Render backend: was suspended (512MB OOM). A new Render was made. MCP agents API
  was 503 during this session — if still down, its service needs restarting too.
- Dev server: python -m http.server 8790 --directory public (from Shaddai-3d).
  Probes: NODE_PATH=C:/Users/Brittany/Shaddai/node_modules → tools/probe-boot.cjs,
  probe-2d.cjs, probe-tactics.cjs, probe-swim.cjs (peek entry flow is flaky in headless
  SwiftShader — logic probes are reliable).

## DONE (this session, in order — all on main)
1. TACTICS ENGINE v1 (world-tactics.js): FFT grid battles at the Colosseum — CT turn
   order by AGI, STR/AGI/INT/HP, BFS move, archetypes (Pilot/SHADDAI/ORACLE ally +
   Heavy/Scout enemies), agentic bot option-scoring, sparks stake/pot, win-scaling tiers
   0-3, fixed 200ms CT clock (rAF-proof). ENTER FIGHT in the arena modal launches it.
2. FISHING minigame (game.html): cast 3-12s → STRIKE prompt → SPACE in a 1.6s window to
   reel, else it escapes; Void-Pearl 1-in-100 (val 400).
3. SHADDAI ARCADE (game.html): top-bar Arcade button → sparks entry fees (skate 20,
   basketball/dodgeball/sigil 10), overlay iframe, postMessage {shdGame, shdScore}
   score-bridge listener ready for auto payouts (games don't post yet).
4. ONE SPARKS LEDGER 2D↔3D: shd.sparks3d shared localStorage — 2D arcade + 3D
   hoverboard/tricks/tourneys/garage all read/write the SAME balance.
5. SWIM LAW: below-waterline terrain floats the player on the surface (wave-bob, swim
   speed 7) — no more seafloor walking.
6. VESSEL SEATING: per-hull seat heights (yacht 1.6 / sub 1.25 / catamaran 0.85 /
   skiff 0.55) — pilot sits IN, not ON.
7. INTERIOR LAW: 4 realm structures are E-portals into themed halls — COLOSSEUM Tourney
   Hall (betting board auto-opens; B reopens), GARAGE Hover Works (shop auto-opens),
   FORTRESS Emberfall War Room, CASTLE Darkrealm Siege Keep. Doors at each realm's REAL
   big-map position: colosseum [-14,460] south, garage [26,96], fortress [420,-380]
   volcano, castle [-420,-380] darkforest. V1 reuses strongest room builders w/ new
   accents — fal Thursday dresses each room in the same code slots (THEMES propFn).
8. COLLIDER LAW: 18 solid realm colliders from layout.realmColliders (fortress r30,
   castle r34, office towers r16-20, market, cube-hab, apartment pods, forge tower,
   ritual circle, 3 meadow villages, rocks/crystals). Stations keep their pillar/
   elevator system (BUILDINGS_SOLID untouched). Colosseum plateau stays walk-in.
   Gates pass-through. Door prompts fire at 50u — outside the walls.
9. Earlier this week (also done): FULL MAP half 720 (terrain 1500, mountain ring
   R380-520 with 5 carved passes), 10 biomes (4 new realms), light-trail roads to every
   realm, Crystal Sea r150 scaled shader ocean + 4 ships, rideable ships+hoverboard+
   hovercar (E), tricks→sparks, hero switch (H), garage tiers (B), castle moat glow,
   CSP wasm-unsafe-eval fix (world entry), 2D mobile deck v3 (slim/collapse/RUN).

## FIVE-LAWS SCORECARD
1 ✅ INTERIOR (4 halls) · 2 ✅ COLLIDERS (18) · 3 ◐ SCALE (COLLIDER_R sized; scale-check
gate ships with Thursday fal) · 4 ✅ SWIM · 5 ✅ SEATING. Realm shells are still
placeholder GLBs — Thursday's fal models replace them IN PLACE (positions in
world-layout.js realmColliders + the module manifests are the slots).

## DONE 2026-09-24 (Claude, zero fal) — see MASTER-PLAN §15
Arcade score bridge (4 games pay once per paid entry) · ONE sparks ledger for real
(sparks-ledger.js; shd.sparks3d fork folded in) · agentic NPC quest dialogs (npc-dialog.js) ·
boot TDZ fix (saved-region players had NO agents) · 2D exteriors + emissive light layer.
Probes: tools/probe-arcade.cjs, probe-dialog.cjs, probe-exteriors.cjs (puppeteer or playwright).
Round 2 (same day): tactics CLAN_NAMES/ENEMY_CLANS import fix + game.html module-script fix
(page is now error-free) · ARCADE building in SHADDAI City (west of HQ, E = arcade) · Skate
plays with NO backend (local port of hall/packs/skate.js; payout 40/15 — random play was a
+12.6⚡ faucet) · $0 compression (§14.1): skate props/boards/GABI 105MB→7MB (meshopt+webp),
council heads 53MB→15MB (webp only — rag-cockpit/brain-head have no Meshopt decoder).
⇒ Skate is now small enough to ship on the static beta (§12 dropped it for size).
Cosmetics catalog is EMPTY ON PURPOSE (owner removed them 09-21) — Thursday retexture track.
Probes added: probe-skate-offline.cjs (node only).

## NEXT (your order of work)
A. If MCP is up: agents assist — NEXUS engine review, TURTLE visual QA, QUILL prompts,
   ORACLE research, ZEROX economy math, PIKADON audit AT THE END (one call, not per-step).
B. Code (zero fal): DONE 2026-09-24 (score bridge, NPC dialogs, exteriors).
C. THURSDAY FAL ($111, $100 budget, §4 gates + canary-first + scale-check): 7 agents
   (HighPack+tripo, canary=SHADDAI first), 5 enterable city buildings, ship/hovercar
   rework, cosmetics retexture, fatality video demos last. Skate physics reference:
   C:\Users\Brittany\skate-threejs-ref (full TS game — mine the controller/animation).

## RULES
Never spend fal without §4 gates; canary before batch; a model failing twice = the
prompt is wrong. Never read/commit the API keys vault without explicit permission.
No `git pull --rebase`/`git stash`. Ask before pushing main (standing approval was
given this session). Probe→commit→push branch→merge main→push main at every milestone.
