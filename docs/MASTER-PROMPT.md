# SHADDAI MASTER PROMPT — the north star (read first every session)

**What this is:** a fun, beautiful, agentic WORLD where people and AI agents live, learn, play, build and trade together. Web2 + blockchain. Real commerce, real learning, co-creation. It must look AMAZING, feel FUN in the first minute, and keep people coming back.

**Why it wins even if copied:** the value is the whole loop, not one feature: the world + the Academy (agents and people learn skills) + the Forge (create) + plots/founders/NFTs (ownership) + clans/siege days (community) + agents that work and play alongside you + tools people already use (video clipper, MCP, voice agents). A copycat gets a skin; we own the economy, the content, the community and the tooling. Stay modular so each piece can also be sold on its own.

## Quality rules (never negotiable)
1. **Fun first.** Every session ends with the game more fun to play than it started. Hover flight, combat feel, racing and exploration are the heart.
2. **Looks amazing, less clutter.** Districts, palettes, lighting, readable streets. No samey boxes, no janky overlaps, no half-built props.
3. **Works, then ships.** Pure rules get node tests; wiring gets a syntax check + full suite; nothing is called done unless it is wired and verified. Say plainly what is unverified.
4. **Scalable by construction.** One data table per concept (districts, recipes, hazards, quests, items), reused by every realm and by future layers (underground, sea, sky). No hard-coded one-offs.
5. **Lean on tokens and machine.** Small direct edits, one heavy job at a time (laptop = 8 GB), never delete without asking, no visible-browser spam, push often.
6. **Remember everything the owner says.** `docs/GAMEPLAY-EXPANSION-20261002.md` is the live checklist; update it each pass.

## Vision pillars (the checklist keeps them all)
World feel (terrain blending, homes/villages per realm, streets, interiors, steps, doors, sitting) · Movement + rigging (walk/dodge/kick/power moves, hoverboard fun, cars float + seated riders) · Combat (hit markers, differences per ride, passive/fight, Void forces fight, dragons, siege) · Progression (Academy, scrolls, upgrade shop, crafting, taming, hazards + gear) · Social (clans, friend bots + gifts, community halls, events) · Modes (races, hoverskate park, Colosseum dynamic terrain + spectating, agent-vs-agent in real 3D with autopilot vs full-control) · Platforms (mobile later, then controller, first person, VR) · Commerce (Navi terminal, PayBox, markets, signals, X) · Creator economy.

## Revenue streams to keep alive in every design (do not build around only one)
Subscriptions (Pro/Max/Founder) · NFTs: founder passes, plots, cosmetics (utility-first; get legal review, see `docs/FOUNDER-PASS-DRAFT.md`) · Marketplace cuts (agents, items, scrolls, skills) · Academy courses and certifications · Video clipper, MCP tools, API/skill licensing · VTuber / character licensing and content creation · Websites, videos, movies, books, social media management, voice-agent services built from the same agents · Siege/event passes and cosmetics · Books/courses/templates from the build journey itself (`docs/JOURNEY-LOG.md`).

## How to work a pass (the loop)
1. Re-read this file + the checklist. Pick the highest-impact, easiest-first item that serves fun/look/clutter/retention.
2. Audit with data first (plan JSON, node probes), then run the visual gate in `docs/QA-PROCESS.md` (screenshots + baseline compare) whenever free RAM allows. Owner wants screenshots and review; never skip the gate on visual work.
3. Build the pure rules + test, then wire into the host page, then run all tests.
4. Commit explicit paths, push `feat/world3d`, `main` (plumbing helper), beta. 
5. Append a short entry to `docs/JOURNEY-LOG.md` (what worked, what broke, the reusable trick).
6. Report: built / wired / verified / not verified / next.

Visual review is mandatory: see `docs/QA-PROCESS.md` (`node tools/_qa.cjs run|compare|bless`).

## Current build order (easiest to hardest)
Clutter + districts (started) → interiors by building role, stairs, doors → wire taming/crafting/hazard gear UI → hover feel + park/track polish → Colosseum dynamic terrain + seating → castle realm (valley, purple lava, siege day) → fish/grass/house items, villages, friend bots → bots in real 3D (autopilot / full control) → mobile → Navi/PayBox/signals/X → controller, first person, VR.
