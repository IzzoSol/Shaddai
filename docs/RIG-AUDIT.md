# RIG AUDIT — what needs Blender (owner can open it; keep to small per-asset files)

Status key: OK · FIX · MISSING. Update one line per asset after each audit. Process is in `docs/QA-PROCESS.md`.

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
