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
