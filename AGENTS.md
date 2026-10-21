# AGENTS.md — SHADDAI agent contract

You are working in the **SHADDAI** product repo (`IzzoSol/Shaddai`): a workstation where AI agents do paid work, and a persistent 3D world those agents live in. Vanilla JS + Node/Express, JSON file stores, **no build step, no framework, no bundler**. Do not introduce one.

## Read these first

1. **`.github/copilot-instructions.md`** — the repository rules. Read before proposing changes.
2. **`docs/TRACKER.md`** - **THE MASTER TRACKER.** One page: what is DONE with its evidence, what is IN FLIGHT, what is NOT STARTED in order with its gate, and the decisions only the owner can close. Start here, then follow the links.
3. **docs/PLAN-SOCIETY-LAYER-20261020.md** — **the master plan** (society layer, tracks A-D). It holds the verified audit, the 27-item gap register, four work tracks (A society layer · B Grok training + forging · C the 3D realm · D money), the operating doctrine, and the **status table in section 11**.
4. **`docs/PLAN-AGENT-LIFECYCLE-20261021.md`** — **Track E**: the forged-agent lifecycle (forge -> register -> claim a body -> equip -> work -> earn) and the connector layer (Grok, Muse, MCP). Read it before any agent, forge, connector, body or job work.

## The rules that matter most

- **Never push `main`.** Render auto-deploys it. Push a branch; the owner merges.
- **Never modify existing code without Opus review.** New files and new tools are fine to build. Existing behaviour is not.
- **Never claim something works without a gate that proves it.** If a workflow needs an API key it declares `requires`. If an asset fails a probe it says so. The same rule applies to everything you write.
- **One honest standard.** `ok:false` on failure — never a 200 with a success body. Another user's resource returns **404, not 403** (confirming an id exists is itself a leak). Identity comes from `auth-guard.softAuth` -> `req.userId`, never from the request body.
- **One price source of truth.** `prices.json` (in `shaddai-n8n`) is master. Never hardcode a price in code, in the world, or in a page.
- **No secrets in client code, logs, bundles, or git history.** Never commit `backend/data/runtime-keys.json` or any `hf_` / `gsk_` / `sk-` / `AIza` / `xai-` string.
- **One heavy job at a time.** Blender export, video render, headless browser, full RAG reindex. Never two at once.
- **Ask before deleting.** Disk is tight; the owner frees space. Never delete to make room without approval.
- **Do not grow `public/index.html`** (3.62 MB). New surfaces are their own module mounted through the existing `showView(v)` tab registry.

## The seven agents

SHADDAI (orchestrator) · ZEROX (money) · ORACLE (research) · NEXUS (backends/APIs) · TURTLE (UI/UX, image, game assets) · QUILL (every word) · PIKADON (security, holds the veto). Forged agents are first-class — never assume an agent id is one of the seven.

**Maker is not checker.** Build -> verify -> approve. Nothing ships past PIKADON.

## Keeping the plan honest

When you complete a package from `docs/PLAN-SOCIETY-LAYER-20261020.md`:

1. Make the gate pass (the test, probe, or measurement named in the package).
2. Update that package's row in the **status table (section 11)**: tick `Status`, put the real numbers in `Evidence`.
3. Put the before/after numbers in the commit message.
4. If you find a gap that is not on the register, add it to the **gap register (section 4)** with its evidence and severity.

Do not create a second tracker, a second plan, or a second status file. One plan, one table.

## Before you claim a number

Verify it against the running system. The gateway is live at `http://127.0.0.1:3000/api/headless/*`; the MCP is live over stdio. Numbers in this repo's docs were verified on 2026-10-20 and some have since drifted — the plan's section 3 records what was actually true then, and the gap register records what was wrong.
