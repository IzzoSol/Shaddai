# SHADDAI — FULL AUDIT & DEBUG REVIEW

> Generated 2026-09-04. Research-only audit of `C:\Users\Brittany\Documents\IzzoSol-Shaddai`.
> Single-file SPA (`public/index.html`, 58,780 lines) + Express backend (`backend/server-production.js`) on port 3000.

## Bottom line
Unusually mature single-file SPA + modular Express backend. 55+ features genuinely wired with real logic, idempotency, graceful degradation, secret redaction. Main defects: **5 dead dashboard API calls** (P0), **sync fs I/O on hot paths** (P1 perf), a few **unbounded in-memory stores** (P1 mem), and **dev-permissive auth / plaintext-BYOK** (P1 sec, lock down before public deploy).

---

## P0 — Broken dashboard calls (visible "broken button" issues)
| Endpoint | Called from index.html | Impact |
|----------|------------------------|--------|
| `GET /api/auction`, `POST /api/auction/bid` | :29473, :29495 | World "Plot Auctions" → "Failed to load auctions" |
| `POST /api/stripe/subscribe` | :51409 | Billing "subscribe" 404 (use `/api/stripe/create-checkout` instead) |
| `GET /api/pricing` | :57669 | Hire price dropdown never populates |
| `POST /api/city/boost` | :29953 | City boost 404s |
| `POST /api/news/analyze` | :57515 | Investigation/news-analyze 404 |

## P1 — Correctness & hardening
1. Make file I/O async / buffered — replace `Logger.appendFileSync` (server-production.js:151) + per-request `writeFileSync` with async/writable-stream writer. Biggest perf win.
2. Add eviction to unbounded stores: `RequestTracker.metrics.endpoints` (:214-225), `BatchJobQueue.jobs` (:249), arena `bots`/`matches`, `reputation._scoreCache`, `worldCache`, `_SCRAPE_CACHE`, academy `sessions`/`receipts`.
3. Validate BYOK `[env,value]` against catalog whitelist before writing to `process.env` (keys-routes.js:1264) — closes env-injection vector.
4. Enforce auth in prod: `REQUIRE_AUTH=true`; `softAuth` ignores `x-user-id` only when `NODE_ENV==='production'`.
5. Protect `billing-routes.js:508` admin endpoint with secret/allowlist.
6. Consolidate double `/api/security` mount (:1259 + :1279).

## P2 — Polish / roadmap
1. Adopt password-locked `/api/vault` for BYOK in prod (vs plaintext user-keys.json).
2. Wire real academy merchant signer (academy-engine.js:265 TODO) off PAY_SANDBOX.
3. Push x402 on-chain settlement (x402-security.js:85).
4. Real collectables/museum NFT mint vs 402 upgrade hook.

## Feature inventory (55+ wired)
auth, firebase guard, stripe, sub-billing, billing tiers, economy(Sparks), AURA cache, **Arena** (agent-vs-agent), **Academy** (x402 lab, PARTIAL sandbox), x402, x402 agent hire, skill/agent marketplace, forge, collectables, rooms, operatives, bazaar, arcade, battle, skillplay, chat, multiplayer, work-sessions, museum, portal-admin, realms/districts, federation(A2A+MCP), reputation/DID/VC, referral, agent rooms/office, markets external data, telegram, AINL, neocortex memory, wallet, hire, analytics, keys(BYOK), api-vault, public dev API, jobs/batch, agent engine, MiroFish/TuFish, RAG/mastery, world labs, gridiron, media, achievements, video, llm proxy, orchestrator, Solana Pay(PARTIAL), char-gen.

## Sec notes (high level)
- softAuth trusts spoofable `x-user-id` header when `NODE_ENV !== 'production'`.
- BYOK stored plaintext when `KEY_STORE_SECRET` absent (gitignored+0600, dev-only).
- BYOK pushed into `process.env` at runtime — validate against whitelist.
- No hardcoded live secrets; thorough `.gitignore`; secret redaction in logger verified.
- SSRF guards present; rate limits on `/api` (150/min) + per-key on `/api/v1`.
