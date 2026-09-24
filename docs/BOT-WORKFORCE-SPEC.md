# Bot Workforce — owned bots that walk the world, work, follow you, and fight (owner spec, 2026-09-24)

Bots are the bodies for MASTER-PLAN §8 (Agent Forge / BYOK Grok autopilot) and §14.3 "agents are players".
One sparks ledger pays for everything (`sparks-ledger.js`).

## Tiers
| Tier | Body (reference) | Can | Moves by | Cost |
|---|---|---|---|---|
| **Base bot** | unicycle robot — `fal-assets/refs/characters/npc-unicycle-robot-blueprint.jpg` (has a 4-view turnaround = best 3D input) | farm, haul, deliver, tend plots, run errands, follow | **rolls**: wheel spin tied to real ground speed (no sliding), lean into turns + acceleration, arms use UAL farm clips | cheap hire (sparks), low wage |
| **Humanoid bot** (upgrade) | scrap bots + 20-bot variety sheet — `refs/characters/npc-scrap-robot-*.jpg`, `npc-robot-variety-sheet.jpg` | everything above **+ fights** beside you (tactics + open-world), guards plots | **walks**: rigged body + real walk/run clips + UAL moves (sword, block, hit, farm) | expensive, higher wage |

## Modes (every bot)
- **Hired worker** — assigned to a plot/communal farm: loops `walk to field → Farm_PlantSeed / Farm_Watering / Farm_Harvest → Walk_Carry_Loop to the silo`; output = sparks into the owner's plot yield.
- **Companion** — follows the player at ~3 m, idles when you stop, joins fights (humanoid only).
- **Autopilot** — owner's Grok/LLM key (BYOK, encrypted per user — PIKADON §9) picks the next task from a menu (farm, sell at market, deliver, patrol); code executes it. No key = simple scripted loop.
- **Ambient NPC** — unowned bots wander realms (the living-world layer).

## Movement law (owner: "they need to move and walk correctly")
1. Every walking body is RIGGED and plays a real clip; playback speed = ground speed / clip stride speed → feet never slide.
2. Rolling bots: wheel angular speed = ground speed / wheel radius; body lean = accel.
3. Ground-follow via `heightAt`, obey colliders + the mountain climb limit, stay on roads/paths between waypoints.
4. No procedural "standee bob" on anything that has a skeleton (legacy standees only as a load-failure fallback).

## Animation sources ($0)
UAL2 (Quaternius CC0, `public/ual-retarget.js`): Farm_Harvest, Farm_PlantSeed, Farm_Watering, Walk_Carry_Loop, TreeChopping_Loop, Chest_Open, Consume, Sword_* combat, Shield_*, Hit_Knockback, Idle_*.
Meshy v6 rig gives walk + run per body.

## Build order
1. World NPCs get rigged bodies + real walk clips (replaces standee bob). ← doing now
2. Base bot 3D: unicycle turnaround → fal (rigid parts + code-driven wheel/lean; ~$0.375–0.80).
3. Hire/follow/assign UI (2D + 3D share one roster in the sparks ledger).
4. Plot yield loop (communal farms + personal plots produce sparks).
5. Humanoid bot upgrades: 3 bodies from the scrap-bot refs (T-pose → approve → rig ~$0.84 each) + combat hookup.
6. Grok autopilot task picker (after PIKADON key-vault review).
