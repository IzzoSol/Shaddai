# SHADDAI — the vision, organized (V119 → command center)

Written 2026-11-06 from the owner's words in this session, the master plan (`shaddai-master-plan/SHADDAI_MASTER_PLAN_OPUS55.md`),
the Outside-Bot Bridge handoff, and the ASIMOV SAP v2 bundle. Status words are literal: **BUILT** = committed and tested here,
**PARTIAL** = something real exists, **NOT STARTED** = no code. Nothing here is pushed yet.

## The one-sentence product
The dashboard is a **command center**: you and your agents (forged agents and outside bots like Grok Bot / Muse) run workflows, chat,
co-create projects (code, blogs, games, 3D models), and watch it all happen live; the **3D realm** is where the world, cosmetics and
play live; **SAP/ASIMOV** is a district inside it; a **consultancy login** comes later on the same core.

## Pillars, status, and who owns each (agents = the council, used as reviewers/builders per package)

| # | Pillar | What it means | Status | Lead agent |
|---|---|---|---|---|
| A | **Command center home** | One screen: live Agent City, runs + approvals, bot inbox, balances, shortcuts | PARTIAL: Agent City, approvals, inbox panel exist; no single home screen yet | TURTLE (design) + NEXUS |
| B | **Agents & outside bots** | Forge agents; connect Grok/Muse/any MCP bot; scoped, audited, revocable | BUILT phase 1 (tokens, MCP endpoint, receipts, approvals). NOT STARTED: OAuth for AddMcpServer, model router, spend policy | NEXUS + PIKADON |
| C | **Tools & skills ready to use** | Every dashboard tool/skill usable by a bot or forged agent, server-side | BUILT read-only: 73 vetted tools, 107 of 149 recipe skills, 5 workflows. NOT STARTED: write actions, your own workflows, step chaining | NEXUS |
| D | **Collaboration & creation** | Projects where humans + bots co-create code, blogs, games, models; chat with bots | NOT STARTED (Projects entity, shared artifacts, comments, bot chat room) | NEXUS + QUILL |
| E | **Companion (mini dashboard agent)** | A talking, moving agent with its own body that uses dashboard tools for you | PARTIAL: it can already move in Agent City (2D). NOT STARTED: chat brain, tool-use loop in UI, body/likeness, 3D body | TURTLE + NEXUS |
| F | **Bodies & marketplace** | Better default models; users bring their own GLB from the marketplace | NOT STARTED (upload, validate, optimize, license, moderation, listing) | TURTLE + PIKADON |
| G | **World integration** | Plots/offices/arena/Athenaeum in dashboard; deep links; spectate; inventory sync | PARTIAL: 4 live tabs. Missing: deep links, server-side spectate feed, inventory on account, 3D client reading `/api/bridge/world-state` | NEXUS (needs 3D terminal) |
| H | **SAP / ASIMOV** | Garden plots, weather, food scan, maintenance by bots; value adapter | OTHER TERMINAL. Interface to agree: plots:read now, plots:maintain after garden state + numbers exist | ASIMOV terminal + ZEROX + PIKADON |
| I | **RAG brain** | Agents know the platform | PARTIAL: MCP is knowledge-only (7 KBs: SHADDAI 28, NEXUS 6, ZEROX 14, ORACLE 10, TURTLE 6, QUILL 17, PIKADON 4 docs). NEXUS hits are generic course text, not Shaddai docs | ORACLE + QUILL |
| J | **Ship & hygiene** | Push, deploy, gates, performance | NOT STARTED: push target unknown, "4444" gates still client-side, 3.8 MB page, no disk headroom | PIKADON + NEXUS |

## Hard rules every package obeys (from the handoffs)
1. Server executes, bots command, the avatar only reflects server state. No bot runtime inside Three.js or the dashboard.
2. Default-deny scopes. Money, trading, credentials are never reachable through the bridge. Anything with money class waits for the human owner.
3. Soft Sparks (economy-service) is the only in-game unit; $SPARKS the token, $ASIMOV, USDC are separate and optional. Shaddai works with none of them.
4. No fake partnerships (NVIDIA/Tesla/SpaceX), no stock-linked plots, no passive holder yield, no loot boxes.
5. xagent registration is not a live Grok Bot import; bots connect from outside through the bridge.
6. Uploaded 3D models are untrusted files until validated and sandboxed.

## Order of work (each phase ends with a test and a commit)

**Phase 1 — Ship what exists (blocked on owner answers)**
Push branch `feat/dashboard-v119` to the agreed remote, deploy, try one real Grok Bot with a token. Fix tool-argument mismatches that real runs reveal.

**Phase 2 — Command center home + bot reach (NEXUS, TURTLE, PIKADON)**
- Home screen: Agent City + approvals + inbox + balances in one place.
- OAuth 2.1 + PKCE for the bridge so AddMcpServer can connect without a pasted token.
- Bridge tool `rag_search` over the 7 knowledge bases (read-only) so outside bots know the platform.
- Move "4444" gates server-side.

**Phase 3 — Companion v1 (TURTLE, NEXUS)**
- Chat with a dashboard agent that picks tools/skills and runs them as a normal run (so it shows in Agent City, gets receipts, asks approval for anything sensitive).
- Body in the dashboard: 2D now; the existing 3D template (`forge-demo.html`) as the likeness source.
- Model router: BYOK → Ollama → free tiers → pooled credits (as in SAP v2).

**Phase 4 — Projects & co-creation (NEXUS, QUILL)**
- Project = shared room: members (humans + agents/bots), artifacts (files, posts, game configs, model refs), run history, comments.
- Bots contribute through bridge tools `create_project`, `add_artifact`, `comment` (write scopes, owner-approved at first).
- Templates: blog post, small game, code repo, 3D model brief.

**Phase 5 — Bodies & marketplace (TURTLE, PIKADON)**
- Upgrade the council bodies (ZEROX.glb is 12 MB, needs meshopt/webp); better default companion.
- Upload pipeline: size/poly/texture budget, glTF validation, strip scripts, license + creator attribution, moderation queue, then listing.
- Cosmetics stay a 3D-realm feature; the dashboard companion reads the same equipped set.

**Phase 6 — Write actions, SAP, consultancy**
- Dashboard write workflows one at a time, each with its own scope and approval.
- Plug SAP: `plots:maintain` once ASIMOV's garden state and thresholds exist; Plots tab may become "SAP" (SAP v2 asks for this rename; not done, owner to confirm).
- Consultancy login on the same core (separate repo `Shaddai-consultancy` already exists).

## Decisions only the owner can make
1. Push remote/branch, and which Render service is live (g81x looks suspended; "r383" unidentified).
2. Obsidian vault for the SHADDAI note (only `Obsidian Vaults\ASIMOV` found).
3. Approve moving the "4444" gates server-side.
4. Companion body: stay with the current template for v1, or commission new art first?
5. Marketplace models: free-only at launch, or paid with creator payouts (needs counsel + PIKADON before any payout)?
6. Rename Plots → SAP now, or after the garden ships?

## Where each piece lives
- Dashboard: `public/index.html` plus `shd-holo`, `shd-tidy`, `shd-worlds`, `shd-bridge`, `shd-city` (`.js`/`.css`).
- Bridge: `backend/platform-bridge.js` (mounted `/api/bridge`), allowlist `backend/lib/safe-tools.js`, test `backend/tests/platform-bridge.test.js`.
- School/Athenaeum router mounted at `/api/school` (bot-side `/xagent` still off).
- Older detail: `docs/V119-WORKLIST.md`.
