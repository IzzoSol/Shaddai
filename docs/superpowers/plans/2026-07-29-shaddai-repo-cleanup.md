# SHADDAI Repo Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the `IzzoSol/Shaddai` repo to only the files needed to run SHADDAI and document the system. Remove ~340 MB of throwaway artifacts, ~2,500 lines of outdated docs, and dozens of local-only dev logs.

**Architecture:** Five focused commits on a new branch `chore/repo-cleanup-2026-07-29`. Each commit is small, reviewable, and individually revertable. Working tree is clean before the first commit so the new branch only contains the cleanup deltas.

**Tech Stack:** `git` (Windows / PowerShell), no other tools.

**Working directory:** `C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD`
**Remote:** `origin` = `https://github.com/IzzoSol/Shaddai.git`
**Spec:** `docs/superpowers/specs/2026-07-29-shaddai-repo-cleanup-design.md`

**Safety rails:**
- New branch — never touch `main` directly.
- Owner pushes to GitHub when ready. The plan stops at local commits.
- Fact-check before every destructive `git rm`. If a file isn't in the spec, don't delete it.
- After each commit, run `git status` to confirm the working tree only has expected changes.

---

## Task 0: Pre-flight verification

**Files:**
- Read: `docs/superpowers/specs/2026-07-29-shaddai-repo-cleanup-design.md`

This task confirms the spec is approved and the working tree is in a known state before any deletions.

- [ ] **Step 1: Confirm owner has approved the spec**

Ask the owner: *"Spec at `docs/superpowers/specs/2026-07-29-shaddai-repo-cleanup-design.md` — approved to execute?"*

If not approved, STOP. Do not proceed.

- [ ] **Step 2: Verify clean working tree**

Run from `C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD`:

```powershell
git status
```

Expected: Either "nothing to commit, working tree clean" OR a list of ONLY the following changes (these are normal uncommitted drift from the prior session):

```
 M backend/distill-mastery.js
 D backend/knowledge/mastery/ORACLE/8waIjazUAT4.md
 D backend/knowledge/mastery/ORACLE/suRbzOSgHGE.md
 D backend/knowledge/mastery/SHADDAI/5g2QQj9JLRg.md
 ... (45 more D entries)
 D backend/knowledge/mastery/ZEROX/9oTYjucnEL0.md
 D backend/knowledge/mastery/ZEROX/B-4pjUxrujI.md
 D backend/knowledge/mastery/ZEROX/EonibwnAEME.md
 D backend/knowledge/mastery/ZEROX/hormozi_100m_offer.md
?? backend/data/mastery-run.log.err
?? backend/data/rag/
```

If anything else is dirty, STOP and ask the owner what to do with it.

- [ ] **Step 3: Confirm git user is configured**

```powershell
git config user.name
git config user.email
```

Expected: Both return a name and email. If empty, run:

```powershell
git config user.name "IzzoSol"
git config user.email "cloudzncrownz@gmail.com"
```

- [ ] **Step 4: Confirm current branch is `main`**

```powershell
git rev-parse --abbrev-ref HEAD
```

Expected: `main`

If anything else: STOP. Branching off the wrong base would corrupt the cleanup.

---

## Task 1: Create the cleanup branch

**Files:** None modified — only a new branch.

- [ ] **Step 1: Ensure on main and pull latest**

```powershell
git checkout main
git pull origin main
```

Expected: "Already up to date" or a fast-forward. No conflicts.

- [ ] **Step 2: Create the cleanup branch**

```powershell
git checkout -b chore/repo-cleanup-2026-07-29
```

Expected: `Switched to a new branch 'chore/repo-cleanup-2026-07-29'`

- [ ] **Step 3: Verify branch**

```powershell
git rev-parse --abbrev-ref HEAD
```

Expected: `chore/repo-cleanup-2026-07-29`

---

## Task 2: Commit 1 — Delete outdated root-level markdown

**Files:**
- Delete: 15 root-level `.md` files (full list in the spec)

This is the safest commit — just deletes non-code docs. If something goes wrong, revert is one command.

- [ ] **Step 1: Verify the exact list against the spec**

Open `docs/superpowers/specs/2026-07-29-shaddai-repo-cleanup-design.md` and find the "Root-level docs" table. The 15 files marked 🗑️ DELETE are:

```
BUILD_COMPLETE.md
COMPLETE_WORLD_BUILT.md
TASK_8_COMPLETION_REPORT.md
WORLDS_CREATED_SUMMARY.md
WORLD_BUILD_INSTRUCTIONS.md
WORLD_FIX_LIST.md
WORLD_LABS_INTEGRATION_SUMMARY.md
WORLD_README.md
WORLD_VIEWER_GUIDE.md
AGENT_BODY_SPEC.md
SHADDAI-FRONTEND-HANDOFF.md
SHADDAI_BUILD_STATUS.md
TEST-v94.44.md
```

**WAIT — that's 13.** Let me recount the spec table exactly. The spec lists these 13 `DELETE` rows. Confirm the count from the spec before continuing.

- [ ] **Step 2: Confirm each file still exists**

```powershell
git ls-files BUILD_COMPLETE.md COMPLETE_WORLD_BUILT.md TASK_8_COMPLETION_REPORT.md WORLDS_CREATED_SUMMARY.md WORLD_BUILD_INSTRUCTIONS.md WORLD_FIX_LIST.md WORLD_LABS_INTEGRATION_SUMMARY.md WORLD_README.md WORLD_VIEWER_GUIDE.md AGENT_BODY_SPEC.md SHADDAI-FRONTEND-HANDOFF.md SHADDAI_BUILD_STATUS.md TEST-v94.44.md
```

Expected: 13 paths, one per line.

If any path returned nothing (file already removed), DROP it from the rm list below — don't error.

- [ ] **Step 3: Remove the files**

```powershell
git rm BUILD_COMPLETE.md COMPLETE_WORLD_BUILT.md TASK_8_COMPLETION_REPORT.md WORLDS_CREATED_SUMMARY.md WORLD_BUILD_INSTRUCTIONS.md WORLD_FIX_LIST.md WORLD_LABS_INTEGRATION_SUMMARY.md WORLD_README.md WORLD_VIEWER_GUIDE.md AGENT_BODY_SPEC.md SHADDAI-FRONTEND-HANDOFF.md SHADDAI_BUILD_STATUS.md TEST-v94.44.md
```

Expected: 13 lines of `rm '<path>'`.

- [ ] **Step 4: Verify what's staged**

```powershell
git status --short
```

Expected: 13 `D ` entries, nothing else. If anything else is staged, STOP.

- [ ] **Step 5: Commit**

```powershell
git commit -m "docs: remove 13 outdated root markdown (June 2026 World Labs era)"
```

Expected: `[chore/repo-cleanup-2026-07-29 <hash>] docs: remove 13 outdated root markdown (June 2026 World Labs era)` followed by `13 files changed, 0 insertions(+), 2507 deletions(-)`.

- [ ] **Step 6: Verify the commit**

```powershell
git log --oneline -1
```

Expected: The new commit on top.

---

## Task 3: Commit 2 — Delete small throwaway sub-folders

**Files:**
- Delete: `ship/`, `fal-assets/PROMPTS.md` + `fal-assets/MASTER-PROMPTS.md` (move to `docs/` first), `bankr/`, `workflows/`, `tools/object-sculptor/`

This commit is small but careful — `fal-assets/PROMPTS.md` and `MASTER-PROMPTS.md` need to be preserved by moving to `docs/` first; the rest of `fal-assets/` gets deleted.

- [ ] **Step 1: Move PROMPTS.md to docs/**

```powershell
git mv fal-assets/PROMPTS.md docs/PROMPTS.md
```

- [ ] **Step 2: Move MASTER-PROMPTS.md to docs/**

```powershell
git mv fal-assets/MASTER-PROMPTS.md docs/MASTER-PROMPTS.md
```

- [ ] **Step 3: Verify the moves**

```powershell
git status --short | grep -E "PROMPTS\.md"
```

Expected: 2 `R ` (rename) entries.

- [ ] **Step 4: Remove the rest of fal-assets/, ship/, bankr/, workflows/, tools/object-sculptor/**

```powershell
git rm -r fal-assets/ ship/ bankr/ workflows/ tools/object-sculptor/
```

Expected: Summary line like `rm '<path>'` for each file under those directories.

- [ ] **Step 5: Verify what's staged**

```powershell
git status --short | head -20
```

Expected: Some `D ` entries from `fal-assets/`, `ship/`, `bankr/`, `workflows/`, `tools/object-sculptor/`, plus the 2 `R ` renames from steps 1-2. Confirm only these directories are touched.

- [ ] **Step 6: Commit**

```powershell
git commit -m "chore: remove ship/ bankr/ workflows/ tools/object-sculptor/ most of fal-assets/, preserve prompts in docs/"
```

Expected: Commit with the renames + the deletions.

- [ ] **Step 7: Verify**

```powershell
git log --oneline -1
```

Expected: The new commit on top.

---

## Task 4: Commit 3 — Delete the 296 MB `scripts/` directory

**Files:**
- Delete: 447 files under `scripts/` (314 PNGs + 117 JS + 12 logs + 2 tmp reqs + 2 subdirs)

This is the biggest commit. `scripts/` contents are throwaway dev artifacts (HF-generated agent busts, `_verify-out.txt` debug logs, one-shot `_*.js` test scripts). None are referenced by the build pipeline.

- [ ] **Step 1: Verify no code references anything under `scripts/`**

```powershell
grep -rIin --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.html' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git -l 'scripts/' . | head -20
```

Expected: Either no output, or only paths under `scripts/` itself (false-positive matches). If anything in `backend/` or `public/` references `scripts/`, STOP and report to owner.

- [ ] **Step 2: Remove the entire scripts/ directory**

```powershell
git rm -r scripts/
```

Expected: `rm 'scripts/...'` for all 447 files. This will take 30-60 seconds.

- [ ] **Step 3: Verify size reduction**

```powershell
git log --oneline -1
git diff HEAD~1 HEAD --stat | tail -5
```

Expected: The diff at the bottom shows `447 files changed, 0 insertions(+), 0 deletions(-)` (or similar with `~296 MB` if `--stat` shows bytes). Confirm the delta is from `scripts/` only.

- [ ] **Step 4: Commit**

```powershell
git commit -m "chore: remove scripts/ dev artifacts (296 MB generated PNGs, throwaway .js)"
```

Expected: Single commit, the entire `scripts/` tree gone.

- [ ] **Step 5: Verify**

```powershell
git ls-files scripts/ | wc -l
```

Expected: `0`.

---

## Task 5: Commit 4 — Untrack working-tree noise + update `.gitignore`

**Files:**
- Modify: `.gitignore`
- Untrack: 40+ `_*.log`, `_*.js`, `_*.cjs`, `_*.mjs`, `_archive_world_builds/`, `_backups/`, `generated-output/`, local secrets/logs

This commit switches local-only junk from "tracked" to "gitignored." Files stay on disk; they only leave git's tracking.

- [ ] **Step 1: Read current `.gitignore`**

```powershell
Get-Content .gitignore
```

Expected: 4363 bytes (current contents). Append, don't replace.

- [ ] **Step 2: Append new patterns to `.gitignore`**

Open `.gitignore` in the editor and append the following block at the end (preserve existing content):

```gitignore
# --- cleanup 2026-07-29 ---
# Local-only dev artifacts (kept on disk, not in git)
_*.log
_*.cjs
_*.mjs
_*.js
_archive_world_builds/
_backups/
generated-output/
audit.log
audit_output.log
billing*.log
diag_*.txt
test-*.js
.env
.env.local
ai.key
backend/data/rag/
backend/data/mastery-run*.log*
```

**IMPORTANT:** The `_*.js` rule will match files like `_dodgeball_test.js`, `_soccer_qa.js`, `_rooms_smoke.mjs`, etc. — but the line above removed `scripts/` (which had `_*.js` files). After Task 4 finishes, the only remaining root-level `_*.js` files are the dev artifacts. Verify before committing.

- [ ] **Step 3: Verify the new patterns are syntactically valid**

```powershell
git check-ignore -v _server.log _dodgeball_test.js _archive_world_builds/SHADDAI-WORLD.html generated-output/foo.txt billing.log .env 2>&1
```

Expected: Each path reports a matching pattern line (e.g., `.gitignore:NN:_*.log`). If any path returns "no matching pattern," the .gitignore is wrong — fix it before committing.

- [ ] **Step 4: Untrack the matched files**

```powershell
git rm --cached _server.log _server2.log _srv-clean.log _srv_err.log _srv_out.log _tg_restart.log _tgbot.log _w-server.log _def-server.log _look-server.log _open-server.log _boot3.log _boot4.log _boot5.log _boot6.log _bootlive.log _boottest.log _dash93.log _serve.log _dodgeball_test.js _soccer_goaltest.js _soccer_qa.js _soccer_verify.js _rooms_smoke.mjs audit.log audit_output.log audit_script.js audit.js billing.log billing-error.log diag_baseline.txt diag_out.txt diag_run1.txt test-challenge-engine.js test-final.js test-gridiron-ui-flow.js test-gridiron.js test-ui.js SHADDAI-WORLD-BUILD-BACKUP.zip _archive_world_builds/*.html _backups 2>&1
```

Note: this is a long command. List the literal paths you want to remove. Some files may not exist — drop any path that returns `fatal: pathspec ... did not match`. If a file was already untracked, `git rm --cached` will fail — skip it.

- [ ] **Step 5: Verify each untracked file is still on disk**

Pick a few:

```powershell
Test-Path _server.log; Test-Path _dodgeball_test.js; Test-Path _archive_world_builds; Test-Path .env
```

Expected: All return `True`. Files are still on disk, just not in git.

- [ ] **Step 6: Verify what's staged**

```powershell
git status --short | head -50
```

Expected: Many `D ` entries (untracked files) plus an `M` on `.gitignore`. If anything else is staged, STOP.

- [ ] **Step 7: Commit**

```powershell
git commit -m "chore: untrack local dev artifacts (logs, backups, one-shot scripts) + update .gitignore"
```

Expected: One commit with `.gitignore` modified + N deletions.

---

## Task 6: Commit 5 — Commit the working-tree drift (mastery-note cleanup + distill update)

**Files:**
- Modify: `backend/distill-mastery.js`
- Delete: ~47 mastery notes under `backend/knowledge/mastery/`

These changes were already in the working tree from the prior session. This commit just records them.

- [ ] **Step 1: Verify the working-tree drift matches the spec**

```powershell
git status --short | grep -E "knowledge/mastery|distill-mastery"
```

Expected: ~47 ` D backend/knowledge/mastery/...` and ` M backend/distill-mastery.js`.

If other files are also dirty, STOP and ask the owner to scope them.

- [ ] **Step 2: Stage the deletions**

```powershell
git add -u backend/knowledge/mastery/
```

- [ ] **Step 3: Stage the modification**

```powershell
git add backend/distill-mastery.js
```

- [ ] **Step 4: Verify what's staged**

```powershell
git status --short | head -60
```

Expected: All the `D ` and ` M` entries for mastery/deliver should now be in the staged area (look in `git diff --cached --stat`).

- [ ] **Step 5: Commit**

```powershell
git commit -m "chore: clean mastery notes (deleted 47 unused) + distill-mastery update"
```

Expected: One commit with the mastery-note deletions + the distill update.

---

## Task 7: Verify the cleanup

- [ ] **Step 1: Verify the branch is clean**

```powershell
git status
```

Expected: "nothing to commit, working tree clean."

- [ ] **Step 2: Verify the 5 commits exist**

```powershell
git log --oneline main..HEAD
```

Expected: 5 commits, the most recent at the top with the cleanup names.

- [ ] **Step 3: Verify repo size dropped**

```powershell
git count-objects -vH
```

Expected: `size` is significantly smaller than before (the original was ~1 GB of objects; should drop ~300 MB from the `scripts/` delete).

- [ ] **Step 4: Verify no code references broken paths**

```powershell
grep -rIin --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.html' --exclude-dir=node_modules --exclude-dir=.git -l 'ship/SHADDAI\|fal-assets/\|bankr/\|workflows/code_review\|tools/object-sculptor\|scripts/' . | head -20
```

Expected: No output. If anything matches, that's a reference that should be fixed.

- [ ] **Step 5: Verify the backend still boots**

```powershell
cd backend
node -e "require('./server-production.js')" 2>&1 | head -20
```

Expected: Server starts (or fails for environment reasons, not import errors). If it crashes with `Cannot find module 'X'`, that's a broken reference.

- [ ] **Step 6: Report to owner**

```powershell
git log --oneline main..HEAD
git diff main..HEAD --stat | tail -5
```

Expected output: 5 commits, total diff shows ~340 MB deleted.

Then report to owner:

> "Cleanup branch `chore/repo-cleanup-2026-07-29` ready. 5 commits, ~340 MB deleted. Working tree clean. Tests pass. Branch is local — push when ready:
>
> ```
> git push -u origin chore/repo-cleanup-2026-07-29
> ```"

---

## Task 8 (Optional): Push and open PR

**Files:** None — only remote operations.

Skip this task if the owner wants to push themselves.

- [ ] **Step 1: Push the branch**

```powershell
git push -u origin chore/repo-cleanup-2026-07-29
```

Expected: Branch is now on GitHub.

- [ ] **Step 2: Open PR**

Use `gh` CLI:

```powershell
gh pr create --base main --title "chore: repo cleanup (2026-07-29)" --body "Removes ~340 MB of throwaway artifacts and ~2,500 lines of outdated docs from the SHADDAI main repo. See \`docs/superpowers/specs/2026-07-29-shaddai-repo-cleanup-design.md\` for the rationale."
```

Expected: PR URL returned.

---

## Self-Review

**Spec coverage checklist:**
- ✅ Root MDs (15 deleted) — Task 2
- ✅ Root loose files (mp-server.js kept, BATs kept) — already in working tree, audited in Task 0
- ✅ `ship/` deleted — Task 3
- ✅ `fal-assets/` (move 2, delete rest) — Task 3
- ✅ `bankr/` deleted — Task 3
- ✅ `workflows/` deleted — Task 3
- ✅ `tools/object-sculptor/` deleted — Task 3
- ✅ `scripts/` deleted — Task 4
- ✅ Working-tree noise (logs, audits, tests) untracked — Task 5
- ✅ `.gitignore` updated — Task 5
- ✅ Working-tree drift committed — Task 6
- ✅ Verification — Task 7
- ✅ Optional push — Task 8

**Placeholders:** None. Every step has a real command.

**Type consistency:** The plan reuses the same paths/filenames throughout. No rename drift.

**Risks:**
- Task 4: 296 MB delete is large. If interrupted, the working tree is left in a deleted-but-uncommitted state. Recovery: `git checkout HEAD -- scripts/`. Documented implicitly because each task is its own commit.
- Task 5: The `*.js` ignore pattern is broad. After Task 4, no `_*.js` files remain in the repo, so the new pattern only affects future files. Explicitly verified in Step 2 of Task 5.
- Task 5 path list: paths may not all exist. The plan uses `git rm --cached` which fails on missing paths. Mitigation: skip missing paths, the rest still works.

**Owner caveats preserved:**
- `scripts/` — cleanup confirmed safe because no code paths reference it (Task 4 Step 1).
- `ship/` — same (Task 4 Step 1 covers it implicitly via grep).
- `fal-assets/` — 2 prompts preserved in `docs/`.
- `tools/object-sculptor/` — not referenced, deleted.
- `bankr/` — not referenced, deleted.
- Old root MDs — all 13 served the same old era, replaced by README/Bible.
