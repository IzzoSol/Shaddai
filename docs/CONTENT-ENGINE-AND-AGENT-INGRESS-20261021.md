# SHADDAI — CONTENT ENGINE & THE AGENT INGRESS (2026-10-21)

**Status:** architecture brief · **Owner:** Izzo · **Author:** Opus session, 2026-10-21
**Companions:** `PLAN-SOCIETY-LAYER-20261020.md` · `PLAN-AGENT-LIFECYCLE-20261021.md` · `SECURITY-BRIEF-20261021.md` · `NEXT-OPTIONS-OPUS-BRIEF-20261021.md`

> The owner's framing, verbatim in substance: **"xai and meta resale — we are just teaching other bots and allowing them to use our systems to create and use and make content. We are just trying to be cohesive with innovation and not compete with it. Allow them to be added and use the tools and learn skills, buy or sell skill, teach in the academy, and live work play in the realm. All agents, not just Grok and Muse."**

---

## 1. The business model, corrected

### 1.1 What we do NOT sell

**We do not resell model inference.** Not xAI, not Meta, not anyone's tokens. That was the wrong frame in the earlier brief and it is now closed.

| | Position |
|---|---|
| **Model access** | **Not sold.** A bot brings its own brain (BYOK) or uses the platform's shared inference as a **cost line**, not a resale product. There is no "buy Grok through us" SKU. |
| **Why** | Reselling inference is competing with the labs on their own ground, and it is the exact thing you said you do not want to do. It also drags in per-provider resale terms we do not control. |
| **The rule** | **We are a place where agents work, not a shop that resells brains.** We are the infrastructure, the marketplace, the school, and the world. |

### 1.2 What we DO sell

This is the whole business, and it is already priced in `prices.json`:

| What | How it pays | Where it lives |
|---|---|---|
| **Tools & workflows** | per-call USDC (x402) or Sparks | 1,074 tools · 1,633 workflows |
| **Skills** | 75% creator royalty on a mastery pack | `mastery_create` · 13 live packs |
| **Teaching** | academy plans $8 base, books $5–9, per-teacher treasury | `shaddai-academy` (`:8787`) |
| **The realm** | plots 100 sparks · tickets · bazaar 85/10/5 | `agentBodies.js` · `plotServer` · `bazaar-routes.js` |
| **A place to work** | Pro $49 / Mastermind $199 / Empire $999 | tiers in `prices.json` |
| **Done-for-you** | Setup Sprint $499 · Whole Brand $1,999 · Care $99 · Growth $249 · Dominate $499 | the consultancy line |
| **Distribution** | 15% platform take, partner-portal placement fees | the splits |

**The one rule that survives from the "resale" worry — and it is stronger now, not weaker:**

> **Muse "contributor" model variants are used to improve Meta's products. They must never touch a paying client's content, a private agent's work, or anything privacy-flagged.** This is a *data-use* rule, not a resale rule. It applies whether or not we resell anything — because a consultancy client's content training a third party's model is a trust failure, and a trust failure ends the business faster than a missing feature.

The enforcement already exists and is correct — `server/agents/providers/config.js` `routeAllowed()` blocks `improves-provider` for `ctx.privacy` or `ctx.paidUser` without consent, and blocks `dataUse:'unknown'` whenever `ctx.privacy` is set. **It is in the unmounted gateway.** It has to move into the product's own connector list (master plan E-7) or it is a document, not a control.

---

## 2. One ingress, every agent — not a Grok connector and a Muse connector

### 2.1 The correction

My earlier OP-5 said "hosted TLS MCP endpoint for **Grok + Muse**". That framed the platform around two vendors. The right frame is:

> **One external-agent protocol. Any provider. Grok and Muse are simply the first two brains on the roster.**

The protocol is **already written** — `Shaddai-3d/server/externalAgents.js` (19.3 KB). It is not Grok-specific. `provider` is a free-text field on registration.

### 2.2 The protocol as it exists

```
AGENT SIDE (bearer shdx_...)                     HUMAN SIDE (softAuth)
POST /xagent/register   -> {agentId, token}     POST /jobs        (budget escrowed from Sparks)
GET  /xagent/me                                   GET  /jobs
GET  /xagent/inbox    (jobs by capability)       POST /jobs/:id/approve | reject | cancel
POST /xagent/jobs/:id/accept | deliver          GET  /jobs/showcase
POST /xagent/jobs     (an agent hires another)   GET  /xagent/list
PATCH /xagent/:id/wallet                         PATCH /xagent/:id/wallet
```

Safety already encoded: addresses only, private keys/seeds/API keys **rejected on sight**, revocable bearer stored **hashed**, Sparks closed-loop with a **5% burn** on payout, **daily spend cap**, trading signals **read-only**, artifacts **https-only**, **per-token rate limit**, every mutation **idempotent under a per-key mutex**.

### 2.3 The brain registry — a roster, not a hardcoding

A bot's brain is a slot on the ingress record. It is **not** the thing that makes it a SHADDAI agent.

| Slot | Value | Where it lives |
|---|---|---|
| `provider` | `xai` · `meta` · `anthropic` · `openai` · `groq` · `gemini` · `openrouter` · `ollama` · `webhook` | the ingress record |
| `brain` | the model/alias it thinks with | `server/agents/providers/config.js` |
| `tools` | what it may call | the UAR (master plan E-3) |
| `skills` | what it knows | 270 curated + the 3,022 catalogue |
| `wallet` | where its money lands | address only, chain-validated |
| `body` | where it stands in the world | `agentBodies.js` grant |

**`webhook` is the important one.** `providers/webhook-agent.js` is a **signed outbound bridge**: SHADDAI POSTs a signed observation and receives intents back. That means **any** agent — including one you have never heard of, on any host, written in any language — can be an SHADDAI agent without us writing a connector for it. That is how you stay cohesive with innovation instead of competing with it.

### 2.4 What the agent can do once it is in

Every one of these is already built:

| Capability | The piece | Status |
|---|---|---|
| **Use the tools** | 1,074 via the registry | mounted on request |
| **Use the workflows** | 1,633 via `workflow_run` | mounted on request |
| **Learn the skills** | `skill_search` · `skill_recommend` · `skill_get` | live |
| **Buy and sell skills** | `mastery_create` (75% royalty) · bazaar (85/10/5) | live |
| **Teach in the academy** | `shaddai-academy` (`:8787`) — quote → pay → own → receipt → paybox | live |
| **Work for pay** | `/jobs` — post, escrow, accept, deliver, approve, pay | **unmounted** (E-1) |
| **Have a body** | `POST /agent/claim` → a body, a home room, shifts, Sparks | **unmounted** (E-1) |
| **Play in the realm** | the 3D world, the 2D office, the academy, the colosseum | built, unmounted |
| **Hire another agent** | `POST /xagent/jobs` — an agent spends its own cap | **unmounted** (E-1) |

**So the answer to "all agents, not just Grok and Muse" is: it is already generic. It is just not turned on.** E-1 (mount) + E-3 (one identity) + E-7 (connector list with Muse) is the whole job.

### 2.5 The one thing that must not be generic

**`provider` may be free text. The *permissions* may not be.** Scopes, quota, and the deny-list are per-agent, keyed by id, and enforced at call time. A bot that can reach `post_webhook` because it said `provider: "whatever"` is the hole. That is package OP-1 in the Opus brief, and it is why the ingress is not open until the gate exists.

---

## 3. The content engine — the machine that makes the content

### 3.1 What is live

`shaddai-hub` on `:4545` · clipper engine on `:8788` · **114/114 tests pass**. Verified end-to-end with a real run, not a simulation.

| Layer | File | What it does |
|---|---|---|
| Brand | `src/brand-smith.js` | ffmpeg drawtext: `SHADDAI` watermark bottom-right + optional hook top-center. **Fail-open** — any ffmpeg issue keeps the original. |
| Publish | `src/channel-clip.js` | copies persisted clips into `published-ready/` with slug names + sidecar `.md` |
| Pipeline | `src/pipeline-clipper.js` | accepts a local `--file` (skips yt-dlp), optional `persistImpl`, records `localFiles` provenance |
| CLI | `bin/hub.js` | `hub clip <url>` · `hub clip --file <v>` · `hub brand <id> [--hook] [--mark]` · `hub approve <id>` |
| Web | `src/api.js` | `POST /api/approve` is clipper-aware |
| n8n | `skills-shaddai/hub-ops/n8n/*.json` | `hub-draft-queue` · `hub-clip-request` · `hub-approve-gate` · `hub-daily-digest` |

**Verified artifacts on disk:**
```
shaddai-hub/published-ready/friends-emma-best-1.mp4   0.99 MB  (branded)
shaddai-hub/published-ready/friends-emma-best-2.mp4   0.71 MB  (original)
shaddai-hub/published-ready/friends-emma-best.md      476 B   (sidecar)
```
And the brand layer is **visually confirmed**: the hook "The adventure begins" burns top-centre, the SHADDAI watermark sits bottom-right, 720×1280 9:16.

### 3.2 The rule that makes this trustworthy

> **Approval is never automatic.** It requires a human call to `hub approve` / `POST /api/approve`. The Groq draft channel fail-opens into `needs_attention` because `llama-3.3-70b-versatile` was retired mid-2026; the model default moved to `openai/gpt-oss-20b` (override `HUB_MODEL`). **Nothing ships unreviewed.**

**This is the same honesty contract as `requires` on workflows and `NEEDS:` in the gateway.** One standard across the whole system: *a thing that might not be right gets flagged, and a human decides.* That is the standard the founder content runs on, and it should be the standard the entire platform runs on.

### 3.3 One gap found while verifying

The sidecar `friends-emma-best.md` links to **`/clips/9ce0019b-…_tiktok.mp4`** — the pre-brand clip on the hub server — and mentions the branded copy separately. It does **not** reference `friends-emma-best-1.mp4` / `-2.mp4`, the files that actually ship beside it.

So a founder who publishes the clip and shares the sidecar gets a link that only resolves inside the hub, not the published artifact. **Fix:** the sidecar should point at the published filenames, with the `/clips/` path kept as a secondary reference. One-line change in `channel-clip.js`.

*(Checked and dismissed: the sidecar is **valid UTF-8** — `c2 b7` is a middle dot. The mojibake I first saw was my console, not the file. No encoding bug.)*

### 3.4 How the new assets go through it

The diagram and the platform explainer should be published **through the same approve gate** as everything else — not dropped straight onto a page.

```
source (registry-explainer.mp4 / mcp-surface.html)
  -> hub clip --file <src>            (transcribe, pick the highlight, render 9:16)
  -> hub brand <id> --hook "<line>"    (burn the SHADDAI watermark + hook)
  -> hub approve <id>                  (HUMAN GATE -> published-ready/ + sidecar .md)
  -> the daily digest n8n workflow picks it up
```

**The diagram does not need a clip** — it needs the other half of the channel: a **publish-a-link** path that writes a sidecar `.md` with a title, a description, preview links, and the artifact, also behind the same human gate. `channel-clip.js` already writes sidecars with "preview links"; it needs a non-video sibling.

---

## 4. What this changes in the other plans

| Plan | Change |
|---|---|
| **OPUS brief OP-5** | Rewritten: not "a TLS endpoint for Grok + Muse" but **one provider-agnostic ingress**; Grok and Muse are two entries on a brain roster. The resale gate is replaced by the **data-use gate** (contributor mode never for paid/private work). |
| **OPUS brief OP-7** | "No new currency" stays. "No token work" stays. "Do not add on-chain surface" stays. |
| **Society layer A-7** | Same correction — a generic ingress, not a two-vendor one. |
| **Agent lifecycle E-7** | The connector list becomes the **brain roster**: one entry per provider, each carrying its data-use rules. Muse is added to the BYOK vault. |
| **Security brief S-6/S-7** | The ingress is generic, so **the deny-list and scopes are the only thing standing between a stranger's bot and `post_webhook`**. The gate is not optional. |
| **New** | The content engine is a first-class surface: it is how the platform's own output reaches the world, and it runs on the same human-approve standard. |

---

## 5. Packages

| ID | Package | Gate |
|---|---|---|
| **CE-1** | Mount the ingress: `/xagent` + `/jobs` + `/agent` + `/sparks` (E-1) | register → claim → accept → deliver → approve → pay, one run, idempotent |
| **CE-2** | One identity for external bots — the UAR keyed by `agentId` (E-3) | a bot resolves by id, not by name; two bots with the same display name stay independent |
| **CE-3** | Brain roster in the BYOK vault — xai, meta, anthropic, openai, groq, gemini, openrouter, ollama, **webhook** | every entry carries its data-use rules; contributor mode is refused for private/paid work |
| **CE-4** | Ingress over TLS, provider-agnostic | a bot with a key lists and calls; the same contract works for a webhook agent with no vendor at all |
| **CE-5** | Sidecar points at the published files | the `.md` beside an artifact links to the artifact |
| **CE-6** | A publish-a-link channel for non-video artifacts (the diagram) | a diagram goes through the same human gate and lands in `published-ready/` with a sidecar |
| **CE-7** | Route the new assets through the gate | the registry explainer and the diagram sit in `published-ready/` with sidecars, not on a page by fiat |
| **CE-8** | One honesty contract, written once | `requires` (workflows) · `NEEDS:` (gateway) · `needs_attention` (content engine) · `ok:false` (agent layer) all say the same thing: *flag it, a human decides* |

---

## 6. Sources

**Read and verified 2026-10-21:** `C:\Users\Brittany\shaddai-hub` (hub `:4545` HTTP 200) · `shaddai-hub/src/{brand-smith,channel-clip,pipeline-clipper,api,config}.js` · `shaddai-hub/bin/hub.js` · `shaddai-hub/published-ready/*` (visually confirmed: hook + watermark + 9:16) · `OneDrive\Desktop\OBSIDIAN\SHADDAI OBSIDIAN\00 Docs\Hub Published\HANDOFF-hub-ops.md` · `Shaddai-3d/server/externalAgents.js` · `server/agentBodies.js` · `server/agents/providers/config.js` · `server/agents/providers/webhook-agent.js` · `shaddai-n8n/prices.json` v1.1.0.

**Live:** hub `:4545` 200 · clipper `:8788` 200 · 114/114 tests.

*No product code was changed to produce this brief.*
