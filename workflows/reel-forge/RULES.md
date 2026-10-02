# Reel Forge — project rules

Copy this file into the root of any reel project; the agent reads it every session.

## How frames are made
- A reel is a function of time. `__paint(t)` must produce the identical image for the same `t`, always.
- Allowed: arithmetic on `t`, springs from `kit.js`, seeded randomness.
- Not allowed while rendering: CSS transitions, timers, animation callbacks, `Math.random`, anything that remembers the previous frame.
- Output is H.264, `yuv420p`, CRF 15, via `node engine/forge.mjs`.

## Taste
- Rejected by default: a centered title on a gradient; everything fading in together; text or boxes pinned to corners; glowing interface chrome; stock particle bursts.
- One display typeface, one interface typeface, one accent colour unless the brief says otherwise.
- Something new on screen every 2–4 seconds. The first two seconds must hold a viewer by themselves.

## Sound
- Make it in code (`audio/synth.mjs`) unless a track is supplied.
- Hits land on the beat grid (`audio/grid.mjs`, or `analyze.py` for a supplied track). Target about −14 LUFS.

## Before showing anything
1. Render one frame per beat as a contact sheet and look at it.
2. Score it (card 6). Fix the three worst problems. Repeat until every score is 8 or better.
3. Only then render the full piece.

## Effort
Light edits: low effort. New piece: high. A launch film whose first seconds must carry everything: maximum.

## Secrets and sources
Keys live in `.env`, never in prompts or committed files. From any reference, take the grammar (rhythm, scale, type behaviour) — never the content, characters or logos.
