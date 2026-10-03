# Race mechanics: reference notes (owner shared 2026-10-02)

We study these for **mechanics ideas only**. No code, art, names or audio are copied: they are Nintendo-IP fan clones with no usable license, and our game must stay original and shippable.

| Reference | What it is | What we took (as ideas) |
|---|---|---|
| `super_mario_kart2-main` (browser three.js clone: kart.js, ai.js, items.js, track.js) | JS kart racer with 3 courses, 50/100/150cc, drift mini-turbos, items, AI | 3-tier drift charge (we already had it: 0.9/1.8/2.8 s -> x1.25/1.35/1.5), **difficulty classes with a rubber-band strength per level** (added: rookie / pro / elite), **post-hit invincibility** so shells cannot chain-stun (added: 1.2 s grace) |
| `arthurrfleck/mario-kart-simulator` | tiny text/score simulator | nothing useful beyond roster/score ideas |
| `sonicdcer/MarioKart64Recomp` | native PC static recompilation of the N64 game; needs the owner's own ROM, C++/native, derived from Nintendo code | **Not used and not cloned.** It cannot run in a browser, would need a ROM, and building on it would put Nintendo-derived code in our product. |

## Already in our game (independent design)
Rank-weighted item roll, seeker to 1st, drift with swerve-bleed, slipstream, track keeper (off-course reset + penalty, wrong-way), turbo pads, boost items, ward plate, Prime-only Blue Line, personal bests, Time Trial / Free Ride / Race modes.

## Added this pass
- `level: 'rookie' | 'pro' | 'elite'` (AI speed x0.88 / x1.0 / x1.1, rubber-band 0.12 / 0.08 / 0.05; no level = old behaviour). Buttons on the race select screen (races only).
- Hit grace: `TUNE.hitGraceS = 1.2` (also granted through a respawn freeze).

## Ideas still open (from the references)
Item-box animation + roulette sound, per-course item-weight tables, spin-out animation and recovery boost ("rocket start" exists), mirror/reverse cups, ghost replay of your personal best (store the run line), course select preview.
