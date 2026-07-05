# AURA → AINL parity roadmap (1 → 2 → 3)

> Owner decision (2026-06-15): do **Stage 1 now** (done), **Stage 2 later**, **Stage 3 eventually**.
> Keep this so we don't forget. Mirror to Obsidian ("SHADDAI" vault) when convenient.
> AINL = `github.com/sbhooley/ainativelang` (AI Native Lang). Core thesis we're chasing:
> **keep the model off the hot path** — author/compile a task once, then run it deterministically
> forever with ~zero per-run inference. "Make AURA just like that or better."

## ✅ Stage 1 — DONE (2026-06-15)
AURA is a standalone, zero-dep terminal tool (`@shaddai/aura`, installed globally) at
`aura-cli/`. Applied AINL's principle as 4 free upgrades:
- Smarter stopword-aware fuzzy cache (close rephrasings hit).
- Parametric compute templates (percent / % off / tip / % change / days-between) — "compile once, run free."
- Cheapest-capable model routing on a miss (light/balanced/heavy via a free classifier).
- Shared `AURA_HOME` cache so the CLI and the dashboard (`backend/lib/aura.js`) compound savings.
17/17 tests pass. See [[aura-standalone-cli]].

## ✅ Stage 2 — DONE (2026-06-16, via parallel agent)
Implemented in `aura-cli/`: skills registry at `<AURA_HOME>/skills.json` (`{name,match,regex,action,createdAt}`),
helpers `addSkill/listSkills/removeSkill/matchSkill`, CLI `aura skill add|list|remove` (`--match`, `--do`, `--regex`,
`$1` capture substitution), `route()` order = exact→fuzzy→**skill**→compute, plus an async **adapter** path via `ask()`
(one real free CoinLore `price` adapter, no key, degrades offline). **26/26 tests pass** (was 17). Zero new deps.

### (original Stage 2 spec, for reference)
The next AINL-style step, all **free / no AI cost**:
- Let a user/agent **define a named deterministic "skill" once** (a pattern → action) and have AURA
  run it forever with no LLM call. This is AURA's version of an AINL *compiled program*.
- Shape: a JSON registry (`~/.shaddai-aura/skills.json`) of `{ name, match (regex/template), action }`
  where `action` is a safe local op (template fill, a registered adapter call, or a cached answer).
- CLI: `aura skill add "<name>" --match "..." --do "..."`, `aura skill list`, and `route()` consults
  the registry before hitting the LLM.
- "Adapters" (AINL term): deterministic data fetchers (e.g. free price API) a skill can call instead
  of an LLM — wire 1–2 free public APIs as adapters.
- Acceptance: define a skill once, then identical/▷similar prompts resolve free forever; tests green.

## 📋 Stage 3 — EVENTUALLY: full framework (only if AURA becomes its own product)
Real AINL-parity / "or better" — large, multi-session, only on explicit go-ahead:
- A tiny **workflow compiler**: natural-language intent → a compact deterministic IR (AINL-like
  graph of ops) → executed by adapters with **no per-run inference**. (AINL's actual model.)
- **Adapter catalog** (price, web, email, social, on-chain) with allowlists + rate limits.
- **MCP server / agent-installable** (AINL installs into Claude Code/Cursor/etc. via one command) so
  any agent can call AURA-compiled programs. Consider an `npx @shaddai/aura mcp` entrypoint.
- Determinism/verifiability: snapshot tests per compiled program, semantic diff on change.
- Decision gates before starting: is this a SHADDAI feature or a separate OSS product? Budget for it?
  Licensing (AINL is Apache-2.0 — we apply *principles*, not its code).

## Why staged
Budget is $20/mo Claude Code only. Stage 1 already delivers the daily value (cheaper than calling a
model directly). Stage 2 deepens it for free. Stage 3 is a product bet, deferred until justified.
