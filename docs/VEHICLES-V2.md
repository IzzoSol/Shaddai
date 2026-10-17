# Vehicles V2 — Grid Bike fix + Hoverboard (2026-09-26)

Owner feedback: *"notice the bike riding and the models not right"*, *"fix the bike stuff and add the hoverboard stuff"*.
The screenshots showed the rider T-posed and standing over the bike.

## What was wrong
| Symptom | Cause |
|---|---|
| Rider T-posed / standing over the bike | The host only raised the avatar by `+0.6` and played `Idle`. Bodies with no usable idle clip, or none at all, stay in their bind pose (a T-pose). No sitting pose existed. |
| Bike looked like a toy | `gridBike` is about 3.95 units long, roughly **1.0 m**. The characters are 7 units (1.8 m) tall. |
| Bike glued to the camera, flat on hills | `rotation.y = eased camera yaw`, `y = groundY`. There was no pitch, roll, bank or real speed model: speed was the walk velocity × 36. |
| Light trail buried in or floating off hills | The trail was pushed at a fixed `y = 0.35`. |

## What changed (files owned by this task)
* **`public/world-actions.js`**. Only additions; the old code is unchanged.
  * `window.WorldRiderPose`: a procedural rider pose that works on any rig. It finds the bones by name *kind* and decides left/right from their **position**, not their name. It then solves the pose in **world space**: it aims the spine and neck, and uses analytic **two-bone IK** to put the hands on the grips and the feet on the pegs. Because of this, the same code fits Mixamo, Meshy, Bip01 and `.L/.R` rigs, T-pose or A-pose.
  * Blending: if the mixer drives a bone, the blend starts from the mixer pose. Otherwise it starts from the rest pose captured at bind. This means mount and dismount never flash a T-pose. When the rider has fully faded out, the bones are handed back **once**.
  * `veh.bike` (`veh.bikeRide` is an alias of `veh.bike.step`):
    * Scales the host's `gridBike` to **2.4 m** and adds a seat pad and handlebar.
    * Real throttle, brake, reverse and coast model. Aero drag makes speed taper toward the top speed. Slopes add or remove speed. A parking brake stops the bike creeping downhill.
    * Steering: the heading **chases the camera yaw** (the mouse steers) with a turn-rate limit that depends on speed. A/D add a carve offset.
    * Terrain **pitch** comes from front and rear wheel samples. A small **camber roll** comes from left and right samples. **Bank** is `atan(v·yawRate/g)`, clamped to 34°.
    * The bike slides along `WORLD_LAYOUT.realmColliders` circles and loses speed in proportion to the impact angle. The host's `WORLD_RESOLVE_POS` still runs afterwards for building walls.
    * Mount and dismount take 0.35 s each. On dismount the rider steps off to the left and the bike stays **parked** where you left it. The next mount summons it under you.
    * Over the sea the bike skims the surface. On decks, lifts and interiors (`flat`) it uses the host's `groundY`.
* **`public/world-hoverboard.js`** (new). `window.buildWorldHoverboard(opts)`:
  * Loads `public/assets/models/fal/veh-hoverboard-v2.glb`. The model is normalised: its longest horizontal axis becomes +Z, its length is set to **1.6 m** and it sits on y=0. If the file fails to load, a procedural board is used.
  * The hover is a spring-damper **0.45 m** above terrain **or water** (`max(terrain, water)`), with a gentle bob.
  * A/D and turns make the board carve, rolling up to **25°**. It pitches with the slope, and a jump gives a hop of about 0.7 m.
  * Speed: 14 m/s cruise, 20 m/s with boost (Shift).
  * Collisions: the board slides on the collider circles and also calls `WORLD_RESOLVE_POS` and clamps at the world edge.
  * Under-thrust: an additive emissive oval disc. The PointLight is **off by default** (`tune.light`) for performance.
  * A short additive **light-trail ribbon** of 36 samples, subtle at 0.55 intensity. It is hidden when the board is slow or parked.
  * **Surf stance**: the body faces the board's right side and the feet sit along the deck with the left foot at the nose. Knees are bent by IK and the root drops 0.2 m. The arms are out along the board axis and the head looks down the line of travel. A body with no skeleton is simply placed on the deck.

## Tunables
**Bike** is `veh.bike.tune`, the `BIKE_TUNE` object in world-actions.js. Units are metres and seconds.
* **Size and speed:** `lengthM 2.4`, `topMS 25`, `accelMS2 8`, `brakeMS2 14`, `reverseMS 4`, `coastMS2 1.4`, `dragK 0.004`, `slopeGravity 0.6`.
* **Steering:** `steerGain 4.5`, `steerOffset 0.55`, `turnRateLow 2.6`, `turnRateHigh 1.15`, `pivotMin 0.35`.
* **Lean and pose:** `bankMaxDeg 34`, `terrainRollK 0.3`, `poseSmooth 10`, `leanDeg 42`.
* **Collision and mounting:** `radiusM 0.55`, `impactLoss 0.75`, `mountTime 0.35`, `dismountSideM 0.9`.
* **Contact points:** `veh.bike.points` holds the seat, grips and pegs in the gridBike's own unscaled coordinates.

The world is only about 195 m across (the edge is at ±374 units), so 25 m/s crosses it in about 8 s. If that feels too fast, set `topMS` to 16–18.

**Hoverboard** is `hover.tune`, the `TUNE` object in world-hoverboard.js.
* **Size and hover:** `lengthM 1.6`, `hoverM 0.45`, `bobM 0.035`, `springK 55`, `damping 0.55`.
* **Speed:** `topMS 14`, `boostMS 20`, `accelMS2 6`, `boostAccelMS2 9`, `brakeMS2 10`, `reverseMS 3`, `coastMS2 1.2`, `dragK 0.012`, `slopeGravity 0.35`.
* **Steering and lean:** `steerGain 5`, `carveOffset 0.5`, `turnRateLow 3.0`, `turnRateHigh 1.6`, `rollMaxDeg 25`, `poseSmooth 9`.
* **Jump:** `hopMS 5.2`, `gravityK 1.6`.
* **Collision and mounting:** `radiusM 0.45`, `impactLoss 0.7`, `mountTime 0.3`.
* **Stance:** `crouchM 0.2`, `stanceM 0.62`.
* **Trail:** `trailLen 36`, `trailWidthM 0.16`, `trailColor 0x00ff9c`, `trailIntensity 0.55`.
* **Lights:** `light false`.

## Controls
| Key | Bike (B) | Hoverboard (**O**) |
|---|---|---|
| Mount / dismount | **B** (unchanged) | **O** (new) |
| W / S | throttle / brake, then reverse | throttle / brake, then drift back |
| Mouse | steer (heading follows the camera) | steer |
| A / D | carve offset | carve offset |
| Shift | — | boost |
| Space | — | hop |

**Why O and not H.** H is already bound **twice**: `world-actions.js` uses it for the hero switch and the host uses it for the NEXUS map at the `e.key==='h'` handler. The following keys are also taken: B, C, E, F, G, J, K, L, M, N, P, Q, R, T, V, X, Z, Escape and Digit1–3. O is free in the host and in every `world-*.js` module.

**Existing conflict (not fixed here, it is the host's call).** When you stand within 22 units of the garage beacon, **B** opens the garage (world-actions) *and* toggles the bike (host). The fix is to guard the host's B handler with `!(window.__worldLandmarks && Math.hypot(playerPos.x-__worldLandmarks.garagePos[0], playerPos.z-__worldLandmarks.garagePos[1])<22)`.

## Host integration: `public/SHADDAI-WORLD-3D.html`
The page is being edited in parallel, so each anchor below is **exact text** to search for. Line numbers were correct as of 2026-09-26 and are approximate.

### 1. Script tags (~line 255)
```html
<script src="/world-actions.js?v=20260926v2"></script>      <!-- bump: was ?v=20260924a -->
<script src="/world-hoverboard.js?v=20260926v2"></script>   <!-- NEW, must load after world-actions (WorldRiderPose) -->
```

### 2. Build calls. Anchor: `if (window.buildWorldActions) veh = window.buildWorldActions({` (~4156)
Add the four new options to the existing object:
```js
    isShift: function(){ return !!(keys['ShiftLeft']||keys['ShiftRight']); },
    // ── VEHICLES V2 ──
    bikeMesh: gridBike,
    avatar: playerAvatar,
    heightAt: function(x,z){ return window.WORLD_HEIGHT_AT ? window.WORLD_HEIGHT_AT(x,z) : ((worldTerrain && worldTerrain.heightAt) ? worldTerrain.heightAt(x,z) : 0); },
    getColliders: function(){ return (window.WORLD_LAYOUT && window.WORLD_LAYOUT.realmColliders) || []; },
  });
```
Directly **after** the `}catch(e){ console.warn('world-actions init failed:' ...); }` line, add:
```js
// HOVERBOARD V2 (world-hoverboard.js) — O to ride. Shares the GLTF loader (meshopt+draco).
let hover = null;
try{
  if (window.buildWorldHoverboard) hover = window.buildWorldHoverboard({
    THREE, scene, loader: _acLoader, playerPos,
    heightAt: function(x,z){ return window.WORLD_HEIGHT_AT ? window.WORLD_HEIGHT_AT(x,z) : ((worldTerrain && worldTerrain.heightAt) ? worldTerrain.heightAt(x,z) : 0); },
    colliders: function(){ return (window.WORLD_LAYOUT && window.WORLD_LAYOUT.realmColliders) || []; },
    time: function(){ return clock.elapsedTime; },           // ocean wave phase sync
  });
}catch(e){ console.warn('world-hoverboard init failed:', e && e.message); }
```
(`_acLoader` is declared with `const` inside the preceding `try{}`. Either hoist it to `let _acLoader=null;` above that try, or create a second loader here in the same way: `new GLTFLoader(__loadMgr)` + `setDRACOLoader` + `setMeshoptDecoder`.)

### 3. Keys. Anchor: `if(e.code==='KeyB'){ bikeMode=!bikeMode;` (~3524)
Prepend this to that handler, and add the O key right after it (`hover` is declared later with `let`, but the handler only runs after boot, so the reference is safe):
```js
  if(e.code==='KeyB' && typeof hover!=='undefined' && hover && hover.isRiding()) hover.dismount();   // one vehicle at a time
  // …existing KeyB line unchanged…
  if(e.code==='KeyO' && !e.repeat && typeof hover!=='undefined' && hover && !(_interiors && _interiors.isInside())){
    if(bikeMode){ bikeMode=false; const h=document.getElementById('bikeHud'); if(h) h.style.display='none'; trailPos.length=0; updateTrail(); }
    if(hover.isRiding()) hover.dismount();
    else { thirdPerson=true; hover.mount(playerAvatar, { yaw: Math.atan2(fwd.x, fwd.z), speedMS: Math.hypot(_vel.x,_vel.z)/(7/1.8) }); }
  }
```

### 4. Movement. Anchor: the block from `_moveDir.set(0,0,0);` to `playerPos.z += _vel.z * dt;` (~4304–4316)
Replace that block with the code below. The climb limit, colosseum resolve, edge clamp and `WORLD_RESOLVE_POS` that follow are kept, and they still run for both vehicles.
```js
    const _px0 = playerPos.x, _pz0 = playerPos.z;
    const _camYaw = Math.atan2(fwd.x, fwd.z);
    if (veh.bike && (bikeMode || veh.bike.isRiding())) {
      // GRID BIKE V2: real throttle/brake/steer physics moves playerPos
      const _thr = ((keys['KeyW']||keys['ArrowUp'])?1:0) - ((keys['KeyS']||keys['ArrowDown'])?1:0);
      const _str = ((keys['KeyD']||keys['ArrowRight'])?1:0) - ((keys['KeyA']||keys['ArrowLeft'])?1:0);
      const _bo = veh.bike.step(dt, { riding: bikeMode, throttle: _thr, steer: _str, camYaw: _camYaw, pos: playerPos, vel: _vel });
      _vel.x = _bo.vx; _vel.z = _bo.vz;          // hand the momentum back to walking on dismount
    } else if (hover && hover.isRiding()) {
      hover.step(dt, { fwd: !!(keys['KeyW']||keys['ArrowUp']), back: !!(keys['KeyS']||keys['ArrowDown']),
        left: !!(keys['KeyA']||keys['ArrowLeft']), right: !!(keys['KeyD']||keys['ArrowRight']),
        boost: !!(keys['ShiftLeft']||keys['ShiftRight']), jump: !!keys['Space'] }, _camYaw);
      const _hv = hover.velocity(); _vel.x = _hv.x; _vel.z = _hv.z;
    } else {
      _moveDir.set(0,0,0);
      if(keys['KeyW']||keys['ArrowUp'])    _moveDir.add(fwd);
      if(keys['KeyS']||keys['ArrowDown'])  _moveDir.sub(fwd);
      if(keys['KeyA']||keys['ArrowLeft'])  _moveDir.sub(right);
      if(keys['KeyD']||keys['ArrowRight']) _moveDir.add(right);
      if(_moveDir.lengthSq() > 1e-6) _moveDir.normalize();
      _targetVel.copy(_moveDir).multiplyScalar(_maxSp);
      const _acc = 1 - Math.exp(-14*dt);
      _vel.x += (_targetVel.x - _vel.x) * _acc;
      _vel.z += (_targetVel.z - _vel.z) * _acc;
      playerPos.x += _vel.x * dt;
      playerPos.z += _vel.z * dt;
    }
```
In the same block, the trail line (anchor `if(bikeMode){ trailPos.push(playerPos.x, 0.35, playerPos.z);`) becomes:
```js
    if(bikeMode){ trailPos.push(playerPos.x, veh.bike ? veh.bike.trailY() : 0.35, playerPos.z); if(trailPos.length>240) trailPos.splice(0,3); updateTrail(); }
```

### 5. Camera, eye and ground
* Anchor `const eye = bikeMode ? 1.5 :`. The rider now sits at seat height instead of floating, so change it to `const eye = bikeMode ? (1.9 * _PLAYER_EYE_K) : (2.2 * _PLAYER_EYE_K);`.
* Anchor `if (!veh.mode && !(_elevators && _elevators.isRiding())`, the swim law. Add `&& !(hover && hover.isRiding())` so the player does not "swim" under the board.
* Anchor `const _rawBaseY = veh.baseY(groundY);`. Change it to `const _rawBaseY = (hover && hover.isRiding()) ? hover.rideBaseY() : veh.baseY(groundY);`. In the `_smoothBaseY` snap condition on the next line, add `|| (hover && hover.isRiding())` so the camera tracks the hover and the hop exactly.
* Optional speed pull-back in the 3rd-person `_camTarget.set(...)`. Multiply both `8*_PLAYER_EYE_K` factors by `_camK`, where `const _camK = 1 + 0.35*Math.min(1, Math.abs((bikeMode&&veh.bike)?veh.bike.speedMS()/25:(hover&&hover.isRiding()?hover.speedMS()/20:0)));`.

### 6. Animation weights. Anchor: `const m = bikeMode ? 0 : Math.min(1, spd/4);` (~3173, `_updatePlayerLoco`)
```js
  const m = (bikeMode || (typeof hover!=='undefined' && hover && hover.isActive())) ? 0 : Math.min(1, spd/4);
```
Locomotion fades to idle while riding, and the rider pose layers on top.

### 7. Per-frame visuals. Anchor: the whole `gridBike.visible = bikeMode;` + `if(bikeMode){ … }` block (~4495–4504)
Replace it with:
```js
  // VEHICLES V2: bike + hoverboard place themselves AND the rider (seated / surf-stance IK)
  const _flatGround = !!((_interiors && _interiors.isInside()) || (_elevators && _elevators.isRiding()));
  if (veh.bike) {
    gridBike.visible = veh.bike.visible();          // parked bike stays where you left it
    veh.bike.pose(dt, { groundY, flat: _flatGround, showRider: thirdPerson });
  } else gridBike.visible = bikeMode;
  if (hover) hover.pose(dt, { showRider: thirdPerson ? true : undefined });
```
Keep it **after** `veh.update(dt, fwd);` and after the 3rd-person avatar placement. Both `pose()` calls start from where the host put the avatar that frame, and fade from and to it. `hover.pose()` must run **every frame**, even when not riding: it bobs the parked board, fades the trail and fades the rider off after a dismount.

## Verification done
* `node --check public/world-actions.js` passes, and `node --check public/world-hoverboard.js` passes.
* No browser run was possible on this machine (no disk or RAM). What to check in the browser:
  1. The rider sits with hands on the bars and feet on the rear pegs for SHADDAI, ZEROX and one Meshy body.
  2. The bike leans into a fast turn and pitches on the mountain-ring slopes.
  3. The board hovers over the Crystal Sea.
  4. The console shows no `[hoverboard] … failed`.
* If a body's knees bend backwards, flip the sign of `kneePoleL/R` in `pose()` (the bike) or in world-hoverboard.js. The poles are world-space, so this is a single global fix, not a per-rig one.
