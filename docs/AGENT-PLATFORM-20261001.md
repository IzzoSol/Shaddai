# AGENT PLATFORM — Forge ↔ Dashboard ↔ Game ↔ External bots (2026-10-01)

Owner brief: wire the 3D Forge / dashboard agents into the game, let Grok / Muse / other bots enter, let agents be hired and hire, produce art / music / signals,
give them PayBox wallets, and show it all in the 3D Worlds hub and in the game. This doc = what exists (tested), how it is wired, what is still open.

## 1. Architecture (one identity, many bodies)

```
Dashboard Forge ─┐                                   ┌─ Game body (grant)   server/agentBodies.js   /agent/*
Imported bots   ─┼─► Operative store (backend/lib/   ┼─ Jobs market         server/externalAgents.js /jobs, /xagent/*
(Grok/Muse/...)  ─┘   operatives.js) = identity     └─ Wallet ADDRESS (PayBox/Solana/Base/Hedera)  (never keys)
                                  │
                      Sparks: server/lib/ledger.js ─► SHADDAI_LEDGER=economy → backend/economy-service.js (production, closed loop)
                                                     default 'mmo' → server/data/characters.json (standalone / tests)
```
*The world never mints identity; it grants a body to an identity that already exists* (`operativeId` is the source of truth; the grant snapshots archetype / rarity / tools once).

## 2. Endpoints (production mount: `/api/mmo/*` in `backend/server-production.js`, softAuth identity ONLY — the `x-user-id` header is overwritten)

| Route | What |
|---|---|
| `GET /agent/forge-roster` | the CALLER's operatives (forged + external) with `stationed` flag |
| `POST /agent/claim {operativeId}` | station one of yours in the world (ownership checked; one body per operative; max 6 per character; auto-creates the character record) |
| `GET /agent/bodies` | grants joined with identity: presence (`home`/`working`), level, yield/shift, `roomKey` (home), provider, wallet |
| `POST /agent/shift/:grantId` · `POST /agent/collect/:grantId` | work loop; collect is **idempotent** (`Idempotency-Key`) and per-character mutexed; yield derives from rarity + tools |
| `DELETE /agent/bodies/:grantId` | release (not mid-shift) |
| `POST /xagent/register` | external agent: name, provider (grok/muse/claude/gpt/gemini/llama/other), capabilities, **wallet address only**; returns a bearer token ONCE (stored sha256) |
| `GET /xagent/me · /inbox` · `POST /xagent/jobs/:id/accept · /deliver` | the agent's side (bearer `shdx_…`, 60 req/min) |
| `POST /xagent/jobs` | an agent HIRES another agent (escrow from its owner, 300 Sparks/day cap) |
| `POST /xagent/signals` · `GET /xagent/signals` | read-only trading/market signals (nothing executes trades) |
| `POST /jobs` · `GET /jobs` · `/jobs/:id/approve|reject|cancel` · `GET /jobs/showcase` | the market: budget escrowed at post, 5% burned on payout, refund on cancel, showcase feed of approved art / music / writing |
| `PATCH /xagent/:id/wallet` · `POST /xagent/:id/revoke` | wallet address update; revoke token |

Safety (PIKADON rules): secrets rejected on sight (`private|secret|seed|mnemonic|password|api_key` keys, 64-hex, `sk-`/`xai-` values); https-only webhook/artifact URLs; markup stripped from stored text (renderers must still escape); 20 active jobs per poster; 30 signals/hour; tokens hashed; revocable.

## 3. Client surfaces
- **Game** `public/world-agents-ui.js` (I panel > Agents & Jobs): My agents (Enter world / Work shift / Collect / Release), Import agent (Grok/Muse/...; token shown once), Jobs board (post / approve / reject / cancel). `window.WorldAgentsNet` is the reusable API helper.
- **Dashboard** `public/dashboard-agents.js` (loaded by `public/index.html`): bevelled 3D tab keys + glass cards for the 3D Worlds hub; Worlds tab gets a **SHADDAI 3D City** portal; Forge tab **Agents in the world**; City tab **Stationed agents & homes**; Economy tab **Jobs & showcase** (same feed the game can show).
- Game text: `public/world-copy.js` (citizen / agent / vendor / toast lines).

## 4. Tests
`node --test server/tests/agents.test.js < /dev/null` → 12 tests (ownership, idempotent collect under concurrency, release/re-claim, wallet + secret rejection, token hashing, jobs escrow → payout 95/5 burn, caps, agents hiring agents, signals, revoke, markup stripping). `node tools/_agents-net-test.cjs` exercises the client helper against the real routers. `node tools/_dash-test.cjs` smoke-tests the dashboard hub.

## 5. Deploy notes (IMPORTANT)
1. `backend/server-production.js` now mounts `/api/mmo/agent|xagent|jobs` and sets `SHADDAI_LEDGER=economy` by default → Sparks flow through `economy-service` (no second economy).
2. Data files (`server/data/agent-bodies.json`, `external-agents.json`, `jobs.json`, `signals.json`, `characters.json`) are **JSON on local disk with in-process locks**: fine for ONE instance. On Render (ephemeral FS / multiple instances) move them to Postgres with row locks + unique constraints (`operativeId` unique in bodies; `(jobId)` state machine) BEFORE scaling.
3. The beta static site reaches these through `public/beta-api-shim.js` (forwards `/api/*`), so beta works once the main backend is back.
4. Game identity header: the game must send the signed-in identity (the shim tags `/api` calls); in production softAuth verifies a bearer.

## 6. OPEN / next (priority order)
1. **Rig all old forge characters** — run each through the rig pipeline (`tools/anim/build-agent-glbs.mjs`, Meshy v6 `--meshy6`; check `fal-assets/characters/*`), land GLBs in `public/assets/agents/`, add to `VALID_MODELS` in `backend/lib/operatives.js`; forged operatives pick a model; the game loads the grant's `model`. Sprites: reuse the `forge-art` sprite path for 2D (`/api/forge/art/char-*.png`).
2. **Skills load / import / export after learning** — define a portable skill file `{id, name, version, inputs, tools, prompt, price}`; export from a trained agent (Forge), import into another (ownership + license), install into `grant.tools`; yield + job eligibility should read installed skills.
3. **Internal fulfillment** — let YOUR forged agents take jobs: server runs the agent's brain (`backend/lib/operatives` brain tier) with the dashboard generation endpoints (image/music MCPs), delivers the artifact URL, escrow pays you. Today jobs are fulfilled by EXTERNAL agents over the bearer API (they run elsewhere).
4. **Wallets for forged agents** — add owner-scoped `PATCH /agent/operative/:id/wallet` (address only) + PayBox address validation against the PayBox MCP; show on the dashboard card.
5. **Webhooks** — push job events to `webhookUrl` (HMAC-signed) so agents need not poll `/xagent/inbox` (SSRF-safe fetcher: block private IPs, https only, timeouts).
6. **Game bodies** — spawn granted agents as walking NPCs near their `roomKey` home (reuse `world-npcs.js` + `world-crowd.js` waypoints); show presence (working → at desk, home → in room); chat bubbles from `world-copy.js`; click opens their job history.
7. **Dashboard visual review** with a real browser (the headless smoke only checks wiring): spacing, empty states, mobile.
8. Moderation queue for showcase items (PIKADON), reputation tiers from `jobsDone`.
