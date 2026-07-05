# SHADDAI Revenue-Ready Beta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the built-but-not-wired monetization surfaces into a launchable beta that can actually take money end-to-end without losing data.

**Architecture:** Node/Express backend serving a large single-file `public/index.html` dashboard. Payments run through an existing Solana Pay layer (`/api/pay/create` + on-chain verify `/api/pay/status/:reference`) and an off-chain x402 credit ledger. Agents run BYOK (each user's own free key) with the owner's Groq key as server fallback. This plan wires the Bazaar Buy UI, protects the shared key, adds lightweight identity so purchases have an owner, and makes the whitepaper the public front door.

**Tech Stack:** Node.js, Express, vanilla JS modules (IIFE), JSON file persistence (atomic writes), Solana Pay (`@solana/pay`), Groq/OpenRouter/Ollama LLMs.

**Checkpoints:** This dir isn't git-initialized, so each task ends with a timestamped backup into `_backups/<ts>/` instead of a commit. If the owner later runs `git init`, swap backups for commits.

---

### Task 1: Payment smoke-test harness (verify the rails before wiring UI)

**Files:**
- Create: `backend/scripts/pay-smoke.js`

- [ ] **Step 1: Write the smoke script**

```js
// backend/scripts/pay-smoke.js — verifies the Solana Pay + bazaar purchase rails.
const http = require('http');
function post(path, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: 'localhost', port: 3000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d }));
    });
    req.on('error', rej); req.write(data); req.end();
  });
}
(async () => {
  const pay = await post('/api/pay/create', { item: 'SMOKE', amount: 0.01, currency: 'SOL', label: 'Smoke', message: 'test' });
  console.log('PAY /api/pay/create ->', pay.status, pay.body.slice(0, 200));
  const buy = await post('/api/bazaar/purchase', { itemId: 'nonexistent_item', method: 'credits', buyer: 'smoke' });
  console.log('BUY /api/bazaar/purchase ->', buy.status, buy.body.slice(0, 200));
})();
```

- [ ] **Step 2: Run it to see current state**

Run: `node backend/scripts/pay-smoke.js`
Expected (before merchant wallet set): PAY prints `503 ...SHADDAI_MERCHANT_WALLET not set...`; BUY prints a 4xx with a clear "item not found" style message. **Both should be clean JSON, never a 500 stacktrace.** If either 500s, fix that route's error handling first.

- [ ] **Step 3: Set the merchant wallet (owner action)**

Add to `.env`: `SHADDAI_MERCHANT_WALLET=<owner Solana address>`. Restart server: kill PID on :3000, then `node backend/server-production.js`.

- [ ] **Step 4: Re-run to verify payments generate**

Run: `node backend/scripts/pay-smoke.js`
Expected: PAY now prints `200` with a body containing `"url":"solana:..."` and a `"reference"`. This proves real Solana Pay URLs generate.

- [ ] **Step 5: Backup checkpoint**

```bash
TS=$(date +%Y%m%d-%H%M%S); mkdir -p "_backups/$TS"; cp backend/scripts/pay-smoke.js "_backups/$TS/"
```

---

### Task 2: Wire Bazaar Buy buttons into the Bazaar + Collectables UI

**Files:**
- Modify: `public/marketplace-shop-v2.html` (the redesigned Bazaar) — add `data-buy-item` + include `bazaar-buy.js/css`
- Modify: `public/SHADDAI-Collectables.html` — same treatment on each collectable card

**Context:** `public/bazaar-buy.js` already exposes `window.SHADDAI_BAZAAR_BUY` and auto-wires any element with `[data-buy-item="ID"]`. Item IDs resolve by convention: `bz_…` (bazaar), numeric/`col_…` (collectible), `forge_…`/`op_…` (operative).

- [ ] **Step 1: Include the buy module in the Bazaar page**

In `public/marketplace-shop-v2.html`, immediately before `</body>`, add:

```html
<link rel="stylesheet" href="/bazaar-buy.css">
<script defer src="/bazaar-buy.js"></script>
```

- [ ] **Step 2: Add a Buy button to each Bazaar item card**

Find where each shop item card is rendered (search the file for the item card template). Inside each card, add a buy control bound to that item's id:

```html
<button class="bzbuy-btn" data-buy-item="ITEM_ID_HERE" data-buy-method="credits">Buy</button>
```

Replace `ITEM_ID_HERE` with the card's real id variable in the template string (e.g. `${item.id}`).

- [ ] **Step 3: Repeat for Collectables**

In `public/SHADDAI-Collectables.html`, add the same include lines before `</body>`, and add `<button class="bzbuy-btn" data-buy-item="${c.id}" data-buy-method="credits">Buy</button>` into each collectable card template.

- [ ] **Step 4: Verify the buttons wire + call the endpoint**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/marketplace-shop-v2.html` (expect 200). Then open `http://localhost:3000/marketplace-shop-v2.html` in the browser, click a Buy button on a real listed item, and confirm the bazaar-buy payment panel appears (credits settle instantly; SOL shows a pay link). Expected: no console errors; a real `/api/bazaar/purchase` request in the Network tab.

- [ ] **Step 5: Backup checkpoint**

```bash
TS=$(date +%Y%m%d-%H%M%S); mkdir -p "_backups/$TS"; cp public/marketplace-shop-v2.html public/SHADDAI-Collectables.html "_backups/$TS/"
```

---

### Task 3: Protect the shared server key with a daily cap

**Files:**
- Modify: `backend/brains.js` (the key-resolution + call path)

**Context:** `.env` already has `SHARED_KEY_DAILY_LIMIT=200`. Without enforcement, a tester who skips BYOK drains the owner's Groq key. Cap only applies when the request uses the SERVER key (no user BYOK key present).

- [ ] **Step 1: Add an in-memory daily counter near the top of brains.js**

After the existing requires/consts in `backend/brains.js`, add:

```js
// --- Shared-key daily usage cap (protects the owner's fallback key) ---
const SHARED_KEY_DAILY_LIMIT = parseInt(process.env.SHARED_KEY_DAILY_LIMIT || '0', 10);
let _sharedKeyDay = new Date().toISOString().slice(0, 10);
let _sharedKeyCount = 0;
function sharedKeyAllowed() {
  if (!SHARED_KEY_DAILY_LIMIT) return true; // 0/unset = no cap
  const today = new Date().toISOString().slice(0, 10);
  if (today !== _sharedKeyDay) { _sharedKeyDay = today; _sharedKeyCount = 0; }
  if (_sharedKeyCount >= SHARED_KEY_DAILY_LIMIT) return false;
  _sharedKeyCount++;
  return true;
}
```

- [ ] **Step 2: Enforce it where the effective key is chosen**

In the agent-engine key resolution (`backend/agent-engine.js` around the `_bGroq = getBYOKKey('groq') || GROQ_KEY` block), guard the fallback: if the user has NO BYOK key and the shared cap is hit, throw a clear error before calling Groq. Add right after the `_bGroq` line:

```js
// If we're about to use the SHARED server key (no user BYOK) and the daily cap is hit, stop.
try {
  const brains = require('./brains');
  if (!getBYOKKey('groq') && GROQ_KEY && typeof brains.sharedKeyAllowed === 'function' && !brains.sharedKeyAllowed()) {
    throw new Error('Shared demo key limit reached for today — add your own free Groq key (Power Up) to keep going.');
  }
} catch (e) { if (/Shared demo key limit/.test(e.message)) throw e; }
```

Export the function from brains.js: add `module.exports.sharedKeyAllowed = sharedKeyAllowed;` at the end of `backend/brains.js`.

- [ ] **Step 3: Verify syntax**

Run: `node --check backend/brains.js && node --check backend/agent-engine.js`
Expected: both print nothing (exit 0).

- [ ] **Step 4: Functional check (temporary low cap)**

Temporarily set `SHARED_KEY_DAILY_LIMIT=2` in `.env`, restart server, then run 3 agent calls:
`for i in 1 2 3; do curl -s -X POST http://localhost:3000/api/agents/route -H "Content-Type: application/json" -d '{"message":"hi","agentName":"ORACLE","history":[]}' --max-time 30 | head -c 80; echo; done`
Expected: first 2 return a `response`; the 3rd returns the "Shared demo key limit reached" message. Then restore `SHARED_KEY_DAILY_LIMIT=200` and restart.

- [ ] **Step 5: Backup checkpoint**

```bash
TS=$(date +%Y%m%d-%H%M%S); mkdir -p "_backups/$TS"; cp backend/brains.js backend/agent-engine.js "_backups/$TS/"
```

---

### Task 4: Persistence on Render (so payments/users survive restarts)

**Files:**
- Modify: `render.yaml`
- Create: `docs/DEPLOY-PERSISTENCE.md`

**Context:** All state lives in `backend/data/*.json`. Render's default filesystem is ephemeral — a redeploy wipes payments, operatives, collectables. A persistent disk mounted at `backend/data` fixes this without a DB.

- [ ] **Step 1: Add a disk to render.yaml**

In `render.yaml`, under the web service, add:

```yaml
    disk:
      name: shaddai-data
      mountPath: /opt/render/project/src/backend/data
      sizeGB: 1
```

(Adjust `mountPath` to match the repo's actual absolute path on Render — it is `<render project root>/backend/data`.)

- [ ] **Step 2: Document the deploy steps**

Create `docs/DEPLOY-PERSISTENCE.md` with: the disk config above, a note to set env vars in the Render dashboard (`GROQ_API_KEY`, `SHADDAI_MERCHANT_WALLET`, `ADMIN_TOKEN`, `SHARED_KEY_DAILY_LIMIT`), and a one-line warning: "Never commit `.env` or real keys — set them in Render → Environment."

- [ ] **Step 3: Verify data dir is the single source of truth**

Run: `grep -rn "data', '" backend/*.js | grep -iE "operatives|collectib|bazaar|byok|results" | head`
Expected: all payment/ownership stores resolve under `backend/data/` (so one mounted disk covers them). If any store writes elsewhere, note it in the doc.

- [ ] **Step 4: Backup checkpoint**

```bash
TS=$(date +%Y%m%d-%H%M%S); mkdir -p "_backups/$TS"; cp render.yaml "_backups/$TS/" 2>/dev/null; cp docs/DEPLOY-PERSISTENCE.md "_backups/$TS/"
```

---

### Task 5: Lightweight identity so purchases have an owner

**Files:**
- Create: `backend/identity-routes.js`
- Create: `public/identity.js`
- Modify: `backend/server-production.js` (mount the router)

**Context:** There's no login, so `buyer` is currently a guest string. Minimum viable: a per-device identity (generated id + optional display name / Solana address), sent as the `buyer` on purchases so ownership is stable. Full auth is a later plan.

- [ ] **Step 1: Create the identity router**

```js
// backend/identity-routes.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const FILE = path.join(__dirname, 'data', 'identities.json');
function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } }
function save(o) { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(o, null, 2)); fs.renameSync(tmp, FILE); }
// POST /api/identity/set { id, name?, wallet? }
router.post('/api/identity/set', express.json(), (req, res) => {
  const { id, name, wallet } = req.body || {};
  if (!id || typeof id !== 'string' || id.length > 64) return res.status(400).json({ error: 'valid id required' });
  const store = load();
  store[id] = { id, name: (name || '').slice(0, 40), wallet: (wallet || '').slice(0, 64), updatedAt: new Date().toISOString() };
  save(store);
  res.json({ ok: true, identity: store[id] });
});
// GET /api/identity/:id
router.get('/api/identity/:id', (req, res) => {
  const store = load();
  res.json(store[req.params.id] || null);
});
module.exports = router;
```

- [ ] **Step 2: Mount it**

In `backend/server-production.js`, next to the other `app.use(require('./...'))` mounts (near line 1485), add:

```js
try { app.use(require('./identity-routes')); console.log('[prod] identity mounted'); }
catch (e) { console.warn('[prod] identity failed:', e.message); }
```

- [ ] **Step 3: Create the client identity module**

```js
// public/identity.js — per-device identity; supplies buyer id to purchases.
(function () {
  'use strict';
  var KEY = 'shaddai_identity_id';
  function getId() {
    var id = null; try { id = localStorage.getItem(KEY); } catch (e) {}
    if (!id) { id = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem(KEY, id); } catch (e) {} }
    return id;
  }
  window.SHADDAI_ID = { get: getId,
    set: function (name, wallet) {
      return fetch('/api/identity/set', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: getId(), name: name, wallet: wallet }) }).then(function (r) { return r.json(); }).catch(function () {});
    } };
})();
```

- [ ] **Step 4: Use the identity as buyer in bazaar-buy.js**

In `public/bazaar-buy.js`, change the `buyerId()` helper to prefer the real identity: return `(window.SHADDAI_ID && SHADDAI_ID.get && SHADDAI_ID.get())` before falling back to any guest value.

- [ ] **Step 5: Include identity.js and verify**

Add `<script defer src="/identity.js"></script>` before `bazaar-buy.js` in `public/index.html`'s include block. Restart server. Run:
`curl -s -X POST http://localhost:3000/api/identity/set -H "Content-Type: application/json" -d '{"id":"u_test","name":"Tester"}'`
Expected: `{"ok":true,"identity":{"id":"u_test","name":"Tester",...}}`. Then `curl -s http://localhost:3000/api/identity/u_test` returns that record.

- [ ] **Step 6: Backup checkpoint**

```bash
TS=$(date +%Y%m%d-%H%M%S); mkdir -p "_backups/$TS"; cp backend/identity-routes.js public/identity.js public/bazaar-buy.js "_backups/$TS/"
```

---

### Task 6: Make the white paper the public front door

**Files:**
- Modify: `backend/server-production.js` (add `/welcome` and `/whitepaper` routes)
- Modify: `public/whitepaper.html` (ensure the "Enter the Dashboard" CTA points to `/app` or `/`)

**Context:** `public/whitepaper.html` exists and is served statically. Give it clean public URLs and confirm the CTA leads into the dashboard.

- [ ] **Step 1: Add friendly routes**

In `backend/server-production.js`, before the catch-all/SPA fallback (`res.sendFile(... '../public/index.html')` near line 1487), add:

```js
app.get(['/welcome', '/whitepaper'], (req, res) => res.sendFile(require('path').join(__dirname, '../public/whitepaper.html')));
```

- [ ] **Step 2: Confirm the CTA target**

In `public/whitepaper.html`, verify the primary CTA anchor is `href="/"` (the dashboard). If it points elsewhere, change it to `/`.

- [ ] **Step 3: Verify**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/welcome` (expect 200). Open `http://localhost:3000/welcome`, click "Enter the Dashboard →", confirm it loads the dashboard at `/`.

- [ ] **Step 4: Backup checkpoint**

```bash
TS=$(date +%Y%m%d-%H%M%S); mkdir -p "_backups/$TS"; cp backend/server-production.js public/whitepaper.html "_backups/$TS/"
```

---

### Task 7: End-to-end launch verification

**Files:**
- Create: `backend/scripts/launch-check.js`

- [ ] **Step 1: Write a full-stack readiness check**

```js
// backend/scripts/launch-check.js — one command that proves the beta is money-ready.
const http = require('http');
function get(path) { return new Promise((res) => { http.get({ host: 'localhost', port: 3000, path }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ s: r.statusCode, d })); }); }); }
(async () => {
  const checks = ['/', '/welcome', '/whitepaper.html', '/api/results', '/api/byok/status'];
  for (const c of checks) { const r = await get(c); console.log((r.s === 200 ? 'OK  ' : 'FAIL') + ' ' + c + ' (' + r.s + ')'); }
  const wallet = process.env.SHADDAI_MERCHANT_WALLET ? 'SET' : 'MISSING';
  const groq = process.env.GROQ_API_KEY ? 'SET' : 'MISSING';
  const admin = process.env.ADMIN_TOKEN ? 'SET' : 'MISSING';
  console.log('ENV  merchant_wallet=' + wallet + ' groq=' + groq + ' admin_token=' + admin);
})();
```

- [ ] **Step 2: Run it**

Run: `node backend/scripts/launch-check.js`
Expected: every route prints `OK`; the ENV line shows which owner secrets still need setting. This is the go/no-go readout before flipping the beta live.

- [ ] **Step 3: Final backup checkpoint**

```bash
TS=$(date +%Y%m%d-%H%M%S); mkdir -p "_backups/$TS"; cp backend/scripts/launch-check.js "_backups/$TS/"
```

---

## Follow-up plans (out of scope here — each its own plan)
- **Real accounts/auth** (wallet-connect signature or email magic-link) replacing per-device identity.
- **Collectables/NFT minting** completion (Solana mint + royalties).
- **Games monetization** (x402/Solana wagers, tournament entry).
- **AURA feedback loop** (thumbs up/down → cache learning).
- **Customize Office modal HF revamp.**
