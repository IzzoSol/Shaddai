# Blender → Colosseum Workflow

**Goal:** Take Blender models (animated characters) → Export as GLB → Drop into colosseum game

---

## Phase 1: Study Dragon Reference (30 min)

### Open Dragon Reference in Blender

1. **File** → **Open**
2. Navigate to: `C:\Users\Brittany\Shaddai\blender\01_reference\`
3. Open: `Dragon_Animation_Reference.blend` (lightweight, animations only)

### What to Study

```
BONE STRUCTURE (most important):
├─ Root bone
├─ Armature
│  ├─ Spine (lower, mid, upper)
│  ├─ Head
│  ├─ Arms (L/R shoulder, elbow, wrist, fingers)
│  ├─ Legs (L/R hip, knee, ankle, toes)
│  └─ Tail (if applicable)

ANIMATION CLIPS (30 total):
├─ Locomotion (Idle, Walk, Run, Sprint)
├─ Combat (Attack_Light, Attack_Heavy, Defend, Hit)
├─ City (Interact, Emote, Idle_City)
└─ Special (Jump, Roll, Fall, Land)
```

### Key Questions to Answer

- ❓ What's the bone naming convention? (e.g., `Armature_Bone`, `bone.L`, etc.)
- ❓ How many animation clips? (Dragon has 30+)
- ❓ Are animations baked or driven? (Important for export)
- ❓ What's the rest pose T-pose or A-pose?
- ❓ Frame rate? (Usually 30 fps)

---

## Phase 2: Create ORACLE in Blender (Week 1)

### Step 1: T-Pose Model

1. **Reference image:** Use design from `SHADDAI-CHARACTER-DESIGN-ROADMAP.md`
2. **Model in Blender:**
   - Import reference image (as background)
   - Model body (6-8 head proportions, NOT chibi)
   - Add clothing/armor details
   - **Target:** Basic T-pose, no bones yet

### Step 2: Rig (Copy Dragon Structure)

1. **Create Armature** matching Dragon bone structure
2. **Weight paint** each bone to mesh
3. **Test pose** → Verify deformation looks natural
4. **Target:** Clean rig, bendable limbs

### Step 3: Animate (5 Core Clips)

Create these 5 animations (others can come later):

| Clip | Frames | Root Motion | Notes |
|------|--------|-------------|-------|
| **Idle** | 60 | None | Standing still, breathing |
| **Walk** | 40 | Yes | Forward movement, 1.0 speed |
| **Run** | 30 | Yes | Forward movement, 2.0 speed |
| **Attack_Light** | 25 | Yes | Quick slash, hit frame ~15 |
| **Attack_Heavy** | 35 | Yes | Power attack, hit frame ~20 |

**Root Motion:** Character moves forward in world space (not just animation)
- **Walk:** 2 units/second
- **Run:** 4 units/second
- **Attack:** Slight forward push (0.5 units)

---

## Phase 3: Export as GLB

### Export Settings (Critical)

```
File → Export → glTF 2.0 (.glb/.gltf)

✅ MUST CHECK:
  ☐ Format: GLB (binary, not glTF separate)
  ☐ Include: Geometry
  ☐ Include: Animations
  ☐ Include: Armature
  ☐ Bake Animation: YES
  ☐ NLA Strips: YES (if using NLA editor)
  ☐ Frame Range: [1, last_frame]
  ☐ Optimize: Default
  ☐ Extras: Default
  
❌ DO NOT CHECK:
  ☐ Leaf Bones (unless needed)
  ☐ Always Sample Animations (usually unchecked)
```

### Export Filename

```
ORACLE.glb

Location: C:\Users\Brittany\Shaddai\public\models\characters\
```

---

## Phase 4: Verify in Colosseum

### Update Loader Path

**File:** `C:\Users\Brittany\Shaddai\public\colosseum-character-system.js`

Change:
```javascript
// BEFORE
const loader = new PlaceholderCharacterLoader(THREE);

// AFTER
const loader = new CharacterLoader(THREE);
const oracle = await loader.loadCharacter('ORACLE');
```

Also update the character loader to point to your GLB:
```javascript
// Around line ~150 in colosseum-character-system.js
async loadCharacter(characterId) {
  const modelPath = `models/characters/${characterId}.glb`;
  // ... loads the GLB
}
```

### Test in Browser

1. Open `/colosseum-game-demo.html`
2. Select **ORACLE**
3. Click action buttons:
   - **Attack** → Should play `Attack_Light`
   - **Jump** → Should play animation
   - **Move** → Should play `Walk`
4. Watch console for errors

---

## Phase 5: Animation Checklist (All 30 Clips)

Once ORACLE core is working, add remaining animations:

### Locomotion (4)
- [x] Idle
- [x] Walk
- [x] Run
- [ ] Sprint (1.3x speed)

### Combat (8)
- [x] Attack_Light
- [x] Attack_Heavy
- [ ] Attack_Special
- [ ] Defend
- [ ] Parry
- [ ] Hit_Light
- [ ] Hit_Heavy
- [ ] KnockDown

### City (6)
- [ ] Idle_City (standing, no breathing)
- [ ] Interact (pick up object)
- [ ] Emote_Happy
- [ ] Emote_Sad
- [ ] Emote_Angry
- [ ] Emote_Confused

### Special (12)
- [ ] Jump (0.5s airtime)
- [ ] Jump_Land (landing impact)
- [ ] Roll_Forward
- [ ] Roll_Backward
- [ ] Fall
- [ ] Land_Hard
- [ ] Climb_Up
- [ ] Climb_Down
- [ ] Ledge_Grab
- [ ] Slide
- [ ] Stun
- [ ] Death

---

## Troubleshooting

### Model doesn't load in colosseum
- ✓ Check console for 404 errors
- ✓ Verify GLB path is correct
- ✓ Export must include Armature

### Animations don't play
- ✓ Check animation clip names in Blender
- ✓ Verify `ANIMATION_LIBRARY` has clip names
- ✓ Make sure animations are NLA or Action-based

### Model looks wrong
- ✓ Check scale (should be ~1.8-2.0 units tall)
- ✓ Check T-pose orientation (faces +Z, arms out)
- ✓ Verify materials export (may need texture UV maps)

### Performance issues
- ✓ Lower polygon count (<10K triangles for character)
- ✓ Use fewer/simpler textures
- ✓ Combine meshes where possible

---

## File Structure After Export

```
C:\Users\Brittany\Shaddai\
├─ blender/
│  ├─ 01_reference/
│  │  ├─ Dragon_Animation_Reference.blend
│  │  └─ Dragon_Full_Rig_Reference.blend
│  └─ 02_heroes/
│     └─ ORACLE.blend (in progress)
│
└─ public/
   ├─ models/
   │  └─ characters/
   │     ├─ ORACLE.glb ← Ready for game
   │     ├─ ZEROX.glb
   │     ├─ NEXUS.glb
   │     ├─ PIKADON.glb
   │     ├─ TURTLE.glb
   │     └─ QUILL.glb
   │
   ├─ colosseum-character-system.js
   ├─ colosseum-game-demo.html
   └─ colosseum-ecs.js
```

---

## Timeline

| Week | Task | Deliverable |
|------|------|-------------|
| **1** | ORACLE model + rig + 5 clips | ORACLE.glb working in colosseum |
| **2** | ZEROX, NEXUS, PIKADON, TURTLE, QUILL | 5 more GLBs + test |
| **3** | Remaining animations (25 more clips) | Full 30-clip library |
| **4** | Vehicles (4 models) | Vehicle GLBs exported |
| **5** | Cosmetics (color variants) | 21 skins via material variants |
| **6** | Polish + FAL integration | Production ready |

---

## One-Liner Test Commands

**Check if GLB loads:**
```bash
curl -I C:\Users\Brittany\Shaddai\public\models\characters\ORACLE.glb
```

**Open colosseum with ORACLE:**
```
http://localhost:3000/colosseum-game-demo.html
```

---

**Ready? Open Dragon_Animation_Reference.blend and start studying! ⚔️**
