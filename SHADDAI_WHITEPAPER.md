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
- 🔴 No live **MoonPay** integration *yet* — but the chosen path is now **MoonPay Agents via `@moonpay/cli`** (see §6.5), which replaces the dead widgets entirely.
- 🔴 No real **Solana wallet** money flow — Phantom connects but there's no actual transfer/settlement/escrow, no treasury wallet, no SPL token for "agent money."
- 🔴 **Agent money / credits** are simulated numbers, not backed by real balance or ledger.
- 🔴 Stripe is referenced but not confirmed live (no verified webhook/price IDs).
- 🟡 Marketplace take-rate, payouts, and escrow are mock.

**Open questions for reviewers:**
1. Fiat vs crypto-first? Do we need MoonPay at all, or Stripe-only for subscriptions + Solana Pay for agent purchases?
2. Is "agent money" a real SPL token, an internal credit ledger, or both? Custodial or non-custodial?
3. Compliance: KYC/AML obligations if we touch fiat on/off-ramps? Does staying credits-only (no cash-out) avoid money-transmitter issues?
4. Minimum viable real billing to charge the first paying customer this month?

### 6.5 Payment & trading engine — MoonPay Agents via `@moonpay/cli` (CHOSEN DIRECTION)

MoonPay shipped a purpose-built **agent-money product** (CLI `@moonpay/cli` v1.71, published **2026-05-30**; site **moonpay.com/agents**; tagline *"how agents move money"*). It is **one tool** that covers everything we previously thought required three separate widgets — so we **replace the dead Jupiter / Solana / MoonPay widgets with a single MoonPay-Agents integration.**

What the CLI provides (verified from its README):
- **Non-custodial wallets** — keys encrypted **locally** (`~/.config/moonpay/wallets.json`), never leave the machine. Multi-chain: **Solana, Ethereum, Polygon, Bitcoin, TON**; Ledger hardware support.
- **Market data / research** — `mp token trending`, `mp token search`, `mp token retrieve` (feeds agent decisions alongside SHADDAI's Whale Watch / on-chain / RSI analytics).
- **Trading (execution)** — `mp token swap` (same-chain, e.g. SOL→USDC, routed via swaps.xyz) and `mp token bridge` (cross-chain). This *is* the execution layer — no separate Jupiter UI needed.
- **Fiat on/off-ramp** — `mp buy`, plus a **virtual account** and **zero-fee stablecoin on-ramps**.
- **Agent integration** — ships **Skills** (`mp skill install` for Claude Code / Desktop / any MCP agent) and an **MCP server** (`mp mcp`). SHADDAI agents can drive it directly.

**SHADDAI flow:** user funds via `mp buy` → agent reads `mp token` market data + SHADDAI analytics → agent proposes/executes `mp token swap`/`bridge` → cash out via MoonPay. Surface it all as **"MoonPay Agents"** in the dashboard.

**Open integration questions (reviewer input wanted):**
1. **Hosted-app auth:** CLI login is **interactive** (`mp consent accept`, `mp login --email`, email code). For SHADDAI on Render, is there a **server-side API key / non-interactive auth** (see dev.moonpay.com + moonpay.com/SKILL.md), or is the intended model *"each user runs the MCP/CLI locally and SHADDAI orchestrates"*? This decides whether trading runs **server-side vs client-side** — and who holds keys.
2. **Custody:** non-custodial is great, but a *hosted server* that creates wallets would hold keys → custody risk. Strongly prefer **keys on the user's machine** (local MCP server) with SHADDAI sending intents.
3. **Fees / limits / sandbox:** confirm via dev.moonpay.com.
4. **Compliance:** MoonPay handles KYC for the fiat ramp; offering **auto-trading** still raises suitability/advice questions → ship **paper-trade mode + sign-each-trade + risk caps + PIKADON kill-switch** first.

## 7. Known bugs / gaps 🔴

- **Collectables nav broken** — clicking "Collectables" in the top nav does not open `SHADDAI-Collectables.html` / the collectibles view. Needs wiring.
- **Billing/marketplace** — mock (see §6).
- **Mobile** — looks good but needs simplification + onboarding (see §8).
- **Render** — `render.yaml` present; deploy needs secrets set and a verified green deploy (health check `/api/model/health`).
- **Dead wallet widgets** — Jupiter / Solana / MoonPay widgets are shown but non-functional. Decision (per §6.5): remove all three and replace with one **MoonPay Agents** integration via `@moonpay/cli` (one engine: wallet + swap + bridge + fiat ramp + market data + MCP).
- Multiple near-duplicate HTML builds in repo (`public/index.html`, `FINAL-SHADDAI-V80.html`, `-MCPO`, `-CLEAN`, `73.x`) — needs a single canonical source.

## 8. Mobile 🔴 (wants direction)

The dashboard reportedly **looks great on mobile** already. Goals: **simplicity** + **a clear "what do I do / how" onboarding**. Open ideas: a guided first-run tour, a simplified mobile home with 3–4 primary actions, install-as-PWA, and a "showcase what agents can do" demo flow. *We want reviewer ideas on mobile activation/retention.*

## 9. Specific asks for Grok / Copilot

1. **MoonPay Agents (`@moonpay/cli`) integration (§6.5):** For a hosted Node app on Render, what's the server-side / non-interactive auth model (vs each user running the local MCP)? Where should wallet keys live (server = custody risk vs user machine)? What's the simplest *real* monetization to ship first, and the compliance landmines (custody, money-transmitter, investment-advice)? Should v1 be paper-trade + sign-each-trade only?
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
