# Player Controller — kinematic capsule (ground, slopes, steps, jump, roll, climb)

`public/world-player-controller.js` · tests `tools/tests/player-controller.test.cjs` (`node tools/tests/player-controller.test.cjs`)

Owner brief: *"run on the terrain and get actual ground, not sitting models we walk through and our body halfway goes into the ground"* + *"real gameplay: rolling, jumping, ground compression"*.

## Why the body sank before (root cause in the host)

1. **Avatar drawn at the smoothed camera height.** `playerAvatar.position.set(playerPos.x, baseY, playerPos.z)` uses `baseY = _smoothBaseY`, which eases toward the ground at 16/s. Walking uphill, the eased value trails the real ground, so the feet sink into every rise. The fix is to put the **feet** at the exact ground and ease **only the camera**.
2. **One height sample under the centre.** A bump or curb under the front of the foot never lifted the body. The controller samples 5 points (centre plus 4 at 0.9 × radius). A sample lifts the feet only when it rises more steeply than a walkable slope from the centre. So a planar slope up to 42° keeps the feet exactly on `heightAt` (tested: 0.000 cm error on 30°), and a real bump or curb lifts the body onto it.
3. **No vertical physics.** There was no gravity, no airborne state and no landing, so nothing could fall, jump or land.

## API

```js
const ctl = window.buildPlayerController({
  THREE,                                         // optional, unused (pure math)
  heightAt: (x, z) => y,                         // units
  colliders: {                                   // units; functions called once per physics tick
    circles: () => [{ x, z, r, top?, bottom?, trigger? }],
    obbs:    () => [{ x, z, hx, hz, rot, top?, bottom?, trigger? }],
    query?:  (x, z, radius, outCircles, outObbs) => void,   // optional spatial-grid broadphase
  },
  waterHeightAt: (x, z) => surfaceY | null,      // optional → 'swim'
  tune: { run: 7.0 },                            // optional TUNE overrides (metres / seconds)
});
const o = ctl.step(dt, input, camYaw);
```

* `input = { fwd, back, left, right, sprint, jump, roll, crouch, walk?, x?, y? }`. The booleans are held-state. The controller detects press edges itself, so pass the raw key state. `x`/`y` (analog −1..1, from touch or a gamepad) override the four direction booleans. Magnitude under 0.5 means walk.
* `camYaw = Math.atan2(fwd.x, fwd.z)` is exactly the host's `_camYaw`. Forward is `(sin yaw, cos yaw)` and right is `fwd × up`, the same as the host's `right.crossVectors(fwd, camera.up)`.
* Returns (a reused object, so copy what you keep):

| field | meaning |
|---|---|
| `pos {x,y,z}` | physics **feet** position (units), the gameplay truth |
| `renderPos {x,y,z}` | pos interpolated between fixed ticks: **draw the avatar/camera here** |
| `vel {x,y,z}` | velocity, u/s (feed `hypot(vel.x, vel.z)` to `_updatePlayerLoco`) |
| `grounded` | feet on ground / platform top |
| `state` | `idle walk run sprint jumpStart airborne land roll slide climb swim` |
| `events[]` | this frame's events (see below) |
| `compression` | 0..1 landing/crouch squash (critically-damped spring), used for the camera dip |
| `speed01` | horizontal speed / sprint speed (blend weight) |
| `lean` | −1..1 bank into turns (+ = yaw increasing). Host: `rotation.z = -lean*0.12`; flip the sign if it banks outward |
| `facing` | movement/roll heading yaw (same convention as the host's `_avatarYaw`) |
| `stamina` | 0..1 sprint stamina |
| `iframes` | true during the roll's invulnerable window |
| `speed` / `speedMs` | horizontal speed in u/s / m/s |
| `swimming`, `ticks` | swim flag; fixed ticks run this frame (0 is normal at > 60 fps) |

Other methods:

* `setPos(x, y?, z)`: teleport. With `y` omitted it snaps to the ground. With `y` given it stays airborne if above the ground.
* `setVel(x, y, z)`, `setFacing(yaw)`, `getPos()`, `isGrounded()`, `getState()`, `reset()`.
* `retune(patch)`: changes TUNE live and recomputes the derived values.
* `ctl.TUNE` (live) and `ctl.U` (units per metre).

Static helpers: `buildPlayerController.worldColliders(window, {deckThickness, cellSize, refreshEvery})` (below), `.DEFAULT_TUNE`, `.U`.

**Scale law:** 1 m = 7/1.8 = 3.889 u. Every TUNE value is in metres/seconds. Every value in or out of `step` is in world units.

## TUNE (metres, seconds)

| key | default | notes |
|---|---|---|
| radius / height | 0.35 / 1.8 | capsule |
| footSampleK | 0.9 | foot samples at radius × K |
| gravity / terminalFall | 22 m/s² / 40 m/s | arcade gravity |
| maxSlopeDeg | 42 | steeper → `slide` (cannot be walked up) |
| stepUp | 0.45 | walk straight onto curbs/ledges up to this |
| snapDown | 0.45 | per substep: stick to downhill slopes, step off curbs without a hop |
| airStepReach | 0.05 | lip tolerance while rising |
| walk / run / sprint / crouch / swim | 3.2 / 6.5 / 9.5 / 1.8 / 2.5 m/s | default gait = `run`; `walk` via input.walk / analog |
| defaultGait | 'run' | set `'walk'` for walk-by-default |
| accelGround / decelGround | 30 / 40 m/s² | |
| airControl | 0.25 | fraction of ground accel in the air (never brakes momentum) |
| turnRate / leanGain | 12 rad/s / 0.35 | |
| staminaSeconds / staminaRegenDelay / staminaRegenSeconds / staminaResume | 8 / 1.5 / 4 / 0.2 | |
| jumpHeight | 1.35 | v0 = √(2·g·h) = 7.71 m/s |
| coyoteTime / jumpBuffer | 0.12 / 0.12 | |
| jumpCutMul | 0.45 | vy multiplier on early release |
| doubleJump / airJumps | false / 1 | |
| rollTime / rollSpeed / rollCooldown / rollIFrames / rollSlopeGain | 0.55 / 7 / 0.6 / 0.4 / 1 | roll keeps gaining speed downhill |
| landSoft / compressFull | 3 / 14 m/s | impact → compression 0..1 |
| compressFreq / compressDamp / crouchCompression | 14 rad/s / 0.9 / 0.35 | spring |
| hardLandSpeed / hardLandRecovery / hardLandSpeedMul | 12 m/s / 0.25 s / 0.35 | |
| landAnimTime | 0.18 | `land` state window |
| slideFriction | 2 m/s² | |
| climbMax / climbTime | 1.2 / 0.6 | ledge grab ≤ 1.2 m above the take-off ground |
| chestHeight / swimFeetDepth / swimAccel | 1.3 / 1.25 / 8 | swim when water − terrain > chest |
| maxSubstep / maxSubsteps | 0.25 m / 40 | anti-tunnelling |
| fixedDt / maxTicks / maxDt | 1/60 / 6 / 0.1 | fixed physics tick (0 = variable step) |

## Mechanics

* **Fixed timestep:** 60 Hz ticks from an accumulator, with `renderPos` interpolated between ticks. The result is identical at 30, 60 and 120 fps (tested bit-for-bit). Press edges are latched per frame, so a tap never falls between ticks.
* **Sub-stepping:** each tick moves at most 0.25 m per substep, horizontally and vertically. The penetration per substep is below the capsule radius, so push-out always resolves to the correct face, even for zero-thickness walls. If two colliders wedge the capsule in a corner, the substep is refused rather than accepted overlapping.
* **Ground:** `feet = max(h(centre), h(sample) − r·tan(maxSlope))` over samples within step reach, plus any reachable collider `top` (standing on the edge is allowed up to 0.6 r overhang).
* **Blocking:**
  * A foot sample higher than `stepUp` in the move direction is a wall.
  * Terrain steeper than 42° going uphill is a wall.
  * Blocked moves slide along the obstacle.
* **Walls:** circles and oriented boxes are pushed out along the closest-point normal, and the velocity into the wall is removed (slide). Colliders with `top ≤ feet + stepUp` are steps, not walls. With `bottom ≥ feet + height` they are overhead, so you walk under decks. `trigger:true` or `solid:false` colliders are ignored.
* **Depenetration:** every tick pushes the capsule out of anything it overlaps (spawn, teleport, or a collider that appeared).
* **Jump:** coyote time plus a jump buffer. The integration is exact for constant gravity (apex tested at 1.3500 m). Releasing early multiplies vy by 0.45.
* **Roll:** 7 m/s in the input direction, or along `facing` with no input. 0.55 s (3.85 m, tested), i-frames for 0.4 s, cooldown 0.6 s. Speed rises going downhill.
* **Landing:** impact = fall speed. Compression is `(impact − 3) / (14 − 3)` and springs back. Impact above 12 m/s gives `hardLand` plus 0.25 s at 35 % speed.
* **Ledge climb:** while airborne and pushing into a wall/terrain lip whose walkable top is ≤ 1.2 m above the take-off ground (and there is room on top), the body is scripted up and in over 0.6 s. Tall walls (tested at 2.5 m) never trigger it.
* **Swim:** water deeper than chest height gives `swim`: buoyant (feet 1.25 m under the surface), 2.5 m/s, walls still solid. On exit it snaps to the shore ground.

### Events (`o.events[i].type`)

`jump`, `doubleJump`, `leaveGround` (walked off an edge; coyote starts), `land {impact m/s, compression}`, `hardLand {impact}`, `roll {dirX, dirZ}`, `iframes {duration}`, `rollEnd`, `climb {height m, top u}`, `climbEnd`, `slideStart`, `slideEnd`, `swimStart`, `swimEnd`, `staminaEmpty`.

### Animation mapping (UAL2 clips, verified present in `public/assets/anims/ual2-dirs.json`)

| state / event | clip (`playPlayerOnce` key) | notes |
|---|---|---|
| idle / walk / run / sprint | host `_updatePlayerLoco(dt, speed)` | unchanged; sprint 9.5 m/s = 37 u/s saturates the run blend |
| `jump` / `doubleJump` | `ual_NinjaJump_Start` | timeScale 1.4 |
| `airborne` (loop) | `ual_NinjaJump_Idle_Loop` | re-fired whenever no one-shot is running |
| `land` (impact > 6 m/s) | `ual_NinjaJump_Land` | |
| `hardLand` | `ual_Hit_Knockback` | the recovery window matches |
| `roll` | `ual_Slide_Start` → `ual_Slide_Exit` | stand-in until a real roll clip exists |
| `slide` (loop) | `ual_Slide_Loop` | |
| `climb` | `ual_ClimbUp_1m` | timeScale ≈ clipDuration / 0.6 s |
| swim | (none yet) | loco blend at 2.5 m/s |
| crouch | (none yet) | camera dip only (compression 0.35) |

## Colliders: `buildPlayerController.worldColliders(window)`

This adapter reads the live world data. It rebuilds only when a source list changes length (or when you call `.invalidate()`), and it indexes everything in a uniform spatial grid (32 m cells) that the controller queries.

* `WORLD_LAYOUT.realmColliders`: circles `{x,z,r}` **and** rotated boxes `{x,z,hx,hz,rot}`. `rot` is the rotation about +Y, and the local x axis is `(cos rot, −sin rot)` in x/z (tested).
* `window.__hubColliders`: `{cx,cz,r}` bazaar stalls and the fountain (solid).
* `window.WORLD_WALKABLE_TOPS`: `[{type:'obb'|'circle', x,z, hx,hz,rot | r, top, kind}]`, where `top` is absolute Y in units.
  * A top matching a realm collider (same shape and position) gives that solid a `top`: its walls stay solid and you can stand on the roof. A roof ≤ 0.45 m is a step; ≤ 1.2 m is climbable.
  * A top with no matching solid (the canon `walkableTop` decks) becomes a **deck**, with `bottom = top − 0.6 m`: you walk on it **and** under it.

Canon scale (1686 boxes + 1686 tops + 800 circles): index build 3.2 ms once, then about **15 µs per frame** (it was 820 µs with a linear scan).

## Host integration (`public/SHADDAI-WORLD-3D.html`)

Each step names an exact anchor string. Vehicles (bike / hoverboard / `veh.mode`), interiors, elevator rides and the sky-dive keep their existing paths. The controller runs only when on foot outdoors.

**Keys:**

| key | action | notes |
|---|---|---|
| Space | jump | Hoverboard V2 reads Space only while riding, and world-actions' ollie only fires in `st.mode==='hoverboard'`, so there is no conflict |
| C | roll | The colosseum's C/X spectate handler only fires while its interior group is visible, and the controller is off in interiors |
| Z | crouch (hold) | Only Ctrl+Z is used, by world-editor |
| CapsLock | walk toggle | |
| Shift | sprint | unchanged |

Ctrl was avoided for roll/crouch because Ctrl+W closes the tab.

### 1. Script tag

Anchor `<script src="/world-collision.js?v=20260926obb"></script>`. Add after it:

```html
<script src="/world-player-controller.js?v=20260926a"></script>   <!-- kinematic capsule player (docs/PLAYER-CONTROLLER.md) -->
```

### 2. State vars

Anchor `let _swimming=false;   // SWIM LAW: true while floating on a water surface (slower move, no seafloor walking)`. Add after it:

```js
let _pctl = null, _pctlOut = null, _pctlOn = false, _pctlWasOn = false, _pctlDeckY = null, _walkToggle = false;
addEventListener('keydown', e=>{ if(e.code==='CapsLock' && !e.repeat) _walkToggle = !_walkToggle; });
```

### 3. Build it

Anchor `}catch(e){ console.warn('world-hoverboard init failed:', e && e.message); }`. Add after it:

```js
// PLAYER CONTROLLER — real ground, slopes, steps, walls, jump/roll/climb/land compression (docs/PLAYER-CONTROLLER.md)
try{
  if (window.buildPlayerController) {
    const _terrH = function(x,z){ return window.WORLD_HEIGHT_AT ? window.WORLD_HEIGHT_AT(x,z) : ((worldTerrain && worldTerrain.heightAt) ? worldTerrain.heightAt(x,z) : 0); };
    _pctl = window.buildPlayerController({
      THREE,
      heightAt: function(x,z){
        let h = _terrH(x,z);
        // elevator arrival deck under the player (world-elevators only exposes it at playerPos): honour it near the player
        if (_pctlDeckY != null && _pctlDeckY > h && Math.abs(x-playerPos.x) < 4 && Math.abs(z-playerPos.z) < 4) h = _pctlDeckY;
        // skybridge corridors (height-aware: only when the player is at bridge height)
        if (window.WORLD_BRIDGE_GROUNDY) { const b = window.WORLD_BRIDGE_GROUNDY(x, z, playerPos.y, 2.5); if (b !== null && b > h) h = b; }
        return h;
      },
      colliders: window.buildPlayerController.worldColliders(window),
      waterHeightAt: MAP_V4 ? function(x,z){ return _v4Water ? _v4Water.waterHeightAt(x,z) : null; }
                            : function(){ return 0.05; },   // legacy flat sea level
    });
  }
}catch(e){ console.warn('player controller init failed:', e && e.message); _pctl = null; }
```

### 4. Decide per frame whether the controller owns the body

Anchor `const _uiOpen = (_dialogue&&_dialogue.isOpen()) || (_radio&&_radio.isOpen&&_radio.isOpen());`. Add after it:

```js
_pctlOn = !!_pctl && !_spawnBusy && !bikeMode && !(veh.bike && veh.bike.isRiding()) && !(hover && hover.isRiding()) && !veh.mode
          && !(_interiors && _interiors.isInside()) && !(_elevators && _elevators.isRiding());
_pctlDeckY = (_pctlOn && _elevators && _elevators.groundY) ? _elevators.groundY() : null;
```

### 5. Replace the walking block

Anchor: the final `} else {` branch of the movement if/else. It starts with `      _moveDir.set(0,0,0);` and ends with `      playerPos.z += _vel.z * dt;\n    }`. The movement chain is `if (veh.bike && (bikeMode || veh.bike.isRiding())) { GRID BIKE V2 … } else if (hover && hover.isRiding()) { hover.step(…) … } else { legacy walk }`. Insert a new branch **between the hover branch and that final `} else {`**, so the bike and hoverboard branches keep priority and the legacy block stays as the fallback:

```js
    } else if (_pctlOn) {
      // re-snap on activation (left a vehicle / interior / lift) or when something else moved playerPos (edge clamp, teleport)
      { const _cp = _pctl.getPos();
        if (!_pctlWasOn) _pctl.setPos(playerPos.x, undefined, playerPos.z);
        else if (Math.abs(playerPos.x-_cp.x) + Math.abs(playerPos.z-_cp.z) > 1e-3) _pctl.setPos(playerPos.x, playerPos.y, playerPos.z); }
      _pctl.setFacing(_avatarYaw);                      // idle roll goes where the body faces
      _pctlOut = _pctl.step(dt, {
        fwd: !!(keys['KeyW']||keys['ArrowUp']), back: !!(keys['KeyS']||keys['ArrowDown']),
        left: !!(keys['KeyA']||keys['ArrowLeft']), right: !!(keys['KeyD']||keys['ArrowRight']),
        sprint: !!(keys['ShiftLeft']||keys['ShiftRight']), jump: !!keys['Space'],
        roll: !!keys['KeyC'], crouch: !!keys['KeyZ'], walk: _walkToggle }, _camYaw);
      playerPos.set(_pctlOut.pos.x, _pctlOut.pos.y, _pctlOut.pos.z);   // host keeps ownership of playerPos (y = feet)
      _vel.x = _pctlOut.vel.x; _vel.z = _pctlOut.vel.z;
      _onPctlEvents(_pctlOut.events);
```

In the **not-locked** else branch (anchor `    _vel.x *= Math.max(0, 1 - dt*12);   // no input / not locked: coast to a stop, don't freeze mid-stride`), add at its top so gravity and landing continue with the menu open:

```js
    if (_pctlOn && _pctlWasOn) { _pctlOut = _pctl.step(dt, {}, Math.atan2(fwd.x, fwd.z)); playerPos.set(_pctlOut.pos.x, _pctlOut.pos.y, _pctlOut.pos.z); _vel.x = _pctlOut.vel.x; _vel.z = _pctlOut.vel.z; }
```

At the end of the movement section (right before the anchor `  // place camera by view mode (1st person = eyes; 3rd person = pulled back behind the avatar)`) add `_pctlWasOn = _pctlOn;`.

### 6. Turn off the old per-frame fixes the controller replaces

* Mountain climb limit: in `if (_r > _MN.r0 - 10 && _r < _MN.r1 + 10 && worldTerrain && worldTerrain.heightAt && ...` prefix the condition with `!_pctlOn && `. The slope law (42° → slide) replaces it everywhere, not just in the mountain ring.
* Building collision: anchor `if (window.WORLD_RESOLVE_POS) window.WORLD_RESOLVE_POS(playerPos); else _resolveBuildingCollision();` becomes `if (!_pctlOn) { if (window.WORLD_RESOLVE_POS) window.WORLD_RESOLVE_POS(playerPos); else _resolveBuildingCollision(); }`. The controller consumes the same realmColliders (with the capsule radius instead of `PLAYER_BUF`). `WORLD_RESOLVE_POS` would also shove you **off roofs**, because it is 2D.
* Keep the world-edge clamp and the anti-fall deck clamp as they are. They move `playerPos`, and the resync in step 5 picks that up next frame with `y` preserved.

### 7. Ground/camera: feet exact, camera smooth, compression dip

Anchor `const _rawBaseY = (hover && hover.isRiding()) ? hover.rideBaseY() : veh.baseY(groundY);          // VEHICLE-HOOK: flight altitude when flying the craft, else ground`. Replace with:

```js
const _pctlActive = _pctlOn && !!_pctlOut;
if (_pctlActive) { groundY = _pctlOut.renderPos.y; _swimming = _pctlOut.swimming; }   // controller owns ground + swim
const _rawBaseY = _pctlActive ? _pctlOut.renderPos.y
                : ((hover && hover.isRiding()) ? hover.rideBaseY() : veh.baseY(groundY));          // VEHICLE-HOOK: flight altitude when flying the craft, else ground
const _pDip = _pctlActive ? _pctlOut.compression * 0.35 * V4_U : 0;   // landing / crouch camera dip (≤ 0.35 m)
const _feetY = _pctlActive ? _pctlOut.renderPos.y : null;             // exact feet for the avatar (never the eased camera height)
```

`_smoothBaseY` keeps easing (camera only). Then:

* Anchor `_camTarget.set(playerPos.x - fwd.x*(8*_PLAYER_EYE_K), baseY + eye + 2.2*_PLAYER_EYE_K, playerPos.z - fwd.z*(8*_PLAYER_EYE_K));` changes `baseY + eye` to `baseY - _pDip + eye`.
* Anchor `camera.position.set(playerPos.x, baseY + eye, playerPos.z);` (first person) becomes `camera.position.set(playerPos.x, baseY - _pDip + eye, playerPos.z);`.
* Anchor `playerAvatar.visible=!veh.mode; playerAvatar.position.set(playerPos.x,baseY,playerPos.z);` becomes:

  ```js
  playerAvatar.visible=!veh.mode;
  if (_feetY !== null) playerAvatar.position.set(_pctlOut.renderPos.x, _feetY, _pctlOut.renderPos.z); else playerAvatar.position.set(playerPos.x,baseY,playerPos.z);
  ```

  **This line is the "body halfway in the ground" fix.**
* In the boneless glide/bob block that follows (`if(!playerMixer && playerAvatar.visible){`), change each `playerAvatar.position.y = baseY + ...` to `playerAvatar.position.y = (_feetY !== null ? _feetY : baseY) + ...` (4 occurrences).
* Facing: anchor `{ const _yt=Math.atan2(fwd.x, fwd.z);   // ease facing toward the look direction (model faces -Z) — no snap-turn` becomes `{ const _yt=(_pctlActive && (_pctlOut.state==='roll'||_pctlOut.state==='climb')) ? _pctlOut.facing : Math.atan2(fwd.x, fwd.z);`. After `playerAvatar.rotation.y=_avatarYaw;` add `if (_pctlActive && playerMixer) playerAvatar.rotation.z = -_pctlOut.lean * 0.12;`.

### 8. Animation clips and events

Anchor (in `_setupPlayerRig`) `if(ok){ ['Idle_FoldArms_Loop','Sword_Regular_A','Sword_Regular_B','Sword_Heavy_Combo','Sword_Block','NinjaJump_Start','Hit_Knockback'].forEach(`. Extend the list with `'NinjaJump_Idle_Loop','NinjaJump_Land','Slide_Start','Slide_Loop','Slide_Exit','ClimbUp_1m'`.

Add this function next to `playPlayerOnce`:

```js
// PLAYER CONTROLLER events → one-shot clips (resolved by playPlayerOnce; no-op if the rig lacks them)
function _onPctlEvents(evs){
  for (let i=0;i<evs.length;i++){ const e=evs[i];
    if (e.type==='jump' || e.type==='doubleJump') playPlayerOnce('ual_NinjaJump_Start', {timeScale:1.4});
    else if (e.type==='hardLand') playPlayerOnce('ual_Hit_Knockback', {timeScale:1.3});
    else if (e.type==='land' && e.impact > 6 && e.impact <= 12) playPlayerOnce('ual_NinjaJump_Land', {timeScale:1.3});
    else if (e.type==='roll') playPlayerOnce('ual_Slide_Start', {timeScale:1.2});
    else if (e.type==='rollEnd') playPlayerOnce('ual_Slide_Exit', {timeScale:1.4});
    else if (e.type==='climb') { const a = playerClips['ual_ClimbUp_1m']; const d = a && a.getClip() ? a.getClip().duration : 0.6; playPlayerOnce('ual_ClimbUp_1m', {timeScale: d/0.6}); }
  }
}
```

Loops: anchor `    const _osw = _updatePlayerLoco(dt, _pSpdL);`. Insert before it:

```js
    if (_pctlOn && _pctlOut && clock.elapsedTime >= _pAttackUntil) {   // looped air / slide poses via the one-shot layer
      if (_pctlOut.state==='airborne') playPlayerOnce('ual_NinjaJump_Idle_Loop');
      else if (_pctlOut.state==='slide') playPlayerOnce('ual_Slide_Loop');
    }
```

The loco blend already takes `_pSpdL = hypot(_vel)`, which the controller writes. Swim uses the walk blend at 2.5 m/s.

### 9. Touch

If `_touchCtrl` drives a joystick, pass its vector as `input.x` (strafe) / `input.y` (forward) instead of the key booleans. A magnitude under 0.5 walks.

## Owner game-design repo patterns applied (`C:\Users\Brittany\shaddai-threejs-gamedev-master`, read-only)

| Source | Pattern | Applied as |
|---|---|---|
| `FLAT-LIBRARY/ecs-architecture/game-systems/physics-system.md` | "Fixed timestep" + accumulator, "deterministic", "large forces clip through geometry" | 60 Hz fixed tick with accumulator and spiral guard (`maxTicks`), render interpolation (`renderPos`), sub-stepping ≤ 0.25 m, determinism test |
| same, §4 Character Controller | grounded check + jump | replaced its `y ≤ 0.1` stub with 5-sample ground, coyote and buffer |
| `collision-system.md` | "Broadphase first / spatial grid, cell 2-3× object size", "handle trigger vs solid", simple shapes | per-frame radius broadphase, a 32 m uniform grid in `worldColliders().query`, `trigger`/`solid:false` skipped, circle + OBB only |
| `input-system.md` | action mapping, input buffering, normalised diagonals | edge latching per frame, jump buffer, normalised wish vector, analog `x/y` path for touch/gamepad |
| `camera-system.md` | smooth/damped follow, shake on impact | camera keeps its eased `_smoothBaseY`; compression dip; `hardLand` is the shake hook |
| `SKILLS-HUB/.claude/skills/threejs-animation/SKILL.md` | Spring physics, LoopOnce/fade one-shots, blending | compression is a critically damped spring; land/roll/climb via the host's LoopOnce + fadeIn `playPlayerOnce` over the weight-blended loco |
| `SKILLS-HUB/.claude/skills/threejs-physics/SKILL.md`, `physics-engines/rapier-wasm` (folder empty) | engine integration | not used: no npm/WASM on this laptop, and a kinematic controller is cheaper. The API (`step` / `setPos` / colliders in, pose out) is shaped so a Rapier `KinematicCharacterController` could replace the internals later |

`FLAT-LIBRARY/physics-engines/custom-collision/` and `cannon-js/` are empty folders.

## Tests (`node tools/tests/player-controller.test.cjs`): 33/33 pass

* **Ground and slopes**
  * Flat ground: feet == heightAt (error 0).
  * 30° slope up, down (at sprint) and across: max error 0.000 cm, 0 airborne frames.
  * 50° slope: slides (−4.49 m in 1 s) and cannot be run up (+0.09 m max).
* **Steps and walls**
  * Curb 0.4 m: steps up. Curb 0.6 m: blocks.
  * 1000 random sprint/roll/jump runs into random rotated OBBs (0.02–3 m) plus circles, at random dt from 20 to 144 fps (247k frames): centre never inside, worst capsule penetration 0.0000 mm.
* **Jump**
  * Apex 1.3500 m. A tap gives 0.80 m.
  * Coyote jump works after walking off a ledge. A buffered press fires on landing; a stale press does not.
* **Landing:** a 10 m fall gives impact 21.08 m/s, compression 1.0, `land` + `hardLand`, and springs back to 0 within 1 s.
* **Roll:** 3.850 m, i-frames event, cooldown blocks an immediate re-roll.
* **Tops and climb**
  * Walk onto a 0.4 m OBB top.
  * A 1.1 m box blocks walking; jumping into it climbs to exactly 1.1 m.
  * A 2.5 m wall is never climbed.
  * Walking off a 2 m platform goes airborne → land → run.
* **Stamina and swim**
  * Stamina empties at 8.00 s, then drops to run speed 6.50 m/s.
  * Swim: 2.50 m/s, feet 1.25 m under the surface.
* **Determinism and rotation**
  * Fixed timestep: identical trajectory at 30/60/120 fps.
  * `renderPos` interpolates.
  * Rotation convention local x = (cos rot, −sin rot) verified.
* **Adapter**
  * Roof top merged onto the matching realm box; stand-alone deck walkable on top **and** underneath; roof standing; hub stall solid.
* **Perf:** 150 colliders at about 8–60 µs per step (machine-load dependent); canon scale with the grid at about 15 µs per frame.

## Follow-ups (other files, not done here)

* **world-elevators.js:** publish arrival decks (`deckList`) and skybridges into `WORLD_WALKABLE_TOPS` (a circle deck `{type:'circle',x,z,r,top}` and bridge OBBs). The controller then handles deck edges natively, and the `_pctlDeckY` / `WORLD_BRIDGE_GROUNDY` closure in step 3 plus the anti-fall clamp can go.
* A real roll clip and a crouch pose. Slide_* stands in for now.
* Optional camera shake on `hardLand` (the camera-system.md pattern).
