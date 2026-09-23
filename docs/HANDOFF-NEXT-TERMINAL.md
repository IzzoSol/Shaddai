# HANDOFF — NEXT TERMINAL (2026-09-22, end of GLM session)

Read docs/MASTER-PLAN.md FIRST — §12 THE DECISION, §13 2D work order, §14 THE COMPLETE
BUILD BIBLE ($111 fal / $100 spendable, canary-first, gates, fal ledger, standards).

## STATE — everything committed & pushed, nothing mid-work
- Main repo: C:\Users\Brittany\Shaddai (main @ latest) + worktree C:\Users\Brittany\Shaddai-3d (feat/world3d, same tip). MAIN IS LIVE-DEPLOYING REPO.
- Beta repo: C:\Users\Brittany\Shaddai-Beta → github.com/IzzoSol/Shaddai-Beta (PRIVATE) → Render STATIC site (live). Root=landing (fast gradient, WebGL iframe force-off), /game.html = 2D, /games/*.html = arcade, /dashboard.html = degraded shell. Site files in repo under site/.
- Main Render site (backend): SUSPENDED/OOM'd — 512MB Node can't hold the backend (signals 13MB JSON etc). User decisions pending: resume / 1GB tier / lazy-load fix (offer: "lazy-load it").
- Dev server: python -m http.server 8790 --directory public (from Shaddai-3d). Probes: NODE_PATH=C:/Users/Brittany/Shaddai/node_modules; node tools/probe-boot.cjs 8790 (?peek=1 flow for full entry).

## DONE THIS SESSION (all pushed to main)
Full 3D map half 380→720 (terrain 1500/190-seg, mountain ring R380-520 w/ 5 carved passes); 10 biomes incl. 4 new realms (volcano fortress+dragon+lava shader, darkforest castle, suburb offices, meadow) — BUT see §12 REALITY: placed GLBs are decorative walk-through shells = PLACEHOLDERS to be replaced by real door+interior+collider systems; Crystal Sea scaled r150; light-trail roads; walk-in colosseum [-14,460] + E-tourney modal (sparks pools ledger); garage shop (B at [26,96], hovercar 500⚡, tiers); rideable ships+hoverboard+car (E); tricks→sparks (Space/Shift); hero switch (H, 7 bodies); 2D mobile deck v3 (slim/collapse/RUN); CSP wasm-unsafe-eval fix (world entry WASM error); deploy slim (removed runtime backup blobs, gitignored).

## NEXT SESSIONS — in order
1. §13+§14.3: TACTICS ENGINE (FFT-style: grid, CT turn order by AGI, STR/AGI/INT/HP,
   move+act, archetype skills, AGENTIC options for AI/grok combatants, sparks wager pools)
   + colosseum wiring + castle siege (siege pass→member residuals; moat=liquidity-pool hook)
   + skate.html wired as an arcade BUILDING door. 2. 2D polish: 2.5D (shadows/day-night),
   building interiors w/ teller-grade layouts, fishing, cosmetic overlay layer, menu kit.
3. THURSDAY (Opus 5.5 + $111 fal, MCP agents online): §14.1 ledger + §14.4 order —
   canary-first, ship/compress existing forge chars ($0), 7 agents HighPack+tripo, 5
   enterable city buildings (ONE GLB w/ doorway+interior), ships/hovercar redo, cosmetics
   retexture, fatality video demos LAST. Agent assignments: SHADDAI orchestrates,
   NEXUS=engine/economy, TURTLE=2.5D+cosmetics QA, QUILL=dialogs/cutscenes, ORACLE=gates+OSS
   research, PIKADON=one audit at END (keys, leakage, wallet/LP security), ZEROX=economy math.
4. Beta: after tactics+interiors land, re-sync Shaddai-Beta from public (robocopy excludes
   in §beta note below) and add 3D world back when §12 five-laws pass.
   Robocopy exclusions used: /XD council forge-models models agents terrain furniture bot
   journey vfx xto traders realms _parked buildings /XF SHADDAI-WORLD-3D.html world3d.html
   world-*.js — then Move files into site/, root index.html=home.html copy, dashboard.html=old index.

## RULES (unchanged)
Never spend fal without canary+gates (§4/§14); $111 fal is unreplaceable — $100 budget,
$11 hard reserve for redos; never commit secrets/FAL_KEY (rotate before ENABLE_FAL);
never `git pull --rebase`/`git stash`; don't push main without asking (standing approval
was session-scoped); LF/CRLF warnings are harmless; keep every milestone: probe → commit
→ push branch → merge main → push main (user wants to SEE progress; ship at safe points).
