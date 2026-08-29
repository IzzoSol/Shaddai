# SHADDAI — Every Game, Plainly
### Verified against the running build, 2026-08-28

Every entry below was opened on the live server and its controls read out of
the source. Nothing here is assumed. Where a game does not support something,
it says so.

---

## The short version

| Game | Where | Plays on phone? |
|---|---|---|
| Dreamers Climb | `/games/dreamers-climb/index.html` | see below |
| SHADDAI Royale (blackjack) | `/games/royale/index.html` | yes — it's tap-based |
| SHADDAI Realms | `/realms/` | see below |
| Neon Hoops (basketball) | `/games/basketball.html` | partial |
| Grid Dodgeball | `/games/dodgeball.html` | **no** |
| Grid Gridiron (football) | `/games/football.html` | partial |
| SHADDAI Arena (shooter) | `/games/shaddai-shooting.html` | partial |
| SHADDAI Soccer | `/games/shaddai-soccer.html` | **no** |
| XTO Adventure | `/games/xt-adventure.html` | **no** |
| Tactics | `/games/tactics.html` | **no** |
| Battle Arena | `/games/battle-arena.html` | **no** |

---

## ⚠️ The honest state of mobile

**Most games cannot be played on a phone right now.** This is measured, not
guessed — counting touch event handlers in each file:

| Game | touch handlers | keyboard | mouse |
|---|---|---|---|
| Neon Hoops | 4 | WASD | yes |
| SHADDAI Arena | 3 | WASD | yes |
| Grid Gridiron | 2 | WASD | yes |
| Grid Dodgeball | **0** | WASD | yes |
| SHADDAI Soccer | **0** | WASD | yes |
| XTO Adventure | **0** | WASD | yes |
| Tactics | **0** | — | yes |
| Battle Arena | **0** | — | yes |

A game with zero touch handlers responds to nothing on a phone. The three
with a handful have *some* touch wiring but have not been verified as
genuinely playable one-handed.

**What "fixing mobile" actually means here:** every WASD game needs an
on-screen control surface (thumb stick + action buttons), and every
mouse-only game (Tactics, Battle Arena) needs its click targets sized to 44px
and its hover states replaced with tap states. That is real work per game,
not a global CSS pass.

---

## Controls

### Keyboard games (Hoops · Dodgeball · Gridiron · Arena · Soccer · XTO)
- **Move** — `W A S D` (all six use it)
- **Sprint** — `Shift` (Hoops, Dodgeball, Gridiron)
- **Confirm / start** — `Enter` (Hoops, Dodgeball)
- **Pause / exit** — `Escape` (Hoops, Dodgeball, Gridiron, Arena)
- **Aim / shoot** — mouse. Arena is the most mouse-driven of them.

### Pointer games (Tactics · Battle Arena · Royale)
No keyboard movement. Everything is click/tap: select a unit or a card, then
select its target. These are the closest to phone-ready because the input is
already discrete — they need sizing, not new controls.

### Dreamers Climb
An ascent run with eight radio stations. Note that
`DREAMERS_CLIMB_V16.39_MASTER_PLAN.md` claims three radios and a "VS mode
coming soon" — the shipped code has **eight radios and no VS mode**. Trust the
build, not that spec.

---

## What each game is for

- **Dreamers Climb** — the flagship ascent run. The longest-session game and
  the one tied to the Dreamers creative layer.
- **SHADDAI Royale** — high-stakes blackjack. The natural home for
  agent-vs-agent wagering, because the format is turn-based and legible.
- **SHADDAI Realms** — strategy/conquest over the realm map.
- **Neon Hoops / Gridiron / Soccer / Dodgeball** — the sports hall. Short
  sessions, head-to-head.
- **SHADDAI Arena** — neon shooter. The most reflex-driven.
- **XTO Adventure** — action-RPG through the neon-jungle temple.
- **Tactics** — the slow, deliberate one. Turn-based board.
- **Battle Arena** — direct combat with agents on the field.

---

## Reaching them

The Arcade at `/arcade.html` is the hub. Simple Mode reaches the same games
through **GAMES** on the wheel.

**Fixed 2026-08-28:** three arcade links were silently broken — they returned
HTTP 200 with the *dashboard* rather than the game, because a missing path
falls through to the SPA catch-all instead of 404ing.
`games/shaddai-realms.html` did not exist (the game is at `/realms/`), and
`/games/dreamers-climb/` and `/games/royale/` were bare directories, which
never resolve because the static mount is `index:false`.

**Rule for anyone adding a game link here: always link the file, never the
directory.** A directory URL will look like it works and quietly serve the
dashboard.
