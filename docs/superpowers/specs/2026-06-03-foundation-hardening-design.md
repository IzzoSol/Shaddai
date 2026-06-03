# Sub-Project 1 — Foundation Hardening — Design Spec

*Date: 2026-06-03 · Repo: `IzzoIzzoIzzo/Shaddai` (private, branch `main`) · Local: `C:\Users\Brittany\Shaddai-clone`*

## Goal
Make the SHADDAI base **safe to open to the public**, in stages, without breaking local dev. This is the foundation every other sub-project (Agent Engine, Creation Suite, Marketplace, Deploy) stacks on. Nothing ships on an insecure base.

This is the first of five sub-projects:
1. **Foundation Hardening** ← this spec
2. Agent Engine Integrity (skill→tool binding, value-based metering, custom-agent loop, cron runner)
3. Creation Suite (real music/image/chat/agent-creation)
4. Marketplace + Boardroom + Trading Analytics (real economy, collectibles → Solana NFTs)
5. Packaging + Deploy (green Render, PWA, polish)

## Environment topology (backup + test strategy)
| Layer | Location | Keys | Purpose |
|---|---|---|---|
| DEV | `Shaddai-clone/` (git repo) | real keys in `backend/.env` (gitignored) | run & test locally with full keys |
| SHIP | `Shaddai-clone/ship/` (`SHADDAI-latest.html`, `SHADDAI-prev.html`) | none (keyless) | track exactly what we ship; rollback |
| GitHub | private `IzzoIzzoIzzo/Shaddai` | none (`.env` gitignored; secret-scan CI blocks keys) | cloud backup + source of truth |
| Render | hosted web service | keys in Render dashboard only | production deploy |
| Obsidian | SHADDAI notes folder | none | docs/spec/status mirror, second backup |

**Ironclad rule:** secrets live ONLY in `backend/.env` (DEV) and the Render dashboard. Never in a build file, ship copy, GitHub, or Obsidian. The secret-scan CI is the enforcement tripwire.

## Current state (audited 2026-06-03, file:line-verified)
- Served build `public/index.html` is **clean of keys**. The leaked OpenRouter key remains in ~6 stale HTML files (`public/shaddai.html`, `public/FINAL-SHADDAI-73.34.html`, `73.37.html`, root `FINAL-SHADDAI-79.9/V80/V80-MCPO.html`) and in git history.
- Unprotected sensitive routes: `POST /api/agents/task`, `POST /api/agents/:name/invoke/:skillName`, `DELETE /shaddai/skills/custom/:id`, `DELETE /skill-packs/installed/...`, `POST /execute-code`, `POST /moonpay/intent`, `POST /moonpay/pay-agent`.
- Code-exec uses Node `vm` (escapable, not a security boundary) at `agent-engine.js` (`run_js`) and `api-proxy-routes.js` (`/execute-code`). `run_python` correctly gated by `ALLOW_PYTHON_EXEC` (off by default).
- XSS: `public/index.html` (~lines 4200, 4220, 4224) renders user-controlled MoonPay fields (`agent`, `action`, `cliCommand`, `error`) via `innerHTML`.
- `.gitleaks.toml` + `.github/workflows/secret-scan.yml` exist and block on push, but allowlist doesn't cover `public/*.html`.

## Components / work items

### 1. Secret remediation (PIKADON)
- **Owner action:** rotate the OpenRouter key at openrouter.ai (revoke old, issue new, put new in `backend/.env` + Render). Step-by-step provided separately. *(Only the owner can do this.)*
- Delete the ~6 stale key-bearing HTML files (they are preserved in git history and the Desktop copy).
- Tighten `.gitleaks.toml` to also scan `public/*.html`.
- **Decision (A): rotate-and-delete-files; NO git-history rewrite.** Once rotated, the old key is dead; a history rewrite forces a risky force-push for no security gain.

### 2. Auth enforcement (PIKADON + NEXUS)
- Apply existing `softAuth` / `verifyFirebaseToken` (from `auth-guard.js`) to all sensitive routes listed above.
- Gate dangerous ops behind `requireAdmin`: admin credit/tier, MoonPay kill-switch, code-exec, agent/skill delete.
- **Non-breaking:** dev-permissive locally (x-user-id header fallback); enforced in prod via `REQUIRE_AUTH=true` + `ADMIN_TOKEN` + `FIREBASE_SERVICE_ACCOUNT`.

### 3. Code-exec sandbox (PIKADON + NEXUS)
- One shared sandbox module used by both `run_js` and `/execute-code`.
- **Decision (B): `isolated-vm`** (true V8 isolate; memory cap + 3s timeout; no `require`/`process`/`fs`/network). Fallback if Windows native build fails: `worker_threads` with frozen no-`require` context (weaker, pure-JS).
- `run_python` stays OFF for launch (remains behind `ALLOW_PYTHON_EXEC`, documented for future Docker `--network none` runner).

### 4. XSS hardening (PIKADON + TURTLE)
- Add shared `escapeHtml()` util.
- Fix the 3 MoonPay sinks first, then sweep every `innerHTML` fed by personas / shop names / listings / agent output. Prefer `textContent` where no markup is needed.

### 5. Canonical build + ship/backup hygiene (NEXUS + SHADDAI)
- `public/index.html` is the single served build.
- Move all stray `*.html` (root + `public/` archives) into `archive/` (safe in git + Desktop copy) — this also removes the key-bearing files.
- Create `ship/` holding the 2 latest keyless build snapshots (`SHADDAI-latest.html`, `SHADDAI-prev.html`); rotate on each ship.
- Document the topology in `SHADDAI_BUILD_STATUS.md`; mirror to Obsidian.

### 6. Verification (PIKADON) — evidence before "done"
- gitleaks scan clean (incl. `public/*.html`).
- An unauthorized request to each protected route returns 401/403 when `REQUIRE_AUTH=true`.
- A sandbox-escape attempt (e.g. `require`/`process` access, infinite loop) fails / times out.
- A stored XSS payload in a MoonPay field renders inert (escaped text, no script execution).
- Only `public/index.html` is served; `archive/` not routable.
- `scripts/tool-audit.js` still passes.

## Out of scope (deferred to later sub-projects)
- Value-based metering design & pricing → Sub-Project 2.
- Real Suno/AceDataCloud keys & creation flows → Sub-Project 3.
- Collectibles → Solana NFT economy → Sub-Project 4.
- Render green deploy + PWA → Sub-Project 5.

## Success criteria
All six verification checks pass; DEV runs locally with keys; a keyless build is captured in `ship/`; GitHub push is clean (secret-scan green); docs mirrored to Obsidian.
