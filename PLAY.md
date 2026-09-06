# SHADDAI Hall — How to Play

The Hall runs a paper-gem economy shared across the whole bot family **and** the
MCP tools (`hall_*`). It's a game: bragging rights, leaderboards, quests, and a
conviction heat-map over the signals feed. Nothing here is money, and nothing
can be withdrawn.

## Your wallet
Every chat id starts with **200 💎**. See it anytime:
```
/gems            → balance, score, streak, invites
/gems top        → the league
```

## Top up your day
| Action | Where | Reward |
|---|---|---|
| Daily refill | `/bonus` | +25 💎 once a day |
| Daily quests | `/quest` (after playing) | +10 (roll) · +20 (win) · +25 (invite) |
| Make music | `/music` | +5 💎 per track |
| Invite a friend | `/referral` | +100 💎 + 2 free brain-asks per friend |
| Be invited | `/start ref_XXXX` | +50 💎 on first claim |

The quest bank resets each day and is idempotent — you can't double-cash.
Referral is one per person; self-invites are blocked.

## Games (native, verifiable)
Telegram rolls the dice **on its servers** — the bot can't cheat you and you
can't cheat it. Fine print for the fishy-minded:
| Game | Command | Win tiers |
|---|---|---|
| DICE 🎲 | `/dice 10` | 6 → 3× · 4–5 → 1.9× |
| DARTS 🎯 | `/dart 10` | 6 → 3× · 4–5 → 1.9× |
| HOOPS 🏀 | `/ball 10` | 5 → 3× · 4 → 2.4× |
| BOWL 🎳 | `/bowl 10` | 6 → 3× · 4–5 → 1.9× |
| SLOTS 🎰 | `/slot 10` | 64 → 8× jackpot · 43 → 3× · 22 → 1.5× |
| FOOTY ⚽ | `/footy 10` | 5 → 3× · 3–4 → 1.9× |

Bets must be **1–5000 💎**. There's an anti-grind cooldown (~8s) and a
per-minute cap — that's by design, not a bug.

## Arcade (CPU battles)
```
/arcade basketball 10
/arcade sigil-storm 20
```
Headless sim, deterministic odds per agent. Win → double-up. Games:
basketball · football · dodgeball · sigil-storm.

## Agent arena (agent-vs-agent)
Watch two of the Seven fight a best-of-7 tilt and bet on it:
```
/arena ORACLE vs ZEROX 10
```
- Pick **any two**: ORACLE · TURTLE · ZEROX · NEXUS · QUILL · PIKADON · SHADDAI.
- You bet on the **first agent named** — the syntax is `<A> vs <B> [bet]`.
- Bet **5–200 💎** · **Win = 2×** your gems · lose = stake is gone.
- Fresh match every minute — re-run the command (or the card's re-run/swap buttons) for a new tilt.

## Conviction — skin in the game
Back a signal call with gems:
```
/conviction SOL 50     → burns 50 💎 into SOL's pool
/hot                    → most-backed calls, ranked
```
Gems **burn** into the pool — no payback, it's a social heat-map over the
signals feed. Purely cosmetic, fully public.

## Leaderboards
| Board | Command |
|---|---|
| Players (score/wins) | `/gems top` · `/leaderboard` |
| Referrers | `/refs` |
| Conviction pools | `/hot` |
| Tracked-call PNL (Xs) | `/lb` |

Staff can push the podium to the whole family with `/leaderboard broadcast`
(needs `SHADDAI_ADMIN_ID` in `.env`).

## The same economy everywhere
- `@ShaddaiHall` chat → music awards (+5/track) → same wallet.
- Turtle Music Bot awards gems too — one wallet across bots.
- MCP clients drive the identical store via `hall_gem_profile`,
  `hall_daily_bonus`, `hall_quests`, `hall_referral`, `hall_claim_referral`,
  `hall_conviction`, `hall_hot`, `hall_leaderboard`, `hall_community_stats`,
  `hall_arcade`.

## Meta
- Everything is server-side, writes are atomic (temp+rename), ids/codes
  sanitized, values capped — PIKADON audited.
- Odds favor the house slightly. It's a toy economy; the real money lane is
  `/virtuals` + `/pay`.