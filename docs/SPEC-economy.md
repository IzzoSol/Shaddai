# SHADDAI — Economy Specification (Draft)

**Version:** 0.1 draft  
**Date:** 2026-08-28  
**Status:** SPEC — awaiting owner sign-off  
**Owner:** SHADDAI Agent Council (QUILL draft)  

---

## 1. Round-up

- Stripe purchases round up to the nearest $1 USD. [OWNER DECISION]
- Crypto-in (direct wallet funding) has no round-up.
- Opt-in at checkout; default off.
- UI prompt: "Round up $X.XX to $Y.00? (+Z Sparks)" where X.XX is the purchase price, Y.00 is the rounded total, Z = Y − X in whole Sparks.
- Round-up credit posts to the user's Sparks balance after Stripe payment settles.

## 2. Sparks

- 1 Spark = $1 USD, fixed. No float. [OWNER DECISION]
- Ledger: `economy-service.js`; PostgreSQL in production, dev file store otherwise.
- Balance read: `GET /api/economy/balance` → `{ sparks_balance }`.
- Fractional Sparks: round down to whole Sparks; remainder stays as credit cents in a separate float ledger (not Sparks).
- No cash-out, no transfer between users, no redemption for fiat.

## 3. Plots

- Fixed supply: 10,000 plots. [OWNER DECISION]
- Cost: 100 Sparks per plot. [OWNER DECISION]
- Buy: `POST /api/plots/claim` (idempotent on plotId + userId).
- Resellable via bazaar at market price.
- Unsold plots: 20% reserved for founders (2,000); 80% (8,000) public. [OWNER DECISION]
- Once supply sells out: secondary market only (bazaar).

## 4. Fee Pool

- Feeds from: (a) 5% bazaar marketplace fee, (b) 20% platform cut on agent job settlements, (c) 3% ASIMOV tax bridge. [OWNER DECISION]
- Settles weekly, Monday 00:00 UTC.
- Stored in `fee_pool` table: `period`, `amount`, `source_breakdown` (JSONB).
- Pool amount is a share of fees actually collected; never a promised rate.

## 5. Payout

- Formula: `per_plot = (pool_amount / num_active_plots) * plot_multiplier`.
- `plot_multiplier`: 1.0 default; 1.5 for founders plots. [OWNER DECISION]
- Worked examples:
  - Pool $10,000, 500 active plots → $20/plot.
  - 10,000 users, 2,000 active plots, $50,000 pool → $25/plot.
  - 100 users, 50 plots, $500 pool → $10/plot.
- Empty pool → per_plot = 0; UI shows "Pool empty this period."

## 6. NFT Benefits

- Badge NFT tiers: Prospect → Grandmaster. [OWNER DECISION]
- Grants: (a) plot priority (founders first), (b) fee-pool multiplier +0.1 per tier (max +0.5 for Grandmaster), (c) cosmetic unlocks.
- No cash value. [OWNER DECISION]
- Provenance via IPFS hash.

## 7. SHADDAI Coin

- Conversion: Sparks → coin at 100:1 (100 Sparks = 1 coin). [OWNER DECISION]
- Explicit disclaimer (must appear verbatim in UI): "SHADDAI coin is speculative. No guaranteed value. No cash-out. Not an investment."
- No in-game utility beyond cosmetic/governance signaling.

## 8. Failure Modes

- (a) Empty pool: plots pay 0; UI shows "Pool empty this period."
- (b) Refund: round-up Sparks clawed back from user balance; negative balance allowed up to −50, then blocked. [OWNER DECISION]
- (c) Plot supply sells out: secondary market only (bazaar).

---

## Owner Decisions Summary

All bracketed [OWNER DECISION] items above require explicit owner sign-off before build. Payouts are a share of actually collected fees, computed after the fact; no promised, projected, or advertised rate of return appears anywhere in product copy.