# Animation library (shared by every agent)

Step 1 of the build order in [GAME-SYSTEMS-PLAN.md](GAME-SYSTEMS-PLAN.md) §10, covering §1 (the shared animation set).
One file of clips works on every Meshy v6 agent. Walk and run are speed-matched, so the feet do not slide.

| File | What it is |
|---|---|
| `public/assets/anim/agent-clips.glb` | 24-bone skeleton plus 75 clips. No mesh, skin or textures. **1.41 MB** (about 650 KB gzipped). Plain glTF 2.0: rotations are normalized SHORT, so no decoder extension is needed. |
| `public/assets/anim/agent-clips.json` | Per-clip metadata: duration, loop, inPlace, speedMps, tags, hitFrames/hitTimes, rootMotionM, footPhase, and the canonical skeleton. About 28 KB. |
| `public/world-anim.js` | `window.buildAgentAnimator(...)`: the runtime. |
| `tools/anim/build-anim-library.mjs` | Rebuilds both asset files in about 10 s. Dependencies are in `tools/ual/node_modules`, nothing new was added. |
| `tools/tests/world-anim.test.cjs` | 13 node tests using real three, the built GLB and the real v6 rigs. |
| `tools/anim/make-pose-sheet-glb.mjs` + `render-anim-sheet.py` | Contact sheet, [img/anim-sheet-v1.png](img/anim-sheet-v1.png). |

![contact sheet](img/anim-sheet-v1.png)

## How it works

- **Sources**
  1. Meshy merged-animation exports from the owner's Meshy account:
     - Emerald Enforcer: 20 clips
     - Neon Valkyrie: 20 clips
     - After deduping by name: **33 unique**
  2. Quaternius **UAL2 Standard (CC0)**, 39 clips. A_TPose and the Zombie clips are skipped. The clips are solved onto the canonical bones by the existing direction retargeter (`public/ual-retarget.js`), using the baked `public/assets/anims/ual2-dirs.json`.
  3. Three derived clips:
     - `Roll`: the tuck cut from Run_Jump_and_Roll.
     - `Sit_Chair_Loop`: a synthetic pose from UAL directions, with thighs level, shins down and hands on the knees.
     - `Lie_Down`: LayToIdle reversed. It is used as death and knockdown, and `LayToIdle` is the get-up.
- **Canonical skeleton = ZEROX v6 bind**, taken from the inverse bind matrices.
  - The bone *names* match across all Meshy rigs, but the bind *frames* do not:
    - The Enforcer's Hips frame is about 100° off the v6 rigs.
    - Limb roll differs by up to about 35°.
  - So sources are mapped in model space: `W_canon = W_src · K`.
    - On the Hips, K is the full bind delta.
    - On limbs, K is only the twist about the bone. Limb directions come from the source, roll comes from the rig.
  - At runtime the animator applies the same mapping from the canonical skeleton to each rig:
    - ZEROX: an exact no-op.
    - NEXUS/SHADDAI/TURTLE: a few degrees of roll.
- **Hips path**
  - It is scaled by the *leg-length* ratio, not hip height, and re-based on the ankle height.
  - Each clip is then re-seated so its lowest ankle sits at the bind ankle height:
    - Meshy's own clips sank the feet 4–6 cm.
    - UAL clips were 7 cm low.
  - Airborne and lying clips get their source's median offset instead.
- **In place**
  - Hips XZ minus the straight start→end line, so sway stays but the body ends where it started.
  - The removed distance is `rootMotionM [x, z]` (metres, +Z = facing). If you want a lunge or roll to travel, move the capsule by that amount.
  - `inPlace: false` flags clips whose hips wander more than 0.6 m mid-clip (lunges, Kung_Fu_Punch, the struts, handstand). They still end on the spot.
- **Natural speed** (`speedMps`)
  - Measured from the planted foot on the canonical rig: while a foot is lowest and within 4 cm of the floor, it moves backward at walking speed.
  - The Meshy locomotion clips have no root motion, so the planted foot is the only measure.
  - Results: **Walking 1.67 m/s, Running 5.81 m/s**, Sneaky 0.50, Flirty strut 0.90, Walk_Carry 0.65.
  - Speeds are for ZEROX's leg length (0.86 m thigh+shin). The runtime scales strides by each rig's leg length × world scale.
- **hitFrames**: a guess. The builder takes the fastest end-effector moments (hands and toes, measured relative to the hips) and moves each forward to the peak extension within 0.15 s. Edit `hitTimes` in the JSON if one feels early or late. The runtime reads it.
- **Size**:
  - Resampled to 30 fps.
  - Greedy keyframe reduction:
    - 0.23° on rotations.
    - 1.5 mm on the Hips.
    - Long dances are fed to the reducer at 15 fps.
  - `head_end`/`headfront` are constant.
  - Quaternions are int16.

## Runtime

```js
const anim = window.buildAgentAnimator({ THREE, model: gltf.scene, clips: lib.animations, meta, unitsPerMetre: U });
// every frame:
anim.setLocomotion(speedMps, grounded);   // idle/walk/run blend; timeScale = speed / clip.speedMps; air loop when !grounded
anim.update(dt);                          // allocation-free
// events:
anim.play('Sword_Regular_Combo', { onHit: (i) => dealDamage(i) });   // upper-body layer automatically while moving (meta.upperOk)
anim.play('Lunge_Spin_Kick', { layer: 'full', fade: 0.1, onEnd: () => {} });
anim.jump(); anim.roll(); anim.land();    // land() also fires by itself when grounded flips back to true
anim.play(meta.actions.sit, { once: false }); anim.stop(0.3);
```

- **Blending**
  - Idle, walk and run weights always sum to 1.
  - Between gaits, the stride and cycle length blend, so both clips finish a cycle in the same time (phase-locked on the left heel strike, `footPhase`).
  - Above the run speed, the run speeds up to 1.6×. There is no sprint clip yet.
- **Layers**
  - `full` overlays replace the whole body.
  - `upper` overlays replace Spine02 and above, while the legs keep the locomotion.
  - The locomotion clips are split into lower and upper halves so the weights on every bone sum to 1.
- **Retargeting per rig** is lazy: a clip is converted the first time it is played, then cached. Rigs identical to the canonical one (ZEROX) share the library clips directly.
- **No allocation in `update()`**
  - The runtime writes three's action `timeScale`/weight only when they change, because three boxes each double write.
  - At a held speed the animator itself allocates 0 bytes per frame. `mixer.update()` has its own internal cost.

## Host snippet (not wired into any HTML yet)

```js
// after the agent GLB loads (gltf = the agent, U = 7/1.8 units per metre)
const [lib, meta] = await Promise.all([
  new Promise((r, j) => gltfLoader.load('/assets/anim/agent-clips.glb', r, undefined, j)),   // load once, share
  fetch('/assets/anim/agent-clips.json').then((r) => r.json()),
]);
const anim = window.buildAgentAnimator({ THREE, model: gltf.scene, clips: lib.animations, meta, unitsPerMetre: U });
// in the player/NPC tick:  anim.setLocomotion(horizontalSpeed / U, onGround); anim.update(dt);
// jump key: anim.jump();  dodge: anim.roll();  attack: anim.play(name, { onHit })
```

- Add `<script src="world-anim.js"></script>` next to the other `world-*.js` classic scripts.
- Pass `gltf.scene` itself as `model`, because the inverse bind matrices are in its frame. Scale and place a wrapper, not the scene, or pass the scene and let the animator read its world scale.
- `unitsPerMetre` only affects stride scaling. Clips drive bones, so they are unit-free.

## Adding clips

1. Meshy: export "merged animations" for any biped from the owner's Meshy account and add its path to `SOURCES` in `build-anim-library.mjs`.
   - Same bone names means no other work.
   - The first source wins on duplicate names.
2. UAL: re-bake `ual2-dirs.json` with `tools/ual/bake-ual.mjs` (UAL1 would add swim, death, crouch and more). New clip names are picked up automatically.
3. Mixamo FBX: convert to GLB with Blender, rename bones `mixamorig:X` → Meshy names, then add it as a source. The K-mapping handles differing bind frames.
4. Classify by adding a regex to `TAGS`, `LOOP`, `LOCO` or `NO_GROUND` if the clip is airborne or lying.
5. Run `node tools/anim/build-anim-library.mjs` and then `node tools/tests/world-anim.test.cjs < /dev/null`.

## Gaps and Mixamo re-download wishlist

The following are **not** in the library yet:
- swim idle/stroke
- a true dodge roll and death fall (we cut or reverse)
- sprint
- strafe L/R
- walk back
- turn in place
- crouch
- sit variants
- lie-in-bed
- talk/wave/point/cheer
- most work loops

The third-party three.ws repo (All rights reserved) has several of these as Mixamo clips. **We do not ship its files.** The owner can re-download the same moves from mixamo.com on their own account (free, and usable in games):

| Want (Mixamo name) | For |
|---|---|
| Digging, dig and plant seeds, plant a plant, plant tree, pull plant, pick fruit, watering, cow milking, wheelbarrow idle / walk / walk turn / dump | farming job loops |
| box idle, box walk arc, box turn, holding walk, holding turn left/right | courier / carry jobs |
| Kneeling Idle, Sitting Clap, Sitting Laughing, Leaning On A Wall, Listening To Music, Looking Down | social / idle variety, sit variants |
| Salute, Taunt, Angry, Praying, Defeat, Defeated, Joyful Jump, Reaction | emotes, victory/defeat poses |
| Dying, Falling, falltolanding, Jumping Down, Shoved Reaction With Spin, Dodging Right | death, fall, hard landing, hit-react, dodge |
| Walk Strafe Left (+ Right), Stepping Backward, Crouch To Stand, Cover To Stand | strafe, walk back, crouch |
| Hip Hop / Rumba / Silly / Rap Dancing, Capoeira, Thriller Part 3 | unlockable emotes |
| Swimming, Treading Water, Sprint, Typing, Talking, Waving, Pointing, Cheering (not in three.ws, same Mixamo library) | swim, sprint, office/shop work, social |

## Clip table

Idle is `Idle_No_Loop` (UAL2). jump = NinjaJump start / loop / land. roll = `Roll`. death = `Lie_Down`, get-up = `LayToIdle`. sit = `Sit_Chair_Loop`. The full mapping is in `meta.locomotion` and `meta.actions`.

| Clip | s | Loop | Speed m/s | In place | Tags | Hit times (s) | Source |
|---|---|---|---|---|---|---|---|
| 360_Power_Spin_Jump | 3.07 | once |  | no (0.832 m) | attack, traversal | 1.033 / 1.367 / 1.967 | meshy:enforcer |
| Backflip | 2.13 | once |  | yes | traversal |  | meshy:valkyrie |
| Backflip_Sweep_Kick | 4.83 | once |  | no (0.772 m) | attack | 1.733 / 2.1 / 2.833 / 3.333 / 3.867 / 4.1 | meshy:enforcer |
| Boxing_Practice | 6.83 | loop |  | no (1.413 m) | attack | 0.633 / 1.267 / 1.6 / 1.9 / 2.567 / 3.633 | meshy:enforcer |
| Cardio_Dance | 4.30 | loop |  | yes | emote |  | meshy:valkyrie |
| Charged_Upward_Slash | 3.20 | once |  | no (0.845 m) | attack (upperOk) | 1.133 | meshy:enforcer |
| Chest_Open | 1.37 | once |  | yes | work |  | ual2 |
| ClimbUp_1m | 0.67 | once |  | yes | traversal |  | ual2 |
| Confident_Strut | 2.67 | loop |  | yes | emote |  | meshy:enforcer |
| Consume | 1.33 | once |  | yes | social, work |  | ual2 |
| Crystal_Beads | 6.17 | loop |  | yes | emote |  | meshy:valkyrie |
| Denim_Pop_Dance | 16.00 | loop |  | no (1.015 m) | emote |  | meshy:valkyrie |
| Double_Blade_Spin | 5.67 | once |  | no (1.826 m) | attack | 0.833 / 1.133 / 1.6 | meshy:enforcer |
| Double_Combo_Attack | 2.83 | once |  | yes | attack | 0.667 / 1.2 | meshy:enforcer |
| Double_kick_forward | 2.60 | once |  | yes | attack | 0.933 / 1.3 / 1.5 | meshy:valkyrie |
| Farm_Harvest | 2.50 | once |  | yes | work |  | ual2 |
| Farm_PlantSeed | 2.77 | once |  | yes | work |  | ual2 |
| Farm_Watering | 3.80 | once |  | yes | work |  | ual2 |
| Flirty_Strut_inplace | 3.23 | loop | 0.903 | yes | locomotion, emote |  | meshy:enforcer |
| Flying_Fist_Kick | 4.67 | once |  | no (1.121 m) | attack | 1.967 / 2.933 | meshy:enforcer |
| FunnyDancing_03 | 8.03 | loop |  | yes | emote |  | meshy:valkyrie |
| Gangnam_Groove | 10.13 | loop |  | yes | emote |  | meshy:enforcer |
| Hip_Hop_Dance_4 | 4.90 | loop |  | no (0.646 m) | emote |  | meshy:valkyrie |
| Hit_Knockback | 0.83 | once |  | yes | react |  | ual2 |
| Idle_FoldArms_Loop | 2.50 | loop |  | yes | social, idle |  | ual2 |
| Idle_Lantern_Loop | 2.50 | loop |  | yes | idle |  | ual2 |
| Idle_No_Loop | 2.50 | loop |  | yes | emote, social, idle |  | ual2 |
| Idle_Rail_Call | 2.50 | once |  | yes | social, idle |  | ual2 |
| Idle_Rail_Loop | 2.50 | loop |  | yes | social, idle |  | ual2 |
| Idle_Shield_Break | 1.07 | once |  | yes | block, idle |  | ual2 |
| Idle_Shield_Loop | 2.50 | loop |  | yes | block, idle |  | ual2 |
| Idle_TalkingPhone_Loop | 2.93 | loop |  | yes | social, idle |  | ual2 |
| Indoor_Swing | 8.00 | loop |  | yes | emote |  | meshy:enforcer |
| Kung_Fu_Punch | 7.30 | once |  | no (1.814 m) | attack | 1.033 / 1.4 / 2.767 / 3.733 | meshy:enforcer |
| Large_step_then_high_kick | 2.00 | once |  | no (0.811 m) | attack | 0.933 / 1.6 | meshy:valkyrie |
| LayToIdle | 1.53 | once |  | yes | idle, react, getup |  | ual2 |
| Left_Jab_from_Guard | 1.77 | once |  | yes | attack (upperOk) | 0.467 / 1 | meshy:valkyrie |
| Lie_Down | 1.53 | once |  | yes | react, death |  | ual2, LayToIdle reversed |
| Lunge_Roundhouse_Kick | 3.00 | once |  | no (1.569 m) | attack | 0.533 / 0.9 / 2.067 / 2.267 / 2.7 | meshy:enforcer |
| Lunge_Spin_Kick | 1.63 | once |  | yes | attack | 0.933 / 1.367 | meshy:enforcer |
| Melee_Hook | 0.47 | once |  | yes | attack (upperOk) | 0.267 | ual2 |
| Melee_Hook_Rec | 0.60 | once |  | yes | attack (upperOk) | 0.367 | ual2 |
| NinjaJump_Idle_Loop | 2.00 | loop |  | yes | traversal, idle |  | ual2 |
| NinjaJump_Land | 1.27 | once |  | yes | traversal |  | ual2 |
| NinjaJump_Start | 0.97 | once |  | yes | traversal |  | ual2 |
| One_Arm_Handstand | 3.83 | once |  | no (1.027 m) | traversal, emote |  | meshy:valkyrie |
| OverhandThrow | 1.33 | once |  | yes | attack (upperOk) | 0.367 | ual2 |
| Parkour_Vault_with_Roll | 2.10 | once |  | no (0.729 m) | traversal |  | meshy:enforcer |
| Rising_Flying_Kick | 1.50 | once |  | no (0.733 m) | attack | 0.433 / 0.9 / 1.2 | meshy:valkyrie |
| Roll | 1.13 | once |  | yes | traversal |  | meshy:enforcer, cut from Run_Jump_and_Roll 2.02-3.15s |
| Run_Jump_and_Roll | 3.43 | once |  | yes | traversal |  | meshy:enforcer |
| Running | 0.63 | loop | 5.814 | yes | locomotion |  | meshy:enforcer |
| Shield_Dash | 1.10 | once |  | yes | attack | 0.233 | ual2 |
| Shield_OneShot | 0.83 | once |  | yes | attack (upperOk) | 0.167 | ual2 |
| Sit_Chair_Loop | 1.00 | loop |  | yes | social, sit |  | ual2-synthetic (UAL direction pose) |
| Slide_Exit | 0.50 | once |  | yes | traversal |  | ual2 |
| Slide_Loop | 2.00 | loop |  | yes | traversal |  | ual2 |
| Slide_Start | 0.83 | once |  | yes | traversal |  | ual2 |
| Sneaky_Walk_inplace | 2.87 | loop | 0.492 | yes | locomotion |  | meshy:enforcer |
| Step_in_High_Kick | 1.30 | once |  | no (0.757 m) | attack | 0.5 | meshy:valkyrie |
| Step_Step_Turn_Kick | 2.00 | once |  | no (1.175 m) | attack | 1.267 / 1.6 | meshy:valkyrie |
| Sword_Block | 1.23 | once |  | yes | block |  | ual2 |
| Sword_Dash | 1.57 | once |  | yes | attack | 0.367 | ual2 |
| Sword_Heavy_Combo | 4.33 | once |  | yes | attack (upperOk) | 0.667 / 1.333 / 2 / 2.567 | ual2 |
| Sword_Regular_A | 0.43 | once |  | yes | attack (upperOk) | 0.333 | ual2 |
| Sword_Regular_A_Rec | 0.97 | once |  | yes | attack (upperOk) |  | ual2 |
| Sword_Regular_B | 0.53 | once |  | yes | attack (upperOk) | 0.267 | ual2 |
| Sword_Regular_B_Rec | 1.03 | once |  | yes | attack (upperOk) |  | ual2 |
| Sword_Regular_C | 2.00 | once |  | yes | attack (upperOk) | 0.667 | ual2 |
| Sword_Regular_Combo | 3.00 | once |  | yes | attack (upperOk) | 0.333 / 0.767 / 1.233 / 1.667 | ual2 |
| TreeChopping_Loop | 0.97 | loop |  | yes | work |  | ual2 |
| Triple_Combo_Attack | 4.33 | once |  | no (0.93 m) | attack | 0.933 / 1.6 / 2.267 | meshy:enforcer |
| Walk_Carry_Loop | 2.00 | loop | 0.654 | yes | locomotion, work |  | ual2 |
| Walking | 1.03 | loop | 1.67 | yes | locomotion |  | meshy:enforcer |
| Yes | 2.50 | once |  | yes | emote, social |  | ual2 |
