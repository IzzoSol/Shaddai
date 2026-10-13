# SHADDAI Character Animation Pipeline — Blender Prep Checklist

## 📋 Quick Start (Read This First)

**Goal**: Export 6 rigged heroes with animations to GLB format for Three.js

**Pipeline**:
1. Build ONE character (ORACLE) → export GLB → test in browser
2. Rig remaining 5 heroes using same bone structure
3. Animate all clips (locomotion, combat, city, emotes)
4. Export all to `/characters/<NAME>/<NAME>.glb`

**No Fal needed** for animation. Skip image-to-3D—just block mesh + Mixamo clips or hand-animate.

---

## 🎯 Character Specs Summary

| Name | Height | Weapon | Personality |
|------|--------|--------|-------------|
| **ORACLE** | 1.70m | Blade + Orb | Mystic, emissive FX |
| **ZEROX** | 1.82m | Cyber Sword | Sleek, fast strikes |
| **NEXUS** | 1.82m | Pulse Batons | Technical, interface pose |
| **QUILL** | 1.70m | Needle Bow | Graceful archer |
| **TURTLE** | 2.10m | Flail Chain | Heavy, slow, custom rig |
| **PIKADON** | 1.90m | War Hammer | Armored, emblem-chest |

---

## 📁 File Organization

```
Blender/
  CH_Oracle.blend       ← START HERE (template)
  CH_Zerox.blend
  CH_Turtle.blend
  CH_Pikadon.blend
  CH_Quill.blend
  CH_Nexus.blend
  _LIB_Weapons.blend    ← All weapons, linked into each hero

Export Target:
  public/characters/
    ORACLE/ORACLE.glb
    ZEROX/ZEROX.glb
    TURTLE/TURTLE.glb
    PIKADON/PIKADON.glb
    QUILL/QUILL.glb
    NEXUS/NEXUS.glb
```

---

## 🦴 Bone Structure (Human 5: Oracle, Zerox, Nexus, Quill, Pikadon)

### Required Bones (Mixamo-Compatible)
```
Armature
  root            (ground, not skinned)
  Hips
  Spine, Spine1, Spine2
  Neck, Head
  LeftShoulder, LeftArm, LeftForeArm, LeftHand
  RightShoulder, RightArm, RightForeArm, RightHand
  LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase
  RightUpLeg, RightLeg, RightFoot, RightToeBase
```

### Extra Bones (Game Only, Not Sent to Mixamo)
```
  weapon_R        (parented to RightHand, holds sword/orb/baton)
  weapon_L        (parented to LeftHand, optional)
  scabbard        (parented to Spine2, mid-back for sheathed sword)
  quiver          (parented to Spine2, left-back for QUILL)
  orb_socket      (parented to LeftHand for ORACLE)
  helm_fx         (parented to Head for PIKADON lamps)
  roll_center     (parented to Hips, used as roll pivot)
```

### Optional: Fingers (do for Oracle/Quill/Zerox)
```
  LeftHandThumb1-3, LeftHandIndex1-3, LeftHandMiddle1-3,
  LeftHandRing1-3, LeftHandPinky1-3
  (+ Right*)
```

**Bone Roll**: Arms/legs need consistent roll (Ctrl+N → Global +Y) so IK/retargeting works. Test with a 90° bend.

---

## 🐢 Bone Structure (Turtle - Custom Rig)

**DO NOT USE MIXAMO FOR TURTLE**. Hand-animate only these bones:

```
Armature
  root
  Hips
  SpineCoil1, SpineCoil2, SpineCoil3    (accordion neck)
  Head
  LeftArm, LeftForeArm, LeftHand
  RightArm, RightForeArm, RightHand
  LeftUpLeg, LeftLeg, LeftFoot
  RightUpLeg, RightLeg, RightFoot
  Antenna
  ChestLens
  weapon_R        (chain start, NOT glued to hand)
  flail_ball      (detachable ball, animated on curve)
```

**Flail Chain**: `weapon_R → chain_1 → chain_2 → chain_3 → flail_ball`  
Bind pose: ball hanging 0.7m below RightHand. Bake chain via stretch-to or copy-loc before export.

---

## ⚙️ Blender Export Settings

### General
- **Format**: glTF 2.0 (.glb binary)
- **Up Axis**: +Y (or document your choice; Three.js loader handles both)
- **Forward Axis**: -Y or -X (consistent within your project)

### Mesh
- ✅ Apply Modifiers
- ✅ Apply Scalings
- ✅ Remove Keyframes
- ✅ Export Deformation Bones

### Animation
- ✅ Export Animations
- ✅ Animation Mode: Bake Animation
- ✅ Sample Animations every: 1 (30 fps if baked at 30)
- ❌ NLA Strips (export baked actions only)

### Armature
- ❌ Export Armature
- ❌ Export Leaf Bones

### Other
- ❌ Export Cameras
- ❌ Export Lights
- ✅ Export Skins (skinning data)
- ✅ Export All Influences

---

## 📝 Animation Clip Checklist

### Phase 1: Locomotion (v1 Essential)
- [ ] Idle (2.0s, loop)
- [ ] Walk (1.0s, loop, root motion 0.7m stride)
- [ ] Run (0.8s, loop, root motion 1.6m)
- [ ] Sprint (0.7s, loop, root motion 2.0m)
- [ ] Roll (0.55s, root motion 3.0m, i-frames 0.10–0.42s)

### Phase 2: Combat (v1 Essential)
- [ ] Atk_Light_1 (0.45s, hit @ 0.20s)
- [ ] Atk_Light_2 (0.45s, hit @ 0.20s, combo from L1)
- [ ] Atk_Light_3 (0.60s, hit @ 0.22s, combo ender)
- [ ] Atk_Heavy (0.85s, hit @ 0.40s, 0.5m step)
- [ ] Atk_Special (1.20s, hit @ 0.50s, unique per hero)
- [ ] Hit_Light (0.35s)
- [ ] Hit_Heavy (0.55s)
- [ ] Death (1.40s, hold last frame)

### Phase 3: City (v1 Optional)
- [ ] Idle_City (4.0s, loop, softer than arena Idle)
- [ ] Talk (3.0s, loop)
- [ ] Wave (1.40s)
- [ ] Sit_Down (0.70s) → Sit_Idle (3.0s, loop) → Sit_Up (0.70s)

### Phase 4: Emotes (v1 Last)
- [ ] Emote_Cheer (2.0s)
- [ ] Emote_Taunt (2.2s)
- [ ] Emote_Bow (2.0s)
- [ ] Emote_Shrug (1.6s)
- [ ] Emote_Flex (2.0s, Pikadon/Turtle)

---

## 🎬 Blender Animation Workflow (Per Clip)

### Setup
1. **New Action** with exact name from checklist (e.g., `Atk_Light_1`)
2. **Fake User** (F) so it doesn't vanish
3. **Frame 1 = Bind Pose**. Loops: Frame Last = Frame 1
4. **Auto-Key ON**. Quaternion rotation (not Euler on spine).

### Animation Pass Order
```
1. BLOCKING (stepped)     → pose, pose, pose on 10-frame keys
2. SPLINE (smooth)        → T key after approval
3. OVERLAP (offset)       → hands, hair, coat, flail 2–4 frames late
4. CONTACT (IK)           → foot placement, heel roll
5. POLISH (arcs, timing)  → weapon arc, impact intensity
6. BAKE                   → Pose → Animation → Bake Action
                            (visual keying ON, clear constraints ON)
```

### Root Motion (Walk/Run/Sprint/Roll only)
- Move **root** bone in +Y (forward)
- Stride: Walk 0.7m, Run 1.6m, Sprint 2.0m, Roll 3.0m
- Export will bake root into position keys

### Hit Frames (Write to spreadsheet after each clip)
```
Light  attack: impact @ 0.18–0.22s
Heavy  attack: impact @ 0.36–0.42s
Special       : impact @ 0.50s
Roll invuln   : 0.10–0.42s
```

---

## 🔄 Mixamo Fast Path (Humans Only: Oracle, Zerox, Nexus, Quill, Pikadon)

### Step 1: Export T-Pose
```
Blender → File → Export → FBX
  Selection: Mesh + Armature only (no weapons)
  Deformed Mesh: ON
  Armature: ON
  NLA Strips: OFF
  → oracle_tpose.fbx
```

### Step 2: Upload to Mixamo
1. Go mixamo.com → Upload Model
2. Choose "Y Bot" or "X Bot" (match your +Y convention)
3. Auto-Rigged: Yes
4. Skin: Match to your mesh
5. Download: FBX, 30fps, looping clips (Walk, Run, Idle, Attack 1-3)

### Step 3: Retarget to Your Rig
1. Import FBX into Blender
2. Install **Rokoko Animation Retargeting** addon or use Blender's built-in retargeting:
   - Select Mixamo armature → Copy pose
   - Select your rig → Paste special → Pose → Matched
3. Bake the retargeted pose onto your actions

### Step 4: Rename + Attach Weapons
- Rename actions: `Walking` → `Walk`, etc.
- Delete Mixamo rig
- Re-parent weapons to your sockets

### Step 5: Author Specials + Emotes By Hand
- Mixamo will not have character-specific specials or lore-accurate emotes
- Hand-key Atk_Special, Emote_* using the same workflow

---

## 🔧 Quality Checklist (Stop v1 If You Hit These)

### FAIL Conditions:
- [ ] T-pose is the only animation
- [ ] Weapons are welded into body mesh (should be separate, parented)
- [ ] Mixamo clip still named "Walking" (not renamed to our lib)
- [ ] Turtle uses a human-like neck (not accordian)
- [ ] Roll root motion is 0 (should be 3.0m)
- [ ] Hammer head sits inside Pikadon's thigh
- [ ] Two skeletons: one for city, one for combat (should be same rig)

### PASS Conditions:
- [ ] 30m camera distance still reads who is who
- [ ] Combo L1-L2-L3 plays without shoulder pop/clipping
- [ ] Same GLB file plays all clips (Idle, Walk, Run, Atk_Light_1, Atk_Heavy, Roll, Death)
- [ ] Root motion clips slide character forward in-engine
- [ ] Weapons are separate meshes, visible/hidden correctly

---

## 📤 Export Workflow

### Before Export
1. Mute all layers except Mesh + Armature + Weapons
2. Select all (A) → Object → Set Origin → Geometry to Origin
3. Clear all parenting locks / constraints (optional)
4. Frame all (Numpad Period) → view fit
5. **Do NOT apply armature modifier**

### Export Each Character
```
File → Export As → glTF 2.0 (.glb)
  File: public/characters/ORACLE/ORACLE.glb
  Format: glTF Binary (.glb)
  ✅ Apply Modifiers
  ✅ Apply Scalings
  ✅ Export Animations
  ✅ Bake Animation
  ✅ Export Skins
  → Export glTF 2.0
```

### After Export
1. Test in browser: `http://localhost:3000/characters/ORACLE/ORACLE.glb`
2. Verify mixer loads all clips: `model.animations.map(a => a.name)`
3. Play each clip: `mixer.clipAction(model.animations[0]).play()`

---

## 🚀 Build Order (Do NOT Skip Steps)

1. **ORACLE** (template)
   - Mesh + bind pose
   - Bones: full human rig
   - Clips: Idle, Walk, Run, Sprint, Roll, Atk_Light_1, Hit_Light, Death
   - Weapon: sword (separate mesh)
   - ✅ Export, test in browser

2. **Weapons Library**
   - 7 weapons (sword, flail, hammer, bow, orb, batons, etc.)
   - All in `_LIB_Weapons.blend`
   - Linked into each character file

3. **ZEROX** + sword combo
4. **QUILL** + bow
5. **NEXUS** + batons
6. **PIKADON** + hammer + chest emblem
7. **TURTLE** + flail chain + custom rig

8. **Fill Remaining Clips**
   - Use ORACLE as template for timing
   - Duplicate, edit for character personality
   - Atk_Special: 1 per hero (unique lore)
   - Emotes: hand-key once per hero

9. **Polish**
   - IK tweaks
   - Foot contact
   - Weapon arcs
   - Hair/coat overlap

---

## 📊 Deliverables (Stop After Phase 1)

Send to review:
- [ ] `oracle.glb`
- [ ] 5s browser clip: `Idle → Walk → Atk_Light_1 → Roll`
- [ ] Bone list (screenshot + text)
- [ ] Socket positions (weapon_R.location screenshot)
- [ ] `bone-data.json` (optional, for C++ port)

---

## 🎮 In-Engine Integration (After Export)

```javascript
// Load character
const loader = new CharacterLoader(THREE);
const oracle = await loader.loadCharacter('ORACLE');

// Play animation
oracle.setState('idle');          // Idle
oracle.setState('walk');          // Walk
oracle.setState('attack_light_1'); // Attack combo start

// City mode
oracle.enterCity();               // Idle_City + hide weapon
oracle.setState('talk');          // Talk loop
oracle.exitCity();                // Reset, show weapon

// Combat
oracle.attack('heavy');           // Atk_Heavy
oracle.emote('Emote_Cheer');      // Cheer animation
oracle.takeDamage(15);            // Play Hit_Light, reduce HP
```

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| Mixamo clip jittery on retarget | Bake at 60fps, export at 30fps (decimate) |
| Weapons clipping body | Adjust socket position / weapon scale |
| Roll does not slide forward | Root motion not baked; re-export with "Bake Animation" ON |
| Armor overlaps during crouch | Increase bone influence on stomach/chest |
| Combo L1-L2 pops shoulder | Add 0.08s crossfade overlap in code |
| GLB loads but no animations | Check "Export Animations" is ON; actions have Fake User |

---

**Ready to rig! Start with ORACLE, commit the file, and send GLB for testing. 🎬✨**
