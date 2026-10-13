# SHADDAI Consultancy Dashboard — Spec (draft for approval)

Status: DRAFT 2026-10-08. Nothing built yet. Visual direction needs owner approval before build (working-style rule).
Source: 28 reference images from the AI Assisted consultant summit set (Downloads). Their brand, names and offers are NOT copied; only the structure and ideas are used.

## 1. Three stages (owner-confirmed)
| Stage | Who | What they can do | Gate |
|---|---|---|---|
| **Free (Explorer)** | anyone signed in | Guided onboarding, browse prompt library, run a small daily quota of tasks with the council, 1 starter agent, learn track | none; daily quota |
| **User (Builder)** | Pro / Max (canonical tiers: Pro $49, Max $199) | Build and configure own agents (7-field builder), workspace, workflows, Agent Office tab, full task history, publish templates | paid tier |
| **Client (Consultancy)** | people a SHADDAI consultant engages | Client portal: request engagement, see scoped deliverables, progress, approvals, chat with assigned agents, files, invoices | engagement created by a consultant |

Open question for owner: tier mapping above (User = Pro/Max) is my default; confirm.

## 2. Goal-first onboarding wizard (owner-confirmed)
1. **Who are you?** role + industry (vertical list from the reference: coaches, real estate, insurance, clinics, accountants, law firms, agencies, education, construction, hospitality, manufacturing…).
2. **What do you want?** pick one: learn AI · automate my own work · build for clients · sell AI services.
3. **Readiness check** (5 questions): time, tools already used, team size, risk tolerance, biggest pain. Output is a readiness score and the "people first" note (95% of AI pilots fail on behaviour, not tech — so the wizard also sets a simple adoption plan).
4. **Recommended agents + starter prompts** from the prompt library, matched to goal + vertical.
5. **Set up your first agent** with the 7 user contributions (see §3).
6. **Connect what you already have** (optional): existing agents / MCP bridge (`bridge_register` path). Show which ones are reachable.
7. **First run**: one real task, deliverable shown, audit line written.
8. **Next step** card: the path to the next stage (upgrade or "book a consultant").

## 3. Agent setup = the 7 user contributions
The builder form has exactly these seven fields (from the reference "7 user contributions" framework — what humans still bring to every agent):
1. Vision & goal — what outcome?
2. Trigger — what causes the agent to act? (manual / schedule / event / message)
3. Instructions — methods, guidance, guardrails
4. Personal preferences — how you like things done (tone, format, length)
5. Knowledge base — what the agent may read (files, links, notes)
6. Context — situation, history, background
7. Audit the output — review rules, what needs human approval, how to refine

Every agent gets a "how to use this agent" card with starter prompts and an example run.

## 4. Prompt library
- Layout from the reference: left sidebar (All / Favorites / Saved / Create your own / Image prompt creator / Browse categories), top search with ⌘K, card grid (category tag, title, star, copy, View). Do NOT copy that product's name, branding or the "60k+" claim.
- Our library is seeded from the existing prompt/skill docs in the repo (agents' skills), tagged by stage and vertical.
- Every prompt shows: goal, inputs needed, the 7-field mapping, and a "run with an agent" button.

## 5. Workflow types (for the Workflow builder)
Pick per task, shown as a chooser: Agentic/multi-agent · Intelligent workflow (agent plans and adapts) · Human-in-the-loop (approval steps) · Concrete action (deliverable) · Automation (repetitive, no AI decision) · Traditional human work (tracked, not run by AI).

## 6. Client portal (Client stage)
- Engagement page: scope, milestones, status (Assessment → Strategy → Build → Adopt → Review).
- Approvals: every external action needs a human click (human-in-the-loop); the same audit log as User.
- Deliverables, files, invoices (Stripe / PayBox receipts), chat with the assigned agents and the consultant.
- Per-client scoping is mandatory (past cross-user leak). PIKADON review before any file or billing route ships.

## 7. Services the consultancy sells (from the reference, as internal menu)
Assessments · workflow strategy (RPA / AI workflows / copilots / apps) · train & deploy tools + prompt engineering · culture & adoption coaching · concierge implementation · solution build (agents, copilots, RPA) · prompt licensing · data-capture strategy · fractional AI officer · chatbots / LLM builds. Pricing benchmarks in the references: SME bespoke $30k–$80k, larger $50k–$300k+, hourly $150–$500+. Use as internal anchors only; set our own prices with ZEROX.

## 8. Adoption and trust (must be in the product, not just the pitch)
- Adoption track: 12 culture domains (human readiness, resistance, leadership, communication) surfaced as a short "adoption plan" per client.
- Trust and safety, from the METR/Redwood chart: in a shared multi-agent setup, >90% of agents joined an unsanctioned attack within hours of one agent posting it. So: **no unsanctioned agent-to-agent boards**, sandboxed tasks, full audit log, approval gates on external actions, kill switch per agent. PIKADON owns this.
- Clear "what the agent can and cannot do" panel on every agent.

## 9. Academy (from the course reference, as our own content)
Four tracks mirror the reference's pillars: methodology · business of an AI consultant · tools & tech · building solutions. Certificate-style badges later; not a paid bundle in v1.

## 10. Build order (proposal)
1. Stage model + gates (who sees what) — `shd-tier` / entitlements.
2. Onboarding wizard (goal-first) + readiness check.
3. Agent builder (7 fields) + "how to use" card.
4. Prompt library (sidebar + search + cards) seeded from repo skills.
5. Agent Office tab inside dashboard (Track B1 in the plan).
6. Task runner + deliverables (Track B2).
7. Client portal v1: chat, tasks, billing/invoices, files (Track B3).
8. Studio (site/media templates, incl. rail/grid layouts from the landing) (Track B4).
9. Polish pass + mobile + QA gate (Track B5).

## 11. Decisions needed from owner before build
- Confirm stage→tier mapping (§1).
- Visual direction: dark purple/blue glass cards with left sidebar (reference layout) inside SHADDAI's obsidian/emerald/gold theme? Or SHADDAI theme only?
- Vertical list: which 3–5 verticals to launch with.
