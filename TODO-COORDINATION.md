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

---

## Terminal A update — 2026-08-29 (agent/backend + Simple Mode nav focus)

Same subagent experience here — 2/2 dispatched failed (API error, stall). Doing everything directly now too.

### Shipped since the last entry
- `<pending commit>` **head-explode.js**: opened head "compartments" (rag-cockpit.html) showed nothing behind the cut — head model is a hollow shell, clipping alone exposes no geometry. Added flat caps at each cut boundary so an opened compartment reads as a solid slice, not a void.
- `<pending commit>` **shd-modules.js** (the single source of truth behind BOTH `enter.html`'s tiles and `simple.html`'s wheel — owner didn't realize this already exists as one clean file): GAMES sub-wheel pointed at battle-arena.html/tactics.html/basketball-jam.html — real files, but never in arcade.html's actual FEATURED (unlocked) roster. Replaced with the real roster (climb, hoops, gridiron, soccer, dodgeball, starfall, royale). xto-adventure + shaddai-realms confirmed excluded on purpose — arcade.html password-gates them (BETA_GAMES, "SHADDAIGAMES"). Dropped CREATE tab per owner; LAUNCH KIT (still liked) relocated into BRAIN/docs instead of deleted.
- In progress, not yet committed: removing the OTHERS category (owner wants things routed contextually, not a catch-all bucket) and restructuring FORGE into agent-creation (`forge.html`) / 2D pixel-realm assets (`pixel-forge.html`, confirmed real) / 3D world sculpting (`forge-3d.html`) / 3D marketplace (owner explicitly wants this REAL — buy/sell/curate/featured, not `forge-gallery.html` relabeled — logging as a real backlog item below, not faking it).

### ⚠️ Worth knowing
- Confirms your `JWT_SECRET` finding matters a lot given the federation work: `6526fe3` added key-gated external agent access (`/api/a2a`, `/mcp/tools/call`) — separate auth mechanism (static keys in `backend/data/mcp-external-keys.json`, gitignored), not JWT-dependent, so it's unaffected by that gap, but flagging in case anything else assumes session tokens survive a restart.
- Owner sent a live Solana wallet secret key and a Paybox signing key mid-session (not OAuth-related) — both saved to the Obsidian vault (`07 Credentials/SHADDAI-API-KEYS-MASTER.md`), neither wired into any code path. Mentioning so nobody's surprised finding them there.

### Backlog captured, not built (owner described these this session — real specs, real scope, not started)
1. **Real 3D marketplace** — people create/list 3D assets + sprites, buy/sell, owner curates some for the 3D world + "featured this month." Replaces `forge-gallery.html`, which is a static placeholder today, not a marketplace.
2. **Help/discovery flow** — a "help me" button + category picker; user types what they need, filters to the right section/agent. First 3 uses free, then sign-in/pay gate.
3. **Bring-your-own-bot workflows** — external agents (Grok bot etc.) using the same tool/workflow catalog a signed-in user gets. Federation endpoint (`6526fe3`) is the plumbing; no UI/onboarding for it yet.
4. **Paybox-driven agent purchasing** ("agent asks, buys with Paybox," tip via wallet, groceries/party items) — explicitly blocked until Paybox OAuth completes; owner's own framing puts "buy" inside SIGNALS (sentiment+buy) and Bazaar, not a separate bucket.

### Claiming next
- Finishing the FORGE/OTHERS restructure above (`shd-modules.js` only)
- `rag-cockpit.html` "shards" panel + other side buttons (item 3 in the original Open list) — head-compartment part is done, shards part isn't
- Retrying skill-recipe conversion (item 2) and the dashboard/Forge/2D-world audit (item 1) once the above is committed

### Not touching (yours)
- `public/index.html`, dashboard themes/chrome, games touch controls, docs consolidation — all still terminal B's per your claim above.

---

## Terminal A update 2 — 2026-08-29 (Forge, priority 1 of the owner's master prompt)

Owner gave both terminals a priority-ordered master prompt: Forge → AURA → MCP → skill-recipes for this lane, don't touch B's files (index.html, enter.html, simple.html, manual.html, pro-signals.html, shd-chrome.js, enter-intro.js, simple/*, theme-switcher.js).

### Shipped
- `3cc044b` shd-modules.js FORGE/OTHERS restructure (mentioned above, now committed)
- Forge creation, actually verified end to end (not just read) — found and fixed two real bugs blocking "someone paying $100 forges an agent on day one":
  1. **Duplicate operatives**: every forge made two creation calls (`POST /api/forge` internally creates a bare record, frontend then `POST /api/operatives` with real tools) with no shared id → two records per forge, one an empty-tooled ghost. Fixed in `backend/lib/operatives.js` — upsert by owner+codename now, same key the self-heal sync already used elsewhere.
  2. **Forged agents couldn't run**: `routeTask()`/`callLLM()` in `agent-engine.js` only ever resolved the 7 council AGENTS — a forged agent's name silently fell through to keyword-matching those same 7 and ran as whichever won (reproduced: ran as NEXUS instead of the forged agent, with NEXUS's tools). Added `resolveAgent()` — looks up a forged operative by codename, synthesizes an AGENTS-shaped object from its real persona/tools.
  Both reproduced live via curl against the running server before and after, not assumed from reading code. Test data cleaned up after.

### ⚠️ Found, not fixed — flagging for whoever has bandwidth
- A live `runWorkflow` call on `openai/gpt-oss-120b` (Groq) returned a real answer prefixed with **thousands of invisible zero-width-space characters** where a price value should've been — looks like a repetition-loop quirk on that specific model, not our code (the garbage came from the actual LLM response, confirmed via the `[LLM] provider=groq model=...` log line, not a cache replay). No repetition/output-sanity guard exists anywhere in the agent loop. Could hit real users. Not chased further — separate scope from Forge.

### Priority 2 (AURA) — done
- Ledger is real, not hardcoded: `backend/data/aura-stats.json` — 15 hits/26 misses/32,302 tokens saved from actual usage, `costSavedUsd` computed live, not a fixed number.
- Added `backend/lib/aura-savings.test.cjs` — proves the actual claim (ask twice, second is free) against the real integration point (`modelChat`), not a mock. Manual-run only (real tiny provider cost), not in `gate-node.js`.
- Found and fixed a real gap: `lib/agent-tool-run.js` — the function behind Simple Mode's action wheel AND the federation/MCP door — called Groq directly, completely bypassing AURA. Wired the same free-path-first pattern every other agent-chat path already uses. Verified live: first call real provider, identical second call `aura-cache`/$0.
- Found, not fixed: AURA's fuzzy match is bag-of-words cosine similarity — scores two *different* templated prompts as near-identical when only one token differs ("reply with exactly this string: X" vs "...: Y"), reproduced it serving X's answer for a Y request. Fine for paraphrase questions, wrong for exact-echo/templated ones. Needs real tuning work, not a quick patch.

### Priority 3 (MCP) — done
- Local stdio server (`mcp-server-rag.js --self-test-full`): 23/23 (1 retry needed — matches this repo's own documented flaky-rate-limit note).
- Found a real gap matching what's actually sold: pricing page promises "point Claude, Grok or a local model straight at the council's knowledge... on your own key" — a REMOTE connection — but the RAG tools only ever ran over stdio (local process spawn), unreachable by an actual paying customer. Exported `mcp-server-rag.js`'s `runTool()` (guarded behind `require.main === module` so requiring it doesn't spawn the stdio server) and wired it into the already-key-gated `/mcp/tools/call` from `6526fe3`. Manifest now lists all 13 tools (7 agents + 6 RAG tools). Verified live: unauthenticated still 401s, with a real key `rag_search` returns real grounded hits over the actual remote door a customer would use.

### Priority 4 (skill-recipe conversion) — not started
3,022 "baked" (LLM-guesses-the-tool) skills vs. 141 real deterministic recipes in `backend/skill-index.js`. Convert the highest-traffic ones. Next up.

### Still blocked
- **Paybox** — owner is actively trying to complete OAuth (2026-08-29 evening). Three attempts so far all failed at `complete_authentication` with "no OAuth flow is in progress" even on a fast, correctly-matched code+state — looks like a real bug in the OAuth connector's flow-tracking, not user error. May need a fresh session or upstream fix. Not a SHADDAI-repo issue — nothing to fix in this codebase for this specific failure.

---

## Status pasted from elsewhere — 2026-08-29 evening, cross-checking against what's actually done

Owner pasted a "what this needs next" checklist (source unclear — possibly terminal B or a separate audit). Reconciling against real state:

| Item | Checklist said | Actual state |
|---|---|---|
| Key vault security | Fixed today: unauthenticated key deletion by name, unauthenticated provider listing, unlimited password guesses — all closed, verified against live server. Tracked secrets file now gitignored + untracked. | Not mine — didn't touch vault code this session. Noting for awareness; good disclosure practice. |
| AURA hit rate | "Never measured — measure before claiming it" | **Stale.** Already measured + proven this session (see Priority 2 above) — real ledger, real integration test, real bypass fixed. Don't redo. |
| Tier prices | Backend: Builder $19 / Pro $49 / Alpha $199. Page sells $30 / $200. | Real conflict, needs the owner's decision — not something either terminal should guess at. |
| Stripe founder seats | Live in prod; needs confirming the founder link is priced at $100 | Unclaimed — quick verification task. |
| Key vault front-end | Built & hardened; needs a page to paste keys into | Unclaimed — likely terminal B territory (new UI page) unless they say otherwise. |
| Agent forge + vault | Live end-to-end; needs a forged agent able to draw on vault keys | **My lane** (forge/backend) — candidate next task alongside Priority 4. |
| MCP | Built and live both directions; needs a Max-tier gate, a setup page, and web search | Partially mine already (`6526fe3`, this session's RAG-over-MCP fix). The Max-tier gate is backend (mine); "setup page" is UI (terminal B territory, matches the "still needs its own dedicated connect page" note I already left in the `6526fe3` commit); web search as an MCP tool is backend (mine). |
| Sparks ledger | Built; "enter the price card above" | Unclear ask — flagging rather than guessing. |
| Fal + OpenRouter | Decided (media via Fal, text via OpenRouter for keyless members), not implemented | Backend routing — my lane, unclaimed. |
| Paybox mount | Written, not mounted — verify REST contract | **Explicitly assigned to Terminal B** per the pasted note — not mine, don't duplicate. |
| Plots & land | Not built — world exists, economy doesn't | Matches the already-parked plot/token economy backlog item above. Still parked (securities exposure), not a green light to build the pledge/escrow mechanism. |

### Claiming next (backend lane, unclaimed items above)
- Agent forge drawing on vault keys (BYOK → forged agent's actual LLM calls)
- MCP Max-tier gate + a web-search tool
- Fal (media) / OpenRouter (text) routing for keyless members
- Then continuing Priority 4 (skill-recipe conversion), already queued

---

## Paybox — real integration shipped (2026-08-29 night)

OAuth finally completed (flaky connector, took ~4 attempts). Real tool surface confirmed, `paybox-guard.js` fully rebuilt around it (same 5-layer safety scaffold, only the transport was wrong before). Verified live from the backend itself — `get_portfolio` via a real `pbx_live_*` key returned real wallet data. Full detail in `MASTER-PLAN.md` §1/§Phase 2 and the `paybox-guard.js` commit message. `enabled` stays `false`.

**Real, important finding:** the connected wallets are `approval_mode: autonomous` — Paybox itself won't additionally prompt for them, so `paybox-guard.js`'s gate is the only human checkpoint that exists. Worth both terminals knowing before anyone builds anything that calls `paybox_pay`.

**Also fixed while I had the vault/forge code open:** `agent-tool-run.js`'s `groqKeyPool()` never read the persisted BYOK vault (`byok-keys.json`) — only the council-agent path did. Forged agents can now draw on a saved vault key too. Covers the "agent forge draws on vault keys" item above (backend half — no front-end page exists yet to paste keys into, still open).

**Not mine — flagging for whoever owns pre-landing/Simple Mode:** owner asked for a Paybox button, a FOMO referral link button (`https://fomo.family/r/zerox007`), and a small "tip ZEROX" button — all top-corner, small, on the pre-landing/enter.html page. Full prompt handed to terminal B directly. That's `public/enter.html`/`public/simple.html` territory, explicitly off-limits to me per the priority-order split.

**Tip-ZEROX backend done:** `GET /api/paybox/tip-link?agent=ZEROX&amount_usd=N` — real, verified live, returns a real MoonPay checkout URL that lands funds in ZEROX's wallet. Read-only Paybox tool underneath (`get_buy_link`), no spend-gate needed since it's money coming IN. Terminal B: wire the tip button to this endpoint, open `checkout_url` in a new tab/window.
