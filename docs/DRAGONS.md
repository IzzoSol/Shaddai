# Crossing Dragons — `public/world-dragons.js` (Map v4)

Each realm's dragon guards its station on the gold maglev ring. You fight it in the wilderness
when you cross. Once it's beaten, the crossing stays open for good. There's one dragon for every
entry in `WORLD_LAYOUT.stations` whose `dragon` field isn't null (8 on v4). Station positions and
bearings are read from `WORLD_LAYOUT.stations` **at runtime** (the canon bearings: rift 0°,
desert 31°, forge 54°, suburb 90°, meadow 142.1°, harbor 225°, darkvault 299.1°, arctic 333.4°).
Nothing about them is hard-coded.

Files:
- `public/world-dragons.js` is a classic script with no build step. The CORE layer is pure JS with
  no THREE (flight + AI + attacks + events) and is exported for node. The VISUALS layer needs THREE.
- `tools/tests/dragons.test.cjs` runs with `node tools/tests/dragons.test.cjs` (pure math, no browser).
- This doc.

Scale law: 1 m = 7/1.8 u (3.889). **Every tunable is in metres/seconds.** Positions are world units.

---

## API

```js
const dragons = window.buildWorldDragons({
  THREE, scene, camera,              // camera optional: used to size breath particles
  loader,                            // GLTFLoader with Meshopt+Draco decoders (only needed if modelFor returns URLs)
  heightAt: (x, z) => units,         // terrain height
  layout: WORLD_LAYOUT,              // reads layout.stations[] {id, name, pos:[x,z], realm, dragon}
  getPlayer: () => ({ pos: {x, y, z} /* feet */, alive: bool }),
  onHitPlayer: (dmg, kind, info) => {},   // kind: 'breath'|'swoop'|'stomp'|'tail'|'stagger'
                                          // info: {id, attackId, knockback:{x,y,z} u/s | null, from, element, sinceTelegraph}
  isDefeated: (id) => bool,          // persisted state, checked at load
  setDefeated: (id) => {},           // called once, after the defeat bow
  modelFor: (dragonId, d) => url | null,  // null = procedural rig (default)
  cloneSkinned: (scene) => clone,    // optional SkeletonUtils.clone, needed if several dragons share one skinned GLB
  tune: {...},                       // optional full TUNE override (see below)
  seed: 1337,
});
```

Returns `api`:

| member | purpose |
|---|---|
| `update(dt)` | call every frame (dt is clamped to 0.1 s) |
| `dragons[]` | live dragon records (`id`, `station`, `element`, `state`, `hp`, `hpMax`, `defeated`, `wingspan` (m), `f` = flight state `{x,y,z,yaw,pitch,bank,speed,mode}`) |
| `damage(id, amount, hitPos?, type?)` | player hits a dragon. `type` = damage kind for resistances (`physical`,`fire`,`ice`,`arcane`,`light`,`poison`,`lightning`). Returns false during i-frames or after defeat |
| `hitTest(pos, radiusUnits)` | → id of the dragon whose body/wing sphere contains the point (for projectiles) |
| `meleeHit(pos, fwd, reachUnits, dmg)` | cone test in front of the player, applies damage, → id or null |
| `setPlayerInvulnerable(sec)` | dodge-roll i-frames: while active every dragon hit is refused (`'dodged'` event) |
| `isOpen(stationId)` | true when the station has no dragon or its dragon is defeated. The crossing gate should use this |
| `on(ev, cb)` / `off(ev, cb)` | events (below). `on('*', (name, data) => …)` catches all of them |
| `stats()` | `{dragons, defeated, attacker, states, hits, telegraphs, refused, violations, floorHits, time}` |
| `dispose()` | removes everything and frees geometries/materials |
| `forceAttack(id, kind)` | debug: `'breath'|'swoop'|'land'|'roar'` (the dragon must be airborne) |

`window.__worldDragons` points at the live api. `window.WorldDragons` exposes `TUNE`, `ELEMENTS`,
`createDragonsCore`, `stepFlight`, … for probes.

### Events
Each payload includes `id` and `t`, the core clock in seconds. Shake payloads are
`{intensity, duration}`, in the same shape as `camera.shake(intensity, duration)` in the game-dev repo's camera-system.md.

| event | when | payload extras |
|---|---|---|
| `telegraph` | attack wind-up starts (always ≥ 0.8 s before any damage) | `kind` (`breath`/`swoop`/`stomp`/`tail`/`roar`), `dur`, `pos` (ground marker), `radius` (m), `attackId` |
| `screech` | swoop telegraph starts | play the screech sound |
| `breath` | breath begins | `element`, `dur` |
| `swoop` | dive begins | `pos` (locked target), `shake` |
| `land` | touchdown or stomp impact | `kind` (`land`/`perch`/`defeat`/`stomp`), `pos`, `shake`, `radius` |
| `tailswipe` | tail swipe resolves | `pos`, `radius`, `shake` |
| `roar` | roar resolves (stagger inside 20 m) | `pos`, `radius`, `shake` |
| `hit` | the player was damaged | `kind`, `dmg`, `attackId`, `sinceTelegraph`, `knockback` |
| `dodged` | a hit was blocked by roll i-frames | `kind` |
| `hurt` | the dragon took damage | `dmg`, `hp`, `hpMax`, `type`, `resisted` |
| `interrupt` | a heavy hit (≥ 8 % max hp) cancelled a telegraph | `kind` |
| `downed` | hp reached 0 | — |
| `defeated` | glide → land → bow finished; the crossing opens | `station`, `element`, `name` |
| `state`, `attack`, `takeoff` | AI bookkeeping | `from`/`to`, `kind` |

---

## Elements
The colour of each station's dragon maps to an element. Palettes are sampled from `fal-assets/refs/dragons/dragons-7-elements-sheet.jpg`.

| layout `dragon` | element | breath style (particles) | resists / weak to |
|---|---|---|---|
| red | fire | fire (soft, rising, grows) | fire 60 % / ice −25 % |
| blue | ice | ice shards (diamond, fast) | ice 60 % / fire −25 % |
| tan | sand | sand (heavy, falls) | physical 20 % |
| green | poison | thorns (diamond) | poison 70 % |
| void | void | arcane swirl (rings, spiralling) | arcane 50 % / light −25 % |
| dark | shadow | void smoke (dark purple, NORMAL blend) | arcane 30 % / light −30 % |
| black | steel | steel blades (fast, tight) | physical 35 % / arcane −20 % |
| teal | tide | spray (falls, wide) | fire 40 % / lightning −30 % |

The sheet has 7 elements. Teal (Harbor) is an 8th "tide" element that uses the sheet's spray style.

---

## Flight model (`stepFlight`)
It flies as a real 3D flier with no teleporting. Horizontal speed is capped at `speedDive`. The fight test
measures a maximum 3D speed of 42.9 m/s.

- **State:** position, `yaw`, `pitch` (flight-path angle), `bank`, airspeed `speed` (m/s), `yawRate`,
  and `mode` (`fly` / `hover` flapping take-off+landing / `ground`).
- **Heading:** yaw error → yaw rate, limited by the coordinated-turn limit `g·tan(bankMax)/v` and by `yawAccel`.
- **Bank:** `atan(v·yawRate/g)`, rate-limited and hard-clamped to ±60° (`bankMaxDeg` 55 in normal flight).
- **Altitude hold:** look-ahead terrain fan. It samples heading, target heading and one side at
  0.4–4.8 s ahead (`lookAheadSec`) and takes the max. Target = max(command altitude, floor + `minClear`).
  Vertical speed = feed-forward (dive glide path) + P-gain, limited by climb/sink. Steep ground ahead
  also slows the dragon to about `speedMin`+4 and doubles the climb authority.
- **Lift/drag-lite:** thrust toward the commanded speed (±`accel`), minus `g·sin(pitch)·0.55` on climbs.
  Airspeed stays between 18 and 35 m/s cruise and reaches 42 in dives.
- **Stall:** below `stallSpeed` (15.5) the nose is forced to −14° until speed > `speedMin`+2.
- **Hard floor** (safety net, counted in `floorHits`): terrain + `hardClear`. The floor may only **rise**
  at `hardRise` (6 m/s). When a low dive or strafe hands back to patrol, the dragon climbs out and never pops upward.
- **Patrol clearance:** at least 25 m (`clearPatrol`), with 38 m as the target (`clearPatrolTarget`). Attack phases only
  hand back to patrol once clearance is ≥ 26 m.

## AI states
The FSM is a `switch` on `d.state`, and `setState` emits `state` events (enter/exit hooks).

```
perch ──(player < 250 m of crossing, not beaten)──▶ alert (perched roar, telegraph 0.8 s) ─▶ takeoff (hover climb → fly)
  ▲                                                                                          │
  │ return (player > 600 m for 6 s / dead → fly home, land, full heal)                        ▼
  └──────────────────────────────────────────────────────────────────────────────── patrol (orbit player 60–120 m, 40–70 m up)
                                                                                         │ cooldown 2.2–4 s, holds the attacker token
                                   retreat (hp < 30 %, once) → rest (perch 8 s, +12 % hp) │
                                                                                         ▼
                                                        attack: breath | swoop | land (stomp/tail/roar) | roar
  any: hp 0 → downed → defeated_glide → land → bow (3.2 s) → setDefeated + 'defeated' → peaceful ⇄ ambient loops (150 m up)
```

- **Max 1 active attacker:** `core.attacker` token. Hits from a non-holder are refused, and the test asserts at most 1.
- **Breath strafe:** open to 130 m → approach at strafe height (13 m over the player; look-ahead capped just past
  the player) → **inhale telegraph 1.0 s**. The run line then **locks** and the dragon flies straight.
  → breath 2.4 s: cone 35 m long, 8 m radius at the end. The head tracks the player at 75°/s but only
  ±12° sideways from the locked line, so a side-roll or sidestep escapes. Damage is 24 dps in 0.25 s ticks,
  and particles that hit the ground leave scorch decals.
- **Dive swoop:** climb to 58 m, open to 110–190 m, turn in → **telegraph 1.2 s** (screech + growing
  ground shadow at the *locked* point) → straight glide-path dive to 3 m over the lock → knockback hit
  within 6.5 m → pull-up. If the player moves ≥ ~7 m during the telegraph, the dive misses.
- **Landed:** land in front of the crossing, on the player's side, and stay 6–9 s. Each move has its own
  telegraph: stomp (0.9 s, radial 18 m), tail swipe (0.8 s, 22 m, player behind), roar (0.8 s, stagger 20 m).
- **Roar:** telegraph 0.8 s → stagger (0 dmg + small knockback) within 20 m.
- **Hurt:** 0.6 s stagger with a bank wobble. A heavy hit interrupts an unresolved telegraph.
- **Defeated at load** (`isDefeated`): starts `peaceful` and alternates perching with high ambient loops. It never attacks.
  Every damage path goes through one guard, `hurtPlayer`, which refuses the hit if the dragon is defeated, the token isn't held,
  or less than 0.8 s has passed since the telegraph. `violations` counts refusals; it's 0 in all tests.

## Visuals
- **ProcRig (default).** Procedural and built at unit wingspan, then scaled to 18–26 m. It has true split wings:
  arm and hand pivots with bone struts and scalloped membranes. There's also a 3-segment neck, a head with
  a jaw pivot, horns, glowing eyes and a mouth glow; a 5-segment tail with an element-glow spade; spine
  spikes; and 4 legs that tuck in flight. Materials are per element. Animation: wing flap frequency
  1.0 → 2.3 Hz with effort (fast when climbing), glide pose in dives, 2.6 Hz hover flaps on take-off and landing.
  It folds its wings on the ground. The tail sways and counter-banks, and the neck and head look at the player
  (clamped ±57°/−46…+29°). The jaw opens on inhale, breath and roar. The head bows when defeated, and the body
  breathes while perched.
- **ShaderRig** (`modelFor` → single-mesh GLB with no skin). The GLB is de-quantised, baked to wingspan 1
  (+Z forward), and animated with an `onBeforeCompile` vertex shader:
  - wing flap that bends vertices around the shoulder by `|x|` from the centreline, with a lagged tip term
  - tail sway past `uTailStart`
  - neck yaw/pitch past `uNeck`
  - jaw drop below `uJawY`
  - element tint in the fragment shader
  Axis fix: `tune.modelFix = {rx, ry, rz}`.
- **BoneRig** (skinned GLB). Clips named `fly`/`flying`/`flap`/`hover`, `glide`, `idle`/`perch`/`stand` play
  through an `AnimationMixer` (timeScale follows flap effort). If there are no clips, wing, tip and tail bones
  are driven procedurally. Neck, head and jaw bones always get the procedural look-at and jaw on top.
- **Breath:** one `THREE.Points` per dragon, a pooled buffer of 400 particles, and a custom ShaderMaterial
  (point size scales with distance; soft / diamond / ring shapes). Blending is additive, except shadow, which uses normal blending.
- **Scorch decals:** one shared `InstancedMesh` (96 instances). Each instance has `aCol` and `aFade`
  (InstancedBufferAttributes), is aligned to the terrain normal, and fades over 9 s.
- **Ground telegraph:** one shared shadow disc plus a pulsing ring. Swoops grow the shadow, stomps and roars grow the ring.
  There's also a live drop shadow under a diving dragon.
- **LOD:** dragons more than 1500 m from the player (and not attacking) update at 5 Hz and render as a flat,
  fog-shaded silhouette of a few triangles.

## Tunables (`TUNE`, metres/seconds/degrees)
`speedMin 18, speedCruise 26, speedMax 35, speedDive 42, stallSpeed 15.5, accel 6, bankMaxDeg 55,
bankHardDeg 60, bankRateDeg 110, yawAccel 1.6, pitchUpDeg 30, pitchDownDeg 32, pitchDiveDeg 55,
pitchRateDeg 55, climbMax 15, sinkMax 10, sinkDive 30, altGain 0.9, hardRise 6, lookAheadSec [...],
lookAheadSideDeg 28, clearPatrol 25, clearPatrolTarget 38, clearStrafe 9, clearDive 2.2,
clearLandApproach 6, alertRadius 250, leashRadius 600, leashTime 6, orbitR [60,120], orbitAlt [40,70],
attackCooldown [2.2,4], retreatHpFrac 0.3, restTime 8, restRegenFrac 0.12, perchOut 70, landOffset 38,
minTelegraph 0.8, breath{inhale 1, dur 2.4, len 35, endRadius 8, alt 13, dps 24, tick 0.25, headTurnDeg 75,
latDeg 12, lineupDist 130}, swoop{telegraph 1.2, alt 58, dist [110,190], passAlt 3, hitRadius 6.5, dmg 26,
knock 16}, stomp{0.9 s, 18 m, 20 dmg}, tail{0.8 s, 22 m, 16 dmg}, roar{0.8 s, 20 m}, groundTime [6,9],
dragonIFrames 0.12, playerIFrames 0.6, farDist 1500, farHz 5, wingspan [18,26], hp 600.`
To override, pass `tune: Object.assign(JSON.parse(JSON.stringify(WorldDragons.TUNE)), {...})`.

## Patterns applied from `shaddai-threejs-gamedev-master` (read-only reference)
- `game-systems/ai-system.md`:
  - **FSM** with explicit states and transitions (state enter events).
  - **Steering behaviours** (seek, arrive-style speed ramp in `flyLand`, orbit via tangent lead point).
    They feed a flight model rather than a raw velocity add, so turns bank properly.
  - Perf tips applied: **AI LOD**, i.e. 5 Hz for distant dragons.
- `game-systems/health-combat-system.md`:
  - **Invulnerability windows (i-frames)** for the dragon (0.12 s, which stops one bolt multi-hitting)
    and the player (0.6 s after knockback, plus roll i-frames).
  - **Damage types + resistances** per element.
  - **Cooldowns** between attacks.
  - A **death check** that flows into the defeat sequence.
  - **Damage/hurt events** for feedback.
- `game-systems/camera-system.md`: events carry `shake:{intensity, duration}`, which matches `shake(intensity, duration)`.
- `game-systems/spawn-system.md`: **pooling**. The particle ring buffer and the decal ring buffer never allocate per frame.
- `threejs-shaders/SKILL.md`: `onBeforeCompile` injection at `#include <begin_vertex>` / `<map_fragment>`
  (wing-flap vertex displacement + tint); custom ShaderMaterial for particles.
- `threejs/instancing-advanced.md`: per-instance `InstancedBufferAttribute` colour/fade on one decal `InstancedMesh`.
- `threejs-animation/SKILL.md`: `AnimationMixer` clip crossfades for rigged dragons, with procedural bone offsets layered on top.

## Swapping in a rigged fal/Blender dragon later
1. Export GLB (meshopt OK), **+Z forward, +Y up, wings along X**, with any scale. It's refit to the dragon's wingspan.
2. Recommended bone names. They're matched case-insensitively with loose regexes, and Blender `.L/.R` works:
   `Spine`, `Neck_1..3`, `Head`, `Jaw`, `Wing_L`, `Wing_R` (upper arm), `WingTip_L`, `WingTip_R` (hand/forearm),
   `Tail_1..5`. Optional clips: `fly`, `glide`, `hover`, `idle` (plus `roar`/`breath` for later).
3. `modelFor: id => '/assets/models/fal/dragon-' + id + '.glb'`. If several dragons use one skinned file, pass
   `cloneSkinned: SkeletonUtils.clone`. Until then, `modelFor: () => null` keeps the procedural rig.
4. About `public/assets/models/volcano-dragon.glb`: I inspected it with a node GLB-JSON read and a meshopt
   decode. It has **1 node, 1 mesh, 0 skins, 0 animations**, 32,825 verts, and meshopt + KHR_mesh_quantization + webp.
   Its extents are X ±1, Y ±0.87, Z ±0.34: a posed statue with wings spread along X, and its forward axis
   is unclear. It works through ShaderRig, but it will likely need `tune.modelFix` (try `{rx: Math.PI/2}`).
   So the default stays the procedural rig. `world-volcano.js` keeps using that file as its static set piece.

---

## Host integration (`public/SHADDAI-WORLD-3D.html`, `?map=v4` only)
Nothing below has been applied. The steps are ordered and each one names an exact anchor.

**1. Load + build after the canon city** in the v4 promise chain. The canon block ends with the line
`}).then(function(c){ window.__w3dDebug.canonV4 = c; }).catch(function(e){ console.warn('[map-v4] canon failed:', e && e.message); }).then(function(){ return api; });`
followed by `    });`, which closes the chain. **Replace that `    });` line** with:

```js
    })
    .then(function(api){   // MAP v4 CROSSING DRAGONS (world-dragons.js) — one per ring station, beaten = crossing open forever
      if(!api) return api;
      return _loadScript('/world-dragons.js?v=20260926a').then(function(){
        const dl = new GLTFLoader(); dl.setDRACOLoader(dracoLoader); dl.setMeshoptDecoder(MeshoptDecoder);
        const KEY = 'w3d_dragons_defeated';
        const load = ()=>{ try{ return JSON.parse(localStorage.getItem(KEY) || '[]'); }catch(_){ return []; } };
        window.__dragons = window.buildWorldDragons({ THREE, scene, camera, loader: dl, heightAt: api.heightAt,
          layout: window.WORLD_LAYOUT,
          getPlayer: ()=> ({ pos: playerAvatar ? playerAvatar.position : playerPos,
                             alive: !(_interiors && _interiors.isInside()) && (window.__playerHP == null || window.__playerHP > 0) }),
          onHitPlayer: (dmg, kind, info)=> window.__onDragonHit && window.__onDragonHit(dmg, kind, info),
          isDefeated: id => load().indexOf(id) >= 0,
          setDefeated: id => { const a = load(); if(a.indexOf(id) < 0){ a.push(id); try{ localStorage.setItem(KEY, JSON.stringify(a)); }catch(_){} } },
          modelFor: () => null });
        window.__w3dDebug.dragons = window.__dragons;
      }).catch(function(e){ console.warn('[map-v4] dragons failed:', e && e.message); }).then(function(){ return api; });
    });
```

**2. Tick it** in the render loop. Anchor line:
`if(MAP_V4){ if(_v4T) _v4T.update(t, dt); if(_v4Water) _v4Water.update(t, dt); if(_v4Fill) _v4Fill.update(t, dt, camera.position); }`
Add directly after it:
```js
  if(MAP_V4 && window.__dragons && !_spawnBusy) window.__dragons.update(dt);
```

**3. Player HP + knockback + shake.** The host has no player HP today. Put this minimal version right after
`function _playerSig(){ … }`, the line before `function playerBasicAttack(){`:
```js
window.__playerHP = 100; let _dragonKB = null, _shakeT = 0, _shakeI = 0;
window.__onDragonHit = function(dmg, kind, info){
  window.__playerHP = Math.max(0, window.__playerHP - dmg);
  if(info && info.knockback) _dragonKB = { x: info.knockback.x, z: info.knockback.z, t: 0.35 };
  _shakeI = Math.max(_shakeI, kind === 'stagger' ? 0.25 : 0.6); _shakeT = 0.35;
  if(window.__playerHP <= 0){ window.__playerHP = 100; const c = window.WORLD_LAYOUT.stations[0].pos; playerPos.x = c[0]; playerPos.z = c[1]; }   // downed → respawn at Central
};
```
Then add this in the render loop, next to step 2, to apply knockback and shake:
```js
  if(_dragonKB){ playerPos.x += _dragonKB.x*dt; playerPos.z += _dragonKB.z*dt; if((_dragonKB.t -= dt) <= 0) _dragonKB = null; }
  if(_shakeT > 0){ _shakeT -= dt; camera.position.x += (Math.random()-0.5)*_shakeI; camera.position.y += (Math.random()-0.5)*_shakeI; }
```
Subscribe once in step 1 (`window.__dragons.on('land', e=>{ … e.shake … })`, and do the same for `roar` and `swoop`) to feed
`_shakeI/_shakeT` from `e.shake.intensity/duration` when the player is within about 150 m.

**4. Player attacks → `api.damage`.** The attack code lives at `// ── COMBAT — player attack moves…`.
- Melee (left-click combo): in `function playerBasicAttack(){`, add before `_attackFlash(); }`:
  `if(window.__dragons) window.__dragons.meleeHit(playerAvatar.position, fwd, 6*V4_U, 12);`
- Kick (`function playerKick(){`): add the same call as its first statement, with dmg 10.
- Projectiles (Q / E signature bolts) go in `_updateCombat(dt)`. Inside the projectile loop, right after
  `p.age+=dt; p.o.position.addScaledVector(p.vel,dt);`, add:
  ```js
  if(window.__dragons && !p.hitDragon){ const _hid = window.__dragons.hitTest(p.o.position, 1.5);
    if(_hid){ p.hitDragon = true; window.__dragons.damage(_hid, 18, p.o.position, p.dtype || 'arcane'); p.age = p.life; } }
  ```
- Dodge i-frames: F is flip/fly. In `function playerFlipOrFly(){`, add as its first statement
  `if(window.__dragons) window.__dragons.setPlayerInvulnerable(0.45);`

**5. Crossing gate.** `world-transit.js` has no dragon/defeated concept yet. Where it boards or opens a ring
station, gate it with `window.__dragons ? window.__dragons.isOpen(station.id) : true`, and toast
"The <element> dragon guards this crossing" when it's closed. `api.on('defeated', e => toast(e.name + ' bows — crossing open'))`
is the unlock moment.

**6. HUD (optional):** `api.on('hurt', e => bossBar(e.id, e.hp / e.hpMax))` and `api.on('telegraph', …)` for audio cues
(screech / inhale / roar).

## Tests (`node tools/tests/dragons.test.cjs`)
- 10 min raw flight over synthetic hills (up to ~260 m of relief) stays ≥ terrain + 25 m, with |bank| ≤ 60° and no teleport.
- Coordinated-turn bank matches `atan(v·yawRate/g)`, and it recovers from stalls.
- 10 min AI patrol orbiting a moving player over hills keeps clearance ≥ 25 m.
- The breath strafe hits a stationary player inside the cone, for **all 8 dragons**. A 25 m side-roll during the inhale takes 0 ticks.
- The swoop hits a stationary player ≥ 1.2 s after the screech and misses a player who runs during the telegraph.
- A 10 min two-dragon fight: every hit follows its own telegraph by ≥ 0.8 s, there's at most 1 attacker,
  no step moves faster than 50 m/s, and bank stays ≤ 60°.
- Dragons defeated at load never telegraph or hit. A mid-fight defeat runs glide → land → bow → `setDefeated`, with no hostile events after.
- Dragon i-frames and element resistances work, and far dragons tick at 5 Hz.
