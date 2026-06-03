# SHADDAI — Everything Missing / Left To Do (brainstorm)

*Honest, complete backlog as of this session. Ordered by what unblocks the most. ✅ done items live in `SHADDAI_BUILD_STATUS.md`.*

## 🔴 P0 — Security (MUST do before ANY real users)
1. **Strip hardcoded API key from `public/index.html`** (~line 27235, a live OpenRouter key) + **rotate it**. Route ALL browser LLM/API calls through the server; keys live only in `backend/.env` / Render.
2. **Real billing auth** — replace header-trust `authenticateUser` with Firebase ID-token verify; protect `/api/billing/admin/*`.
3. **Turn the gate ON in prod** — set `ADMIN_TOKEN` + `REQUIRE_AUTH=true` (auth-guard already supports it).
4. **Sandbox `run_js` / `run_python`** — ⚠️ PARTIAL (2026-06-03): JS now routes through `backend/lib/sandbox.js` (hardened `vm`, null-proto, timeout). `isolated-vm` could NOT build here (no VS C++ toolchain + Node v25). FOLLOW-UP: replace `vm` with a container/isolate runner before opening code-exec to non-admins; until then `/execute-code` is admin-gated and `run_python` stays off (`ALLOW_PYTHON_EXEC`).
5. **Escape user/agent strings** before `innerHTML` (personas, shop names, listings) — stored XSS.
6. **Secret-scan CI** — fail commits containing `sk-or-v1-`, `sk-ant-`, `gsk_`, `AIza`.

## ⚙️ P1 — Core functionality gaps
7. **Skill→tool binding** — `skill-router` "skills" return canned text, NOT wired to the 133 real tools. Map the skill library → tool registry with a sane fallback. *(The big one; one-shot agent attempt failed — do it deliberately.)*
8. **Meter real usage end-to-end** — wire `brains.js agentLLM()` / `recordUsage()` into `agent-engine.js` so every agent action debits credits.
9. **Custom agents runnable in the full loop** — Operator Forge agents currently run via `/brains/test`; let them run real tool-using tasks via `/api/agent/run` + persist (DB, not just in-memory/localStorage).
10. **Cron runner** so `schedule_task` actually fires due tasks (wire to `background-jobs.js`).
11. **Activate keyed tools** — Discord, Telegram, GitHub, Suno, ElevenLabs, Nano-Banana (add keys → 7 skipped tools go live).
12. **Real music** — `SUNO_API_KEY` (or AceDataCloud) to turn lyric-gen into actual audio; expose as a tool.
13. **Remove orphan Jupiter JS** functions left after widget removal (harmless but dead).

## 💰 P1 — Payments / commerce (the money engine)
14. **MoonPay agent-commerce access** — confirm tier/API at dev.moonpay.com for MoonCard + shopping/travel/subscriptions; wire beyond the roadmap block.
15. **Real Stripe** — price IDs + verified webhook for subscriptions (lazy-load is ready, keys + IDs needed).
16. **Credit ↔ stablecoin bridge** — MoonPay top-up → SHADDAI credits (webhook → `credit(userId,...)`).
17. **Per-spend approval + daily caps + audit log** for any real money movement (trading + commerce).

## 🎮 P2 — Product / vision
18. **The "magic moment" loop** end-to-end: own agent → customize (collectible) → do a job → earn → level up.
19. **2D Bazaar → real** — back listings/shops with real data + escrow + payouts (currently demo + localStorage).
20. **Collectibles real economy** — mint/list/trade with on-chain or ledger backing + secondary royalties.
21. **MoonPay section → Markets tab** placement (currently in the dashboard grid).
22. **3D marketplace** (later) — Three.js/Babylon; earn it after the 2D loop works.

## 📱 P2 — Packaging
23. **PWA install-as-app** — manifest + service worker + icons ("Install SHADDAI").
24. **Chrome extension** — for agentic shopping/price-comparison (acts on the page).

## 🧹 P2 — Ops / hygiene
25. **One canonical build** — repo has many near-dup HTMLs; keep `public/index.html`, archive the rest.
26. **Unify local copies** — use the repo clone (now runnable) as source of truth; retire the divergent `SHADDAI-FINAL-BUILD` working copy.
27. **Verified green Render deploy** — connect repo + set `GROQ_API_KEY` → confirm health check passes.
28. **Tests / CI** — `scripts/tool-audit.js` exists; add CI to run it + the secret-scan on every push.

## In-flight this session (finishing)
- ✅ MoonPay Agents full section (committed).
- ⏳ 2D Bazaar polish (shop profiles + buy flow) — agent running; integrate on completion.
