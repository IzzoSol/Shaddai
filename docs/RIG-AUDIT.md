# RIG AUDIT — what needs Blender (owner can open it; keep to small per-asset files)

Status key: OK · FIX · MISSING. Update one line per asset after each audit. Process is in `docs/QA-PROCESS.md`.

## CORRECTION 2026-10-03 (measured with Blender + the clip library)
- The shared clip library `public/assets/anim/agent-clips.glb` already has **75 clips** (Universal Animation Library 1 + 2, CC0), retargeted onto the agents' 24-bone skeleton by `tools/ual/bake-ual.mjs`: Roll, Backflip, Flying_Fist_Kick, Lunge_Roundhouse_Kick, Double_kick_forward, Kung_Fu_Punch, Left_Jab_from_Guard, Melee_Hook(+Rec), Sword_Regular_A/B/C(+Rec), Sword_Heavy_Combo, Sword_Block, Sword_Dash, Shield_Dash/OneShot, Hit_Knockback, Sit_Chair_Loop, Slide_*, NinjaJump_*, ClimbUp_1m, OverhandThrow, Farm_*, Chest_Open, Consume, TreeChopping_Loop, Walk_Carry_Loop, dances, and more. The earlier "only idle/run/walk" finding was about the clips embedded in each agent GLB, not the shared library.
- **Still missing** from the shared library: death, directional hit reactions (only Hit_Knockback), swim/tread, crouch walk, spell cast, fishing cast/reel, mount/dismount, car/boat sit (procedural IK exists), friend-bot emotes (wave, gift). UAL2 also has a Zombie set (Zombie_Idle_Loop, Zombie_Scratch, Zombie_Walk_Fwd_Loop) not yet baked: ideal for skeleton/zombie enemies.
- Agent GLBs are 31k-52k polygons each (24 bones): LOD or decimated variants are the main FPS lever for characters.
- Tools: `tools/blender/audit-rigs.py`, `tools/blender/list-fbx-clips.py` (run through `tools/blender/bl.cjs`).

## Shared humanoid skeleton (every agent, Forge character and bot reuses it)
| Clip / need | Status | Notes |
|---|---|---|
| idle, walk, run, jump, land | OK (retarget across rigs) | verify on every new rig |
| dodge-roll, side-step, back-step | MISSING | i-frames driven by code, needs the pose |
| light attack, heavy attack, kick, charged power move | MISSING / thin | per weapon class later |
| hit reaction (front/back/left/right), stagger, knockdown, get-up | MISSING | hit markers already exist (world-hitfx) |
| sit (chair), sit (car seat), sit (boat) | PARTIAL | procedural IK stances exist (world-riders seat/saddle/stand); a real sit clip looks better |
| stair climb / descend | MISSING | stairs are now walkable in interiors |
| swim, tread water, dive | PARTIAL | check with boats/subs |
| fishing cast / wait / reel / catch | MISSING | needed for fishing |
| mount / dismount (board, car, beast, dragon) | MISSING | currently teleport-snap |
| emotes (wave, gift, talk) for friend bots | MISSING | |

## Mounts and vehicles
| Asset | Status | Needs |
|---|---|---|
| Bull, Gorilla, Mammoth | PARTIAL | static GLB + idle/walk/run; add `saddle` socket, banking, rear/stomp, hit reaction, boost |
| Hawk | PARTIAL | fly/glide clips; add saddle socket, bank, dive, flap rate by speed |
| Dragons x5 (siege) | MISSING | fly, hover, bite, tail sweep, breath, hurt, death; wing rig; drops on death |
| Tamed dragons | MISSING | rideable seat + same set |
| Hover cars (11 designs, code-built) | OK visually, no pivots | nacelle spin, doors/canopy, suspension bob; seat socket exists at ~y1.22 |
| Hoverboard kit (10 styles, code-built) | OK | foot IK works; add real board GLBs only if we want hand-made art |
| Skiff, boats, submarines | CODE ONLY | hull roll/pitch on waves, wake points, propeller/prop wash, dive pose, hatch |
| Bots (10): 5 wheeled, 5 humanoid | MISSING / to audit | wheel spin + lean; humanoid bots use the shared skeleton |

## Characters
| Asset | Status | Notes |
|---|---|---|
| 7 council agents | audit | bind pose, weights at shoulders/knees, GLBs ~9 MB total (lazy-load candidate) |
| Forge characters | audit | rig fully, LOD ~8k tris |
| Citizens / crowd | OK (instanced) | |
| Skeleton, wolf, goblin, castle enemies | MISSING | walk/attack/hurt/death; skeleton homes in the castle valley |

## World rigs
| Asset | Status | Needs |
|---|---|---|
| Castle doors / gates / bridge | MISSING | real openable doors, drawbridge, portcullis |
| Building entry doors (all realms) | PARTIAL | door cones exist; modelled doors with open anim wanted |
| Elevators / lifts | PARTIAL | verify collision |

## Audit order for the Blender session
1. Shared humanoid: combat + dodge + hit reactions + sit + mount clips (reused everywhere, biggest win).
2. Mount sockets and gait: bull, gorilla, mammoth, hawk.
3. Dragons (needed for Siege Day).
4. Boat and sub hulls, car pivots.
5. Doors, castle gates, enemies.
Export small GLBs, run the loader tests, then take a QA shot of each asset on its ride (`node tools/_qa.cjs`).
