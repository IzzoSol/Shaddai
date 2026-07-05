# SHADDAI Backend QA Sweep (PIKADON)

`qa-sweep.cjs` is a self-contained QA harness. It boots the SHADDAI express app
(mirroring `_dash93.cjs`'s router mount list) on an **isolated port 8242**,
exercises every backend endpoint with `fetch`, prints a PASS/FAIL table plus a
prioritized bug list, then closes the server.

## Run

From the project root:

```
node backend/test/qa-sweep.cjs
```

`NODE_PATH=backend/node_modules` is set automatically by the script (the app
depends on it), so no env setup is required.

## Exit codes
- `0` — all tests passed
- `1` — one or more tests failed

## What it covers
Navigator (ask/aura), Library (note + search round-trip), Aegis (eval scan +
CVE lookup), Esoteric tier gating (402/200), federation (agent.json, mcp.json,
A2A → visitors, portals), agent-engine shim (tools, skills stats/find),
collectables list, operatives.

## Constraints honored
- Boots its own app instance on port 8242 only; does not touch 8099.
- Never kills node processes or runs taskkill.
- Read-only against route/engine/server files (creates one library note via the
  real endpoint as part of the round-trip test).
