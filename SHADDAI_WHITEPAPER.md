# SHADDAI — Product & Technical Whitepaper (v80)

> **Purpose of this document:** a complete, honest snapshot of what SHADDAI is, what's built, and what's mock/missing — written so an external reviewer (Grok, GitHub Copilot, etc.) can quickly tell us *what's missing and what to do next*. Sections marked **🟡 MOCK** or **🔴 GAP** are the ones we most want feedback on.

---

## 1. One-line summary

SHADDAI is an **AI-agent marketplace + automation dashboard**: a council of 7 specialized AI agents that users can hire to do real work (research, content, code, design, security review), with a marketplace, subscription/credits billing, on-chain (Solana) collectibles, and crypto/fiat payments. It ships as a single-page web app served by a Node backend, deployed on Render.

## 2. Vision & target user

- **Who:** solo builders, small teams, and "dreamers" who want passive income or leverage from AI agents without writing code.
- **Promise:** hire/compose AI agents to produce sellable work and automate workflows; trade agent output and collectibles; pay with card or crypto.
- **Business goal:** $1K+/month recurring via subscriptions + marketplace take-rate.

## 3. Architecture

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Single-page HTML/CSS/JS (`public/index.html`, ~2.75 MB, "FINAL-SHADDAI-V80") | No framework; vanilla. Same-origin with API. |
| Backend | Node + Express (`backend/server-production.js`) | Serves the static frontend **and** the API (no CORS needed). |
| Agent runtime | `agent-engine.js`, `multi-agent-server.js`, `shaddai-orchestrator.js` | Task queue + multi-iteration LLM loop + tool calls. |
| LLM | `llm-client.js` (+ `llm-tracer.js`) | Multi-provider fallback: **Groq** (primary, free), **OpenRouter** (fallback), Ollama (local). BYOK supported. |
| Skills | `skill-*.js` (executor, router, orchestrator, embeddings, learning-loop, optimizer, index, loader, bridge) | Self-improving skill system; thousands of skills indexed (Obsidian-sourced). |
| Auth | `auth-service-hardened.js`, `auth-routes.js`, JWT + bcrypt | Hardened variant exists. |
| Billing | `billing-routes.js`, `billing-service.js`, `pay-guard.js` | **🟡 MOCK** — see §6. |
| Data | `database-real.js` | |
| Security | `security-hardening.js`, `security-middleware.js`, `workflow-security.js`, `helmet` | |
| External | `external-apis.js`, `api-proxy-routes.js`, `mcp-client.js` | Price feeds, trends, web tools; MCP client. |
| Aura | `aura/` (Python) | Separate Python agent/LLM/router service (optional sidecar). |

**Deployment:** `render.yaml` defines one Render **web service** (`runtime: node`, `buildCommand: npm install`, `startCommand: npm start`, `healthCheckPath: /api/model/health`, free plan, Node 20). Secrets (`GROQ_API_KEY`, `OPENROUTER_API_KEY`) set in the Render dashboard. `@solana/pay` and `@solana/web3.js` are already dependencies.

## 4. The 7-Agent Council

| Agent | Role | Domain |
|---|---|---|
| **SHADDAI** | Supreme orchestrator | Strategy, final QA, prioritization |
| **NEXUS** | Technical architect | Backend, APIs, scalability |
| **ZEROX** | Wealth/revenue | Billing, pricing, unit economics |
| **ORACLE** | Research/intelligence | Market/competitive research, trends |
| **TURTLE** | UI/UX & creative | Frontend, design, media |
| **QUILL** | Writing/communication | Docs, copy, guides |
| **PIKADON** | Security/compliance | Audits, PII, secrets, approval gates |

Agents are invocable individually or as a council; a router dispatches tasks; the orchestrator coordinates multi-agent jobs and a task queue.

## 5. Feature inventory (by area)

> Counts in parentheses ≈ references in the V80 source, as a rough proxy for surface area.

- **Agent dashboard / Council** — invoke agents, view status, assign jobs, "Post a Job" modal, operator dossier cards, pixel agent rooms (wired to backend).
- **Workflows (399)** — workflow engine, chaining, scheduled jobs, client-side fallback, office work board (HUD + kanban + revenue).
- **Marketplace (164)** — list/discover agents & skills; skill marketplace tools; agent trading. **🟡** take-rate/escrow logic partially mock.
- **Billing & Subscriptions (145 / 61)** — tier limits, credits, cost tracking. **🟡 MOCK** (see §6).
- **Payments — Solana/Phantom (208/197), Stripe (49), MoonPay (22), Coinbase (5)** — wallet-connect + checkout UI exists. **🟡 MOCK** — no live keys/settlement.
- **Collectibles (on-chain)** — mint / list / listings / trade endpoints; SVG collectible art. **🔴** "Collectables" top-nav link is **broken** (see §7).
- **BYOK (18)** — bring-your-own-key with tier gating.
- **Whale Watch (39) / On-Chain (19)** — live wallet/whale tracking, auto-scan, RSI/Volume charts.
- **Content / Media Studio** — multi-mode content generation, social posting, video endpoints (`turtle-video-endpoints.js`).
- **Skills system** — execution, intelligent model routing, automatic skill creation, episodic/procedural/semantic memory, context injection, performance optimization.
- **Observability** — audit tools, cache analytics, LLM tracing.

## 6. Billing & payments — current state 🟡 MOCK (PRIORITY REVIEW)

**What exists:** UI for subscription tiers, a credits/wallet display, "connect Phantom" wallet button, Stripe/MoonPay/Coinbase checkout entry points, `billing-service.js` + `billing-routes.js` + `pay-guard.js`.

**What's NOT real (we want guidance here):**
- 🔴 No live **MoonPay** integration (no API key, no webhook, no on/off-ramp settlement).
- 🔴 No real **Solana wallet** money flow — Phantom connects but there's no actual transfer/settlement/escrow, no treasury wallet, no SPL token for "agent money."
- 🔴 **Agent money / credits** are simulated numbers, not backed by real balance or ledger.
- 🔴 Stripe is referenced but not confirmed live (no verified webhook/price IDs).
- 🟡 Marketplace take-rate, payouts, and escrow are mock.

**Open questions for reviewers:**
1. Fiat vs crypto-first? Do we need MoonPay at all, or Stripe-only for subscriptions + Solana Pay for agent purchases?
2. Is "agent money" a real SPL token, an internal credit ledger, or both? Custodial or non-custodial?
3. Compliance: KYC/AML obligations if we touch fiat on/off-ramps? Does staying credits-only (no cash-out) avoid money-transmitter issues?
4. Minimum viable real billing to charge the first paying customer this month?

### 6.5 Proposed direction — "MoonPay Agents" (current owner vision)

Consolidate the **three non-working wallet widgets** (Jupiter, raw Solana wallet, MoonPay) into **one coherent system**. Vision: AI **"MoonPay Agents"** that can **buy / sell / trade crypto** on the user's behalf, driven by the analytics SHADDAI already computes (Whale Watch, on-chain scans, RSI/volume). The user tells an agent what to do (or sets a strategy) and it executes; remove any widget that doesn't actually work.

**Mechanics reality-check (reviewer input wanted — this is the crux):**
- **MoonPay = fiat↔crypto on/off-ramp** (hosted checkout; Apple Pay / Google Pay / card / bank). It is **not** a programmatic trading or DEX API. It can *fund* a wallet and *cash out*; it **cannot itself trade positions**.
- **Programmatic SOL/SPL trading** needs a **DEX (e.g. Jupiter swap API)** or a CEX API. Ironically, **Jupiter — the widget the owner wants to drop — is the piece that actually enables on-chain trading.** Recommendation: *keep* a DEX/Jupiter as the **execution** layer, use **MoonPay only as the funding/cash-out** layer, and present the whole thing under one "MoonPay Agents" UX so the user never sees the plumbing.
- **Likely flow:** MoonPay (fund) → wallet → agent strategy (uses SHADDAI analytics) → Jupiter/DEX swap (execute) → MoonPay (cash out).
- **Custody & compliance (must decide):** agents auto-trading user funds raises custody, suitability, and possibly money-transmitter / investment-advice concerns. **Non-custodial (agent *proposes*, user *signs each tx* in Phantom)** is far safer than custodial auto-execution. Start with **paper-trading / simulation mode** + hard risk limits + a kill-switch (PIKADON-owned).

**Decisions needed:** custodial vs sign-each-trade · execution venue (Jupiter vs CEX) · paper-trade first? · per-trade & daily risk caps · who holds keys.

## 7. Known bugs / gaps 🔴

- **Collectables nav broken** — clicking "Collectables" in the top nav does not open `SHADDAI-Collectables.html` / the collectibles view. Needs wiring.
- **Billing/marketplace** — mock (see §6).
- **Mobile** — looks good but needs simplification + onboarding (see §8).
- **Render** — `render.yaml` present; deploy needs secrets set and a verified green deploy (health check `/api/model/health`).
- **Dead wallet widgets** — Jupiter / Solana / MoonPay widgets are shown but non-functional. Decision (per §6.5): remove the dead ones and consolidate into a single working "MoonPay Agents" flow (MoonPay = fund/cash-out, DEX/Jupiter = execute).
- Multiple near-duplicate HTML builds in repo (`public/index.html`, `FINAL-SHADDAI-V80.html`, `-MCPO`, `-CLEAN`, `73.x`) — needs a single canonical source.

## 8. Mobile 🔴 (wants direction)

The dashboard reportedly **looks great on mobile** already. Goals: **simplicity** + **a clear "what do I do / how" onboarding**. Open ideas: a guided first-run tour, a simplified mobile home with 3–4 primary actions, install-as-PWA, and a "showcase what agents can do" demo flow. *We want reviewer ideas on mobile activation/retention.*

## 9. Specific asks for Grok / Copilot

1. **Billing/payments + "MoonPay Agents" (§6, §6.5):** Is the MoonPay-funds + DEX/Jupiter-executes split the right architecture for agent-driven trading? What's the simplest *real* monetization to ship first, and what are the compliance landmines (custody, money-transmitter, investment-advice)? Should v1 be non-custodial sign-each-trade + paper-trading only?
2. **Architecture:** is a 2.7 MB single HTML file + Node monolith the right call, or should we split the frontend? What breaks at scale?
3. **Mobile activation:** concrete onboarding pattern to get people *using* it on mobile.
4. **What's missing entirely** from a marketplace like this (ratings/reputation, disputes, refunds, agent verification, output licensing, etc.)?
5. **Security:** with real payments + BYOK + agent code execution, what must PIKADON lock down before launch?

## 10. Repo / run

- GitHub: `https://github.com/IzzoIzzoIzzo/Shaddai`
- Run locally: `npm install` → `npm start` (serves on the configured PORT; open `/`).
- Health: `GET /api/model/health`.
- Canonical frontend served: `public/index.html`.

---
*Generated as a point-in-time snapshot of the v80 build for external review. Mock/gap flags reflect the state at time of writing and should be re-verified against current code.*
