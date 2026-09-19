# SHADDAI Arcade — Immersive Agentic Games

## Main Vision
- Shaddai Arcade is a **place** you enter (desktop: swivel/look; mobile: swipe‑look; 2D city: walk through the Arcade door).
- Clicking a **place** loads that **game**, not a bet slip.
- No casino language (“tables”, “pit”, “wager card”). Rename to **place, game, park, studio, court, drop‑in**.
- Two players per place: human | shaddai | grok | paybox; human vs human, human vs agent, human vs grok.
- Agents **play the beat**, they do not pick “who wins”.

## Places in the Hall (not “tables”)
- Football pitch (existing football game)
- Soccer pitch (existing soccer game)
- Blackjack room (existing blackjack game)
- Dodgeball court (existing dodgeball game)
- Skate park (Fal‑native)
- Studio / Room (Fal‑native artist session)
- **NO** basketball.

## Four Existing Games (keep as‑is)
- **Football**, **Soccer**, **Blackjack**, **Dodgeball**.
- Solo play unchanged without `vs` params.
- With `vs=1`: overlay shows 3 legal options at a real beat; agent mailbox picks an id; existing engine runs it; optional Lens clip.
- Beats + filmable moments listed per game (see spec).

## Build Order
1. **Hall** as a room you look around (swivel/pan). Two doors: Skate Park, Football. No betting grid.
2. **Skate** loop: pick trick → Fal clip of that trick → opponent seat goes. Grok seat on Skate returns a trick id.
3. **Studio** 3 buttons → clip of locked band (Nova/Patch/Volt/Sol).
4. **VS overlay** on blackjack → football → soccer → dodgeball.
5. Human vs human join code.
6. Agent vs Grok on Skate.
7. Sparks + PayBox buy Sparks only; escrow fields exist, unused.

## KEEP / KILL
**KEEP**: lens‑adapter spend/refund, real game files, Hall/swivel if started, original faces (Nova/Patch/Volt/Sol/Player/Gunner).  
**KILL** as home UX: arcade‑bet.js, agent‑name buttons, “table list”, wager cards as navigation.  
Never send raw text to Fal.

## Prompt Contract for Every Fal Call
```
SCENE_LOCK: room/field/park/booth — no logos, no extra people
CAST_LOCK: 1–2 original bodies, wardrobe frozen
EVENT: the verb only
LAW: no celebrities, no look‑at‑camera, no new characters
DURATION: 8–15s for clips
```

## What Went Wrong (for reference)
- `arcade-bet.js` is a fake product that shows agent names as buttons then calls `arcade-sim.js` RNG (coin‑flip). Delete or quarantine it.
- The engine was defined as wager + simulate instead of play + film.
- Lens wired to fake win/lose events instead of real moments.

## Success Criteria
I open Arcade and look around a **room**, not a casino menu. I enter Skate, pick **feeble**, watch a generated clip of my skater on the ledge, then a Grok bot answers with a **kickflip** clip. I can leave and play real football vs a human with 3 play‑call buttons. Nobody asked me to “pick which agent wins.”

---

**Build order that matches the vision**
1. Hall as a room (swivel or pan). Two doors: Skate, Football. No betting grid.
2. Skate: 3 buttons → resolve land/slam → Fal clip of your skater → other seat.
3. Grok seat on Skate (returns a trick id).
4. Studio 3 buttons → clip.
5. VS overlay on blackjack, then football, soccer, dodgeball.
6. Human vs human join code.
7. Agent vs Grok on Skate.
8. Sparks + PayBox buy Sparks only. Escrow fields exist, unused.