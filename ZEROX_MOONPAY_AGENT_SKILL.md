# ZEROX × MoonPay Agents — Skill

**Owner agent:** ZEROX (Wealth & Revenue Engine).
**Engine:** MoonPay Agents via `@moonpay/cli` (`mp`). **Model = Option A (non-custodial):** the `mp` CLI/MCP runs on the **user's machine**; keys live locally and never touch SHADDAI's server. SHADDAI provides the analytics, the kill-switch, and the paper-trade ledger.

> ⛔ **Hard rule:** Before proposing or executing ANY trade, ZEROX MUST call `GET /api/moonpay/status` and obey it. If `killSwitch` is `true`, ZEROX may only *analyze and propose paper trades* — never execute. PIKADON owns the kill-switch.

## One-time setup (user, on their machine)
```bash
npm i -g @moonpay/cli
mp consent accept
mp login --email you@example.com
mp verify --email you@example.com --code <code>
mp wallet create --name "main"
mp skill install          # installs the agent skills for Claude/MCP
mp mcp                     # run as an MCP server for Claude Code / Desktop
```

## The ZEROX loop
1. **Read safety state** — `GET /api/moonpay/status` → `{killSwitch, paperMode, dailyCapUsd}`.
2. **Gather signal** —
   - MoonPay market data: `mp token trending --chain solana`, `mp token search --query "<x>"`, `mp token retrieve --token <addr> --chain solana`.
   - SHADDAI analytics: Whale Watch, on-chain auto-scan, RSI/Volume (already in the dashboard).
3. **Decide** — form a thesis with explicit `rationale`, size within `dailyCapUsd`.
4. **Propose** — `POST /api/moonpay/intent` with `{action:"swap"|"bridge", fromToken, toToken, amount, chain, rationale}`.
   - If kill-switch ON → request is **blocked (423)**; record the thesis only.
   - If `paperMode` → logged as a paper trade (no funds move).
   - If live → response returns `intent.cliCommand`; the **user runs it locally** in `mp` to sign & execute. SHADDAI never executes.
5. **Execute (user-signed, local)** — e.g.
   ```bash
   mp token swap --wallet main --chain solana \
     --from-token So11111111111111111111111111111111111111111 --from-amount 0.1 \
     --to-token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   ```
6. **Fund / cash out** — `mp buy --token sol --amount <n> --wallet <addr> --email <you>` (fiat on-ramp / virtual account / zero-fee stablecoin on-ramp). Off-ramp likewise.

## Guardrails (PIKADON)
- Kill-switch **defaults ON**; toggling OFF is a human action: `POST /api/moonpay/killswitch {on:false}`.
- **Paper-trade first** (`POST /api/moonpay/paper {on:true}` is the default state).
- Respect `dailyCapUsd`; never propose beyond it.
- **Non-custodial only** — never ask the server to hold keys or auto-sign. Execution = user-signed via local `mp`.
- Every intent carries a `rationale`; no rationale → no trade.

## SHADDAI API (this server)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/moonpay/status` | kill-switch, paper-mode, caps (read before acting) |
| POST | `/api/moonpay/killswitch` | PIKADON toggle `{on}` |
| POST | `/api/moonpay/paper` | paper-mode toggle `{on}` |
| POST | `/api/moonpay/intent` | ZEROX proposes a trade (kill-switch gated) |
| GET | `/api/moonpay/intents` | intent ledger for the UI panel |

This replaces the old separate Jupiter / Solana / MoonPay widgets with one engine: **market data → decision → execute → fund/cash-out**, non-custodial.
