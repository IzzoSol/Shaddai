# SHADDAI — PIKADON Security & Compliance Audit (v80)

*Defensive review by PIKADON. Worst-case assumptions. Go/no-go at the bottom.*
*Date: 2026-06-01 · Scope: repo `IzzoIzzoIzzo/Shaddai` (private) + localhost test of the v80 build.*

## 🔴 VERDICT: NOT launch-ready until the two CRITICALs are fixed.

---

## 🔴 CRITICAL-1 — Live API key(s) hardcoded in the served frontend
- `public/index.html` line **27235** contains a live **OpenRouter key** `sk-or-v1-b826f3…1660b5`. Line **5534** has an `sk-ant-api…` (Anthropic) reference.
- **Why it's critical:** `public/index.html` is served to every browser. Anyone who loads the dashboard (or views source) gets the key and can spend on your account. "Private repo" does **not** protect this — the *served* page is public the moment it's deployed.
- **Remediation (do now):**
  1. **Rotate** the `sk-or-v1-b826f3…` key at openrouter.ai immediately (assume it's compromised).
  2. **Remove all keys from client code.** Browser LLM calls must go through the SHADDAI **server** (`/api/...` → `llm-client.js`), which reads keys from `backend/.env`. The browser should never hold a provider key.
  3. Add a CI/pre-commit grep that fails on `sk-or-v1-`, `sk-ant-`, `gsk_`, `AIza` in any `public/**` or committed file.
- *Note:* the OpenRouter key added today (`sk-or-v1-717e…`) is correctly in `backend/.env` (gitignored) and is **not** in git — good. The leak is a different, older key already baked into the HTML.

## 🔴 CRITICAL-2 — Billing auth trusts client headers (impersonation → free money)
- `billing-routes.js authenticateUser()` sets `req.userId` from `x-user-id` header / body **without validating any token**. Firebase JWT verification is a TODO.
- `/api/billing/admin/credit` and `/admin/set-tier` have **no auth/role check** (only field validation).
- **Impact:** anyone can (a) impersonate any user, (b) call `/admin/credit` to grant themselves unlimited credits, (c) `/admin/set-tier` to self-upgrade to elite. Billing is bypassable → revenue = 0.
- **Remediation:** verify Firebase ID tokens in `authenticateUser` (reject on failure); gate all `/admin/*` behind a server-side secret/role (not a header an attacker controls); never trust `x-user-id` for authorization.

## 🟠 HIGH-1 — New routes are unauthenticated
- `/api/brains/*` (mine) — no auth. `/api/brains/test` makes **real LLM calls** → cost-abuse + prompt-injection vector for anyone on the network.
- `/api/moonpay/*` (mine) — no auth. **Anyone can POST `/killswitch {on:false}`** (disable the safety) or post trade intents.
- **Remediation:** put both routers behind the authenticated middleware; **role-gate the kill-switch and `/brains/custom` + `/agent` to admin/PIKADON**. Rate-limit `/brains/test`.

## 🟠 HIGH-2 — Client-rendered strings = XSS surface
- The 2.7 MB single-file UI builds lots of markup via `innerHTML`. User-controlled strings (agent names, **custom personas**, marketplace listings, collectible names, MoonPay intent rationales) rendered unescaped = stored XSS.
- **Remediation:** escape all user/agent-supplied text before `innerHTML` (or use `textContent`); sanitize persona/listing inputs server-side.

## 🟡 MEDIUM
- **Secret hygiene:** today's OpenRouter key is now in the Obsidian vault (**OneDrive-synced**) and in this chat transcript. Treat as sensitive: restrict OneDrive sharing on the keys note; rotate if it ever leaves your control. Prefer a secrets manager / Render dashboard env over plaintext notes long-term.
- **Money-movement audit log:** every MoonPay intent / `pay-agent` / future MoonCard purchase must be **append-only logged** (who, what, amount, approval, signature). Currently only an in-memory list.
- **MoonPay agent module:** non-custodial ✓, kill-switch default-ON ✓, holds no keys ✓ — good design; the gap is only the missing auth (HIGH-1).

## 🟡 COMPLIANCE (before real money / MoonCard / auto-trading)
- **Custody:** non-custodial (keys in user's local `mp`) is the right call — keep it; never let the server hold keys.
- **Money-transmitter / KYC:** MoonPay handles ramp KYC. SHADDAI must not become a custodian or pooled-funds operator.
- **Investment advice / suitability:** agent auto-trading and "agent shops/books for you" need explicit **per-transaction approval + spend caps + paper-trade default + kill-switch** (you have these instincts already). Add clear disclaimers.
- **MoonCard / agentic commerce:** spending real money on real purchases is the highest-risk surface — require user approval per spend, hard daily caps, and freeze controls (MoonCard supports freeze).

## ✅ GOOD (verified this session)
- `.env`, `backend/.env`, `aura/.env` are gitignored; **no `.env` is tracked**.
- Repo is **private**.
- Today's OpenRouter key is **not** committed.
- `helmet` + `security-middleware.js` + `workflow-security.js` present.
- MoonPay design is non-custodial with a default-ON kill-switch.
- Server binds `process.env.PORT`, serves same-origin (no broad CORS).

## Remediation priority
1. **CRITICAL-1** rotate + strip client keys (today).
2. **CRITICAL-2** real auth on billing + admin.
3. **HIGH-1** auth + role-gate brains/moonpay routes.
4. **HIGH-2** escape client-rendered user input.
5. MEDIUM: audit logging, secret hygiene, compliance guardrails before real money.

— PIKADON
