# SHADDAI Reel Forge

Make motion pieces from code — showreels, product films, UI-flow loops, story videos — on demand. TURTLE reaches this through the MCP (`shaddai_turtle_build`, or `gamedev_search` with source `motion-studio`).

## The idea
A model can't output a video file, but it can write a program that knows exactly what the picture looks like at any moment. Reel Forge keeps that program a pure function of time, then lets a headless browser step through time, save each frame, and hand the folder to ffmpeg. Same inputs, same pixels, every time — so any change is a small edit plus a re-render.

## What's inside
| Path | Purpose |
|---|---|
| `RULES.md` | Project rules the agent follows every session |
| `engine/kit.js` | Motion kit: feel-based springs, `chase()` for retargeted values, `stretch()`, `handoff()`, `cycle()`, seeded randomness, beat snapping |
| `engine/reel.html` | The stage: shots paint from local time; built-in motion blur by averaging sub-moments |
| `engine/forge.mjs` | Renderer: local server → numbered frames (resumable) → ffmpeg |
| `audio/grid.mjs` | Beat grid from a tempo (for music you make) |
| `audio/analyze.py` | Beat grid and accents measured from a supplied track |
| `audio/synth.mjs` | Code-made sound effects with six voices and a soft limiter |
| `briefs/cards.md` | Seven briefing cards, quick test to multi-day production |
| `skill/SKILL.md` | The whole pipeline as a reusable skill |

## Quick start
```
npm i -D playwright && npx playwright install chromium     # plus ffmpeg on your PATH
cp -r workflows/reel-forge my-reel && cd my-reel
node engine/forge.mjs --fps 30 --out out/reel.mp4          # renders the starter piece
```
Then paste a card from `briefs/cards.md` to your agent and let it replace the starter shots.

## Ladder
Spark → Product → Look → Flow → Crew. Add Review after every render, Retune when motion feels stiff.

## Quality gate
No piece ships until a Review round scores 8+ on all seven axes and the loop-check seam holds.

## Provenance
This system is SHADDAI's own design, written from first principles; see `NOTICE.md` for the ideas it is informed by and the third-party material kept separately in the library.
