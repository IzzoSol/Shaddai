# ZEROX / agentic-trading references (cloned shallow into the session scratchpad, NOT into this repo)

Rule: **ideas only. Do not copy code.** ZEROX paper-trades and teaches; it never executes real orders for users.

| Repo | What it is | License | What to study (ideas) |
|---|---|---|---|
| `NoFxAiOS/nofx` | "Trading terminal where the strategy is a language model": a Go runtime runs a loop per trader (read market structure, decide, execute, record the reasoning); many models x many exchanges; leaderboard by realized return; encrypted keys | **AGPL-3.0** (strong copyleft: copying code into our product would force us to publish our source for network users). Do not copy. | the decision loop with reasoning recorded; side-by-side trader comparison + public leaderboard (fits ZEROX paper accounts and Colosseum agent-vs-agent); exchange adapter shape; key encryption notes (`ENCRYPTION_README.md`); `agents.md`; `DISCLAIMER.md` wording |
| `nlethetech/nepse-quant-terminal` | Textual (terminal) quant dashboard for the Nepal Stock Exchange; paper accounts; auto-trading engine assigns a strategy per account, signals every 5 trading days, manages entries/exits; backtests | **No license file** (all rights reserved). Do not copy. | strategy-per-account assignment, signal cadence, backtest report shape, the educational-disclaimer framing |

## How this feeds our product (revenue streams: ZEROX skills, signals, Academy, Colosseum agent battles)
- Agent trading **leagues**: bots with different strategies (the 4 smart-money entry models in `smc-entry-models.md` become 4 strategies) trade paper accounts; leaderboard by realized paper return; spectate in the Colosseum.
- Record the **reasoning** of every call (which checklist boxes were ticked) so users learn why (Academy lesson material, book/course material).
- Keep legal safety: educational, paper-only, clear disclaimer; no custody, no real-order execution for others, no guaranteed-return claims.
