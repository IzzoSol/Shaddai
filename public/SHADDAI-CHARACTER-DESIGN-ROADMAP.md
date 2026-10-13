# SHADDAI Character Design Roadmap — Map First, FAL Later

**Phase 1 (Now)**: Map designs + reference images  
**Phase 2 (Blender)**: Model + rig + animate + preview in-engine  
**Phase 3 (Polish)**: Perfect looks via render previews  
**Phase 4 (FAL)**: Final high-quality assets when designs locked  

---

## 🎯 Phase 1: Design Mapping (NO FAL SPEND)

### 7 Agents — Reference Images Collected

| Agent | Vibe | References | Status |
|-------|------|-----------|--------|
| **ORACLE** | Purple Mystic | Images #1-2 (purple mage, orb, dual weapons) | ✅ Mapped |
| **ZEROX** | Cyan Knight | Cyber-sleek, dual cannons, neon seams | ✅ Mapped |
| **NEXUS** | Lime/Magenta Tech | Image #8 (neon runner, modular armor) | ✅ Mapped |
| **PIKADON** | Orange Tank | Heavy armor, glowing chest emblem | ✅ Mapped |
| **TURTLE** | Green Beast | Image #3 (tech hybrid, accordion neck, flail) | ✅ Mapped |
| **QUILL** | Gold Archer | Graceful, feathered pauldrons, bow | ✅ Mapped |
| **SHADDAI** | Royal Commander | Elegant, staff/dual blade, crown | ✅ Mapped |

### Vehicles — Reference Images Locked

| Vehicle | Vibe | Reference | Status |
|---------|------|-----------|--------|
| **Dune Wheel** | Desert Mech | Image #6 (spherical yellow sphere) | ✅ Locked |
| **Mechanical Bird** | Sky Mount | Image #5 (winged tech, blue/orange) | ✅ Locked |
| **Beast Mount** | Organic Hybrid | Image #3-4 (armored creature, rider) | ✅ Locked |
| **Rimba Racer** | Speed Dash | (lime/neon aesthetic, optional) | 🔄 Consider |

### Cosmetics — Color Palette Locked

**Approach**: Each agent gets 1 base concept, rest are Blender recolors

**Palettes Per Agent**:
- **ORACLE**: Purple, Gold, Void
- **ZEROX**: Cyan, Obsidian, Chrome
- **NEXUS**: Lime+Magenta, Pink+Yellow, Matrix
- **PIKADON**: Orange/Gold, Rust, Platinum
- **TURTLE**: Forest, Jade, Mossy
- **QUILL**: Gold/Tan, Rust, Pearl
- **SHADDAI**: Purple/Gold, Black/Silver, Emerald

**Total Cosmetics**: 21 skins (7 agents × 3 = 21)

---

## 📐 Phase 2: Blender Build (Reference-Driven, Free)

### Workflow: "See the design → Model it → Animate it → Preview in-engine"

### ORACLE (Template Hero)
```
Week 1:
  Day 1: Model T-pose (reference images as viewport overlay)
  Day 2: Rig (Mixamo-compatible bones)
  Day 3-4: Animate 30 clips (locomotion, combat, city, emotes)
  Day 5: Export GLB
  Day 6: Test in colosseum (preview 5 clips)
```

**Preview in Colosseum** (before polish):
- Load GLB in `/colosseum-arena-master.html`
- Play Idle → Walk → Run → Attack → Roll
- Check: proportions, silhouette, readability at 30m
- Feedback: does it FEEL right?

### Remaining 6 Agents (Parallel)
```
Week 2-3:
  Same workflow per hero
  Use ORACLE rig as template
  Adapt bone positions to height
  Generate all 30 clips (with Blender render preview)
```

### Vehicles
```
Week 3-4:
  Model each vehicle (reference-driven)
  Simple rig for mount points (rider placement)
  Export GLB
  Test mount mechanics in-engine
```

---

## 🎬 Phase 3: Polish Via Render Preview (No FAL)

### Blender Render Workflow

**Goal**: Visualize animations BEFORE FAL spend

**Steps**:
1. Open Blender, load character GLB
2. Render each animation clip (30 frames per clip, 2s preview)
3. Review: proportions, silhouette, movement quality
4. Mark: "looks good" or "needs adjustment"
5. Re-export and re-test in colosseum

**Output**: 30-second preview video per hero showing all animations

**Cost**: $0 (Blender-native render, GPU preview)

### Colosseum Preview Loop

```javascript
// Load placeholder → see it animate → gather feedback
const loader = new PlaceholderCharacterLoader(THREE);
const oracle = loader.loadCharacter('ORACLE');

// Play all 30 animations in sequence
const clips = ['Idle', 'Walk', 'Run', 'Attack_Light_1', 'Attack_Heavy', ...];
for (const clip of clips) {
  oracle.play(clip);
  // Render 2s preview, capture screenshot
}
```

### Feedback Checklist

- [ ] Silhouette reads at 30m camera distance
- [ ] Proportions match reference (not too chibi)
- [ ] Combat animations have impact (hit frames clear)
- [ ] Roll animation feels responsive
- [ ] Weapon does not clip body
- [ ] Idle breathing looks natural
- [ ] Outfit cosmetics (recolors) apply cleanly
- [ ] Emotes are fun / expressive
- [ ] City animations (talk, wave) are smooth

**If issues**: Fix in Blender, re-render, re-test (cycle until locked)

---

## 🔒 Phase 4: FAL Spend (When Designs Locked)

**Only after Phases 1-3 are 100% approved:**

### FAL Budget ($90) — Spend When Ready

```
Week 4-5 (Tentative):
  $35  →  7 agent final concepts (high-fidelity reference)
  $20  →  4 vehicle final concepts
  $15  →  cosmetic texture variations
  $5   →  reserve / emergency polish

Output: Final reference art for Blender texture pass
```

### Why Wait?
- **Design approval first**: Catch silhouette/proportion issues BEFORE generation
- **Save credits**: Avoid regenerating if reference was wrong
- **Lean spending**: Use Blender renders instead of FAL previews
- **Quality**: FAL art based on LOCKED design = better results

---

## 🎮 Colosseum Integration (Parallel)

### Right Now (Today)
```
✅ ECS architecture ready
✅ Placeholder characters loaded
✅ Game modes + terrain system ready
✅ Combat system wired
```

### As Blender Work Progresses
```
→ Export first GLB (ORACLE)
→ Swap PlaceholderLoader → CharacterLoader (1-line change)
→ Play real animations
→ Test combat in colosseum
→ Add remaining heroes as GLBs ready
```

### Final State (Week 4)
```
✅ 7 heroes with animations
✅ 4 vehicles + mounts
✅ 21 cosmetic skins
✅ Full game loop playable
→ THEN show to FAL for final concept art if desired
```

---

## 📋 Detailed Agent Specs (Locked Design)

### ORACLE (Reference: Images #1-2)
**Design**: Purple mystic mage with glowing orb, dual weapons, robes + harness
- **Height**: 1.70m (slender, taller frame)
- **Body**: Robed torso, exposed arms with tech bracers
- **Head**: Long black hair with purple glow, pointed ears (optional)
- **Weapons**: 
  - Left: Energy blade (bright purple glow)
  - Right: Summoning orb (pulsing aura, 0.3m diameter)
- **Clothing**: Purple robes, gold trim, harness with pouches
- **Cosmetics**:
  - Primary: Purple + Gold
  - Alt 1: Void Black + Silver (dark sorceress)
  - Alt 2: Gold + White (radiant healer)
- **Silhouette Test**: ✅ Unique (pointy, magical, sleek)

### ZEROX (Cyber Knight)
**Design**: Sleek cyan warrior, glowing seams, dual wrist cannons
- **Height**: 1.82m (athletic)
- **Body**: Form-fitting armor, glowing neon seams (bright cyan)
- **Head**: Helm with visor, sleek angles
- **Weapons**:
  - Dual wrist blasters (emerge from gauntlets)
  - Cyber sword (thin blade, neon edge)
- **Clothing**: Tactical bodysuit, armor plates, glowing accents
- **Cosmetics**:
  - Primary: Cyan + Black
  - Alt 1: Obsidian + Gray (stealth)
  - Alt 2: Chrome + White (mirror)
- **Silhouette Test**: ✅ Unique (narrow, aggressive, tech)

### NEXUS (Tech Engineer)
**Design**: Modular neon armor, LED accents, interface pose (from Image #8)
- **Height**: 1.82m (athletic)
- **Body**: Lime green base, hot magenta accents, modular panels
- **Head**: Headset with LED visor, curly hair (cyberpunk)
- **Weapons**:
  - Pulse batons (dual wield, energy whips)
  - Interface gloves (gesture-based)
- **Clothing**: Tactical jacket (lime), smart-fabric pants (magenta stripe), boots
- **Cosmetics**:
  - Primary: Lime + Magenta (neon)
  - Alt 1: Cyberpunk Pink + Yellow
  - Alt 2: Matrix Green + Black
- **Silhouette Test**: ✅ Unique (bold colors, tech-forward)

### PIKADON (Heavy Armor)
**Design**: Armored tank with glowing chest emblem, oversized pauldrons
- **Height**: 1.90m (stocky)
- **Body**: Plate armor, heavy shoulders, glowing emblem on chest (pulsing light)
- **Head**: Combat helm with visor, forehead plate
- **Weapons**:
  - War hammer (2-handed, heavy head)
  - Parry shield (optional back-worn)
- **Clothing**: Heavy metal plates, reinforced joints, industrial aesthetic
- **Cosmetics**:
  - Primary: Orange + Gold
  - Alt 1: Rust + Brown (weathered)
  - Alt 2: Platinum + White (ceremonial)
- **Silhouette Test**: ✅ Unique (broad, imposing, heavy)

### TURTLE (Beast Warrior)
**Design**: Hybrid turtle + robot, accordion neck, flail, spikes (from Image #3)
- **Height**: 2.10m (tallest, bulky)
- **Body**: Green/tan shell, tech reinforcements, spikes along back
- **Head**: Turtle-like (not human), accordion neck (3 segments), forward-facing eyes
- **Weapons**:
  - Flail ball (chain animated, NOT glued to hand)
  - Shell ram (butting attack)
- **Clothing**: None (organic + armor hybrid) / Tech harness across shell
- **Cosmetics**:
  - Primary: Forest Green + Tan (natural)
  - Alt 1: Jade Emerald (polished, magical)
  - Alt 2: Mossy Gray (ancient)
- **Silhouette Test**: ✅ Unique (bulky, alien, non-humanoid)

### QUILL (Graceful Archer)
**Design**: Swift archer with feather-wing pauldrons, needle bow
- **Height**: 1.70m (slender, lithe)
- **Body**: Toned frame, feather-like pauldrons, exposed arms
- **Head**: Pointed ears (fae-like), long hair
- **Weapons**:
  - Needle bow (unstrung at idle, draw animation shows string)
  - Dual needles (thrown as secondary)
  - Quiver on back
- **Clothing**: Leather bodysuit, feather accents, boots, arm guards
- **Cosmetics**:
  - Primary: Gold + Tan (natural archer)
  - Alt 1: Autumn Rust + Brown (weathered)
  - Alt 2: Pearl White + Gold (celestial)
- **Silhouette Test**: ✅ Unique (pointed, graceful, ranged)

### SHADDAI (Supreme Orchestrator)
**Design**: Regal leader, elegant robes, staff or dual blade, crown aesthetic
- **Height**: 1.85m (commanding)
- **Body**: Regal posture, elegant drape, gold accents
- **Head**: Crown or helm (optional), authoritative presence
- **Weapons**:
  - Elegant staff (with glowing top) OR
  - Dual elegant blades (for melee variant)
- **Clothing**: Royal robes, gold trim, ceremonial armor
- **Cosmetics**:
  - Primary: Royal Purple + Gold (authority)
  - Alt 1: Black + Silver (formal council)
  - Alt 2: Emerald + Obsidian (tactical)
- **Silhouette Test**: ✅ Unique (tall, elegant, commanding)

---

## ✅ Checklist Before FAL Spend

- [ ] All 7 agent GLBs exported and tested
- [ ] 30 animation clips per agent playing in colosseum
- [ ] Silhouette test at 30m camera distance ✅
- [ ] Combat animations hit frames verified
- [ ] Cosmetic recolors applied in Blender
- [ ] Vehicles modeled and tested
- [ ] Render previews captured (showcase video)
- [ ] Feedback from gameplay testing integrated
- [ ] Designs LOCKED (no more changes)

**THEN**: Spend $90 FAL on final high-fidelity concept art and textures

---

## 🚀 Timeline

| Week | Phase | Output |
|------|-------|--------|
| **Week 1** | Phase 1 (Design mapping) | Reference image collection ✅ (today) |
| **Week 1-2** | Phase 2 (Blender) | ORACLE GLB + 30 clips |
| **Week 2-3** | Phase 2 (Blender) | 6 agent GLBs + vehicles |
| **Week 3-4** | Phase 3 (Render preview) | Feedback loop → design polish |
| **Week 4** | Phase 3 → 4 | Designs locked → FAL ready (optional) |
| **Week 4-5** | Phase 4 (FAL) | Final concept art (if budget used) |
| **Week 5-6** | Integration | All assets in colosseum, cosmetics wired |
| **Week 6+** | Live Gameplay | Full hero roster + vehicles playable |

---

## 🎯 Summary

1. **Map designs** (✅ Done today)
2. **Blender: model + rig + animate** (Week 1-3, free)
3. **Preview in colosseum + gather feedback** (Week 3-4, free)
4. **Perfect looks via render** (Week 3-4, free)
5. **When locked: spend FAL on final concept art** (Week 4, $90 optional)
6. **Integrate all assets into colosseum** (Week 5-6)

**Result**: 7 polished heroes + 4 vehicles + 21 cosmetics, all game-ready

**FAL Budget**: Saved for final touches, NOT wasted on early iterations ✨
