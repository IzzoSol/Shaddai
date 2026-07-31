# SHADDAI — Landing Funnel, Playbooks Tab & Dashboard Walkthrough

**Date:** 2026-07-30
**Owner-approved scope:** tight, ship-this-week
**Author:** Claude (brainstorming session with owner)
**Status:** Draft — awaiting user approval

---

## 1. Problem

The owner has four loose asks bundled into one message:

1. Add a **"Pick your business / Free Playbook"** surface as a tab on the landing page
2. **Consolidate the landing tabs** (the corner-link cluster is hanging off the side)
3. Adjust the **funnel CTA copy** so it reads "free" first, then "$10"
4. **Make the dashboard "fully complete and finished"** — "all tools work perfectly"

These four have been scoped down with the owner through clarifying questions so that each has a tight, shippable surface area. The design below treats them as one project because they share the same landing page and the same funnel intent: **get users onto free, then paid, fast.**

---

## 2. Locked decisions (from brainstorming Q&A)

| Question | Decision |
|---|---|
| New $10 subscription tier? | **No.** Use existing $10 one-time credit top-up already wired in `stripe-routes.js` + `stripe-webhook.js`. |
| Add to landing AND dashboard? | **Landing only** for now. Free, on-site, no auth, no email capture. |
| How heavy should Playbooks be? | Static long-form HTML pages. Owner priority: "get it done, provide value, share to brands, get users." |
| How are the playbooks written? | Claude writes 6 drafts offline now. RAG-runtime authoring deferred. |
| Dashboard scope | Owner walks through dashboard; Claude captures broken items into a punch-list; owner decides which to fix. |
| Play + Create tab merged? | Yes — one card on home.html. |
| Free button placement | Above the centered top nav, with SHADDAI wordmark above the "Start free" main CTA. |
| Enter Dashboard placement | Secondary button under the main "Start free" CTA. |

---

## 3. Architecture overview

```
public/
  home.html                ← header restructured (wordmark + Start free + Enter Dashboard + 4-tab centered nav)
  pricing.html             ← copy changes only; "Start free" CTA gets above the fold
  docs.html                ← NEW — Playbooks index (6 cards, one per business type)
  docs-agency.html         ← NEW — agency playbook
  docs-ecommerce.html      ← NEW — e-commerce playbook
  docs-creator.html        ← NEW — creator/coach playbook
  docs-local.html          ← NEW — local services playbook
  docs-saas.html           ← NEW — SaaS/app playbook
  docs-freelancer.html     ← NEW — freelancer/consultant playbook
  partials/                ← NEW (optional) — shared header/footer partials if templates emerge
backend/                   ← no changes required for this spec
docs/superpowers/specs/    ← this file
docs/superpowers/plans/    ← implementation plan (writing-plans skill output)
```

No backend code changes. The $10 credit pack already exists in `stripe-routes.js:37` (`credits_10`). All work is in `public/`.

---

## 4. Detailed changes

### 4.1 Funnel copy & CTA restructure (home.html header)

**Current state** (home.html:777-780): four corner-corner links float off the side as floating buttons:
- `Docs` → `/codex.html`
- `▶ Watch it work` → `/prove.html`
- `Join · $30/mo` → `/pricing.html` (gold pill)
- `Enter Dashboard` → `/dashboard` (deck style)

**Target state:** the SHADDAI wordmark sits at top-center. Under it, **"Start free"** as the primary CTA (no card required). Under that, **"Enter Dashboard"** as a secondary button (for users who already have an account). Below the buttons, the **centered top nav** with 4 tabs: `Home · Pricing · Docs · More` (the "More" dropdown holds the remaining surfaces: Council, Signals, AURA, Shop, Codex, Play, Create). The floating corner-corner link cluster is **removed.**

The "▶ Watch it work" link is **not lost** — it stays as a sub-link inside the Docs tab and as a button on the post-signup confirmation screen.

**Files:** `public/home.html` (header restructure), `public/pricing.html` (CTA copy on the $29 hero card), any other landing pages that link to `/codex.html` from a corner-corner nav (search/replace audit before commit).

### 4.2 Pricing.html — copy changes only

The pricing page already shows Free / $30 Pro / $99 Elite plus the four $10/$25/$50/$100 credit packs. Changes:

- Line 259 `Start Pro — $30/mo →` → `Upgrade to Pro →`
- Line 290 `Start free →` (Free card) stays, but moves to be the **first** CTA a visitor sees (above the $30 hero) if the visitor is logged-out
- Line 305 `Claim your Founder spot` stays
- Line 337 `$10 Starter top-up` stays — already wired, just needs Stripe env keys + products in the Stripe dashboard for live checkout
- Add a 1-line note above the credit packs: *"Already a member? Top up your credits without re-subscribing."*

No `TIER_CONFIG` or `billing-service.js` changes.

### 4.3 Docs tab + 6 Playbooks

**New file:** `public/docs.html` — landing page for the Docs tab.

Layout (matching SHADDAI theme):
- Hero: "Pick your business. Get a tailored playbook — built on the frameworks that actually scale companies. Free."
- 6 cards (2-column grid, mobile-stacked):
  - 🎯 Agency / Service
  - 🛒 E-commerce / DTC
  - 🎬 Creator / Coach
  - 📍 Local Service
  - ⚙ SaaS / App
  - ✍️ Freelancer / Consultant
- Footer note: *"More playbooks drop every week. Pro members get custom, on-demand books written for their exact business."*

**6 new playbook files.** Each ~3-5k words. Structure:
- `docs-agency.html`, `docs-ecommerce.html`, etc.
- Each is self-contained HTML using SHADDAI theme CSS variables (consistent with `pricing.html`)
- Sections per playbook: Positioning · Offer · Lead-gen · Pricing · Delivery · Hiring · KPIs · Week-1 Plan
- All include a final CTA: "Open the SHADDAI agent that does this work for you → /agents.html#<agent>"

**Generation method:** Claude writes all 6 drafts in this session (or as one batched task). No RAG-runtime authoring for v1. Owner can revise text later or trigger a v2 via RAG.

### 4.4 Landing tab consolidation

**home.html "gates" section (lines 968-983)** has 7 cards: Worlds / Council / Play / Signals / AURA / Shop / Codex.

**Change:**
- Merge **Play + Create** into one card titled "Play + Create" with two sub-links: `/arcade.html` (Play) and `/pixel-forge.html` (Create). Net change: 7 cards → 6 cards.
- All other cards stay.
- The new **Docs** card (8th) is **not** added to the gate grid — Docs is a top-nav tab, not a gate. Gates are for big things you do inside SHADDAI; Docs is a content surface.

### 4.5 Dashboard walkthrough — punch-list only

The owner will walk the dashboard manually and call out what's broken. Claude captures findings into a punch-list file and only fixes what the owner marks. No sweeping rewrite. The punch-list dir is `docs/superpowers/punchlists/` (created during implementation if missing); file name `2026-07-30-dashboard-walkthrough.md`.

**Order of operations:** this walkthrough happens **first**, before any of the static page work begins in the implementation plan. If the walkthrough reveals a backend regression (e.g., a tool 500s), it is logged in the punch-list and may be promoted to its own fix task before any new pages are written.

**Punch-list categories:**
- Auth: sign-in / sign-up / forgot-password flows
- Tabs: every nav tab opens without console errors
- Tools: every tool button on main dashboard surfaces hits backend and returns real output
- External links: nothing 404s
- Visual: nothing visibly broken (overlapping text, dead images)

---

## 5. Out of scope (deferred)

- Adding a real $10 monthly subscription tier (use existing $10 credit top-up)
- Email capture / lead list / SendGrid / Resend integration
- Runtime RAG-generated playbook refresh
- Dashboard rewrite beyond fixing what owner marks broken
- Auth wall on Playbooks (free, on-site only)
- Internationalization
- Mobile app

---

## 6. Acceptance criteria

- [ ] home.html header shows: SHADDAI wordmark → "Start free" primary → "Enter Dashboard" secondary → centered top nav (Home / Pricing / Docs / More dropdown)
- [ ] home.html has no floating corner-corner link cluster
- [ ] pricing.html Pro button reads `Upgrade to Pro →` (not `Start Pro — $30/mo`)
- [ ] pricing.html has a 1-line "Already a member? Top up…" note above the credit packs
- [ ] home.html gate grid has 6 cards (Play + Create merged into 1)
- [ ] `public/docs.html` exists with hero + 6 cards
- [ ] All 6 `public/docs-*.html` playbook pages exist, render, each ~3-5k words
- [ ] Docs tab in top nav links to `/docs.html`
- [ ] Dashboard walkthrough completed; punch-list file created; owner-approved fixes shipped
- [ ] No console errors on landing or pricing pages after changes

---

## 7. Open questions deferred to writing-plans phase

- Whether to make docs.html auth-gated in v2
- Whether to add a "Refresh this chapter" button calling `/api/rag/query`
- Whether the punch-list reveals a need for backend changes (e.g., a tool that 500s)