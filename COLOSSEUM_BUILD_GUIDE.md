# SHADDAI Colosseum Arena — Build Guide

## Overview
Real 3D model of the futuristic neon colosseum arena, built per TURTLE's creative direction + NEXUS's technical specs.

**Current Status:** ✅ Blender build script ready  
**Next:** Run script → Export GLB → Integrate into game

---

## Step 1: Build in Blender

### Option A: GUI (Recommended for viewing)
1. Open Blender
2. Go to **Scripting** tab
3. Open `tools/build-colosseum-arena.py`
4. Click **▶ Run Script**

### Option B: Command line
```bash
blender -P "C:\Users\Brittany\Shaddai\tools\build-colosseum-arena.py"
```

### What gets built:
- ✅ Circular arena floor (120m diameter, sand texture)
- ✅ 3-tier seating structure (warm gold + dark steel + cyan neon)
- ✅ Neon accent rings (magenta + cyan glowing edges)
- ✅ Gold entrance gate (architectural focal point)
- ✅ Lighting setup (sun + cyan/magenta accent lights)
- ✅ Materials with emission for neon glow

---

## Step 2: Export to GLB

1. In Blender: **File → Export → Export glTF 2.0 (.glb)**
2. Filename: `colosseum-arena.glb`
3. Location: `C:\Users\Brittany\Shaddai\public\models\`
4. Settings:
   - Format: **glTF 2.0 (.glb)** 
   - ✅ Include: Animations, Lights, Materials
   - ✅ Export: All Objects
   - **Save**

---

## Step 3: Integrate into Game

### Load the model in `world-colosseum.js`:

```javascript
// In colosseum-integrated.js or world-colosseum.js

async function loadRealColosseumArena(scene) {
  const loader = new THREE.GLTFLoader();
  const { scene: arenaScene } = await loader.loadAsync('models/colosseum-arena.glb');
  
  // Scale if needed (Blender units → game units)
  arenaScene.scale.set(1, 1, 1);
  scene.add(arenaScene);
  
  // Bake lighting (optional, for performance)
  // arenaScene.traverse(node => {
  //   if (node.isMesh) node.castShadow = true;
  // });
  
  return arenaScene;
}
```

### Replace placeholder in game:
- Current: `colosseum-characters-placeholder.js` (capsule arena)
- New: Load `colosseum-arena.glb` directly

---

## Design Summary

### Aesthetic: "Opulent Futurism"
| Element | TURTLE's Vision | Technical Spec |
|---------|-----------------|----------------|
| **Floor** | Sand arena (classic spectacle) | 120m diameter, receiveShadow |
| **Seating Tier 1** | Warm gold (luxury, inviting) | 5m tall ring at z=5 |
| **Seating Tier 2** | Dark steel (modern, sleek) | 6m tall ring at z=25 |
| **Seating Tier 3** | Cyan neon (futuristic, glowing) | 4m tall ring at z=55 |
| **Accent Lights** | Magenta + Cyan (cyberpunk) | Point lights, 50 energy each |
| **Gate** | Gold portal (architectural) | 7.5m tall entrance, warmly lit |

### Performance Notes:
- **Geometry:** Optimized with torus for seating (low poly count)
- **Lights:** Baked into base color, can add real lights if needed
- **LOD:** Seating can use distance-based visibility culling
- **Shadows:** Baked into textures for performance

---

## Customization Points

Want to adjust? Edit these in `build-colosseum-arena.py`:

```python
ARENA = {
    'floor_diameter': 120,      # ← Change arena size
    'seating_diameter': 170,    # ← Change spectator ring
    'height': 80,               # ← Change total height
}

MATERIALS = {
    'neon_cyan': { ... },       # ← Tweak neon colors
    'neon_magenta': { ... },    # ← Adjust emission strength
}
```

Then re-run the script and export.

---

## Testing

After integration:
1. Open `public/colosseum-game-demo.html`
2. Select arena in game panel
3. Verify:
   - ✅ Arena loads without errors
   - ✅ Neon lights glow correctly
   - ✅ Heroes can move on floor
   - ✅ Camera can orbit freely
   - ✅ Performance stable (60fps)

---

## Timeline

| Phase | Time | Status |
|-------|------|--------|
| **Script Write** | 2h | ✅ Done |
| **Blender Run** | 15min | ⏳ Ready |
| **Export** | 5min | ⏳ Ready |
| **Game Integration** | 30min | ⏳ Ready |
| **Testing** | 15min | ⏳ Ready |
| **Total** | ~3h | ⏳ In progress |

---

## Next Steps

1. **Start Blender** → Open script → Run
2. **Verify output** → Check scene in viewport
3. **Export GLB** → File → Export glTF 2.0
4. **Test in game** → Run demo.html
5. **Iterate** → Adjust colors/scale as needed

---

## Questions?

- **Blender not running?** Check System Tray → Blender icon
- **Export failed?** Ensure parent folder exists: `public/models/`
- **Game won't load GLB?** Check browser console for errors, verify file path
- **Want more detail?** Edit ARENA scales and re-run script

Good luck! 🎮✨
