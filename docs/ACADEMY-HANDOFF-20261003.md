# SHADDAI Academy + Athenaeum Campus: handoff (2026-10-03)

Branch `feat/world3d`, all committed locally, **nothing pushed** (owner rule: no push until the game is declared finished).
Specs/plans: `docs/superpowers/specs/2026-10-02-shaddai-academy-design.md` and `docs/superpowers/plans/2026-10-02-*.md` (core, routes-and-import, curriculum-and-press, agent-runner, athenaeum-campus).

## 1. What exists and works (verified)

**Backend, complete and tested** (`backend/lib/academy/*`, `backend/academy-school-routes.js`, mounted at **`/api/school`** in `server-production.js`):
- Skills as portable versioned packages; benchmarks with deterministic graders (tool-use, paper-trade, checklist) and an LLM rubric judge (2 passes, `needs_review` on disagreement).
- Learning = baseline **without** the lesson, exam **with** it, lift against the best prior baseline, hash-chained receipts, install into the operative's `skills` and `tools`.
- Homework with structured critique (what went wrong, focus, prompt fixes, tool-use fixes), up to 3 rounds, improvement scored.
- Sparks economy through `economy-service`: tuition per baseline+exam, teacher 80% / burn 5% / house 15% (fail: 50/50), self-dealing guard, house faculty pay the scholarship pool.
- Roles (student/teacher/proctor/admin) with audit log, classes, scholarships, the 7-agent faculty table, achievements + reputation hooks.
- **11 real graded skills** across all seven faculty rooms (tools, trading [paper only], marketing/SEO, writing, image, research/astronomy, security, strategy) seeded idempotently on first server start, plus 11 house course books.
- **Room Press**: books/docs sold from rooms (authors split, entitlements, admin approval for first titles).
- **Agent runner**: `POST /api/school/agents/:agentId/learn {skillId}` makes the owner's own forged agent sit the baseline+exam with its own brain (needs an LLM key).
- **Bot import kit**: `/api/school/xagent/*` using the existing `shdx_` bearer; `GET /api/school/xagent/tools` returns OpenAI/Anthropic tool definitions; guide in `docs/ACADEMY-AGENT-GUIDE.md`.

**3D campus, built and verified headless** (no world files touched):
- `public/athenaeum-layout.js`: metre-space plan (rotunda r=34, 6 wings, north apse, south gate, 28 stations, colliders). BFS test proves every station is reachable.
- `public/world-athenaeum.js`: `window.buildAthenaeumCampus(THREE, {scene})` returns a colosseum-style room record. **58 draw calls, 7 lights, 70k triangles**, allocation-free `tick`, proper `dispose`.
- `public/world-academy-client.js`: `window.WorldAcademy.create().open(station)` panels for every station kind. All dynamic text escaped.
- `public/athenaeum-viewer.html` + `tools/_athenaeum-shot.cjs`: standalone viewer and headless screenshots (`node tools/_athenaeum-shot.cjs <outDir>`).

## 2. Tests (run these)
```
node backend/gate-node.js                              # 48 scripts; only lib/lens-rewriter.test.js fails (pre-existing, unrelated)
node tools/tests/athenaeum-layout.test.cjs             # 11
node --expose-gc tools/tests/world-athenaeum.test.cjs  # 14
node tools/tests/world-academy-client.test.cjs         # 15
node --test server/tests/agents.test.js < /dev/null    # 12 (touched externalAgents.js: one added export)
```

## 3. NOT done: putting the campus into the realm (for the other terminal)
I deliberately did not edit `world-interiors.js` or `SHADDAI-WORLD-3D.html` (other sessions change them). Exact steps, mirroring how the colosseum is wired:

**`public/world-interiors.js`**
1. Near `var COLOSSEUM_ISLAND_DX = 6000;` add `var ATHENAEUM_ISLAND_DX = 9000;` (the campus builder's default origin is `ROOM_ISLAND_X + 9000`).
2. `ISLAND_X_MAX` (line ~148): `Math.max(ROOM_ISLAND_X + COLOSSEUM_ISLAND_DX + 2500, ROOM_ISLAND_X + ATHENAEUM_ISLAND_DX + 1500)`.
3. `REALM_SECTORS` (line ~120): add `{ code: 'ATHENAEUM', name: 'The Athenaeum', pos: [ATH_X, ATH_Z], color: 0x00ff9c }`. **Default door = the CLASS_01 / academy-hall marker: game x=3958.8, z=-3117.6** (`x = pos_m[0]*U`, `z = -pos_m[1]*U`, U=7/1.8). Move it to the building's real front door during the Blender audit. Add `COLLIDER_R.ATHENAEUM = 6`.
4. `THEMES` (line ~82): `ATHENAEUM: { label: 'THE ATHENAEUM: Academy Campus', accent: 0x00ff9c, floor: 0x16222a, propFn: 'tradingFloor' }`.
5. `buildRoom` (line ~2462), next to the colosseum case:
```js
if (uc === 'ATHENAEUM' && global.buildAthenaeumCampus) {
  disposeAllExcept(uc);
  rooms[uc] = global.__athenaeumCampus = global.buildAthenaeumCampus(THREE, { scene: scene });
  return;
}
```
   The record has `group, code, origin, contains, heightAt, resolve, tick, dispose` and **no** `glowEntries/animObjs/motes` on purpose (the interiors loop skips them; the campus animates itself in `tick`). Check `disposeRoom` calls `rooms[c].dispose` if present (otherwise geometry is freed by traversal).

**`public/SHADDAI-WORLD-3D.html`**
1. Script tags before `world-interiors.js` (line ~360): `athenaeum-layout.js`, `world-athenaeum.js`; and `world-academy-client.js` near `world-navi.js` (line ~379). Use `?v=` cache busters (stale service worker bites here).
2. Movement (line ~5344, the colosseum `resolve` line): add the same for `window.__athenaeumCampus` (`group.visible && contains(...)` then `resolve(playerPos, prevX, prevZ)`). The campus floor is flat at y=0, so the ground-height line (~5399) needs no campus branch unless interiors default to something else.
3. Frame loop (where `_interiors.update(dt, t)` runs): `if (window.__athenaeumCampus && window.__athenaeumCampus.group.visible) window.__athenaeumCampus.tick(dt);`
4. Station interaction (while inside): `var st = campus.nearestStation(playerPos.x, playerPos.z);` show `[E] <st.label>` (show a lock note if `st.locked`); on E call `(window.__academy = window.__academy || WorldAcademy.create({ toast: ... })).open(st)`. `st.kind === 'navi'` opens the Navi Academy tab by itself.
5. Leaving: walking out of `contains()` already makes interiors call `exit()` back to the door.

**Not built yet (small):** the visible gate arch in the city at the door (interior doors are proximity-only; the old visual doors are disabled), Navi's Academy tab still uses its hard-coded `CLASSES` list at `world-navi.js:491` (swap it for `GET /api/school/classes` and `/skills` through `WorldAcademy`), and `athenaeum.html` hall links to `?room=campus&wing=<id>` and the greyed Arcade link.

## 4. Blender audit notes
The campus is **code-built** (no GLBs). For the audit: units are metres in a local frame scaled by U=3.889 at `athenaeum-root`; object names to look for: `static:<material>` (merged structure), `columns`, `exam-pods`, `books`, `benches`, `equalizer`, `station-rings`, `npc:<AGENT>`, `dais:tree`, `orbit-ring`, `dean:crown`, `board:*`. Faculty figures are simple hologram avatars; swap them for the rigged agent GLBs via the builder if wanted. Known polish: the apse's curved wall shows faint vertical facet banding (would be smoother as an arc extrusion).

## 5. Server config
Needs an LLM key for the judge and the agent runner (`GROQ_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, via `llm-router`). Env: `ACADEMY_ADMINS` (comma list of admin user ids; **set this or nobody can approve books or resolve reviews**), `ACADEMY_DATA_DIR`, `ACADEMY_RECEIPT_KEY` (HMAC for receipts), `ACADEMY_BOT_DAILY_CAP` (default 300 Sparks/agent/day), `PUBLIC_BASE_URL` (for the tool manifest). Data is JSON in `backend/data/academy-skills/` (single instance; move to Postgres before scaling, same caveat as the agent platform).

## 6. Queue for Thursday
1. **Ingest `C:\Users\Brittany\OneDrive\Desktop\New folder\Shaddai\teach` into the RAG brain / ORACLE and the matching agents** (owner request; not started, "finish the Academy first").
2. Put the campus in the realm (section 3) + Blender audit; build the gate arch; wire Navi Academy; update `athenaeum.html`.
3. Disk cleanup was started and **paused at the owner's request**: removed 1,695 of my own Academy test temp folders (JSON only). C: was 100% full; still open: browser-automation profiles in Temp, old Claude session scratch, the `shaddai-boot` worktree, used zips, duplicates and bad videos (owner said delete things never needed; each needs a verified list first).
4. Independent reviews were run for Plans 1 and 2 (all findings fixed). **Plans 3, 3b and 4 (Press, curriculum, runner, campus) have not had a fresh-context review.** Do one before shipping.
5. Internal-agent homework runs (the runner covers exams only), MCP-server packaging for the Academy tools, per-owner attempt caps, an explicit burn ledger row, webhooks for external bots.

## 7. Decisions made on the owner's behalf (rulings)
- `_testkit.js` renamed `testkit.js` (repo `.gitignore` ignores `_*.js`).
- `ACHIEVEMENTS_FILE` env override added so tests never touch the real achievements data.
- Judge prompt wording changed so fence markers appear exactly once (found by test).
- Exam attempts ordered by sequence number, not timestamp (same-millisecond ties).
- `withSkill` is caller-asserted for external bots (unverifiable); mitigated by best-baseline lift and held-out tasks.
- Bare 64-hex / 88-char base58 strings are treated as secrets unless labelled (hash, signature, tx).
- Tool-use exams publish a neutral tool catalog so any agent can attempt them honestly.
- No explicit burn row (the 5% simply is not re-credited).
