# SHADDAI Economy — Wiring & Verification Checklist

Use this after mounting or changing the economy REST layer to confirm the whole
surface is live and reconciling correctly.

## 0. Prereqs

- [ ] `backend/node_modules` exists (repo root has none; run `npm install` in `backend/`).
- [ ] Economy modules present: `shaddai-mcp/lib/eco-*.js` (14 modules).
- [ ] `backend/routes/eco-routes.js` exists and parses: `node --check backend/routes/eco-routes.js`.
- [ ] `backend/server-production.js` mounts the router after `/api/services`:
      `app.use(ecoRoutes.router())` wrapped in try/catch with a warn log.
      Confirm with `node --check backend/server-production.js`.

## 1. Boot

- [ ] Server starts: `node backend/server-production.js` (listens on `PORT || 3000`).
- [ ] Boot log shows: `[prod] Eco economy REST mounted (...)` and no `[prod] Eco economy REST failed:`.

## 2. Health

```http
GET /api/eco/health
```
- [ ] `200 { ok: true, modules_total: 13, modules: { ... all ok:true } }`
- [ ] Modules present: hall, paybox, ledger, scheduler, directory, graph,
      discoveries, subagents, bridge, plots, mastery, workflows, quota.

## 3. Happy-path write probes (in order)

Each should return `ok: true`.

1. **PayBox** — `POST /api/eco/paybox/create-intent { tool:"zerox_market_scan", userId:"probe-user" }` → `pending` intent.
   - [ ] `POST /api/eco/paybox/confirm { intentId, tx:"not-on-chain" }` → **402** (unverified). This is expected before a real Solana tx.
2. **Ledger** — `POST /api/eco/ledger/receipt { caller, instance_id, tool, amount_usdc: 1.5 }`
   - [ ] `platform_cut_usdc + owner_cut_usdc === 1.50` exactly (cent reconciliation).
   - [ ] `POST /api/eco/ledger/owed` lists the instance.
3. **Directory** — `POST /api/directory/register { id:"probe-off-1", templateId:"zerox", name:"Probe", owner, pricesUsdc:{ scan:0.5 } }`
   - [ ] `GET /api/directory` returns it; `GET /api/directory/template/zerox` includes it.
4. **Discoveries** — `POST /api/eco/discoveries/log { agent_id, type:"alpha", target:"mint:X", reason:"probe" }`
   - [ ] `GET /api/eco/discoveries/contextual/mint:X` returns it.
   - [ ] bad `type` → 400.
5. **Graph** — `POST /api/eco/graph/upsert { id, data }` + `POST /api/eco/graph/edge { from, relation, to }`
   - [ ] `GET /api/eco/graph/neighbors/:id` returns the edge.
6. **Sub-agents** — spawn → delegate → complete.
   - [ ] `GET /api/eco/subagents/stats/:parentId` reflects completion.
7. **Workflows** — `POST /api/eco/workflows/create { name, steps:[{tool:"directory_search",args:{q:"probe"}}] }`
   - [ ] `POST /api/eco/workflows/run { id }` → `run.status === "completed"`.
8. **Plots** — `POST /api/eco/plots/create { districtId:"bazaar", name:"Probe Plot" }` → `buy` → `accrue-rent`.
   - [ ] `GET /api/eco/plots/status` shows 1 owned.
9. **Mastery** — `POST /api/eco/mastery/create { instance_id, name, price_usdc }` → listed in `GET /api/eco/mastery`.
10. **Quota** — `GET /api/eco/quota/status/:userId` shows remaining; `POST /api/eco/quota/consume` decrements.
11. **Scheduler** — `POST /api/scheduler/add { type:"hall.announce", data:{text:"probe"}, every_ms:3600000 }`
    - [ ] listed in `GET /api/scheduler/jobs`.
    - [ ] unknown type → 400.

## 4. Hardening guards

- [ ] `POST /api/eco/paybox/create-intent` with `amount_usdc > 2500` → 400.
- [ ] `POST /api/eco/bridge/register { url:"https://localhost:1337/mcp" }` → 400 (loopback).
- [ ] `POST /api/eco/bridge/register { url:"https://10.0.0.5/mcp" }` → 400 (private range).
- [ ] `POST /api/eco/mastery/create` with `price_usdc > 2500` → 400.
- [ ] `POST /api/eco/ledger/receipt` with `amount_usdc > 2500` → 400.
- [ ] Reusing an already-paid tx signature on another intent → rejected (replay guard).
- [ ] Audit lines written to `backend/data/eco-audit.log` for key mutating ops.

## 5. Multi-process scheduler

- [ ] With two servers running, second one must set `ECO_OWN_SCHEDULER=false` so jobs don't double-fire.
- [ ] Verify only one process logs the scheduler start.

## 6. Front-end (public/)

The economy pages are served at `/` from `public/`:

- [ ] `/directory.html` lists live offices + publish form (uses `x-user-id`/Bearer from `shd_userid`/`shd_token`).
- [ ] `/plots-marketplace.html` shows districts, claimed plots, buy/rent.
- [ ] `/workflows-builder.html` builds + runs a workflow.
- [ ] `/reputation-leaderboard.html` shows per-instance tiers.
- [ ] `/hall-bind.html` binds chat ids (posting needs `TELEGRAM_BOT_TOKEN`).
- [ ] `/admin-dashboard.html` shows health, ledger, scheduler, quota.
- [ ] Pages share `eco-pages.css` + `eco-pages.js` (self-contained, never throw).

## 7. Cleanup between probe runs

- [ ] Smoke data (`shaddai-mcp/data/eco-*.json`) and `backend/data/eco-audit.log` are only probe artifacts — wipe before shipping production data.

## 8. Ship gate (SHADDAI / PIKADON)

- [ ] All 10 write probes `ok:true`.
- [ ] Ledger reconciles to the cent.
- [ ] No mutating route accepts an amount above its cap; ownership asserted for authed callers.
- [ ] Bridge only stores public https hosts.
- [ ] `node --check` clean on `eco-routes.js`, `server-production.js`, `mcp-unified.js`.
- [ ] Consider `REQUIRE_AUTH=true` + `ADMIN_TOKEN`/`ADMIN_EMAILS` before production fronting.