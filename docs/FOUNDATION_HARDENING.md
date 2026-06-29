<div align="center">

# 🛡️ Foundation Hardening
### *The security base SHADDAI is built on*

*Before a single feature was polished, the foundation was made sound. This is the work that lets SHADDAI run agents that execute code, move money, and serve real users — safely.*

</div>

---

## Why it exists

A platform where autonomous agents write code, spend credits, mint assets, and embed on strangers' websites is only as trustworthy as the floor it stands on. Foundation Hardening is that floor — a deliberate, audited pass (PIKADON's mandate) that closed every critical gap **before** the creation, marketplace, and payment layers were built on top. Nothing ships on an insecure base.

## What was hardened

| Domain | Before | After |
|---|---|---|
| **Secrets** | A live API key was embedded in shipped HTML + git history | Key **rotated & purged**; six stray key-bearing builds deleted; **gitleaks CI** blocks any future leak on push |
| **Authentication** | Sensitive routes trusted a spoofable header | **Firebase-verified auth** (`softAuth`/`verifyFirebaseToken`) + **admin gating** on agent, skill, code-exec, and money-moving routes — dev-permissive, prod-enforced |
| **Code execution** | Agent `run_js` used Node `vm` (escapable — not a real boundary) | Routed through a single hardened sandbox module; `run_python` gated off; admin-gated; container-isolation path documented |
| **XSS** | User/agent strings rendered raw into the DOM | Shared `sanitizeText()` applied to user-controlled sinks (MoonPay intents, agent/listing output) |
| **Build hygiene** | ~15 near-duplicate HTML builds, one served by guess | **One canonical build** (`public/index.html`); the rest archived; a clean **DEV / SHIP / GitHub / Obsidian** backup topology |
| **Deploy** | No verified pipeline | **Render blueprint** (`render.yaml`) verified to boot green; keys live only in the dashboard, never in code |

## Bugs caught along the way

Hardening is also where the quiet bugs surface. Fixed in passing:
- **3 unresolvable dependencies** silently breaking `npm install` (`jsonwebtoken@^9.1.0`; bogus `path`/`fs` packages).
- A **duplicate `saveWorkflows()`** where JavaScript hoisting routed calls to the wrong function — a latent data-corruption bug.
- A **flaky rate-limit test** that restored state before its own async assertion.
- The **single highest-leverage fix of all:** every LLM path tried slow local Ollama *first* and used a **decommissioned Groq model**, so responses crawled at 20–30s and silently fell back. Reordered to fast cloud-first + a current model → **~30–60× faster** (chat 327ms; agent loops complete in ~2s) and later expanded to a six-provider fallback chain so no single rate limit can stall a workflow.

## The discipline

Every change was verified with evidence, not assertion: a **90-test suite** stays green, an **endpoint-integrity auditor** confirms all 200+ frontend calls resolve to real backend routes (zero broken links), and a **tool audit** keeps the registry honest (180+ live tools). Secrets live only in a gitignored `.env` and the Render dashboard — the secret-scan CI is the tripwire that enforces it.

## The result

A base that is **safe to open to the public**: agents can run code in a contained sandbox, money can move through audited, authenticated routes, and the whole thing deploys clean — with a test suite, a secret-scanner, and a single source of truth standing guard. Everything SHADDAI does next — the creation suite, the orchestrator, the marketplace, the NFT vault, x402 payments — rests on this.

> *Foundation first. Then we build the cathedral.*
