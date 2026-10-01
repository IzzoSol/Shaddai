# Briefing cards

Seven cards, from a quick test to a multi-day production. Fill the brackets, paste the card to TURTLE (or any agent with a shell), and attach what the card asks for. Start low on the ladder; climb only when the card below is working.

| Card | Use it when | Needs from you |
|---|---|---|
| 1 Spark | testing the pipeline | nothing |
| 2 Product | you have a real product | URL |
| 3 Look | you want a specific style | a reference frame, clip, or folder |
| 4 Flow | you want one element to travel through a story | the list of screens/states |
| 5 Crew | a long, multi-session film | all of the above + budget |
| 6 Review | after any render | the rendered stills |
| 7 Retune | motion feels cheap | the code |

---

## 1 · Spark
```
Make a [SECONDS]-second motion piece that shows off what you can do. Give every shot a
different technique, put the strongest one first, use one accent colour, and build all
graphics from code. Include sound. No text pinned to corners.
```
This card proves the toolchain works. It carries no idea, so don't judge the idea by it.

## 2 · Product
```
Make a [SECONDS]-second film for [PRODUCT] at [URL], vertical first.

Gather: open the site, capture real screens, grab the true logo, colours and fonts into
./assets, and show me the inventory before animating.
Rule: animate the real interface. Never redraw it from memory.

Story, one idea per 2–4 seconds:
  1. The problem, in five words, set huge.
  2. The product assembling itself.
  3. Three capabilities, each a real action performed by a cursor.
  4. One proof number: [NUMBER].
  5. Logo and call to action: [CTA].

Sound: original, [BPM] BPM, made in code, hits on the beat.
Deliver 9:16, then 1:1 and 16:9 from the same timeline, re-laid-out rather than cropped.
Show a one-frame-per-beat contact sheet before the full render.
```
Keep one working session per brand: the renderer and sound tools are then already in place for the next piece.

## 3 · Look
Name a look, or show one. Show the model a frame and say what to take (palette, lettering, grain, rhythm) and what to leave (subject, logos, characters).
```
Reference: ./refs/ (clip, frames, or a folder of my work).

Step 1  Pull a frame every half second. Study them.
Step 2  Write docs/look.md — palette as hex, typefaces and weights, typical shot length,
        how scenes hand off, camera behaviour, surface texture, how words arrive and leave.
Step 3  Write docs/shots.md for a [SECONDS]-second piece about [SUBJECT] in that grammar.
Step 4  Stop. Show me both. No code until I approve.
```
Describe the look and the limits; let the model choose the technique.

## 4 · Flow
One shape that never cuts away: it changes size, corner radius and colour from state to state, a cursor triggers every change, and the ending matches the beginning so it loops.
```
Ask me for: the product, the 8–12 screens that tell its story, real data for each,
brand colours and fonts, one accent, a track near [BPM] BPM, output formats.

Direction: product film, one container for the whole piece. Quiet neutral background.
Tiny overshoot at most. No glow, no particle bursts, no idle time.

Beat map ([BPM] BPM, 8 bars, something changes every beat):
  [state] → [state] → … → back to the first state.

Rules: one HTML stage driven by __paint(t); springs from engine/kit.js (chase() for any
value with several targets); words enter a beat after their container starts moving and
leave a beat before the next change; final frame equals first frame, cursor included.

First: ask for the inputs, then show me the states laid on the beat grid. Then code.
```

## 5 · Crew
```
You are director, animator, sound designer and render engineer for a [LENGTH] film. This is
a multi-session production — don't hurry to the final render.

THE FILM IN ONE SENTENCE   [what the viewer feels at the end]
INPUTS                     ./refs (take grammar, never content) · ./audio/track.wav (unaltered)
CAPABILITIES               skills: [list] · keys in .env: [list] · budget: [amount], spend sparingly
LOOK                       [palette, lettering, texture, camera]. Forbidden: [list]
BEATS                      0:00–0:02 the single strongest image · then a new payoff every 3–5 s ·
                           the last frame leads into the first

GATES (don't skip)
  1  look.md + shots.md (frames, camera, words, sounds). Show me; proceed after 10 minutes of silence.
  2  stills for every shot → contact sheet → review.
  3  rough cut at 540p with placeholder sound. Fix pacing now, not later.
  4  full animation → polish → sound → final render.
  5  one writer-agent per chapter, all following docs/STYLE-GUIDE.md, which you write first.

REVIEW (every shot, three rounds minimum) — use card 6; log in docs/review-log.md.
DELIVER   out/reel.mp4 · out/loop-check.mp4 · out/poster.png · out/contact.png · README.md
```
For clips a video model does better than hand-written code (physics, characters), let the model generate base footage, then redraw it in code so the final picture is entirely your own layer.

## 6 · Review
```
Open out/contact.png, out/strip.png and out/phone.png. Look at them properly and judge as a
tough director, not the author.

Score each from 1 to 10: opening hook · legibility at phone size · quality of motion ·
variety · composition · fidelity to the brand · sound sync.
Name the three worst problems with timestamps. Check for: words colliding mid-swap, things
sliding rather than settling, corner labels or borders, dead beats, soft scaled text, a
jump at the loop seam.
Fix them, re-render only the affected seconds, show new sheets and new scores. Stop at 8+.
```

## 7 · Retune
```
Replace every hand-written easing curve with kit.js springs. Pick a feel per element:
crisp for controls, calm for cards and camera, heavy for big type and logos, jelly for mascots.
Any value that gets retargeted uses chase(). Type never overshoots.
```
