# REALM + DASHBOARD OPTIMIZATION PROGRAM — QUEUE

Owner: Israel Hicks. Operator: Muse loop (30-min cron). Rules for EVERY item:
branch-only from the latest wave tip, backups before edits, `node --check` + build-dist
after public JS changes, evidence in a receipt in this folder, NEVER push/merge/deploy
(deploy is Israel's call only), NEVER touch public/colosseum-character-system.js,
no downgrades — optimize/improve only, every behaviour change behind an off-switch.
Founder-decision items are NEVER auto-started (marked 🔒).

## DONE
- Pass 1 WebGL gate + mobile-lite — DEPLOYED LIVE (main 207d30a)
- Wave 1 (7 fixes: skinning, dedupe, emissive, warm-up, dismount, respawn, mobile cuts) — branch realm-fix-wave1-2026-11-15
- Wave 2 (Navi freeze, sky single-owner, city builder v1) — branch realm-fix-wave2-2026-11-15
- Docs + guide published — branch docs/realm-fix-2026-11-15, Issue #3
- FPS research #2 — FPS_RESEARCH_2.md (wave-4 candidates C-0..C-9)
- Wave 3 build (cache headers, dressing deferral, culling audit, adaptive res) — branch realm-fix-wave3-2026-11-15, tip e705670, 4 commits (94cdec4, 8e076e2, 4c72acc, e705670). WAVE3_RECEIPT.md: culling harness 13/13, dynres harness 23/23, regressions 31/31 + 27/27 + 85/85 + 22/22. DONE 2026-11-15 ~15:22 EST.
- ZEROX+VILLAIN WebP re-pack — branch realm-assets-webp-2026-11-15, commits 6bf3c6f + 94165f8. ASSET_REPACK_RECEIPT.md: 17,483,632 → 7,723,708 B, −9,759,924 B (−55.8%). DONE 2026-11-15 ~14:59 EST.
- Dashboard perf build (Shop stall fix) — branch realm-dashboard-perf-2026-11-15, 4 commits. DASHBOARD_PERF_RECEIPT.md: nav tiles −531,589 B (−74%), render-blocking scripts 6→4, Shop hang ∞ → ≤~16 s honest error. DONE 2026-11-15 ~15:22 EST.
- Backend quick wins (G-3 mount, G-2 identity, G-12 games auth) — branch realm-backend-quickwins-2026-11-15, 3 commits (31517a3, d30dc5f, defb538), 4 files +34/−6. BACKEND_QUICKWINS_RECEIPT.md. DONE 2026-11-15 ~15:22 EST.
- Dashboard functional audit — DASHBOARD_AUDIT.md (43,665 B; 9 safe items §8.1, 6 founder decisions §8.2). DONE 2026-11-15 ~15:21 EST.
- Loading pipeline research — LOADING_PIPELINE.md (39,394 B; stages 1–7). DONE 2026-11-15 ~15:06 EST.
- Backend perf audit — BACKEND_PERF.md (23,822 B; 8 safe-now items §7). DONE 2026-11-15 ~15:11 EST.
- G-6 presence build (render remote players) — branch realm-presence-2026-11-15, commit 33a20cd, 4 files +218/−2. PRESENCE_RECEIPT.md: harness 19/19, off-switch 3/3, regressions 31/31 + 27/27 + 85/85. DONE 2026-11-15 ~15:16 EST.
- Wave 4 S-batch — WAVE4_RECEIPT.md: harness 38/38. Branch realm-fix-wave4-2026-11-15 (f26570a = bloom duplicate of wave-3's fca97b1 — integrator drops one). DONE 2026-11-15 ~15:27 EST.
- INTEGRATION (phase 1) — INTEGRATION_RECEIPT.md: branch `integration-2026-11-15` from main `3f22f944` in worktree ~/workspace/shaddai-integ; 27/27 picks applied (duplicate bloom f26570a dropped, keeper fca97b1 in via wave-3 range), dist rebuilt + `--check` clean, node --check 18/18, harness suite ALL green (31/31, 27/27, 85/85, 22/22, 13/13, 23/23, 38/38, presence 19/19 + 3/3, bonus dashperf 7/7, g2 8/8). Final tip `52c2082`. One incident, receipted: a transient index.lock dropped wave1 fix 2 from the sequence; detected by marker audit and re-applied cleanly as fa004ad. NOT pushed — deploy is Israel's. DONE 2026-11-15 ~16:24 EST (built by a chat-routed crew after the 15:56 keeper crew died in the daemon restart).
- IMPLEMENTATION_SPECS.md landed 2026-11-15 ~16:26 EST (48,342 B; finite-detail specs for G-5, G-4, G-7, G-9, G-10, INTERIORS, VEHICLES+CAMERA — queue items 1–5). No spec sections yet for KTX2 (item 6) or orphans (item 7).

## STATE CHANGE (2026-11-15 15:42 EST — read first)
- Israel pushed main → `3f22f944` (his diagnostic logging for city layout + transit,
  `?v=20261115a`, merged over the muse snapshot). VERIFIED by Muse at that commit:
  pass-1 fixes SURVIVED (`_MOBILE_LITE` ×8, `__showGfxPaused` ×7); diagnostics present.
  Waves/branches are NOT in main. Render auto-deploys main.
- INTEGRATION is now queue item 0 (below). Base = `3f22f944`. Exact work order for
  OpenCode: `OPENCODE_DIRECTIVES.md` in this folder (Task 0 diagnostics read, Task 1
  cherry-pick order, Tasks 3+ = this queue).
- The uncommitted colosseum-character-system.js change vanished in the multi-session
  branch shuffle — never committed, no stash, no backup (backups hold world-colosseum*.js
  only). Committed file intact at HEAD everywhere. Unrecoverable from Muse's side.

## RUNNING (2026-11-15 ~16:26 EST)
- Branch state RE-VERIFIED this run (keeper, before any dispatch): all 7 blocked branches still at e705670, 0 commits ahead — zero work done in either outage cycle, confirmed. Stale plain-copy dirs (shaddai-c2/-c4/-c5/-dashfix/-load1/-bperf) STILL lack .git — defect persists; any future re-dispatch must follow the worktree-defect rule below.
- origin/main MOVED: Israel pushed `70689cd` 16:00 EST ("fix(world): add diagnostic logging for city layout, transit, buildings, realm modules + fallback fetch"), direct child of 3f22f94. Integration branch (base 3f22f94, tip 52c2082) is now ONE commit behind main. Future integration stacking should fold 70689cd in; new crews still branch from e705670, do NOT rebase onto main.
- BLOCKED FOR FOUNDER (per efficiency rules — second failure): G-1, C-2, C-4, C-5, dashfix, load1, bperf. These are blocked by the platform outage pattern, not by task merit; they need a founder/operator call to re-dispatch once the platform is healthy, not another automatic retry. NOT re-dispatched this run.
- WORKTREE DEFECT: ~/workspace/shaddai-c2, -c4, -c5, -dashfix, -load1, -bperf contain NO .git — plain copies, not git worktrees (only shaddai-g1 is a registered worktree). Re-dispatched crews must verify `git rev-parse --git-dir` in their worktree; if it fails, delete the stale copy (it holds zero work) and create a real worktree from ~/workspace/shaddai-repo on their existing branch.
- MAIN DIVERGENCE (superseded): local `main` branch tip was 592b095 vs origin/main 3f22f94 at 15:56 EST; origin/main is now 70689cd. Integration base remains 3f22f94 — do NOT branch from local main.
- NEW CREWS dispatched 2026-11-15 ~16:26 EST (queue items 1–7; 0 program crews were running; specs in IMPLEMENTATION_SPECS.md §§ for items 1–5):
- THIRD OUTAGE WAVE 2026-11-15 ~16:29–16:33 EST (sqlx pool timeout, platform infra, NOT task failures): G-5, G-9/G-10, Interiors died within ~6 min of dispatch. The chat-owned specs agent died the same way (its file IMPLEMENTATION_SPECS.md is complete on disk — no action). Verified: all three branches exist at e705670, 0 commits — zero work done. Dead crews' worktrees were REMOVED by cleanup after death (shaddai-g5 never created; shaddai-g9 and shaddai-interiors existed briefly, then vanished — a mid-teardown `git status` caught staged deletions, which was the removal in progress, not crew edits). Shared checkout ~/workspace/shaddai-repo still holds the DOCUMENTED uncommitted presence state (M SHADDAI-WORLD-3D.html, M world-navi-chat.js, ?? world-presence.js, dist boot churn) — do not build-dist from it; crews use isolated worktrees only.
- RE-DISPATCHED ONCE (per efficiency rules) 2026-11-15 ~16:35 EST, with failure context + worktree-recreate instructions (branch already exists at e705670 — reuse, recreate worktree, verify `git status` empty before editing): G-5, G-9/G-10, Interiors. If any fails again it is BLOCKED FOR FOUNDER.
- ⛔ G-5 BLOCKED FOR FOUNDER (2nd failure): re-dispatch died at BOOTSTRAP before running anything — "database write admission timeout after 5000ms". No retry; founder/operator call.
- ⛔ G-9/G-10 BLOCKED FOR FOUNDER (2nd failure): re-dispatch died ~16:47 EST in a platform-wide DAEMON RESTART (same event killed ~8 chat agents incl. surface-repairs, forge-repair, plans-pricing, P0-security crews). No retry; founder/operator call.
- KTX2 first failure ~16:43 EST (sqlx pool timeout) — RE-DISPATCHED ONCE ~16:50 EST with failure context; worktree ~/workspace/shaddai-ktx2 already exists and looked complete, crew told to verify `git status` and preserve any uncommitted first-attempt work.
- ✅ VEHICLE CREW PRODUCED, THEN DIED (first failure): branch realm-vehicle-collision-2026-11-15 has 2 commits — ee8b7ca "vehicle collision: ground mounts resolve against realm collider set (?vehcollide=0 off-switch)" (public/world-main.js +11) and 29aeec2 "camera collision: follow cam pulls in out of realm colliders (?camcollide=0 off-switch)". Crew died ~16:56 EST (sqlx pool timeout); RE-DISPATCHED ONCE ~16:57 EST to continue from 29aeec2. If it fails again it is BLOCKED FOR FOUNDER.
- DISK QUOTA FINDING (2026-11-15 ~16:27–16:35 EST): first-attempt worktree checkouts failed partway with "Disk quota exceeded" on fal-assets writes (large .fbx/.glb/.png), even though `df` shows /home/hatch 150G with 47G free — a quota, not a full disk. G-9's orphaned checkout reached 100% of files but died at the final `Could not reset index file to revision 'HEAD'` (exit 128); that explains the mass "D" entries seen in mid-teardown status reads. Later checkouts (interiors, ktx2, orphans, vehicle) succeeded, so the quota trips TRANSIENTLY under concurrent-checkout load. MITIGATION for future runs: if `git worktree add` hits quota, retry with a sparse checkout (`--no-checkout` + `git sparse-checkout set public backend tools`) to skip multi-GB fal-assets; do NOT loop full checkouts.
- STILL RUNNING from the 16:26 batch (unaffected): G-7 (no worktree yet at last check ~16:48 EST, 23 min in — watch next run), Vehicle+camera (2 commits), Orphans (worktree exists, checkout looked partial at last check — 34 top-level entries, no scout-voxel; verify next run), Interiors re-dispatch (worktree complete-looking, running).
- G-5 bazaar auth + atomic store, THEN G-4 currency unification — branch realm-g5-bazaar-2026-11-15, worktree ~/workspace/shaddai-g5. (bperf hold lifted: bperf crew is blocked, not running — no x402-cache concurrency.)
- G-7 city-deed claim backend — branch realm-g7-deeds-2026-11-15, worktree ~/workspace/shaddai-g7.
- G-9 skate leaderboard + G-10 lounge tracks — branch realm-g9-g10-2026-11-15, worktree ~/workspace/shaddai-g9.
- Interiors completion (black-void fix; diagnosis-first) — branch realm-interiors-2026-11-15, worktree ~/workspace/shaddai-interiors.
- Vehicle + camera collision — branch realm-vehicle-collision-2026-11-15, worktree ~/workspace/shaddai-vehicle.
- KTX2 phase 0 (vendor basis transcoder + KTX2Loader behind ?ktx2=1, no asset conversion) — branch realm-ktx2-phase0-2026-11-15, worktree ~/workspace/shaddai-ktx2.
- Orphans behind flags, one at a time (weapons → agent-gear → combat-core ?combat=1 → fishing → castle-siege) — branch realm-orphans-flags-2026-11-15, worktree ~/workspace/shaddai-orphans.
- NOT dispatched this run: item 8 (C-6 gated on blocked C-5; C-9/C-8 still unstarted), item 9 (dashboard leftovers §8.1 #3/#6/#7), item 10 (loading stages 2–6 held until stage 1 lands), item 11 (backend perf #6/#7) — next run tops up as slots free.

## ARCHIVE — earlier cycle notes (kept for the failure record)
- ALL 7 crews spawned 2026-11-15 ~15:31 EST died ~15:44–15:47 EST with ZERO work done (verified: all 7 branches 0 commits ahead of e705670, all worktrees 0 uncommitted changes). 6 cancelled by the runtime before finishing; G-1 errored `[transport] sqlx error: pool timed out while waiting for an open connection` (infra error, not a task failure). Per efficiency rules, each is re-dispatched ONCE this run with the failure context; a second failure marks it blocked for the founder.
- SECOND MASS FAILURE 2026-11-15 ~16:08–16:15 EST (platform outage, NOT task failures): all 8 crews dispatched 15:56 EST died within ~18 min. G-1: compaction-model resolution timeout; C-5, dashfix, bperf: sqlx pool timeout; C-2, C-4, load1, INTEGRATION: daemon restart, no live runtime handle. No receipts landed. Branch/commit state could NOT be re-verified this cycle — the keeper's own verification calls were interrupted by the same outage (`interrupted_without_durable_result`); crews were still in early setup (git checks, reading the queue) when they died, so work done is presumed ~zero but UNVERIFIED — next run must re-check branches before re-dispatching anything. [Re-checked 16:26 EST: confirmed zero work, see RUNNING above.]
- INTEGRATION — branch integration-2026-11-15, dispatched 2026-11-15 ~15:56 EST (phase 1: waves 1–4 + presence + re-pack + dashperf + backend quick wins onto origin/main 3f22f94). DIED 16:14 EST in daemon restart; re-built successfully by a chat-routed crew, DONE ~16:24 EST — see DONE section.
- G-1 player saves wiring + G-13 prefs — branch realm-g1-saves-2026-11-15, worktree ~/workspace/shaddai-g1 — ⛔ BLOCKED (2nd failure)
- C-2 clusters rebuild amortization — branch realm-fix-c2-2026-11-15, worktree ~/workspace/shaddai-c2 — ⛔ BLOCKED (2nd failure)
- C-4 generalize static matrix freeze — branch realm-fix-c4-2026-11-15, worktree ~/workspace/shaddai-c4 — ⛔ BLOCKED (2nd failure)
- C-5 city builder v2: 250 m cells + per-tier instanced sets — branch realm-fix-c5-2026-11-15, worktree ~/workspace/shaddai-c5 — ⛔ BLOCKED (2nd failure)
- Dashboard audit "safe build now" S items (#1, #2, #4, #5, #8, #9) — branch realm-dashboard-audit-fixes-2026-11-15, worktree ~/workspace/shaddai-dashfix — ⛔ BLOCKED (2nd failure)
- Loading pipeline stage 1 + stage 7(a) dunes.png→WebP — branch realm-loading-s1-2026-11-15, worktree ~/workspace/shaddai-load1 — ⛔ BLOCKED (2nd failure)
- Backend perf "safe now" S items (#1–5 cache-only for #5, #8) — branch realm-backend-perf-2026-11-15, worktree ~/workspace/shaddai-bperf — ⛔ BLOCKED (2nd failure)

## INTEGRATION NOTE (2026-11-15 ~15:26 EST)
- Wave-4 C-1 was also committed onto the wave-3 branch as fca97b1 (branch-sharing; left as found, per WAVE3_RECEIPT.md). G-6 presence files (new public/world-presence.js + world-navi-chat.js hook + HTML script tag) sit UNCOMMITTED in the realm-fix-wave3-2026-11-15 working tree — the presence commit 33a20cd lives on realm-presence-2026-11-15. Do NOT build-dist from the shared checkout until the presence files are either committed to their branch or reverted from the tree; new crews use isolated worktrees only.
- Latest completed wave tip for branching: e705670 (realm-fix-wave3-2026-11-15).

## QUEUE (in order — dispatch as slots free)
0. **INTEGRATION** — ✅ DONE 2026-11-15 (INTEGRATION_RECEIPT.md): branch `integration-2026-11-15` built from main `3f22f944` in worktree ~/workspace/shaddai-integ; 27/27 picks applied (duplicate bloom f26570a dropped, keeper fca97b1 in via wave-3 range), dist rebuilt + `--check` clean, node --check 18/18, harness suite ALL green (31/31, 27/27, 85/85, 22/22, 13/13, 23/23, 38/38, presence 19/19 + 3/3, bonus dashperf 7/7, g2 8/8). Final tip `52c2082`. One incident, receipted: a transient index.lock dropped wave1 fix 2 from the sequence; detected by marker audit and re-applied cleanly as fa004ad. NOT pushed — deploy is Israel's. REMAINING for this item: when the loop's newer branches (g1-saves, c2, c4, c5, dashfix, load1, bperf) land with receipts, stack them onto the integration branch in completion order, rebuild dist, re-run the full harness suite after each.
1. G-5 bazaar auth + atomic store (M) — THEN G-4 currency unification (M). ORDER IS SAFETY-CRITICAL: never enable the x402↔Sparks bridge before G-2/G-5. (bperf hold lifted 16:26 EST — bperf crew blocked, not running.) ▶ RUNNING — dispatched 2026-11-15 ~16:26 EST, branch realm-g5-bazaar-2026-11-15, worktree ~/workspace/shaddai-g5, spec IMPLEMENTATION_SPECS.md §§G-5/G-4. DIED ~16:32 EST (sqlx pool timeout, 3rd outage wave); RE-DISPATCH failed at bootstrap (DB write admission timeout). ⛔ BLOCKED FOR FOUNDER (2nd failure) — no auto-retry.
2. G-7 city-deed claim backend (M; copy home-deeds pattern) ▶ RUNNING — dispatched 2026-11-15 ~16:26 EST, branch realm-g7-deeds-2026-11-15, worktree ~/workspace/shaddai-g7.
3. G-9 skate leaderboard (S) + G-10 lounge tracks (S) ▶ RUNNING — dispatched 2026-11-15 ~16:26 EST, branch realm-g9-g10-2026-11-15, worktree ~/workspace/shaddai-g9. DIED ~16:32 EST (sqlx pool timeout, 3rd outage wave); RE-DISPATCH died ~16:47 EST (platform daemon restart). ⛔ BLOCKED FOR FOUNDER (2nd failure) — no auto-retry; branch intact at e705670, 0 commits.
4. Interiors completion (black-void fix; diagnosis in guide P1s) ▶ RUNNING — dispatched 2026-11-15 ~16:26 EST, branch realm-interiors-2026-11-15, worktree ~/workspace/shaddai-interiors. DIED ~16:32 EST (sqlx pool timeout, 3rd outage wave); RE-DISPATCHED ONCE ~16:35 EST — branch intact at e705670, 0 commits.
5. Vehicle + camera collision (world-collision exists for on-foot; extend) ▶ RUNNING — dispatched 2026-11-15 ~16:26 EST, branch realm-vehicle-collision-2026-11-15, worktree ~/workspace/shaddai-vehicle. 2 COMMITS LANDED: ee8b7ca vehicle collision (?vehcollide=0), 29aeec2 camera collision (?camcollide=0). Crew DIED ~16:56 EST (sqlx pool timeout, first failure); RE-DISPATCHED ONCE ~16:57 EST to continue from 29aeec2 — do not redo the landed commits.
6. KTX2 phase 0: vendor basis transcoder + KTX2Loader wiring behind ?ktx2=1 (no asset conversion) ▶ RUNNING — dispatched 2026-11-15 ~16:26 EST, branch realm-ktx2-phase0-2026-11-15, worktree ~/workspace/shaddai-ktx2. DIED ~16:43 EST (sqlx pool timeout); RE-DISPATCHED ONCE ~16:50 EST — worktree looked complete, crew told to preserve any uncommitted first-attempt work.
7. Orphans behind flags, ONE at a time, each behind its own flag: weapons → agent-gear (needs loadout data) → combat-core ?combat=1 → fishing → castle-siege ▶ RUNNING — dispatched 2026-11-15 ~16:26 EST, branch realm-orphans-flags-2026-11-15, worktree ~/workspace/shaddai-orphans.
8. C-6 PVS-lite from height raster (M–L, only after C-5) · C-9 per-tier anisotropy (S) · C-8 shadow cadence (S)
9. Dashboard audit leftovers: §8.1 #3 (S–M Security view honesty), #6 (M dead view containers), #7 (M skin unification)
10. Loading pipeline stages 2–6 + 7(b)(c) (stage 2 prefetch, 3 ENTER-gate slim, 4 document.write retire, 5 priority queue, 6 codec policy, 7b/c low-res color.jpg + mobile splat cap)
11. Backend perf leftovers: #6 (M boot diet), #7 (L presence SSE)

## 🔒 FOUNDER DECISIONS — never auto-start
- DEPLOY waves 1–4 + all branches to live (Israel's go, then device re-test)
- G-14 durable persistence (Render disk vs Postgres vs Firestore) — launch blocker for a real economy
- The pond (only genuinely new build; Blender YES; interim placed-water option exists)
- G-11 config: FIREBASE_SERVICE_ACCOUNT + REQUIRE_AUTH flip (after G-2)
- Plot rings re-seat onto the founder layout + grid-commons-v4.json (1,863 items) adopt-or-drop
