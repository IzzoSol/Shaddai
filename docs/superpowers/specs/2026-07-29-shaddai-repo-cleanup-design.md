# SHADDAI Main-Repo Cleanup — Design

**Date:** 2026-07-29
**Repo:** `IzzoSol/Shaddai` · local path `C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD`
**Owner concern:** "There's so much info and I don't know why. Is it all complete? Can we review each file/folder?"
**Risk tolerance:** LOW. Owner explicitly said: *"just be careful not to lose valuable unfixable stuff."*

## Goal

Reduce noise so the repo only contains what is needed to (a) run SHADDAI and (b) document the system. Anything that doesn't serve one of those two purposes gets deleted, moved, or untracked.

Everything below is destructive — files deleted here are gone from `main` (still recoverable via `git reflog` for 30 days and via `git fsck --unreachable` indefinitely, but the working copy is gone). The table marks anything **irreversible** explicitly.

## Non-goals

- Don't refactor code.
- Don't rewrite documentation — just decide if each doc lives or dies.
- Don't touch `backend/`, `public/`, `aura/`, `aura-cli/`, `docs/`, `specs/`, `games/` — those are keepers, audited not pruned.
- Don't push to GitHub. Owner pushes when ready.
- Don't move anything to a new top-level location; drop or keep.

## Audit table

Legend:
- ✅ **KEEP** — committed and intentional.
- 🗑️ **DELETE** — `git rm`. Files were once useful but superseded.
- 📦 **ARCHIVE-EXTERNAL** — move to a sibling folder OUTSIDE the repo (e.g. `C:/Users/Brittany/Desktop/SHADDAI-ARCHIVE/`), then `git rm`. Preserves the file but removes it from version control.
- 🚫 **UNTRACK** — `git rm --cached` only (file stays on disk; not in git). Right for generated artifacts, local logs.
- ⚠️ — **irreversible content** (art that took hours to generate, one-of-a-kind research output, etc.). Confirm with owner before deletion.

### Root-level docs (19 `.md` files + 3 `.bat` files)

| File | Lines | Decision | Why | ⚠️ |
|---|---|---|---|---|
| `README.md` | 187 | ✅ KEEP | Live GitHub front door. | |
| `START_HERE.md` | 16 | ✅ KEEP | Local-runner quickstart. | |
| `HOW-TO-RUN.md` | 63 | ✅ KEEP | Different audience (Windows `.bat` users), complements START_HERE. | |
| `SHADDAI-WORLD-BIBLE.md` | 230 | ✅ KEEP | Current design source-of-truth (isometric world). | |
| `START-SHADDAI.bat` | — | ✅ KEEP | One-click launcher. | |
| `STOP-SHADDAI.bat` | — | ✅ KEEP | One-click shutdown. | |
| `START-MULTIPLAYER.bat` | — | ✅ KEEP | Pixel-world multiplayer launcher. | |
| `BUILD_COMPLETE.md` | 379 | 🗑️ DELETE | Old 2026-06-25 World Labs build report. Superseded by 9 later commits. | |
| `COMPLETE_WORLD_BUILT.md` | 371 | 🗑️ DELETE | Same era as BUILD_COMPLETE, same story. | |
| `TASK_8_COMPLETION_REPORT.md` | 144 | 🗑️ DELETE | Single-task report from the same era. | |
| `WORLDS_CREATED_SUMMARY.md` | 358 | 🗑️ DELETE | Old 5-worlds summary, current is SHADDAI-WORLD-BIBLE. | |
| `WORLD_BUILD_INSTRUCTIONS.md` | 231 | 🗑️ DELETE | Old build instr, current is Bible + HOW-TO-RUN. | |
| `WORLD_FIX_LIST.md` | 230 | 🗑️ DELETE | Bug list from World Labs era, all bugs since resolved. | |
| `WORLD_LABS_INTEGRATION_SUMMARY.md` | 292 | 🗑️ DELETE | Same era, same report. | |
| `WORLD_README.md` | 44 | 🗑️ DELETE | Stub doc, superseded. | |
| `WORLD_VIEWER_GUIDE.md` | 125 | 🗑️ DELETE | World Labs viewer guide, no longer used. | |
| `AGENT_BODY_SPEC.md` | 48 | 🗑️ DELETE | Meshy art-direction spec for the 2026-07-07 body swap. Already executed; the result is FINALIZED/MANIFEST.md. | |
| `SHADDAI-FRONTEND-HANDOFF.md` | 56 | 🗑️ DELETE | Internal handoff to another terminal, already delivered. | |
| `SHADDAI_BUILD_STATUS.md` | 92 | 🗑️ DELETE | Old status doc, current status is README. | |
| `TEST-v94.44.md` | 46 | 🗑️ DELETE | One-time test log. | |

**Savings:** 2,507 lines of outdated markdown.

### Root-level loose files

| File | Decision | Why | ⚠️ |
|---|---|---|---|
| `mp-server.js` | ✅ KEEP | Multiplayer relay grafted into Render's WS server. Required for pixel-world. | |
| `package.json` / `package-lock.json` | ✅ KEEP | Root deps (renders, scripts). | |
| `render.yaml` | ✅ KEEP | Deploy blueprint. | |
| `skills-lock.json` | ✅ KEEP | Pinned skill registry. | |
| `.gitignore` / `.gitleaks.toml` | ✅ KEEP | Safety. | |
| `AGENT_BODY_SPEC.md` | 🗑️ DELETE | (covered above) | |
| `SHADDAI-WORLD-BUILD-BACKUP.zip` (85 KB) | 🗑️ DELETE | One-time zip backup of world HTML. | |
| `_archive_world_builds/` | 🗑️ DELETE | Local copies of older world HTMLs (SHADDAI-WORLD-3D.html, etc.). | |
| `_backups/` (7 MB) | 🗑️ DELETE | Auto-generated dated backups. | |
| `_boot3.log` … `_boot6.log` etc. (40+ files) | 🚫 UNTRACK | Local server logs. Add `_*log*` to `.gitignore`. | |
| `_server*.log`, `_srv*.log`, `_tg*.log`, `_w-server.log`, `_dodgeball_test.js`, `_soccer_*.js`, `_rooms_smoke.mjs`, `_serve.log` (35+ files) | 🚫 UNTRACK | Same — local-only dev artifacts. | |
| `audit.js`, `audit.log`, `audit_output.log`, `audit_script.js`, `diag_*.txt` | 🚫 UNTRACK | One-shot dev scripts. | |
| `test-*.js` (5 files) | 🚫 UNTRACK | One-shot test runners, not part of suite. | |
| `.env`, `.env.local`, `ai.key`, `billing.log`, `billing-error.log` | 🚫 UNTRACK + confirm gitignored | Secrets and runtime logs. | |

### Tracked subdirectories

| Path | Tracked files | Size | Decision | Why | ⚠️ |
|---|---|---|---|---|---|
| `backend/` | many | large | ✅ KEEP | The server. | |
| `public/` | many | 450 MB | ✅ KEEP (audit later) | The frontend. Probably has art to prune too, but out of scope for THIS pass. | |
| `aura/` | — | — | ✅ KEEP | Token-saver library. | |
| `aura-cli/` | — | — | ✅ KEEP | CLI wrapper. | |
| `docs/` | 61 | 1.1 MB | ✅ KEEP (audit later) | All active architecture/spec docs. Out of scope THIS pass. | |
| `specs/` | 4 | 40 KB | ✅ KEEP | Design specs. | |
| `games/` | — | — | ✅ KEEP | Game code. | |
| `shaddai-mcp/` | 3 | — | ✅ KEEP | MCP server. | |
| `shaddai-rag/` | 2 | — | ✅ KEEP | RAG package. | |
| `scripts/` | 447 | **296 MB** | 🗑️ DELETE whole dir | Throwaway PNGs (314) + one-shot dev `.js`/`_*.txt` files (133). Not used by build pipeline. | ⚠️ some PNGs (agent busts, council portraits) took HF generation time. |
| `ship/` | 2 | 33 MB | 🗑️ DELETE | `SHADDAI-latest.html` + `SHADDAI-prev.html` snapshots. Already untracked per memory note; tracked copies redundant. | ⚠️ if owner still ships from `ship/`, keep. |
| `fal-assets/` | 26 | 1.6 MB | 🗑️ DELETE | Mostly FLUX/Meshy *prompt briefs* (PROMPTS.md, MASTER-PROMPTS.md, POLISH-BRIEF-APEX.md, AGENT-3D-PIXEL-SPEC.md, etc.) — useful prompt docs but already duplicated or superseded by specs/. Move `PROMPTS.md` + `MASTER-PROMPTS.md` to `docs/` if owner wants to keep prompt history. | ⚠️ these prompts took iteration to write. |
| `bankr/` | 7 | 40 KB | 🗑️ DELETE | Bankr-monetize prototype. No active use. | |
| `tools/object-sculptor/` | 36 | 2.3 MB | 🗑️ DELETE | Vendored Three.js toolkit, not referenced by SHADDAI. | ⚠️ if owner plans to re-integrate, keep. |
| `workflows/` | 3 (.ainl) | 16 KB | 🗑️ DELETE | Deprecated AINL format (AURA No-AINL rule). | |
| `data/` | 0 | 4 KB (empty) | 🚫 UNTRACK | Empty local data dir. | |
| `FINALIZED/` | ~30 | large | ✅ KEEP | Cross-reference docs for the 2026-07-07 body swap. Active, in use. | ⚠️ GLB files (ORACLE.glb 7.6 MB, etc.) are reference renderings — replaceable but large. Keep for now. |
| `SHADDAI Agents Full Body/` | 7 PNG | small | ✅ KEEP | Agent portrait PNGs (referenced by docs). | |
| `generated-output/` | many | — | 🚫 UNTRACK | Build pipeline output, regenerated each run. | |
| `.claude/`, `.agents/` | many | — | ✅ KEEP | Claude/agent skills. | |

### Working-tree noise (clean up before commit)

These are already deleted/modified and should be committed:

```
M  backend/distill-mastery.js              (modified, keep)
D  backend/knowledge/mastery/ORACLE/*.md   (24 files deleted — mastery-note cleanup, keep the deletion)
D  backend/knowledge/mastery/SHADDAI/*.md  (23 files deleted — same)
D  backend/knowledge/mastery/ZEROX/*.md   (3 files deleted — same)
?? backend/data/mastery-run.log.err        (untracked, gitignore)
?? backend/data/rag/                       (untracked, gitignore)
```

Add to `.gitignore`:
```
/backend/data/rag/
/backend/data/mastery-run*.log*
/_*.log
/_*.cjs
/_*.mjs
/_*.js   !/scripts/.gitkeep   # keep test scripts under scripts/ if you want — but you deleted scripts/ above
/_archive_world_builds/
/_backups/
/generated-output/
/audit.log
/audit_output.log
/billing*.log
/diag_*.txt
/test-*.js
/.env
/.env.local
/ai.key
```

(Conditional `!` keep rules added only if owner decides to keep parts of `scripts/`.)

## Decisions for owner to confirm before action

1. **`scripts/` — really delete all 296 MB?** Some PNGs (agent busts, council portraits) are HF-generated. OK to lose and regenerate if ever needed? Or archive externally?
2. **`ship/` — really delete?** Memory says it's already untracked in spirit. Are you still deploying from `ship/`? If yes, keep. If no, delete.
3. **`fal-assets/` — delete?** The prompts in `fal-assets/PROMPTS.md` may still be useful. Keep just `PROMPTS.md`, drop the rest?
4. **`tools/object-sculptor/` — delete?** Vendored toolkit, currently unused. Safe to lose?
5. **`bankr/` — delete?** Old prototype, not referenced. Safe to lose?
6. **Old root `*.md` files — really delete all 12?** They're historical, but everything they say is in the README/Bible now. Safe to lose?

## Execution plan

After owner approval:

1. Create a fresh branch: `git checkout -b chore/repo-cleanup-2026-07-29`.
2. Apply the audit table in 5 commits, each focused and revertable:
   - **commit 1**: delete 12 outdated root `.md` files.
   - **commit 2**: delete `ship/`, `fal-assets/` (keep PROMPTS.md), `bankr/`, `workflows/`, `tools/object-sculptor/`.
   - **commit 3**: delete `scripts/` (or move to `_archive/scripts-2026-07-29/` then `git rm`).
   - **commit 4**: untrack working-tree noise + update `.gitignore` (40+ files).
   - **commit 5**: commit mastery-note deletions + `backend/distill-mastery.js` update.
3. Verify with `git status` clean + `git fsck --unreachable` listing what was lost (for 30-day safety net).
4. Push the branch. Owner merges.

## Verification

- `git rev-parse HEAD` before and after; both should checkout clean.
- `du -sh .git` — should drop significantly (296 MB of objects removed).
- `npm start` from `backend/` still boots cleanly (no script references deleted paths).
- `git log --oneline | head -10` shows the 5 cleanup commits.

## Out of scope (deferred)

- Audit of `public/` (450 MB — frontend assets probably have their own clutter).
- Audit of `docs/` (61 files — may have stale specs).
- Audit of `backend/knowledge/mastery/` (the deleted mastery notes — confirm the keep-set).
- Audit of old `aura/` vs `aura-cli/` overlap.
- Audit of `shaddai-rag/` vs `shaddai-mcp/` overlap.
- History rewrite (`git filter-repo`) to drop the 296 MB from history entirely. Heavy hammer, requires force-push. Owner decides.

Owner: "after cleanup, then work on dashboard itself." Dashboard work begins only after the audit table is approved and this plan is executed (or parked for later).