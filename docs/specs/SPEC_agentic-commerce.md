# SHADDAI — Agentic Commerce & Real Money Engine
## Design Specification

**Version:** 1.0  
**Date:** 2026-06-02  
**Authors:** SHADDAI Agent Council  
**Status:** SPEC — awaiting implementation  

---

## 0. Context & Scope

This spec designs the real money engine for SHADDAI. The codebase already has:

- `backend/moonpay-agent.js` — non-custodial intent model; PIKADON kill-switch; paper-trade mode; `pay-agent` records stablecoin *intents* and emits a `mp` CLI command for the user to sign locally. Keys never touch the server.
- `backend/billing-service.js` — three tiers (Free/Pro/Elite), credit ledger (`credit()`/`debit()`), `recordUsage()`, Stripe lazy-loaded behind env vars. `getMoonpayStatus()` has an explicit TODO: wire the credit top-up flow from MoonPay webhooks.
- `FINAL-SHADDAI-79.9.html` — UI panel with MoonPay buy/sell on-ramp widgets that open the hosted checkout popup.
- `SHADDAI_VISION.md §6.5 / §10` — defines the three pillars: agent does work, agent moves money (trade + pay-agents + MoonCard/commerce), marketplace economy.

**What this spec adds:** the full real-money path — credit top-up from fiat/crypto, settled agent payments with platform take-rate, MoonCard/agentic commerce safety model, Stripe price IDs, and phased rollout.

**Non-custodial constraint (hard):** SHADDAI must never hold user funds, private keys, or act as a money transmitter on the settlement path. All money movement is either:
- Stripe subscription billing (standard SaaS, no custodial risk), or
- User-signed on-chain transfers via the user's local `@moonpay/cli` (`mp`) wallet.

---

## 1. Credit ↔ Money Bridge

### 1.1 Credit Semantics

One credit equals USD $0.001 (one tenth of a cent). This rate is already encoded in `billing-service.js` (`recordUsage` converts `costUsd` × 1000 → credits). The same rate governs top-ups:

```
$1.00 fiat/stablecoin top-up → 1,000 credits
$10.00 top-up → 10,000 credits
$29.00 Pro subscription → 5,000 credits/month (effective rate: $0.0058/credit)
```

Subscription credits are cheaper per-credit than purchased credits — this is intentional and incentivizes subscriptions.

### 1.2 Top-Up Tiers

| Package | USD | Credits | Notes |
|---------|-----|---------|-------|
| Starter | $5 | 5,000 | minimum top-up |
| Builder | $10 | 11,000 | 10% bonus |
| Power | $25 | 30,000 | 20% bonus |
| Whale | $100 | 130,000 | 30% bonus |

Credits purchased via top-up do not expire. Subscription credits reset each billing cycle and are consumed first.

### 1.3 MoonPay Fiat/Crypto → Credits (Webhook Flow)

This is the missing link currently flagged as TODO in `getMoonpayStatus()`.

**Flow:**

```
User clicks "Top Up" in UI
  → FE calls POST /api/moonpay/topup-session { userId, packageId }
    → Server generates a MoonPay hosted checkout URL with:
        - apiKey (server-side)
        - externalTransactionId: "shaddai_topup_{userId}_{packageId}_{timestamp}"
        - currencyCode: USDC or user-selected crypto
        - baseCurrencyAmount: package USD value
        - walletAddress: platform-controlled RECEIVING address (NOT user's wallet)
          [NOTE: this is the ONE case SHADDAI receives funds — see §1.4]
    → FE opens the hosted checkout popup (same pattern as existing openMoonPay())

MoonPay completes purchase, fires webhook to POST /api/webhooks/moonpay
  → Webhook handler verifies HMAC signature (MOONPAY_WEBHOOK_SECRET)
  → Parses externalTransactionId to extract userId + packageId
  → Idempotency check: reject if transactionId already processed (store in webhook_log)
  → Calls credit(userId, creditsForPackage, `moonpay:topup:${transactionId}`)
  → Optionally: if crypto arrives in platform wallet, auto-forward to treasury or
    immediately to user's wallet (see custody approaches §5)
  → Returns 200 to MoonPay
```

**Webhook payload fields used:**
- `type: "transaction_completed"` — only credit on this status
- `data.externalTransactionId` — maps back to userId + package
- `data.cryptoTransactionId` — on-chain tx hash for audit log
- `data.status: "completed"` — guard: do not credit on pending/failed
- `data.baseCurrencyAmount` — verify matches expected package amount (± 1% slippage tolerance)

**Platform receiving wallet:** Required for the top-up flow. A single platform USDC wallet (Solana) receives top-up funds. This IS a custodial moment — see §5 for how to handle it minimally and compliantly.

### 1.4 Custody Boundary — The Only Custodial Moment

The platform holds funds **only for the duration** of a top-up credit conversion:

```
[User fiat] → [MoonPay hosted ramp] → [Platform USDC wallet] → credit(userId, ...) → [auto-sweep or hold]
```

The platform wallet is NOT a user account — it receives the payment, converts to credits, and either:
- (Option A) Holds the float as collateral backing the credit ledger (simpler, custodial), or
- (Option B) Immediately sweeps to a treasury multi-sig after each webhook (reduces custodial footprint)

**Flag for legal review:** Holding user funds as a float for credits *may* trigger money-transmitter or stored-value license requirements in some US states (notably CA, NY). MoonPay's ramp handles the KYC on the buy side — SHADDAI receives already-KYC'd converted crypto, not raw fiat. This reduces (but may not eliminate) regulatory exposure. See §6.

---

## 2. Pay-Agent Settlement

### 2.1 Current State

`POST /api/moonpay/pay-agent` currently records a **payment intent** and emits a `mp token transfer` CLI command for the user to run locally. The in-memory `earnings` tally is never actually funded. This is correct paper-mode behavior but needs a real settlement path.

### 2.2 Settlement Architecture

Real settlement has three legs:

**Leg 1 — User authorization** (unchanged from current model)
The user (or ZEROX agent acting with user permission) calls `POST /api/moonpay/pay-agent`. Server validates kill-switch, daily cap, and per-spend approval (see §3.4). Returns a signed payment intent + the `mp` CLI command.

**Leg 2 — On-chain transfer** (user signs locally)
The user runs the emitted `mp token transfer` command in their local `@moonpay/cli`. The CLI signs with the user's local key (never sent to SHADDAI), broadcasts to chain, returns a transaction hash.

**Leg 3 — Confirmation + ledger** (new endpoint)
```
POST /api/moonpay/pay-agent/confirm
  Body: { intentId, txHash, chain }
```
Server:
1. Looks up the original intent by `intentId`
2. Verifies the tx on-chain (RPC call to Solana/chain): checks recipient address, token, amount
3. Calculates platform take-rate (see §2.3)
4. Appends to append-only settlement ledger (see §2.4)
5. Updates agent earnings record
6. Returns settlement receipt

**Important:** SHADDAI does NOT move money in Leg 2. It only *records* confirmed on-chain transactions. The user remains in full custody throughout.

### 2.3 Platform Take-Rate

| Context | Take-rate | Notes |
|---------|-----------|-------|
| Internal agent payment (user paying their own agent) | 0% | No take |
| Marketplace job completion (agent earns from another user) | 10% | Standard |
| Featured/expedited job | 15% | Optional |
| Elite tier users | 7% | Loyalty discount |

Take-rate on marketplace payments is enforced at intent creation: the emitted `mp` command splits the transfer into two legs — agent wallet (90%) and platform wallet (10%) — OR a single transfer to the platform wallet which then auto-forwards to the agent. The split approach is cleaner for non-custodial design.

**Flag:** `mp token transfer` split syntax needs verification against actual `@moonpay/cli` capabilities at `dev.moonpay.com` — the current CLI command in `moonpay-agent.js` only shows a single `--to` recipient. May require two sequential transfer commands or a different mechanism.

### 2.4 Append-Only Settlement Ledger

A dedicated settlement ledger (separate from the credit ledger) tracks all real on-chain payments:

```json
{
  "id": "settlement_01abc...",
  "ts": "2026-06-02T10:00:00Z",
  "intentId": "mpp_abc123",
  "type": "agent_payment",
  "from": "user:u_xyz",
  "to": "agent:NEXUS",
  "toAddress": "7xK...solana",
  "amountUsd": 5.00,
  "amountToken": 5.0,
  "token": "USDC",
  "chain": "solana",
  "txHash": "5abc...solana",
  "platformFeeUsd": 0.50,
  "platformFeeTxHash": "5def...solana",
  "verifiedAt": "2026-06-02T10:00:05Z",
  "verifiedBy": "solana-rpc",
  "status": "settled"
}
```

This ledger is **append-only** — no record is ever modified or deleted. Corrections are new entries with `type: "correction"` referencing the original `id`.

---

## 3. MoonCard / Agentic Commerce

### 3.1 What MoonCard Is

MoonCard is a virtual/physical card backed by on-chain stablecoins in the user's non-custodial wallet. The user controls the funding wallet; MoonCard accesses it for authorized card transactions. SHADDAI's role: coordinate the agent's spending requests within a safety model the user configures.

**Flag — API tier required:** MoonCard issuing and agentic commerce (agent-initiated card charges) almost certainly require a higher MoonPay partner tier than the standard ramp API. Verify at `dev.moonpay.com` — specifically whether the Agent Commerce API, card issuance endpoints, and programmatic spend authorization are available in the `@moonpay/cli` tool tier or require a separate enterprise/partner agreement. This is a hard dependency; the full MoonCard flow cannot ship until confirmed.

### 3.2 Spending Categories

The agent can act in four commerce categories:

| Category | Examples | Risk Level |
|----------|----------|------------|
| Shopping | Amazon, general retail | Medium |
| Travel | Flights, hotels, car hire | High (large amounts) |
| Subscriptions | SaaS renewals, streaming | Low (recurring, predictable) |
| Business purchasing | Team software, cloud infra | High (authority ambiguity) |

Each category can be independently enabled/disabled in the user's approval profile.

### 3.3 Per-Spend Approval Model

Every agent-initiated purchase goes through a mandatory approval gate. There are three approval modes:

**Mode 1: Manual approval (default, safest)**
Agent proposes a spend → SHADDAI sends push notification / in-app alert → user explicitly approves or rejects → agent executes (or abandons) within 5-minute window.

**Mode 2: Pre-authorized rules (standard)**
User creates approval rules at setup:
```
IF category = subscriptions AND amount < $20 THEN auto-approve
IF merchant = "approved_list" AND amount < $50 THEN auto-approve
ELSE require manual approval
```
Unmatched transactions always fall back to Manual.

**Mode 3: Fully autonomous (opt-in, Elite tier only)**
Agent executes within hard caps without per-transaction approval. Requires explicit user consent at setup. PIKADON kill-switch always overrides.

### 3.4 Daily Caps & Limits

```
dailyCapUsd         — hard ceiling for total agent spend in a calendar day (default: $100)
perTransactionCapUsd — maximum for any single transaction (default: $50)
monthlyCapUsd       — soft cap; triggers a confirmation dialog if approaching (default: $500)
categoryCapUsd      — per-category daily sub-limit (optional; e.g., travel: $300)
```

Cap enforcement is server-side in `moonpay-agent.js` `state` object. Current `dailyCapUsd: 100` is the right starting point. Add `perTransactionCapUsd` and `monthlyCapUsd` fields to state.

Caps are checked at intent creation — if a proposed spend would exceed any cap, the intent is rejected with a specific error code the UI surfaces clearly.

### 3.5 Freeze / Unfreeze

Two freeze levels:

**Account-level freeze** — PIKADON kill-switch (already exists). All agent money movement blocked. Toggled only by admin (`requireAdmin` middleware).

**Commerce freeze** — user-controlled. Blocks all MoonCard/agentic commerce while allowing trading and pay-agent. Accessible from dashboard without admin. Default: frozen (commerce disabled until user explicitly enables).

**Auto-freeze triggers:**
- Daily cap exceeded (auto-freeze commerce for remainder of day)
- 3 consecutive failed transaction verifications
- Suspicious pattern: >5 transactions in 10 minutes above $10 each
- Manual freeze by PIKADON audit

### 3.6 Audit Log

Every commerce event — including rejected/abandoned transactions — is logged:

```json
{
  "id": "audit_abc",
  "ts": "2026-06-02T10:00:00Z",
  "userId": "u_xyz",
  "event": "spend_proposed | spend_approved | spend_rejected | spend_executed | freeze_triggered",
  "agent": "ZEROX",
  "merchant": "Amazon",
  "category": "shopping",
  "amountUsd": 24.99,
  "capAtTime": { "daily": 100, "dailyUsed": 45.00, "perTx": 50 },
  "approvalMode": "manual",
  "approvalOutcome": "approved",
  "approvedBy": "user",
  "approvedAt": "2026-06-02T10:00:30Z",
  "txHash": "5abc...",
  "notes": ""
}
```

Audit log entries are immutable. Stored in `backend/data/commerce-audit.json` (same file-based persistence pattern as the existing ledger) and exposed at `GET /api/moonpay/commerce/audit?limit=50&userId=`.

---

## 4. Stripe Subscriptions

### 4.1 Price IDs

The billing service already reads `STRIPE_PRICE_PRO` and `STRIPE_PRICE_ELITE` from env. The missing piece is creating and documenting the exact products in Stripe dashboard.

**Required Stripe products:**

| Product | Price ID env var | Amount | Interval | Metadata |
|---------|-----------------|--------|----------|----------|
| SHADDAI Pro | `STRIPE_PRICE_PRO` | $29.00 | monthly | `tier=pro` |
| SHADDAI Elite | `STRIPE_PRICE_ELITE` | $99.00 | monthly | `tier=elite` |
| Credit Pack — Starter | `STRIPE_PRICE_CREDITS_5` | $5.00 | one-time | `type=credits,package=starter` |
| Credit Pack — Builder | `STRIPE_PRICE_CREDITS_10` | $10.00 | one-time | `type=credits,package=builder` |
| Credit Pack — Power | `STRIPE_PRICE_CREDITS_25` | $25.00 | one-time | `type=credits,package=power` |
| Credit Pack — Whale | `STRIPE_PRICE_CREDITS_100` | $100.00 | one-time | `type=credits,package=whale` |

The `tier` metadata on subscription prices is how `handleWebhook` (already implemented in `billing-service.js`) reads the tier from `customer.subscription.updated` events.

### 4.2 Webhook Verification

The existing `handleWebhook` function processes events but the route that calls it must verify the Stripe signature. The route must:

1. Use `express.raw({ type: 'application/json' })` — NOT `express.json()` — on the webhook endpoint. Parsing before signature verification breaks the signature check.
2. Call `stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)` before passing to `handleWebhook`.
3. Return 400 on signature failure (Stripe will retry), 200 on success.

**Required env vars for Stripe:**
```
STRIPE_SECRET_KEY        — sk_live_... (or sk_test_... for dev)
STRIPE_WEBHOOK_SECRET    — whsec_... (from Stripe CLI or dashboard endpoint)
STRIPE_PRICE_PRO         — price_...
STRIPE_PRICE_ELITE       — price_...
STRIPE_PRICE_CREDITS_5   — price_...
STRIPE_PRICE_CREDITS_10  — price_...
STRIPE_PRICE_CREDITS_25  — price_...
STRIPE_PRICE_CREDITS_100 — price_...
```

### 4.3 Credit Pack Webhook Handler

The existing `handleWebhook` handles subscription events. Add a handler for one-time credit pack payments:

```
case 'payment_intent.succeeded':
  if (event.data.object.metadata.type === 'credits') {
    const { userId, package: pkg } = event.data.object.metadata
    const credits = CREDIT_PACKAGES[pkg]
    credit(userId, credits, `stripe:credits:${pkg}:${event.data.object.id}`)
  }
```

Credit pack metadata (`userId`, `package`) must be attached at checkout session creation — the FE passes `userId` to the server, which creates the Stripe Payment Intent with metadata before returning the client secret.

### 4.4 Monthly Credit Reset

Already implemented in `handleWebhook` under `invoice.payment_succeeded` — it calls `credit(userId, tc.monthlyCredits, ...)`. This is correct. Note: it currently adds credits ON TOP of existing balance rather than resetting to exactly `monthlyCredits`. This is a minor bug — should set `creditsRemaining = tc.monthlyCredits` (subscription reset) rather than adding (which would stack across months if user has a balance). Consider making monthly subscription credits a separate "allocation" bucket vs. purchased credits, consuming allocation first.

---

## 5. Custody & Settlement Approaches

### Approach A — Non-Custodial Sign-Each (Recommended for MVP)

**How it works:** SHADDAI never holds funds. All money movement requires an explicit user action (running the `mp` CLI command). For top-ups, the MoonPay widget opens directly to the user's wallet (user receives crypto directly; SHADDAI gets a webhook notification separately, not funds). For agent payments, user signs each transfer. For MoonCard, MoonPay handles authorization directly with the user's connected wallet.

**Trade-offs:**
- Pro: Zero custodial risk, no money-transmitter exposure, ships fastest, aligns with existing `moonpay-agent.js` model
- Pro: PIKADON kill-switch + paper mode already work
- Con: Credit top-up flow is awkward — user buys crypto to their own wallet, then SHADDAI must trust a separate signal (webhook or manual confirmation) rather than receiving funds directly
- Con: Take-rate on agent payments requires user to willingly split a payment; cannot be enforced

**Implementation:** Keep current model. Add a MoonPay webhook that fires on transaction completion with `externalCustomerId = userId` — SHADDAI gets notified and credits the user's account. The actual crypto stays in the user's wallet. The credit balance is SHADDAI's internal accounting, not a stablecoin balance.

**Flag:** Verify whether MoonPay's API allows configuring `externalCustomerId` and receiving webhook notifications for a user's own-wallet transaction (vs. a platform-wallet receive). If not, Option A top-ups require a manual "confirm top-up" button in the UI.

---

### Approach B — Minimal Platform Wallet (Recommended for Post-MVP)

**How it works:** A single platform USDC wallet (Solana) acts as a clearing house. Top-up credits flow through it (user → platform wallet → credit ledger). Agent marketplace payments also route through it (user → platform wallet → split to agent 90% + platform 10%). The platform wallet auto-sweeps to treasury daily, holding minimum float.

**Trade-offs:**
- Pro: Cleaner UX (one-click top-up, automated take-rate), verifiable on-chain
- Pro: Take-rate is enforceable without user cooperation
- Con: Custodial moment on the top-up leg — requires stored-value analysis by counsel
- Con: Platform wallet is a security target; must be a multi-sig with hardware key

**Implementation:** Requires a new `backend/treasury.js` with: wallet configuration, sweep logic, and the MoonPay top-up webhook handler that calls `credit(userId, ...)` on confirmation.

---

### Approach C — Full Custodial (Not Recommended)

SHADDAI holds user stablecoin balances on-chain tied to accounts. Rejected — violates the non-custodial constraint, triggers money-transmitter requirements in all US states, and creates a significant security target.

---

### Recommendation

**Phase 1 (now):** Approach A — trust MoonPay webhook notification, credit user's internal account, no platform wallet. Accept that top-up UX requires user to complete an external flow and optionally confirm. This keeps the paper-mode safety model intact and ships fastest.

**Phase 2 (6 months):** Approach B — introduce minimal platform wallet after legal review. Enables automatic take-rate enforcement and cleaner top-up UX.

---

## 6. Compliance Notes

### 6.1 Money-Transmitter Risk

SHADDAI's primary compliance strategy is **not being a money transmitter**: it does not hold user funds, does not move money between users, and uses MoonPay (a licensed MSB/EMI) for all fiat on/off ramps. Credits are an internal accounting unit representing a usage entitlement, not a stored monetary value (similar to airline miles — not regulated as money transmission in most US states under current guidance).

**Risk areas:**
- If SHADDAI holds a platform wallet and sweeps/forwards user funds (Approach B), this may be classified as money transmission in some states. Obtain a legal opinion before launching Approach B with real volume.
- If credits can be redeemed for cash or transferred between users, they may be classified as stored value (regulated differently in CA, NY, TX). Current design: credits are non-transferable and non-redeemable for cash — enforce this hard.

### 6.2 KYC

MoonPay performs KYC on all fiat on-ramp users (their legal obligation as an MSB/EMI). SHADDAI inherits this: any user who top-ups via MoonPay has been KYC'd by MoonPay. SHADDAI does not need to run its own KYC for subscription billing (Stripe handles payment fraud) or for internal credit usage. SHADDAI DOES need KYC if it becomes an agent of record for third-party agent payments above certain thresholds — defer this until marketplace agent payments exceed $10K/month.

### 6.3 Investment Advice / Auto-Trading

ZEROX's trading features (swap/bridge intents in `moonpay-agent.js`) involve moving user funds between crypto assets. This is NOT investment advice so long as:
- ZEROX provides information, not personalized recommendations
- The user explicitly initiates or approves each trade
- No guaranteed returns are implied
- Disclosures are shown: "ZEROX provides market information. This is not financial advice. All trades are user-initiated."

If ZEROX ever executes trades autonomously in Approach 3 (fully autonomous mode), this crosses into algorithmic trading — significant regulatory exposure. Gate autonomous trading behind explicit user consent, log all trades, and cap maximum autonomous trade size.

### 6.4 Data & Privacy

The settlement ledger and audit log contain transaction data. If operating in the EU/UK, this is financial personal data under GDPR/UK GDPR — requires a retention policy (suggest 7 years for financial records, erasure-resistant ledger design), right-to-access endpoint, and a DPA if using Stripe or MoonPay as data processors (both have standard DPAs).

---

## 7. Error Handling

### 7.1 Webhook Failures

MoonPay and Stripe both retry failed webhooks. The system must be idempotent:
- Both `handleWebhook` (Stripe) and the new MoonPay webhook handler must check `webhookLog[event.id]` before processing
- Return 200 even if the webhook is a duplicate (not 4xx — that would cause retries forever)
- Return 500 only for genuine server errors (DB write failure, etc.) — Stripe/MoonPay will retry

### 7.2 On-Chain Verification Failures

When `POST /api/moonpay/pay-agent/confirm` verifies a tx hash on-chain:
- RPC timeout: retry up to 3 times with 2-second backoff; return `status: "verification_pending"` and queue for background retry
- Tx not found: return `status: "tx_not_found"` — user may have submitted wrong hash
- Tx found but wrong amount/recipient: return `status: "verification_failed"` with details; do NOT credit agent; flag for PIKADON audit
- Chain reorg: check tx after 32 confirmations (Solana finality); for Ethereum-based chains, wait 12 blocks

### 7.3 Credit Ledger Edge Cases

- `credit()` throws if userId not found — wrap in try/catch in webhook handlers; log error, return 500 to trigger MoonPay retry
- `debit()` returns `{ ok: false, shortfall }` on insufficient credits — callers must check `ok` before proceeding with the action. Currently `recordUsage` does NOT check `ok` — add a soft-block: if shortfall > 0 and user is Free tier, return HTTP 402 with upgrade prompt
- Concurrent requests: the in-memory store is not atomic. Two simultaneous `credit()` calls for the same user could race. For production: wrap credit/debit in a per-userId async queue or move to a database with row-level locking

### 7.4 MoonCard / Commerce Errors

| Error | Behavior |
|-------|----------|
| Agent proposes spend while cap is exceeded | Reject with `CAP_EXCEEDED`, return remaining cap amount |
| Agent proposes spend while commerce-frozen | Reject with `COMMERCE_FROZEN`, surface unfreeze link |
| User approval times out (5-min window) | Auto-reject, log `approval_timeout`, notify user |
| MoonCard API unavailable | Fall back to manual mp CLI command; surface to user |
| Merchant declined | Log to audit, notify user, do NOT retry automatically |

---

## 8. Phased Rollout

### Phase 0 — Paper Mode (Current State)

All money movement is simulated. Kill-switch ON by default. Intents recorded but `mp` command is informational only. Credits are internal accounting with no real backing. **No real money moves.**

### Phase 1 — Credit Top-Up Live (Approach A)

1. Wire MoonPay webhook handler → `credit(userId, ...)` (the TODO in `getMoonpayStatus`)
2. Add `externalCustomerId = userId` to MoonPay hosted checkout URL
3. Implement `POST /api/webhooks/moonpay` with HMAC verification
4. Add idempotency via `webhookLog`
5. Test end-to-end with MoonPay sandbox keys
6. Keep kill-switch ON; disable `paperMode` only for verified test accounts

**Gate to proceed:** 10 successful sandbox top-ups, credits appear in ledger correctly, no double-crediting.

### Phase 2 — Agent Payment Confirmation Live

1. Add `POST /api/moonpay/pay-agent/confirm` with on-chain verification
2. Build per-userId daily spend tracker in `moonpay-agent.js` state
3. Add `perTransactionCapUsd` to state and enforcement
4. Write settlement ledger to `backend/data/settlements.json`
5. Deploy to production; keep `paperMode: true` by default
6. Allow individual users to opt-out of paper mode (Elite tier only initially)

**Gate to proceed:** 5 real on-chain USDC transfers confirmed and settled on Solana devnet, take-rate calculated correctly, audit log complete.

### Phase 3 — MoonCard / Agentic Commerce (Approval-Gated)

1. Confirm MoonPay agent-commerce API tier availability (flag: must verify at dev.moonpay.com)
2. Build approval-rules engine and per-category caps
3. Build commerce audit log
4. Implement push notification for per-spend approval (Phase 3a: manual approval only)
5. Beta with 10 Elite users, fully monitored
6. Auto-approve rules (Phase 3b) after 30-day manual-approval baseline

**Gate to proceed:** Legal review of money-transmitter exposure for Approach B (platform wallet); MoonPay partner tier confirmation.

### Phase 4 — Platform Wallet + Automated Take-Rate (Approach B)

1. Legal opinion obtained (stored-value / MSB analysis)
2. Multi-sig platform wallet created (Gnosis Safe or similar)
3. `backend/treasury.js` with sweep logic
4. MoonPay top-up → platform wallet → `credit()` + auto-sweep flow
5. Marketplace take-rate enforced on-chain (split transfer commands)
6. Gradual rollout: 10% of new top-ups through new flow; 90% still Approach A

---

## 9. New Endpoints Summary

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/moonpay/topup-session` | Creates MoonPay checkout URL for credit top-up | user |
| POST | `/api/webhooks/moonpay` | MoonPay webhook receiver (HMAC verified) | none (verify sig) |
| POST | `/api/webhooks/stripe` | Stripe webhook (already exists, add raw body) | none (verify sig) |
| POST | `/api/moonpay/pay-agent/confirm` | Confirms on-chain agent payment by tx hash | user |
| GET | `/api/moonpay/commerce/status` | User's commerce profile (caps, mode, freeze state) | user |
| POST | `/api/moonpay/commerce/configure` | Set approval mode, caps, category toggles | user |
| POST | `/api/moonpay/commerce/freeze` | Toggle user-level commerce freeze | user |
| GET | `/api/moonpay/commerce/audit` | Commerce audit log for user | user |
| GET | `/api/billing/credit-packages` | Available top-up packages with prices | public |
| POST | `/api/billing/credit-checkout` | Create Stripe payment intent for credit pack | user |

---

## 10. Unknowns & Flags (Items Requiring External Confirmation)

| # | Flag | Where | Impact if Unresolved |
|---|------|--------|----------------------|
| 1 | MoonPay agent-commerce API tier requirement — does MoonCard issuance + programmatic spend require enterprise partnership? | dev.moonpay.com | Phase 3 cannot ship |
| 2 | `mp token transfer` split syntax — does `@moonpay/cli` support two recipients or require sequential transfers? | `mp tools` / CLI docs | Take-rate enforcement on agent payments |
| 3 | MoonPay webhook `externalCustomerId` — does the hosted checkout URL accept this param and include it in webhook events? | MoonPay API docs | Approach A top-up flow |
| 4 | Stored-value license — does holding a platform USDC float (Approach B) require state licenses in CA/NY/TX? | Legal counsel | Phase 4 entire approach |
| 5 | Monthly credit reset behavior — should subscription credits stack with purchased credits or reset only the subscription bucket? | Product decision | Billing fairness; current code stacks |
| 6 | Autonomous trading (ZEROX fully autonomous mode) — does executing agent-initiated trades on behalf of users require investment-adviser registration? | Legal counsel | ZEROX auto-trade feature |

---

## 11. Key Design Decisions

1. **Credits are internal accounting, not money.** They cannot be transferred between users, cannot be redeemed for cash, and are consumed by AI usage. This distinction is critical for the stored-value compliance analysis.

2. **Settlement ledger is separate from the credit ledger.** Real on-chain payments go into `settlements.json`; internal credit accounting stays in `ledger.json`. These serve different purposes and should not be conflated.

3. **PIKADON kill-switch is always the top-level override.** No matter what approval mode a user sets, the admin kill-switch blocks everything. This is a hard architectural rule, not a soft default.

4. **Paper mode is the default for real-money features.** Each phase gates on explicit opt-out of paper mode. Users must actively enable live money movement.

5. **Audit log is append-only and includes rejected/abandoned events.** The audit log is not just a success log — every proposed spend, every rejection, and every freeze event is recorded. This is both a security property and a customer-service tool.
