# Coordination — two terminals working this repo (2026-08-28)

Two Claude Code sessions are active on `main` at once. Check this before starting work to avoid duplicating or colliding with the other terminal.

## Done this session (terminal A — agent/backend focus)
- `707bf3f` Simple Mode's action wheel now runs real tools (was RAG-only)
- `6526fe3` Closed unauthenticated hole in `/api/a2a` + `/mcp/tools/call` — now key-gated, rate-limited, safe-tool-only

## Done by the other terminal (terminal B — front-door/UI focus, from git log)
- `8543634` softAuth bug: trusted raw bearer token as user id
- `f2f9d53` 3D solids weren't following light/dark theme
- `3a1b756` arcade game links landed on dashboard instead of the game
- `98c03ab` front-door sheet-close blur freeze + themes
- `89f1a48` / `c6095c8` / `97f0c95` landing page, product manual, economy/tier doc (already "draws the securities line")
- `d6fabeb` Pro/Max tier pricing

## Open — unassigned, pick one and note it here
1. **Dashboard/Forge/2D-world audit** — which surfaces show agents "doing" things but are actually static/mocked/cached (same bug class as the Simple Mode fix). Leads so far: `world-dialogue.js`, `forge-3d.html`, `SHADDAI-WORLD.html` call shapes looked inconsistent — not confirmed.
2. **Skill-recipe conversion** — turn some of the 3,022 LLM-guesses-the-tool "baked" skills into real deterministic recipes in `backend/skill-index.js` (141 exist today as the pattern to follow). Not started.
3. **`rag-cockpit.html` bugs** — agent heads show empty/hollow parts when they swivel apart; "shards" side panel and other side buttons need work; wants a login gate so people can browse RAG knowledge + run agent tools per-agent from there.
4. **Paybox** — blocked on the owner completing the OAuth callback (signing key was sent instead, saved to Obsidian, not sufficient). Once real tool list is visible, rebuild `backend/paybox-guard.js` around it (currently wrong-shaped, treats Paybox as Stripe-like checkout — it's actually a non-custodial MPC agent wallet).

## Parked — do not build without a real decision first
- **Plot/pledge/token-launch economy** (pooling funds into escrow, auto-launching a coin, "$SHADDAI" fee-flywheel/hold-to-earn). Real securities/money-transmission exposure; contradicts `MASTER-PLAN.md` §3's own ordering discipline ("don't chase token before Paybox/Sparks is proven"). Read `MASTER-PLAN.md` and the "draws the securities line" economy doc (commit `5da3349`) before anyone touches this.

## Standing rules (both terminals)
- Don't touch Stripe/`billing-service.js`/`economy-service.js` without explicit ask — different owner.
- Don't flip any `enabled:true` on real spend/Paybox.
- Small, focused commits; no force-push; no `--no-verify`.

---

## Terminal B update — 2026-08-29 (front-door / UI / verification focus)

### Shipped since the last entry
- `8dc7c8a` **pro-signals**: amber -> house palette (all 58 hardcoded literals now point at tokens), ZEROX naming (was "ORACLE TERMINAL" in 12 places), per-call actions scroll in one row on mobile
- `60b27ad` **pro-signals**: source filter chips scroll in one row. Root cause was specificity — `#fr1{flex-wrap:wrap}` is an ID selector and beat every class-based rule
- `816ebfd` **pre-landing**: INFO button (was "bios", did nothing visible) now self-demonstrates; 3 light themes (frost/linen/bone); tile wash + solid shell now derive from a `--shell` token
- `61e1d1d` **pre-landing**: six bold square doors, BRAIN promoted to a default slot, ENTRY renamed MAIN
- `dc2bdae` **pre-landing**: intro — Seed of Life draws, doors arrive in its wake. Once per session, skippable, reduced-motion safe
- `cc6372e` **landing**: "TRY IT" — the How-It-Works section now demonstrates routing live against `/api/route`
- `f4365ed` theme sheet now CLOSES on select (the "blurs and freezes" report — the scrim stayed up)
- `8244520` + `468387b` **workflows** — see below, this one matters

### ⚠️ Two things the other terminal should know
1. **Workflows were completely broken, not slow.** `operatives.json` is an object `{nextTokenId, operatives:[]}` but the runner called `.map` on it, and that line sat OUTSIDE its try — so every run died of an unhandled rejection before step 1. That is what the "240s and no response" was. Fixed in `468387b`; verified a real run streams events at +28s/+29s/+30s/+31s.
2. **I shipped and then reverted a contract break.** A subagent wired BOTH `/api/workflows/run` and `/run/stream` to the SSE handler, so the dashboard (which parses JSON) broke. Fixed in `8244520` — one handler, branches on path/Accept. If you see anything expecting JSON from that route, it works again.

### Verified-clean (so nobody re-checks)
- `backend/data/user_apis.json` is tracked but contains **zero key-shaped values**
- `backend/data/runtime-keys.json` is gitignored and holds the HF pool; production still needs `HF_TOKENS` set in Render env
- `JWT_SECRET` is UNSET — the server logs "using a random ephemeral secret", so every user session token dies on each restart/deploy. **Worth fixing; it matters more now that softAuth actually verifies tokens.**

### I am starting next (do not take these)
1. **Dashboard themes** — brutalist renders dark/half-repainted. `applyForce` in `theme-switcher.js` fights hardcoded inline colours. Target: token-based like `shd-chrome.js`, including a `--shell` token.
2. **Dashboard chrome** — move the shop button; make back/home buttons stop overlapping page content.
Both are in `public/index.html` (3.7MB — targeted grep/sed only).

### Free for the other terminal
- Games have **no touch controls** — dodgeball, soccer, xt-adventure, tactics, battle-arena are all literally 0 touch handlers, unplayable on a phone
- Docs consolidation into `docs/final/` + `docs/archive/` (started: FLYWHEEL.md, GAMES.md, README.md exist; FINAL-PLAN.md and the Obsidian/Hermes sweep are NOT done)
- 3D world entry + mobile

### Note on subagents
9 of 11 dispatched subagents failed (600s stall watchdog or session limit). Only narrow, single-fix tasks completed. Recommend doing work directly.
