# 17 · Seeing your game: visual review

Reading code tells you what a game *should* do. Looking at it tells you what it *does*. A visual review loop lets an agent (or you) run the game, look at real frames, and fix what is wrong without coding blind over and over.

## The tools (`vision/`)
| File | Does |
|---|---|
| `review.mjs` | Runs the game in headless Chromium, takes screenshots, records console output, failed requests, frame rate and optional draw calls; writes `contact.png`, `shot-NN.png`, `report.json`, `REPORT.md` |
| `analyze.mjs` | Turns the numbers into findings: what is wrong, the evidence, where to look |
| `compare.mjs` | Before/after: findings fixed or introduced, performance change, how much of each screenshot changed |
| `metrics.mjs`, `png.mjs` | Dependency-free image maths and PNG reading/writing |

Run the tests with `node vision/vision.test.mjs`.

## Running it
```bash
npx serve .                                            # or any static server
node vision/review.mjs --url http://localhost:3000 --seconds 8 --out reports/before
```
Make the game play itself with an actions file:
```json
[
  { "at": 1.0, "key": "ArrowRight", "hold": 0.6 },
  { "at": 2.5, "key": "Space" },
  { "at": 4.0, "click": [640, 360] }
]
```
Optional render stats — add one line to your game:
```js
window.__gameProbe = () => ({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
```

## What the automatic checks catch
Blank or flat frames · a picture that never changes (and whether inputs were sent) · over/under-exposure · very few colours · console errors and warnings · missing assets (404s) · low fps and frame spikes · too many draw calls or triangles.

## What only looking can catch
Composition, scale and proportion, whether the hero is readable, the mood of the lighting, UI overlap, visual hierarchy, and whether it feels like a place rather than a test scene. After reading the report, always open `contact.png` and judge it as a player would.

## Habits that make it work
1. **Look before you read.** Describe the screenshots in words first, then read the findings.
2. **One root cause per round.** Fix, re-capture, compare.
3. **Keep evidence.** Save the first and last runs and a short log of what changed.
4. **Test the experience, not only the first frame.** Use actions to reach the part of the game you changed.
5. **Check small screens too.** Run once with `--width 390 --height 844` for a phone-size view.

## Limits
Headless Chromium uses software rendering when no GPU is available, so measured frame rates are lower than on a real device; use them for relative changes (before vs after) rather than absolute targets.
