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

## RUNNING (2026-11-15 ~15:26 EST)
- Wave 4 S-batch — DONE 2026-11-15 ~15:27 EST (WAVE4_RECEIPT.md; harness 38/38). Branch realm-fix-wave4-2026-11-15 (f26570a = bloom duplicate of wave-3's fca97b1 — integrator drops one).
- G-1 player saves wiring + G-13 prefs — branch realm-g1-saves-2026-11-15, worktree ~/workspace/shaddai-g1
- C-2 clusters rebuild amortization — branch realm-fix-c2-2026-11-15, worktree ~/workspace/shaddai-c2
- C-4 generalize static matrix freeze — branch realm-fix-c4-2026-11-15, worktree ~/workspace/shaddai-c4
- C-5 city builder v2: 250 m cells + per-tier instanced sets — branch realm-fix-c5-2026-11-15, worktree ~/workspace/shaddai-c5
- Dashboard audit "safe build now" S items (#1, #2, #4, #5, #8, #9) — branch realm-dashboard-audit-fixes-2026-11-15, worktree ~/workspace/shaddai-dashfix
- Loading pipeline stage 1 + stage 7(a) dunes.png→WebP — branch realm-loading-s1-2026-11-15, worktree ~/workspace/shaddai-load1
- Backend perf "safe now" S items (#1–5 cache-only for #5, #8) — branch realm-backend-perf-2026-11-15, worktree ~/workspace/shaddai-bperf

## INTEGRATION NOTE (2026-11-15 ~15:26 EST)
- Wave-4 C-1 was also committed onto the wave-3 branch as fca97b1 (branch-sharing; left as found, per WAVE3_RECEIPT.md). G-6 presence files (new public/world-presence.js + world-navi-chat.js hook + HTML script tag) sit UNCOMMITTED in the realm-fix-wave3-2026-11-15 working tree — the presence commit 33a20cd lives on realm-presence-2026-11-15. Do NOT build-dist from the shared checkout until the presence files are either committed to their branch or reverted from the tree; new crews use isolated worktrees only.
- Latest completed wave tip for branching: e705670 (realm-fix-wave3-2026-11-15).

## QUEUE (in order — dispatch as slots free)
0. **INTEGRATION** — build `integration-2026-11-15` from main `3f22f944` per OPENCODE_DIRECTIVES.md Tasks 0–1 (waves 1–4 + presence + re-pack + dashperf + backend quick wins; drop duplicate bloom f26570a). When the loop's newer branches (g1-saves, c2, c4, c5, dashfix, load1, bperf) land with receipts, stack them onto the integration branch in completion order, rebuild dist, re-run the full harness suite after each. STOP before any push — deploy is Israel's.
1. G-5 bazaar auth + atomic store (M) — THEN G-4 currency unification (M). ORDER IS SAFETY-CRITICAL: never enable the x402↔Sparks bridge before G-2/G-5. (Held this cycle: backend-perf crew is touching x402 cache concurrently; dispatch next run after it lands.)
2. G-7 city-deed claim backend (M; copy home-deeds pattern)
3. G-9 skate leaderboard (S) + G-10 lounge tracks (S)
4. Interiors completion (black-void fix; diagnosis in guide P1s)
5. Vehicle + camera collision (world-collision exists for on-foot; extend)
6. KTX2 phase 0: vendor basis transcoder + KTX2Loader wiring behind ?ktx2=1 (no asset conversion)
7. Orphans behind flags, ONE at a time, each behind its own flag: weapons → agent-gear (needs loadout data) → combat-core ?combat=1 → fishing → castle-siege
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
