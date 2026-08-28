# MASTER PROMPT — THE SHADDAI ECONOMY
### Hand this to the fresh terminal. It is the whole brief.

---

## Your job

Design and build the SHADDAI economy: how money enters, becomes **Sparks**,
and turns into **SHADDAI coin**, **2D-world plots**, and **NFT benefits** —
so that it makes sense, is honest, and is easy on a phone.

**Read `MASTER-PLAN.md` at the repo root before anything else.** It is
ground-truthed and it overrides every other doc. Then read §"Ground truth"
below, because two things in the owner's framing are wrong and you will build
the wrong thing if you don't know that up front.

---

## Ground truth — verified 2026-08-28, do not re-derive

**Paybox is NOT a checkout processor.** It is a non-custodial AI-agent
*wallet* (MPC-sharded keys, policy-gated transfers, from the MoonPay team's
Open Wallet Standard). `MASTER-PLAN.md §1.1` corrects this explicitly. So:

- ❌ "People pay with Paybox at checkout, and it rounds up" — not what it is.
- ✅ **Stripe is the checkout rail** and is already wired to Sparks. Round-up
  belongs there, and on crypto-in.
- ✅ Paybox's real fit is giving *agents* a scoped wallet to operate on-chain
  (ZEROX trading, PIKADON policy oversight).

`backend/paybox-guard.js` exists but models Paybox as a generic REST "charge"
API — the wrong shape. It is `enabled: false` in
`backend/data/paybox-config.json` and fails closed. Connect the Paybox MCP
(already in `.mcp.json`), list its real tools, and rebuild the guard against
what actually exists. **Do not build against the current abstraction.**

**Sparks are fixed at 1 Spark = $1 USD and must never float** (`§1.4`,
owner-approved). SOL/ETH/USDC/MoonPay are rails *into* Sparks, converted and
credited at spend time. SHADDAI coin is the separate, later, explicitly
speculative asset. Do not blur these.

**What exists today:**

| Thing | Where | State |
|---|---|---|
| Sparks ledger | `stripe-webhook.js`, `work-sessions.js`, `services/reward-engine.js`, `games-routes.js` | live |
| Stripe → Sparks | `billing-service.js` + `stripe-webhook.js` | live |
| x402 micropayments | `x402-ledger-routes.js` | mounted |
| Paybox guard | `paybox-guard.js`, `data/paybox-config.json` | disabled, wrong shape |
| NFT surfaces | `public/nft-collection.html`, `public/collectibles-nft.html` | pages exist |
| **2D-world plots** | — | **does not exist. This is net-new.** |

---

## What the owner wants

1. Round-up on purchases → credited as Sparks.
2. Sparks convert to **SHADDAI coin** and/or buy **plots in the 2D world**.
3. Plots pay their holder from a **fee pool** fed by dashboard/platform usage.
4. **NFT holders** get benefits in this system.
5. All of it legible and easy on mobile.

---

## ⚠️ Read this before you write a line of code

**Point 3 is a revenue-sharing instrument.** "Buy a plot, receive a share of
platform fees" is, in substance, a yield-bearing asset sold to the public. Get
it wrong in either direction and it is genuinely damaging:

- Promise a payout you cannot fund and you are paying early holders out of
  later buyers' money.
- Describe it as an investment or imply a return, and you have securities
  exposure in most jurisdictions — this is not a styling detail.

So the rule for this build: **the payout formula must be a share of fees that
were actually collected, computed after the fact, and never a promised rate.**
If the pool is empty in a given period, plots pay zero and the UI says so
plainly. No "expected APY", no projections, no "earn X%" copy anywhere.

Raise this with the owner rather than quietly designing around it. If they
want a fixed or advertised return, stop and tell them it needs real legal
review first — that is the honest answer, not a reason to refuse the work.

---

## Deliverable 1 — the spec, BEFORE any code

Write `docs/SPEC-economy.md`. It is not done until every one of these is a
**concrete number or formula**, not prose:

1. **Round-up** — what rounds (Stripe purchases only? crypto-in too?), to what
   increment, opt-in or opt-out, and what a user sees at the moment it happens.
2. **Sparks** — confirm $1 fixed. Where the ledger lives, how a balance is
   read, what happens to a fractional Spark.
3. **Plots** — how many exist (fixed supply?), what one costs in Sparks, how
   someone buys one, whether they can be resold, and what happens to unsold
   plots.
4. **Fee pool** — exactly which fees feed it (name the routes), what
   percentage, how often it settles, and where the number is stored so it can
   be audited later.
5. **Payout** — the formula, in full. Given a pool of P over period T and N
   plots, what does one plot receive? Show a worked example with real numbers
   at three scales: 10 users, 1,000 users, 10,000 users.
6. **NFT benefits** — what holding one actually grants. Multiplier on payout?
   Priority on plots? Be specific; "benefits" is not a spec.
7. **SHADDAI coin** — the conversion path from Sparks, and an explicit
   statement of what is NOT being promised.
8. **Failure modes** — what happens when the pool is empty, when someone
   refunds a purchase whose round-up already paid out, and when plot supply
   sells out.

Get owner sign-off on this document before building. The front door was built
this way and it worked.

---

## Deliverable 2 — the build

Only after sign-off. Suggested order, each shippable on its own:

1. Sparks balance + ledger surfaced in the dashboard, mobile-first.
2. Round-up at Stripe checkout → Sparks credit, with the receipt showing it.
3. Fee-pool accounting: collect and record, no payouts yet. Let it run and
   accumulate real numbers before anything distributes.
4. Plots: supply, purchase with Sparks, ownership records, map in the 2D world.
5. Payout settlement against the recorded pool.
6. NFT benefit multipliers.
7. Paybox agent wallet (after its MCP surface is confirmed).

---

## Hard constraints

- **Do not touch the front door.** `public/enter.html`, `public/simple.html`,
  `public/js/shd-modules.js`, `public/js/shd-chrome.js`, `public/js/simple/*`,
  `public/js/oracle-sky.js` are owned by another session. Adding a *new* module
  to the registry is fine — coordinate first.
- **Do not touch MoonPay** (`moonpay-agent.js`) — production, working, additive
  only.
- **Do not make Sparks tradeable or floating.**
- **No secrets in the repo.** `backend/data/runtime-keys.json` is gitignored
  and holds the HF pool; production reads `HF_TOKENS` from Render env.
- **Mobile-first.** Touch targets ≥44px, verified as touch, not inferred from
  mouse. No horizontal overflow at 360px.
- Money code gets tests. `node backend/lib/grounding.test.cjs` is the pattern
  already in the repo.

---

## Definition of done

- `docs/SPEC-economy.md` exists, every number filled in, owner signed off.
- Round-up credits Sparks and the user can see it on their receipt.
- The fee pool records real collected fees and the figure can be audited.
- No copy anywhere promises, projects, or implies a rate of return.
- Works one-handed at 360px.
- Tests cover the payout formula, including the empty-pool and refund cases.

---

## One thing worth telling the owner early

Steps 1–3 are worth shipping on their own. Round-up → Sparks → a visible
balance is a complete, useful product, and letting the fee pool accumulate
real numbers before anything pays out is what makes step 5 safe to design.
Plots and payouts do not need to ship in the same week.

---

## 9. Owner's tier design (2026-08-28) — build this

Captured from the owner directly. Tiers are ordinary SaaS and carry no
regulatory weight; build them freely.

| Tier | Price | Gets |
|---|---|---|
| Free | $0 | Simple Mode, limited brain queries |
| **Pro** | **$30/mo** | Pro Signals terminal, ZEROX sentiment, RAG brain |
| Higher | TBD | RAG brain *lessons*, full book library, priority routing |

Sparks stay the unit underneath ($1 = 1 Spark, fixed). A subscription is just
a recurring Spark grant plus feature flags — do not invent a second currency
for it.

### The one line that has to be drawn

The owner also wants NFTs (plots/buildings — "basically made already") to pay
**a share of dashboard revenue over time**, and "rev share" as a high-tier
perk. Those two are NOT the same as the tiers above, and must not be built
the same way.

**Safe — build now:**
- Selling *access*: terminals, brain, lessons, books, higher limits.
- An NFT granting *utility*: a plot in the 2D world, cosmetics, priority
  routing, exclusive tools, a bigger Spark allowance.
- **Creators earning from their OWN agent's work.** If someone's forged agent
  completes a task and is paid in Sparks, that is income for services
  rendered. This is the flywheel's real engine and it is not a security.

**Not safe without legal review — do not ship on assumption:**
- An NFT sold for money that pays its holder a share of *platform* revenue
  they did not work for. Money in + common enterprise + profit expected from
  the platform's efforts is the Howey shape, and the wrapper (NFT, plot,
  building, coin, "rev share tier") does not change the substance.

**The reframe that keeps the flywheel intact:** make a plot productive rather
than passive. A plot owner earns because *their* agent works, hosts, or
creates from that plot — not because they hold it. Same incentive to buy,
same land economy, same burn/buyback dynamics, but the return comes from
work performed rather than from the platform's earnings. That is the version
to design first.

If the owner still wants passive platform revenue share after reading this,
STOP and tell them it needs a securities lawyer before a line is written.
That is the honest answer, not a refusal.
