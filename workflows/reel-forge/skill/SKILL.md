---
name: reel-forge
description: Produce a motion video rendered entirely from code — showreels, product launch films, UI-flow loops, story pieces. Use when someone asks for a launch video, product reel, animated explainer, motion ad, or code-made music video.
---

# Reel Forge

## Ask first
Product and URL · length · formats (9:16, 1:1, 16:9) · brand colours and fonts · a reference (frame, clip, or folder) · music (a file, or "make it").

## Steps
1. **Collect assets.** Visit the URL with a headless browser; save real screens, logo, colours and fonts to `./assets`; list them.
2. **Study the reference**, if there is one → `docs/look.md` (briefs/cards.md, card 3).
3. **Sound plan.** Made music: `node audio/grid.mjs --bpm N --bars M > grid.json`. Supplied track: `python audio/analyze.py track.wav > grid.json`.
4. **Shot list on the grid** → `docs/shots.md`. Show it and wait for approval.
5. **Build the stage.** Copy `engine/reel.html` and `engine/kit.js`; write shots that paint from local time only. Follow `RULES.md`.
6. **Review loop** (card 6) — at least three rounds, until every score is 8+.
7. **Render** `node engine/forge.mjs`, then cues → `node audio/synth.mjs cues.json out/sound.wav`, mux with ffmpeg, export every format.
8. **Deliver** the video, a contact sheet, a poster frame, and a note on what you'd improve next.

## Non-negotiables
- Real product screens only — never invented ones.
- Frames come from time alone: no random, no timers, no CSS transitions while rendering.
- Forbidden looks are listed in `RULES.md`; check every shot against them.

## Checks
```
ffmpeg -i out/reel.mp4 -vf "fps=2,scale=270:-1,tile=6x5" -frames:v 1 out/contact.png    # whole piece at a glance
ffmpeg -ss T -i out/reel.mp4 -vf "scale=320:-1,tile=12x1" -frames:v 1 out/strip.png     # a fast moment, frame by frame
ffmpeg -i out/reel.mp4 -vf "fps=1,scale=360:-1,tile=5x3" -frames:v 1 out/phone.png      # phone-size legibility
ffmpeg -stream_loop 1 -i out/reel.mp4 -c copy out/loop-check.mp4                         # does the loop seam hold?
```
Render the same short range twice with the same settings; the two files must hash identically.
