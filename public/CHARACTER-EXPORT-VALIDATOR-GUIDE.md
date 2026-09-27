# Character Export Validator — How to Use

## 🎯 What It Does

**Catches GLB export problems BEFORE you import into the game.**

Common issues it checks:
- ❌ Wrong file format (not GLB)
- ❌ Wrong glTF version (not 2.0)
- ❌ Animations not baked
- ❌ Armature not included
- ❌ File corrupted or too small
- ❌ Wrong file size

---

## 🚀 How to Use

### Step 1: Export from Blender
1. In Blender: **File** → **Export** → **glTF 2.0 (.glb)**
2. Name it: `ORACLE.glb`
3. Make sure:
   - ✅ Format: **GLB** (binary, not glTF)
   - ✅ Include: **Geometry**
   - ✅ Include: **Animations**
   - ✅ Include: **Armature**
   - ✅ Bake Animation: **YES**
   - ✅ NLA Strips: **YES** (if using NLA editor)
4. Click **Export**

### Step 2: Validate in Browser
1. **Open:** `character-export-validator.html` in your browser
2. **Upload:** Your ORACLE.glb file (drag & drop or click to browse)
3. **Wait:** Validation runs (~1 second)
4. **Read:** Results show:
   - ✅ Green = Passed
   - ⚠️ Yellow = Warning (check but usually OK)
   - ❌ Red = Failed (fix before importing)

### Step 3: Check Results

#### ✅ All Green?
- File is valid
- Ready to save to `public/models/characters/ORACLE.glb`
- Proceed to game import

#### ⚠️ Warnings?
- Usually OK, but verify:
  - File is actually a character (not something else)
  - Animations are in the file (file size should be >1 MB)

#### ❌ Red Failures?
- **"Not Valid GLB"** → Re-export, use glTF 2.0 format
- **"Wrong Version"** → Blender is exporting wrong version (shouldn't happen)
- **"File Too Small"** → Missing animations or geometry, re-export with all data
- **"File Too Large"** → Models might be too detailed (>500 MB is unusual)

---

## 📊 What Each Check Means

| Check | Green ✅ | Red ❌ |
|-------|---------|-------|
| **Valid GLB Format** | File starts with correct GLB magic number | File is corrupted or wrong format |
| **glTF 2.0 Version** | Version is 2.0 (what we need) | Version is 1.0 or other (won't work) |
| **File Size** | 10 KB - 500 MB (reasonable) | Too small (<10 KB) or huge (>500 MB) |
| **Animation Data** | File suggests animations included | File seems to lack animations |
| **Character File** | Filename suggests it's a character | Unexpected filename (verify it's right) |

---

## 🔧 Troubleshooting

### "File Too Small"
**Problem:** Animations not exported
**Fix:** In Blender, check:
- Animation actions are in **Action Editor** or **NLA Editor**
- Export checkbox: **Include Animations** = ON
- Export checkbox: **Bake Animation** = YES
- All animation actions have keyframes

### "File is Corrupted"
**Problem:** Export failed or file got damaged
**Fix:**
1. Delete the .glb file
2. Re-export from Blender
3. Verify file exists before uploading
4. Try again

### "Unexpected Filename"
**Problem:** File named something other than expected
**Fix:**
- Rename to `ORACLE.glb`
- Or verify you're validating the right character

### "Animation Data Warning"
**Problem:** Validator can't confirm animations
**Fix:**
- File is probably OK
- Import to game and test
- If animations don't play in game, re-export with **Bake Animation** = YES

---

## ✅ Before You Import to Game

Run validator and confirm:
1. ✅ Valid GLB Format
2. ✅ glTF 2.0 Version
3. ✅ File Size is reasonable (1-50 MB typical)
4. ✅ Animation Data detected
5. ✅ No red failures

**If all green:** Save to `public/models/characters/ORACLE.glb` and proceed with game integration.

---

## 🎮 Then Test in Game

1. **Open:** `colosseum-game-demo.html` in browser
2. **Select:** ORACLE from hero buttons
3. **Launch:** A game
4. **Click:** Attack button
5. **Verify:**
   - Character appears
   - Animation plays
   - Stats log attack
   - No console errors

If anything fails, check:
- File path is correct: `public/models/characters/ORACLE.glb`
- GLB was validated as OK
- Character loader is pointing to right path
- Browser console for 404 or loading errors

---

## 💡 Tips

- **Validate after every export** (catches issues immediately)
- **Keep validator open** in a browser tab during rigging
- **Re-export = Re-validate** (always check after changes)
- **If unsure, check the console** (browser DevTools → Console tab shows exact errors)

---

## 📞 If Still Stuck

Check the logs:
1. **Open:** Colosseum demo in browser
2. **Right-click** → **Inspect** → **Console** tab
3. **Look for red errors** (scroll up to see all)
4. **Common errors:**
   - `404 Not Found: models/characters/ORACLE.glb` → Wrong path
   - `Failed to parse GLB` → File is corrupted
   - `No animation clip named Idle` → Clip names don't match

**See:** BLENDER-TO-COLOSSEUM-WORKFLOW.md Phase 4 (Verify in Colosseum) for full troubleshooting.

---

**Validate early. Validate often. Catch issues before they slow you down.** ✅
