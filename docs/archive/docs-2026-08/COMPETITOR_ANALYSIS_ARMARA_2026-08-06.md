# SHADDAI vs Armara — Competitive Kill List (2026-08-06)

> **Purpose:** Internal war-room doc. Feed to RAG brain. Point any terminal here.  
> **Goal:** Ship every gap below. Lean into SHADDAI's unfair advantages where Armara can't follow.  
> **Competitor:** armaraos.com — AI agent platform + $ARMARA token + local CLI runtime.

---

## 1. What Armara Has (feature inventory)

### Pricing tiers
| Tier | Price | Msgs/day | Premium inferences | Web searches | Images/mo |
|------|-------|----------|--------------------|--------------|-----------|
| Free | $0 | 20 | 3 | 5 | 3 (Flux 1.1 Pro) |
| Starter | $9 | 500 | 10 | 15 | 20 |
| Pro | $18 | 1,000 | 20 | 50 | 30 |
| Pro Plus | $49 ($33 w/ token) | 2,500 | 75 | 120 | 75 |
| Elite | $149 ($100 w/ token) | 5,000 | 150 | 300 | 75 (Flux.2 Max) |

- Token loyalty: 33% off Pro Plus / Elite for holding 1M $ARMARA credits
- BYOK (bring your own API key): free forever, uses `ix_*` OpenAI-compatible key format
- Annual plans: 20% discount

### Agent marketplace (28 agents, 7 categories, 11 premium)
- **Research:** Web Browsing, Deep Research, Daily Briefing, Competitive Intel (premium), Document Analyst
- **Dev:** Code Assistant, Code Reviewer, DevOps Monitor (premium), Test Automation
- **Content:** Content Writer (premium), Video Clipping (premium), Social Media (premium), Voice Cloning (premium)
- **Business:** Lead Generation (premium), Email Triage, Customer Support, CRM Assistant
- **Finance:** Market Predictions (premium), Portfolio Monitor (premium), Autonomous Trading (premium), Expense Tracker
- **Operations:** Workflow Automator, URL Monitor, Scheduled Reports, File Processor
- **Coordination:** Multi-Agent Swarms (premium), Mission Orchestrator, Security Auditor (premium)

### Platform infrastructure
- **Local CLI runtime** — `armaraos-cli install` → daemon runs agents 24/7 on user's machine
- **Durable missions** — goals that survive sessions; checkpoints + handoffs + recap exports
- **Affiliate 3-tier:** 20% (direct) / 8% (L2) / 4% (L3) — free + starter count, earn when they upgrade
- **Memory tiers:** Lite notes (free) → Notes + graph → Project workspace → Agents + workflows → Structured + auto
- **Per-chat custom instructions**
- **Markdown export + branching**
- **Share links** (1 free, unlimited paid)
- **Web search** with configurable source count (1–8 per query)
- **Image gen** quota built into every tier

---

## 2. SHADDAI's Unfair Advantages (Armara CANNOT replicate these)

These are moats. Build on them. Armara is a chat interface with a token. SHADDAI is a world.

| Advantage | Why Armara Can't Match |
|-----------|------------------------|
| **2D Pixel world** — real regions, gather/craft/trade economy | No game. No world. No fun. |
| **3D agent bodies** — agents you can walk into | Agents are just chat threads |
| **Siege economy** — 28-day countdown, PvP, prize pools | No competition mechanics |
| **Land / plot system** — own a piece of SHADDAI City | No real estate, no scarcity |
| **On-chain deeds** (Metaplex Core) | No real NFT or deed system |
| **Craft pipeline** — gather → refine → sell at regional markets | No economy depth |
| **Referral flywheel** — Sparks + Reputation + Revenue settlement | Their affiliate is just links |
| **7 named agent council** — NEXUS, TURTLE, ORACLE, etc. with personalities | Generic agent catalog |
| **Multiplayer pixel city** — see other players live | No social/MMO layer |

---

## 3. Feature Gap Analysis — What to Build

Priority: **P0 = ship this week**, **P1 = next sprint**, **P2 = later**

### P0 — Revenue & Conversion
- [ ] **Pricing page revamp** — match Armara tier table but beat it: add game world perks (plot access, siege tickets, sparks bonus) at each tier. Make Free look exciting, not limited.
- [ ] **BYOK onboarding** — wire the `ix_*` key format (or use our own prefix). Users who bring own key use SHADDAI free. Gate game perks behind plans.
- [ ] **Affiliate page** — build `affiliate.html`. Show 3-tier upline (20%/8%/4% or better). Show referral link + live earnings. SHADDAI already has the backend (referral-service.js).

### P0 — Agent Showcase
- [ ] **Agent marketplace page** — `agents.html` or `/agents` tab in dashboard. Each of 7 agents shown as cards with: role, skills list, current status, "Enter room" button. Add "forged agent" slots showing user-created agents.
- [ ] **Agent skill catalog visible** — `/api/skills/catalog` already exists. Surface it per-agent in the UI.
- [ ] **Premium agent badges** — mark which agents require Pro+ (PIKADON full audit, ORACLE deep research, ZEROX autonomous trading).

### P1 — Platform Features
- [ ] **Web search in agent chat** — wire Brave/Serper API to agent calls. Show sources count in response. This is a tier gate (5/15/50/120/300 per day like Armara).
- [ ] **Image gen quota** — track FLUX calls per user per month. Show usage in dashboard. Gate Flux.2 Max to Elite.
- [ ] **Memory tiers** — Free = lite (current localStorage); Pro = cloud-synced memory per agent; Elite = auto-structured workflow memory.
- [ ] **Mission Orchestrator** — durable goals that persist across sessions. User sets a mission, agents work toward it in the background. (Backend: chain task receipts to a mission ID.)
- [ ] **Markdown export** — add export button to any agent conversation.
- [ ] **Per-chat custom instructions** — "system note" field per chat that prepends to all messages.

### P1 — Game World (SHADDAI-unique, Armara has zero answer)
- [ ] **Plot deed UI** — show user's owned plots on the city map. Deed = NFT on Metaplex.
- [ ] **Siege Sunday countdown** — visible on dashboard landing. "Next siege in X days."
- [ ] **Sparks reward display** — show Sparks balance prominently. Explain how they earn (jobs, bounties, siege).
- [ ] **Craft-to-sell proof surface** — show recent market sales publicly. "Mira sold 3 ingots for 48💵 in Emberfields." Social proof loop.

### P2 — CLI / Desktop
- [ ] **SHADDAI desktop app** — Electron or Tauri wrapper so agents run locally 24/7. This beats Armara's CLI.
- [ ] **Scheduled agent tasks** — cron-style "run ORACLE research at 8am daily." Already partially in TG signals.

---

## 4. Pricing Page Redesign Target

Beat Armara by including SHADDAI-specific value at each tier:

| Tier | Price | SHADDAI Extras vs Armara |
|------|-------|--------------------------|
| Free | $0 | 2D world access, 20 Sparks/day, 1 forged agent |
| Builder | $19 | 3D world access, 100 Sparks/day, 3 forged agents, plot-eligible |
| Pro | $30 | Siege Sunday access, 500 Sparks/day, unlimited forge, 1 deed NFT/mo |
| Alpha | $199 | Founding seat, 10 deed NFTs, siege VIP, revenue share |

---

## 5. Affiliate Program Spec (build against referral-service.js)

Armara: 20% / 8% / 4% three tiers.  
SHADDAI target: **25% / 10% / 5%** — beat them on every level.

- Referral link: `shaddai.app/r/{slug}` (or current domain)
- Payout: Sparks (immediate) + USDC/Stripe settlement (monthly threshold $50+)
- Forged agent bonus: referree's first forged agent earns referrer 50 bonus Sparks
- Dashboard widget: shows L1/L2/L3 counts + pending earnings + claim button

---

## 6. Armara Weaknesses to Exploit in SHADDAI Marketing

- **No game world.** Armara is a chat wrapper. SHADDAI is a living world with stakes.
- **No real economy.** Armara's $ARMARA is a discount coupon. SHADDAI Sparks are earned through work.
- **No social layer.** Armara agents work in isolation. SHADDAI agents live in a multiplayer city.
- **No land/property.** Armara has nothing for users to own. SHADDAI has plots, deeds, offices.
- **CLI-only for background agents.** Armara needs you to install a local daemon. SHADDAI runs on Render.
- **Generic catalog.** Armara's 28 agents are templates. SHADDAI's 7 council members have identities, stories, chakras.

---

## 7. Files to Touch (implementation map)

| Feature | File(s) |
|---------|---------|
| Pricing page | `public/pricing.html` |
| Agent marketplace | `public/agents.html` or dashboard tab |
| Affiliate page | `public/affiliate.html` |
| BYOK onboarding | `backend/services/byok-service.js` (exists), `public/index.html` settings |
| Web search gate | `backend/server-production.js` `/api/search` route + daily counter |
| Image quota tracking | `backend/services/image-quota-service.js` (new) |
| Mission orchestrator | `backend/services/mission-service.js` (new) |
| Referral UI | `public/affiliate.html` + `backend/referral-routes.js` (exists) |
| Siege countdown widget | `public/index.html` dashboard |
| Sparks display | `public/index.html` header/status bar |

---

## 8. RAG Brain Injection Notes

Tag these chunks in `shaddai_brain_videos.json`:
- `system=competitor_armara` — this whole doc
- `system=pricing_strategy` — Section 4
- `system=affiliate_spec` — Section 5
- `system=feature_gaps` — Section 3

Query patterns this doc should answer:
- "What does Armara have that we don't?"
- "What's our pricing strategy vs competitors?"
- "What's the SHADDAI affiliate structure?"
- "What should we build next for revenue?"
