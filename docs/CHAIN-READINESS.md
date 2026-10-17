# Chain readiness: PayBox + Hedera + Solana (2026-09-29)

**Principle (owner):** no private keys in the game. The game holds wallet ADDRESSES only. The server signs. **Sparks stay off-chain** (closed-loop soft currency, `backend/economy-service.js` is the only writer; no cash-out).

## What the chain is for
| Use | Hedera | Solana |
|---|---|---|
| **Receipts scoreboard** (fight tapes, race results, drills, showcase sales; `{mindId, skillId, kind, hashes[], stats}`) | HCS topic message (cheap, ordered, public) | memo tx (or compressed attestation) |
| **NFT showcases** (art/book/track listed in the Gallery/Library/Observatory) | HTS NFT (royalty fee schedule = creator cut) | Metaplex mint |
| **Holder perks** (tier unlock for NFT holders, higher tiers can make custom models) | mirror-node read of token balance | RPC read of token account |
| **PayBox authorize** (real money purchases) | via PayBox merchant policy caps; the game only calls `window.shaddaiPayBox.authorize({sku,price,memo})` | same |

## Client (built): `public/world-showcase.js` -> `WorldChain`
`attest(kind, hash, meta)` · `mintNFT(meta)` · `verifyOwner(account)`. Default adapter `none` returns an honest **DRYRUN** receipt (never shown as on-chain). `WorldChain.enable('hedera'|'solana', {base})` swaps in server calls to `/api/chain/<chain>/{attest,mint,verify-owner}`.

## Server (to build): `docs/server-stubs/chain-routes.example.js`
Authenticated routes, strict input validation, keys from env only, every write logged, PIKADON reviews what may be minted (approved showcase items only, creator only). Suggested envs: `HEDERA_OPERATOR_ID/KEY`, `HEDERA_TOPIC_ID`, `HEDERA_NETWORK`, `SOLANA_RPC_URL`, `SOLANA_SIGNER_SECRET` (server only).

## Existing backend to reuse
`paybox-routes.js` (wallets, orders, credit), `paybox-guard.js`, `wallet-routes.js` (nonce/session/debit), `bazaar-routes.js`, `cosmetics-routes.js`, `reputation-routes.js`, `x402-*`, `economy-service.js` (+ `economy-routes.js`: balance, inventory, catalog, purchase, grant, spend), `arena/*` (agent-vs-agent matchmaker/referee).

## Order of work
1. Mount `chain-routes` with a `noop` adapter and the dry-run contract; 2. Hedera HCS attest for receipts; 3. NFT showcase mint (HTS) behind moderation; 4. holder-check perks; 5. Solana mirror; 6. wagers (escrow/settle inside economy-service, burn %, referral %).
