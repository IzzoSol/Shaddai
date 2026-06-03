# Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SHADDAI base safe to open publicly — rotate/strip the leaked key, enforce auth on sensitive routes, isolate agent code-execution, escape user/agent data before the DOM, and collapse to one canonical build with a clean DEV/SHIP/GitHub/Obsidian backup topology.

**Architecture:** Backend is Express (`backend/server-production.js` mounts routers); frontend is one served monolith (`public/index.html`). Security primitives already exist in `backend/auth-guard.js` (softAuth / verifyFirebaseToken / requireAdmin) and in `index.html` (`sanitizeText`/`escH`) — this plan *wires them in*, adds a real JS sandbox, and removes leaked secrets. Backend changes are TDD (Jest + supertest). Frontend monolith + file moves use explicit manual verification (no frontend test harness exists).

**Tech Stack:** Node ≥18 (runtime v25), Express 4, Jest 29.7, supertest 6.3, isolated-vm (new), gitleaks CI.

**Working location:** `C:\Users\Brittany\Shaddai-clone` (DEV; git repo `IzzoIzzoIzzo/Shaddai`, branch `main`). All commands run from `backend/` unless noted.

---

## File Structure

- **Create** `backend/lib/sandbox.js` — single shared JS sandbox (isolated-vm). One responsibility: run untrusted JS, return `{success, output[], error}`.
- **Create** `backend/tests/sandbox.test.js` — sandbox unit tests.
- **Create** `backend/tests/auth-guard.test.js` — auth middleware unit tests.
- **Create** `backend/tests/api-proxy-auth.test.js` — router-level auth integration tests (supertest).
- **Modify** `backend/agent-engine.js` — `run_js` calls `sandbox.runSandboxedJs`.
- **Modify** `backend/api-proxy-routes.js` — require auth-guard; protect routes; `/execute-code` uses shared sandbox.
- **Modify** `backend/server-production.js` — protect `/api/agents/task`, `/api/agents/:agentName/invoke/:skillName`.
- **Modify** `backend/moonpay-agent.js` — add `verifyFirebaseToken` to `/intent` and `/pay-agent`.
- **Modify** `public/index.html` — apply `sanitizeText()` to the 3 MoonPay sinks (lines ~4200/4220/4224) + agent/task/receipt render sinks.
- **Modify** `.gitleaks.toml` — ensure stray builds can't reintroduce a real key.
- **Delete** `public/shaddai.html` (real key) + **move** other stray `*.html` → `archive/`.
- **Create** `ship/SHADDAI-latest.html`, `ship/SHADDAI-prev.html` — keyless ship snapshots.
- **Modify** `SHADDAI_BUILD_STATUS.md` — document topology; mirror to Obsidian.

---

## Task 0: Branch + verify test harness

**Files:** none (setup)

- [ ] **Step 1: Create the feature branch**

```bash
cd "C:/Users/Brittany/Shaddai-clone"
git checkout -b foundation-hardening
```

- [ ] **Step 2: Install backend deps (jest/supertest/isolated-vm attempt happens in Task 3)**

```bash
cd backend
npm install
```
Expected: completes; `node_modules/` populated. (isolated-vm NOT yet added.)

- [ ] **Step 3: Confirm Jest runs the existing suite**

Run: `npm test -- workflow-security.test.js`
Expected: Jest executes; existing security tests pass (or run). Confirms harness works before we add tests.

- [ ] **Step 4: Commit nothing yet** — proceed to Task 1.

---

## Task 1: Secret remediation (PIKADON)

**Files:**
- Delete: `public/shaddai.html`
- Modify: `.gitleaks.toml`

- [ ] **Step 1: Find every REAL key occurrence (full-length)**

Run from repo root:
```bash
cd "C:/Users/Brittany/Shaddai-clone"
git grep -n "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"
```
Expected: lists the exact files containing the **real** key (recon found `public/shaddai.html:20834`). Record the full list — every file listed here must be deleted or scrubbed.

- [ ] **Step 2: OWNER ACTION — rotate the key (checkpoint, cannot be automated)**

Tell the owner to do this now, in this order:
1. Go to https://openrouter.ai/keys → find the key starting `sk-or-v1-b826f312…` → **Revoke/Delete** it.
2. **Create a new key.** Copy it.
3. Put the new key in `backend/.env` as `OPENROUTER_API_KEY=...` (DEV) and in the Render dashboard env (prod). Never in any `.html` or committed file.

Do not proceed until the owner confirms the old key is revoked. (Once revoked, the copies in git history are dead — no history rewrite needed.)

- [ ] **Step 3: Delete the real-key build file(s)**

```bash
git rm public/shaddai.html
# plus any OTHER file from Step 1 that held the full real key:
# git rm <path>
```
(These old builds are preserved in git history and in the Desktop copy; deletion is safe.)

- [ ] **Step 4: Tighten `.gitleaks.toml` so stray builds can't reintroduce a real key**

In `.gitleaks.toml`, the `[allowlist]` `paths` (lines 71–89) must NOT broadly allowlist `public/*.html`. Leave `public/` OUT of the allowlist so any future real key in a build fails CI. (Placeholder strings like the literal `sk-or-v1-...` truncated form are too short to match the full-length rule, so they won't false-positive.) Add a regex allowlist entry only for the exact truncated placeholder if CI flags it:

```toml
# inside [allowlist], add ONLY if a scan false-positives on the short placeholder:
regexes = [
  '''sk-or-v1-\.\.\.''',
]
```

- [ ] **Step 5: Run gitleaks locally to confirm clean working tree**

```bash
cd "C:/Users/Brittany/Shaddai-clone"
gitleaks detect --source . --config .gitleaks.toml --redact --verbose --no-git
```
Expected: `no leaks found` for the working tree. (If gitleaks isn't installed locally, this is verified by the CI on push in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "security: remove leaked-key build file + tighten gitleaks (key rotated at openrouter)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Shared JS sandbox module (isolated-vm) — TDD

**Files:**
- Create: `backend/lib/sandbox.js`
- Test: `backend/tests/sandbox.test.js`

- [ ] **Step 1: Attempt to install isolated-vm (decision checkpoint)**

```bash
cd backend
npm install isolated-vm@^5
```
- **If it builds** → continue with this task (isolated-vm path).
- **If the native build FAILS** (no C++ toolchain / Node v25 unsupported) → STOP this task and do **Task 2B** instead, then skip to Task 3. Do not pretend a non-isolating fallback is secure.

- [ ] **Step 2: Write the failing test**

Create `backend/tests/sandbox.test.js`:
```javascript
const { runSandboxedJs } = require('../lib/sandbox');

describe('runSandboxedJs', () => {
  test('captures console output and returns success', async () => {
    const r = await runSandboxedJs('console.log("hello", 1 + 2);');
    expect(r.success).toBe(true);
    expect(r.output.join('\n')).toContain('hello 3');
    expect(r.error).toBeNull();
  });

  test('blocks access to require/process (no host escape)', async () => {
    const r = await runSandboxedJs('console.log(typeof require, typeof process);');
    expect(r.success).toBe(true);
    expect(r.output.join('\n')).toContain('undefined undefined');
  });

  test('cannot reach Node globals via constructor tricks', async () => {
    const r = await runSandboxedJs('this.constructor.constructor("return process")()');
    // either throws inside the isolate or returns undefined process — never the host process
    expect(r.success === false || !r.output.join('').includes('[object process]')).toBe(true);
  });

  test('enforces a timeout on infinite loops', async () => {
    const r = await runSandboxedJs('while(true){}', { timeoutMs: 500 });
    expect(r.success).toBe(false);
    expect(String(r.error)).toMatch(/time|exceed/i);
  });

  test('rejects oversized code', async () => {
    const r = await runSandboxedJs('x'.repeat(10001));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/≤ 10000|too long|10000/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- sandbox.test.js`
Expected: FAIL — `Cannot find module '../lib/sandbox'`.

- [ ] **Step 4: Implement the sandbox**

Create `backend/lib/sandbox.js`:
```javascript
'use strict';
const ivm = require('isolated-vm');

const MAX_CODE_LENGTH = 10000;

/**
 * Run untrusted JavaScript in a true V8 isolate.
 * @returns {Promise<{success:boolean, output:string[], error:string|null}>}
 */
async function runSandboxedJs(code, { timeoutMs = 3000, memoryMb = 32 } = {}) {
  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) {
    return { success: false, output: [], error: `code must be a string ≤ ${MAX_CODE_LENGTH} characters` };
  }
  const output = [];
  const isolate = new ivm.Isolate({ memoryLimit: memoryMb });
  try {
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set('global', jail.derefInto());
    // Host log bridge — the only capability exposed to the isolate.
    await jail.set('_log', new ivm.Reference((line) => { output.push(String(line)); }));
    const bootstrap = `
      const console = {
        log:   (...a) => _log.applyIgnored(undefined, [a.map(String).join(' ')]),
        error: (...a) => _log.applyIgnored(undefined, ['ERR: '  + a.map(String).join(' ')]),
        warn:  (...a) => _log.applyIgnored(undefined, ['WARN: ' + a.map(String).join(' ')]),
      };
    `;
    const script = await isolate.compileScript(bootstrap + '\n' + code);
    await script.run(context, { timeout: timeoutMs });
    return { success: true, output, error: null };
  } catch (e) {
    return { success: false, output, error: e.message };
  } finally {
    isolate.dispose();
  }
}

module.exports = { runSandboxedJs, MAX_CODE_LENGTH };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- sandbox.test.js`
Expected: PASS (all 5).

- [ ] **Step 6: Commit**

```bash
git add backend/lib/sandbox.js backend/tests/sandbox.test.js backend/package.json backend/package-lock.json
git commit -m "feat(security): real V8 isolate sandbox (isolated-vm) for untrusted JS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2B: FALLBACK — gate code-exec behind admin (ONLY if isolated-vm won't build)

**Files:**
- Create: `backend/lib/sandbox.js`
- Test: `backend/tests/sandbox.test.js`

Use this *instead of* Task 2 when isolated-vm fails to compile. Honest posture: keep the hardened `vm` for non-destructive use but treat code-exec as admin-only until a container runner lands (logged as a Sub-Project 5 follow-up).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/sandbox.test.js`:
```javascript
const { runSandboxedJs } = require('../lib/sandbox');

describe('runSandboxedJs (vm fallback)', () => {
  test('captures console output', async () => {
    const r = await runSandboxedJs('console.log("hi", 2+2)');
    expect(r.success).toBe(true);
    expect(r.output.join(' ')).toContain('hi 4');
  });
  test('no require/process in scope', async () => {
    const r = await runSandboxedJs('console.log(typeof require, typeof process)');
    expect(r.output.join(' ')).toContain('undefined undefined');
  });
  test('times out', async () => {
    const r = await runSandboxedJs('while(true){}', { timeoutMs: 400 });
    expect(r.success).toBe(false);
  });
  test('rejects oversized code', async () => {
    const r = await runSandboxedJs('x'.repeat(10001));
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- sandbox.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement vm-based fallback**

Create `backend/lib/sandbox.js`:
```javascript
'use strict';
const vm = require('vm');
const MAX_CODE_LENGTH = 10000;

// NOTE: vm is NOT a hard security boundary. Callers MUST gate this behind
// requireAdmin until a container/isolate runner replaces it (Sub-Project 5).
async function runSandboxedJs(code, { timeoutMs = 3000 } = {}) {
  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) {
    return { success: false, output: [], error: `code must be a string ≤ ${MAX_CODE_LENGTH} characters` };
  }
  const output = [];
  const sandbox = Object.create(null);
  sandbox.Math = Math; sandbox.JSON = JSON;
  sandbox.parseInt = parseInt; sandbox.parseFloat = parseFloat;
  sandbox.isNaN = isNaN; sandbox.isFinite = isFinite;
  sandbox.console = Object.freeze({
    log:   (...a) => output.push(a.map(String).join(' ')),
    error: (...a) => output.push('ERR: '  + a.map(String).join(' ')),
    warn:  (...a) => output.push('WARN: ' + a.map(String).join(' ')),
  });
  try {
    vm.runInNewContext(code, sandbox, { timeout: timeoutMs });
    return { success: true, output, error: null };
  } catch (e) {
    return { success: false, output, error: e.message };
  }
}
module.exports = { runSandboxedJs, MAX_CODE_LENGTH, IS_HARD_ISOLATE: false };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- sandbox.test.js` → PASS.

- [ ] **Step 5: Record the follow-up** — add a line to `SHADDAI_REMAINING_WORK.md`: "Code-exec uses vm fallback (admin-gated); replace with container/isolate runner before opening code-exec to non-admins." Commit.

```bash
git add backend/lib/sandbox.js backend/tests/sandbox.test.js SHADDAI_REMAINING_WORK.md
git commit -m "feat(security): sandbox module (vm fallback, admin-gated) + follow-up note

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Wire both code-exec call sites to the shared sandbox

**Files:**
- Modify: `backend/agent-engine.js:534-576` (`run_js`)
- Modify: `backend/api-proxy-routes.js:2208-2257` (`/execute-code` JS branch)

- [ ] **Step 1: Update `run_js` in agent-engine.js**

At top of file ensure the require exists (after line 10 `const vm = require('vm');`, keep vm for `calculate`):
```javascript
const { runSandboxedJs } = require('./lib/sandbox');
```
Replace the body of `run_js.execute` (the `MAX_CODE_LENGTH`/sandbox/`vm.runInNewContext` block, lines ~545-574) with:
```javascript
  async execute({ code }) {
    const r = await runSandboxedJs(code, { timeoutMs: 3000 });
    return JSON.stringify(r); // { success, output[], error } — unchanged shape
  }
```
This preserves the exact return shape skill-executor.js expects (`{success, output[], error}` parsed from `r.result`).

- [ ] **Step 2: Update `/execute-code` JS branch in api-proxy-routes.js**

In the `if (language === 'javascript')` branch (lines ~2227-2243), replace the local `const vm = require('vm'); ... script.runInContext(...)` block with:
```javascript
  if (language === 'javascript') {
    const { runSandboxedJs } = require('./lib/sandbox');
    const r = await runSandboxedJs(code, { timeoutMs: 5000 });
    return res.json({
      status: r.success ? 'ok' : 'error',
      language,
      output: (r.success ? r.output.join('\n') : r.error).substring(0, 3000) || '(no output)'
    });
  }
```
Keep the existing rate-limit, length check, and danger-pattern blocklist above it (defense in depth).

- [ ] **Step 3: Manual verification (agent tool)**

Run the backend (`npm start` from backend/) and exercise run_js via the existing E2E harness:
Run: `node tests/run-agent.js` (or curl `/api/agents/task` with a task that calls run_js) and confirm output returns and an escape attempt (`process`) yields `undefined`/error.
Expected: normal code returns output; `require`/`process` unavailable.

- [ ] **Step 4: Run the full backend suite (no regressions)**

Run: `npm test`
Expected: sandbox tests pass; existing suite still green.

- [ ] **Step 5: Commit**

```bash
git add backend/agent-engine.js backend/api-proxy-routes.js
git commit -m "refactor(security): route run_js + /execute-code through shared sandbox

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Enforce auth on sensitive routes — TDD

**Files:**
- Test: `backend/tests/auth-guard.test.js`
- Test: `backend/tests/api-proxy-auth.test.js`
- Modify: `backend/api-proxy-routes.js` (require auth-guard; protect routes)
- Modify: `backend/server-production.js:727, :1255`
- Modify: `backend/moonpay-agent.js:56, :109`

- [ ] **Step 1: Write failing unit tests for the guards**

Create `backend/tests/auth-guard.test.js`:
```javascript
const { softAuth, requireAdmin } = require('../auth-guard');

function mockRes() {
  return { code: null, body: null,
    status(c){ this.code = c; return this; },
    json(b){ this.body = b; return this; } };
}

describe('softAuth', () => {
  afterEach(() => { delete process.env.REQUIRE_AUTH; });

  test('passes through in dev (REQUIRE_AUTH unset), sets userId=local', () => {
    const req = { headers: {} }; const res = mockRes(); let called = false;
    softAuth(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.userId).toBe('local');
  });

  test('rejects with 401 when REQUIRE_AUTH=true and no uid', () => {
    process.env.REQUIRE_AUTH = 'true';
    const req = { headers: {} }; const res = mockRes(); let called = false;
    softAuth(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.code).toBe(401);
  });

  test('accepts x-user-id header when REQUIRE_AUTH=true', () => {
    process.env.REQUIRE_AUTH = 'true';
    const req = { headers: { 'x-user-id': 'u123' } }; const res = mockRes(); let called = false;
    softAuth(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.userId).toBe('u123');
  });
});

describe('requireAdmin', () => {
  afterEach(() => { delete process.env.ADMIN_TOKEN; });

  test('passes through when ADMIN_TOKEN unset (dev)', () => {
    const req = { headers: {} }; const res = mockRes(); let called = false;
    requireAdmin(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  test('403 when ADMIN_TOKEN set and header missing/wrong', () => {
    process.env.ADMIN_TOKEN = 'secret';
    const req = { headers: { 'x-shaddai-admin': 'wrong' } }; const res = mockRes(); let called = false;
    requireAdmin(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.code).toBe(403);
  });

  test('passes when ADMIN_TOKEN set and header matches', () => {
    process.env.ADMIN_TOKEN = 'secret';
    const req = { headers: { 'x-shaddai-admin': 'secret' } }; const res = mockRes(); let called = false;
    requireAdmin(req, res, () => { called = true; });
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails/passes against real guards**

Run: `npm test -- auth-guard.test.js`
Expected: PASS (these guards already exist in `auth-guard.js`; this test pins their contract before we depend on it). If any fail, fix the test to match `auth-guard.js` actual behavior — do not change the guard.

- [ ] **Step 3: Write failing integration test for api-proxy protected routes**

Create `backend/tests/api-proxy-auth.test.js`:
```javascript
const express = require('supertest');
const app = require('express')();

// Build a minimal app mounting ONLY the proxy router, like server-production does.
beforeAll(() => {
  app.use(require('express').json());
  app.use('/api', require('../api-proxy-routes'));
});

describe('api-proxy auth (REQUIRE_AUTH=true)', () => {
  beforeAll(() => { process.env.REQUIRE_AUTH = 'true'; });
  afterAll(() => { delete process.env.REQUIRE_AUTH; });

  test('DELETE custom skill without auth → 401', async () => {
    const res = await express(app).delete('/api/shaddai/skills/custom/abc');
    expect(res.status).toBe(401);
  });

  test('DELETE custom skill with x-user-id → not 401', async () => {
    const res = await express(app)
      .delete('/api/shaddai/skills/custom/abc')
      .set('x-user-id', 'u1');
    expect(res.status).not.toBe(401);
  });

  test('POST /execute-code without auth → 401', async () => {
    const res = await express(app).post('/api/execute-code').send({ code: '1+1' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -- api-proxy-auth.test.js`
Expected: FAIL — routes currently return 200/4xx-non-401 (no auth wired yet).

- [ ] **Step 5: Wire auth into api-proxy-routes.js**

Near the top of `backend/api-proxy-routes.js` (with the other requires), add:
```javascript
const { softAuth, requireAdmin } = require('./auth-guard');
```
Immediately after the router is created (`const router = express.Router();`), add a router-wide soft auth:
```javascript
router.use(softAuth); // dev-permissive; enforces when REQUIRE_AUTH=true
```
Then gate the dangerous ops by inserting `requireAdmin` as middleware on these existing routes:
- `router.delete('/shaddai/skills/custom/:id', requireAdmin, (req, res) => { ... })` (line ~1174)
- `router.delete('/skill-packs/installed/:user/:pack_id', requireAdmin, (req, res) => { ... })` (line ~1244)
- `router.post('/execute-code', requireAdmin, async (req, res) => { ... })` (line ~2208)

- [ ] **Step 6: Run integration test to verify it passes**

Run: `npm test -- api-proxy-auth.test.js`
Expected: PASS (401 without auth; not-401 with header; execute-code 401 without auth).

- [ ] **Step 7: Protect the server-production app routes + moonpay (manual-verified)**

In `backend/server-production.js`, add near the top requires:
```javascript
const { softAuth, requireAdmin } = require('./auth-guard');
```
Add `softAuth` middleware to the two routes:
- `app.post('/api/agents/task', softAuth, async (req, res) => { ... })` (line ~727)
- `app.post('/api/agents/:agentName/invoke/:skillName', softAuth, async (req, res) => { ... })` (line ~1255)

In `backend/moonpay-agent.js`, line 16 currently: `const { rateLimit, requireAdmin } = require('./auth-guard');` → change to include `verifyFirebaseToken`:
```javascript
const { rateLimit, requireAdmin, verifyFirebaseToken } = require('./auth-guard');
```
Add `verifyFirebaseToken` to the two routes:
- `router.post('/intent', verifyFirebaseToken, json, (req, res) => { ... })` (line ~56)
- `router.post('/pay-agent', verifyFirebaseToken, json, (req, res) => { ... })` (line ~109)

- [ ] **Step 8: Manual verification with the server running**

Start backend with auth on: set `REQUIRE_AUTH=true` in `backend/.env`, `npm start`. Then:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/agents/task -H "Content-Type: application/json" -d "{}"
```
Expected: `401`. Repeat with `-H "x-user-id: u1"` → expect non-401 (400 missing fields is fine). Then unset `REQUIRE_AUTH` for normal dev.

- [ ] **Step 9: Full suite + commit**

Run: `npm test`  (all green)
```bash
git add backend/tests/auth-guard.test.js backend/tests/api-proxy-auth.test.js backend/api-proxy-routes.js backend/server-production.js backend/moonpay-agent.js
git commit -m "feat(security): enforce auth on agent/skill/exec/moonpay routes (dev-permissive, prod-enforced)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Escape user/agent data before the DOM (XSS)

**Files:**
- Modify: `public/index.html` (lines ~4200, ~4220, ~4224, then the agent/task/receipt sinks)

No frontend test harness exists; verification is manual with an XSS probe. `sanitizeText()` (line 12089) is a hoisted function declaration, callable anywhere.

- [ ] **Step 1: Fix the 3 MoonPay sinks**

At line ~4200, wrap each interpolated field in `sanitizeText(...)`:
```javascript
el.innerHTML = r.intents.map(function(i){
  return '<div style="border-bottom:1px solid var(--border);padding:5px 0"><b style="color:#14d27a">'
    + sanitizeText(i.agent) + '</b> ' + sanitizeText(i.action) + ' ' + sanitizeText(i.amount) + ' '
    + sanitizeText(i.fromToken) + '→' + sanitizeText(i.toToken)
    + ' <span style="color:' + (i.paper?'#a78bfa':'#ffd84d') + '">[' + (i.paper?'paper':'live') + ']</span>'
    + '<br><code style="font-size:8px;word-break:break-all">' + sanitizeText(i.cliCommand) + '</code></div>';
}).join('');
```
At line ~4220:
```javascript
res.innerHTML = '<b style="color:#14d27a">CLI command to run locally:</b><br>'
  + '<code style="word-break:break-all;font-size:9px">' + sanitizeText(r.cliCommand) + '</code><br>'
  + '<span style="color:var(--text-muted);font-size:8px">Copy and run this in your terminal. Payment will be signed locally by your wallet.</span>';
```
At line ~4224:
```javascript
res.innerHTML = '<span style="color:#ff6b6b">Error: ' + sanitizeText(r.error || 'Unknown error') + '</span>';
```

- [ ] **Step 2: Sweep the high-risk agent/task/receipt sinks**

Apply `sanitizeText()` to interpolated variables in these render sites (from recon): lines ~5354 (agent label/brain), ~14887 (agent name/color in `S.agents.map`), ~14984 (`receipts.map` r.id/r.apis/r.task), ~15034, ~15724 (agent profile), ~15815 (`tasks.map` t.name/t.desc/t.agent), ~15953 (`projects.map`), ~20920 (search results), ~21901 (recs). For each: wrap only the *data* variables, not the static HTML/style strings. Leave `onclick="pickAgent('...')"`-style handlers using `encodeURIComponent`/`sanitizeText` on the embedded value.

- [ ] **Step 3: Manual XSS probe**

Start backend, open the app, trigger a MoonPay intent with an `action` value of `<img src=x onerror=alert(1)>` (via the UI form or a crafted `/api/moonpay/intent` body). 
Expected: the text renders **literally** (escaped) and **no alert fires**. Repeat for an agent/custom-agent name containing `<script>`.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "security(xss): escape agent/user data via sanitizeText in MoonPay + agent/task render sinks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Canonical build + ship/ + archive/ + docs

**Files:**
- Move: stray `*.html` → `archive/`
- Create: `ship/SHADDAI-latest.html`
- Modify: `SHADDAI_BUILD_STATUS.md`

- [ ] **Step 1: Create folders and archive strays (keep only the served build)**

```bash
cd "C:/Users/Brittany/Shaddai-clone"
mkdir -p archive ship
git mv FINAL-SHADDAI-79.9.html FINAL-SHADDAI-V80.html FINAL-SHADDAI-V80-MCPO.html SHADDAI-V80-CLEAN.html SHADDAI-Collectables.html SHADDAI_PIKADON_AGENT_DASHBOARD.html TURTLE_VIDEO_SKILL_UI.html archive/ 2>/dev/null || true
git mv public/FINAL-SHADDAI-73.34.html public/FINAL-SHADDAI-73.37.html public/index-enhanced.html archive/ 2>/dev/null || true
```
Leave in `public/`: `index.html` (served), `marketplace-shop.html`, `SHADDAI-Collectables.html`, `simple-chat.html` if they are linked sub-pages (verify they're referenced before moving — if unreferenced, archive them too).

- [ ] **Step 2: Verify nothing key-bearing remains outside archive, and archive has no REAL key**

```bash
git grep -n "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"
```
Expected: **no matches** (the only real-key file was deleted in Task 1). If a match appears in `archive/`, `git rm` that file too.

- [ ] **Step 3: Capture the first keyless ship snapshot**

```bash
cp public/index.html ship/SHADDAI-latest.html
```
(`public/index.html` is keyless. On each future ship: `mv ship/SHADDAI-latest.html ship/SHADDAI-prev.html` then copy the new build to `SHADDAI-latest.html` — keep only those two.)

- [ ] **Step 4: Confirm the server still serves index.html**

Run: `cd backend && npm start`, open `http://localhost:3000/` → app loads. `archive/` is outside `public/` so it is not routable.

- [ ] **Step 5: Document the topology**

Append to `SHADDAI_BUILD_STATUS.md` a "Build & backup topology" section: DEV = repo + `backend/.env`; SHIP = `ship/` (2 keyless snapshots); GitHub = private repo (`.env` gitignored, secret-scan CI); Render = keys in dashboard; Obsidian = docs mirror. State that `public/index.html` is the single served build and `archive/` holds retired builds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(build): one canonical served build; archive strays; add ship/ snapshots + topology docs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Full verification, Obsidian mirror, push

**Files:** none (verification + sync)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all suites green (sandbox, auth-guard, api-proxy-auth, existing workflow-security).

- [ ] **Step 2: Run the tool audit (no regressions)**

Run: `node scripts/tool-audit.js` (from repo root or as documented in package.json)
Expected: tools still pass (135/135 baseline minus key-gated).

- [ ] **Step 3: Verify the six spec success criteria explicitly**

- gitleaks clean: `gitleaks detect --source . --config .gitleaks.toml --redact --no-git` → no leaks.
- auth: `curl` the protected routes with `REQUIRE_AUTH=true` → 401 without creds (Task 4 Step 8).
- sandbox: rerun `npm test -- sandbox.test.js` → escape/timeout tests pass.
- xss: rerun the Task 5 Step 3 probe → payload inert.
- one build: only `public/index.html` served; `archive/` not routable.
- DEV runs locally with keys; `ship/SHADDAI-latest.html` exists and is keyless.

- [ ] **Step 4: Mirror docs to Obsidian**

Copy `docs/superpowers/specs/2026-06-03-foundation-hardening-design.md`, this plan, and the updated `SHADDAI_BUILD_STATUS.md` into the Obsidian SHADDAI folder (`C:\Users\Brittany\OneDrive\Desktop\OBSIDIAN\SHADDAI OBSIDIAN\...`). Confirm copies land.

- [ ] **Step 5: Push the branch (secret-scan CI is the final gate)**

```bash
cd "C:/Users/Brittany/Shaddai-clone"
git push -u origin foundation-hardening
```
Expected: GitHub Actions `secret-scan` runs and passes (green). If it fails, it found a key — stop and remediate before merging.

- [ ] **Step 6: Open PR / merge to main** (owner's call — follow `superpowers:finishing-a-development-branch`).

---

## Self-Review (completed against the spec)

- **Spec coverage:** Secret remediation → Task 1; Auth enforcement → Task 4; Code-exec sandbox → Tasks 2/2B/3; XSS → Task 5; Canonical build + ship/backup topology → Task 6; Verification → Task 7. All six spec components mapped. ✔
- **Decisions honored:** (A) no git-history rewrite — Task 1 relies on rotation; (B) isolated-vm primary with explicit fallback — Tasks 2/2B. ✔
- **Type/shape consistency:** `runSandboxedJs(code, opts) → {success, output[], error}` defined in Task 2 and consumed unchanged in Task 3; `run_js` keeps its `{success, output[], error}` JSON contract used by `skill-executor.js`. ✔
- **Placeholders:** none — every code/command step is concrete. Frontend/file-move steps use explicit manual probes because no frontend test harness exists (called out, not hidden). ✔
