# SHADDAI × Bankr — Agent Economy Extensions

Turning SHADDAI capabilities into **income-producing agent endpoints** on Base (x402 micropayments).
This is Phase 4 of the SHADDAI master build — the layer that makes agents *earn*, not just exist.

## What's here
| File | Type | Status |
|------|------|--------|
| `x402-shaddai-alpha.js` | **x402 endpoint** — SHADDAI Alpha Signals, paid per call in USDC | ✅ validated |
| `x402-shaddai-agent.js` | **x402 endpoint (generic)** — ANY forged operative → paid endpoint (async job pattern) | ✅ validated |
| `SKILL-shaddai-alpha-signals.md` | **SKILL.md** — teaches any Bankr agent to call the alpha endpoint | ✅ built |
| `app-shaddai-monetize/` | **Agent App** — cockpit to publish any forged operative as x402 (iframe + 2 Bun scripts) | ✅ validated |

### The Forge → Monetize flow (all 3 Bankr formats)
1. Forge an operative in SHADDAI (it lands in `/api/operatives`).
2. Open the **Monetize Agent App** (`app-shaddai-monetize/`) → **Load my agents** → **Publish as x402** (set price).
   - `list-operatives.js` fetches your agents (via `http.fetch`, no CORS), `publish-agent.js` writes `shaddai:monetized:<CODENAME>` to `appKV`.
3. Callers hit **`x402-shaddai-agent.js?agent=<CODENAME>&task=…`** → it verifies the agent is published, runs it via `bankr.askAgent` (background job), and every call **settles USDC on Base**.

**Env Vars:** `SHADDAI_API_URL` (your SHADDAI host), `SHADDAI_AGENT_X402_URL` (deployed endpoint URL).

## The x402 endpoint (`x402-shaddai-alpha.js`)
- Serves cached signals from `appKV` **instantly** (deterministic, low-latency).
- Keeps them fresh with a **background `bankr.askAgent('ORACLE', …)` run** — the caller never waits. This is the agentic core: a *paid endpoint backed by a live SHADDAI agent.*
- **No hardcoded secrets** — any upstream keys come from Bankr `secrets`/env vars.
- Returns a strict JSON contract: `{ signals:[{symbol,chain,score,thesis,risk,action}], … }`.

### Install
1. Bankr Terminal → register `x402-shaddai-alpha.js` as an **x402 endpoint**.
2. Set price (recommended **$0.01–$0.05 USDC/call**) — the handler is price-agnostic.
3. Deploy; note the public URL.
4. Set `SHADDAI_ALPHA_URL` in **Terminal → Advanced → Env Vars** and install `SKILL-shaddai-alpha-signals.md` so agents can call it.

## The loop this unlocks
**Forge an agent → give it tools → publish as an x402 endpoint → it earns USDC per call → you own the revenue.**
Wire that into the SHADDAI Bazaar and you can *trade income-producing agents.*

## Next builds
1. **Wire real signal data** — point the refresh at SHADDAI's live signal engine (TG bot `token-calls`/`token-snapshots`) instead of a pure agent generation.
2. **Agent App cockpit** — iframe + Bun: pick a forged operative, run a paid task, see results.
3. **Forge → publish-as-x402** — a one-click "monetize this agent" flow in the dashboard.
