# SHADDAI Colosseum — Quickstart Guide

**TL;DR**: Open `/colosseum-game-demo.html` in your browser. Select hero → pick terrain → launch game.

---

## 🎮 Open & Play (Right Now)

### Step 1: Demo Page
Navigate to `/colosseum-game-demo.html`

### Step 2: Select a Hero
Click one of 6 buttons:
- ⚔️ **ORACLE** — Purple mystic with dual weapons
- 🔵 **ZEROX** — Cyan cyber knight
- 🟢 **NEXUS** — Green/magenta tech hacker
- 🟠 **PIKADON** — Orange heavy tank
- 🟢 **TURTLE** — Green shell beast
- 🟡 **QUILL** — Gold graceful archer

### Step 3: Pick a Terrain
Click one of 6 buttons:
- Grass, Water, Fire, Ice, Lava, Void

### Step 4: Choose Game Mode
Dropdown menu:
- ⚔️ Arena Combat (1v1 PvP)
- 👑 King of the Hill (FFA)
- 🚩 Capture the Flag (Team)
- 🏃 Parkour Challenge (Solo)
- 🎱 Dodgeball (Team)
- 🔥 Lava Survival (FFA)

### Step 5: Launch!
Click **⚡ LAUNCH GAME**

### Step 6: Play
- **⚔️ Attack** — Deal 25 damage
- **📈 Jump** — Jump 2.5m high
- **🚶 Move** — Move forward (speed varies by terrain)
- **🔄 Roll** — Roll 3m forward (i-frames 0.10-0.42s)

---

## 🎨 Cosmetics System

### Unlock Skins
1. In the **SHOP** section, see available skins
2. Click a skin to unlock (costs credits)
3. Starting credits: 5,000

### Equip Cosmetic
1. Select a hero
2. Pick cosmetic from dropdown
3. Click **Apply Cosmetic**

### Your Inventory
View all unlocked skins in the **Cosmetics** panel

### Examples: 3 Skins Per Hero
```
ORACLE:
  - Purple Mystic (base, free)
  - Gold Mystic (common, 500 credits)
  - Void Oracle (rare, 1500 credits)

ZEROX:
  - Cyan Knight (base, free)
  - Obsidian Knight (common, 500 credits)
  - Chrome Knight (rare, 1500 credits)
```

---

## 🌍 Terrain Mechanics

Each terrain changes gameplay:

| Terrain | Speed | Jump | Hazard | Vibe |
|---------|-------|------|--------|------|
| **Grass** | 1.0x | 1.0x | None | Balanced |
| **Water** | 0.7x | 0.8x | Drowning | Slow |
| **Fire** | 1.2x | 1.3x | Burning | Fast |
| **Ice** | 0.6x | 0.9x | Slipping | Tricky |
| **Lava** | 1.1x | 1.5x | Instant Death | Dangerous |
| **Void** | 1.3x | 1.1x | Falling | Dark |

---

## ⚔️ Game Modes Explained

### Arena Combat
- **Type**: 1v1 PvP
- **Win Condition**: Last one standing
- **Obstacles**: Poles, platforms, hazards
- **Best For**: Testing combat mechanics

### King of the Hill
- **Type**: FFA (4-8 players)
- **Win Condition**: Control center platform
- **Obstacles**: Heavy (moving platforms)
- **Best For**: Competitive multiplayer

### Capture the Flag
- **Type**: Team (2-4 per side)
- **Win Condition**: Steal flag, return to base
- **Obstacles**: Heavy (blocking paths)
- **Best For**: Team coordination

### Parkour Challenge
- **Type**: Solo race
- **Win Condition**: Reach end fastest
- **Obstacles**: Extreme (poles, platforms, ramps)
- **Best For**: Skill test

### Dodgeball
- **Type**: Team
- **Win Condition**: Eliminate opponents with hazards
- **Obstacles**: Light (hazard zones)
- **Best For**: Fast-paced action

### Lava Survival
- **Type**: FFA (2-8 players)
- **Win Condition**: Stay off lava longest
- **Hazard**: Rising lava, floating platforms
- **Best For**: Tension & excitement

---

## 🎯 Game Loop

```
SELECT HERO
    ↓
PICK TERRAIN
    ↓
CHOOSE GAME MODE
    ↓
LAUNCH GAME
    ↓
PERFORM ACTIONS (attack, jump, move, roll)
    ↓
WATCH GAME LOG (events update in real-time)
    ↓
COSMETICS → Apply skins anytime
```

---

## 📊 Arena Statistics

**Real-Time Tracking**:
- Selected Hero
- Current Cosmetic (skin)
- Arena Mode
- Active Terrain
- Available Credits
- Skins Unlocked

**Logs**:
- Game Log: major events
- Action Log: player actions

---

## 🔧 Integration With Blender

When Blender GLB files are ready:

### Current (Placeholder)
```javascript
const loader = new PlaceholderCharacterLoader(THREE);
const heroes = loader.loadAll();
```

### When GLB Ready (1-line change)
```javascript
const loader = new CharacterLoader(THREE);
const oracle = await loader.loadCharacter('ORACLE');
```

**No other code changes needed!**

---

## 💡 Tips & Tricks

### Maximize Gameplay
1. Try every terrain + game mode combo (48 combinations!)
2. Unlock rare skins by earning credits
3. Master the roll (3m distance, invuln frames)
4. Use terrain speed modifiers strategically

### Terrain Strategies
- **Fast Terrains** (Fire, Void): Aggressive playstyle
- **Slow Terrains** (Water, Ice): Defensive, positioning-based
- **Hazard Terrains** (Lava, Void): Edge avoidance, platforming

### Combat Tips
- **Light Attack**: Quick, safe damage
- **Jump**: Avoid obstacles, dodge attacks
- **Move**: Adjust position, chase/flee
- **Roll**: High-risk, high-reward escape

---

## 📈 What's Coming

### Soon (Blender Rigging)
- ✅ All 6 heroes with 30 animations each
- ✅ 4 vehicles + mounts
- ✅ Cosmetics visually applied (color swaps)

### Phase 2 (Integration)
- GLB files swapped in (1-line code change)
- Full animation system live
- Real combat + physics
- Multiplayer testing

### Phase 3 (Polish)
- Particle effects (hazards, spotlights)
- Water ripples
- Sound zones
- Dynamic lighting per terrain

---

## ❓ FAQ

**Q: Where are the Blender files?**  
A: Start with ORACLE. See `/public/BLENDER-CHARACTER-PREP.md` for full rigging guide.

**Q: When will I see animated heroes?**  
A: After Blender exports GLB files (~Week 2). Placeholder heroes (capsules) work now for testing.

**Q: How many skins are there?**  
A: 21 total (7 heroes × 3 skins). 7 are free (base), rest unlock with credits.

**Q: Can I play with real players?**  
A: Colosseum backend is ready. Multiplayer integration depends on Render pipeline (coming Week 4-5).

**Q: What if I want different terrain mid-game?**  
A: Use the terrain buttons on the left panel. Switch anytime!

---

## 🎮 Game Files

| File | Purpose |
|------|---------|
| `colosseum-game-demo.html` | **Play here** |
| `colosseum-ecs.js` | Game engine (ECS) |
| `colosseum-games.js` | Terrain + game modes |
| `colosseum-character-system.js` | Character loader |
| `colosseum-characters-placeholder.js` | Placeholder heroes (now) |
| `colosseum-cosmetics-system.js` | Skins + shop |
| `BLENDER-CHARACTER-PREP.md` | Rigging guide |
| `SHADDAI-CHARACTER-DESIGN-ROADMAP.md` | Design planning |

---

## 🚀 Next Steps

1. **Play the Demo** → Open `/colosseum-game-demo.html`
2. **Test All Combos** → Try each hero + terrain + mode
3. **Unlock Skins** → Earn credits in gameplay
4. **Start Blender** → Follow `/BLENDER-CHARACTER-PREP.md`
5. **Export GLB** → When ORACLE is rigged
6. **Drop into Colosseum** → Swap loader (1 line)

---

**Ready to conquer the colosseum! ⚔️✨**
