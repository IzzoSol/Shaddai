# SHADDAI Economy — REST Endpoint Reference (INDEX)

The `eco-*` modules power two surfaces:

1. **MCP** — `shaddai-mcp/mcp-unified.js` exposes them as MCP tools to clients.
2. **REST** — `backend/routes/eco-routes.js` mounts them on the production server
   (`backend/server-production.js`) at the routes below.

All endpoints are absolute under the server root (`/api/...`). They are
mounted after `/api/services` — no prefix is added. Mutating / user-scoped
routes run through `softAuth` (sets `req.userId`, only hard-blocks when
`REQUIRE_AUTH=true`). JSON body is parsed with `express.json()`. Free-tier
users are held to `FREE_TIER_DAILY_CALLS` (see qutoa).

> Money is **USDC**. Ledger cuts reconcile to the cent
> (`platform_cut + owner_cut === amount_usdc`).

---

## Top-level entry

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/eco/health` | Aggregate health across all modules: `{ ok, modules, modules_total, platform }` |
| GET | `/api/hall/status` | Hall readiness, bound Hall chat, stored binds |

---

## Hall — Telegram

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/hall/status` | – | Hall readiness + configured `TELEGRAM_HALL_CHAT_ID` |
| GET | `/api/hall/chat/:userId` | – | Bound chat id for a user/instance |
| POST | `/api/hall/bind` | softAuth | Bind `{ userId, chatId }`; sender may only act as self |
| POST | `/api/hall/post` | – | Post `{ text }` to the Hall (needs `TELEGRAM_BOT_TOKEN`) |

---

## PayBox — x402 micropayments

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/eco/paybox/status` | – | `{ prices, merchant, intents }` |
| GET | `/api/eco/paybox/quote/:tool` | – | USDC price for a tool |
| POST | `/api/eco/paybox/quote` | – | Same, via body `{ tool }` |
| POST | `/api/eco/paybox/create-intent` | softAuth | Create payment intent `{ tool, userId, amount_usdc? }` → `solana:` pay link |
| GET | `/api/eco/paybox/intent/:id` | – | Intent status |
| POST | `/api/eco/paybox/confirm` | softAuth | Verify on-chain tx `{ intentId, tx }`; **402** unless verified; replay-guarded |

Cap: per-call `amount_usdc` ≤ `2500`.

---

## Ledger — receipts, cuts, payouts

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/eco/ledger/status` | – | Ledger summary |
| GET | `/api/eco/ledger/summary` | – | gross / hall cut / owner share / payouts |
| GET | `/api/eco/ledger/owed` | – | Outstanding owner payouts |
| POST | `/api/eco/ledger/receipt` | softAuth | `logReceipt({ caller, instance_id, tool, amount_usdc })` |
| POST | `/api/eco/ledger/pay` | – | `pay(instance_id, amount_usdc, tx_signature)` |

---

## Scheduler

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/scheduler/status` | – | `{ running, jobs }` |
| GET | `/api/scheduler/jobs` | – | List jobs (filter `?type=`) |
| POST | `/api/scheduler/add` | softAuth | Add `{ type, every_ms, at, data }` |
| POST | `/api/scheduler/remove` | – | Remove by `{ jobId }` |
| POST | `/api/scheduler/enable` | – | `{ jobId, enabled }` |
| POST | `/api/scheduler/tick` | – | Force a run of due jobs |

Job types: `zerox.watch`, `hall.announce`, `collect_rent`, `oracle.weekly`,
`pikadon.recheck`, `sub_agent_work`. Unknown types → 400 (`scheduler.add`
validates the type).

Run loop: the REST server starts `scheduler.start(3000)`. Set
`ECO_OWN_SCHEDULER=false` for a process to decline owning the loop (avoids two
processes double-firing a shared JSON state).

---

## Knowledge Graph

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/eco/graph/status` | – | Entity/edge counts |
| POST | `/api/eco/graph/upsert` | softAuth | `{ id, data }` |
| POST | `/api/eco/graph/edge` | softAuth | `{ from, relation, to }` |
| GET | `/api/eco/graph/outgoing/:id` | – | Outgoing edges |
| GET | `/api/eco/graph/incoming/:id` | – | Incoming edges |
| GET | `/api/eco/graph/neighbors/:id` | – | BFS neighborhood `?depth=` |

---

## Discoveries

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/eco/discoveries/status` | – | Counts |
| POST | `/api/eco/discoveries/log` | softAuth | `{ agent_id, type, target?, reason }` — type ∈ rug_warning/alpha/pattern/correlation |
| POST | `/api/eco/discoveries/cite` | – | `{ discoveryId, citingAgentId }` |
| GET | `/api/eco/discoveries/contextual/:target` | – | Inherited warnings for a mint/contract/symbol |
| GET | `/api/eco/discoveries/all` | – | Filter `?type=` |
| GET | `/api/eco/discoveries/by-agent/:agentId` | – | One agent's discoveries |

---

## Directory (Office Avenue) — instance registry

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/directory/status` | – | Live instance count |
| GET | `/api/directory` | – | All live instances (or `?q=` search) |
| GET | `/api/directory/search` | – | `?q=` search |
| GET | `/api/directory/template/:id` | – | Instances of one template |
| POST | `/api/directory/register` | softAuth | Publish `{ id, templateId, name, description?, owner?, pricesUsdc? }` |
| POST | `/api/directory/unregister` | – | Remove by `{ id }` |
| POST | `/api/directory/bump-calls` | – | Increment call count `{ id }` |

Templates: `hall`, `zerox`, `oracle`, `quill`, `turtle`, `nexus`, `pikadon`
(accent colors + default services defined in `eco-directory.js` `TEMPLATES`).

---

## Reputation

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/eco/reputation/status` | Tiers list |
| GET | `/api/eco/reputation/:instanceId` | `{ tier, score, leads, perks }` |

---

## Sub-agents (Forge labor)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/eco/subagents/status` | – | Available roles |
| POST | `/api/eco/subagents/spawn` | softAuth | `{ parent_id?, role, name? }` — owner may only spawn under self |
| POST | `/api/eco/subagents/delegate` | softAuth | `{ sub_id, tasks[] }` |
| POST | `/api/eco/subagents/complete` | – | `{ work_id, results }` (credits sub) |
| GET | `/api/eco/subagents/queue/:parentId` | – | Queued batches |
| GET | `/api/eco/subagents/by-sub/:subId` | – | One sub's work |
| GET | `/api/eco/subagents/of-parent/:parentId` | – | Sub-agents of an instance |
| GET | `/api/eco/subagents/stats/:parentId` | – | Sub delegation stats |

---

## Bridge — external agents (Grok / Fable / Claude / custom)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/eco/bridge/status` | – | `{ agents, split }` |
| POST | `/api/eco/bridge/register` | softAuth | `{ id, url, platform?, name?, tools? }` — URL must be **https, public host** |
| POST | `/api/eco/bridge/call` | – | `{ id, tool, params }` |
| GET | `/api/eco/bridge` | – | Registered agents |
| GET | `/api/eco/bridge/:id` | – | One agent |

> Security: `bridge/register` rejects loopback + private-range hosts; the
> registered URL is POSTed to (JSON) on `call`.

---

## Workflows — no-code chains of tools

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/eco/workflows/status` | – | Count |
| POST | `/api/eco/workflows/create` | softAuth | `{ name, description?, creator?, published?, steps[], price_usdc? }` |
| POST | `/api/eco/workflows/publish` | – | `{ id }` |
| GET | `/api/eco/workflows` | – | List |
| GET | `/api/eco/workflows/:id` | – | Detail |
| POST | `/api/eco/workflows/run` | – | `{ id, context }` — steps interpolate `{{step_N.output}}` |

Run happens on the server (`workflows.setRunner` wired to the REST handler);
scheduled runs via the `sub_agent_work` job.

---

## Plots — digital property

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/eco/plots/status` | – | Districts + totals |
| GET | `/api/eco/plots` | – | List plots (`?district=`) |
| POST | `/api/eco/plots/create` | softAuth | `{ districtId, name, opts? }` (price/rent caps enforced) |
| POST | `/api/eco/plots/buy` | softAuth | `{ plotId, owner?, tx? }` |
| POST | `/api/eco/plots/rent` | – | `{ plotId, instanceId }` |
| POST | `/api/eco/plots/visit` | – | `{ plotId, visitor }` |
| POST | `/api/eco/plots/accrue-rent` | – | Accrue rent to owners |

Districts: `bazaar`, `oracle_tower`, `nexus_hub`, `arena`.

---

## Mastery — sellable pattern packs

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/eco/mastery/status` | – | `{ packs, royalty_pct }` |
| POST | `/api/eco/mastery/create` | softAuth | `{ instance_id, name, price_usdc, description?, patterns? }` |
| POST | `/api/eco/mastery/buy` | – | `{ instance_id?, pack_id }` |
| GET | `/api/eco/mastery` | – | List (`?instanceId=`) |
| GET | `/api/eco/mastery/:id` | – | Pack detail |

---

## Quota — free-tier

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/eco/quota/status/:userId` | Daily usage vs `FREE_TIER_DAILY_CALLS` |
| POST | `/api/eco/quota/consume` | `{ userId? }` — burn a call |

---

## Virtuals ACP — ZEROX identity & wallet status (read-only)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/virtuals/status` | ACP registration state + agent id/name/wallet (never echoes the key) |
| GET | `/api/virtuals/agent/:id` | Public marketplace listing: name, token, offerings (no key needed) |
| GET | `/api/virtuals/wallets` | Live Base ETH + Solana SOL balances of the ZEROX agent wallets |

Backs the ZEROX · Virtuals ACP card on `simple-signals.html`. Mirrors the MCP
`zerox_virtuals_me` / `zerox_virtuals_agent` / `zerox_wallet_status` tools.

---

## Auth notes

- **Identity**: send `Authorization: Bearer <token>` (Firebase ID token or the
  app JWT from `/api/auth/login`) and/or `x-user-id` **for local dev only.
  `x-user-id` is ignored in production** (`NODE_ENV=production`) and a bearer
  must verify — an unverifiable bearer is treated as anonymous.
- **`softAuth`** never hard-blocks locally; set `REQUIRE_AUTH=true` to enforce.
- Money-mutating routes cap amounts, assert ownership (caller == owner) when a
  real user is present, and write to `backend/data/eco-audit.log`.

## Config (env)

| Var | Effect |
|-----|--------|
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_HALL_CHAT_ID` | enable Hall posts |
| `ECO_OWN_SCHEDULER` | `false` = this process declines the scheduler loop |
| `REQUIRE_AUTH` | `true` = enforce authenticated identity |
| `ADMIN_TOKEN` / `ADMIN_EMAILS` | admin gating (not used by eco routes directly) |