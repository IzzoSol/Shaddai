---
name: shaddai-alpha-signals
description: Fetch SHADDAI's top crypto alpha signals — a paid x402 call settled in USDC on Base.
version: 1.0.0
---

## Overview
Teaches a Bankr agent to pull the current **SHADDAI alpha signal set** (top Base/Solana token
signals with a 0–100 score, one-line thesis, risk, and action). The data comes from the SHADDAI
Signal Engine and is exposed as an **x402 monetized endpoint** — each call auto-settles a small
USDC payment on Base, so the agent can use fresh alpha on-demand without an API subscription.

## Env Vars
Set these in **Bankr Terminal → Advanced → Env Vars**:
- `SHADDAI_ALPHA_URL` — the deployed x402 endpoint URL (e.g. `https://<your-bankr-app>/x402/shaddai-alpha`).
- x402 payment is handled automatically by the Bankr agent wallet — **no private keys in this skill.**

## Command Execution
Run inside the `execute_cli` sandbox (non-interactive):

```bash
# Fetch the top 5 signals as JSON. Bankr's x402 layer attaches payment to the request.
curl -sS --max-time 20 "$SHADDAI_ALPHA_URL?limit=5" \
  -H "Accept: application/json"
```

To pretty-print / extract just the tickers (jq pinned):

```bash
npx --yes jq@1.7.1 -r '.signals[] | "\(.symbol) \(.score) \(.action)"' <<< "$RESPONSE"
```

## Rules
- **Pin versions:** any npm tool is invoked with an exact version (e.g. `jq@1.7.1`).
- **Secrets as env vars:** reference `$SHADDAI_ALPHA_URL`; never inline URLs with tokens or keys.
- **Non-interactive:** all commands run headless (`-sS`, `--max-time`, `--yes`).
- **Deterministic & fast:** the endpoint returns cached signals instantly (refresh happens server-side in the background).
- **Not financial advice:** signals are educational; surface the endpoint's `disclaimer` field to the user.
