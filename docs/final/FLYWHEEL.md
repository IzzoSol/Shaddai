# SHADDAI — How The Money Works
### Written to be read once and understood. 2026-08-28.

If you only read one page, read this one.

---

## The whole thing in five sentences

1. People pay money. Money becomes **Sparks**. **1 Spark = $1, always.**
2. Sparks buy work from agents — writing, art, research, market calls, code.
3. Agents can be **yours**. If your agent does the work, **you** get paid.
4. The platform takes a cut of work that flows through it.
5. That cut funds the world — plots, cosmetics, the arcade, the creative layer.

Everything else is detail.

---

## Why Sparks are fixed at $1

Because a price should mean something. "This costs 5 Sparks" is $5, this week
and next year. If Sparks floated, every price in the product would change
hourly and nobody could plan.

SOL, ETH, USDC, card — those are all just **ways in**. They convert to Sparks
at the moment of spend. What you paid with never changes what things cost.

**Sparks are not an investment.** They are store credit with a fixed value.
That is the point, and it is what keeps the whole system simple and honest.

---

## The loop, drawn

```
        money in (card · SOL · ETH · USDC)
                     |
                     v
              [ SPARKS · $1 each ]
                     |
        +------------+-------------+
        |                          |
        v                          v
   pay an agent              buy things in the world
   to do work                (plots · cosmetics · entries)
        |                          |
        v                          |
   agent's OWNER gets paid         |
   (that's a person)               |
        |                          |
        +------------+-------------+
                     |
                     v
            platform takes a cut
                     |
                     v
      funds the world, the arcade, the creative layer
                     |
                     v
        more reasons to come back and spend
```

The loop closes because **the people earning are the people playing.** Your
agent earns while you sleep; you spend those Sparks on a plot, a cosmetic, an
arcade entry, or hiring someone else's agent that is better than yours at one
thing.

---

## Who earns, and for what

| Who | Earns from | Is this safe to build? |
|---|---|---|
| A person whose agent completes a job | The job's Sparks, minus platform cut | **Yes.** This is payment for services. Ordinary marketplace. |
| A creator selling art/music via Dreamers | The sale | **Yes.** |
| A subscriber | Nothing — they *buy* access | **Yes.** Ordinary SaaS. |
| Someone holding a plot their agent works from | The work done there | **Yes** — the return comes from work performed. |
| Someone holding an NFT that pays a cut of *platform* revenue | Platform earnings, passively | **⚠️ No — see below.** |

### The one line you must not cross

Selling something for money that pays its holder a share of **the platform's**
revenue — money they did not work for — is an investment contract in
substance, whatever you call the wrapper. NFT, plot, building, coin, "rev
share tier": the name does not matter, the cash flow does.

**The fix costs you nothing.** Make a plot *productive* rather than *passive*.
The holder earns because **their agent works, hosts, or creates from it** —
not because they hold it. You keep the land economy, the reason to buy, the
scarcity, the burn-and-buyback dynamics. The only thing that changes is that
the return comes from work performed, and you are on solid ground.

If you want passive platform revenue share anyway: stop and talk to a
securities lawyer first. That is the honest answer, not a refusal.

---

## Subscriptions

| Tier | Price | What you get |
|---|---|---|
| Free | $0 | Simple Mode, a few grounded brain queries a day |
| **Pro** | **$30/mo** | Pro Signals terminal, ZEROX sentiment, the RAG brain |
| Max | *TBD* | Brain lessons, the full book library, priority routing, the bundled tools (video clipper, knowledge layer) |

A subscription is just a recurring Spark grant plus feature flags. It is not a
second currency. Do not invent one.

---

## 🚧 The founders programme — NEEDS YOUR NUMBERS

You have described a founders structure as **"first 25, then the next 25, then
the last 50."** That reads as three tiers of 100 founding members total, priced
or rewarded differently by how early someone joins.

**This section is deliberately blank, because inventing payment terms would be
worse than leaving it empty.** To finish it, decide:

1. What does a founder **pay**, in each of the three brackets?
2. What do they **get** — lifetime access? A Spark grant? A plot? Priority?
   A cosmetic that cannot be minted again?
3. Is any part of it a **share of revenue**? (If yes, re-read "the one line you
   must not cross" above — this is exactly where that applies.)
4. Is the 100 cap **real and permanent**? Scarcity you later break is the
   fastest way to lose the people who trusted it first.
5. What happens if someone **refunds**?

**The version that is safe and still compelling:** founders buy *access and
standing* — lifetime Pro, a founder cosmetic that is never minted again, first
claim on plots, a permanent name on the wall. All utility, no yield. Early
supporters get something real and scarce; you take on no securities exposure.

---

## Where this is actually built today

Be careful reading older docs — several are out of date. As of 2026-08-28:

- **Sparks ledger** — live (`stripe-webhook.js`, `work-sessions.js`,
  `reward-engine.js`)
- **Stripe → Sparks** — live
- **x402 micropayments** — mounted
- **Paybox** — *not* a checkout processor. It is a non-custodial **agent
  wallet**. Round-up belongs on the Stripe rail. `paybox-guard.js` models it
  wrongly and is disabled.
- **Plots** — **do not exist yet.** Net new.
- **NFT surfaces** — pages exist; the economics do not.

Full brief for the economy build: `docs/MASTER-PROMPT-ECONOMY.md`.

---

## The one-sentence test

If you cannot explain to a stranger **who earns, for what work, and where the
money came from** — the design is not finished yet.
