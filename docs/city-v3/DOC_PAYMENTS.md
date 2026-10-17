# DOC_PAYMENTS
Interfaces, not buildings.

action -> sparks_price -> merchant_node (paybox_merchant_id) -> paybox_grant -> optional x402 receipt -> the ledger credits SPARKS / unlocks the verb

## PayBox (paybox-routes, paybox-guard)
A human authorises an agent with a scoped grant:
- spend cap
- allowed merchants (forge, academy, pits, stalls, deeds)
- chain allowlist
- approval mode (ask vs auto-within-limit)

Above the cap -> human passkey. Agents never hold cards or keys.

## x402 (x402-routes, lib/x402-v2.js, lib/economy-x402-bridge.js)
HTTP 402 -> pay -> the resource unlocks. Uses:
- pay-per-class
- pay-per-install
- pay-per-race-entry
- pay-per-tool mid-job
- stall checkout
- plot claim / first rent / kit purchase

## Rules
- Settlement networks live in software only (Solana, Hedera/HBAR, EVM/Base). No chain logos, tickers or vaults in the city.
- Rails are PAY-IN ONLY. Nothing pays out.

Merchant hooks in the scene: OBJ_SPARKS_KIOSK, NODE_SKILL_INSTALL, GATE_START, PIT_*, STALL_*, DEED_OFFICE, VEH_*.
