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

10. **Kernel audit path.** `gateway/pikadon-kernel.js` builds its job-log path as `path.join(__dirname, '..', '..', 'backend', 'data', 'gateway-jobs.jsonl')`, which resolves one level ABOVE the repo; its audit lines only write when a quote is supplied. Not edited (shared security file); someone should check where those lines land.
11. **Mini 3D office v2** now has Jarvis-style holo tabs (DOM glass panels projected onto each desk; they run real workflows as your selected agent and show the result inline), 5 themes (Neon Grid, Aurora Glass, Solar Forge, Void Lab, Sakura Night), a circuit-art floor and skyline wall, 4 poster frames you can upload your own images into (kept on this device, resized to 512px), a jump dock, a follow-camera on any agent or bot, approvals from the Control tab, and a simplified phone mode (3 buttons, tab chips open on tap, quality Low). Council agents' KBs (TURTLE/QUILL) held nothing relevant to UI work, so the art direction and microcopy were done by me in their personas, guided by the repo's game-dev camera/performance notes. Not built: Blender-made props (kept procedural to stay light), selling/organizing posters, syncing room + posters to the 3D-world office, spectating inside the room, bot 'take over' beyond watching/approving (bots already run tools via the bridge; auto-approving money-class actions is intentionally NOT offered). Earlier (v1) notes follow.
11b. **Mini 3D office v1** (`public/shd-office3d.js`) is a first version: walkable room, live agents at their desks, orb customization, desks that open the real Dashboard panels, Navi menu (opens the 3D world), Record-10s clip, High/Low quality. Not built yet: spectating inside the office, wallet/PayBox flows beyond opening the existing Wallet tab (no money logic added), the gallery inside the room (desk opens the Gallery tab), unlocking Crystal/Figure forms with Sparks, importing uploaded models.
12. **C4 council tasks are per-user views**, not a shared world state. If the owner wants council agents to do shared, visible-to-all things, that needs a separate admin-only path.

## 5. NOT covered (say so plainly)
- **The diagrams** (`shaddai-design-studio/portfolio/*`, e.g. `mcp`, `mcp-surface`, `revenue`) were **not** compared against the implementation. I only confirmed the folder exists.
- The other 3.7 MB of legacy `index.html` and older scripts were not audited line by line.
- Nothing was deployed, so live-server behavior (Render, CORS, cold starts, real Grok Bot) is **unverified**.
- The council knowledge bases are thin (NEXUS 6 docs, PIKADON 4, TURTLE's is art-history transcripts); `ask_agent` answers are only as good as that.
- The 2D game (`game.html`) is parked and unmodified.
- UI usability was checked by screenshots and scripted flows, not by real users.

## 6. Where the plan stands
Done: command center pieces (Worlds hub, Agent City, body viewer, command chat), bridge phase 1 with headless council, skills/workflows on real tools, Sparks metering (off), dashboard<->3D link per the world terminal's contract (hash routing, deep links, snapshot box).
Done since: the world terminal's C4 (`/api/world/agents` + tasks through the kernel, tested) and the mini 3D office. Not done: OAuth for bots, Postgres store (owner: skip), academy tiers 1–7 + `/api/school/progress` (contract C3, owner: skip), bot bodies bought with Sparks, projects/co-creation, model upload marketplace, server-side gates, push/deploy.

## Loop pass 2 (learn once, use free forever) — added
- `POST /api/bridge/learn { agent_id, skill | workflow }` (owner door). One-time tuition: skill 0.25 Spark, workflow 0.50 Spark (charged only when `BRIDGE_METERING=on`; idempotent; refunded if the lesson cannot be recorded). The lesson is stored on the agent (`operative.skills[] = { skillId: 'skill:<id>' | '<workflow id>', source: 'bridge-learn' }`).
- An agent that has learned a skill/workflow runs it free and UNCOUNTED (does not use the hourly allowance). Other agents are unaffected. Chat: `/learn <words>` while talking to one of your agents.
- OPEN: these lessons live in the same `skills` array the Athenaeum uses, but the Athenaeum's own skill ids are a different registry; reconciling "learned in the Athenaeum" with "learned here" is undecided. Tuition prices are placeholders for the owner to set. Bots cannot learn on their own (it spends the owner's Sparks); only the owner can teach.
- Verified: `platform-bridge.sparks.test.js` covers ownership, unsafe-skill refusal, charge-once, already-known, free uncounted runs, unlearned agents still paying, refund on failure.
