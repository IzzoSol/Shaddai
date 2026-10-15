# Dragon riding — `public/world-dragon-ride.js` (Map v4)

You can call your tamed dragon to a **Perch pad** (`PERCH_MAIN`, `PERCH_A`–`D`, on the Perch spire) or to the
**Dragon Harness** vehicle pad (`VEH_DRAGON_HARNESS`, NW vehicle pad), climb on, and fly it anywhere. You land it back on a
pad top or on open ground. A wild crossing dragon you have beaten (it bowed to you) can be ridden too.
Mounting is gated by the `pilot.dragon` skill (`docs/city-v3/DOC_SKILLS.md`, Perch access).

Files:
- `public/world-dragon-ride.js` is a classic script. The CORE (flight, mount/dismount rules, perch landing, stamina,
  camera rig) is pure JS; the optional THREE visual uses the rigged GLB.
- `tools/tests/world-dragon-ride.test.cjs` runs with `node tools/tests/world-dragon-ride.test.cjs`.
- This doc. **Nothing here has been applied to `SHADDAI-WORLD-3D.html` yet.** The snippets are below.

## API
```js
const ride = window.buildDragonRide({
  heightAt: (x, z) => units,              // terrain (same as the player controller)
  playerPos,                              // host's playerPos (feet). Written every frame while riding
  markers,                                // markers-v4.json rows {name, pos_m:[X,Y,Z]}
  hasSkill: id => bool,                   // 'pilot.dragon'. Leave it out and mounting is allowed (dev default)
  dragons: window.__dragons,              // optional: ride a DEFEATED wild dragon (core.setRidden hand-off)
  THREE, scene, loader, cloneSkinned,     // optional visual; modelUrl defaults to /assets/creatures/dragon-rigged.glb
  tune: { … },                            // optional RIDE_TUNE overrides (metres / seconds)
});
```
| member | purpose |
|---|---|
| `update(dt, input?)` | every frame. `input = {fwd, back, left, right, climb, dive}` (or `opts.getInput()`). Drives the call-in glide too |
| `mount(which)` | `'tamed'` calls/re-mounts your dragon; a wild dragon id mounts a **defeated** wild dragon. Returns bool; `lastRefusal()` gives `'skill'`, `'far'`, `'riding'`, `'wild'`, `'busy'` or `'unknown'` |
| `dismount()` | allowed when **grounded**, or when **hovering ≤ 10 m over a perch pad** (you step onto the pad top). Otherwise false with reason `'airborne'` |
| `isRiding()`, `isArriving()`, `state()` | `state()` is `'none'`, `'arriving'`, `'ground'`, `'hover'`, `'fly'` or `'parked'` |
| `canMount()`, `nearestMount()` | for an "[H] Call dragon" prompt. `nearestMount()` returns a reused `{ok, name, kind, dist}` |
| `canDismount()` | for a "[E] Dismount" prompt |
| `stamina()`, `boosting()`, `hud()` | HUD hook. `hud()` returns a reused `{riding, mode, stamina, boosting, speed, alt, canDismount, perch}` |
| `saddle()` | reused `{x,y,z,yaw,pitch,bank}` for placing the avatar |
| `camera()` | reused `{x,y,z, lx,ly,lz, fov}` chase camera (lagged, pulls back with speed, FOV kick on boost) |
| `on(ev, cb)` | `call`, `mount`, `takeoff`, `fly`, `hover`, `land {perch}`, `dismount {perch, pos}`, `refused {reason}`, `stamina-empty` |
| `dispose()` | dismounts if it can and removes the visual |

## Controls
| key | on the ground / hovering | flying |
|---|---|---|
| W | take off, fly forward (a hover reaching 9.5 m/s pitches into flight) | throttle up (34 m/s) |
| S | back up | throttle down to 16 m/s. Below 17 m/s it **flares into a hover** (the only way to set down) |
| A / D | turn | yaw with a coordinated bank (≤ 55°) |
| Space | take off / rise (8 m/s) | climb (pitch up to 28°) |
| Shift | sink (7 m/s) | dive + **boost** to 46 m/s. It drains stamina (0.22/s) and locks out when empty until 15 % has regenerated |
| E / F | dismount (grounded, or ≤ 10 m over a pad) | refused with a toast |
| H | call / mount (the host binds this, below) | — |

The flight floor is terrain + 3 m, so you can't crash into the ground. Landing works like this: slow down with S → hover → Shift down.
Touchdown **snaps exactly onto the walkable top** of the pad under you (a pad counts only if its top is below you, so the
crown doesn't catch you while you're under it). Pad radii are 8 m for MAIN and 6 m for A–D, so the spiral pads never overlap.

## Host snippets for `public/SHADDAI-WORLD-3D.html` (coordinator applies)

**1. Build it.** Add a new `.then` block right after the `// MAP v4 CITY v3 RUNTIME` block (it closes with
`}).catch(function(e){ console.warn('[map-v4] city v3 failed:', e && e.message); }).then(function(){ return api; });` + `    })`):
```js
    .then(function(api){   // MAP v4 DRAGON RIDING (world-dragon-ride.js): H at a Perch pad / Dragon Harness → call + ride your dragon
      if(!api) return api;
      return _loadScript('/world-dragon-ride.js?v=20260927a').then(function(){
        return fetch('/assets/world/markers-v4.json').then(r => r.json()).then(function(mj){
          const rl = new GLTFLoader(); rl.setDRACOLoader(dracoLoader); rl.setMeshoptDecoder(MeshoptDecoder);
          window.__dragonRide = window.buildDragonRide({ THREE, scene, loader: rl, cloneSkinned, heightAt: api.heightAt,
            playerPos, markers: (mj && mj.markers) || [], dragons: window.__dragons || null,
            hasSkill: window.__hasSkill || undefined });   // prod: window.__hasSkill = id => <skills ledger has id>
          window.__w3dDebug.dragonRide = window.__dragonRide;
          window.__dragonRide.on('refused', function(e){ if(!window.__toast) return;
            window.__toast({ skill: '🐉 Needs the pilot.dragon skill (Perch access)', far: '🐉 Stand on a Perch pad or at the Dragon Harness',
              airborne: '🐉 Land first, or hover low over a Perch pad', wild: '🐉 That dragon has not bowed to you' }[e.reason] || ('🐉 ' + e.reason)); });
        });
      }).catch(function(e){ console.warn('[map-v4] dragon ride failed:', e && e.message); }).then(function(){ return api; });
    })
```

**2. Keys.** Add a capture-phase listener, e.g. right before the `addEventListener('keydown', e=>{` that handles `KeyE`/`KeyP`/`KeyB`/`KeyO`.
It runs before every other keydown handler and swallows E/F/B/O while you ride:
```js
addEventListener('keydown', function(e){   // DRAGON RIDING keys (capture: runs before the E/F/B/O handlers)
  const R = window.__dragonRide; if(!R || e.repeat) return;
  if(R.isRiding()){
    if(e.code==='KeyE' || e.code==='KeyF'){ e.stopImmediatePropagation(); e.preventDefault(); R.dismount(); }
    else if(e.code==='KeyB' || e.code==='KeyO' || e.code==='KeyH'){ e.stopImmediatePropagation(); }   // one mount at a time
    return;
  }
  if(e.code==='KeyH' && controls.isLocked && !R.isArriving() && !(_interiors && _interiors.isInside())){
    if(bikeMode){ bikeMode=false; const h=document.getElementById('bikeHud'); if(h) h.style.display='none'; trailPos.length=0; updateTrail(); }
    if(hover && hover.isRiding()) hover.dismount();
    const wild = window.__dragons && window.__dragons.dragons.find(d => d.defeated && !d.ridden && Math.hypot(d.f.x-playerPos.x, d.f.z-playerPos.z) < 45*V4_U);
    if(R.mount(wild ? wild.id : 'tamed')) thirdPerson = true;
  }
}, true);
```

**3. Suspend the player controller and walking while riding.** In the `_pctlOn = …` line, append
`&& !(window.__dragonRide && window.__dragonRide.isRiding())`. Then:
- Right before `if((controls.isLocked || _touchCtrl.on) && !_uiOpen){` (the movement block), add:
```js
  if(window.__dragonRide){   // DRAGON RIDING: the ride owns playerPos while mounted (and animates the call-in glide)
    const _rl = (controls.isLocked || _touchCtrl.on) && !_uiOpen, _ri = window.__dragonRideIn || (window.__dragonRideIn = {});
    _ri.fwd = _rl && !!(keys['KeyW']||keys['ArrowUp']); _ri.back = _rl && !!(keys['KeyS']||keys['ArrowDown']);
    _ri.left = _rl && !!(keys['KeyA']||keys['ArrowLeft']); _ri.right = _rl && !!(keys['KeyD']||keys['ArrowRight']);
    _ri.climb = _rl && !!keys['Space']; _ri.dive = _rl && !!(keys['ShiftLeft']||keys['ShiftRight']);
    window.__dragonRide.update(dt, _ri);
  }
```
- Inside the movement chain, add a branch **before** `} else if (hover && hover.isRiding()) {`:
```js
    } else if (window.__dragonRide && window.__dragonRide.isRiding()) {
      _vel.x = 0; _vel.z = 0;                       // position already written by the ride
```
- In the `const _rawBaseY = …` line, put `(window.__dragonRide && window.__dragonRide.isRiding()) ? playerPos.y :` in front of the
  `(hover && hover.isRiding())` test. Then add `|| (window.__dragonRide && window.__dragonRide.isRiding())` to the `_smoothBaseY` snap condition
  (the `if(_smoothBaseY===undefined || _spawnBusy || …` line), so the saddle height is never eased.
- Also skip the swim law while riding: add `&& !(window.__dragonRide && window.__dragonRide.isRiding())` to the `if (_v4Water && !veh.mode && …)` test.

**4. Camera + avatar on the saddle.** Right before `camFill.position.copy(camera.position);` add:
```js
  if(window.__dragonRide && window.__dragonRide.isRiding()){   // DRAGON RIDING chase cam + seated avatar
    const _c = window.__dragonRide.camera(), _s = window.__dragonRide.saddle();
    if(window.__rideBaseFov == null) window.__rideBaseFov = camera.fov;
    camera.position.set(_c.x, _c.y, _c.z); camera.lookAt(_c.lx, _c.ly, _c.lz);
    const _fov = window.__rideBaseFov + (_c.fov - window.__dragonRide.tune.fovBase);   // boost FOV kick relative to the host FOV
    if(Math.abs(camera.fov - _fov) > 0.05){ camera.fov = _fov; camera.updateProjectionMatrix(); }
    playerAvatar.visible = true; playerAvatar.position.set(_s.x, _s.y, _s.z); playerAvatar.rotation.set(0, _s.yaw, 0);
  } else if(window.__rideBaseFov != null){ camera.fov = window.__rideBaseFov; camera.updateProjectionMatrix(); window.__rideBaseFov = null; }
```
The boost FOV kick is added on top of whatever FOV the host uses, and the host FOV comes back on dismount.

**5. HUD stamina.** In the `MAP v4 HUD` block, change `getStamina` to:
`getStamina: ()=> (window.__dragonRide && window.__dragonRide.isRiding()) ? window.__dragonRide.stamina() : ((_pctlOut && _pctlOut.stamina != null) ? _pctlOut.stamina : 1),`
The HUD block loads before the ride block. The getter reads `window.__dragonRide` lazily, so the order doesn't matter.

**6. City v3 prompts (optional).** Add `&& !(window.__dragonRide && window.__dragonRide.isRiding())` to the City v3 `canInteract`, so
E-prompts don't show while you fly past markers.

## Tunables (`RIDE_TUNE`, metres / seconds)
`wingspan 22, skill 'pilot.dragon', mountRadius 30 (beyond a pad's edge), mountVert 25, harnessRadius 25, parkedRadius 18,
wildRadius 40, arriveTime 3.2, arriveAlt 70, arriveOut 90, padR 6, padMainR 8, snapV 2.5, dismountPadH 10, speedStall 13,
speedMin 16, cruise 24, speedMax 34, boost 46, accel 8, brake 9, yawRateMax 1.0, yawAccel 2.6, bankMaxDeg 55, bankRateDeg 120,
pitchUpDeg 28, pitchDownDeg 38, pitchRateDeg 60, gravK 0.5, hoverMax 10, hoverBack 3, hoverClimb 8, hoverSink 7, hoverToFly 9.5,
flyToHover 17, takeoffVy 6, minClear 3, boostDrain 0.22, regen 0.14, regenDelay 1, boostResume 0.15, camBack 17, camUp 6.5,
camBackPerMS 0.22, camLook 12, camLag 5, fovBase 62, fovBoost 12, saddleUp 0.34, saddleFwd 0.08 (× wingspan).`

## Tests (`node tools/tests/world-dragon-ride.test.cjs`)
- Markers → 5 pads + the harness, with correct metre → unit conversion.
- Mount gating: no skill → `'skill'`; away from pads → `'far'`; at the harness → ok; the default allows; mounting twice → `'riding'`.
- The call-in glide takes 3.2 s, lands exactly on the PERCH_A top, and never teleports.
- Flight over hills: take-off → fly, bank reaches 55° and no more, climb +64 m, dive −108 m, clearance ≥ 3 m, player on the saddle, camera behind.
- Stamina: boost drains to 0, locks out, then regenerates. Boost exceeds max speed.
- Dismount: refused in the air. Allowed hovering 6 m over PERCH_C (you're placed on its top) but not 25 m over it.
  Allowed on the ground (the dragon is parked), and re-mounting the parked dragon needs no new call.
- Landing: a hover descent over PERCH_D snaps exactly onto 73.2 m and `land` names the pad. Next to the pad you land on the terrain.
- Flare: S at low speed → hover; W → flight again.
- Wild dragon: refused while hostile, rideable once defeated. The core doesn't move or hit-test it while ridden. On release it's set
  down at the dismount point and flies home (`ambient`).
- Perf (fresh node process): 60 000 warm-up updates, then about 15 B per update. That is only the double `dt` argument the caller passes;
  there are no per-frame objects. Every per-frame object is reused, and `dt` is carried in a `Float64Array` slot.

## Needs a real in-browser look
- Saddle height/offset (`saddleUp`/`saddleFwd`) against the actual `dragon-rigged.glb` pose, the avatar's seated pose (it uses the idle pose for now),
  and the chase-cam distances.
- Whether the GLB's forward axis is +Z. If not, the wild-dragon BoneRig and the ride visual both need the same axis fix.
- Pad radii against the built Perch spire geometry. Flying into the side of the spire has no collider: the pad top only acts as ground
  inside the pad radius.
- Wild dragons still see a mounted player as a target. By design you can dogfight a hostile dragon while riding, but the swoop/breath
  tuning was made for a player on foot.
