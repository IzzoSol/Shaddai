# V119 audit — what was checked, what was found, what is NOT covered

2026-11-06. Branch `feat/dashboard-v119` (local only, nothing pushed). Be literal: "tested" means a script ran and passed; "reviewed" means I read it.

## 1. Tested (all passing at the time of writing)
| Area | How | Result |
|---|---|---|
| Outside-bot bridge (`backend/platform-bridge.js`) | `backend/tests/platform-bridge.test.js` (~200 assertions: auth, scopes, idempotency, cancel, owner-only approval, revocation, cross-user isolation, secret rejection, allowlist, skills, inbox, chat channel, council ask, class join, quotas, plug-in workflows) | pass, repeated runs stable |
| Sparks metering | `backend/tests/platform-bridge.sparks.test.js` (free allowance, charge, idempotent replay, refund on failure, out-of-Sparks 402, ledger outage 503, per-bot daily cap, usage endpoint, metering-off) | pass 3/3 |
| Real MCP client compatibility | `platform-bridge.sdk-smoke.js` with the official `@modelcontextprotocol/sdk` 1.32.2 (not a repo dependency; set `MCP_SDK_DIR`) | connects, lists tools, runs a workflow, joins a class |
| Real tools over the live network | harness in `%TEMP%\shd-test\real-check*.js` against the real agent-engine tools | `market.snapshot`, `news.digest`, `research.topic` return real data; 32 recipe skills ran, 10 correctly refused for missing input, 1 hit a CoinGecko 429 after retries |
| Dashboard UI | headless Chrome scripts (`w2`..`w10`): Worlds tabs, Outside bots panel, Agent City canvas, agent body viewer (all 7 council bodies load), command chat, deep links, mobile layouts | 0 JS exceptions in every run |

## 2. Bugs found and fixed during the audit
- Idempotent replay beyond the hourly quota returned 429 instead of the original run (quota check ran before the replay check). Fixed + regression test.
- `NEXUS`, `ORACLE`, `QUILL` bodies never loaded in `model-viewer` (no meshopt decoder). Fixed with a self-hosted `public/vendor/meshopt_decoder.js` (MIT, 21 KB).
- Athenaeum school router `/api/school` was never mounted on the server. Mounted (human side only).
- Skill inputs: a skill with a missing required input ran with an empty query and failed upstream. Now refused up front with a clear message; `list_skills` shows `required_input`.
- Upstream free APIs rate-limit by IP (CoinGecko 429). Added a server-wide throttle (350 ms spacing), 60 s result cache, and two retries with backoff.
- A test double with a mangled regex had been masking a skill-input bug in my own tests; replaced and made the assertion specific.
- `bridge.json` (token hashes, private chat) was not git-ignored. Now ignored.

## 3. Reviewed, no change needed
- Tokens: 256-bit random, only SHA-256 stored, shown once, expiring, revocable, max 10 active per account, scopes default-deny, admin/treegens-pay/spend/trade/wallet scopes cannot be minted.
- Bots cannot approve their own runs (approval lives on the session-authenticated owner door only); a bridge token cannot use owner doors (tested).
- Tool allowlist (`backend/lib/safe-tools.js`, 73 tools) vetted by scanning each tool's source for exec/eval/fs-write/LLM/process.env and caller-chosen URLs; SSRF and ReDoS tools excluded.
- UI renders all server/bot text with `textContent`/DOM nodes (no `innerHTML` of untrusted text); chat links are `http(s)` only.
- Secrets: owner chat, bot messages, tool arguments and tool output are all scanned/redacted for key-shaped strings.

## 4. OPEN findings, ranked (not fixed)
1. **Two different "Sparks".** The 3D world, arcade and dashboard KPI use a browser ledger (`shaddai.sparks`, e.g. 10,000 welcome Sparks, editable by the player). The server `economy-service` is the real ledger (integer units, no fractions). The owner's definition (1 Spark = $1, 0.10 = 10 cents) needs a decided unit mapping. Metering assumes 1 ledger unit = 0.01 Spark via `SPARKS_LEDGER_UNITS_PER_SPARK` (default 100) and is **OFF** until `BRIDGE_METERING=on`. **Do not turn it on until the owner confirms the unit and what existing balances mean.**
2. **"4444" access gates are client-side** (Worlds, Pro Signals, Swarm) and the code is printed on screen. Cosmetic only; not security. Needs server-side check (WP3).
3. **Bridge store is a JSON file**, single server, no row locking. Fine for one Render instance; move to Postgres before scaling out or before real money depends on it.
4. **No OAuth 2.1 + PKCE for the MCP endpoint.** Bots that can only do OAuth sign-in cannot connect; pasted bearer tokens work. Unknown whether Grok Bot's MCP client needs OAuth (cannot be tested from here).
5. **Per-IP rate limit on failed bot auth is absent** (tokens are 256-bit, so brute force is infeasible, but add a limiter before launch).
6. **Free public APIs are a shared quota.** CoinGecko etc. will throttle under real load; consider paid keys or a data provider before many users.
7. **Bridge `/world-state` is public** (agent ids + presence only). Acceptable; revisit if agent ids become sensitive.
8. **`index.html` is 3.8 MB**, `ZEROX.glb` is 12 MB (plain, no meshopt/webp). Performance work (WP8) not started.
9. **Real-money paths untouched and unaudited here:** SAP treasury, Hyperliquid, x402, plot payouts. Handoff rules R1–R7 still apply; nothing in V119 touches them.

## 5. NOT covered (say so plainly)
- **The diagrams** (`shaddai-design-studio/portfolio/*`, e.g. `mcp`, `mcp-surface`, `revenue`) were **not** compared against the implementation. I only confirmed the folder exists.
- The other 3.7 MB of legacy `index.html` and older scripts were not audited line by line.
- Nothing was deployed, so live-server behavior (Render, CORS, cold starts, real Grok Bot) is **unverified**.
- The council knowledge bases are thin (NEXUS 6 docs, PIKADON 4, TURTLE's is art-history transcripts); `ask_agent` answers are only as good as that.
- The 2D game (`game.html`) is parked and unmodified.
- UI usability was checked by screenshots and scripted flows, not by real users.

## 6. Where the plan stands
Done: command center pieces (Worlds hub, Agent City, body viewer, command chat), bridge phase 1 with headless council, skills/workflows on real tools, Sparks metering (off), dashboard<->3D link per the world terminal's contract (hash routing, deep links, snapshot box).
Not done: OAuth for bots, Postgres store, academy tiers 1–7 + `/api/school/progress` (contract C3), `/api/world/agents` + tasks through the kernel (C4), bot bodies bought with Sparks, projects/co-creation, model upload marketplace, server-side gates, push/deploy.
