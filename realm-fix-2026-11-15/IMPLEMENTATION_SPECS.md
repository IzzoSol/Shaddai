# IMPLEMENTATION SPECS — Shaddai Realm + Dashboard Program (finite detail)

**Issued: 2026-11-15 by Muse (program lead), for OpenCode (GLM-5 / Beam) and fresh crews.**

## How this file relates to OPENCODE_DIRECTIVES.md

- `OPENCODE_DIRECTIVES.md` = **order + rules**: what to do first, the ground rules, the
  integration cherry-pick sequence, the loop protocol. Read it first.
- **This file = per-item detail**: for every remaining queue item, the exact files, exact
  anchor strings, exact steps, exact verification. If the directives tell you *which* item
  is next, this file tells you *how*, down to the snippet.
- `PROGRAM_QUEUE.md` = the live queue (status). `BACKEND_CONNECTION_MAP.md` §5,
  `FPS_RESEARCH_2.md` Part C, `LOADING_PIPELINE.md` Part C, `BACKEND_PERF.md` §7 and
  `DASHBOARD_AUDIT.md` §8.1 are the research behind these specs. **If a spec here and the
  code disagree, the CODE wins** — record the disagreement in the item's receipt and follow
  the code. If a spec here and a research doc disagree, this file wins (it was written
  against the code on 2026-11-15).

## Standing rules (repeated from the directives — they apply to EVERY section)

1. **Branch only.** Never push to `main`, never merge to `main`. One item = one branch,
   branched from the latest integration/wave tip named in `PROGRAM_QUEUE.md`.
   Branch name pattern: `realm-<item-slug>-2026-11-15` (e.g. `realm-g5-bazaar-2026-11-15`).
2. **Never touch `public/colosseum-character-system.js`** — not edit, not stage, not restore.
3. **Back up before editing**: copy every file you will edit into
   `~/workspace/realm-polish-2026-11-14/BACKUP-opencode/` (same filename) before the first edit.
4. **Never edit `public/dist/` by hand.** After changing any `public/*.js` that loads through
   the boot bundles (any file listed in the `#boot-scripts` template of
   `public/SHADDAI-WORLD-3D.html`, plus `public/world-main.js` whose `?v=` hash is managed),
   run `node tools/build-dist.cjs` from the repo root and commit what it produces.
5. **No downgrades.** Do not remove features, lower texture sizes, disable effects, or thin
   content. Every behaviour change ships behind the off-switch flag named in its section.
6. **Verify after every commit**: `node --check <file>` for each JS file touched (exit 0),
   plus the Verify block of the section. If an expected output does not match, STOP that
   item, write what you saw into the receipt, move to the next item. Never improvise.
7. **Receipt per item**: `~/workspace/realm-polish-2026-11-14/<ITEM>_RECEIPT.md`
   (e.g. `G-5_RECEIPT.md`), containing: branch, commit ids, files changed, every
   verification command run and its exact output.
8. **Local test server**: from the repo root of YOUR worktree:
   `PORT=8930 node backend/server-production.js`. Boot is slow (52–75 s on this VM —
   wait for the `SHADDAI Production Server v62 started on port 8930` log line before
   curling). Realm: `http://localhost:8930/SHADDAI-WORLD-3D.html`. Kill the server
   (`Ctrl-C` / kill the PID) when done.
9. **Simulating a signed-in user with curl (local only)**: the auth middleware
   (`backend/auth-guard.js`, `softAuth`) accepts an `x-user-id: <uid>` header when
   `NODE_ENV` is not `production` — that is how every backend Verify block below signs in.
   Never rely on this in production code paths.
10. **Blender is NOT needed for any item in this file.**

## Shared verify tools (referenced by name in the sections)

- Syntax: `node --check <file>` → expect exit 0, no output.
- Dist freshness: `node tools/build-dist.cjs --check` → expect `dist up to date`
  (run after any public-JS change + rebuild).
- Regression harnesses (in `~/workspace/realm-polish-2026-11-14/`): `wave1-harness.js`
  31/31 · `smoke-mobile-wave1.js` 27/27 · `wave2-sky-harness.js` 85/85 ·
  `wave2-city-test.js` 22/22 · `wave3-culling-test.js` 13/13 · `wave3-dynres-harness.js`
  23/23 · `wave4-harness.js` 38/38 · `presence-harness.js` 19/19.
  Run the subset each section names; a lower count = STOP.
- Header check: `curl -sI http://localhost:8930/<path>`.
- JSON endpoint check: `curl -s http://localhost:8930/<path>` (add
  `-H 'x-user-id: spec-tester'` where a section says "signed in").

---

---
## G-5 — Bazaar identity + write integrity

**Goal.** The bazaar must stop trusting the buyer/seller named in the request body: when a
request is authenticated, the identity comes from the session, and a forged body identity is
rejected. Bazaar store writes must be atomic and serialized so two buyers cannot both win
the last unit and a crash cannot tear `bazaar.json`.

**USE THESE TOOLS** (nothing else): `node --check backend/bazaar-routes.js`,
`node --check backend/server-production.js`, local server on PORT=8930, `curl` (with
`-H 'x-user-id: spec-tester'` for the signed-in cases), `grep -n` on the anchors below.

**Files.**
- `backend/bazaar-routes.js` — anchor (line 23):
  `const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { listings: [], orders: [] }; } };`
  and (line 24):
  `const write = (d) => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch (e) {} };`
  The same file already contains the atomic helper to reuse (line ~31):
  `function writeJSONAtomic(fp, data) {`
  Route anchors: `router.post('/api/bazaar/list-item', json, (req, res) => {` (line 158),
  `router.post('/api/bazaar/buy', json, async (req, res) => {` (line 169),
  `router.delete('/api/bazaar/:id', (req, res) => {` (line 190),
  `router.post('/api/bazaar/purchase', json, async (req, res) => {` (line 219).
- `backend/server-production.js` — anchor (line 3378):
  `try { app.use(require('./bazaar-routes')); console.log('[prod] bazaar marketplace mounted'); }`
- `backend/auth-guard.js` — reference only, do not edit. Anchor (line 145):
  `async function softAuth(req, res, next) {` — it sets `req.userId` (verified uid, or
  `'local'`) and `req.isAuthenticated` (boolean).

**Steps.**
1. In `server-production.js`, change the mount line to mount softAuth first. Before:
   `try { app.use(require('./bazaar-routes')); console.log('[prod] bazaar marketplace mounted'); }`
   After:
   `try { app.use(softAuth, require('./bazaar-routes')); console.log('[prod] bazaar marketplace mounted'); }`
   (`softAuth` is already defined/imported in this file — it is used by the mounts at
   lines 2185–2186. If the identifier is not in scope at line 3378, STOP and record it;
   do not add a second import under a different name.)
2. In `bazaar-routes.js`, replace the `write` definition (line 24) with an atomic version
   that delegates to the in-file helper. Before:
   `const write = (d) => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); } catch (e) {} };`
   After:
   `const write = (d) => { writeJSONAtomic(FILE, d); };`
   (`writeJSONAtomic` is declared later in the file as a function declaration — it hoists,
   so calling it from line 24 is safe.)
3. Add a module-level mutation lock directly under the `write` definition:
   ```js
   // Serialize every bazaar.json mutation: check-and-set (e.g. "is it sold?") and the
   // write that records it must be one unit, or two buyers can both win the last unit.
   let _bzLock = Promise.resolve();
   function withBazaarLock(fn) { const run = _bzLock.then(fn, fn); _bzLock = run.then(() => {}, () => {}); return run; }
   ```
4. Add the identity helper directly under the lock:
   ```js
   // Identity rule (G-5): an authenticated session IS the identity. A body/query identity
   // that disagrees with the session is a forgery attempt → { mismatch:true }.
   // Unauthenticated requests keep the legacy local/guest behaviour (realm guest mode).
   function bazaarUser(req, provided) {
     if (req.isAuthenticated && req.userId && req.userId !== 'local') {
       const p = provided == null ? '' : String(provided);
       if (p && p !== req.userId) return { mismatch: true };
       return { user: req.userId };
     }
     return { user: String(provided || 'guest') };
   }
   ```
5. `list-item` (line 158): make the handler `async`, wrap the body in the lock, and take
   the seller from the session. Change the destructure line
   `const { seller, name, kind, price, desc, image } = req.body || {};`
   so that after it you add:
   ```js
   const _idn = bazaarUser(req, seller);
   if (_idn.mismatch) return res.status(401).json({ ok: false, error: 'seller does not match session' });
   ```
   and replace `seller: String(seller || 'guest').slice(0, 32)` in the item literal with
   `seller: _idn.user.slice(0, 32)`. Wrap everything after the `name` check in
   `return withBazaarLock(async () => { ...existing body... });` (the `read()` must happen
   INSIDE the lock).
6. `buy` (line 169): add at the top of the handler, before `const db = read();`:
   ```js
   const _idn = bazaarUser(req, buyer);
   if (_idn.mismatch) return res.status(401).json({ ok: false, error: 'buyer does not match session' });
   ```
   Replace `const user = String(buyer || 'guest');` with `const user = _idn.user;`.
   Then wrap the WHOLE handler body in `return withBazaarLock(async () => { ... });`
   (convert the handler to `async (req, res) => { return withBazaarLock(async () => { ... }); }`),
   keeping the existing `read()` as the first statement inside the lock — so the
   sold-check, the charge, the mark-sold and the `write(db)` are one serialized unit.
   Response shapes do not change.
7. `purchase` (line 219): same identity treatment — after
   `const { itemId, method = 'credits', buyer } = req.body || {};` insert the same
   `_idn` check (error text: `'buyer does not match session'`) and replace
   `const user = String(buyer || 'guest').slice(0, 64);` with
   `const user = _idn.user.slice(0, 64);`. Do not wrap purchase in the lock (it settles
   through `resolveItem` across other stores; only its identity changes here).
8. `DELETE /api/bazaar/:id` (line 190): replace
   `const user = String(req.query.user || '');` with:
   ```js
   const _idn = bazaarUser(req, req.query.user);
   if (_idn.mismatch) return res.status(401).json({ ok: false, error: 'user does not match session' });
   const user = _idn.user;
   ```
   and wrap its mutation in the lock the same way as step 5.
9. Do NOT change: endpoint paths, request/response field names, `FEE_RATE`, the
   `/api/bazaar/order-external` handler, or the Solana purchase flow.

**Off-switch flag.** None (server-side integrity fix, no behaviour change for honest
clients). Rollback = revert the branch. (Record this in the receipt — it is the one
sanctioned exception to the flag rule, because a flag here would re-open the forgery hole.)

**Verify.**
1. `node --check backend/bazaar-routes.js && node --check backend/server-production.js` → exit 0.
2. Start the server (PORT=8930), wait for the started log line, then:
   - Forgery: `curl -s -X POST http://localhost:8930/api/bazaar/list-item -H 'Content-Type: application/json' -H 'x-user-id: spec-tester' -d '{"seller":"victim","name":"Spec Item","kind":"item","price":10}'`
     → expect `{"ok":false,"error":"seller does not match session"}` with HTTP 401.
   - Honest: same call without the `seller` field → expect `"ok":true` and the returned
     listing's `"seller":"spec-tester"`.
   - Guest still works: same call with NO `x-user-id` header and `"seller":"guest"` →
     expect `"ok":true` (legacy local behaviour preserved).
   - Concurrency: create one item listing as guest, then fire two buys for its id in
     parallel (`curl -s -X POST .../api/bazaar/buy -d '{"id":"<id>","buyer":"guest"}' &` twice,
     wait) → exactly ONE response has `"ok":true`; the other is 409 `already sold`
     (a 402 payment response instead of the win is also acceptable for the loser ONLY if
     the winner's response is the single `"ok":true` — the invariant is: never two wins).
   - `python3 -m json.tool backend/data/bazaar.json > /dev/null` → exit 0 (file still valid JSON).
3. Kill the server.

**Pitfalls.**
- Holding the lock across the buy handler's payment call serializes bazaar writes behind
  one payment round-trip. That is accepted here (correctness first, bazaar volume is low);
  do NOT "optimize" it by moving the sold-check outside the lock — that re-opens the race.
- `req.userId === 'local'` means UNAUTHENTICATED under softAuth (it is the anonymous
  sentinel, also used in production without a token). Never treat `'local'` as a session.
- The `x-user-id` header only works when `NODE_ENV` is not `production`. If a verify curl
  behaves as guest, check how the server was started before touching the code.

**Done-when:** forgery returns 401, honest + guest flows unchanged, parallel buys yield
exactly one winner, `bazaar.json` stays valid JSON, and both `node --check` pass.

---
## G-4 — Currency unification: bazaar settles in Sparks, one writer per ledger file

> **⚠ SAFETY ORDER — READ BEFORE ANY STEP.**
> 1. **G-5 must be DONE first** (bazaar identity from session). G-4's buy path trusts
>    `req.userId`; without G-5 that identity is forgeable and this item would convert the
>    SHAD-Credit spoof into a Sparks drain.
> 2. **Never set `X402_SPARKS_BRIDGE=true`** before steps (a) and (b) below are both done
>    and verified. The bridge (`backend/lib/economy-x402-bridge.js`, gate at line 33:
>    `return process.env.X402_SPARKS_BRIDGE === 'true';`) is additive-only and OFF by
>    default; enabling it early double-settles every charge (SHAD-Credits AND Sparks).
> 3. Do not touch `backend/server-production.js:850` (a dead `economy-service.getInstance()`
>    call — `economy-service.js` exports `getDefault`, line 752). It is not part of this item.

**Goal.** A bazaar purchase must move the realm's one real currency — Sparks — instead of
the parallel SHAD-Credits float ledger, with the frontend request/response shape unchanged.
And `backend/data/x402-ledger.json` must end up with exactly one schema owner: today
`x402-routes.js` writes `{balances, txns}` floats while `lib/x402-ledger.js` writes an
incompatible `{accounts, totalCredited, totalDebited}` schema to the SAME file.

**USE THESE TOOLS** (nothing else): `node --check` on each touched file, local server on
PORT=8930, `curl`, `grep -rn "x402-ledger" backend --include="*.js"`,
`python3 -m json.tool` for file validity.

**Files.**
- `backend/bazaar-routes.js` — the buy handler (line 169). Its settlement block today is an
  internal HTTP self-call (anchor):
  `const r = await fetch(base + '/api/x402/charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, amount: item.price, reason: 'bazaar: ' + item.name, payee: item.seller }) });`
  Success response shape that MUST be preserved:
  `res.json({ ok: true, bought: { id: item.id, name: item.name, price: item.price }, payment: { charged: d.charged, fee: d.fee, balance: d.balance } });`
- `backend/economy-service.js` — reference only. Anchors:
  `async spend(userId, amount, reason, idempotencyKey, opts = {}) {` (line 648),
  `async grant(userId, amount, reason, idempotencyKey, opts = {}) {` (line 629),
  `async spendSparks(userId, sparks, reason, idempotencyKey, opts = {}) {` (line 681),
  `async grantSparks(userId, sparks, reason, idempotencyKey, opts = {}) {` (line 676).
  Amounts: `spend`/`grant` take integer units (1 Spark = 100 units); `spendSparks`/
  `grantSparks` take decimal Sparks and convert. Access via
  `require('./economy-service').getDefault()`.
- `backend/lib/x402-ledger.js` — anchor (line 9):
  `const LEDGER_FILE = path.join(DATA_DIR, 'x402-ledger.json');`
  Its consumers all go through the lib (verify in step 1): `backend/x402-ledger-routes.js`,
  `backend/routes/zerox-paid.js`, `backend/lib/paybox-agent-wallets.js`.
- NOT edited: `backend/x402-routes.js` (keeps owning `x402-ledger.json` with the
  `{balances, txns}` schema, also used by `lib/paybox-settle.js` and `shop-routes.js` —
  same schema, they stay), `backend/lib/economy-x402-bridge.js`.

**Steps.**
1. Audit first, record in the receipt:
   `grep -rn "x402-ledger" backend --include="*.js" | grep -v node_modules`
   Confirm the only incompatible-schema writer is `lib/x402-ledger.js` (its header comment
   describes the `{accounts: …}` state). If another incompatible writer appears, STOP.
2. **(b) End the file collision.** In `backend/lib/x402-ledger.js` line 9, before:
   `const LEDGER_FILE = path.join(DATA_DIR, 'x402-ledger.json');`
   after:
   `const LEDGER_FILE = path.join(DATA_DIR, 'x402-agent-ledger.json');`
   One line. Nothing else in the file changes; all lib consumers follow automatically.
3. **(a) Bazaar buy settles in Sparks.** In `backend/bazaar-routes.js`, inside the buy
   handler, replace the whole settlement `try { ... } catch` block (from
   `// settle via x402 charge: debit buyer, net to seller, 5% fee to treasury (x402-routes does the math)`
   through the closing `} catch (e) { res.status(500).json({ ok: false, error: e.message }); }`)
   with:
   ```js
   // settle in Sparks (G-4): debit buyer, net to seller, 5% fee burned (not granted).
   // Idempotency key ties the spend to this listing+buyer, so a retried buy never
   // double-charges. Response shape is unchanged from the x402 era.
   try {
     const eco = require('./economy-service').getDefault();
     const price = Number(item.price) || 0;
     const fee = Math.round(price * FEE_RATE * 100) / 100;
     const net = Math.round((price - fee) * 100) / 100;
     const idem = 'bazaar-buy:' + item.id + ':' + user;
     let bal;
     try {
       const spent = await eco.spendSparks(user, price, 'bazaar: ' + item.name, idem, { refId: item.id });
       bal = spent && spent.balance != null ? spent.balance : null;
     } catch (e) {
       if (e && (e.name === 'InsufficientFundsError' || /insufficient/i.test(e.message || ''))) {
         return res.status(402).json({ ok: false, error: 'insufficient_sparks' });
       }
       throw e;
     }
     if (item.seller && item.seller !== user && net > 0) {
       await eco.grantSparks(item.seller, net, 'bazaar sale: ' + item.name, idem + ':seller', { refId: item.id });
     }
     if (bal == null) { const b = await eco.getBalance(user); bal = b; }
     if (item.kind === 'item') { item.status = 'sold'; item.buyer = user; item.soldAt = Date.now(); }
     write(db);
     res.json({ ok: true, bought: { id: item.id, name: item.name, price: item.price }, payment: { charged: price, fee: fee, balance: bal } });
   } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
   ```
   Notes that are part of the spec, not options: the unit of account is the listing's
   `price` read as **Sparks** (decimal allowed — `spendSparks` converts at 100 units per
   Spark and rejects amounts that convert to 0 units; a 0-price listing short-circuits:
   if `price <= 0`, skip both economy calls and treat `bal` as the buyer's current
   balance). The 5% fee is burned (granted to nobody) — the SHAD-Credits treasury account
   has no Sparks counterpart and inventing one is out of scope.
   If G-5's lock wrapper is present, this block stays INSIDE the lock, exactly where the
   old block was.
4. Apply the same settlement swap to the `purchase` handler's `method:'credits'` path
   (line 219+) ONLY IF it settles through the same `/api/x402/charge` self-call — check
   with `grep -n "x402/charge" backend/bazaar-routes.js`. If purchase settles differently
   (e.g. via `resolveItem` + its own ledger calls), STOP and record what it does in the
   receipt; do not improvise a second conversion in this item.
5. Leave the bridge OFF. Step (c) — considering `X402_SPARKS_BRIDGE=true` for legacy
   SHAD-Credit balances — is a founder/config decision for AFTER this item verifies;
   do not set the env var anywhere in this item.

**Off-switch flag.** `?` flags don't exist server-side; the rollback is: revert step 3
(restores the x402 self-call) and/or step 2 independently — they are separate commits for
exactly this reason. Commit order: step 2 first (collision), step 3 second (settlement).

**Verify.**
1. `node --check backend/bazaar-routes.js && node --check backend/lib/x402-ledger.js` → exit 0.
2. Server on PORT=8930 (signed-in curls use `-H 'x-user-id: spec-tester'`; first fund the
   tester through an existing grant path — the games daily bonus or an admin grant route
   already in the codebase; if none is reachable locally, record that and verify with the
   balance endpoint before/after using whatever balance the tester already has):
   - Note balances: `curl -s http://localhost:8930/api/economy/balance -H 'x-user-id: spec-tester'`
     (use the balance route the dashboard's `shd-sparks.js` calls: `GET /api/economy/balance`).
   - List an item as `spec-seller` (price 10), buy it as `spec-tester`.
   - Expect: buy response `"ok":true` with `payment.charged: 10`, `payment.fee: 0.5`;
     tester's Sparks balance dropped by exactly 10 (in the units the balance endpoint
     reports); seller's rose by 9.5 Sparks' worth; the item is `sold`.
   - SHAD-Credits unchanged: `curl -s "http://localhost:8930/api/x402/balance?user=spec-tester"`
     before/after → identical balance.
   - Insufficient: buy a 999999-price listing → HTTP 402 `{"ok":false,"error":"insufficient_sparks"}`,
     balances unchanged.
   - Collision: after any x402-ledger-lib flow runs (or 60 s of server uptime with the
     routes mounted), `ls backend/data/` shows BOTH `x402-ledger.json` and
     `x402-agent-ledger.json` may exist; `python3 -m json.tool` validates each; and
     `x402-ledger.json` top-level keys are only `balances`/`txns` (never `accounts`).

**Pitfalls.**
- `spend`/`grant` (integer units) vs `spendSparks`/`grantSparks` (decimal Sparks): mixing
  them up charges 100× too much or 100× too little. This spec uses the `*Sparks` pair.
- The idempotency key makes a *retried* buy safe, but G-5's sold-check is what stops a
  *second distinct* buy. Both must be present; if G-5 is not in your branch, STOP.
- Do not "fix" the fee by granting it to a made-up treasury user id — a grant to an
  arbitrary string creates a real account in the ledger.

**Done-when:** a bazaar buy moves Sparks (buyer −price, seller +(price−5%), fee burned),
SHAD-Credit balances are untouched, `x402-ledger.json` has a single schema owner, and the
buy response shape is byte-identical in structure to before.

---
## G-7 — City deed plots: give plots-v4 claims a backend

**Goal.** City plots currently render from a static file and the claim button is a disabled
"coming soon" stub. Build the deed backend (a copy of the proven home-deeds pattern) so a
signed-in player can buy a plot with Sparks, the deed persists server-side, and the city
panel shows real ownership.

**USE THESE TOOLS** (nothing else): `node --check` on touched files, local server on
PORT=8930, `curl`, `grep -n` on the anchors, `python3 -m json.tool backend/data/city-deeds.json`.

**Files.**
- NEW `backend/city-deed-routes.js` — modelled on `backend/home-deed-routes.js`. Pattern
  anchors in that file: `const { JsonStore } = require('./lib/json-store');`,
  `const economy = opts.economy || require('./economy-service').getDefault();`,
  `const uidOf = (req) => (req.userId && UID_RE.test(String(req.userId)) ? String(req.userId) : null);`,
  and its buy flow: ownership check + `economy.spend(...)` + record, all inside
  `store.withLock(async (db) => { ... })`, returning 409 for taken and letting the
  economy's insufficient-funds error surface as 402.
- `backend/lib/json-store.js` — reference only. Anchors: `class JsonStore {` (line 21),
  `withLock(fn) {` (line 86). Constructor: `new JsonStore(filePath, defaultValue)`.
- `backend/server-production.js` — mount anchor (line 2185):
  `app.use('/api/home-deeds', softAuth, require('./home-deed-routes').makeRouter());`
- `public/assets/world/plots-v4.json` — the plot catalogue (read-only). Shape (verified):
  `{"version":1, "note":"…", "plots":[{"plot_id":"PLOT-SW-0001","x_m":-116.5,"y_m":-151.3,"w_m":19,"d_m":23,"yaw":217.59,"beacon_m":[…],"state":"empty","mode":null,"owner_id":null,"pending_sparks":0,"boost_lock":0,"art_slot":"SLOT_HOME_06640"}, …]}`.
  The server reads its own copy at `path.join(__dirname, '..', 'public', 'assets', 'world', 'plots-v4.json')`.
- `public/world-city-actions.js` — the plots panel. Anchors: line 13 header
  `DEED_OFFICE, BUILDER_YARD                 → plots    counts from plots-v4.json, claim soon   (MCP-only today)`;
  the stub button inside `FAMILIES.plots`:
  `var b = add(ctx.body, btn(m.name === 'BUILDER_YARD' ? 'Build · coming soon' : 'Claim · coming soon', 'ghost', function () {}, 'claim'));`
  followed by `b.disabled = true;` and the caption
  `'Claiming a plot in the city opens soon. The fee is set by plot size.'`
  The panel's data path: `opts.city.stats()` if present, else it fetches `plotsUrl`
  (`var DEFAULT_PLOTS_URL = '/assets/world/plots-v4.json';`, line 34) and counts
  `p.state` values into `{empty, claimed, built, listed, lapsed}`.

**FOUNDER-GATED step (do not invent a number).** The panel copy says "The fee is set by
plot size", but no price rule exists anywhere in the code or docs. The routes file below
therefore reads the price from ONE named constant fed by an env var:
`const PRICE_PER_M2 = Number(process.env.CITY_PLOT_PRICE_PER_M2_SPARKS);` and the buy
endpoint answers `503 {ok:false, error:'plot pricing not set'}` while it is unset/NaN.
**Go-live needs the founder to set `CITY_PLOT_PRICE_PER_M2_SPARKS`.** All local
verification below uses a test value (`CITY_PLOT_PRICE_PER_M2_SPARKS=0.01`). Everything
else in this item is finite.

**Steps.**
1. Create `backend/city-deed-routes.js` with exactly this skeleton (CommonJS, same style
   as home-deed-routes.js):
   ```js
   'use strict';
   /**
    * city-deed-routes.js — buy a CITY PLOT (plots-v4) with Sparks. Server record only.
    *   GET  /api/city-deeds        -> { ok, deeds: { plotId: { owner, price, at } } }
    *   POST /api/city-deeds/buy { plotId } -> { ok, plotId, owner, price, balance }
    *        401 signed-out · 400 unknown plot · 402 insufficient_sparks · 409 owned ·
    *        503 pricing not set (CITY_PLOT_PRICE_PER_M2_SPARKS unset — founder decision)
    * Price = plot area (w_m × d_m from plots-v4.json) × PRICE_PER_M2, rounded to 2dp.
    * Money path: EconomyService.spendSparks() is the only Sparks writer; idempotency key
    * 'citydeed:<plotId>:<userId>' so a retry never double-charges. Ownership check,
    * spend and record happen inside the store lock as one unit (home-deeds pattern).
    */
   const fs = require('fs');
   const path = require('path');
   const express = require('express');
   const { JsonStore } = require('./lib/json-store');

   const PLOTS_FILE = path.join(__dirname, '..', 'public', 'assets', 'world', 'plots-v4.json');
   const UID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
   const PRICE_PER_M2 = Number(process.env.CITY_PLOT_PRICE_PER_M2_SPARKS);

   function loadPlots() {
     try { const j = JSON.parse(fs.readFileSync(PLOTS_FILE, 'utf8')); return Array.isArray(j.plots) ? j.plots : []; }
     catch (e) { return []; }
   }
   function priceFor(plot) {
     if (!isFinite(PRICE_PER_M2) || PRICE_PER_M2 <= 0) return null;
     const area = (Number(plot.w_m) || 0) * (Number(plot.d_m) || 0);
     return Math.round(area * PRICE_PER_M2 * 100) / 100;
   }

   function makeRouter(opts) {
     opts = opts || {};
     const store = opts.store || new JsonStore(path.join(opts.dataDir || path.join(__dirname, 'data'), 'city-deeds.json'), { deeds: {} });
     const economy = opts.economy || require('./economy-service').getDefault();
     const r = express.Router();
     r.use(express.json({ limit: '2kb' }));
     const uidOf = (req) => (req.userId && UID_RE.test(String(req.userId)) ? String(req.userId) : null);

     r.get('/', async (_req, res) => {
       const db = await store.read();
       res.json({ ok: true, deeds: db.deeds || {} });
     });

     r.post('/buy', async (req, res) => {
       const u = uidOf(req); if (!u) return res.status(401).json({ ok: false, error: 'sign in first' });
       const plotId = String((req.body && req.body.plotId) || '');
       const plot = loadPlots().find(p => p.plot_id === plotId);
       if (!plot) return res.status(400).json({ ok: false, error: 'unknown plot' });
       const price = priceFor(plot);
       if (price == null) return res.status(503).json({ ok: false, error: 'plot pricing not set' });
       try {
         const out = await store.withLock(async (db) => {
           db.deeds = db.deeds || {};
           const d = db.deeds[plotId];
           if (d && d.owner === u) return { replayed: true };
           if (d) return { taken: true };
           await economy.spendSparks(u, price, 'city_deed:' + plotId, 'citydeed:' + plotId + ':' + u, { refId: plotId });
           db.deeds[plotId] = { owner: u, price: price, at: new Date().toISOString() };
           return { bought: true };
         });
         if (out.taken) return res.status(409).json({ ok: false, error: 'this plot already has an owner' });
         const balance = await economy.getBalance(u);
         return res.json({ ok: true, plotId: plotId, owner: u, price: price, balance: balance, replayed: !!out.replayed });
       } catch (e) {
         if (e && (e.name === 'InsufficientFundsError' || /insufficient/i.test(e.message || ''))) {
           return res.status(402).json({ ok: false, error: 'insufficient_sparks' });
         }
         return res.status(500).json({ ok: false, error: e.message });
       }
     });
     return r;
   }
   module.exports = { makeRouter };
   ```
2. Mount it in `server-production.js` immediately AFTER the home-deeds anchor line 2185:
   `app.use('/api/city-deeds', softAuth, require('./city-deed-routes').makeRouter());   // buy a city plot (plots-v4) with Sparks (server-side deed)`
3. Frontend (`public/world-city-actions.js`), inside `FAMILIES.plots`'s `show()`:
   - After the counts rows are rendered and BEFORE the stub button line, fetch deeds and
     merge: call `api('GET', '/api/city-deeds')`; for every plot row whose `plot_id`
     exists in the returned `deeds`, treat its state as `'claimed'` when counting, and
     remember the first unclaimed plot id as `claimableId`. (The panel currently counts
     from `st.plotsByState` or from the fetched plots JSON — apply the merge at the same
     place the counts object `c` / `counts` is finalised, so both paths get it. If the
     GET fails, proceed exactly as today — deeds are additive.)
   - Replace the stub button block:
     before:
     ```js
     var b = add(ctx.body, btn(m.name === 'BUILDER_YARD' ? 'Build · coming soon' : 'Claim · coming soon', 'ghost', function () {}, 'claim'));
     b.disabled = true;
     ```
     after (DEED_OFFICE only; BUILDER_YARD keeps its stub):
     ```js
     var b;
     if (m.name === 'BUILDER_YARD') {
       b = add(ctx.body, btn('Build · coming soon', 'ghost', function () {}, 'claim'));
       b.disabled = true;
     } else if (claimableId) {
       b = add(ctx.body, btn('Claim ' + claimableId, '', function () {
         api('POST', '/api/city-deeds/buy', { plotId: claimableId }).then(function (res) {
           if (!ctx.alive()) return;
           var o = outcome(res, false);
           if (o.kind === 'ok') { say('Plot claimed: ' + claimableId, 'ok'); FAMILIES.plots(ctx); }
           else ctx.handle(res, false);
         });
       }, 'claim'));
     } else {
       b = add(ctx.body, btn('Claim · coming soon', 'ghost', function () {}, 'claim'));
       b.disabled = true;
     }
     ```
     Use ONLY helpers that already exist in this file (`api` line 172, `outcome` line 92,
     `btn` line 235, `add` line 233, the closure's `say(text, kind)`, and `ctx.handle` —
     all used by the neighbouring bazaar family above `FAMILIES.plots`).
     If any named helper does not exist with that name, STOP and record it.
   - Update the header comment line 13: replace `claim soon   (MCP-only today)` with
     `claim live via /api/city-deeds`.
4. Run `node tools/build-dist.cjs` (world-city-actions.js is a boot-bundle file).

**Off-switch flag.** `?citydeeds=0` in the realm URL: in `FAMILIES.plots`, when the flag
is present, skip the deeds fetch/merge and render the stub exactly as today. Server side
has no flag (the endpoint is inert until called).

**Verify.**
1. `node --check backend/city-deed-routes.js && node --check backend/server-production.js && node --check public/world-city-actions.js` → exit 0; `node tools/build-dist.cjs --check` → up to date.
2. Server started with the test price:
   `CITY_PLOT_PRICE_PER_M2_SPARKS=0.01 PORT=8930 node backend/server-production.js`
   - `curl -s http://localhost:8930/api/city-deeds` → `{"ok":true,"deeds":{}}` (or existing deeds).
   - Signed out: `curl -s -X POST http://localhost:8930/api/city-deeds/buy -H 'Content-Type: application/json' -d '{"plotId":"PLOT-SW-0001"}'` → 401.
   - Unknown plot: same with `-H 'x-user-id: spec-tester'` and `"plotId":"NOPE"` → 400 `unknown plot`.
   - Buy: tester needs ≥ 4.37 Sparks (PLOT-SW-0001 is 19×23 = 437 m² × 0.01). Fund via an
     existing grant path first if needed (same note as G-4). Buy → `"ok":true`, `"price":4.37`.
   - `python3 -m json.tool backend/data/city-deeds.json` → contains
     `"PLOT-SW-0001": {"owner": "spec-tester", "price": 4.37, …}`.
   - Second buyer (`-H 'x-user-id: spec-other'`) buys PLOT-SW-0001 → 409.
   - Same buyer re-buys → `"ok":true` with `"replayed":true` and NO second charge
     (balance unchanged between the two calls).
   - Restart the server → `GET /api/city-deeds` still shows the deed.
   - Without the env var (fresh server, no `CITY_PLOT_PRICE_PER_M2_SPARKS`) → buy answers
     503 `plot pricing not set`. (This is the founder gate working, not a bug.)
3. Kill the server. In a browser: DEED_OFFICE panel shows the claimed count including the
   server deed, and the Claim button names a real plot id.

**Pitfalls.**
- `spendSparks` rejects prices that convert to 0 units (< 0.01 Sparks). With the founder's
  real price this cannot happen for real plots (smallest plot ≫ 1 m²); with the 0.01 test
  price it also cannot (min area in the file is over 400 m² — if a plot ever computes
  below 0.01, the buy 500s: record it, don't round the price up silently).
- The frontend merge must not resurrect the panel's OTHER plot states: only `empty →
  claimed` transitions come from deeds; `built/listed/lapsed` stay as the static file says.
- Do not edit `plots-v4.json` to record ownership — deeds live only in `city-deeds.json`.

**Done-when:** buy persists a deed, second buyer gets 409, retry is a no-charge replay,
the panel reflects server deeds, and the 503 pricing gate answers when the founder's
price env var is unset.

---
## G-9 — Skate leaderboard backend

**Goal.** Skate Jam's leaderboard lives only in each player's localStorage, so nobody sees
anyone else's scores. Add the two endpoints the frontend comment already promises, storing
entries in the existing games-scores store under a `skate` bucket, and wire the client to
post finished runs and merge the server board into its display.

**USE THESE TOOLS** (nothing else): `node --check backend/games-routes.js`,
`node --check public/world-skatejam.js`, local server on PORT=8930, `curl`,
`node tools/build-dist.cjs`.

**Files.**
- `backend/games-routes.js` — the pattern AND the file to extend. Anchors:
  `const FILE = path.join(__dirname, 'data', 'games-scores.json');` (line 11),
  `const board = (db, game) => (db[game] || (db[game] = []));` (line 15),
  `router.post('/api/games/score', json, async (req, res) => {` (line 32),
  `router.get('/api/games/leaderboard', (req, res) => {` (line 63).
  Store shape: `{ <game>: [ {user, score, at} … ] }`, boards kept sorted desc, capped 200.
- `public/world-skatejam.js` — anchors: line 18 hook comment
  `* Hook for real leaderboards: LB entries {score, tier, ts} (localStorage now; POST /api/skate/score later).`
  `var LBKEY = 'shd_jam_lb_v1', CAPKEY = 'shd_jam_cap_v1';` (line 27),
  `function lbLoad() { try { return JSON.parse(localStorage.getItem(LBKEY) || '[]'); } catch (e) { return []; } }` (line 28),
  and the run-end push (line 107):
  `var lb = lbLoad(); lb.push({ score: S.score, tier: tier ? tier.name : '-', ts: Date.now() }); lb.sort(function (a, b) { return b.score - a.score; }); lbSave(lb); S.best = lb[0] ? lb[0].score : S.score;`

**Steps.**
1. In `backend/games-routes.js`, insert these two routes immediately BEFORE
   `module.exports = router;`:
   ```js
   // ── Skate Jam leaderboard (G-9) ─────────────────────────────────────────────
   // Same store + shape discipline as /api/games/score, under the 'skate' bucket.
   // NO Sparks grant here: skate tiers reward rank, not currency (world-skatejam.js
   // header), and a client-reported score must never mint — see the DAILY_PLAY_BONUS
   // comment above for why score-scaled grants are forbidden in this codebase.
   router.post('/api/skate/score', json, (req, res) => {
     const { user, score, tier } = req.body || {};
     const s = Number(score);
     if (!Number.isFinite(s) || s < 0) return res.status(400).json({ ok: false, error: 'numeric score required' });
     const entry = { user: String(user || 'guest').slice(0, 32), score: s, tier: String(tier || '-').slice(0, 12), at: Date.now() };
     const db = read(); const b = board(db, 'skate');
     b.push(entry); b.sort((a, c) => c.score - a.score); db.skate = b.slice(0, 200); write(db);
     const rank = db.skate.indexOf(entry) + 1;
     res.json({ ok: true, rank: rank || null, top: db.skate.slice(0, 50) });
   });

   router.get('/api/skate/leaderboard', (req, res) => {
     const limit = Math.min(50, parseInt(req.query.limit) || 50);
     const db = read();
     res.json({ ok: true, top: (db.skate || []).slice(0, limit) });
   });
   ```
   Identity note: if your branch already contains the backend-quick-wins G-12 change
   (games-routes deriving identity via `lib/economy-identity.js` `resolveScopedUserId`),
   apply the SAME derivation to the `user` above (session wins over body). If it does not,
   keep the body-user form exactly as written — do not invent a third identity path.
2. In `public/world-skatejam.js`, at the run-end push (line 107), keep the local push
   exactly as-is and add the server post immediately after the `lbSave(lb);` statement:
   ```js
   try {
     fetch('/api/skate/score', { method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ user: (window.SHDDAI_USER || 'guest'), score: S.score, tier: tier ? tier.name : '-' }) })
       .then(function (r) { return r.json(); })
       .then(function (d) { if (d && d.ok && Array.isArray(d.top)) { lbSave(d.top.map(function (e) { return { score: e.score, tier: e.tier || '-', ts: e.at || 0 }; })); } })
       .catch(function () {});
   } catch (e) {}
   ```
   (`window.SHDDAI_USER` is the realm's identity global — the same one the bazaar sends.
   The `.catch` is mandatory: offline/local play must keep the local board untouched.)
3. Update the line-18 hook comment: replace `(localStorage now; POST /api/skate/score later)`
   with `(localStorage cache; POST /api/skate/score live)`.
4. Run `node tools/build-dist.cjs` (world-skatejam.js is a boot-bundle file).

**Off-switch flag.** `?skateboard=local` in the realm URL: wrap the step-2 fetch in
`if (!/[?&]skateboard=local/.test(location.search)) { ... }` so the flag restores
localStorage-only behaviour. Server endpoints need no flag (inert until called).

**Verify.**
1. `node --check` both files → exit 0; `node tools/build-dist.cjs --check` → up to date.
2. Server on PORT=8930:
   - `curl -s -X POST http://localhost:8930/api/skate/score -H 'Content-Type: application/json' -d '{"user":"spec-tester","score":1234,"tier":"GOLD"}'`
     → `{"ok":true,"rank":1,"top":[{"user":"spec-tester","score":1234,"tier":"GOLD",…}]}`.
   - `curl -s http://localhost:8930/api/skate/leaderboard` → the same entry in `top`.
   - Bad score: `-d '{"user":"x","score":"abc"}'` → 400.
   - Restart the server → leaderboard still returns the entry (file persisted);
     `python3 -m json.tool backend/data/games-scores.json` shows a top-level `"skate"` array.
3. Kill the server.

**Pitfalls.**
- Do NOT add a Sparks grant to the skate post — not even the games daily bonus. The map
  item allows "the same daily-grant guard games-score has, or none"; this spec chooses
  NONE because skate already has its own closed-loop stake economy client-side.
- The server board REPLACES the local cache on a successful post (step 2 maps `at`→`ts`).
  Entries from other players therefore appear locally — that is the point of the item;
  do not merge-and-keep-local-only entries, or stale local scores will outrank real ones.

**Done-when:** a posted score appears in `GET /api/skate/leaderboard`, survives a server
restart inside `games-scores.json` under `skate`, and the client still works fully offline.

---
## G-10 — Lounge tracks endpoint (wire the existing radio catalogue)

**Goal.** The Lounge's track list is a hardcoded array of 16 SoundHelix demo songs with
fictional titles. The backend already runs a community radio catalogue with the same
track shape — wire the Lounge to it so real submitted tracks play in the realm, keeping
the hardcoded list as the offline fallback only.

**USE THESE TOOLS** (nothing else): `node --check public/world-lounge.js`,
`node --check backend/lib/radio-routes.js` (reference — it is NOT edited), local server on
PORT=8930, `curl`, `node tools/build-dist.cjs`.

**Files.**
- `backend/lib/radio-routes.js` — reference only, do not edit. Anchors:
  `router.get('/tracks', (req, res) => {` (line 137) answering
  `res.json({ ok: true, tracks: store.tracks });`, mounted as
  `app.use('/api/radio', require('./lib/radio-routes'));` in server-production.js
  (line 2164) → the live URL is `GET /api/radio/tracks`. Track entries carry
  `{id, title, artist, url, submittedBy, …}` (POST body documented at line 90:
  `// body: { title, artist, url, submittedBy }`). Store file: `backend/data/radio.json`.
- NEW `backend/lounge-routes.js` + one mount line — the thin adapter the frontend comment
  specifies (bare array out), so the client never has to know about the radio envelope.
- `public/world-lounge.js` — anchors: the plug-in comment (lines 25–33):
  `* These are free, no-key, CORS-friendly seed tracks (SoundHelix). Later this`
  `* array will be replaced/augmented by community-submitted tracks fetched from`
  `* a backend endpoint (e.g. GET /api/lounge/tracks -> [{title, artist, url}]).`
  `var COMMUNITY_TRACKS = [` (line 36) — 16 seed entries of shape `{ title, artist, url }`.
  `function renderTrackList() {` (line 338) iterates `COMMUNITY_TRACKS`.
  There is NO `refreshTracks()` function yet — you create it (the comment names it).

**Steps.**
1. Create `backend/lounge-routes.js`:
   ```js
   'use strict';
   /**
    * lounge-routes.js — GET /api/lounge/tracks -> [{title, artist, url}]
    * Thin adapter over the radio catalogue (backend/data/radio.json, owned by
    * lib/radio-routes.js): the Lounge client (world-lounge.js) is specified against a
    * bare array of exactly {title, artist, url}; the radio store carries more fields.
    * Read-only: submissions keep going through POST /api/radio/tracks.
    */
   const fs = require('fs');
   const path = require('path');
   const express = require('express');

   const FILE = path.join(__dirname, 'data', 'radio.json');

   function makeRouter() {
     const r = express.Router();
     r.get('/tracks', (_req, res) => {
       let tracks = [];
       try {
         const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
         tracks = (Array.isArray(j.tracks) ? j.tracks : [])
           .filter(t => t && t.title && t.url)
           .map(t => ({ title: String(t.title), artist: String(t.artist || ''), url: String(t.url) }));
       } catch (e) { tracks = []; }
       res.json(tracks);
     });
     return r;
   }
   module.exports = { makeRouter };
   ```
2. Mount it in `backend/server-production.js` next to the radio mount (line 2164), on the
   following line:
   `app.use('/api/lounge', require('./lounge-routes').makeRouter());                // Lounge track list (adapter over the radio catalogue)`
3. In `public/world-lounge.js`, add `refreshTracks()` immediately AFTER the
   `COMMUNITY_TRACKS` array's closing `];`:
   ```js
   var _tracksLoaded = false;
   function refreshTracks() {
     if (_tracksLoaded) return; _tracksLoaded = true;
     try {
       fetch('/api/lounge/tracks').then(function (r) { return r.json(); }).then(function (list) {
         if (Array.isArray(list) && list.length) {
           COMMUNITY_TRACKS = list.map(function (t) { return { title: t.title, artist: t.artist, url: t.url }; });
           renderTrackList();
         }
       }).catch(function () { /* offline: seed list stays */ });
     } catch (e) { /* seed list stays */ }
   }
   ```
   (`COMMUNITY_TRACKS` is declared with `var`, so reassignment is legal.)
4. Call it: find where the lounge UI is first opened/built (the function that calls
   `renderTrackList()` during setup — `renderTrackList` is invoked at line ~363 in the
   track-select path; the open path is the module's exported open/init). Add ONE call
   `refreshTracks();` immediately before the FIRST `renderTrackList()` invocation that
   runs when the lounge opens. If you cannot identify the open path with certainty,
   STOP and record the candidates in the receipt — do not scatter calls.
5. Update the plug-in comment (lines 25–33): replace
   `* array will be replaced/augmented by community-submitted tracks fetched from`
   `* a backend endpoint (e.g. GET /api/lounge/tracks -> [{title, artist, url}]).`
   with `* array is replaced at open by GET /api/lounge/tracks (radio catalogue) when
   * it returns a non-empty list; the seed array below is the offline fallback.`
6. Run `node tools/build-dist.cjs` (world-lounge.js is a boot-bundle file).

**Off-switch flag.** `?loungetracks=local` in the realm URL: guard the fetch inside
`refreshTracks()` with `if (/[?&]loungetracks=local/.test(location.search)) return;`
before the `fetch` (after the `_tracksLoaded` line) — seed list only, as today.

**Verify.**
1. `node --check public/world-lounge.js && node --check backend/lounge-routes.js && node --check backend/server-production.js` → exit 0; build-dist check → up to date.
2. Server on PORT=8930:
   - Submit a track to the catalogue:
     `curl -s -X POST http://localhost:8930/api/radio/tracks -H 'Content-Type: application/json' -d '{"title":"Spec Song","artist":"Spec Artist","url":"https://example.com/spec.mp3","submittedBy":"spec-tester"}'`
     → `"ok":true`.
   - `curl -s http://localhost:8930/api/lounge/tracks` → a bare JSON array whose entries
     have EXACTLY the keys `title`, `artist`, `url`, including the Spec Song entry.
   - In a browser: open the Lounge → the track list shows Spec Song (not only the 16
     seeds). With the server stopped → the seed list still renders (fallback intact).
3. Kill the server.

**Pitfalls.**
- The response MUST be a bare array — `world-lounge.js`'s documented contract. Returning
  the radio envelope `{ok, tracks}` from the adapter defeats the item.
- Do not "fix" the seed titles/artists in this item: they are fictional labels on real
  SoundHelix demo files (a known honesty note in the program record) — relabelling is a
  separate founder-facing decision, not part of this wiring.
- `renderTrackList()` before the fetch resolves shows seeds briefly, then re-renders with
  the catalogue. That swap is expected; do not block the lounge opening on the fetch.

**Done-when:** `GET /api/lounge/tracks` returns the radio catalogue as a bare
`[{title, artist, url}]` array, the Lounge displays it when the server is up, and the
seed list still serves when it is down.

---
## INTERIORS — Completion (black-void council rooms) [DIAGNOSIS-FIRST]

**Goal.** Some council interiors — filmed: QUILL's Library and NEXUS's Navigator Core —
render as black rooms with floating UI cards, while their hall shells and furniture exist.
Find the named cause with the probes below, apply ONLY the matching fix, and prove every
one of the 7 council rooms renders lit and furnished.

**USE THESE TOOLS** (nothing else): a browser with DevTools console against the local
server (PORT=8930) realm, `grep -n` on the anchors, `node --check public/world-interiors.js`,
`node tools/build-dist.cjs`. No other file is edited unless a probe verdict names it.

**Files / anchors (`public/world-interiors.js`, 3,631 lines — search, never read whole).**
- Entry API (header, line 6): `window.buildWorldInteriors({ THREE, scene, camera, controls, playerPos, layout })`
  → `{ enter(code), exit(), isInside(), update(dt, t), nearestDoor(x, z) }`.
- Room themes (lines 74–75):
  `NEXUS   : { label: 'NEXUS — Navigator Core',  accent: 0x34e5b0, floor: 0x001a10, propFn: 'serverRoom'    },`
  `QUILL   : { label: 'QUILL — The Library',     accent: 0xb98cff, floor: 0x0d0820, propFn: 'library'       },`
- `function buildRoom(code) {` (line 2602); lazy invocation (line 2705):
  `if (!rooms[uc]) buildRoom(uc);`
- Room lights — EVERY room gets these in buildRoom (lines 2642–2652):
  `var keyLight = new THREE.PointLight(0xfff5e0, 1.0, ROOM_W * 1.4);`
  `var fillLight = new THREE.PointLight(0x4060a0, 0.35, ROOM_W * 1.1);`
  `var rimLight = new THREE.PointLight(theme.accent, 0.60, ROOM_W * 0.90);`
- The working gallery light rig to copy values from (lines 2017–2019):
  `group.add(new THREE.AmbientLight(0xdfeee9, 0.30));`
  `group.add(new THREE.HemisphereLight(0xfff4e0, 0x0a1614, 0.35));`
- K34 hall shells (lines 2662–2676): for every council code
  (`var K34_HALLS      = { SHADDAI: 1, NEXUS: 1, ZEROX: 1, PIKADON: 1, ORACLE: 1, QUILL: 1, TURTLE: 1 };`, line 35)
  the shell loads from `'/assets/kits/shaddai_hall_' + uc.toLowerCase() + '_v01.glb?v=20261023p'`;
  on success it HIDES the code-built shell + hero props (`_hide.forEach(...)` sets
  `o.visible = false`); on failure it warns once and keeps the code hall:
  `}, undefined, function () { _warnOnce('k34:' + uc, 'K34 hall missing for ' + uc + ', code hall kept'); });`
  All 7 GLBs verified on disk in `public/assets/kits/` (160–293 KB each).
- Props dispatch (line ~2658): `var fn = propBuilders[theme.propFn] || propBuilders.genericRoom;`
  then `fn(group, theme.accent);` — an exception here aborts buildRoom BEFORE
  `scene.add(group)` (line ~2683), leaving no room at all.

**Diagnosis protocol (run in order; record every result in the receipt BEFORE editing).**
- **Probe 1 — errors.** Load the realm, open DevTools, enter the QUILL interior
  (walk to QUILL's building, press E at the door). Copy every console line containing
  `[interiors]`, `K34`, or a red error thrown during entry. Repeat for NEXUS.
  → An exception naming a propBuilder or a line inside buildRoom = **Cause A**.
  → A `K34 hall missing` warn = the shell 404'd in the BROWSER (file exists on disk —
  check the Network tab status for the GLB request; a 404 there with the file on disk
  means a path/deploy mismatch, record it and STOP — that is not this item's code fix).
- **Probe 2 — what got hidden.** If no error: in the console, while inside the room, the
  shell may have loaded and hidden the code hall while its own materials render black.
  The shell's material rewrite (in the load callback) only special-cases materials named
  `hall_glass*`/`hall_holo*`; everything else keeps its GLB materials. If the GLB's
  materials are unlit/black under the room's lights, the room reads as a void with the
  code hall hidden underneath. Test: reload the realm with `?halls=0` appended to the
  URL (the built-in off-switch in the K34 condition) and re-enter.
  → Room renders correctly with `?halls=0` = **Cause B** (shell materials).
  → Still black with `?halls=0` = **Cause C** (room lighting/exposure path).
- **Probe 3 — scope.** Enter the other five rooms (SHADDAI, ZEROX, PIKADON, ORACLE,
  TURTLE) normally and record lit/black for each. The fix must close all black rooms,
  not only the two filmed.

**Fixes (apply ONLY the one your probe verdict names).**
- **Cause A — a prop builder throws.** In buildRoom, wrap the props dispatch:
  before:
  ```js
  var fn = propBuilders[theme.propFn] || propBuilders.genericRoom;
  var _p0 = group.children.length;
  fn(group, theme.accent);
  ```
  after:
  ```js
  var fn = propBuilders[theme.propFn] || propBuilders.genericRoom;
  var _p0 = group.children.length;
  try { fn(group, theme.accent); } catch (e) { _warnOnce('props:' + uc, 'props failed for ' + uc + ': ' + (e && e.message)); propBuilders.genericRoom(group, theme.accent); }
  ```
  (If the throw is inside `propBuilders.library`/`serverRoom` itself and a one-line cause
  is visible — e.g. an undefined variable — fixing THAT line is also Cause A; record it.)
- **Cause B — shell renders black.** In the K34 load callback's material traverse
  (anchor: `if (/^hall_glass/.test(nm))`), add a fallback branch for all OTHER shell
  materials so they receive the room's standard treatment instead of raw GLB materials:
  after the `hall_holo` branch, add:
  ```js
  else if (n.material && 'emissiveIntensity' in n.material) { n.material.emissiveIntensity = Math.min(n.material.emissiveIntensity || 0, 0.3); }
  ```
  and if the probe shows the shell's base materials are `MeshBasicMaterial` with black
  colour (check via the GLB: `node ~/workspace/gltf-tools/inspect.mjs <hall glb>` — use
  the tooling in `~/workspace/gltf-tools/`), STOP: that is an asset-side defect, record
  the material table in the receipt; do not rewrite asset materials wholesale in code.
- **Cause C — lights present, room still black.** Add the gallery ambient+hemisphere pair
  to buildRoom immediately AFTER the rimLight block (lines 2642–2652), values copied
  verbatim from lines 2017–2019:
  ```js
  group.add(new THREE.AmbientLight(0xdfeee9, 0.30));
  group.add(new THREE.HemisphereLight(0xfff4e0, 0x0a1614, 0.35));
  ```
  This is room-local (children of the room group, disposed with it). Do NOT raise any
  global/scene ambient — that washes out the outdoor world and is forbidden by the guide.

**Off-switch flag.** Cause A/C fixes: none needed (correctness fixes restoring intended
rendering; the receipt names the cause). Cause B already has `?halls=0`.

**Verify.**
1. `node --check public/world-interiors.js` → exit 0; `node tools/build-dist.cjs --check` → up to date (after rebuild).
2. Browser, local server: enter ALL 7 council interiors one by one. For each record in
   the receipt: room label, lit Y/N, furniture visible Y/N, resident/UI cards visible Y/N,
   any console error. **Expected: 7/7 lit with furniture, 0 entry errors.**
3. Exit and re-enter one room → still lit (no disposed-light regression).

**Pitfalls.**
- Do not touch `world-interior-agents.js` (the K14 staff bots) — a different, working
  system; the guide explicitly forbids editing it for this item.
- Do not touch `world-interiors-v3.js` (a separate interiors system with its own light
  pool) unless a probe proves the black room is a v3 room — Library/Navigator Core are v1
  (themes table above).
- The `_hide` step hiding code props is INTENDED once the shell loads; "props missing"
  with a visible shell is not a bug. Judge blackness by the shell + lights, not by the
  absence of the code-built props.

**Done-when:** the receipt names the proven cause (A/B/C) with probe evidence, the single
matching fix is in, and all 7 council interiors verify lit + furnished with zero entry errors.

---
## VEHICLES + CAMERA — Collision with the realm collider set

**Goal.** On-foot players already collide (the controller resolves against
`world-collision.js`), and the hoverboard already resolves too — but the bike/rideable
mounts do not, so they pass through solid realm structures, and the third-person camera
clips through walls. Extend the EXISTING resolver to ground mounts and add a pull-in
test to the follow camera, using only the primitives that already exist.

**USE THESE TOOLS** (nothing else): `node --check public/world-main.js`,
`grep -n` on the anchors, `node tools/build-dist.cjs`, browser against local server
(PORT=8930) for the verify rides.

**FOUNDER RULE that bounds this item (do not cross it).** `public/world-collision.js`
lines 80–90 (owner directive 2026-07-09, quoted in the file): *"the buildings stay
walkable 1000%"* — sector buildings stand on pillars with open lounges underneath, so
`var BUILDINGS_SOLID = false;` is DELIBERATE. This item collides mounts/camera only
against the colliders that DO exist (the REALM colliders from `layout.realmColliders`,
registered before the BUILDINGS_SOLID early-return, plus hub colliders). **Never set
BUILDINGS_SOLID to true.** Riding/walking through a pillar-lounge stays legal by design.

**Files / anchors.**
- `public/world-collision.js` — reference only, do not edit. Exports (header, lines 16–19):
  `window.WORLD_COLLIDES(x, z)` → boolean; `window.WORLD_RESOLVE_POS(pos)` → mutates
  `pos.x`/`pos.z` in place (slide resolver).
- `public/world-hoverboard.js` — reference only (already correct). Anchor (line 333):
  `if (window.WORLD_RESOLVE_POS) { window.WORLD_RESOLVE_POS(pos); s.x = pos.x; s.z = pos.z; }   // building walls too`
- `public/world-main.js`:
  - On-foot resolve (line 6214) — the pattern to mirror:
    `if (!_pctlOn) { if (window.WORLD_RESOLVE_POS) window.WORLD_RESOLVE_POS(playerPos); else _resolveBuildingCollision(); }`
  - Third-person camera block (lines 6345–6358), anchor lines:
    `_camTarget.set(playerPos.x - fwd.x*(8*_PLAYER_EYE_K), baseY - _pDip + eye + 2.2*_PLAYER_EYE_K, playerPos.z - fwd.z*(8*_PLAYER_EYE_K));`
    `if(camera.position.distanceToSquared(_camTarget) > 1600) camera.position.copy(_camTarget);   // >40u = teleport → snap`
    `else camera.position.lerp(_camTarget, 1 - Math.exp(-9*dt));`
  - Dragon-riding camera (line ~6395): `if(_rideOn()){   // DRAGON RIDING chase cam + seated avatar`
    — EXEMPT from this item (flight camera, its own framing).
  - Mount state: `veh.bike.pose(dt, …)` (line ~6416) and `hover.pose(dt, …)` (line ~6421)
    run after movement; `playerPos` is the shared position all mounts ultimately write.

**Steps.**
1. **Ground-mount resolve.** Immediately AFTER the on-foot resolve anchor (line 6214),
   add — guarded so flying mounts are exempt (colliders are XZ-only with no height, so
   resolving a dragon at altitude would shove it sideways around buildings it is
   legitimately flying over):
   ```js
   // VEHICLE COLLISION (P1-8): ground mounts resolve against the same collider set as
   // on-foot movement. Flying mounts are exempt: colliders are XZ-only, and a dragon
   // above the roofs must not be pushed around by footprints below it.
   // ?vehcollide=0 = pre-fix behaviour.
   if (!/[?&]vehcollide=0/.test(location.search) && window.WORLD_RESOLVE_POS) {
     var _mounted = (typeof veh !== 'undefined' && veh && veh.mode) || (typeof hover !== 'undefined' && hover && hover.isRiding && hover.isRiding());
     if (_mounted) {
       var _gy = window.WORLD_HEIGHT_AT ? window.WORLD_HEIGHT_AT(playerPos.x, playerPos.z) : 0;
       if (playerPos.y - _gy < 3) window.WORLD_RESOLVE_POS(playerPos);
     }
   }
   ```
   Placement rule: this block must run at the same point in the frame as line 6214
   (after movement integration, before the camera block at 6345). If line 6214's exact
   context differs in your branch, anchor on the string
   `if (window.WORLD_RESOLVE_POS) window.WORLD_RESOLVE_POS(playerPos); else _resolveBuildingCollision();`
   and insert directly after the statement it belongs to.
   Note: the hoverboard already resolves internally (line 333 of its file) — resolving
   `playerPos` again here is idempotent (a resolved position resolves to itself), so do
   not special-case it out.
2. **Camera pull-in.** In the third-person block, AFTER the snap/lerp pair (anchor lines
   above) and BEFORE `playerAvatar.visible=!veh.mode;`, insert:
   ```js
   // CAMERA COLLISION (P1-8): walk the head→camera segment in XZ; stop at the last
   // sample that is not inside a collider, so the follow cam never sits inside a wall.
   // ?camcollide=0 = pre-fix behaviour.
   if (!/[?&]camcollide=0/.test(location.search) && window.WORLD_COLLIDES) {
     var _hx = playerPos.x, _hz = playerPos.z;
     var _cx = camera.position.x, _cz = camera.position.z;
     if (window.WORLD_COLLIDES(_cx, _cz)) {
       var _t = 0.95;
       while (_t > 0.1 && window.WORLD_COLLIDES(_hx + (_cx - _hx) * _t, _hz + (_cz - _hz) * _t)) _t -= 0.05;
       camera.position.x = _hx + (_cx - _hx) * _t;
       camera.position.z = _hz + (_cz - _hz) * _t;
     }
   }
   ```
   (XZ-only, matching the collider model; the camera's Y is untouched, so the framing
   height never jumps.)
3. Run `node tools/build-dist.cjs`.

**Off-switch flags.** `?vehcollide=0` (mounts), `?camcollide=0` (camera) — independent,
both default ON.

**Verify.**
1. `node --check public/world-main.js` → exit 0; build-dist check → up to date;
   regression harnesses: `wave1-harness.js` 31/31, `smoke-mobile-wave1.js` 27/27.
2. Browser, local server — collision target: any REALM collider structure (the console
   logs `[world-collision] Built N REALM colliders` at load; the central bazaar stalls
   via `__hubColliders` also resolve). Ride the bike/board INTO a stall/structure:
   → the mount slides/stops at the surface instead of passing through.
   On foot behaviour unchanged (walk into the same structure → same stop as before).
   Fly a dragon over the city → NO sideways shoves at altitude (exemption works).
   Back the third-person camera against a structure (walk toward it, camera behind you)
   → camera pulls in toward your head instead of entering the geometry; move away →
   camera glides back out. With `?camcollide=0` → old clipping returns (flag proven).
   With `?vehcollide=0` → mounts pass through again (flag proven).
3. Record all six observations in the receipt.

**Pitfalls.**
- The resolve mutates `playerPos` in place — inserting step 1 BEFORE movement
  integration (instead of after) makes mounts stick to walls a frame late and can fight
  the dismount resync (wave-1 fix). Keep the anchor placement.
- `veh.mode` is also true during the dragon path in some states — the height exemption
  (`playerPos.y - groundY < 3`) is what protects flight; do not remove it to "simplify".
- Do not add colliders for city-builder buildings in this item: the city plan's
  buildings are not in `layout.realmColliders`, and adding them is the founder's
  BUILDINGS_SOLID decision, not a bug fix.

**Done-when:** ground mounts collide with realm structures, the follow camera never
rests inside a collider, flight is unaffected, and both off-switches restore the old
behaviour exactly.

---
## KTX2 — Phase 0: vendor the loader + transcoder (no asset conversion, nothing wired)

**Goal.** Put three r180's `KTX2Loader` and the Basis transcoder into the vendored tree so
later phases CAN wire them — without referencing them from any code and without
converting a single asset. Phase 0 is provably zero-risk: nothing imports the new files,
so nothing can break. (Why KTX2 at all: WebP shrinks downloads but still decodes to full
RGBA in VRAM; KTX2/Basis stays block-compressed in VRAM — a 4–8× VRAM cut on converted
textures. Full rationale: `FIX_GUIDE_DEEP_RESEARCH.md` §4.)

**USE THESE TOOLS** (nothing else): `npm pack` (registry), `tar`, `cp`, `grep -n "^import"`,
`node --check` is NOT applicable to these module files (they are ES modules with bare
`three` imports — validate by import-resolution inspection, step 4, not by node --check).

**Files.**
- Destination: `public/vendor/three/addons/loaders/KTX2Loader.js` (NEW),
  `public/vendor/three/addons/libs/basis/basis_transcoder.js` (NEW),
  `public/vendor/three/addons/libs/basis/basis_transcoder.wasm` (NEW),
  plus any relative-import closure files (step 4 — expected: `public/vendor/three/addons/utils/WorkerPool.js`).
- Verified current state of the vendored tree: `public/vendor/three/addons/loaders/`
  contains ONLY `DRACOLoader.js` + `GLTFLoader.js`; `addons/libs/` contains ONLY `draco/`
  + `meshopt_decoder.module.js`; `addons/utils/` contains ONLY `BufferGeometryUtils.js`
  + `SkeletonUtils.js`. Vendored three version: `const REVISION = '180';`
  (`public/vendor/three/three.core.js` line 6) → the source package MUST be
  `three@0.180.0` exactly. Do not use any other version.
- Dead end to avoid: `BasisTextureLoader` was removed in three r150 — any tutorial or
  package importing it is useless on r180. `KTX2Loader` is the only path.

**Steps.**
1. In a scratch dir OUTSIDE the repo:
   `mkdir -p /tmp/ktx2src && cd /tmp/ktx2src && npm pack three@0.180.0`
   → expect `three-0.180.0.tgz`. Extract:
   `tar -xzf three-0.180.0.tgz package/examples/jsm/loaders/KTX2Loader.js package/examples/jsm/libs/basis/`
   If `npm pack` fails (no network), STOP and record it — the loader cannot be sourced
   from the trimmed three copy in `~/workspace/gltf-tools/node_modules` (verified: it
   contains no KTX2Loader and no basis transcoder). Do not hand-write a substitute.
2. Copy into the repo:
   `cp /tmp/ktx2src/package/examples/jsm/loaders/KTX2Loader.js ~/workspace/shaddai-repo/public/vendor/three/addons/loaders/`
   `mkdir -p ~/workspace/shaddai-repo/public/vendor/three/addons/libs/basis`
   `cp /tmp/ktx2src/package/examples/jsm/libs/basis/basis_transcoder.js /tmp/ktx2src/package/examples/jsm/libs/basis/basis_transcoder.wasm ~/workspace/shaddai-repo/public/vendor/three/addons/libs/basis/`
3. Record provenance: create `public/vendor/three/addons/libs/basis/PROVENANCE.txt`:
   ```
   Source: npm package three@0.180.0 (matches vendored three REVISION 180).
   Files: examples/jsm/loaders/KTX2Loader.js, examples/jsm/libs/basis/basis_transcoder.js,
          examples/jsm/libs/basis/basis_transcoder.wasm (+ import closure, see below).
   Vendored: <today's date> — KTX2 phase 0. Not yet imported by any realm code.
   three.js licence: MIT (see the package LICENSE file).
   ```
4. **Import closure.** Run `grep -n "^import" public/vendor/three/addons/loaders/KTX2Loader.js`.
   For every RELATIVE import (starting `./` or `../`), resolve it against the vendored
   tree; for any file missing, copy it from the same extracted package path
   (e.g. `../utils/WorkerPool.js` → `package/examples/jsm/utils/WorkerPool.js` →
   `public/vendor/three/addons/utils/WorkerPool.js`) and repeat the grep on the newly
   copied file until every relative import resolves to a file that exists in the tree.
   Bare `three` imports are fine (the page importmap resolves them). List every file you
   copied in PROVENANCE.txt and in the receipt.
5. Change NOTHING else. No importmap edits, no loader wiring, no asset conversion, no
   script tags. `git status` for this item must show ONLY new files under
   `public/vendor/three/`.

**Off-switch flag.** None — inert files. (Later phases introduce `?ktx2=1`; not here.)

**Verify.**
1. `ls -la public/vendor/three/addons/loaders/KTX2Loader.js public/vendor/three/addons/libs/basis/` → all three files present, wasm > 100 KB.
2. The closure grep from step 4 ends with zero unresolved relative imports (record the
   final import list in the receipt).
3. `grep -rn "KTX2Loader" public --include="*.js" --include="*.html" | grep -v "vendor/three"` → **zero hits** (nothing references it yet — that is the phase-0 invariant).
4. Realm still boots from the local server with zero new console errors (the vendored
   files are never loaded, so any new error means you touched something else — STOP).

**Pitfalls.**
- Version skew: a KTX2Loader from any other three version can import symbols r180's
  core doesn't export. The `REVISION = '180'` check + `three@0.180.0` pack are the guard.
- The transcoder path convention for later phases is `/vendor/three/addons/libs/basis/`
  (the realm self-hosts its vendor tree; there is no `/libs/basis/` route). Do not
  "pre-wire" it in this phase.
- `.wasm` must be served as `application/wasm` when phase 1 arrives — note it in the
  receipt as a phase-1 checklist item; do not change server code now.

**Done-when:** KTX2Loader + transcoder + full import closure sit unused in the vendored
tree, provenance recorded, and grep proves zero references from realm code.

---
## ORPHANS BEHIND FLAGS — general pattern (applies to all five subsections)

Each orphan module below is complete, tested-in-isolation code that nothing loads.
Every wiring follows the SAME five moves; the subsections only name what differs.

1. **Load the module**: add ONE script tag inside the `#boot-scripts` template of
   `public/SHADDAI-WORLD-3D.html` (template starts at the anchor
   `<template id="boot-scripts">`, line 347), immediately before the closing
   `</template>`, with a version tag in the house style, e.g.
   `<script src="/world-weapons.js?v=20261115a"></script>   <!-- ORPHAN WIRING: weapons behind ?weapons=1 -->`
2. **Rebuild**: `node tools/build-dist.cjs` (the template is concatenated into the boot
   bundles; without this step the file never reaches the browser).
3. **Gate the behaviour**: the module's own code stays untouched; the CALL SITE checks
   the item's flag (`/[?&]<flag>=1/.test(location.search)`) before invoking anything.
   Flag absent = the module loads, defines its global, and does nothing — byte-for-byte
   today's behaviour.
4. **Fail soft**: every wiring call sits in `try { … } catch (e) { console.warn(…) }`,
   matching the codebase's guarded-call style. A wiring bug must never break body
   loading, combat, or movement.
5. **Verify both ways**: flag OFF → no visible change + no new console errors;
   flag ON → the subsection's expected behaviour.

### ORPHAN 1 — Weapons (`world-weapons.js`) — flag `?weapons=1`

**Goal.** The 7 council agents' signature weapons exist as buildable code with zero
consumers. Behind the flag, each loaded council body gets its weapon built and attached
(sheathed), so the founder can see them on the real rigs.

**Files / anchors.**
- `public/world-weapons.js` — reference only, do not edit. Header API:
  `const w = window.buildAgentWeapon({ THREE, agent: 'zerox', palette? });`
  `window.attachWeapon(w, skeletonRoot, { hand:'right', forward?, unitsPerMetre?, socket?, sheathed? })`
  `window.WEAPON_AGENTS` = `['zerox', 'nexus', 'pikadon', 'oracle', 'turtle', 'quill', 'shaddai']` (line 19, lowercase).
- `public/world-main.js` — attach site: inside `_nextAgentBody`'s load callback, directly
  AFTER the anchor lines:
  `entry.body = body; entry.bodyBaseY = body.position.y;`
  At that point `body` is scaled, seated, added to the scene, and `code` (uppercase
  codename) is in scope.

**Steps.**
1. Load the module (general pattern, src `/world-weapons.js`).
2. In world-main.js after the anchor, insert:
   ```js
   // ORPHAN WIRING — weapons (?weapons=1): build + sheathe this agent's signature
   // weapon on the loaded body. Default OFF: no call, no cost, no visual change.
   if (/[?&]weapons=1/.test(location.search) && window.buildAgentWeapon && window.attachWeapon) {
     try {
       var _wc = code.toLowerCase();
       if ((window.WEAPON_AGENTS || []).indexOf(_wc) >= 0) {
         var _w = window.buildAgentWeapon({ THREE: THREE, agent: _wc });
         if (_w) window.attachWeapon(_w, body, { hand: 'right', sheathed: true });
       }
     } catch (e) { console.warn('[weapons] attach failed for ' + code, e && e.message); }
   }
   ```
3. Build-dist.

**Verify.** `node --check public/world-main.js` → 0; build-dist check → up to date;
harnesses 31/31 + 27/27. Browser: realm WITHOUT flag → 7 council bodies, no weapons, no
`[weapons]` console lines. With `?weapons=1` → each council body carries its sheathed
weapon on the back (SHADDAI's is `mode:'hide'` by the module's own table — no visible
weapon for SHADDAI is CORRECT, do not "fix" it); weapons follow walk/idle animation
(parented to bones); zero attach-failure warnings for the 6 visible carriers.

**Pitfalls.** The inventory flags "needs visual bone check": if a weapon attaches at a
wrong scale/orientation on ONE rig, record agent + screenshot in the receipt and leave
it — per-rig socket tuning is a follow-up, not a blocker for the wiring. Never edit
world-weapons.js tables in this item.

**Done-when:** flag off = identical realm; flag on = 6 sheathed weapons riding the
council bodies' animation with zero console errors.

### ORPHAN 2 — Agent gear (`world-agent-gear.js`) — flag `?gear=1`

**Goal.** The K16 accessory kit (caps, visors, halos, chains, capes…) loads and equips
programmatically, but nothing calls it and no loadout data exists. Behind the flag, wire
the load + equip path so the founder can preview gear on the council bodies and dictate
the real loadout from what he sees.

**Files / anchors.**
- `public/world-agent-gear.js` — reference only. Header API:
  `WorldAgentGear.load(THREE, GLTFLoader) → Promise<[names]>`
  `WorldAgentGear.items → [{ name, slot, bone }]`
  `WorldAgentGear.equip(model, name) → Object3D | null`
  Kit URLs (line ~17): `var URLS = ['/assets/kits/shaddai_accessories_v01.glb', '/assets/kits/shaddai_weapons_v01.glb'];`
- `public/world-main.js` — same attach site as Weapons (after
  `entry.body = body; entry.bodyBaseY = body.position.y;`). The GLTFLoader class in
  scope in world-main is the module-imported `GLTFLoader` (used at line 738:
  `const agentBodyLoader = new GLTFLoader(__loadMgr);`).

**FOUNDER-GATED sub-part.** The per-agent loadout (which agent wears what) is a taste
decision that does not exist anywhere. This item therefore ships the wiring with a
**preview loadout only**: `?gear=1` equips NOTHING by default; `?gear=preview` equips
each body with the FIRST item of every slot the kit provides (deterministic from
`WorldAgentGear.items` order) so the founder sees the full kit on real bodies and can
dictate the production loadout, which then becomes a one-object edit
(`window.__GEAR_LOADOUT = { ZEROX: ['acc_…', …], … }` read by the wiring if present).
Do not invent a production loadout.

**Steps.**
1. Load the module (general pattern, src `/world-agent-gear.js`).
2. In world-main.js after the anchor, insert:
   ```js
   // ORPHAN WIRING — agent gear (?gear=1 load only, ?gear=preview equips first-per-slot,
   // or window.__GEAR_LOADOUT = { CODENAME: [itemName, …] }). Default OFF.
   if (/[?&]gear=(1|preview)/.test(location.search) && window.WorldAgentGear) {
     try {
       window.WorldAgentGear.load(THREE, GLTFLoader).then(function () {
         try {
           var _names = null;
           var _lo = window.__GEAR_LOADOUT && window.__GEAR_LOADOUT[code];
           if (Array.isArray(_lo)) _names = _lo;
           else if (/[?&]gear=preview/.test(location.search)) {
             var _seen = {}; _names = [];
             (window.WorldAgentGear.items || []).forEach(function (it) { if (!_seen[it.slot]) { _seen[it.slot] = 1; _names.push(it.name); } });
           }
           if (_names) _names.forEach(function (n) { try { window.WorldAgentGear.equip(body, n); } catch (e) {} });
         } catch (e) { console.warn('[gear] equip failed for ' + code, e && e.message); }
       });
     } catch (e) { console.warn('[gear] load failed', e && e.message); }
   }
   ```
3. Build-dist.

**Verify.** Checks as Weapons. Browser: no flag → nothing loads (Network: no
`shaddai_accessories_v01.glb` request). `?gear=1` → kit GLBs load, no visible change.
`?gear=preview` → every council body wears one item per slot; items follow animation;
`WorldAgentGear.equipped(body)`-equivalent state is visible (items parented to bones).
Zero `[gear]` warnings except a kit-404 warn if a GLB is missing (record it — the two
kit files must exist in `public/assets/kits/`; verify with `ls` BEFORE running and note
the result in the receipt).

**Pitfalls.** `equip()` puts the skeleton in bind pose momentarily — it is called on a
freshly loaded body before its mixer starts, which is why the wiring lives at this
anchor and nowhere later. Do not move it into the animation loop.

**Done-when:** three flag states behave exactly as specified and the receipt records the
kit file presence check + the preview screenshot verdict for the founder's loadout call.

### ORPHAN 3 — Combat core (`world-combat-core.js`) — flag `?combat=1`

**Goal.** `WorldCombatCore` is a complete deterministic combat rules engine (combos,
stamina, parry, hit-stop as data) with no consumer; the realm's combat is ad-hoc
(`_updateCombat` in world-main). Behind the flag, run the core in SHADOW mode — fed by
the same inputs, logging its verdicts — so its behaviour can be compared against the
live combat before anyone considers switching authority.

**Files / anchors.**
- `public/world-combat-core.js` — reference only. Header API:
  `var f = WorldCombatCore.create({ cfg?, dodge?: WorldDodge, rng?, stamina?: {get(), spend(n), regen?(n)} });`
  `f.input('light'|'heavy'|'roll'|'block'|'release-block'|'move'|'stop') -> bool`
  `f.step(dt)` · `f.hit({dmg, dir:{x,z}, kind, poise?}) -> {applied, dmg, stopMs, …}` ·
  `f.state() · f.hp() · f.stamina()`
- `public/world-main.js` — the live combat it shadows (line 4437):
  `function _updateCombat(dt){` … called every frame at line 6341:
  `_updateCombat(dt);   // projectiles + static-body lunge/flip fallback (always runs)`

**Steps.**
1. Load the module (general pattern, src `/world-combat-core.js`).
2. Create the shadow instance + input feed. Immediately BEFORE `function _updateCombat(dt){`
   insert:
   ```js
   // ORPHAN WIRING — combat core SHADOW mode (?combat=1): the deterministic core runs
   // beside the live ad-hoc combat and logs its state machine; it has NO authority —
   // nothing in the live path reads it. Replacement is a separate founder decision.
   var _combatCore = null;
   if (/[?&]combat=1/.test(location.search) && window.WorldCombatCore) {
     try {
       _combatCore = window.WorldCombatCore.create({});
       _combatCore.on('state', function (e) { console.log('[combat-core] state', e.from, '->', e.to); });
       _combatCore.on('hit', function (e) { console.log('[combat-core] hit', e); });
       console.log('[combat-core] shadow mode ON (?combat=0 / no flag = off)');
     } catch (e) { console.warn('[combat-core] init failed', e && e.message); _combatCore = null; }
   }
   ```
   (Verified: the object `create()` returns includes `on: on` — see the return literal
   at the end of `create` in world-combat-core.js — and it emits `'hit'` and `'state'`
   transitions via its internal `emit`. The try/catch stays as belt-and-braces.)
3. Feed it: inside `_updateCombat(dt)`, as its FIRST statement add:
   `if (_combatCore) { try { _combatCore.step(dt); } catch (e) { _combatCore = null; } }`
   and find where the live path detects a player light/heavy attack (search within
   `_updateCombat` and its input handlers for the attack trigger — the projectile/lunge
   spawn). At that exact point add ONE line:
   `if (_combatCore) { try { _combatCore.input('light'); } catch (e) {} }`
   If you cannot identify the attack trigger with certainty, STOP the input-feed part,
   ship only steps 1–2 + the step() feed, and record that in the receipt — a shadow that
   only ticks is still a valid comparison harness for `hit()` calls driven from the
   console (`window.__combatCore` — expose it: add `window.__combatCore = _combatCore;`
   after creation).
4. Build-dist.

**Off-switch flag.** `?combat=1` opts IN; absence = off (this orphan's flag is an
opt-in by design — the general pattern's "flag present = on" applies).

**Verify.** Checks as Weapons. Browser with `?combat=1`: console shows
`[combat-core] shadow mode ON`; from the console,
`__combatCore.input('light')` returns true and a `[combat-core] state` log follows;
`__combatCore.state()` advances as you call `__combatCore.step(0.016)` repeatedly;
live combat behaves EXACTLY as without the flag (same projectiles, same damage).
Without the flag: no `[combat-core]` lines at all.

**Pitfalls.** Shadow mode must never become authority by accident: do not read
`_combatCore` anywhere else in world-main in this item. The core is deterministic
(no Math.random) — do not pass a random rng.

**Done-when:** the core ticks and transitions under the flag, logs are clean, and live
combat is provably unchanged with and without the flag.

### ORPHAN 4 — Fishing (`world-fishing.js`) — flag `?fishing=1`

**Goal.** The fishing rules (species, bite rolls, the tension fight, rewards) are pure
functions with no host. Build the thin host: stand at the city river, press F, play the
tension fight the rules define, and bank the rewards the rules compute — all behind the flag.

**Files / anchors.**
- `public/world-fishing.js` — reference only. Export (line 68):
  `root.WorldFishing = { SPECIES: SPECIES, RODS: RODS, GREEN: GREEN, fishLengthCm: fishLengthCm, fishValue: fishValue, rollBite: rollBite, rollWeight: rollWeight, createFight: createFight, rewards: rewards, timeK: timeK }`
  Rules contract (header): `rollBite(water, hour, realm, rng, rod) -> species id | null`
  (water: 'shallows'|'reef'|'pier'|'bay'|'deep'; realm: 'coast'|'arctic'|'river'|'void'),
  `createFight(id, kg, rodTier, rng) -> { step(dt, reeling) -> {state, tension, dist, stamina} }`,
  states `fighting | caught | broke | escaped`; GREEN band is `[0.35, 0.7]` (`GREEN`).
- `public/world-rivers.js` — reference only. The river water test (line 73):
  `root.__rivers = { at: at, segments: segs.length };` — `__rivers.at(x, z)` returns the
  water height at a point on a river ribbon, or `null` off-river.
- `public/sparks-ledger.js` — reference only. `window.ShdSparks` with
  `.add(n, kind, note)` / `.spend(n, kind, note)` / `.get()` (header lines 10–11) — the
  same client ledger skatejam uses for its rewards.
- NEW `public/world-fishing-host.js` — the host you write (skeleton in step 2).
- Player position source: the host takes `getPlayer` the same way world-navi-chat does
  (`WorldNaviChat.start({ getPlayer })` pattern) — in world-main, find where
  `WorldNaviChat.start` is called and reuse the same getter expression.

**Steps.**
1. Load BOTH modules in the boot template (general pattern): `world-fishing.js` then
   `world-fishing-host.js`, in that order.
2. Create `public/world-fishing-host.js`:
   ```js
   /* world-fishing-host.js — thin host for WorldFishing (pure rules) at the city river.
    * ?fishing=1 only. Near river water (window.__rivers.at) an [F] prompt appears;
    * F casts: rollBite after a 2–6 s wait; on a bite, createFight runs — HOLD Space (or
    * mouse) to reel, release to ease; keep tension in the GREEN band. Caught fish pay
    * WorldFishing.rewards() Sparks via ShdSparks and are stored in shd_fish_bag_v1. */
   (function (root) {
     'use strict';
     if (!/[?&]fishing=1/.test(location.search)) return;         // flag OFF: define nothing, do nothing
     var F = root.WorldFishing; if (!F) return;
     var getPlayer = null, state = 'idle', fight = null, cur = null, castAt = 0, biteAt = 0;
     var el = null, bar = null;
     function ensureUi() {
       if (el) return;
       el = document.createElement('div');
       el.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:9500;display:none;text-align:center;color:#e9f4ee;font-family:Rajdhani,sans-serif;pointer-events:none';
       el.innerHTML = '<div id="fishPrompt" style="font-size:18px;text-shadow:0 2px 8px #000"></div>'
         + '<div style="width:240px;height:10px;background:rgba(255,255,255,.15);border-radius:5px;margin:8px auto;overflow:hidden"><div id="fishBar" style="height:100%;width:0%;background:#34e5b0"></div></div>';
       document.body.appendChild(el); bar = el.querySelector('#fishBar');
     }
     function prompt(txt) { ensureUi(); el.style.display = txt ? 'block' : 'none'; el.querySelector('#fishPrompt').textContent = txt || ''; }
     function nearWater() { var p = getPlayer && getPlayer(); if (!p || !root.__rivers) return false; return root.__rivers.at(p.x, p.z) != null; }
     function hourNow() { return new Date().getHours() + new Date().getMinutes() / 60; }
     function cast() {
       state = 'waiting'; castAt = performance.now(); biteAt = castAt + 2000 + Math.random() * 4000;
       prompt('Casting…');
     }
     function startFight(id) {
       var kg = F.rollWeight(id, Math.random);
       cur = { id: id, kg: kg };
       fight = F.createFight(id, kg, 1, Math.random);
       state = 'fighting'; prompt('Fish on! HOLD Space to reel — keep the bar in the green');
     }
     function finish(st) {
       if (st === 'caught' && cur) {
         var r = F.rewards(cur.id, cur.kg, Math.random);
         if (root.ShdSparks && r.sparks) root.ShdSparks.add(r.sparks, 'fishing', cur.id);
         try { var bag = JSON.parse(localStorage.getItem('shd_fish_bag_v1') || '[]'); bag.push({ id: cur.id, kg: cur.kg, cm: Math.round(r.length_cm), at: Date.now() }); localStorage.setItem('shd_fish_bag_v1', JSON.stringify(bag.slice(-100))); } catch (e) {}
         prompt('Caught ' + (F.SPECIES[cur.id] ? F.SPECIES[cur.id].name : cur.id) + ' — ' + cur.kg.toFixed(2) + ' kg · +' + r.sparks + ' Sparks');
       } else prompt(st === 'broke' ? 'Line snapped!' : 'It got away…');
       state = 'idle'; fight = null; cur = null;
       setTimeout(function () { if (state === 'idle') prompt(''); }, 2600);
     }
     var reeling = false;
     addEventListener('keydown', function (e) {
       if (e.code === 'KeyF' && state === 'idle' && nearWater()) cast();
       if (e.code === 'Space') reeling = true;
     });
     addEventListener('keyup', function (e) { if (e.code === 'Space') reeling = false; });
     addEventListener('mousedown', function () { reeling = true; });
     addEventListener('mouseup', function () { reeling = false; });
     var last = performance.now();
     (function tick() {
       requestAnimationFrame(tick);
       var now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
       if (state === 'idle') { if (nearWater()) prompt('[F] Fish'); else if (el && el.style.display !== 'none' && !fight) prompt(''); return; }
       if (state === 'waiting') { if (now >= biteAt) {
         var id = F.rollBite('shallows', hourNow(), 'river', Math.random, 1);
         if (id) startFight(id); else { state = 'idle'; prompt('No bite this time'); setTimeout(function () { if (state === 'idle') prompt(''); }, 1800); }
       } return; }
       if (state === 'fighting' && fight) {
         var s = fight.step(dt, reeling);
         if (bar) { bar.style.width = Math.round(s.tension * 100) + '%'; bar.style.background = (s.tension >= F.GREEN[0] && s.tension <= F.GREEN[1]) ? '#34e5b0' : (s.tension > 0.9 ? '#ff5a6e' : '#e8c45c'); }
         if (s.state !== 'fighting') finish(s.state);
       }
     })();
     root.WorldFishingHost = { start: function (o) { getPlayer = (o && o.getPlayer) || getPlayer; } };
   })(typeof window !== 'undefined' ? window : globalThis);
   ```
3. Wire the start: in world-main.js, next to the `WorldNaviChat.start(...)` call site,
   add: `if (window.WorldFishingHost) { try { WorldFishingHost.start({ getPlayer: <same getter expression as the navi-chat call> }); } catch (e) {} }`
   Copy the getter expression verbatim from the navi-chat call — do not invent a new one.
4. Build-dist.

**Verify.** Checks as Weapons (harness subset: 31/31). Browser with `?fishing=1`:
stand on a river bank ribbon → `[F] Fish` prompt appears; F → cast; on bite, hold/release
Space keeps tension in the green; a caught fish shows the toast text, the Sparks header
balance rises by the reward, and `localStorage shd_fish_bag_v1` gains the entry.
Without the flag: no prompt anywhere, no `WorldFishingHost` global.

**Pitfalls.** `rollBite` can return null (that's the "No bite" path — handled). The
fight's `step` expects `reeling` as a boolean each frame — the host's rAF loop is the
only driver; never call `step` from the key handlers. Rod tier is fixed at 1 (Hand Line)
in this item — rod upgrades are a shop decision, not wiring.

**Done-when:** a full cast→bite→fight→caught loop pays the rules-computed reward at the
river, and the realm without the flag is untouched.

### ORPHAN 5 — Castle siege (`world-castle-siege.js`) — flag `?siege=1`

**Goal.** Castle Siege Day's rules are complete — schedule, phases, activation gate —
and deliberately DORMANT until the server is big enough (the module's own owner rule:
`ACTIVATE_MIN = 50` active players). Behind the flag, surface the real schedule + status
in the realm so players can see the countdown and the unlock condition. The battle
itself (spawning 5 dragons and fighting them) needs a damage source and dragon-fight
integration that do not exist — that part is FOUNDER-GATED, not part of this item.

**Files / anchors.**
- `public/world-castle-siege.js` — reference only. Export (line 62):
  `root.WorldCastleSiege = { ACTIVATE_MIN: ACTIVATE_MIN, status: status, DRAGONS: DRAGONS, nextStart: nextStart, phase: phase, create: create, LIVE_MIN: LIVE_MIN, GATHER_MIN: GATHER_MIN, ANNOUNCE_H: ANNOUNCE_H }`
  `nextStart(nowMs)` defaults: Saturday (`dow = 6`), 20:00 UTC, weekly.
  `status(now, start, activeUsers, min)` → `{ phase: 'dormant'|…, active, need, have, message }`
  with the dormant message built in: `'Castle Siege Day unlocks at ' + need + ' active players (now ' + have + ')'`.
- `public/world-navi-chat.js` — ONE additive line (step 2): its sync response already
  carries the online count (`d.online` — the multiplayer sync returns
  `{ ok, online, players, chat }`). Anchor (line 38, inside syncAll's `.then`):
  `if (!d || d.ok !== true) throw new Error('not ok');`
- NEW `public/world-siege-driver.js` — the surface (skeleton in step 3).

**Steps.**
1. Load `world-castle-siege.js` in the boot template (general pattern), then
   `world-siege-driver.js` after it.
2. In world-navi-chat.js, immediately after the anchor line, add:
   `root.__mpOnline = d.online || 0;   // read by the siege driver (?siege=1); additive, no behaviour change`
3. Create `public/world-siege-driver.js`:
   ```js
   /* world-siege-driver.js — Castle Siege Day schedule/status surface (?siege=1).
    * The rules (world-castle-siege.js) stay dormant until ACTIVATE_MIN active players
    * BY DESIGN (owner gate in the rules module). This driver only SURFACES the real
    * schedule + status on a corner chip, refreshed every 30 s from the mp online count
    * that world-navi-chat already receives. It never starts a battle. */
   (function (root) {
     'use strict';
     if (!/[?&]siege=1/.test(location.search)) return;
     var S = root.WorldCastleSiege; if (!S) return;
     var el = document.createElement('div');
     el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9400;max-width:300px;padding:10px 14px;border-radius:12px;background:rgba(6,8,11,.88);border:1px solid rgba(155,89,245,.55);color:#e9f4ee;font-family:Rajdhani,sans-serif;font-size:14px;pointer-events:none';
     document.body.appendChild(el);
     function fmt(ms) { var s = Math.max(0, Math.floor(ms / 1000)); var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + 'd ' : '') + h + 'h ' + m + 'm'; }
     function render() {
       var now = Date.now(), start = S.nextStart(now), st = S.status(now, start, root.__mpOnline || 0);
       var when = new Date(start).toUTCString().replace('GMT', 'UTC');
       el.innerHTML = '<b style="color:#9b59f5">🏰 CASTLE SIEGE DAY</b><br>'
         + 'Next siege: ' + when + ' (in ' + fmt(start - now) + ')<br>'
         + (st.active ? 'Phase: ' + st.phase : (st.message || 'Dormant'));
     }
     render(); setInterval(render, 30000);
     root.WorldSiegeDriver = { status: function () { var now = Date.now(); return S.status(now, S.nextStart(now), root.__mpOnline || 0); } };
   })(typeof window !== 'undefined' ? window : globalThis);
   ```
4. Build-dist (both new tags + navi-chat edit are boot-bundle files).

**Verify.** Checks as Weapons; `node --check public/world-navi-chat.js` → 0. Browser
with `?siege=1` and a Navi chat name set (so sync runs): the chip shows the next
Saturday 20:00 UTC, a live countdown, and the dormant message with the real online
count (`now 1` solo). `WorldSiegeDriver.status().phase` in the console → `'dormant'`.
Without the flag: no chip; navi-chat behaves exactly as before (the `__mpOnline` line
is the only change and nothing else reads it).

**FOUNDER-GATED (explicitly NOT in this item):** the live battle — spawning the 5
dragons from `buildWorldDragons`, routing player damage into `create().hit(pid, did, dmg)`,
and paying the drops table. It needs a combat-authority decision (see combat-core orphan)
and dragon-fight design. The driver surfaces schedule/status only, by design.

**Pitfalls.** Do NOT lower `ACTIVATE_MIN` to "test the battle" — the 50-player gate is
the owner's rule written into the module. Do not fake the online count; solo testing
correctly shows dormant.

**Done-when:** the chip renders the true schedule + dormant status from live sync data,
and nothing about the battle is simulated or faked.

---
## C-6 — PVS-lite for low dressing, from the existing height raster

**Goal.** In the dense city core, whole cells of LOW dressing (street props, fabric
lod2, fill) are drawn even when a wall of buildings makes them impossible to see. Use
the already-built `WorldCityHeights` raster to prove — conservatively, per cell pair —
that a low cell cannot be seen from the camera's cell, and hide only those.

**Prerequisite.** C-5 (city builder v2: 250 m cells + per-tier instanced sets) must be
DONE first — PVS-lite hides C-5's per-cell groups. If C-5 is not in your branch, STOP
this item. (Queue order in PROGRAM_QUEUE.md puts C-6 after C-5 for this reason.)

**USE THESE TOOLS** (nothing else): `node --check` on touched/new files, the realm's own
perf instrument (`?perf=1` → `window.__perfSplit` + `renderer.info.render.calls`),
`node tools/build-dist.cjs`, browser against local server (PORT=8930).

**Files / anchors.**
- `public/world-city-heights.js` — reference only. Export (line 106):
  `if (root) root.WorldCityHeights = api;` with `build({ plan, footprints?, U?, cell? })`
  / `buildAsync(...)` returning an object with `topAt(x, z)` (top height of the tallest
  building footprint at a point, −Infinity/none where no building).
- `public/world-main.js` — the raster's lifecycle (line 5757): it is built lazily via
  `window.WorldCityHeights.buildAsync({ plan: plan, U: V4_U, cell: 2 })` inside the
  race-track boot chain, and prebuilt at idle after spawn (line ~5776,
  `// WAVE2 (issue #4): idle prebuild of the city-heights raster after spawn`).
  The built instance is held in that chain's scope (variable `CHx` — see line 5766:
  `return CHx.topAt;`). **Step 1 exposes it; nothing else in world-main changes.**
- `public/world-clusters-v4.js` — the cell convention to reuse (line 212):
  `var ck = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);` and the safety-margin
  pattern (line 259): `var CELL_R = Math.hypot(CELL * 0.75, 170 * U) * 1.6;`
- C-5's city builder v2 (in `public/world-city-builder.js` on the C-5 branch) — the
  registration target: its per-cell groups. The C-5 spec's cell size is 250 m; PVS uses
  the same 250 m grid in WORLD units: `CELL = 250 * (7 / 1.8)` (the realm's U — verify
  against C-5's own constant and use ITS value if it differs; record which you used).
- NEW `public/world-pvs-lite.js` — the whole feature (skeleton in step 3).

**Design rules (finite — do not redesign).**
- Only content registered as LOW participates. "Low" = the registered object's own
  bounding height ≤ 15 m (above its cell's ground). Towers/tall content are never
  registered, never hidden.
- A cell is hidden ONLY when blocked at EVERY sample: sample the camera→cell-centre
  segment at 8 equally spaced points; at each sample, compute the sightline height
  (linear from camera eye height to the target cell's registered top height) and the
  raster height `topAt` at that point; the sample is "blocked" iff
  `topAt(sample) > sightlineHeight + 2` (2 m safety margin, world units as `topAt`
  returns them — use the same unit space `topAt` is called with elsewhere:
  world units, see line 5766's wrapper converting race coords; call it with world
  x/z exactly as the race path's outer callers do).
- Recompute at most every 500 ms, and only when the camera has moved ≥ 10 m since the
  last computation or the raster instance changed.
- Fail open: no raster yet, any exception, or `topAt` missing → everything visible.

**Steps.**
1. In world-main.js, where the city-heights build resolves (the `.then` chain at line
   5757 that produces `CHx`), add ONE line after the instance exists:
   `window.__cityHeights = CHx;   // C-6: PVS-lite reads the raster from here`
   Anchor on the string `obstacleAt: city ? (function(){ const tun =` (line 5766) —
   the assignment belongs in the same scope, immediately before the object literal that
   consumes `CHx.topAt` is built. If the chain's shape differs in your branch, find the
   single place the built instance is first assigned and put the line there; record the
   anchor you used.
2. In C-5's city builder, at the point each per-cell LOW group is created, register it:
   `if (window.WorldPVS) window.WorldPVS.register(group, { low: true });`
   (One line per creation site; if C-5 creates cells in one loop, it is one line.)
   The register call must be safe before world-pvs-lite.js loads — hence the guard.
3. Create `public/world-pvs-lite.js`:
   ```js
   /* world-pvs-lite.js — C-6: hide LOW per-cell dressing that the WorldCityHeights
    * raster PROVES invisible from the camera's current position. Conservative by
    * construction: a cell hides only when every one of 8 sightline samples is blocked
    * by raster height above the sightline + 2 units. Tall content is never registered.
    * ?pvslite=0 = off (everything visible, as before). Fails open on any doubt. */
   (function (root) {
     'use strict';
     if (/[?&]pvslite=0/.test(location.search)) { root.WorldPVS = { register: function () {} }; return; }
     var CELL_M = 250, U = 7 / 1.8, CELL = CELL_M * U, MAX_LOW_H = 15 * U, SAMPLES = 8, MARGIN = 2 * U;
     var cells = {};   // "cx,cz" -> { obj, topY, cx, cz }
     var tmpBox = null;
     function key(cx, cz) { return cx + ',' + cz; }
     function register(obj, opts) {
       try {
         if (!obj || !opts || !opts.low) return;
         if (!tmpBox && root.__THREE__) tmpBox = new root.__THREE__.Box3();
         var box = tmpBox ? tmpBox.setFromObject(obj) : null;
         if (!box) return;
         var h = box.max.y - box.min.y;
         if (!(h <= MAX_LOW_H)) return;                       // tall content: exempt forever
         var cx = Math.floor((box.min.x + box.max.x) / 2 / CELL), cz = Math.floor((box.min.z + box.max.z) / 2 / CELL);
         cells[key(cx, cz)] = { obj: obj, topY: box.max.y, cx: cx, cz: cz };
       } catch (e) { /* fail open */ }
     }
     var lastX = 1e12, lastZ = 1e12, lastAt = 0;
     function update(camera) {
       try {
         var H = root.__cityHeights; if (!H || !H.topAt || !camera) return;
         var now = performance.now();
         var cp = camera.position;
         if (now - lastAt < 500 && Math.hypot(cp.x - lastX, cp.z - lastZ) < 10) return;
         lastAt = now; lastX = cp.x; lastZ = cp.z;
         var eyeY = cp.y;
         for (var k in cells) {
           var c = cells[k];
           var tx = (c.cx + 0.5) * CELL, tz = (c.cz + 0.5) * CELL;
           var blocked = true;
           for (var i = 1; i <= SAMPLES; i++) {
             var t = i / (SAMPLES + 1);
             var sx = cp.x + (tx - cp.x) * t, sz = cp.z + (tz - cp.z) * t;
             var sightY = eyeY + (c.topY - eyeY) * t;
             var top = H.topAt(sx, sz);
             if (!(top > sightY + MARGIN)) { blocked = false; break; }
           }
           if (c.obj.visible === blocked) c.obj.visible = !blocked;
         }
       } catch (e) { /* fail open: leave visibility as-is */ }
     }
     root.WorldPVS = { register: register, update: update, _cells: cells };
   })(typeof window !== 'undefined' ? window : globalThis);
   ```
   Notes that are part of the spec: `root.__THREE__` — check how other world modules
   obtain THREE (most receive it via their build function's opts). If no `__THREE__`
   global exists, change register to accept the Box3 from the caller: C-5's builder
   passes its own THREE in opts (`register(group, { low: true, THREE: THREE })`) and
   the skeleton uses `opts.THREE.Box3`. Pick whichever the codebase actually supports —
   grep `__THREE__` first; record the choice. Also confirm `topAt`'s unit space by
   reading world-city-heights.js's api before wiring: if `topAt` expects metres
   (plan space) instead of world units, convert sample points with `/ U` and heights
   with `* U` in exactly one place (the `H.topAt(sx, sz)` call + `top` comparison) and
   record it. Do not guess — the file documents its inputs.
4. Drive it: in world-main.js's main loop, next to the other per-frame system updates,
   add `if (window.WorldPVS) window.WorldPVS.update(camera);` (the 500 ms + movement
   gates inside make it cheap). Load `world-pvs-lite.js` in the boot template
   (orphan-pattern step 1) AFTER the city builder's tag.
5. Build-dist.

**Off-switch flag.** `?pvslite=0` — the module installs a no-op register and never hides.

**Verify.**
1. `node --check public/world-pvs-lite.js && node --check public/world-main.js` → 0;
   build-dist check → up to date; harnesses 31/31 + wave2-city 22/22.
2. Browser with `?perf=1`, in the densest street canyon: record
   `renderer.info.render.calls` standing in a canyon facing a wall of buildings, then
   with `?pvslite=0` from the same spot. Expected: PVS-on shows FEWER draw calls, and
   **zero visible holes** — walk the canyon and confirm no dressing pops in/out at cell
   boundaries beyond the 500 ms cadence. In open terrain (no raster coverage / no
   blockers): identical view both ways (fail-open proven).
3. Console: `Object.keys(WorldPVS._cells).length` > 0 in the city (registrations landed);
   outside the city it may be 0 — record both.

**Pitfalls.**
- The raster is built LAZILY (first race request or idle prebuild). Before it exists,
  `__cityHeights` is undefined and PVS must do nothing — that is the fail-open path,
  not a bug to "fix" by forcing an early 2–4 s raster build on the boot path.
- Never register the city buildings themselves — they are the occluders, and hiding
  them by their own raster is circular. Registration is for LOW dressing only; the
  15 m cap inside `register` enforces it even if a call site mislabels.
- If C-5's cell size is not 250 m, PVS's CELL_M must match C-5's, not this doc's
  default — a mismatched grid makes the sightline targets wrong (still conservative,
  but useless). Record the value used.

**Done-when:** draw calls drop in the canyon with no visible holes, open terrain is
unchanged, `?pvslite=0` restores today's rendering exactly, and any doubt path fails open.

---
## C-8 — Shadow cadence at MEDIUM (opt-in `?shadows` only)

**Goal.** Shadows are off by default and enabled only with `?shadows`; for those who
opt in at MEDIUM tier, the shadow map re-renders every frame (~4,900 casters = a second
scene draw). MEDIUM should refresh shadows every 2nd frame like LOW already does — the
60 m texel-snapped follow frustum moves slowly enough that 30 Hz shadow updates are
invisible in practice.

**USE THESE TOOLS** (nothing else): `node --check public/world-sky-v4.js`,
`grep -n "shadowEvery" public/world-sky-v4.js`, the sky harness
`node ~/workspace/realm-polish-2026-11-14/wave2-sky-harness.js` (expect 85/85),
browser with `?shadows` for the visual check.

**Files / anchors (`public/world-sky-v4.js`).**
- The QUALITY table (lines 155–161):
  `POTATO: { map: 1024, every: 3, oct: 2, stars2: 0 },`
  `LOW: { map: 1024, every: 2, oct: 3, stars2: 0 },`
  `MEDIUM: { map: 2048, every: 1, oct: 4, stars2: 1 },`
  `HIGH: { map: 2048, every: 1, oct: 4, stars2: 1 },`
  `ULTRA: { map: 2048, every: 1, oct: 5, stars2: 1 }`
- The consumer: `shadowEvery = q.every;` inside `setQuality` (line 513), and the cadence
  logic (lines 444–448):
  `if (shadowEvery <= 1) renderer.shadowMap.autoUpdate = true;`
  `if (moved || frameNo % shadowEvery === 0) { renderer.shadowMap.needsUpdate = true; lastShadowC = [_snap[0], _snap[1], _snap[2]]; }`
- The URL-override parser to extend: `parseUrlOverrides` (lines ~146–153) already reads
  `time=` / `daylen=` from `location.search` with the pattern
  `var mt = /[?&]time=([0-9.]+)/.exec(search), md = /[?&]daylen=([0-9.]+)/.exec(search);`

**Steps.**
1. In the QUALITY table, change ONLY the MEDIUM row:
   before: `MEDIUM: { map: 2048, every: 1, oct: 4, stars2: 1 },`
   after:  `MEDIUM: { map: 2048, every: 2, oct: 4, stars2: 1 },   // C-8: 30 Hz shadow refresh at MEDIUM (was every frame)`
2. Off-switch via the existing override parser: in `parseUrlOverrides`, after the
   `daylen` line, add:
   ```js
   var ms = /[?&]shadowevery=([0-9]+)/.exec(search);
   if (ms) { var sv = parseInt(ms[1], 10); if (sv >= 1 && sv <= 4) r.shadowEvery = sv; }
   ```
   (Match the function's existing variable style — it builds and returns an object `r`;
   if the function's shape differs in your branch, add the parsed value to that same
   returned object under the key `shadowEvery`.)
3. Apply the override where `setQuality` consumes the table (line 513):
   before: `uniforms.uCloudOct.value = q.oct; uniforms.uStars2.value = q.stars2; shadowEvery = q.every;`
   after:  `uniforms.uCloudOct.value = q.oct; uniforms.uStars2.value = q.stars2; shadowEvery = (OVERRIDES.shadowEvery != null ? OVERRIDES.shadowEvery : q.every);`
   where `OVERRIDES` is whatever variable holds `parseUrlOverrides()`'s result in this
   module — find it with `grep -n "parseUrlOverrides" public/world-sky-v4.js` and use
   that exact binding. If the module calls the parser inline in several places, hoist
   ONE call next to `setQuality` as `var _urlOv = parseUrlOverrides();` at module scope
   and reference `_urlOv.shadowEvery`. Record which form you used.
4. Nothing else changes: HIGH/ULTRA keep `every: 1`; map sizes unchanged; the
   `?shadows` gate in world-main (line 2304:
   `shadows: /[?&]shadows\b/.test(location.search)`) is not touched.

**Off-switch flag.** `?shadowevery=1` restores per-frame shadow refresh at every tier.

**Verify.**
1. `node --check public/world-sky-v4.js` → exit 0.
2. `node ~/workspace/realm-polish-2026-11-14/wave2-sky-harness.js` → **85/85**
   (if the harness pins QUALITY values and fails on the MEDIUM row, record the exact
   failing assertion in the receipt and STOP — do not edit the harness to pass).
3. Browser, local server, `?shadows` at MEDIUM: the sky module's state readout (line 534
   builds a status object containing `shadowEvery: shadowEvery`) — via the module's
   exposed debug/status path, confirm `shadowEvery` reads **2** at MEDIUM, **1** with
   `&shadowevery=1`, and shadows still track the sun (move time with `?time=` — no
   frozen or doubled shadows while walking).

**Pitfalls.**
- This item does NOTHING for default sessions (shadows off) — do not inflate its claim
  in the receipt; its value is for `?shadows` users and future shadow-on tiers.
- `frameNo % shadowEvery` with `every: 2` halves the shadow pass only when the frustum
  hasn't snapped (`moved` still forces an update) — that is intended; do not remove the
  `moved ||` term.

**Done-when:** MEDIUM + `?shadows` refreshes shadows at 30 Hz with no visible shimmer
regression, `?shadowevery=1` restores 60 Hz, and the sky harness stays 85/85.

---
## C-9 — Per-tier anisotropy (terrain textures)

**Goal.** Terrain textures use a fixed anisotropy of 8 everywhere. On POTATO (bandwidth-
bound phones) that's wasted bandwidth; on HIGH/ULTRA desktops, 16 is available and makes
grazing-angle terrain visibly sharper — a quality UPGRADE at the top, a saving at the
bottom, driven from the quality tier like every other per-tier setting.

**USE THESE TOOLS** (nothing else): `node --check` on both files,
`grep -n "anisotropy" public/world-terrain-v4.js public/world-main.js`,
`node tools/build-dist.cjs`, browser for the grazing-angle check.

**Files / anchors.**
- `public/world-terrain-v4.js`:
  - Colour map (line 237): `colorTex.anisotropy = 8; colorTex.needsUpdate = true;`
  - Splat layer textures (line 281): `tl.load(lbase + LTEX[k], function (tx) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; SU[k].value = tx; }, …`
  - Ripple maps (line 277) also set `tx.anisotropy = 8;` — include them via the same registry.
  - The terrain api object (line ~570): `var api = { ready: false, mesh: group, material: material, …` —
    `setAnisotropy` is added here.
- `public/world-main.js`:
  - `function _applyQualityTier(idx){` (line 5262) — the per-tier application point; it
    already calls `_v4Sky.setQuality(t.name)` (anchor:
    `if(typeof _v4Sky !== 'undefined' && _v4Sky) _v4Sky.setQuality(t.name);   // shadow map size + cadence`).
  - The terrain instance in scope there is the module-level `worldTerrain` (used e.g. at
    line 5188: `(worldTerrain && worldTerrain.heightAt)`).

**Steps.**
1. In world-terrain-v4.js, add a texture registry near the top of `buildWorldTerrainV4`
   (next to `var colorTex = hm.colorTex;` in the build scope):
   `var _afTex = []; function _afPush(tx) { if (tx) { tx.anisotropy = (typeof window !== 'undefined' && window.__terrainAF) || 8; _afTex.push(tx); } return tx; }`
2. Route the three literal sites through it:
   - Line 237: replace `colorTex.anisotropy = 8; colorTex.needsUpdate = true;` with
     `_afPush(colorTex); colorTex.needsUpdate = true;`
   - Line 281 callback: replace `tx.anisotropy = 8;` with `_afPush(tx);`
     (the callback already assigns `SU[k].value = tx;` — keep it).
   - Line 277 ripple callback: replace `tx.anisotropy = 8;` with `_afPush(tx);`
3. Add the live setter to the terrain `api` object (after the `stats:` entry):
   ```js
   setAnisotropy: function (n) { for (var i = 0; i < _afTex.length; i++) { _afTex[i].anisotropy = n; _afTex[i].needsUpdate = true; } },
   ```
   (`needsUpdate` re-uploads the texture — that is the cost of changing AF live; tier
   changes are rare, governor-driven, so this is acceptable and must not be called per frame.)
4. In world-main.js `_applyQualityTier`, immediately AFTER the `_v4Sky.setQuality` anchor
   line, add:
   ```js
   // C-9: per-tier terrain anisotropy — POTATO saves bandwidth, HIGH/ULTRA sharpen
   // grazing angles. ?af=<n> pins a fixed value; renderer cap always wins.
   if (!/[?&]af=/.test(location.search)) {
     var _afMap = { POTATO: 4, LOW: 8, MEDIUM: 8, HIGH: 16, ULTRA: 16 };
     var _afWant = _afMap[t.name] || 8;
     var _afCap = (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ? renderer.capabilities.getMaxAnisotropy() : 8;
     var _afVal = Math.min(_afWant, _afCap);
     window.__terrainAF = _afVal;
     if (typeof worldTerrain !== 'undefined' && worldTerrain && worldTerrain.setAnisotropy) { try { worldTerrain.setAnisotropy(_afVal); } catch (e) {} }
   }
   ```
   And the pin path: BEFORE that block (same insertion point), add:
   ```js
   var _afPin = /[?&]af=([0-9]+)/.exec(location.search);
   if (_afPin) { var _afPv = Math.max(1, Math.min(16, parseInt(_afPin[1], 10) || 8)); window.__terrainAF = _afPv; if (typeof worldTerrain !== 'undefined' && worldTerrain && worldTerrain.setAnisotropy) { try { worldTerrain.setAnisotropy(_afPv); } catch (e) {} } }
   ```
   (Two sibling blocks, pin first — keep them adjacent and commented as one C-9 unit.)
5. Build-dist (world-terrain-v4.js is a boot-bundle file; world-main.js gets its `?v=` refresh).

**Off-switch flag.** `?af=8` pins anisotropy to 8 = today's behaviour at every tier.

**Verify.**
1. `node --check` both files → 0; build-dist check → up to date; harnesses 31/31 + 27/27.
2. Browser: at POTATO (or `?quality` path your build uses to force a tier — if none,
   use the perf HUD/governor readout `window.__quality`), in the console:
   `window.__terrainAF` → 4 at POTATO, 8 at LOW/MEDIUM, 16 at HIGH/ULTRA (or the
   renderer's max if lower — record the cap from
   `renderer.capabilities.getMaxAnisotropy()` via the realm's debug handle if exposed;
   if neither is reachable from the console in your build, verify by the code path +
   the visual check and say so in the receipt).
3. Visual: at HIGH, look along a road/terrain at a grazing angle — texture stays sharp
   farther than with `?af=8`. At POTATO on a phone-class device: no visual cliff vs
   before (pixelRatio 0.55 already softens more than AF 4 does).

**Pitfalls.**
- Changing anisotropy without `needsUpdate = true` silently does nothing (the GPU
  texture keeps its old sampling state) — the setter's `needsUpdate` is load-bearing.
- Do not apply this to GLB textures or canvas textures (world-main has its own
  `anisotropy=4` canvas/sign textures) — terrain only, per the research item.
- `_applyQualityTier` runs before terrain exists on first boot: `window.__terrainAF`
  carries the value into the terrain build (step 1 reads it at texture creation), and
  the guarded live call covers later tier changes. Both halves are required.

**Done-when:** AF follows the tier map (4/8/8/16/16, capped by hardware), `?af=8`
reproduces today's fixed-8 behaviour exactly, and no other texture class is touched.

---

## LOADING STAGES 2–6 + 7b/7c — Prefetch, gate-slimming, bundle chain, load queue, codecs, terrain texture path

Source: `LOADING_PIPELINE.md` Part C (stages 2, 3, 4, 5, 6, 7b, 7c). Stage 1 (preloads +
`fetchPriority`) and stage 7a (`dunes.png` → WebP) are separate queue items — do NOT redo
them here; if your branch already contains them, these stages stack on top unchanged.
Do the subsections in order 2 → 3 → 4 → 5 → 6 → 7b → 7c, one commit per subsection.
Measure before/after with the realm's own instruments (LOADING_PIPELINE.md, "What to
measure first"): `window.__loadSummary()` → `playableMs` / `maxTaskAfterFirstFrameMs`,
`window.__loadTimings`, `window.__loadQueueStats()`. Record both numbers in the receipt
for every subsection — an estimate in the research doc is not evidence.

### Stage 2 — Prefetch the realm from the dashboard (S–M)

**Goal.** A user who spends ≥15 s on the dashboard currently still pays the full realm
cold boot after clicking the portal, because the realm iframe is created empty and its
`src` is only set on click — with a cache-buster that defeats any reuse. Start the realm
loading, hidden, while the user is still on the dashboard, and drop the cache-buster so
the prefetched document is the one that gets used.

**USE THESE TOOLS** (nothing else): `node --check public/world-main.js`,
`node tools/build-dist.cjs` (+ `--check`), local server on PORT=8930, a browser opened by
the founder/operator for the dashboard→portal click-through (no WebGL on this VM — the
prefetch *plumbing* is verifiable headlessly per the Verify block; the visual click-through
is SIM until a device confirms it), `curl`.

**Files.**
- `public/index.html` — the portal. Anchors: `const WORLD_URL = window.__SHADDAI_WORLD_URL || '/world';`
  (line 59097); inside `function playPortal(){` the src line (59136):
  `f.setAttribute('src', WORLD_URL + sep + 'peek&t=' + Date.now());`
  and the frame it fills (59048):
  `<iframe id="gridWorldFrame" title="Shaddai World" …></iframe>`.
- `public/world-main.js` — the peek auto-enter block (lines 4970–4972):
  `if(location.search.indexOf('peek')>=0){ (function _waitEnter(){ var b=document.getElementById('enterBtn'); if(b && b.classList.contains('show')){ b.click(); } else setTimeout(_waitEnter, 200); })(); }`

**Steps.**
1. In `public/index.html`, in `playPortal`, change the src line to drop the buster:
   ```js
   f.setAttribute('src', WORLD_URL + sep + 'peek');
   ```
   (The realm HTML is served `no-store` by design — the buster never bought freshness,
   it only guaranteed the URL could never match a prefetched one.)
2. In the same IIFE that defines `WORLD_URL` (after `playPortal`'s definition,
   `window._playWorldPortal = playPortal;` is at ~59148), add the idle prefetcher:
   ```js
   // Realm prefetch (loading stage 2): after 5 s dwell + idle, boot the realm in a
   // hidden iframe in ?prefetch hold mode; playPortal adopts it instead of cold-booting.
   var _pfFrame = null, _pfReady = false;
   function _startRealmPrefetch(){
     if (_pfFrame) return;
     if (/[?&]prefetch=0/.test(location.search)) return;
     try { var nc = navigator.connection; if (nc && (nc.saveData || /(^|-)2g$/.test(nc.effectiveType || ''))) return; } catch (e) {}
     if (!window.__isMobileDashboard && navigator.deviceMemory && navigator.deviceMemory < 4) return;
     _pfFrame = document.createElement('iframe');
     _pfFrame.setAttribute('aria-hidden', 'true');
     _pfFrame.style.cssText = 'position:absolute;width:2px;height:2px;left:-10px;top:-10px;border:0;visibility:hidden';
     _pfFrame.src = WORLD_URL + (WORLD_URL.indexOf('?') >= 0 ? '&' : '?') + 'prefetch=1';
     document.body.appendChild(_pfFrame);
   }
   setTimeout(function(){ if (window.requestIdleCallback) requestIdleCallback(_startRealmPrefetch, { timeout: 4000 }); else _startRealmPrefetch(); }, 5000);
   window.__adoptRealmPrefetch = function(){
     if (!_pfFrame) return false;
     var w = null; try { w = _pfFrame.contentWindow; } catch (e) {}
     if (!w || !w.__loadPlayable) return false;
     var old = document.getElementById('gridWorldFrame');
     if (!old || !old.parentNode) return false;
     _pfFrame.id = 'gridWorldFrame'; _pfFrame.title = 'Shaddai World';
     _pfFrame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block';
     _pfFrame.setAttribute('allow', 'fullscreen; pointer-lock');
     old.parentNode.replaceChild(_pfFrame, old);
     var f = _pfFrame; _pfFrame = null;
     try { if (w.__releasePrefetch) w.__releasePrefetch(); } catch (e) {}
     try { w.dispatchEvent(new Event('resize')); } catch (e) {}
     return true;
   };
   ```
   (`window.__isMobileDashboard` does not exist today — the `!window.__isMobileDashboard`
   term is deliberately always-true so the `deviceMemory < 4` gate is the only memory
   gate; do not invent a mobile flag. Same-document `replaceChild` of an iframe does NOT
   reload its document — that is what makes adoption work.)
3. In `playPortal`, before the existing `if(f){ … }` src-setting block, try adoption:
   ```js
   if (window.__adoptRealmPrefetch && window.__adoptRealmPrefetch()) { /* adopted: skip src set */ }
   else if (f) { …existing block unchanged… }
   ```
   Restructure minimally: wrap the existing `if(f){…}` in the `else` of the adoption test.
4. In `public/world-main.js`, replace the peek block (4970–4972) with a prefetch-aware one:
   ```js
   // ?prefetch=1 (dashboard idle prefetch, loading stage 2): boot to playable and HOLD —
   // no auto-enter, no audio unlock. The dashboard adopts this frame and calls
   // __releasePrefetch() on the real portal click. ?peek keeps its auto-enter behaviour.
   if (location.search.indexOf('prefetch') >= 0) {
     window.__prefetchHold = true;
     window.__releasePrefetch = function(){ var b = document.getElementById('enterBtn'); if (b) b.click(); };
   } else if (location.search.indexOf('peek') >= 0) { (function _waitEnter(){ var b=document.getElementById('enterBtn'); if(b && b.classList.contains('show')){ b.click(); } else setTimeout(_waitEnter, 200); })(); }
   ```
   Audit note (do it, record the result in the receipt): while held, the realm must not
   POST multiplayer presence — presence only starts from the Navi chat sync after a chat
   name is set (`public/world-navi-chat.js`), which never happens pre-enter, so the hold
   is inert today. If your branch changes that, gate the start on `!window.__prefetchHold`.
5. Run `node tools/build-dist.cjs` (world-main.js carries a `?v=` hash).

**Off-switch flag.** `?prefetch=0` on the DASHBOARD URL disables the prefetcher entirely
(step 2 checks it); with no prefetched frame, `playPortal` behaves exactly as before this
stage except the dropped `t=` buster. Realm-side, a dashboard that never sends
`prefetch=1` never triggers the hold.

**Verify.**
1. `node --check public/world-main.js` → exit 0; `node tools/build-dist.cjs --check` → up to date.
2. Server on PORT=8930: `curl -s "http://localhost:8930/world?prefetch=1"` → 200 HTML;
   `grep -c "prefetch" ` on the served `world-main.js` bundle URL → ≥1 (the hold branch shipped).
3. Headless plumbing check (operator browser or founder device — SIM until then): open the
   dashboard, wait 10 s, in the console run
   `document.querySelectorAll('iframe').length` → a second, hidden iframe exists;
   `playPortal()` after the hidden frame's `__loadPlayable` is true → the visible frame IS
   the prefetched document (check `document.getElementById('gridWorldFrame').contentWindow.__loadPlayable === true`)
   and ENTER fires without a second boot (loader does not restart from 0%).
4. Regression harnesses: `wave1-harness.js` 31/31 · `smoke-mobile-wave1.js` 27/27.

**Pitfalls.**
- Do NOT prefetch on `save-data` or 2G — step 2's connection gate is load-bearing; a
  prefetched realm is ~18 MB on the ENTER path.
- Adoption must be attempted BEFORE any `src` is set on `#gridWorldFrame`: setting `src`
  on the old frame first starts a second cold boot and the two race.
- The hidden frame must stay `visibility:hidden` at 2×2 px — `display:none` iframes get
  their rendering throttled/paused in some browsers, which would stall the boot you are
  trying to hide.

**Done-when:** after ≥5 s dashboard dwell, clicking the portal enters the already-booted
realm (no loader restart), and with `?prefetch=0` the click path is byte-for-byte the old one.

### Stage 3 — Slim the ENTER gate: canon out, bodies out of the window (S)

**Goal.** The ENTER gate still waits on the 4.66 MB canon district fetch+parse and, on
desktop, on up to 26.4 MB of council body parses interleaved with the loader. Remove
`'canon'` from the critical step list (it streams through the existing defer gate like
everything else) and make the council body queue wait for `__loadPlayable` on ALL
platforms, the way mobile already does.

**USE THESE TOOLS** (nothing else): `node --check public/world-main.js`,
`node tools/build-dist.cjs` (+ `--check`), the realm's own `window.__loadSummary()`,
local server on PORT=8930.

**Files.**
- `public/world-main.js` — anchors: the critical list (line 575):
  `critical: MAP_V4 ? ['terrain','realm-modules','buildings','canon','grid-fabric','city-v3','sky'] : ['buildings'] };`
  the defer gate the canon step will join (595): `function _ldDeferGate(api){`
  the body queue (2395–2396):
  `let _bodyQueue = [], _bodyBusy = false;` /
  `function queueAgentBody(entry){ _bodyQueue.push(entry); if(!_bodyBusy) setTimeout(_nextAgentBody, 1500); }`
  and `_nextAgentBody`'s head (2403): `const entry = _bodyQueue.shift();`
  `window.__loadPlayable = true` is set inside the lite loader (lines 4963/4965) — the
  flag the body gate reads.

**Steps.**
1. Line 575: remove `'canon',` from the critical array:
   ```js
   critical: MAP_V4 ? ['terrain','realm-modules','buildings','grid-fabric','city-v3','sky'] : ['buildings'] };
   ```
   Nothing else changes: the `'canon'` step definition stays in the step plan, and
   non-critical steps already route through `_ldDeferGate` (line 927 comment:
   "everything below is far from the spawn → streams in AFTER the sky-dive"). Confirm in
   the step plan that `canon` has no `critical`-only consumer at spawn: grep
   `__LD` consumers of the canon step's result before committing; the ENTER-gate comment
   near the loader ("terrain + core buildings only") is the design statement — record
   what you found in the receipt.
2. Gate the body queue on playable, at the top of `_nextAgentBody` (before the shift):
   ```js
   function _nextAgentBody(){
     if(!window.__loadPlayable && !/[?&]bodies=early/.test(location.search)){ setTimeout(_nextAgentBody, 1000); return; }
     const entry = _bodyQueue.shift();
     …rest unchanged…
   ```
   Match the surrounding function-declaration style of the actual code on your branch
   (the queue uses `function` declarations and `let` — keep them). `_bodyBusy` handling:
   `queueAgentBody` only kicks `_nextAgentBody` when `!_bodyBusy`; the parked retry loop
   above re-enters on its own timer, so do NOT set `_bodyBusy = true` in the parked branch.
3. Run `node tools/build-dist.cjs`.

**Off-switch flag.** `?canoncrit=1` restores canon to the critical list — implement it in
step 1 as: `critical: MAP_V4 ? ( /[?&]canoncrit=1/.test(location.search) ? […with 'canon'…] : […without…] ) : ['buildings']`.
`?bodies=early` restores the old desktop body timing (step 2's test).

**Verify.**
1. `node --check` → exit 0; build-dist `--check` → up to date.
2. Local server + operator browser (SIM on this VM): load `/world`, read
   `window.__loadSummary()` before/after on the same machine — `playableMs` must drop vs
   the pre-change baseline recorded in the receipt, and the loader step list must show
   `canon` completing AFTER `__loadPlayable` flips (check `window.__loadTimings`).
3. In-world: council standees are replaced by real bodies within seconds of landing
   (bodies drain through the queue post-entry — watch `window.__loadQueueStats()` and the
   body queue by entering and waiting 15 s; no body may remain a standee after 30 s).
4. Regressions: `wave1-harness.js` 31/31 · `smoke-mobile-wave1.js` 27/27 · `wave2-city-test.js` 22/22.

**Pitfalls.**
- Canon carries colliders/props the district build reads — if any spawn-area system reads
  canon state synchronously at ENTER, the gate comment lied; the step-1 grep audit is what
  catches it. If you find such a consumer, STOP this subsection and record it.
- Do not "fix" the resulting canon pop-in by moving the ENTER gate later — the sky-dive
  covers the stream-in; that is the design.
- Mobile already waited for playable (wave 1 FIX-B): your gate must be a no-op there —
  the `bodies=early` test must not invert mobile behaviour.

**Done-when:** `__loadSummary().playableMs` drops on desktop with canon streaming in
during the dive, bodies still all arrive post-entry, and `?canoncrit=1&bodies=early`
reproduces the old gate exactly.

### Stage 4 — Retire the `document.write` bundle chain (M)

**Goal.** The realm's three boot bundles are injected with `document.write`, which blocks
the parser, hides the bundles from the preload scanner, and draws Chrome's slow-network
intervention warnings. Replace the default path with ordered dynamic injection
(`async=false`), keeping the bundle files and their order identical, and keep both legacy
fallbacks reachable by flag.

**USE THESE TOOLS** (nothing else): `node --check` (on any JS you extract to test),
`node tools/build-dist.cjs` (+ `--check`), local server on PORT=8930, `curl`,
operator browser for the boot smoke (SIM on this VM).

**Files.**
- `public/SHADDAI-WORLD-3D.html` — the boot block (lines 462–469, verbatim today):
  ```html
  <script>/* BOOT BUNDLES (2026-10-24, docs/SPEED-BRIEF-20261024.md): … */
  window.__BOOT_BUNDLES = ["/dist/boot-1.8e67d51ade.js","/dist/boot-2.5e856f8a07.js","/dist/boot-3.effb0470ca.js"];
  (function(){ var useB = window.__BOOT_BUNDLES.length && !/[?&]bundle=0/.test(location.search), h = "";
    if (useB) window.__BOOT_BUNDLES.forEach(function(s){ h += '<script src="' + s + '"><\/script>'; });
    else h = document.getElementById("boot-scripts").innerHTML;
    document.write(h); })();
  </script>
  <script type="module" src="/world-main.js?v=9e7642f8cc"></script>
  ```
  (Hashes differ per build — `tools/build-dist.cjs` owns the `__BOOT_BUNDLES` array and
  the `?v=` stamp; never hand-edit either.) The fallback source is
  `<template id="boot-scripts">` (line 347) holding the 147 original script tags.

**Steps.**
1. Replace the IIFE (keep the `window.__BOOT_BUNDLES = […]` line and the comment above it
   untouched) with:
   ```js
   (function(){
     function inject(srcs){
       srcs.forEach(function(s){ var el = document.createElement('script'); el.src = s; el.async = false; document.head.appendChild(el); });
     }
     if (/[?&]bundle=dw/.test(location.search)) {
       // Legacy path (one release): the pre-stage-4 document.write chain, verbatim.
       var useB = window.__BOOT_BUNDLES.length && !/[?&]bundle=0/.test(location.search), h = "";
       if (useB) window.__BOOT_BUNDLES.forEach(function(s){ h += '<script src="' + s + '"><\/script>'; });
       else h = document.getElementById("boot-scripts").innerHTML;
       document.write(h); return;
     }
     if (/[?&]bundle=0/.test(location.search)) {
       // Original files one by one: clone the template's script elements in order.
       // (innerHTML-inserted scripts never execute; clones with async=false do, in order.)
       var nodes = document.getElementById("boot-scripts").content.querySelectorAll('script');
       var srcs = []; nodes.forEach(function(n){ if (n.src) srcs.push(n.getAttribute('src')); });
       inject(srcs); return;
     }
     inject(window.__BOOT_BUNDLES);
   })();
   ```
   Inline (non-`src`) scripts inside the template, if any exist on your branch, do NOT
   survive the clone path — check with
   `grep -c "<script>" public/SHADDAI-WORLD-3D.html` vs the template's src-tag count and
   record the result; if inline template scripts exist, STOP and record (the fallback
   needs per-node cloning with `textContent` copied, in document order).
2. No other file changes. `tools/build-dist.cjs` output is unchanged by this stage —
   run it anyway and confirm `--check` passes.

**Off-switch flag.** `?bundle=dw` restores the exact pre-stage-4 `document.write` chain;
`?bundle=0` keeps its old meaning (the 147 originals, now via ordered injection).

**Verify.**
1. `curl -s http://localhost:8930/world | grep -c "document.write"` → exactly 1 (inside
   the `bundle=dw` branch only).
2. Boot smoke (operator browser, SIM on this VM): load `/world`, `/world?bundle=0`,
   `/world?bundle=dw` — all three reach the loader and `__loadPlayable`; console shows no
   `document.write` intervention warning on the default path; `window.__BOOT_BUNDLES`
   scripts appear in `performance.getEntriesByType('resource')` in order boot-1, boot-2, boot-3.
3. Regressions: `wave1-harness.js` 31/31 · `smoke-mobile-wave1.js` 27/27 · `wave2-sky-harness.js` 85/85.

**Pitfalls.**
- Execution ORDER is the entire point: dynamically inserted scripts default to
  `async=true` (execute as soon as fetched, any order). Forgetting `el.async = false`
  passes a fast-local test and corrupts the boot on slow networks.
- The module tag for `world-main.js` follows the boot block in the document; modules are
  deferred, so they still execute after the classic bundles — do not "help" by moving it.
- Do not delete the `<template id="boot-scripts">`: `?bundle=0` and the build tool both
  read it.

**Done-when:** the default boot path contains no live `document.write`, all three flag
modes boot to playable, and bundle execution order is provably boot-1 → boot-2 → boot-3.

### Stage 5 — One priority queue for ALL streamed GLBs (M)

**Goal.** Three loader families coexist today and only the editor's props/nature loaders
use the shared queue; the council queue and at least six ad-hoc `new GLTFLoader()` sites
in world-main fire unqueued, so 100–400 ms parses stack up during the dive and landing.
Extend the existing `__queueLoad` with priority classes and route the ad-hoc world-main
loaders and the council body queue through it, nearest-first within a class.

**USE THESE TOOLS** (nothing else): `node --check public/world-editor.js`,
`node --check public/world-main.js`, `node tools/build-dist.cjs` (+ `--check`),
the realm's `window.__loadQueueStats()`, local server on PORT=8930.

**Files.**
- `public/world-editor.js` — the queue (lines 36–50, verbatim anchors):
  `var Q = [], active = 0, MAX = 4;`, `function pump() {`,
  `window.__queueLoad = function (loader, url, ok, fail) { Q.push({ loader: loader, url: url, ok: ok, fail: fail, tries: 0 }); pump(); };`
  and `window.__loadQueueStats = function () { return { queued: Q.length, active: active, total: _qTotal }; };`
  Note: the queue block sits BEFORE the editor-UI early return
  (`if (!/[?&]edit=1\b/.test(location.search)) return;`, line 52) — it is live in normal
  play; keep it there.
- `public/world-main.js` — ad-hoc loader sites (grep `new GLTFLoader()`; known:
  line 190 reef `_gl`, 888 transit `tl`, 891 `kl`, 898 `gl`, plus the `__loadMgr` loaders
  at 738 `agentBodyLoader` and ~817 `_ocLoader`), and the council queue (2395+,
  `queueAgentBody` / `_nextAgentBody`).

**Steps.**
1. In `world-editor.js`, extend the job shape with a priority and a position, keeping the
   4-argument call signature working (existing callers in `world-falprops.js` /
   `world-nature.js` must not change):
   ```js
   window.__queueLoad = function (loader, url, ok, fail, prio, pos) {
     Q.push({ loader: loader, url: url, ok: ok, fail: fail, tries: 0,
              prio: (typeof prio === 'number' ? prio : 2), pos: pos || null });
     pump();
   };
   ```
   Priority classes: `0` spawn-visible · `1` near · `2` far (default — today's behaviour
   for unclassed jobs) · `3` cosmetic.
2. In `pump()`, replace `var job = Q.shift();` with a best-job pick: scan `Q` for the
   lowest `prio`; within that class, if jobs carry `pos` and `window.__playerPos` exists,
   pick the nearest by squared distance; else FIFO. Keep `active < MAX`, the retry
   (`j.tries++ < 2`, `600 * j.tries` backoff) and the error logging byte-identical.
   Raise `MAX` to 6 only when `!/^http\/1/.test(navigator.connection ? '' : '')` — NO:
   protocol is not readable from JS. Keep `MAX = 4` on all platforms (the research doc's
   "6 on desktop HTTP/2" is not implementable without a protocol signal; record that in
   the receipt rather than guessing).
3. Route the world-main ad-hoc sites: each `loader.load(url, ok, undefined, fail)` at the
   grep-found sites becomes
   `window.__queueLoad(loader, url, ok, fail, PRIO, POS)` with PRIO/POS chosen per site:
   transit train + reef = `1` with the site's known anchor position; kit/interior loaders
   = `2`; anything purely decorative = `3`. Sites whose loader is memoized and CLONED per
   load (the reef pattern, line 190) keep their clone logic — only the `.load` call moves.
   The two `__loadMgr` loaders (738, ~817) already share a LoadingManager for progress;
   route their `.load` calls too (the manager still sees the same loads).
4. Council bodies: in `_nextAgentBody`, replace the direct `agentBodyLoader.load(…)`
   call with `window.__queueLoad(agentBodyLoader, url, ok, fail, 1, entry.pos || null)`
   keeping the existing ok/fail bodies (standee swap, retry via `_bodyQueue`) — the body
   queue stays the sequencer for *which body is next*; the shared queue now arbitrates it
   against everything else. If `window.__queueLoad` is undefined (editor file failed to
   load), fall back to the direct `.load` — one `if` at the call site.
5. All routing in steps 3–4 goes behind the flag: wrap with
   `var _useQ = !/[?&]loadqueue=0/.test(location.search);` at each call site cluster —
   when off, the original direct `.load` runs. (Default ON; this is the "land behind the
   flag" the research doc asks for, inverted so the flag is the kill-switch.)
6. Run `node tools/build-dist.cjs` (both files are boot-bundle inputs).

**Off-switch flag.** `?loadqueue=0` → every routed loader behaves exactly as today
(direct `.load`, queue used only by its original falprops/nature callers).

**Verify.**
1. `node --check` both files → exit 0; build-dist `--check` → up to date.
2. Local realm (operator browser, SIM here): enter, fly toward the reef/transit area and
   open `window.__loadQueueStats()` mid-stream → `total` grows beyond the falprops/nature
   baseline and `active` never exceeds 4; `maxTaskAfterFirstFrameMs` from
   `__loadSummary()` during the first 30 s in-world improves vs the receipt's baseline.
3. Kill-switch check: `?loadqueue=0` → `__loadQueueStats().total` matches the old
   baseline (only falprops/nature jobs) and all content still arrives.
4. Regressions: full harness set — 31/31 · 27/27 · 85/85 · 22/22 · 38/38.

**Pitfalls.**
- The queue's retry re-pushes to the END of `Q` (`Q.push(j)` in the error path) — with
  priorities, a retried job keeps its `prio` field, so it re-enters its class; do not
  reset `tries` when re-picking in step 2's scan.
- `world-editor.js` loads early in the bundle order; world-main call sites run later —
  but the cinematic-intro gate reads `__loadQueueStats()` (world-main.js ~4903): after
  routing, its "queue empty" condition includes council bodies. That is intended (the
  lite gate does not consult it), but record the behaviour change in the receipt.
- Loaders with per-load state (DRACO instances, ktx2) are passed BY REFERENCE through the
  queue today — keep it that way; do not let the queue construct loaders.

**Done-when:** all world-main streamed GLBs flow through `__queueLoad` with priorities,
`active ≤ 4` always, dive-window long tasks measurably drop, and `?loadqueue=0` restores
today's loading exactly.

### Stage 6 — Codec policy for the remaining Draco carriers (M, asset pipeline)

**Goal.** Draco geometry decode is the slow codec on the boot path and its 286 KB decoder
fetch is paid by the first Draco file. Establish a measured census of which GLBs still
carry Draco (or no compression), and re-encode only those where geometry dominates —
**note: the research doc's premise is partly stale.** Verified 2026-11-15 against this
repo: `public/assets/world/canon-v4.glb` already declares `EXT_meshopt_compression` (it
is NOT a Draco carrier), and `public/assets/kits/shaddai_bazaar_city_v02.glb` declares
neither Draco nor meshopt (uncompressed geometry). The census in step 1 — not the doc —
decides the work list.

**USE THESE TOOLS** (nothing else): the GLB header census script in step 1 (python3,
stdlib only), `~/workspace/gltf-tools/node_modules/.bin/gltf-transform` (the CLI already
installed for the ZEROX/VILLAIN re-pack — `inspect`, `meshopt`, `webp` subcommands),
`ls -la` for byte counts, the section's visual-equivalence check (operator browser, SIM).

**Files.**
- Census scope: every `.glb` under `public/assets/` reachable from the boot path —
  enumerate with `find public/assets -name "*.glb" | sort` and record the full list in
  the receipt.
- Re-encode outputs REPLACE the originals only after verification; originals are kept in
  `~/workspace/realm-polish-2026-11-14/BACKUP-opencode/codec-originals/` for one release
  (off-switch = restore the file).

**Steps.**
1. Census — run this verbatim from the repo root and paste the output into the receipt:
   ```bash
   python3 - <<'EOF'
   import struct, json, glob
   for p in sorted(glob.glob('public/assets/**/*.glb', recursive=True)):
       try:
           with open(p,'rb') as f:
               f.read(12); ln = struct.unpack('<I', f.read(4))[0]; f.read(4)
               j = json.loads(f.read(ln))
           ext = j.get('extensionsUsed', [])
           kind = 'draco' if any('draco' in e.lower() for e in ext) else ('meshopt' if any('meshopt' in e.lower() for e in ext) else 'none')
           print(kind, p)
       except Exception as e:
           print('ERR', p, e)
   EOF
   ```
2. Work list = files the census marks `draco`, PLUS `none` files > 500 KB. For each,
   measure the geometry share before touching it:
   `~/workspace/gltf-tools/node_modules/.bin/gltf-transform inspect <file>` — record
   geometry vs texture bytes. SKIP (record why) any file where geometry is < 10% of
   bytes, any file < ~200 KB, and any file whose payload is its animation (skinned
   bodies are already meshopt+WebP per the `agentBodyLoader` comment at world-main.js:738 —
   the census should confirm zero agent bodies on the list; if one appears, STOP for it).
3. Re-encode each surviving file (geometry only — do not re-encode textures in this stage):
   ```bash
   cp <file> ~/workspace/realm-polish-2026-11-14/BACKUP-opencode/codec-originals/
   ~/workspace/gltf-tools/node_modules/.bin/gltf-transform meshopt <file> <file>.meshopt.glb
   ```
   Then verify the output with the same deep-compare discipline as ASSET_REPACK_RECEIPT:
   census the output (must now read `meshopt`), `gltf-transform validate <file>.meshopt.glb`
   clean, node/skeleton/animation counts identical to the original's `inspect` output.
   Only then replace the original with the `.meshopt.glb` output.
4. If, after step 3, NO Draco file remains reachable from the boot path, record that the
   286 KB `draco_decoder.wasm` first-use fetch is gone from the boot path (the DRACOLoader
   wiring itself stays — off-path Draco files may still exist; do NOT remove the wiring).

**Off-switch flag.** Per-asset file restore from `codec-originals/` (the loaders support
Draco and meshopt simultaneously — world-main.js:738/817 wire both decoders on the shared
loaders). No URL flag exists for asset internals; do not invent one.

**Verify.**
1. Census re-run → the work-list files now read `meshopt`; zero `draco` files remain on
   the boot-path list (or the receipt names the exceptions and why).
2. `gltf-transform validate` clean on every replaced file; byte counts before/after in
   the receipt (transfer may grow slightly pre-gzip — that is expected and acceptable;
   a file that grows > 25% gets its original restored and is recorded as skipped).
3. Headless parse: the wave asset harness pattern (vendored three r180 GLTFLoader) loads
   each replaced file with identical node/mesh/animation counts.
4. Regressions: `wave2-city-test.js` 22/22 (canon-adjacent), `wave1-harness.js` 31/31.

**Pitfalls.**
- Meshopt quantization is lossy: the equivalence bar is the re-pack's (structure counts +
  screenshot on a device), not "it loads". A visually shifted kit piece = restore original.
- Do not run `gltf-transform optimize` as a shortcut — it changes textures and scene
  structure too; this stage is geometry-codec only (`meshopt` subcommand).
- `extensionsUsed` on a file with NO extensions prints `none` in the census even for
  texture-only WebP files — that is why step 2's geometry-share measurement gates the work.

**Done-when:** the census table is in the receipt, every Draco/uncompressed-geometry file
that passed the gates is re-encoded and validated, and skipped files carry a recorded reason.

### Stage 7b — Low-res `color.jpg` placeholder, swapped for the full map (S)

**Goal.** The terrain colour map is 446,723 B at 2048² and the terrain stage is serial-first
in the ENTER gate. Bind a 512² placeholder (~40 KB) immediately and swap in the full map's
image when it lands — the terrain's splat layers already prove the placeholder-then-swap
pattern in this codebase; this extends it to the colour map itself.

**USE THESE TOOLS** (nothing else): `python3` with PIL (verified present, Pillow 10.2.0)
for the one-time placeholder generation, `node --check public/world-terrain-v4.js`,
`node tools/build-dist.cjs` (+ `--check`), local server on PORT=8930, `curl -sI`.

**Files.**
- `public/world-terrain-v4.js` — `loadColor` (lines 170–176, verbatim):
  ```js
  function loadColor(THREE, base) {
    var loader = new THREE.TextureLoader();
    function load(url) { return new Promise(function (res, rej) { loader.load(url, res, undefined, function () { rej(new Error('404 ' + url)); }); }); }
    return load(base + 'color.jpg').catch(function () { return load(base + 'color.png'); }).catch(function (e) {
      console.warn('[terrain-v4] no colour map (' + e.message + ') — flat grey ground'); return null;
    });
  }
  ```
  Its result is consumed at line 139:
  `return loadColor(THREE, base).then(function (colorTex) { hm.colorTex = colorTex; return hm; });`
- NEW asset: `public/assets/terrain/color-low.jpg` (generated in step 1; `base` resolves
  to `/assets/terrain/` — `color.jpg` on disk is 446,723 B, verified).

**Steps.**
1. Generate the placeholder (one-time, from the repo root):
   ```bash
   python3 - <<'EOF'
   from PIL import Image
   im = Image.open('public/assets/terrain/color.jpg')
   print('source', im.size)
   im.resize((512, 512), Image.LANCZOS).save('public/assets/terrain/color-low.jpg', quality=80)
   EOF
   ls -la public/assets/terrain/color-low.jpg
   ```
   If the source is not square, resize to `(512, round(512*h/w))` instead — record the
   source size in the receipt and keep the aspect (a stretched placeholder teaches the
   shader wrong UVs for a few seconds; an aspect-correct one does not).
2. Replace `loadColor`'s return chain with placeholder-first + image swap. The trick that
   makes this consumer-free: mutate the SAME Texture object's `.image` when the full map
   lands — every material already holding the texture picks it up on `needsUpdate`:
   ```js
   return load(base + 'color-low.jpg').catch(function () { return null; }).then(function (lowTex) {
     if (!lowTex || /[?&]colorlow=0/.test(location.search)) {
       return load(base + 'color.jpg').catch(function () { return load(base + 'color.png'); }).catch(function (e) {
         console.warn('[terrain-v4] no colour map (' + e.message + ') — flat grey ground'); return null;
       });
     }
     load(base + 'color.jpg').then(function (fullTex) {
       lowTex.image = fullTex.image; lowTex.needsUpdate = true;
     }).catch(function () { /* keep the low-res map; it is a valid colour map */ });
     return lowTex;
   });
   ```
   (`location` is reachable inside world-terrain-v4.js — it is a classic script in the
   realm page. If your branch's terrain module is wrapped so `location` is shadowed, use
   `window.location.search` — same test.)
3. Run `node tools/build-dist.cjs` (world-terrain-v4.js is a boot-chain file).

**Off-switch flag.** `?colorlow=0` → step 2's branch loads the full map directly, exactly
the old chain (including the `color.png` fallback).

**Verify.**
1. `node --check` → exit 0; build-dist `--check` → up to date.
2. `curl -sI http://localhost:8930/assets/terrain/color-low.jpg` → 200 with
   `Content-Length` ≈ 30–60 KB (record the real number; if PIL produced > 100 KB,
   regenerate at quality 70 — the placeholder's job is speed, not fidelity).
3. Operator browser (SIM here): Network panel on `/world` shows `color-low.jpg` fetched
   before `color.jpg`, terrain appears coloured during the loader, and sharpens once —
   no grey phase, no double flash. `?colorlow=0` → only `color.jpg` is fetched.
4. Regressions: `wave1-harness.js` 31/31 · `smoke-mobile-wave1.js` 27/27.

**Pitfalls.**
- Do NOT resolve `loadColor` with the full texture as a second object and reassign
  `hm.colorTex` later — consumers may already have captured the first texture; the
  `.image` mutation on the shared object is the whole mechanism.
- The placeholder must be the same image content (same crop/orientation) — generate it
  FROM `color.jpg` (step 1), never from another source.
- `color.png` fallback: keep it in the `?colorlow=0` path and in the low-file-missing
  path only; if `color-low.jpg` exists but `color.jpg` 404s, keeping the low map (step 2's
  inner catch) is correct, not an error.

**Done-when:** the terrain stage's first colour bytes drop from 446,723 B to the recorded
placeholder size, the full map swaps in invisibly behind the loader, and `?colorlow=0`
restores the original chain.

### Stage 7c — Mobile splat cap: no terrain layer decodes above 1024² on phones (S)

**Goal.** The ten terrain splat/ripple textures decode at native size; any layer still
shipping above 1024² costs ~21 MB of decoded VRAM per 2048² texture in the phone warm-up
spike — the Jetsam window waves 1+3 worked to shrink. On mobile-lite only, downscale any
terrain layer image larger than 1024 px to 1024 px at load time, before first upload;
desktop keeps native textures byte-for-byte.

**USE THESE TOOLS** (nothing else): `node --check public/world-terrain-v4.js`,
`node tools/build-dist.cjs` (+ `--check`), local server on PORT=8930, `ls -la` +
the PIL header check in step 1 (`python3 -c "from PIL import Image; …"`).

**Files.**
- `public/world-terrain-v4.js` — the splat block (lines 273–285): the placeholder
  `var white = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);`,
  the layer map `var LTEX = { tLava: 'lava-crust.webp', tDune: 'dunes.png', … };`
  (note: `tDune` becomes `'dunes.webp'` if stage 7a has landed on your branch — match
  the code, not this quote), and the two load loops whose callbacks do
  `SU[k] = { value: white };` then `tl.load(lbase + …, function (tx) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; … SU[k].value = tx; }, …)`.
- The mobile signal: `window.__mobileLite` — set by `public/world-main.js` line 124
  (`window.__mobileLite = _MOBILE_LITE;`). The terrain module reads the window global;
  it must NOT read world-main's module-scope `_MOBILE_LITE` (invisible to it).

**Steps.**
1. Census the layer files' real dimensions first (record in the receipt):
   ```bash
   python3 - <<'EOF'
   from PIL import Image
   import os
   for f in ['lava-crust.webp','dunes.png','root-moss-floor.webp','frost-plates.webp','red-regolith.webp','obsidian-plaza.webp','harvest-field.webp','emerald-grass.webp','sand_ripple_n.webp','sand_ripple_h.webp']:
       p = 'public/assets/terrain/' + f
       if os.path.exists(p): print(f, Image.open(p).size)
       else: print(f, 'MISSING (check for .webp variant)')
   EOF
   ```
   If every layer is already ≤1024², this subsection is a NO-OP: record the census and
   stop (the cap is insurance, not work). Otherwise continue for the oversize layers only.
2. Add a downscale helper beside the splat block (before the `LTEX` loops):
   ```js
   function capTex(tx) {
     if (!window.__mobileLite || /[?&]splatcap=0/.test(location.search)) return tx;
     var img = tx.image;
     if (!img || !img.width || (img.width <= 1024 && img.height <= 1024)) return tx;
     var s = 1024 / Math.max(img.width, img.height);
     var c = document.createElement('canvas');
     c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
     c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
     tx.image = c; tx.needsUpdate = true;
     return tx;
   }
   ```
3. In BOTH load loops (ripples and LTEX layers), pass the loaded texture through the cap
   before it is stored: change `SU[k].value = tx;` to `SU[k].value = capTex(tx);` in the
   ripple loop, and the same in the layer loop. Wrap/repeat, `colorSpace` and
   `anisotropy = 8` settings stay exactly as they are, applied to the same texture object.
4. Run `node tools/build-dist.cjs`.

**Off-switch flag.** `?splatcap=0` disables the cap (step 2's test); desktop and
non-mobile-lite sessions never enter it at all.

**Verify.**
1. `node --check` → exit 0; build-dist `--check` → up to date.
2. Operator device/browser with a mobile user-agent (SIM on this VM): after terrain
   loads, evaluate in the realm console — for each oversize layer from the step-1 census,
   its texture image is ≤1024 in both dimensions (inspect via the terrain material's
   uniforms, or by re-running the census logic against `SU` if exposed); with
   `?splatcap=0` the same textures are native size.
3. Desktop load: textures native (the `window.__mobileLite` gate is false) — the terrain
   must be pixel-identical to before this change.
4. Regressions: `smoke-mobile-wave1.js` 27/27 · `wave1-harness.js` 31/31.

**Pitfalls.**
- The cap must run BEFORE the texture's first render/upload — the load callback is that
  moment; capping later (e.g. on first frame) pays the full-size upload anyway and then
  pays a second one.
- `sand_ripple_n/h` are linear data maps (normal/height): a canvas downscale is still
  correct for them (same resampling any mip chain does), but do NOT let the 2D context
  apply colour management — canvas drawImage of an image element is a straight pixel
  copy for this purpose; if a ripple layer looks wrong on device, exclude the two ripple
  keys from the cap and record it.
- Do not cap the colour map here — that is stage 7b's placeholder mechanism, a different
  trade (download bytes vs decode size).

**Done-when:** on mobile-lite, no terrain layer texture uploads above 1024² (census +
on-device check), desktop is untouched, and `?splatcap=0` restores native sizes on mobile.

---

## BACKEND PERF LEFTOVERS — Boot diet (#6) + presence transport (#7)

Source: `BACKEND_PERF.md` §7 items 6 and 7. Items 1–5 and 8 of that list are a separate
queue item ("backend perf safe-now") — do NOT redo them here; if your branch already
contains them, these two stack on top. One subsection = one branch = one commit set.

### #6 — Boot diet: defer non-essential subsystems until after `listen` (M)

**Goal.** The server answers nothing until the whole module graph and every boot-time
subsystem have run — 52–75 s to first health-200 measured locally (BACKEND_PERF.md §5) —
so every redeploy or spin-down wake pays that before the first visitor gets a page. Move
the subsystems that do not serve requests (warmers, auto-connects, engine supervisors)
behind the `listen` callback, where several already live, so the health route answers
as early as the route table allows.

**USE THESE TOOLS** (nothing else): `node --check backend/server-production.js`,
local server on a SCRATCH port (`PORT=8937 node backend/server-production.js` — 8930 is
the shared test port; never run two instances on it), `curl` timing loop in step 1,
`grep` for the discovery pass in step 2.

**Files.**
- `backend/server-production.js` — anchors: the listen block (lines 3525–3534):
  `const PORT = process.env.PORT || 3000;` … `server.listen(PORT, () => {` …
  `logger.info('SERVER', \`SHADDAI Production Server v62 started on port ${PORT}\`);`
  The pattern to copy already exists INSIDE that callback: the Telegram lanes block
  (starts ~3536) and `require('./mcp-client').autoConnectAll().then(results => {` (line 3654)
  both run only after listen. The proven module-scope offender (line 2310):
  `try { require('./lib/ops-registry').boot('aura-warmer', () => require('./aura-warmer').startAutoWarm()); } catch (_) {}`
- Timing probe target: `GET /api/health` (route at `server-production.js:866` per
  DASHBOARD_AUDIT.md §1.2 — the dashboard's own health fetch uses it).

**Steps.**
1. BASELINE FIRST (no edits yet). On your branch's clean tree:
   ```bash
   PORT=8937 node backend/server-production.js > /tmp/boot-before.log 2>&1 &
   T0=$(date +%s%N); until curl -s -o /dev/null -w '%{http_code}' http://localhost:8937/api/health | grep -q 200; do sleep 1; done; T1=$(date +%s%N); echo "health-200 after $(( (T1-T0)/1000000 )) ms"; kill %1
   ```
   Record the number and the `/tmp/boot-before.log` line count in the receipt. (On this
   VM expect tens of seconds and noisy neighbours — run it twice, record both.)
2. Discovery pass — find every remaining module-scope starter. Run and paste into the receipt:
   ```bash
   grep -n "ops-registry').boot(\|startAutoWarm\|\.start()\|setInterval(" backend/server-production.js | head -40
   grep -rn "setInterval(\|\.start()" backend/aura-warmer.js backend/mcp-client.js 2>/dev/null | head -10
   ```
   Classify each hit: (a) inside the `server.listen` callback or a route handler → already
   deferred, leave it; (b) module scope but required for the FIRST request of some route
   (route tables, stores, auth) → leave it, record why; (c) module scope, periodic or
   warm-up work (the aura-warmer at 2310 is the known one) → move it in step 3.
3. For each (c) item, move its start call into the listen callback, immediately AFTER the
   `started on port` log line, wrapped exactly like the original (same try/catch shape,
   same ops-registry boot name). For the aura-warmer the moved line is byte-identical:
   ```js
     try { require('./lib/ops-registry').boot('aura-warmer', () => require('./aura-warmer').startAutoWarm()); } catch (_) {}
   ```
   Add one comment above the moved block: `// BOOT DIET (BACKEND_PERF #6): warmers start after listen so /api/health answers first.`
   Do NOT move anything that registers routes, middleware, or store loads — if a
   candidate's module also does those at require time, the require stays at module scope
   and only its `.start*()` call moves.
4. Re-run the step-1 timing (same port, same procedure, twice) → `/tmp/boot-after.log`.
   The win is the delta; if the delta is < 10% on this VM, record that honestly — the
   item's value is then the ordering guarantee (health before warmers), not a local number.

**Off-switch flag.** None (boot ordering has no runtime surface). Revert = restore
`backend/server-production.js` from `BACKUP-opencode/`; the receipt's before/after logs
are the evidence the change is safe to keep or drop.

**Verify.**
1. `node --check backend/server-production.js` → exit 0.
2. Boot the edited server on PORT=8937: `/api/health` → 200; the log shows
   `started on port 8937` BEFORE any `[aura-warmer]`/warm-up lines (grep both line
   numbers from the log and paste them: `grep -n "started on port\|aura" /tmp/boot-after.log | head`).
3. Functional spot-checks after full boot (give warmers ~30 s): `curl -s http://localhost:8937/api/model/health`
   → JSON ok (the self-ping target), `curl -s http://localhost:8937/api/bazaar/list` → 200.
   Kill the server.
4. No route count change: `grep -c "app\.\(get\|post\|use\)\|router\.\(get\|post\)" backend/server-production.js`
   before/after → identical (paste both counts in the receipt).

**Pitfalls.**
- The self-ping (BACKEND_PERF.md §5) targets the health route to beat spin-down: if
  health answers before the signal pollers' modules finish loading, a poller tick in
  that window must fail soft, not crash — the existing pollers already tolerate upstream
  errors; do not add new early-window calls of your own.
- `ops-registry.boot` may dedupe by name across the process — moving the call later is
  safe; calling it in BOTH places is not. After moving, grep that each boot name appears
  exactly once.
- Vercel import path: the listen block is guarded by `if (!process.env.VERCEL_ENV)`.
  Anything you move must stay INSIDE that guard or the serverless import breaks.

**Done-when:** `/api/health` answers measurably earlier (or the receipt proves the local
VM cannot show the delta), every warmer still starts exactly once after listen, and the
route count is unchanged.

### #7 — Presence transport: SSE stream for `/api/mp`, polling kept as fallback (L)

**Goal.** Presence + world chat cost 0.80 of the ~0.90 requests/second every connected
user generates, because `world-navi-chat.js` polls `POST /api/mp/sync` every 2.5 s.
Add a server-sent-events stream that pushes the same sync payload the moment it changes,
cutting the fixed per-user request rate ~85–90% and presence latency from 2.5 s to
near-instant, while the poll path stays as the automatic fallback.

**USE THESE TOOLS** (nothing else): `node --check backend/multiplayer.js`,
`node --check public/world-navi-chat.js`, `node --check public/world-presence.js`
(read-only — it must not need changes), `node tools/build-dist.cjs` (+ `--check`),
local server on PORT=8937, `curl -N` for the stream check, local server on PORT=8930
for the regression pass if your branch's harness set needs it.

**Files.**
- `backend/multiplayer.js` — anchors: the sync route (line 60)
  `router.post('/sync', (req, res) => {` (mounted as `/api/mp` — see below), the chat
  route (line 114) `router.post('/chat', (req, res) => {`, `module.exports = router;`
  (line 155). The sync handler already computes the full payload (`players`, chat ring)
  that `world-navi-chat.js` consumes — the stream sends THAT object, unchanged.
- `backend/server-production.js` — the mount (line 2183):
  `app.use('/api/mp', require('./multiplayer'));                         // multiplayer presence + chat relay (poll-based, in-memory)`
  and the compression filter that already special-cases streams (lines 456–459):
  `if (ct.includes('text/event-stream')) return false;` — SSE through this app is a
  known-handled case; do not add compression workarounds.
- Precedent in this codebase: the Academy socket layer serves `/sse/academy` with replay
  (`backend/academy-socket.js`, wired at `server-production.js` ~3528:
  `require('./academy-socket').init(app, wss, require('./lib/academy-engine'))`). Mirror
  its SSE housekeeping (headers, heartbeat, close cleanup) rather than inventing new shapes.
- `public/world-navi-chat.js` — anchors: line 13
  `var ID_KEY = 'shd_mp_id', PARTY_KEY = 'shd_party', CELL = 600, POLL_MS = 2500, MAX_FAILS = 6;`,
  the sync call inside `syncAll` (line 36):
  `return post('/api/mp/sync', { room: R[ch], id: id, name: me, agent: '', x: Math.round(p.x), y: Math.round(p.z) }).then(function (d) {`,
  the presence hand-off inside that `.then` (line 42):
  `if (d.players && root.WorldPresence) { try { root.WorldPresence.update(d.players, { selfId: id, selfPos: p }); } catch (e) {} }`,
  and the poll timer (line 65): `if (!timer) timer = setInterval(syncAll, POLL_MS);`

**Steps.**
1. Server — subscriber registry + broadcast, in `backend/multiplayer.js`. Above the
   routes (after the room helpers), add:
   ```js
   // ── SSE presence stream (BACKEND_PERF #7) ──────────────────────────────────
   // Subscribers per room; sync/chat handlers broadcast the SAME payload object the
   // POST /api/mp/sync response carries, so poll and stream clients never diverge.
   const _subs = new Map(); // roomId -> Set<res>
   function _broadcast(roomId, payload) {
     const set = _subs.get(roomId); if (!set || !set.size) return;
     const frame = 'data: ' + JSON.stringify(payload) + '\n\n';
     set.forEach((res) => { try { res.write(frame); } catch (_) {} });
   }
   ```
2. Server — the stream route, next to `/sync`:
   ```js
   // GET /api/mp/stream?room=<room>&id=<id>  (EventSource cannot POST; identity here is
   // the same public room/id pair the poll already sends in the open — no new exposure.)
   router.get('/stream', (req, res) => {
     const roomId = req.query.room == null ? 'office' : String(req.query.room);
     const id = String(req.query.id || '');
     if (!validKey(roomId) || !validKey(id)) return res.status(400).json({ ok: false, error: 'invalid room or id' });
     res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
     res.write(': mp stream open\n\n');
     if (!_subs.has(roomId)) _subs.set(roomId, new Set());
     const set = _subs.get(roomId); set.add(res);
     const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (_) {} }, 25000);
     req.on('close', () => { clearInterval(hb); set.delete(res); if (!set.size) _subs.delete(roomId); });
   });
   ```
   (`validKey` is multiplayer.js's own validator, used by `/sync` at line ~66 — reuse it,
   do not re-implement.)
3. Server — broadcast points. The `/sync` handler builds its response payload in one
   place before `res.json(...)`: capture that object as `payload` (rename only — no
   shape change) and call `_broadcast(roomId, payload)` immediately before responding,
   ONLY when the payload's player set or chat tail actually changed since the last
   broadcast for that room (keep a per-room last-hash: `JSON.stringify` length + the
   newest chat timestamp is enough — the point is to not spam identical frames at poll
   cadence; pushes should be event-driven: a peer moved, a chat landed, a peer left).
   Do the same at the end of the `/chat` handler with the post-chat payload. If capturing
   the payload requires restructuring the handler's response construction, STOP and
   record — the payload shape is a contract with two clients (navi chat + presence).
4. Client — `public/world-navi-chat.js`. Extract the `.then(function (d) { … })` body of
   the sync call into a named `applySync(d)` used by BOTH paths (the presence hand-off
   at line 42 lives inside it — move it verbatim). Then:
   ```js
   var _es = null;
   function startStream() {
     if (/[?&]mpstream=0/.test(location.search)) return false;
     if (typeof EventSource === 'undefined') return false;
     try {
       _es = new EventSource('/api/mp/stream?room=' + encodeURIComponent(R[ch]) + '&id=' + encodeURIComponent(myId()));
       _es.onmessage = function (ev) { try { applySync(JSON.parse(ev.data)); } catch (e) {} };
       _es.onerror = function () { try { _es.close(); } catch (e) {} _es = null; startPoll(); };
       return true;
     } catch (e) { return false; }
   }
   ```
   Wire it where the poll timer is started (line 65's site): try `startStream()` first;
   `startPoll()` (the existing `setInterval(syncAll, POLL_MS)` path, unchanged) runs only
   if the stream fails to open or later errors. Keep ONE outbound heartbeat: while
   streaming, the client still POSTs `/api/mp/sync` at a REDUCED cadence (every 15 s) so
   the server sees its position/aliveness — implement as the same `syncAll` on a
   `POLL_MS * 6` interval started alongside the stream; its responses also flow through
   `applySync`. Chat SEND (`/api/mp/chat`, line 57) is unchanged.
5. Run `node tools/build-dist.cjs` (world-navi-chat.js is a boot-bundle file).

**Off-switch flag.** `?mpstream=0` in the realm URL → step 4's `startStream` returns
false and the client is byte-for-byte today's poller. Server-side the `/stream` route is
inert unless connected to.

**Verify.**
1. `node --check` all three JS files → exit 0; build-dist `--check` → up to date.
2. Stream check on PORT=8937:
   ```bash
   curl -sN "http://localhost:8937/api/mp/stream?room=office&id=spec-a" > /tmp/sse.out &
   sleep 1
   curl -s -X POST http://localhost:8937/api/mp/sync -H 'Content-Type: application/json' -d '{"room":"office","id":"spec-b","name":"SpecB","x":10,"y":20}' > /dev/null
   sleep 1; kill %1; cat /tmp/sse.out
   ```
   Expected: `: mp stream open`, then a `data:` frame whose JSON contains `spec-b` in
   its players — pushed by spec-b's sync, not by any poll from spec-a.
3. Fallback check: `curl -s -X POST http://localhost:8937/api/mp/sync …` (the step-2 body)
   still returns the full payload JSON (contract unchanged); a bad room/id on `/stream`
   → 400.
4. Client (operator browser, SIM here): realm with default URL → Network panel shows ONE
   `/api/mp/stream` connection and `/api/mp/sync` POSTs at ~15 s cadence only; a second
   browser/peer appears via `WorldPresence` without waiting for a poll tick.
   `?mpstream=0` → sync POSTs every 2.5 s, no stream connection.
5. Regressions: `presence-harness.js` 19/19 · `wave1-harness.js` 31/31 · `smoke-mobile-wave1.js` 27/27.

**Pitfalls.**
- EventSource cannot set headers or POST — identity rides in the query string. That is
  acceptable HERE only because `/api/mp` identity is already a self-chosen public id in
  an in-memory relay (no auth, no Sparks). Do not copy this pattern to any economy route.
- Broadcast-on-every-sync without the change check recreates the 2.5 s traffic as push
  traffic and keeps phone radios awake — the step-3 change gate is the item, not a nicety.
- Render's free tier + proxies idle-close quiet connections: the 25 s heartbeat comment
  frame is load-bearing; removing it makes the stream die silently and the client flaps
  between stream and poll.

**Done-when:** a peer's move/chat reaches an SSE-connected client without any client poll,
the poll contract is unchanged for fallback clients, and `?mpstream=0` reproduces today's
2.5 s polling exactly.

---

## DASHBOARD LEFTOVERS — Security honesty (#3) · dead view containers (#6) · skin unification (#7)

Source: `DASHBOARD_AUDIT.md` §8.1 items 3, 6, 7. (Items 1, 2, 4, 5, 8, 9 of §8.1 are a
separate queue item — do not redo them.) All three subsections edit `public/index.html`;
do them in the order 3 → 6 → 7, one commit each, because #6 shrinks the file and shifts
every line number below it — re-grep anchors after each commit, never trust a line
number from a previous subsection. `public/index.html` is NOT a boot-bundle file (it is
the dashboard document itself): no build-dist run, but `node --check` does not apply to
HTML — verification is the grep + local-server checks in each Verify block.

### #3 — Security view honesty: kill the fabricated results (S–M)

**Goal.** The Security (PIKADON) view contains the dashboard's only fabricated results:
functions that print "verified" / "No issues found" without measuring anything. The code
has since grown REAL replacements for two of them, but the fake first definitions still
sit in the file as landmines, the one function that was never replaced is still fake,
and the real endpoint check points at agent URLs that do not exist — make every button
in the view report only what it actually measured.

**USE THESE TOOLS** (nothing else): `grep` (anchors + the before/after definition
count), local server on PORT=8930, `curl` (endpoint audit in step 3), an operator
browser for the button click-through (SIM on this VM — no browser here can run the
dashboard; the definition-count and curl evidence below is the headless half).

**Files.**
- `public/index.html` — the fabricated first definitions (the "SAFETY ROOM" block,
  lines 31661–31694, verbatim):
  `function runSecurityScan() {` (31661 — appends
  `Security scan complete — All systems nominal` unconditionally),
  `function checkAPIEndpoints() {` (31676 — builds
  `const endpoints = ['/api/chat', '/api/files', '/api/notes', '/api/agents'];` then
  unconditionally writes `${e}: OK` for each; performs NO fetch; `/api/notes` has no
  backend route),
  `function scanForVulnerabilities() {` (31687 — `setTimeout(() => { … 'Vulnerability scan: No issues found' … }, 1500)`,
  no scan of any kind).
  The REAL replacements later in the same file (they WIN today — in a classic script the
  later function declaration overrides the earlier one):
  `// ── PIKADON: Real Security Scan (replaces fake one) ──` → `function runSecurityScan() {` (35981),
  `// ── PIKADON: Real endpoint check ──` → `async function checkAPIEndpoints() {` (36046,
  real `fetch` per endpoint with `AbortSignal.timeout(3000)`),
  and `function calculateSecurityScore() {` (35925).
  There is NO second `scanForVulnerabilities` — it exists once, and it is the fake.
  The callers (two panels, same globals): office/security panel buttons at 7481
  (`onclick="runSecurityScan()"`), 7486–7488 (`checkAPIEndpoints()`,
  `scanForVulnerabilities()`), and the Security view buttons at 10365–10367.
- `backend/api-proxy-routes.js` — the real agent routes the endpoint check SHOULD use
  (lines 1599–1601, verbatim):
  `router.get('/turtle/ping',  (req, res) => proxyAgent(8004, '/ping', res, true));`,
  `router.get('/nexus/ping',   (req, res) => proxyAgent(8003, '/ping', res, true));`,
  `router.get('/quill/ping',   (req, res) => proxyAgent(8005, '/ping', res, true));`
  The real `checkAPIEndpoints` instead fetches `/api/nexus/health`, `/api/turtle/health`,
  `/api/quill/health` — no such routes exist (DASHBOARD_AUDIT.md §2.2), so three agents
  report "Offline or unreachable" forever.

**Steps.**
1. Delete the dead fake `runSecurityScan` and `checkAPIEndpoints` (31661–31685): the
   block from `function runSecurityScan() {` immediately under
   `// ======= SAFETY ROOM FUNCTIONS =======` through the closing `}` of the first
   `checkAPIEndpoints` (the one whose body contains `'/api/notes'`). KEEP
   `clearSecurityLog` and everything after it. These two deletions change NOTHING at
   runtime (the 35981/36046 definitions already override) — that is the point: the fakes
   stop being one script-reorder away from live.
2. Replace the fake `scanForVulnerabilities` (31687) — it has no real twin — with a real
   local-state scan that reuses the real `runSecurityScan`'s own checks and reports only
   counted facts. Exact replacement body:
   ```js
   function scanForVulnerabilities() {
     notify('Scanning for vulnerabilities...');
     // Real local-state checks (same sources as the PIKADON real scan at the file's
     // second security block): exposed keys, error-log volume, audit presence.
     // This NEVER prints a verdict it did not count.
     var findings = [];
     var keyNames = ['shaddai_claude_key','shaddai_eleven_key','shaddai_gemini_key',
       'shaddai_serpapi_key','shaddai_json2video_key','shaddai_openclaw_token',
       'shaddai_minimax_key','shaddai_groq_key'];
     var exposed = keyNames.filter(function (k) { try { return !!localStorage.getItem(k); } catch (e) { return false; } });
     if (exposed.length) findings.push(exposed.length + ' API key(s) stored in localStorage (unencrypted): ' + exposed.map(function (k) { return k.replace('shaddai_', ''); }).join(', '));
     var errs = (window.S && S.errorLog) ? S.errorLog.length : 0;
     if (errs > 10) findings.push(errs + ' JS errors in the error log');
     var audits = (window.S && S.audit) ? S.audit.length : 0;
     if (!audits) findings.push('No audit trail recorded yet');
     var msg = findings.length
       ? 'Vulnerability scan: ' + findings.length + ' finding(s) — ' + findings.join(' · ')
       : 'Vulnerability scan: 0 findings across ' + keyNames.length + ' key slots, error log, audit trail';
     if (document.getElementById('securityLog')) {
       document.getElementById('securityLog').innerHTML += '<div style="color:var(--' + (findings.length ? 'warning' : 'success') + ')">[' + new Date().toLocaleTimeString() + '] ' + msg + '</div>';
     }
     if (typeof PIKADON_audit === 'function') PIKADON_audit('VULN_SCAN', 'local', 'PIKADON', findings.length ? 'warn' : 'ok', msg);
     notify(msg);
   }
   ```
   Note the honest zero-case wording: it names WHAT was checked and the count — it does
   not say "no issues exist", only that these checks found none.
3. Fix the real `checkAPIEndpoints` (36046): change its three dead agent URLs to the
   verified ping routes — `'http://localhost:11434/api/tags'` (Ollama, local-only by
   nature, keep), `/api/nexus/health` → `/api/nexus/ping`, `/api/turtle/health` →
   `/api/turtle/ping`, `/api/quill/health` → `/api/quill/ping`, and update the matching
   `name` fields' URLs only (names stay). Then AUDIT the remaining entries in its list
   (`/api/ollama-tags`, `/api/shaddai/health`, `/api/zerox/health`, `/api/oracle/health`,
   `/api/pikadon/health`, `/api/coinlore/global/`, `/api/workflow/list`,
   `/api/shaddai/skills`): start the local server and `curl -s -o /dev/null -w '%{http_code}\n'`
   each against PORT=8930. Any that returns 404: find the real route with
   `grep -rn "<path-suffix>" backend/*.js` and correct the URL, or DELETE the entry —
   record every URL's status and your disposition in the receipt. Do not leave a URL in
   the list that 404s on the local server.
4. Leave the real `runSecurityScan` (35981) and its unconditional-nothing wording as-is —
   it computes from local state; the audit's complaint about its predecessor does not
   apply to it. Do NOT touch `calculateSecurityScore` (35925).

**Off-switch flag.** None — an honesty fix has no legacy behaviour worth restoring.
Revert path = the `BACKUP-opencode/` copy of `index.html`; the receipt must say so.

**Verify.**
1. Definition counts after the edit:
   `grep -c "function runSecurityScan()" public/index.html` → 1 ·
   `grep -c "function checkAPIEndpoints()" public/index.html` → 1 (the `async` one) ·
   `grep -c "scanForVulnerabilities" public/index.html` → the definition + its 2 button
   call sites, and `grep -n "No issues found\|endpoints verified\|All systems nominal" public/index.html`
   → ZERO hits in the security functions (any remaining hit elsewhere must be named in
   the receipt with why it is not a fabrication).
2. Endpoint audit table in the receipt: every URL in the final `checkAPIEndpoints` list
   with its local-server status code; none may be 404.
3. Operator click-through (SIM until a device runs it): each of the three buttons in
   BOTH panels (7481/7486–7488 and 10365–10367) produces log lines that match a curl
   result or a counted local fact — nothing prints OK/verified/nominal without a fetch
   or a count behind it.
4. Dashboard still boots: local server, `curl -s http://localhost:8930/ -o /dev/null -w '%{http_code}'` → 200,
   and the served byte count differs from the pre-edit count by roughly the deleted
   block (~1.2 KB) plus the new scan body — record both counts.

**Pitfalls.**
- The two-definitions situation means a careless "fix the fake at 31676" edit does
  NOTHING at runtime (the 36046 definition still wins) while leaving the landmine armed.
  The deletion in step 1 is the fix; editing the dead body is not.
- `scanForVulnerabilities` has NO override — replacing its body (step 2) is a live
  behaviour change, unlike step 1. Keep its function name and signature identical: two
  buttons call it by name.
- Do not "improve" the real scan's key list from memory — step 2 copies the list from
  the real `runSecurityScan` (35981) verbatim; if the two lists ever disagree, the
  35981 list wins and the receipt records the drift.

**Done-when:** exactly one definition of each security function remains, every printed
result in the Security view traces to a fetch or a count, and the endpoint list contains
zero URLs that 404 locally.

### #6 — Dead view containers: delete the nine unreachable shells (M)

**Goal.** Nine of the dashboard's 40 view containers can never be displayed — four are
standalone copies whose features live as Office sub-tabs (the `showView` reroute makes
the containers unreachable), five are `display:none!important` shells with no caller at
all. Delete the nine markup blocks from the 3.7 MB file so the document is smaller and
no future edit mistakes a dead copy for the live one.

**USE THESE TOOLS** (nothing else): `grep` (anchors, parity checks, reference sweep),
`wc -c public/index.html` (before/after bytes), local server on PORT=8930 + `curl`,
operator browser for the Office sub-tab click-through (SIM on this VM).

**Files.**
- `public/index.html` — the nine containers (ids + lines verified on the current tree;
  re-grep after #3's commit, lines will have shifted):
  DEAD markup (rerouted): `<div id="skillsView" class="view">` (9234),
  `<div id="library-notesView" class="view">` (9540),
  `<div id="projectsView" class="view">` (9664),
  `<div id="billingView" class="view">` (46225).
  DEAD/STUB shells: `<div id="schedulerView" class="view" style="display:none!important"></div>` (10331),
  `<div id="auditView" class="view" style="display:none!important">` (12913),
  `<div id="dataView" class="view" style="display:none!important">` (12934),
  `<div id="workflowsView" class="view" style="display:none!important">` (14485),
  `<div id="tradeSignalsView" class="view" style="overflow-y:auto;max-height:calc(100vh - 170px);display:none!important">` (44943).
  The reroute that orphans the first four (in `showView`, ~27502):
  `if (v === 'projects' || v === 'skills' || v === 'library-notes' || v === 'billing') {`
  with `_sub = (v === 'library-notes') ? 'library' : v` → the Office sub-tab names are
  `projects`, `skills`, `library`, `billing`. Office tab buttons exist, e.g.
  `onclick="switchOfficeTab('skills')"` (7178) and `onclick="switchOfficeTab('library')"` (7179).

**Steps.**
1. PARITY GATE (before deleting anything). For each rerouted view, prove the Office
   sub-tab carries the live copy:
   ```bash
   grep -n "switchOfficeTab('" public/index.html | grep -E "skills|library|projects|billing"
   grep -n "data-otab\|office-tab" public/index.html | head -20
   ```
   Each of the four names must appear as a real Office tab with content. If any sub-tab
   is missing or empty, STOP for that container only — delete the other eight and record
   the exception (the audit says all four exist; verify, don't trust).
2. REFERENCE SWEEP per container before deleting it:
   `grep -n "skillsView\|library-notesView\|projectsView\|billingView\|schedulerView\|auditView\|dataView\|workflowsView\|tradeSignalsView" public/index.html public/*.js`
   — every hit outside the container's own markup must be classified in the receipt:
   a `getElementById('<id>View')` that would null-error after deletion BLOCKS that
   container's deletion (record it; do not paper over with optional chaining unless the
   call site is itself dead — say which). Note `showView`'s generic
   `document.querySelectorAll('.view')` loops are safe (they iterate what exists).
3. Delete each container's markup block: from its `<div id="…View"` line through its
   MATCHING close — find the boundary by the next sibling `<div id="…View"` or top-level
   section comment at the same indent; the four stub shells with `display:none!important`
   and no children (scheduler is a single line) are trivial, the four rerouted copies and
   tradeSignals are full blocks (skills ≈160 lines). Delete ONE container per commit-step
   and re-run the reference sweep after each — nine small deletions, not one big one.
4. Do NOT delete any JS functions (`renderProjects`, `renderBillingView`, …): the audit
   notes their showView branches are unreachable, but Office sub-tab code may call the
   same renderers — function deletion is out of scope for this item.
5. Do NOT remove the `showView` reroute (step-1 anchor): after deletion it is the only
   path those four names ever take, which is exactly correct.

**Off-switch flag.** None (dead markup has no behaviour). Revert = restore the container
block from the `BACKUP-opencode/` copy of `index.html` (back up before the first deletion).

**Verify.**
1. `grep -c 'id="skillsView"\|id="library-notesView"\|id="projectsView"\|id="billingView"\|id="schedulerView"\|id="auditView"\|id="dataView"\|id="workflowsView"\|id="tradeSignalsView"' public/index.html` → 0.
2. `wc -c public/index.html` before/after in the receipt (expect a five-figure byte drop;
   record the real number).
3. Local server: dashboard document → 200; operator click-through (SIM here): Office
   sub-tabs skills / library / projects / billing all open and render their live content;
   nav buttons for the four rerouted names still land in Office (the reroute), and no
   console error names a missing `…View` element.
4. The reference sweep from step 2 re-run → zero unexplained hits.

**Pitfalls.**
- `workflows` (plural, dead) vs `workflow` (singular, LIVE — the task engine view at
  5516): the ids differ by one letter. Deleting the singular view would break the live
  task system; the grep in Verify step 1 names the exact ids — use them, not patterns.
- tradeSignals' FEATURE lives embedded in another view (autopilot timer,
  `generateSignalNow` ~43040): only the standalone container at 44943 is dead. If the
  reference sweep shows the embedded copy sharing element ids with the container, STOP
  that deletion and record it — duplicate-id surgery is a different item.
- Billing's backend calls (`/api/billing/checkout`, `/api/stripe/*`) are live from the
  Office sub-tab — deleting the standalone markup must not touch any script block.

**Done-when:** all nine containers are gone (or a blocked one is recorded with its
blocking reference), the file is measurably smaller, and the four Office sub-tabs carry
their features exactly as before.

### #7 — Skin unification: one key, one writer, no unreachable skins (M)

**Goal.** Three code paths write the dashboard's skin through two different localStorage
keys, their whitelists disagree (one of them makes the holo skin impossible to select
programmatically), one wrapper wraps another wrapper, and a set of fully-written CSS
skins can never be selected at all. Unify on one storage key and one writer path whose
whitelist matches reality, and resolve the unreachable CSS skins one way or the other.

**USE THESE TOOLS** (nothing else): `grep` (key/writer census + CSS skin enumeration),
local server on PORT=8930 + operator browser for the picker click-through (SIM on this
VM), `node --check public/theme-switcher.js` and `node --check public/shd-holo.js`.

**Files.**
- `public/index.html` — the head loader (lines 4184–4196, verbatim): reader whitelist
  `if(['glitch','terminal','void','amber','dusk','solar','parchment','holo'].indexOf(skin) === -1) skin = 'glitch';`
  on `var skin = localStorage.getItem('shaddai_skin') || 'glitch';` — but the writer it
  installs disagrees: `window.setShaddaiSkin = function(id){` with whitelist
  `['glitch','terminal','void','amber','dusk','solar','parchment']` — **`holo` omitted**:
  calling `setShaddaiSkin('holo')` resets to glitch. The settings picker buttons call
  BOTH writers, e.g. (13268):
  `onclick="if(window.setThemeSkin)setThemeSkin('glitch');if(window.setShaddaiSkin)setShaddaiSkin('glitch')"`.
  The CSS skin layer is documented in-file (line 3929):
  `4 skins scoped by html[data-theme-skin]:  glitch (default) · terminal · brutalist · serif`
  with fonts loaded for them (line 421 comment names Cabinet Grotesk (brutalist) and
  Zodiak (serif)) — `brutalist` and `serif` are in NO whitelist.
- `public/theme-switcher.js` — the second system (line 21): `var KEY = 'shd_theme_skin';`
  (a different key, "the 6 dashboard skins").
- `public/shd-holo.js` — the third path, wrapped TWICE: lines 98–99
  `window._origSetSkin = window.setShaddaiSkin;` /
  `window.setShaddaiSkin = function (id) { if (id === 'holo') applyHolo(); else applyClassic(id); };`
  and again at line 393:
  `var o = window.setShaddaiSkin; window.setShaddaiSkin = function (id) { if (id !== 'holo') LS.set('shd_last_classic', id); return o(id); };`

**Steps.**
1. Census first (paste into the receipt):
   ```bash
   grep -rn "shaddai_skin\|shd_theme_skin" public/index.html public/theme-switcher.js public/shd-holo.js | grep -v "^\s*//"
   grep -o "data-theme-skin[^]]*" public/index.html | sort -u | head
   grep -n "html\[data-theme-skin=" public/index.html public/shd-holo.css | head -30
   ```
   The last grep enumerates every skin that actually has CSS. That list + the picker's
   `data-skin` buttons (`grep -n 'class="skin-opt"' public/index.html`) is the ground
   truth the unified whitelist must match.
2. One key: `shaddai_skin` wins (the head loader reads it before first paint — the
   other key can never win a no-flash race). In `theme-switcher.js`, change line 21 to
   `var KEY = 'shaddai_skin';` and add a one-time migration at its init: if
   `localStorage.getItem('shaddai_skin')` is null and `localStorage.getItem('shd_theme_skin')`
   is set, copy the old value over, then remove the old key. `setThemeSkin` keeps its
   name and signature (picker buttons call it).
3. One whitelist: in the head loader, make the writer's whitelist IDENTICAL to the
   reader's — change `window.setShaddaiSkin`'s array to
   `['glitch','terminal','void','amber','dusk','solar','parchment','holo']` (add
   `'holo'`). After this, `setShaddaiSkin('holo')` sets the holo skin instead of
   resetting to glitch; `shd-holo.js`'s wrapper still intercepts first for its
   `applyHolo()` extras — order preserved.
4. De-double-wrap `shd-holo.js`: delete the SECOND wrap (line ~393, the
   `LS.set('shd_last_classic', …)` wrapper) and fold its one behaviour into the first
   wrapper (98–99):
   ```js
   window.setShaddaiSkin = function (id) { if (id !== 'holo') { try { LS.set('shd_last_classic', id); } catch (e) {} } if (id === 'holo') applyHolo(); else applyClassic(id); };
   ```
   Match the file's actual `LS` helper name on your branch (grep `LS.set` in
   shd-holo.js) — if it differs, use the file's own helper, not this snippet's.
5. The unreachable CSS skins — **FOUNDER-GATED decision, do not choose**: `brutalist`
   and `serif` have full CSS + fonts but no whitelist entry, and DASHBOARD_AUDIT.md §1.4
   lists more CSS-only skins (`frost`, `linen`, `bone`, `ember`, `royal`, `tide` —
   confirm by the step-1 census on your branch). Two written-out branches:
   (a) ADMIT: add each census-confirmed CSS skin to BOTH whitelists (reader + writer,
   step 3's array) AND add a `.skin-opt` picker button per skin next to the existing
   ones (13268 block), same onclick shape.
   (b) DELETE: remove each unreachable skin's `html[data-theme-skin="…"]` CSS blocks and
   its font link/comment references (line 421 area), keeping the 8 whitelisted skins.
   Implement ONLY the branch the founder picks; until then, steps 1–4 ship on their own
   and this step is recorded as awaiting the call. Note in the receipt which branch was
   NOT taken.
6. Holo default-on is DASHBOARD_AUDIT.md §8.2 item D1 — a founder decision, NOT part of
   this item. Do not change the `|| 'glitch'` default.

**Off-switch flag.** None (storage-key unification is one-way by design; the step-2
migration is the compatibility path). Revert = `BACKUP-opencode/` copies of the three
files; a user whose skin was migrated keeps `shaddai_skin`, which the old code also reads.

**Verify.**
1. `node --check public/theme-switcher.js` and `node --check public/shd-holo.js` → exit 0.
2. Key census after: `grep -rn "shd_theme_skin" public/index.html public/theme-switcher.js public/shd-holo.js`
   → hits ONLY inside the step-2 migration lines. `grep -c "window.setShaddaiSkin = function" public/shd-holo.js` → 1.
3. Operator browser (SIM here): pick each skin in Settings → reload → the same skin is
   active (`document.documentElement.getAttribute('data-theme-skin')`), including `holo`
   chosen programmatically: `setShaddaiSkin('holo')` in the console leaves
   `data-theme-skin === 'holo'` (before this fix it reset to `glitch`).
4. Migration check: with only `shd_theme_skin` set (devtools), first load copies it to
   `shaddai_skin` and applies it; the old key is gone afterwards.

**Pitfalls.**
- The head loader runs before paint; theme-switcher loads deferred. Any fix that moves
  reading INTO the deferred file reintroduces a flash of the wrong skin — the head
  loader stays the reader of record.
- `shd-holo.js` loads LAST (after both other systems) — its wrapper is the effective
  writer today. Changing wrap order or deleting the FIRST wrap instead of the second
  breaks `applyHolo` and the wizard's finish path.
- Picker buttons call both writers in one onclick; after unification both write the
  same key with the same value — do not "clean up" the buttons to a single call in this
  item (other skins' tooling may hook either name).

**Done-when:** one storage key, matching whitelists that include `holo`, a single
`setShaddaiSkin` wrapper in shd-holo.js, migration proven, and the CSS-only skins either
admitted or deleted per the founder's recorded call.

---

## Coverage index

Every spec section in this file, and the research doc it was written from. Queue order
and status live in `PROGRAM_QUEUE.md`; execution rules live in
`OPENCODE_DIRECTIVES.md`. If a section and its source doc disagree, the section wins
(it was checked against the code on 2026-11-15); if a section and the CODE disagree,
the code wins and the receipt records it.

| Section | Source doc |
|---|---|
| How this file relates to OPENCODE_DIRECTIVES.md · Standing rules · Shared verify tools | `OPENCODE_DIRECTIVES.md` (program lead, 2026-11-15) |
| G-5 — Bazaar identity + write integrity | `BACKEND_CONNECTION_MAP.md` §5 (G-5) |
| G-4 — Currency unification: bazaar settles in Sparks, one writer per ledger file | `BACKEND_CONNECTION_MAP.md` §5 (G-4) — read AFTER G-5; the order is safety-critical |
| G-7 — City deed plots: give plots-v4 claims a backend | `BACKEND_CONNECTION_MAP.md` §5 (G-7) |
| G-9 — Skate leaderboard backend | `BACKEND_CONNECTION_MAP.md` §5 (G-9) |
| G-10 — Lounge tracks endpoint (wire the existing radio catalogue) | `BACKEND_CONNECTION_MAP.md` §5 (G-10) |
| INTERIORS — Completion (black-void council rooms) [DIAGNOSIS-FIRST] | `VIDEO_ISSUES.md` (filmed interiors) + `FIX_GUIDE_FOR_SMALL_MODELS.md` (P1 interiors) |
| VEHICLES + CAMERA — Collision with the realm collider set | `VIDEO_ISSUES.md` + `FIX_GUIDE_FOR_SMALL_MODELS.md` (P1 collision) |
| KTX2 — Phase 0: vendor the loader + transcoder (no asset conversion, nothing wired) | `FIX_GUIDE_DEEP_RESEARCH.md` §4 |
| ORPHANS BEHIND FLAGS — general pattern + Orphan 1 Weapons `?weapons=1` · Orphan 2 Agent gear `?gear=1` · Orphan 3 Combat core `?combat=1` · Orphan 4 Fishing `?fishing=1` · Orphan 5 Castle siege `?siege=1` | `REALM_SYSTEMS_INVENTORY.md` (orphaned-systems census) + `PROGRAM_QUEUE.md` queue item 14 |
| C-6 — PVS-lite for low dressing, from the existing height raster | `FPS_RESEARCH_2.md` Part C (C-6) |
| C-8 — Shadow cadence at MEDIUM (opt-in `?shadows` only) | `FPS_RESEARCH_2.md` Part C (C-8) |
| C-9 — Per-tier anisotropy (terrain textures) | `FPS_RESEARCH_2.md` Part C (C-9) |
| LOADING — Stage 2 — Prefetch the realm from the dashboard | `LOADING_PIPELINE.md` Part C, Stage 2 |
| LOADING — Stage 3 — Slim the ENTER gate: canon out, bodies out of the window | `LOADING_PIPELINE.md` Part C, Stage 3 |
| LOADING — Stage 4 — Retire the `document.write` bundle chain | `LOADING_PIPELINE.md` Part C, Stage 4 |
| LOADING — Stage 5 — One priority queue for ALL streamed GLBs | `LOADING_PIPELINE.md` Part C, Stage 5 |
| LOADING — Stage 6 — Codec policy for the remaining Draco carriers | `LOADING_PIPELINE.md` Part C, Stage 6 — PREMISE CORRECTED in-section: canon-v4 is already meshopt; the census decides |
| LOADING — Stage 7b — Low-res `color.jpg` placeholder, swapped for the full map | `LOADING_PIPELINE.md` Part C, Stage 7(b) |
| LOADING — Stage 7c — Mobile splat cap: no terrain layer decodes above 1024² on phones | `LOADING_PIPELINE.md` Part C, Stage 7(c) + `MOBILE_PASS2_PLAN.md` (texture dims) |
| BACKEND PERF — #6 — Boot diet: defer non-essential subsystems until after `listen` | `BACKEND_PERF.md` §7 item 6 |
| BACKEND PERF — #7 — Presence transport: SSE stream for `/api/mp`, polling kept as fallback | `BACKEND_PERF.md` §7 item 7 |
| DASHBOARD — #3 — Security view honesty: kill the fabricated results | `DASHBOARD_AUDIT.md` §8.1 item 3 + §2.3 (fabrication evidence) |
| DASHBOARD — #6 — Dead view containers: delete the nine unreachable shells | `DASHBOARD_AUDIT.md` §8.1 item 6 + §1.2 (view census) |
| DASHBOARD — #7 — Skin unification: one key, one writer, no unreachable skins | `DASHBOARD_AUDIT.md` §8.1 item 7 + §1.4/§5 (skin-system findings) — the CSS-skin admit-or-delete step is FOUNDER-GATED inside the section |

**Not in this file (by design):** loading Stage 1 + 7a (their own queue item, already
specced in `LOADING_PIPELINE.md` Part C), backend perf §7 items 1–5 + 8 (the "safe-now"
queue item), dashboard §8.1 items 1, 2, 4, 5, 8, 9 (the "safe-build" queue item),
G-1/G-2/G-3/G-12/G-6 (built — see their receipts), and every 🔒 founder-decision item in
`PROGRAM_QUEUE.md` (deploy, G-14 persistence, the pond, G-11 config flip, plot re-seat /
grid-commons, dashboard §8.2 D1–D6) — those are decisions, not specs.
