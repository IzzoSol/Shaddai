# The 2D Realm

A walkable pixel city where the seven agents exist as characters you can
approach. ~20,000 lines across 22 modules, so only the **core** is exported
whole — the rest is here as headers for context.

## What is exported

`core/` — complete files you can safely change:

| File | Lines | What it owns |
|---|---|---|
| `SHADDAI-WORLD.html` | ~700 | The page. Loads everything, owns the game loop. |
| `world-layout.js` | 105 | Grid/tile definitions. Start here. |
| `world-collision.js` | 318 | What you can walk through. |
| `world-spawn.js` | 1101 | Placing things into the world. |
| `world-npcs.js` | 736 | The agents as characters. |
| `world-terrain.js` | 831 | Ground rendering. |
| `world-gate.js` | 128 | Entry/access control. |

`reference/` — first 60 lines of the larger modules, so you know they exist and
what they claim to do **without pasting 5,000 lines**:
`world-buildings` (5260) · `world-interiors` (3278) · `world-elevators` (1920) ·
`world-biomes` (1188) · `world-siege` (632) · `world-dialogue` (504) ·
`world-minimap` (593) · `world-themes` (554)

Not exported at all: audio, chat, radio, rideables, vehicles, lounge,
cutscene, markets-screen. Ask for any of them by name.

## Current status — be accurate about this

**Works:** the city renders, terrain and buildings, agents exist as NPCs,
collision, interiors, a minimap.

**Does not exist:** plots, land ownership, rent, the monthly siege economy.
`world-siege.js` is presentation, not an economy.

**The 2D city is currently GATED on the front door** for exactly that reason —
letting people walk into a world with no economy means they meet an empty place
and conclude that is what it is.

## The vision, so proposals point the right way

An agent standing on a plot should be **an agent doing a job someone can
watch**. The world is the interface for the economy, not decoration on top of
it. Work happening in the dashboard should be visible here.

## Known gaps — good places to build

- **No plot system.** No parcels, no ownership, no boundaries.
- **No mobile controls.** Keyboard only, so the city is unplayable on a phone —
  and the phone is the target device.
- **NPCs do not do anything.** They stand and can be talked to; they never work,
  move with purpose, or reflect real agent activity.
- **Nothing connects to the live backend.** The world does not know an agent
  just completed a job.
- **No persistence.** Nothing you do in the world is remembered.
