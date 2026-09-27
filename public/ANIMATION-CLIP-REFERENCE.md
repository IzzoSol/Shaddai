# Animation Clip Reference — All 30 Clips Specified

**Use this to:**
- Know exactly which clips to create
- Verify animation specifications in Blender
- Check export names (must match exactly)
- Reference frame counts and root motion

---

## 📋 Clip Categories

### 1️⃣ LOCOMOTION (4 clips)

| Clip Name | Frames | FPS | Speed | Root Motion | Idle Action | Notes |
|-----------|--------|-----|-------|-------------|-------------|-------|
| **Idle** | 60 | 30 | 0 | None | Breathing, standing still | Loop. Subtle up/down bob (0.1m amplitude) |
| **Walk** | 40 | 30 | 1.0 m/s | YES ✓ | Forward movement at normal pace | Root motion: 2 units forward over 40 frames |
| **Run** | 30 | 30 | 2.0 m/s | YES ✓ | Fast forward movement | Root motion: 4 units forward over 30 frames. Loop. |
| **Sprint** | 25 | 30 | 3.0 m/s | YES ✓ | Maximum speed | Root motion: 6 units forward. Lean forward. Loop. |

**Root Motion Explanation:**
- At frame 0, character is at origin (0, 0, 0)
- At frame N, character is at (distance, 0, 0)
- The **animation itself** moves the root bone forward
- Game reads this to move character in world space

---

### 2️⃣ COMBAT (8 clips)

| Clip Name | Frames | Hit Frame | Root Motion | Damage | Notes |
|-----------|--------|-----------|-------------|--------|-------|
| **Atk_Light_1** | 25 | 15 | +0.5m | 15 | Quick slash. First attack combo. |
| **Atk_Light_2** | 25 | 14 | +0.3m | 15 | Follow-up light. Chain from Light_1. |
| **Atk_Heavy_1** | 35 | 20 | +1.0m | 25 | Power attack. Knockdown wind-up. |
| **Atk_Heavy_2** | 30 | 18 | +0.8m | 25 | Finishing heavy. Last in combo. |
| **Atk_Special** | 40 | 25 | +1.5m | 35 | Ultimate ability. Long wind-up, big payoff. |
| **Defend** | 20 | N/A | None | 0 | Blocking stance. Can interrupt. |
| **Parry** | 15 | 8 | None | 0 | Counter-attack wind-up (no damage this frame). |
| **Hit_Light** | 10 | N/A | -0.2m | 0 | Knockback reaction. Short stagger. Loop → Idle. |

**Hit Frame:** When damage/knockback applies
**Root Motion:** Push enemy back (negative) or self forward (positive)
**Combo System:**
- Light_1 → Light_2 → Light_1 (chain)
- Heavy_1 → Heavy_2 (end combo)
- Any → Special (reset)

---

### 3️⃣ CITY / INTERACTION (6 clips)

| Clip Name | Frames | Loop | Root Motion | Notes |
|-----------|--------|------|-------------|-------|
| **Idle_City** | 80 | YES | None | Subtle idle in town (less breathing, more aware). |
| **Interact_Pickup** | 20 | NO | None | Bending to pick up object. Plays once. |
| **Emote_Happy** | 30 | NO | None | Celebration. Arm raise, smile (animation only). |
| **Emote_Sad** | 35 | NO | None | Disappointment. Head down, shoulders slump. |
| **Emote_Angry** | 25 | NO | None | Frustration. Fist clench, aggressive stance. |
| **Emote_Confused** | 30 | NO | None | Puzzlement. Head tilt, hand on chin. |

**Loop:** YES = repeats indefinitely, NO = plays once then stops
**Root Motion:** None = character stays in place

---

### 4️⃣ SPECIAL / ADVANCED (12 clips)

| Clip Name | Frames | Notes | Root Motion |
|-----------|--------|-------|-------------|
| **Jump** | 20 | Apex at frame 10. Jump sound at frame 5. | Up 2.5m during frames 0-10, fall 2.5m during frames 10-20. |
| **Jump_Land** | 8 | Landing impact animation. Auto-play after Jump. | None (landing absorbs momentum). |
| **Roll_Forward** | 15 | Quick dodge roll, full-body protection. | +3.0m forward. Invulnerability frames 3-12. |
| **Roll_Backward** | 15 | Dodge roll backward. Mirror of Roll_Forward. | -3.0m backward. Invulnerability frames 3-12. |
| **Fall** | 30 | Free fall (loop until ground contact). | None (velocity handled by physics). |
| **Land_Hard** | 10 | Heavy impact landing. Auto-play after Fall if high. | None. Damage reduction: -20% fall damage. |
| **Climb_Up** | 25 | Pulling up over ledge. Loop. | +0.5m up per frame. |
| **Climb_Down** | 25 | Climbing down wall. Loop. | -0.5m down per frame. |
| **Ledge_Grab** | 15 | Grabbing edge mid-fall. Transition to Climb_Down. | None. Stop falling. |
| **Slide** | 20 | Ground slide on ice or slopes. Loop. | +1.5m forward. Friction reduced. |
| **Stun** | 15 | Dazed, wobbly. Auto-play after heavy hit. | None. Can't move during stun. |
| **Death** | 40 | Collapse animation. Final. | None. Game ends match. |

**Invulnerability (I-frames):** Character can't take damage during these frames
**Auto-play:** Game automatically triggers after specific events
**Loop:** Repeats until player interrupts or event ends

---

## 🎬 Frame Timing Reference (30 FPS)

```
Frames → Seconds at 30 FPS

10 frames = 0.33 seconds
15 frames = 0.50 seconds
20 frames = 0.67 seconds
25 frames = 0.83 seconds
30 frames = 1.00 second
40 frames = 1.33 seconds
60 frames = 2.00 seconds
```

---

## ✅ Blender Action Editor Checklist

For each clip, verify:

- [ ] **Name exact match** (case-sensitive: `Idle`, `Walk`, `Atk_Light_1`, etc.)
- [ ] **Keyframes present** (at least 2: start and end)
- [ ] **End frame set** (Frames: 0 to N, where N is the clip length)
- [ ] **Loop enabled** (if "Loop" = YES in table)
- [ ] **Root motion set** (if not "None")
  - [ ] Root bone has location keyframes
  - [ ] Animation moves X units forward/backward
- [ ] **No extra keyframes** (clean, minimal animation)
- [ ] **Exported** (in NLA strips or Action list)

---

## 📐 Root Motion Math

### Walk Clip Example
```
Frames: 40 at 30 FPS = 1.33 seconds
Distance: 2 units forward
Speed: 2 ÷ 1.33 = 1.5 units/second ✓ (matches "1.0 m/s" in table)

Setup in Blender:
Frame 0: Root bone at X = 0
Frame 40: Root bone at X = 2
Result: Animation plays, character moves 2 units in world space
```

### Jump Example
```
Jump height: 2.5 units
Ascent frames: 0-10 (0.33 seconds)
Descent frames: 10-20 (0.33 seconds)

Setup in Blender:
Frame 0: Root bone at Z = 0
Frame 10: Root bone at Z = 2.5 (peak)
Frame 20: Root bone at Z = 0 (ground)
Result: Character jumps 2.5m high
```

---

## 🔤 Naming Convention (MUST MATCH EXACTLY)

**Format:** `Action_Type_Number` (if multiple variants)

**Examples:**
- ✅ `Idle` (single action)
- ✅ `Atk_Light_1` (first variant)
- ✅ `Jump_Land` (compound name)
- ❌ `idle` (lowercase, won't match)
- ❌ `attack_light` (underscore style, wrong format)
- ❌ `AttackLight1` (camelCase, wrong format)

**Case sensitivity:** `Idle` ≠ `idle` ≠ `IDLE`

---

## 📊 Export Verification

When exporting from Blender, verify:

**Export Dialog:**
- Format: **GLB** (not glTF)
- Include: **Animations** ✓
- Include: **Armature** ✓
- Bake Animation: **YES** ✓
- NLA Strips: **YES** (if using NLA editor)

**Result:**
- File size: 5-50 MB (typical for character + 30 clips)
- All 30 clip names appear in GLB (check with validator)

---

## 🎯 Per-Hero Checklist

For each hero (ORACLE, ZEROX, NEXUS, PIKADON, TURTLE, QUILL, SHADDAI):

```
Locomotion (4):    Idle, Walk, Run, Sprint
Combat (8):        Atk_Light_1, Atk_Light_2, Atk_Heavy_1, Atk_Heavy_2, 
                   Atk_Special, Defend, Parry, Hit_Light
City (6):          Idle_City, Interact_Pickup, Emote_Happy, Emote_Sad, 
                   Emote_Angry, Emote_Confused
Special (12):      Jump, Jump_Land, Roll_Forward, Roll_Backward, Fall, 
                   Land_Hard, Climb_Up, Climb_Down, Ledge_Grab, Slide, 
                   Stun, Death

TOTAL: 30 clips per hero × 7 heroes = 210 animations
```

---

## 📞 If Animation Name Doesn't Match

**Error in game:** `"Unknown animation clip: Atk_Light"`

**Fixes:**
1. Open `ANIMATION_LIBRARY` in `colosseum-character-system.js`
2. Find the clip name in the code
3. Copy exact name (case-sensitive)
4. Re-name animation in Blender to match exactly
5. Re-export GLB
6. Re-validate with character-export-validator.html
7. Test in game

---

## 🎬 Animation Timeline Example (Walk Clip)

```
Frame:  0   5   10   15   20   25   30   35   40
        |---|---|-----|-----|-----|-----|-----|
Idle        ↓ Walk starts
        Left foot step 1
                 ↓ Walk cycles
        Right foot step 1
                          ↓ Walk cycles
        Left foot step 2
                               ↓ Loop point
        Right foot step 2
                                    ↓ Back to frame 0
        
Root X: 0   0.2 0.4  0.6  0.8  1.0  1.2  1.4  2.0 (units forward)
```

---

**Print this page. Tape it to your desk. Reference during rigging.** ✅
