# SHADDAI Public API — Landing-Page Hand-off

**For:** the landing-page / front-end terminal.
**Purpose:** everything you need to feature the public API on the site — marketing copy, the two sellable products, endpoints, auth, and the "get a free key" flow. The API is built, security-audited (4 passes), and deploying on Render.

---

## TL;DR for the site

- **Base URL:** `https://shaddai-g81x.onrender.com`
- **Interactive docs + one-click key page already exists:** **`/api`** (alias `/developers`) — served by the backend (`public/api.html`, SHADDAI-themed). Easiest integration: **link the landing-page CTA straight to `/api`.** You don't have to rebuild the docs unless you want them inline.
- **Two products, sold/offered SEPARATELY** (this is the key selling point):
  1. **Signals API** — SHADDAI's live rug-filtered token calls, leaderboard, performance, per-token lookup.
  2. **News API** — crypto headlines + trending topics.
- **Free tier:** self-serve key, **60 req/min · 10,000/day**. Paid tiers can layer on later (the tier field exists).

Suggested CTA copy: *"Build on SHADDAI's signals. Free API — live calls, leaderboard, and performance as JSON. Grab a key in one click."*

---

## Auth

Every data request needs an API key as a Bearer token:
```
Authorization: Bearer sk_live_xxxxxxxx
```
No key / bad key → `401`. Not entitled to that product → `403`. Over the limit → `429` (headers: `X-RateLimit-Limit/Remaining/Reset`).

## Get a free key (the signup flow)
`POST /api/v1/keys` — no auth, IP-throttled (5/hr). Body picks the product:
```bash
curl -X POST https://shaddai-g81x.onrender.com/api/v1/keys \
  -H "Content-Type: application/json" \
  -d '{"product":"both","label":"my app"}'
# product = "signals" | "news" | "both"
# → { ok:true, key:"sk_live_…", scopes:["signals","news"], note:"shown once" }
```
The key is shown **once**. The `/api` page already implements this with a product dropdown + copy button — reuse or mirror it.

---

## Endpoints

### Signals product (`scope: signals`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/calls` | Recent calls, newest first. `?limit`≤100, `?since=<ms>` (cursor for live polling), `?chain`, `?source`. |
| GET | `/api/v1/leaderboard` | Top calls by peak multiple. `?limit`≤100, `?period=all\|week\|day`. |
| GET | `/api/v1/stats` | Scorecard: `{ totalCalls, hitRate2x, avgPeak, distribution:{x1_2,x2_5,x5_10,x10}, updatedAt }`. |
| GET | `/api/v1/token/:idOrSymbol` | Was it called? entry, current & peak multiple. |

**Call object:**
```json
{ "id":"<mint>-<ts>", "symbol":"JIMOTHY", "mint":"…", "chain":"solana",
  "source":"bonded", "entryFdv":32000, "entryPrice":0.000031,
  "currentMult":12.4, "peakMult":31.6, "ts":1784200000000 }
```

### News product (`scope: news`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/news` | Latest crypto headlines (CoinTelegraph/CoinDesk/Decrypt). `?limit`≤50, `?q` filter. |
| GET | `/api/v1/news/trending` | Trending coins/topics. |

### Account
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/me` | This key's `{ tier, scopes, limits, usage }`. |

Envelope everywhere: success `{ ok:true, data:… }`, failure `{ ok:false, error:"…" }`.

---

## Live example (once deployed)
```bash
KEY=$(curl -s -X POST https://shaddai-g81x.onrender.com/api/v1/keys -H "Content-Type: application/json" -d '{"product":"both"}' | jq -r .key)
curl -s https://shaddai-g81x.onrender.com/api/v1/stats -H "Authorization: Bearer $KEY" | jq
curl -s "https://shaddai-g81x.onrender.com/api/v1/calls?limit=5" -H "Authorization: Bearer $KEY" | jq
curl -s "https://shaddai-g81x.onrender.com/api/v1/news?limit=5" -H "Authorization: Bearer $KEY" | jq
```
**Verify live:** `curl -o /dev/null -w "%{http_code}" https://shaddai-g81x.onrender.com/api/v1/stats` → `401` means live (routes mounted); `404` means the deploy hasn't landed yet.

---

## Design notes (to match the brand)
The existing `/api` page uses the SHADDAI palette: obsidian `#06080b`, emerald `#00ff9c`, gold `#e8c45c`, cyan `#4fd1ff`, IBM Plex Mono. If you build an inline section on the landing page, reuse those tokens so it's consistent. Tone: "ancient wisdom, future tech."

## What NOT to expose on the site
- Never publish the `ADMIN_TOKEN` (server-side only; it powers `POST /api/v1/keys/:id/revoke`, admin-only).
- Individual users' `sk_live_…` keys are theirs — the site only helps them mint their own.

## Known limitations (be honest in copy if you mention SLAs)
- Free Render plan → **keys reset on redeploy** (users re-mint in one click). Fine for a free beta.
- Single instance (key store is per-process). Needs a shared DB before horizontal scaling.

## Source of truth
- Router: `backend/public-api-routes.js` · Keys: `backend/api-keys.js` · Docs page: `public/api.html`
- Full design spec: `docs/superpowers/specs/2026-07-19-signals-public-api-design.md`
- Deploys from `IzzoSol/Shaddai` `main` → Render auto-deploy.
