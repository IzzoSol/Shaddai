# SHADDAI Security Hardening Spec
**Status:** Design only — no implementation  
**Audit source:** `SHADDAI_PIKADON_AUDIT.md` (2026-06-01, v80)  
**Spec date:** 2026-06-02  
**Author:** PIKADON (via SHADDAI agent council)

---

## Threat Model Summary

SHADDAI is not a typical SaaS. It carries an unusually wide attack surface for a pre-launch product:

| Asset at risk | Realistic threat |
|---|---|
| Provider API keys (OpenRouter, Groq, Anthropic) | Any visitor to a deployed instance runs up charges on the owner's account. Already one key is baked into the served HTML. |
| Billing system (credits, tier upgrades) | With no token verification, any caller can self-promote to Elite or grant themselves unlimited credits — revenue goes to zero. |
| Agent code execution (`run_js`, `run_python`) | Agents execute arbitrary user-supplied code inside the server process with full Node.js / system Python access. A malicious job payload could exfiltrate `.env`, the billing database, or pivot to the host. |
| User-supplied strings rendered via `innerHTML` | 1,664 `innerHTML` calls across the UI. Any marketplace listing, agent persona, or collectible name is a stored-XSS vector targeting every logged-in user. |
| Secrets in git history / CI | One live key is already in `public/index.html` (committed). Future developers will commit secrets unless a hard gate exists. |
| Real-money surfaces (MoonPay intents, agent auto-buy, MoonCard) | All of the above become directly financial once live payments are wired. A compromised session + XSS = drained wallet. |

**Launch gate:** Items 1 and 2 (key leak + billing auth) must be fixed before any public URL is shared. Items 3 and 4 must be fixed before any multi-user or real-money launch. Item 5 should be CI-gated immediately.

---

## Issue 1 — Client-Side Key Leak (CRITICAL)

### Root Cause

`public/index.html` line **27,805** contains:

```js
localStorage.setItem('shaddai_openrouter_key', 'sk-or-v1-b826f3...1660b5');
```

This line was added as a convenience default. Because `public/` is served statically to every browser, anyone who opens dev-tools or views source gets the live key. The repo being private does not protect the *served* page. A second placeholder pattern `sk-ant-api...` appears in input fields at lines 6,104 and 8,822 (those are `placeholder` attributes, not literal keys — lower priority, but should be reviewed).

The backend already has the correct architecture: `backend/llm-client.js` reads all provider keys from `process.env` (set in `backend/.env`, which is gitignored). The problem is that the frontend bypasses the server and calls providers directly using a key baked into the page.

### Fix Options

**Option A (Recommended) — Server proxy endpoint**  
Add a single new Express route `POST /api/llm/chat` in `backend/server-production.js` (or a new `backend/llm-proxy-routes.js`). The browser posts `{ messages, agent, taskTier }` and the server calls `llm-client.js` / `brains.js` using server-side keys. The browser never sees a key. This is the correct long-term architecture and aligns with `brains.js` which already does exactly this for the agent engine.

**Option B — BYOK (Bring Your Own Key) only**  
Strip the hardcoded key and require every user to supply their own OpenRouter key via the UI settings panel (already wired to `localStorage.setItem('shaddai_openrouter_key', ...)`). Zero server-side cost exposure. Trade-off: friction for new users, no monetization via API credits.

**Option C — Environment-injected config endpoint**  
Add a `GET /api/config/public` route that returns only a safe subset (e.g., which providers are available, the default model name) — no keys. The browser calls this on load and adjusts UI accordingly. Keys still never leave the server. This complements Option A but does not replace it.

**Recommendation:** Option A is the correct fix. It is the only option that gives SHADDAI control over costs, enables per-user metering (already in `billing-service.js`), and supports the BYOK tier (users can optionally add their own key in the UI and it will be forwarded in the proxy call, never stored server-side).

### What Changes

| File | Change |
|---|---|
| `backend/llm-proxy-routes.js` (new) | `POST /api/llm/chat` — validates Firebase token, extracts userId, calls `agentLLM()` from `brains.js`, meters usage |
| `backend/server-production.js` | Mount new router: `app.use('/api/llm', llmProxyRoutes)` |
| `public/index.html` | Remove line 27,805 entirely. All direct-to-provider `fetch()` calls in the frontend replaced with `fetch('/api/llm/chat', { body: JSON.stringify({...}) })` |
| `backend/.env.example` | Add `FIREBASE_PROJECT_ID` etc. (already in `auth-service-hardened.js`); add comment "never add these to public/**" |

### Key Rotation Step (do immediately, before the next deploy)

1. Log in to [openrouter.ai/keys](https://openrouter.ai/keys) and **delete** `sk-or-v1-b826f3...1660b5`. Treat it as compromised.
2. Generate a fresh key. Add it to `backend/.env` as `OPENROUTER_API_KEY=<new-key>`. Do not put it anywhere else.
3. Check git history: `git log --all -S 'sk-or-v1-b826f3' --oneline`. If the old key appears in any commit, consider the commit history tainted and rotate again after the new key is in use.
4. Optionally set a spending cap on the new OpenRouter key at openrouter.ai to limit blast radius of any future leak.

---

## Issue 2 — Billing Auth: Header Impersonation + Unauthenticated Admin (CRITICAL)

### Root Cause

`backend/billing-routes.js` `authenticateUser()` (lines 76–94) sets `req.userId` from whichever of these is present first: `x-user-id` header → `body.userId` → `query.userId`. There is no token verification. Any HTTP client can send `x-user-id: some-victim-uid` and fully impersonate that user.

The `/admin/credit` and `/admin/set-tier` endpoints are mounted under `router.use(authenticateUser)` — meaning they are "protected" only by this trivially-bypassable header check. No admin role is verified.

`backend/auth-guard.js` already provides the scaffolding (`softAuth`, `requireAdmin`) but it is not wired to `billing-routes.js`.

### Fix Options

**Option A (Recommended) — Firebase ID token verification in billing**  
Replace `authenticateUser` in `billing-routes.js` with a call to `firebase-admin`'s `auth().verifyIdToken(token)`. The client sends the Firebase JWT in the `Authorization: Bearer <token>` header (standard practice). The server rejects any request without a valid token. The `uid` is extracted from the verified token, not from a client-supplied header.

This is the approach `auth-service-hardened.js` already implements (`firebase-admin` is already a dependency). A shared `verifyFirebaseToken` middleware in `auth-guard.js` keeps it DRY.

**Option B — HMAC-signed session tokens (JWT, no Firebase)**  
Sign a JWT on login using `JWT_SECRET` (already in `.env.example`). Verify server-side on each request. No Firebase dependency. Trade-off: requires a proper login flow; Firebase is already wired in `auth-service-hardened.js`, so this is more work for less benefit.

**Option C — API key per user (simpler, less secure)**  
Issue a per-user opaque token on registration, stored hashed in the DB. Client sends it in a header. No external dependency. Trade-off: no expiry, no revocation granularity, weaker than signed tokens.

**Recommendation:** Option A. Firebase Admin SDK is already installed and used in `auth-service-hardened.js`. The hardened auth service can be imported and a single `verifyFirebaseToken` middleware added to `auth-guard.js`.

### What Changes

| File | Change |
|---|---|
| `backend/auth-guard.js` | Add `verifyFirebaseToken(req, res, next)`: calls `admin.auth().verifyIdToken(token)`, sets `req.userId = decodedToken.uid`, rejects with 401 on failure. Add `requireRole(role)` middleware that checks `req.customClaims?.role` for admin gating. |
| `backend/billing-routes.js` | Replace local `authenticateUser` with `require('./auth-guard').verifyFirebaseToken`. Remove the `x-user-id` / body / query fallback paths entirely. |
| `backend/billing-routes.js` (admin routes) | Add `requireAdmin` (from `auth-guard.js`) to `/admin/credit` and `/admin/set-tier` middleware chains. In production, `ADMIN_TOKEN` must be set and matched; in dev, the existing bypass (no token = allow) is preserved. |
| `backend/server-production.js` | Ensure `auth-service-hardened.js` initializes Firebase on startup (already conditional on env vars). |
| `backend/.env.example` | Add `REQUIRE_AUTH=true` and `ADMIN_TOKEN=<generate>` with instructions. |

### Rollout Note

`REQUIRE_AUTH` in `auth-guard.js` is already designed as a flip switch. Setting it to `true` in production `.env` enables hard enforcement without touching dev environments. This was the intentional design by PIKADON.

---

## Issue 3 — Code Execution Sandbox (HIGH)

### Root Cause

`backend/agent-engine.js` exposes two tools callable by agents and indirectly by user-supplied job payloads:

- `run_js` (line 534): uses Node.js `vm.runInContext` with a 5-second timeout. `vm` is not a security boundary — a determined attacker can escape `vm.createContext` using prototype pollution or `this.constructor.constructor` to access the real Node.js globals and call `require('child_process')`.
- `run_python` (line 557): writes the code to a temp file in `generated-output/` then calls `exec('python "<tmpFile>"', ...)`. This is full unsandboxed execution of arbitrary Python with no filesystem or network restrictions. The timeout is 10 seconds.

Both tools are listed with `agents: ['NEXUS','SHADDAI']` but there is no gate preventing a crafted job from invoking them.

### Sandbox Options

**Option A — isolated-vm (Recommended for JS)**  
Replace `vm.runInContext` with [`isolated-vm`](https://github.com/laverdet/isolated-vm) (`npm i isolated-vm`). `isolated-vm` creates a true V8 Isolate — a separate heap with no shared references to the host process. It supports memory limits, CPU timeout, and explicit copying of values in/out. This is the approach used by Cloudflare Workers and Deno's sandbox.

Trade-offs: native module (requires build tools), ~5ms startup per call, max ~128 MB memory per isolate. For the SHADDAI use case (short agent snippets, math, data transforms) this is perfectly adequate.

**Option B — Worker Threads with hard limits (JS fallback)**  
Run user code in a `worker_threads` Worker with a `resourceLimits` object (Node.js ≥ 12.16). Set `maxOldGenerationSizeMb`, `maxYoungGenerationSizeMb`, and kill the worker after a timeout. Not a true security boundary (workers share the same process address space), but prevents accidental infinite loops and OOM.

Trade-offs: code can still access the filesystem via `require('fs')` if not explicitly blocked; does not prevent a determined attacker from escaping.

**Option C — E2B / container sandbox (Python + JS, most secure)**  
Route `run_python` and `run_js` to [E2B](https://e2b.dev) (cloud microVMs) or a local Docker container (`docker run --rm --network none --memory 128m --cpus 0.5 python:3.11-slim python /dev/stdin`). Code runs in a fully isolated container with no access to the server's filesystem, env, or network.

Trade-offs: E2B has per-execution cost (~$0.001); Docker requires Docker on the server; adds ~200–500ms latency. Best security posture but highest operational cost.

**Recommendation:**
- **JS (`run_js`):** Use Option A (`isolated-vm`). It is the only JS option that provides a true security boundary and is a drop-in replacement.
- **Python (`run_python`):** Use Option C with Docker (`--network none`). If Docker is not available in production (e.g., Render free tier), disable `run_python` entirely and return a clear error message ("Python execution requires a self-hosted deployment"). Do not run arbitrary Python on a shared server process.
- Apply a **tool allowlist** in `agent-engine.js`: `run_js` and `run_python` should require an explicit `allow_code_execution: true` flag on the job, surfaced as a user-approval prompt in the UI before the job runs.

### What Changes

| File | Change |
|---|---|
| `backend/agent-engine.js` — `run_js` | Replace `vm.runInContext` with `isolated-vm` Isolate. Pass only allowed globals explicitly. Set `memoryLimit: 32` MB, `timeout: 5000`. |
| `backend/agent-engine.js` — `run_python` | Replace `exec('python ...')` with Docker spawn (`child_process.spawn('docker', ['run', '--rm', '--network', 'none', '--memory', '128m', '--cpus', '0.5', 'python:3.11-slim', 'python', '-c', code])`) or, if Docker absent, throw `{ error: 'Python sandbox unavailable — self-hosted deployment required' }`. |
| `backend/agent-engine.js` — tool invocation | Add a pre-execution check: if `tool.name` is in `['run_js', 'run_python']` and `job.allowCodeExecution !== true`, reject with a user-visible approval request. |
| `package.json` | Add `isolated-vm` as a dependency. |
| `backend/.env.example` | Add `CODE_SANDBOX_ENABLED=true` and `DOCKER_SANDBOX=false` flags with documentation. |

---

## Issue 4 — XSS via innerHTML (HIGH)

### Root Cause

`public/index.html` contains **555 `innerHTML` assignments** (the largest single file). The pattern `element.innerHTML = someAgentOrUserString` is pervasive. User-controlled strings that flow into `innerHTML` include:
- Agent personas (user-customizable)
- Marketplace listing names and descriptions
- Shop names and collectible names
- MoonPay intent rationales
- Any agent response that is rendered back to the dashboard

A stored-XSS payload (`<img src=x onerror="fetch('/api/billing/admin/credit',{method:'POST',...})">`) inserted into a marketplace listing would execute in the browser of any user who views that listing, and — until billing auth is fixed — could also grant the attacker credits directly.

### Fix Strategy

**Option A (Recommended) — Escape on render, validate on write**  
A two-part defense:

1. **Render-time escaping:** Create a global `esc(str)` utility in the frontend:
   ```js
   function esc(s) {
     const d = document.createElement('div');
     d.textContent = String(s ?? '');
     return d.innerHTML;
   }
   ```
   Audit every `innerHTML` assignment and replace with either:
   - `element.textContent = str` — for plain text with no markup intent (preferred)
   - `element.innerHTML = esc(str)` — for strings that need to coexist with surrounding HTML structure (e.g., wrapped in a `<span>`)

2. **Server-side sanitization:** In `billing-routes.js`, `agent-engine.js`, and any route that stores user-supplied strings (persona text, listing names, collectible names), strip HTML before persistence:
   - Install `dompurify` (server-side via `isomorphic-dompurify`) or write a simple strip-tags function: `str.replace(/<[^>]*>/g, '').slice(0, maxLength)`.
   - Validate field lengths at the API layer to prevent oversized payloads.

**Option B — Content Security Policy (CSP)**  
Add a strict `Content-Security-Policy` header via Helmet that blocks inline `<script>` execution (`script-src 'self'`). This prevents most XSS payloads from executing even if they are injected. Not a replacement for escaping, but a defense-in-depth layer that is easy to add.

`backend/.env.example` already has `HELMET_CSP_ENABLED=false`. Setting it to `true` and configuring the policy is low-effort.

**Option C — DOMPurify on the client**  
Load DOMPurify (CDN or bundled) and wrap every `innerHTML` assignment: `element.innerHTML = DOMPurify.sanitize(str)`. This allows rich HTML from trusted sources (e.g., agent-generated markdown) while stripping attack vectors.

**Recommendation:** Option A first (textContent + server-side strip), then Option B (CSP header) as defense-in-depth. Option C for any places where rich HTML is genuinely needed (agent response rendering). All three are compatible and should be layered.

### What Changes

| File | Change |
|---|---|
| `public/index.html` | Add `esc()` utility near top. Audit all `innerHTML` assignments: plain-text strings → `textContent`; structured renders → `innerHTML = esc(...)` or `DOMPurify.sanitize(...)`. Priority: agent names/personas, listing text, collectible names, MoonPay rationale fields. |
| `backend/billing-routes.js` | On POST `/customer`, `POST /subscribe`, `POST /upgrade`: strip HTML from `displayName`, `description`, and any free-text fields before they are stored. |
| `backend/agent-engine.js` | On agent persona input (custom agents): validate and strip HTML before storing in `customAgents`. |
| `backend/server-production.js` | Enable Helmet CSP with `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (the UI uses inline styles heavily — tighten later). Set `HELMET_CSP_ENABLED=true` in production `.env`. |
| `backend/.env.example` | Change `HELMET_CSP_ENABLED=false` to `HELMET_CSP_ENABLED=true` with a note that the policy string must be configured. |

---

## Issue 5 — Secret-Scan CI Gate

### Root Cause

The live OpenRouter key (`sk-or-v1-b826f3...`) is currently in the git commit history inside `public/index.html`. Without an automated gate, any future developer (or future version of an AI code assistant) can similarly commit a key by accident. The `.gitignore` already excludes `.env` files, but that doesn't protect against keys embedded in source files.

### Fix: Pre-commit Hook + CI Check

**Part A — Local pre-commit hook (`.git/hooks/pre-commit`)**

The hook scans staged files for known secret patterns before allowing a commit. Uses `git grep` or a simple shell pattern:

```
Patterns to block:
  sk-or-v1-          (OpenRouter)
  sk-ant-api         (Anthropic — not a placeholder like 'sk-ant-...')
  AIza[0-9A-Za-z-_]{35}   (Google/Firebase API keys)
  gsk_[a-zA-Z0-9]{52}     (Groq)
  AKIA[0-9A-Z]{16}         (AWS Access Key)
  ghp_[a-zA-Z0-9]{36}     (GitHub personal access token)
```

The hook should be installed automatically via an `npm prepare` script that copies the hook into `.git/hooks/`, or via a tool like `husky`.

**Part B — CI workflow (`.github/workflows/secret-scan.yml`)**

Runs on every push and pull request. Uses [`trufflehog`](https://github.com/trufflesecurity/trufflehog) or [`gitleaks`](https://github.com/gitleaks/gitleaks) to scan the full git history and staged diff. Fails the check if any high-entropy string or known pattern is found. Gitleaks is recommended: it has no external service dependency, ships as a single binary, and has first-class GitHub Actions support.

**Part C — `.gitleaks.toml` config in repo root**

Defines the patterns to match, plus allowlist rules for:
- `placeholder` attribute values (`placeholder="sk-ant-..."`) — these are not real keys
- `.env.example` lines that document key format (marked with `# example` comments)
- Test fixture files in `backend/test*` if they use mock keys

### What Changes

| File | Change |
|---|---|
| `.git/hooks/pre-commit` (or `scripts/pre-commit.sh`) | Shell script that greps staged diff for the secret patterns above. Exits 1 with a clear error message if found. |
| `package.json` | Add `"prepare": "node scripts/install-hooks.js"` (or use `husky`) so every `npm install` installs the hook. |
| `.github/workflows/secret-scan.yml` (new) | GitHub Actions workflow: on push + PR, run `gitleaks detect --source . --config .gitleaks.toml`. |
| `.gitleaks.toml` (new) | Gitleaks config with the patterns above + allowlist for placeholders and example files. |
| `public/index.html` | Remove line 27,805 (the hardcoded key assignment). This must happen before the CI gate is added or the CI will immediately fail. |

---

## Prioritized Rollout

### P0 — Must ship before any public URL is shared

1. **Rotate the OpenRouter key** at openrouter.ai (takes 2 minutes; assume it is already compromised).
2. **Remove line 27,805** from `public/index.html` — delete the `localStorage.setItem('shaddai_openrouter_key', 'sk-or-v1-...')` line. Replace browser LLM calls with `POST /api/llm/chat` proxy (Issue 1 fix).
3. **Wire `verifyFirebaseToken`** into `billing-routes.js` and add `requireAdmin` to `/admin/credit` and `/admin/set-tier` (Issue 2 fix). Set `REQUIRE_AUTH=true` and `ADMIN_TOKEN` in production `.env`.

### P1 — Must ship before any multi-user or paid launch

4. **XSS escaping** (Issue 4): add `esc()` utility, convert plain-text `innerHTML` calls to `textContent`, enable Helmet CSP. This is high-leverage: 1,664 `innerHTML` calls, real money on the line.
5. **Code execution sandbox** (Issue 3): replace `vm.runInContext` with `isolated-vm` for `run_js`; gate `run_python` behind Docker or disable it; add the `allow_code_execution` approval flag.
6. **Secret-scan CI** (Issue 5): add `.gitleaks.toml` + GitHub Actions workflow + pre-commit hook.

### P2 — Before real-money / MoonCard / auto-trading

7. Auth + role-gate `brains/*` and `moonpay/*` routes (PIKADON HIGH-1 from audit).
8. Append-only audit log for all money-movement events.
9. Spend caps + per-transaction approval UI for MoonCard / auto-buy.
10. Compliance disclaimers for agent auto-trading surfaces.

---

## Files Affected Summary

```
backend/
  auth-guard.js              ← add verifyFirebaseToken, requireRole
  billing-routes.js          ← replace authenticateUser; add requireAdmin to /admin/*
  llm-proxy-routes.js        ← NEW: POST /api/llm/chat server proxy
  server-production.js       ← mount llm-proxy-routes; enable Helmet CSP
  agent-engine.js            ← isolated-vm for run_js; Docker/disable for run_python; approval gate
  brains.js                  ← wire softAuth → verifyFirebaseToken when REQUIRE_AUTH=true
  moonpay-agent.js           ← add softAuth (verifyFirebaseToken) to all routes
  .env.example               ← add REQUIRE_AUTH, ADMIN_TOKEN, CODE_SANDBOX_ENABLED, DOCKER_SANDBOX

public/
  index.html                 ← remove line 27805; replace direct LLM fetch calls; add esc(); textContent for plain strings

root/
  .gitleaks.toml             ← NEW: secret scan config
  .github/workflows/secret-scan.yml  ← NEW: CI secret scan
  package.json               ← add isolated-vm dep; add prepare hook installer
  scripts/install-hooks.js   ← NEW: copies pre-commit hook on npm install
```
