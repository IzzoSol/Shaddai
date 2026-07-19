# SHADDAI Signals Public API v1 — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending spec review
**Owner:** IzzoSol / SHADDAI

## Context

SHADDAI runs a Telegram crypto-signals bot (`@ShaddaiSignalsBot` → `@ShaddaiLabs` / `@ShaddaiSignals`) that posts rug-filtered token "calls" and tracks their performance (peak multiple / "Xs", hit-rate). The data lives in `backend/data/tg-calls.json` and is served on Render (`shaddai-g81x.onrender.com`).

Today the only HTTP surface is an **admin/dashboard** control API at `/api/telegram/*` (`telegram-routes.js`): `/stats` returns pre-formatted Telegram **HTML** (not developer-friendly JSON), write routes are gated by `ADMIN_TOKEN`, and there is **no public, structured way** to read the calls/leaderboard/performance.

**Goal:** expose the signals data as a clean, versioned, developer-friendly **public JSON API** that outside developers can use to build their own bots, dashboards, and integrations — behind **free self-serve API keys with rate limiting**, so access stays controlled and can be monetized later. This lets others build on SHADDAI's calls and drives adoption/reach.

**Non-goals (v1):** real-time push (webhooks/websocket), paid Stripe tiers, per-user billing. The design leaves room to add these without breaking v1 consumers.

## Users & primary use case

Developers/traders who want to **pull SHADDAI's calls, leaderboard, and performance as JSON** to power their own tools, and to **receive new calls** by polling a cursor. Access is limited via free API keys so abuse can be cut off and paid tiers can layer on later.

## Approach

Add a **new versioned namespace `/api/v1/*` on the existing Render service** — reuses the running Express app and the signals data, needs no new infrastructure or hosting cost. Data (API keys, usage) persists in JSON files under `backend/data/`, matching the project's existing persistence pattern (no database — consistent with the free Render plan and how the bot already stores state).

Rejected alternatives: a separate microservice (adds hosting + ops for no benefit at this stage); a third-party API gateway (cost + external dependency).

## Architecture

```
public/api.html            ← themed docs + "Get free key" page, served at /api
backend/public-api-routes.js  ← new Express router, mounted at /api/v1
backend/api-keys.js        ← key mint/validate/usage store (backend/data/api-keys.json)
backend/telegram-pnl.js    ← ADD clean JSON accessors (callsJson/leaderboardJson/statsJson/findToken)
backend/server-production.js  ← mount the new router + serve /api page
```

- **public-api-routes.js** — the only HTTP surface for consumers. Depends on `api-keys.js` (auth/limits) and `telegram-pnl.js` (data). One clear purpose: translate validated requests into JSON responses.
- **api-keys.js** — self-contained: `mint({label})`, `validate(key)`, `recordUse(key)`, persistence + in-memory rate-limit counters. Depends only on `backend/data/api-keys.json`.
- **telegram-pnl.js JSON accessors** — pure data shaping over the existing `_state.calls`; no HTML. Reused by both the API and (optionally) the existing routes.

## Endpoints

All under `/api/v1/`. Responses are JSON with a consistent envelope: `{ ok: true, data: … }` on success, `{ ok: false, error: "…" }` on failure.

### Read (require a valid API key)
| Method | Path | Params | Returns |
|---|---|---|---|
| GET | `/calls` | `limit`(≤100, default 50), `since`(cursor, see below), `chain`, `source` | Array of calls, newest first. **`since` is the live-delivery mechanism**: poll it to get only new calls. |

**Cursor (`since`) semantics:** `since` is a **timestamp in ms** (the `ts` of the last call the consumer saw). The endpoint returns calls with `ts > since`, newest first. Consumers save the highest `ts` they've received and pass it as `since` next poll. Ties at the same `ts` (rare) are all returned on the poll that first crosses them, so nothing is skipped; a consumer may see one duplicate across a boundary and should de-dupe on `id` (idempotent). `id` = the call's stable unique id derived from mint+ts.
| GET | `/leaderboard` | `limit`(≤100, default 50), `period`(all\|week\|day) | Top calls ranked by `peakMult`. |
| GET | `/stats` | — | `{ totalCalls, hitRate2x, avgPeak, distribution:{ x1_2, x2_5, x5_10, x10 }, updatedAt }`. |
| GET | `/token/:idOrSymbol` | — | Single call: `{ called:bool, symbol, mint, chain, entryFdv, entryPrice, currentMult, peakMult, ts }` or `{ called:false }`. |

**Call object shape:**
```json
{ "id": "…", "symbol": "JIMOTHY", "mint": "…", "chain": "solana",
  "source": "bonded", "entryFdv": 32000, "entryPrice": 0.000031,
  "currentMult": 12.4, "peakMult": 31.6, "ts": 1784200000000 }
```

### Keys (public, no key required, IP-rate-limited)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/keys` | `{ label?, email? }` | `{ ok:true, key:"sk_live_…" }` — shown **once**. Mints a free-tier key. |
| GET | `/me` | (auth) | `{ tier, created, usage:{ today, minute }, limits }` for the calling key. |

## Auth, keys & rate limiting

- **Auth:** `Authorization: Bearer <key>` (fallback `?key=`). Middleware validates → attaches key record → records usage → enforces rate limit. Missing/invalid ⇒ `401 { ok:false, error:"invalid or missing API key" }`.
- **Storage:** `backend/data/api-keys.json`. Each record: `{ id, hash, prefix, label, tier:"free", createdAt, lastUsedAt, count }`. The raw key is **hashed** (SHA-256) at rest; only a `prefix` (e.g. `sk_live_1a2b…`) is stored for display. Raw key returned only at mint time.

### Persistence limitation & decision (important)
Render's free plan has **no persistent disk** (confirmed: no `disk:` in `render.yaml`), so files under `backend/data/` reset to their **committed** version on every redeploy — the same constraint the bot's `tg-calls.json` lives with. Consequences for API keys:
- Keys **minted at runtime** by users are **lost on the next redeploy** unless persisted durably.
- **v1 decision (zero budget):** accept this. Redeploys are infrequent and owner-controlled; a beta user who loses a key re-mints in one click on `/api`. `api-keys.json` holds only **hashed** keys, so it *may* be committed to the **private** `IzzoSol/Shaddai` repo to seed a known set across deploys, but it is **not gitignored-as-secret** because it contains no reversible secrets.
- **First production hardening (deferred):** move keys to durable storage (free Upstash Redis, or an auto-commit-on-mint hook) so runtime keys survive redeploys. This is the one real infra dependency for "production-grade," called out explicitly rather than hidden.
- **Rate limits (free tier):** **60 requests/minute** and a **10,000/day** cap, per key. Implemented with the project's existing `express-rate-limit` keyed by API key. On exceed ⇒ `429` with `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers.
- **Key minting** (`POST /keys`) is rate-limited **per IP** (e.g. 5/hour) so nobody spams key creation.
- **Tiers:** only `free` exists in v1; `tier` field + limit lookup table make adding paid tiers a config change, not a rewrite.

## Developer front door

- **`/api`** → `public/api.html`, SHADDAI-themed (obsidian/emerald palette, per brand). Contents: what the API is, the endpoint table, copy-paste `curl` examples, the call-object shape, and a **"Get free key"** button that calls `POST /api/v1/keys` and displays the key with a copy button + "save this, shown once" warning. This is the single link to hand out.

## Data flow

1. Consumer hits `GET /api/v1/calls?since=…` with `Authorization: Bearer <key>`.
2. `requireKey` middleware validates the key (via `api-keys.js`), enforces rate limit, records usage.
3. Handler calls `telegram-pnl.callsJson({limit, since, chain, source})` → shaped JSON.
4. Response `{ ok:true, data:[…] }`.

## Security (PIKADON)

- Keys hashed at rest; raw key shown once. No secrets in code or responses.
- Public GET endpoints are read-only over already-public signal data; enable permissive CORS **only** on `/api/v1/*` GETs (so browser apps can call it) without loosening the rest of the app.
- All query params validated/clamped (`limit` ≤ 100, enums checked, cursor parsed safely).
- Key-mint throttled per IP; per-key rate limits prevent scraping/DoS on the free plan.
- No admin/config/broadcast capability is exposed on `/api/v1/*` — those stay on the `ADMIN_TOKEN`-gated `/api/telegram/*`.

## Testing

- **Unit:** `telegram-pnl` JSON accessors (shape, `since` cursor filtering, limit clamp, empty-state); `api-keys` mint/validate/hash/usage; rate-limit counter logic.
- **Integration:** each endpoint with a valid key (200 + shape), without a key (401), over the limit (429); `POST /keys` mints a working key; `/token/:x` hit and miss.
- **Manual:** load `/api`, click "Get free key", run a `curl` example against live Render.

## Rollout

Same as the bot: commit the new code files (`public-api-routes.js`, `api-keys.js`, `public/api.html`, the `telegram-pnl.js` accessors, the `server-production.js` mount) to `IzzoSol/Shaddai` `main`; Render auto-deploys. `api-keys.json` contains only hashed keys and may be committed (private repo) to seed keys across redeploys — see the persistence note above. Verify `/api` loads and a minted key returns calls JSON on live Render.

## Deferred / future (non-breaking)

- **Webhooks** (register URL → POST new calls, with signing + retries) as a paid-tier feature.
- **WebSocket** live stream for dashboards.
- **Stripe-backed paid tiers** (higher limits + webhooks) — slots into the existing `tier` field.
