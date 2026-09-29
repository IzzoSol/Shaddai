# Riders, flying hoverboards and tricks (2026-09-28)

The goal: the agents ride things, and hoverboards fly and do tricks. Everything is built in code, at $0 fal.

![9 boards + ZEROX](img/hoverboards-v1.png)

## Files
| File | What |
|---|---|
| `public/world-hoverboards.js` (new) | `HoverboardKit`: 9 code-built board styles. `buildHoverboardFX`: a pooled particle trail. `HoverboardTricks`: the trick state machine. |
| `public/world-hoverboard.js` (upgraded, not duplicated) | The existing O-key board now uses a kit style by default and adds FLY, tricks, bails and trick events. The old GLB board is still available with `style:'glb'` or `modelUrl`. |
| `public/world-riders.js` (new) | `buildRiders`: a generic `mount(rider, vehicle, {seat})` with the procedural stance IK, vehicle adapters and AI companions. |
| `tools/tests/world-hoverboards.test.cjs` | 12 tests: tri budget, palette, hover tracking, fly caps, tricks, bails, FX, no allocation. |
| `tools/tests/world-riders.test.cjs` | 8 tests: seat/saddle/stand, the real dragon-ride core, the real `veh.bike`, ship companion, no allocation. |
| `tools/blender/hoverboards/*` | The node mesh export and the headless Blender preview sheet (`docs/img/hoverboards-v1.png`). |

## The 9 boards (`HoverboardKit.build(THREE, id, palette?)`, metres, +Z = nose)
The styles are inspired by the owner's WildStar sheet but are not copies:

| id | style | tris |
|---|---|---|
| `sunburst` | graffiti arrow, twin spike pods, ring intakes | 1084 |
| `hauler` | brass industrial, 4 armour pods | 688 |
| `redline` | red/white H-frame, 4 outrigger pods | 780 |
| `batwing` | black/purple scalloped wing, spiked fins | 572 |
| `checker` | lime twin-rail with checker deck | 688 |
| `ringfan` | orange deck, 4 cyan ring fans | 2056 |
| `bluejet` | blue twin-jet nacelles | 548 |
| `racer` | white/red F1 nose + rear wing | 1374 |
| `skullpunk` | purple punk, side cannons, skull emblem | 692 |

Every board is under 2.5k tris. Each board has:
- emissive `glow` and `trim` materials;
- exhaust (`back`) and hover-pad (`down`) nozzles, each with an additive flame cone;
- an additive underglow oval;
- a `stand` socket on the deck.

The palette keys are `deck`, `trim`, `accent`, `glow` and `metal`. Recolour a board with `userData.setPalette(p)`, or with `hover.setPalette(p)` on the host board. `userData.setThrust(k)` scales the flames.

## Hoverboard: fly + tricks (host `hover`, key O)
| Input | Ground | Air |
|---|---|---|
| W/S, mouse, A/D | throttle, steer, carve | A/D = **spin** (it completes itself to the next 180 when you let go) |
| Shift | boost | hold alone = **grab**. Shift+W / Shift+S = **front / back flip**. Shift+A / Shift+D = **varial**: the board spins under your feet. |
| Space | hop | hold for more than 0.22 s = **FLY**: climb at 7 m/s and drain stamina (about 5 s from full). Let go to **glide** at 1.6 m/s sink. |

**Limits.** The altitude cap is `flyMaxAltM` (45 m) above the surface, or `opts.flyCeilingY` if that is lower. Stamina stays within 0–1. It refills at 0.3/s while grounded. If it runs dry, you cannot climb again until it is back to 0.15.

**Landing check** (`HoverboardTricks.land`). A landing is clean only if all of these hold:
- the spin is within 30° of a multiple of 180;
- the flip is within 35° of a full turn;
- the varial is within 30° of 180;
- board tilt is 45° or less;
- you are not still in a full grab.

A 180 lands switch and then reverts on the ground. A **bail** keeps only 35% of your speed and gives a 0.7 s wobble.

**Score.** A spin is worth 100 per 180, and ×1.5 at 720 or more. A flip is worth 300 per turn. A varial is worth 120 per 180. A grab is worth 150, plus 200/s. The combo multiplier is the number of distinct tricks. Clean landings also add an airtime bonus.

**Events.** `hover.onTrick(fn)` calls `fn({name, kind, deg, score, clean, combo, total, air})` once per trick, then once more with a `'combo'` or `'bail'` summary. The host re-emits each event as `window` event `shaddai:trick` (detail = the event) and shows a toast.

**SKATE.** The SKATE hidden-RPS pack (`Shaddai-Arcade hall/packs/skate.js`, flip/air/grind counters) can map events by `kind`:
- `flip` → flip;
- `spin`, `varial` or `grab` → air.

Grind has no equivalent yet.

Tunables live in `hover.tune` (the fly and trick block) and `hover.tricks.tune`.

## Riders (`window.buildRiders` → `window.__riders`)
```js
riders.mount(rider, vehicle, { seat: 'seat'|'stand'|'saddle', socket: 'seat'|'seat2'|…, visible })
riders.sync(rider, on, vehicle, seat)       // edge-triggered + vehicle-aware (one line per vehicle per frame)
riders.update(dt)                           // after the vehicles have placed themselves
riders.setInput(rider, lean, crouch)        // lean −1..1 (right +), crouch 0..1
riders.spawnCompanion('ORACLE', vehicle, 'seat2')   // capsule placeholder → rigged GLB when it loads
```

**Vehicles.** A vehicle can be any of these:
- An Object3D with descendant sockets named `seat`, `seat2`, `stand` or `saddle` (see `riders.addSocket`). Optional limb targets go in `socket.userData.pegL/pegR/gripL/gripR`, and `lean` and `hipUpM` can be overridden there.
- A data vehicle from `riders.poseVehicle(src, {seats})`.
- One of the adapters: `bikeVehicle(gridBike, veh.bike.points, veh.bike)`, `dragonVehicle(dragonRide)` or `skyShipVehicle(shipState)`.
- Any object with `socket(name, outPos, outQuat)`.

**Stances** (`WorldRiders.STANCES`, metres in the socket frame):
- `seat`: hips on the seat, knees forward. Hands go on the grips, or on the knees when there are none. Speed makes the rider tuck.
- `saddle`: straddle with knees out and hands forward on the reins. Boost makes the rider tuck.
- `stand`: side-on surf stance with the left foot at the nose and arms out.

**Poses.** The limbs are solved on the rider's own bones by `WorldRiderPose` (world-actions.js: world-space aim plus two-bone IK, rig-agnostic). That makes one stance work on all 7 agents, including the 24-bone Meshy skeleton with its Armature at ×0.01.

**Clips.** If you pass `animLib: {clips, meta}` (from `/assets/anim/agent-clips.glb` + `.json`), companions get `buildAgentAnimator` (world-anim.js). They play the first stance clip that exists (`ride_sit`, `ride_saddle` or `ride_stand`, falling back to `Sit_Chair_Loop`), and the IK sits on top. The library has no `ride_*` clips yet. Once they are added they are picked up with no code change.

**Hoverboard.** The player's hoverboard stance stays in `world-hoverboard.js`, because it has the trick-aware grab IK. Riders use the `stand` stance on boards, for example a companion on `hover.board`.

## Host edits (`public/SHADDAI-WORLD-3D.html`, next to the existing hoverboard/bike/dragon wiring only)
1. **Script tags.** Added `world-hoverboards.js` before `world-hoverboard.js` (bumped to `?v=20260928a`), and `world-riders.js` after it.
2. **Riders built after the `buildWorldHoverboard` block.** This block does four things:
   - builds `_riders = window.__riders` with `loadCharacter: _pcPreload` and `cloneSkinned`;
   - calls `veh.bike.setAvatar(null)`, so riders owns the bike rider instead of bike.pose;
   - sets `window.__riderBike = _riders.bikeVehicle(gridBike, veh.bike.points, veh.bike)`;
   - registers the `hover.onTrick` handler, which dispatches the `shaddai:trick` event and a toast.
3. **Frame, right after `hover.pose(...)`.** Syncs the player with the bike (`seat`, visible in third person only) and with the dragon (`saddle`, via `dragonVehicle(window.__dragonRide)`), then calls `_riders.update(dt)`. The dragon block still writes the avatar to `saddle()` first, and riders then seats it properly.
4. **Sky traffic.** 20 s after `buildWorldSkyTraffic`, ORACLE and NEXUS spawn as companions on two ships. This reads the ship states through `__skyTraffic._debug.ships`, which is the only accessor that exists today.

## Needs a browser look
- **Hoverboard.** Check the O-board style and scale in the world, the flame and particle brightness under bloom, fly feel (climb rate, 45 m cap) and trick readability from the chase camera.
- **Dragon.** Check how high the rider sits. `saddle()` is `saddleUp·wingspan` above the dragon origin: before this change the avatar's *feet* were placed there, and now its *hips* are. If the rider sinks into the back or floats above it, tune `seats.saddle[1]` in `dragonVehicle`.
- **Bike.** The rider is now posed by riders instead of `veh.bike.pose`, using the same pegs and grips. Check mount/dismount blending and first-person hiding.
- **Ship companions.** The seat height comes from each ship's geometry bounds. Check that they sit on the hull and are visible at 60–140 m altitude, and check memory: two extra agent GLB clones.
