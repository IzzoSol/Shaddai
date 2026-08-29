# SHADDAI World Viewer Guide

You now have **3 different world viewing options** - choose the one that works best for you:

## 🌍 Option 1: WORLD-API (Recommended - Most Reliable)
**URL:** `http://localhost:8099/world-api` or `http://localhost:3000/world-api`

- ✅ **Shows:** All 7 agents (SHADDAI, NEXUS, ZEROX, ORACLE, TURTLE, QUILL, PIKADON) in a circular arrangement
- ✅ **Features:** Central monument landmark, neon lighting, proper agent names and roles
- ✅ **Status:** Most stable, uses World Labs API for world generation
- ✅ **Controls:** Mouse drag to rotate, scroll to zoom
- ⚠️  **Note:** Uses procedural 3D geometry (humanoid shapes) for agents

## 🎮 Option 2: WORLD-3D (With Real Models)
**URL:** `http://localhost:8099/world3d`

- ✅ **Shows:** 6 real 3D character models (GLB files) with fallback geometry
- ✅ **Features:** Loads real `.glb` models from `/assets/models/` directory
- ✅ **Status:** Models load in background; falls back to placeholder if timeout occurs
- ⚠️  **Note:** Large GLB files (50-60MB each) may take time to load
- 💡 **Better for:** Seeing actual 3D character artwork (when models load successfully)

## 🏆 Option 3: WORLD-COMPLETE (Full Procedural)
**URL:** `http://localhost:3000/worlds-viewer.html` or `http://localhost:3000/SHADDAI-WORLD-COMPLETE.html`

- ✅ **Shows:** All 5 complete biomes with landmarks, vehicles, water systems
- ✅ **Features:** Procedurally generated world with Grid, Forest, Arctic, Desert, and Void districts
- ✅ **Status:** Fully working, all geometry procedural (no external assets)
- 💡 **Better for:** Exploring the complete world architecture

---

## 📋 What's in Each World

### WORLD-API
- 7 agents in orbital arrangement
- Central golden monument
- Grid terrain
- Neon lighting and visual effects
- Connects to World Labs API

### WORLD-3D
- 6 character models (hero, car, forest character, ship, plane, buggy)
- Procedural terrain and grid
- Water shader system
- Agent districts accessible via UI
- Bazaar marketplace
- Real GLB model files (when they load)

### WORLD-COMPLETE
- **Grid District:** NEXUS Tower, data bridges, neon grid
- **Forest:** Great Arch Tree, bioluminescent plants
- **Arctic:** Cryopolis dome, 6-tier iceberg
- **Desert:** Circuit Mesa, wavy dunes
- **Void:** SHADDAI Spire, 7 orbiting agents, megacity towers
- 9 different vehicle types
- Complete water systems

---

## 🚀 Getting Real Characters to Show

The GLB model files are your "real characters." They are 3D models downloaded from HuggingFace.

**To maximize them showing:**

1. **Clear your browser cache** (models might be cached incorrectly)
2. **Check browser console** (press F12 → Console tab)
3. **Look for load status:**
   - ✅ Messages mean models loaded successfully
   - ⚠️ Yellow messages mean models are loading
   - ❌ Red messages mean load failed

**If models don't load:**
- They may be timing out (>5 seconds)
- They may not be accessible via HTTP
- Your network connection might be slow

**Alternative:** Use the WORLD-COMPLETE page which has all procedural geometry - guaranteed to work.

---

## 🔧 Technical Details

### Model Files (60MB total)
Located in: `public/assets/models/`
- `base_basic_pbr.glb` - Hero/main character
- `base.glb` - Ground vehicle
- `base (1).glb` - Forest character
- `base (2).glb` - Water vehicle/ship
- `base (3).glb` - Air vehicle/plane
- `base (4).glb` - Desert vehicle

### API Endpoints
- `POST /api/worlds/create` - Create new world
- `GET /api/worlds` - List worlds
- `GET /api/worlds/:id` - Get world by ID
- `POST /api/worlds/:id/physics` - Update physics
- `POST /api/worlds/:id/seed` - Add entities

---

## 💡 Recommendations

- **First time?** Start with **WORLD-API** - it's the most stable
- **Want to see real models?** Use **WORLD-3D** - check console for load status
- **Want full world?** Use **WORLD-COMPLETE** - everything is procedural and works
- **Testing?** All three pages have console logging - press F12 to debug

---

## ✅ Status Summary

| Feature | WORLD-API | WORLD-3D | WORLD-COMPLETE |
|---------|-----------|----------|-----------------|
| Shows | ✅ 7 agents | ✅ 6 models + agents | ✅ 5 full biomes |
| Terrain | ✅ Grid | ✅ Grid + terrain | ✅ 5 biomes |
| Landmarks | ✅ Monument | ⚠️ Procedural | ✅ All major |
| Vehicles | ❌ None | ✅ 6 models/placeholders | ✅ 17 types |
| Real Models | ❌ Geometry | ✅ GLB files | ❌ Procedural |
| Status | ✅ Production Ready | ✅ Stable (with fallback) | ✅ Production Ready |

---

**All three pages are now active and accessible. Choose the one that works best for your use case!**
