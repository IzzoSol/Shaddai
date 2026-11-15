# OPENCODE DIRECTIVES — Shaddai Realm + Dashboard Program
**For: OpenCode running GLM-5 / Beam. Read this whole file before touching anything.**
**Issued: 2026-11-15 by Muse (program lead). This file supersedes guesswork: do exactly what it says, in order. When a step's expected result does not match, STOP that task, write what you saw into the task's receipt file, and move to the next task. Never improvise around a mismatch.**

Companion docs (same folder on branch `docs/realm-fix-2026-11-15`, folder `realm-fix-2026-11-15/`):
`FIX_GUIDE_FOR_SMALL_MODELS.md` (per-fix steps), `BACKEND_CONNECTION_MAP.md` (G-items),
`FPS_RESEARCH_2.md`, `LOADING_PIPELINE.md`, `DASHBOARD_AUDIT.md`, `BACKEND_PERF.md`,
`PROGRAM_QUEUE.md` (the live queue — update it as you work).

---

## 0. GROUND RULES (no exceptions)

1. **Never push to `main`. Never merge to `main`.** You work on branches only. Israel deploys.
2. **Never edit `public/dist/` by hand.** After changing any `public/*.js` that loads through the
   boot bundles, run `node tools/build-dist.cjs` and commit what it produces.
3. **Never touch `public/colosseum-character-system.js`.** Not edit, not stage, not restore.
4. **No downgrades.** Do not remove features, lower texture sizes, disable effects, or thin
   content to gain speed. Optimise only. Every behaviour change ships behind an off-switch
   URL flag named in its task.
5. **Back up before editing**: copy each file you will edit to
   `~/workspace/realm-polish-2026-11-14/BACKUP-opencode/` (create it) with the same filename.
6. **One task = one branch = one receipt.** Receipts go in
   `~/workspace/realm-polish-2026-11-14/` named `OC_<task>_RECEIPT.md`, containing: branch,
   commit ids, files changed, every verification command you ran and its exact output/counts.
7. **Verify after every commit**: `node --check <file>` for each JS file touched (exit 0),
   and the harness counts listed in the task. If a count differs, STOP (rule above).
8. Local test server: `PORT=8930 node backend/server-production.js`, realm at
   `http://localhost:8930/SHADDAI-WORLD-3D.html`. Kill the server when done.
9. **Blender is NOT needed for anything in this document.** The only Blender task in the whole
   program is the pond, and it is founder-gated — do not start it.

## 1. VERIFIED STATE (Muse checked GitHub directly, 2026-11-15 15:49 EST)

- `main` = `3f22f944d8b4c8e880d6d3b64a2336c72bed7a55` — contains: pass-1 fixes
  (`_MOBILE_LITE` ×8, `__showGfxPaused` ×7 in the served files — VERIFIED in the file at that
  commit) + Israel's diagnostic logging (`[city-layout]` ×14, `[transit]` ×6, `__cityLayout`
  fallback fetch of `grid-fabric-districts-v1.json`). Render auto-deploys main.
- NOT in main (branch-only, all with receipts): waves 1–4, presence, asset re-pack,
  dashboard perf, backend quick wins. Commit ids are listed in Task 1.
- The `[city-layout]` fallback in main is a DIAGNOSTIC BRIDGE, not the city system.
  The real city builder is wave 2's `world-city-builder.js` (Task 1 integrates it).
  Do NOT build a second city system. Do NOT extend the fallback.

## 2. TASK 0 — READ THE DIAGNOSTICS (do this first, 30 minutes max)

1. Check out `main` in a scratch worktree: `git worktree add ~/workspace/shaddai-main 3f22f944`
2. Run the server from that worktree on PORT=8930. Open the realm in a browser with DevTools
   Console. Enter the world. Copy ALL console lines containing `[city-layout]`, `[transit]`,
   and any red errors mentioning `world-main.js` or `world-clusters-v4.js`.
3. Write them verbatim into `OC_TASK0_RECEIPT.md` plus one line each: what the message proves
   (e.g. "`__cityLayout` never set → clusters build failed" / "layout fetched OK, build threw").
4. Do NOT fix anything in Task 0. The receipts decide whether Task 5 changes order.

## 3. TASK 1 — INTEGRATION BRANCH (the big one; do it exactly in this order)

Goal: one branch `integration-2026-11-15` = main + every completed wave, conflict-resolved,
all harnesses green. Base: `3f22f944`.

```
git checkout -b integration-2026-11-15 3f22f944d8b4c8e880d6d3b64a2336c72bed7a55
```

Cherry-pick in EXACTLY this order (each range is oldest→newest):

| Step | Command | What it brings |
|---|---|---|
| 1.1 | `git cherry-pick 108893f e941598 4815e3c 5e9aa20 30eecdb 21340bd 85c157e` | Wave 1: skinning guard, error dedupe, emissive clamp, warm-up + hero chain, dismount, respawn, mobile cuts |
| 1.2 | `git cherry-pick c78c2c1 94fb08a c2021a6` | Wave 2: Navi freeze, sky single-owner, city builder v1 |
| 1.3 | `git cherry-pick 6bf3c6f 94165f8` | Asset re-pack: ZEROX + VILLAIN WebP (binary GLBs — conflicts unlikely) |
| 1.4 | `git cherry-pick c2021a6..realm-fix-wave3-2026-11-15` | Wave 3: cache headers, dressing deferral, culling fixes, adaptive resolution, AND the half-res bloom commit `fca97b1` that lives on this branch |
| 1.5 | `git cherry-pick ca14168 a6e027f` | Wave 4 remainder: hidden-loop gating, pooled candles. **Do NOT cherry-pick `f26570a`** — it is the same bloom change as `fca97b1` (duplicate). |
| 1.6 | `git cherry-pick 33a20cd` | Presence (world-presence.js + navi-chat hook). If `world-navi-chat.js` conflicts: keep BOTH the wave changes and the 2-line `WorldPresence.update` hand-off. |
| 1.7 | `git cherry-pick 31517a3 d30dc5f defb538` | Backend quick wins: home-routes mount, identity, games-score auth. `server-production.js` also changed in 1.4 (cache headers, different region) — keep both changes. |
| 1.8 | `git cherry-pick 422c03f da8b330 dedef8c 0ebe678` | Dashboard perf: shop timeout, defer, fonts, nav WebP images |

**Conflict rules** (world-main.js and the HTML will conflict — Israel's diagnostic logging vs
wave changes, mostly different regions):
- ALWAYS keep Israel's `[city-layout]` / `[transit]` diagnostic lines AND the wave change.
  If both edited the same lines, take the wave version, then re-add the diagnostic
  `console.log` lines at the same decision points.
- Keep the `?v=20261115a` cache-bust bump until the final build-dist run replaces it.
- If a conflict is inside a function you cannot fully read and understand, STOP, record the
  file + conflict markers in the receipt, and skip to Task 2 bookkeeping. Do not guess-merge.

**After all picks:**
```
node tools/build-dist.cjs
node tools/build-dist.cjs --check        # expect: dist up to date
node --check public/world-main.js        # and every other touched .js — all exit 0
```
Run the harness suite (scripts in `~/workspace/realm-polish-2026-11-14/`). Expected counts —
anything less = STOP and record:
- `wave1-harness.js` → 31/31 · `smoke-mobile-wave1.js` → 27/27 · `wave2-sky-harness.js` → 85/85
- `wave2-city-test.js` → 22/22 · `wave3-culling-test.js` → 13/13 · wave-3 dynres harness → 23/23
- `wave4-harness.js` → 38/38 · presence harness → 19/19 + off-switch 3/3

Receipt: `OC_TASK1_RECEIPT.md` with every cherry-pick result (clean/conflict + how resolved),
the build-dist output, and every harness count. **Then STOP. Report to Israel. Do not push.**

## 4. TASK 2 — BOOKKEEPING (after Task 1, pass or fail)

Update `PROGRAM_QUEUE.md` (in `~/workspace/realm-polish-2026-11-14/`): move integrated items to
DONE with the integration branch name; note any skipped/conflicted commits by id. Append one
dated line to `~/memory/2026-11-15.md` (today's date at runtime) summarising the state.

## 5. TASK 3+ — THE QUEUE (only after Task 1 is green; one branch per item, off integration tip)

Work `PROGRAM_QUEUE.md` QUEUE section top-down. Current order:
1. **G-1 player saves** — spec: BACKEND_CONNECTION_MAP.md §5 G-1 (frontend only; backend
   `/api/world/saves` exists). G-13 prefs ride in the same payload.
2. **Backend perf safe-now batch** — spec: BACKEND_PERF.md fix list: economy read-no-write (S),
   `/api/mp` chat `since`-cursor deltas (S), bazaar + x402 in-memory store caches (S),
   `Cache-Control: private, no-cache` on polled GETs (S). One commit each.
3. **C-2 clusters rebuild amortization** — spec: FPS_RESEARCH_2.md C-2.
4. **C-4 static matrix freeze generalization** — spec: FPS_RESEARCH_2.md C-4.
5. **Loading stages 1+3** — spec: LOADING_PIPELINE.md: preload `height16.bin` + terrain
   `color.jpg`; canon GLB out of the ENTER-critical set; desktop body-queue parity with mobile.
6. **Dashboard audit safe-build batch** — spec: DASHBOARD_AUDIT.md fix list, in its order:
   Jupiter leg relabel (it says "paper" but opens the LIVE swap page — fix the label, do not
   change the link), Security view honesty (make the checks actually fetch, or label them
   "not run" — never print a result that was not measured), health-check URLs `/ping`,
   "5 AGENTS"→7 copy fix, Results Inbox re-point or retire, CSV export reads server data.
7. **C-5 city builder v2** — 250 m cells + per-tier instanced sets. Spec: FPS_RESEARCH_2.md C-5.
8. **G-5 bazaar auth** THEN **G-4 currency unification** — order is safety-critical
   (BACKEND_CONNECTION_MAP.md §5). Never enable `X402_SPARKS_BRIDGE` before both are done.
9. **G-7 city-deed backend**, **G-9 skate leaderboard**, **G-10 lounge tracks** — specs in
   BACKEND_CONNECTION_MAP.md §5.
10. **Interiors completion, vehicle/camera collision, KTX2 phase 0, orphans behind flags** —
    specs in FIX_GUIDE_FOR_SMALL_MODELS.md + PROGRAM_QUEUE.md, one flag per orphan.

## 6. THE LOOP (how we audit and improve continuously)

- Muse runs a keeper loop every 30 minutes: it reads your receipts, updates PROGRAM_QUEUE.md,
  and dispatches the next items. Your job each cycle: finish the current task, write its
  receipt, update the queue file's status for your item, stop cleanly.
- A task is DONE only with evidence in its receipt (commands + counts). "Should work" is not done.
- If you find a NEW problem while working: add it to PROGRAM_QUEUE.md under QUEUE with a
  one-line evidence note. Do not fix it inside another task.
- Founder-gated (NEVER start): deploying/pushing to main, G-14 persistence choice, the pond,
  G-11 auth flip, plot re-seat / grid-commons decision, dashboard monolith split, holo
  default-on. If the queue's next item is founder-gated, write that in the queue and stop.

## 7. IF YOU ARE UNSURE

Re-read the task's spec doc. If the spec and the code disagree, the CODE wins and you record
the disagreement in the receipt. If two docs disagree, BACKEND_CONNECTION_MAP.md wins for
backend, FPS_RESEARCH_2.md wins for performance, and the receipts win over all summaries.
