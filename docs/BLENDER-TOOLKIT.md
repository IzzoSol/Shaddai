# SHADDAI BLENDER TOOLKIT — Agent Skills for Blender MCP
## Version 1.0 · 2026-10-17

This is the definitive guide for how every SHADDAI agent works with Blender via the MCP.
Each skill maps to a Python function that the Blender MCP can execute.

## Game Scale Contract

The game uses **world units**, not metres:
- `V4_U = 7/1.8 ≈ 3.889` world units per metre
- Blender works in metres
- **To convert**: game_position = blender_position × V4_U (for x), × -V4_U for z (z flipped)
- **Blender to game**: `bx = game_x / U`, `bz = -game_z / U`

## Python Functions (run via Blender MCP)

### 1. Import a GLB into Blender at a game world position

```python
import bpy
from mathutils import Vector

def shaddai_import_glb(filepath, game_x, game_z, game_y=0, scale_m=1.0):
    """Import a GLB and place it at a game-world coordinate.
    game_x/game_z are in game units (what the game code uses).
    Blender gets metres: bx = game_x/V4_U, bz = -game_z/V4_U
    """
    V4_U = 7 / 1.8
    bpy.ops.import_scene.gltf(filepath=filepath)
    obj = bpy.context.selected_objects[-1] if bpy.context.selected_objects else None
    if not obj:
        return "ERROR: no object imported"
    # Convert game coords to Blender metres
    bx = game_x / V4_U
    bz = -game_z / V4_U
    by = game_y / V4_U
    obj.location = Vector((bx, by, bz))
    obj.scale = Vector((scale_m, scale_m, scale_m))
    return f"Imported {obj.name} at Blender ({bx:.1f}, {by:.1f}, {bz:.1f})m from game ({game_x:.0f}, {game_y:.0f}, {game_z:.0f})u"
```

### 2. Export a Blender object as a game-ready GLB

```python
def shaddai_export_glb(obj_name, filepath, apply_scale=True):
    """Export an object as GLB for the game. Scale is in metres.
    The game scales everything by V4_U at load time."""
    obj = bpy.data.objects.get(obj_name)
    if not obj:
        return f"ERROR: {obj_name} not found"
    # Select only this object + its children
    bpy.ops.object.select_all(action='DESELECT')
    def sel(o):
        o.select_set(True)
        for c in o.children: sel(c)
    sel(obj)
    bpy.context.view_layer.objects.active = obj
    if apply_scale:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=True,
    )
    return f"Exported {obj_name} → {filepath}"
```

### 3. Get full model info (for the inspector bridge)

```python
def shaddai_model_info(obj_name):
    """Get tri count, bones, materials, dimensions, clips for an object."""
    obj = bpy.data.objects.get(obj_name)
    if not obj:
        return f"ERROR: {obj_name} not found"
    V4_U = 7 / 1.8
    info = {"name": obj_name, "type": obj.type}
    # Mesh info
    tris = 0; verts = 0; meshes = 0
    def scan(o):
        nonlocal tris, verts, meshes
        if o.type == 'MESH' and o.data:
            meshes += 1
            verts += len(o.data.vertices)
            if o.data.polygons: tris += len(o.data.polygons)
        for c in o.children: scan(c)
    scan(obj)
    info["meshes"] = meshes; info["verts"] = verts; info["tris"] = tris
    # Dimensions in metres + game units
    dims = obj.dimensions
    info["dims_m"] = [round(d, 3) for d in dims]
    info["dims_game"] = [round(d * V4_U, 1) for d in dims]
    # Materials
    mats = set()
    def scan_mats(o):
        if o.type == 'MESH' and o.data:
            for slot in o.material_slots:
                if slot.material: mats.add(slot.material.name)
        for c in o.children: scan_mats(c)
    scan_mats(obj)
    info["materials"] = sorted(mats)
    # Armature/bones
    bones = 0
    def scan_bones(o):
        nonlocal bones
        if o.type == 'ARMATURE': bones += len(o.data.bones)
        for c in o.children: scan_bones(c)
    scan_bones(obj)
    info["bones"] = bones
    # Animations
    info["clips"] = [a.name for a in bpy.data.actions if obj.name in {c.name for c in a.fcurves} or True]  # simplified
    return str(info)
```

### 4. Scene audit — list everything with its game-world position

```python
def shaddai_scene_audit():
    """List all scene objects with their game-world coordinates."""
    V4_U = 7 / 1.8
    out = []
    for o in bpy.data.objects:
        if o.parent: continue  # only top-level
        gx = o.location.x * V4_U
        gz = -o.location.z * V4_U
        gy = o.location.y * V4_U
        out.append(f"{o.name:30s} type={o.type:10s} game=({gx:8.0f},{gy:6.0f},{gz:8.0f}) dims={o.dimensions.x:.1f}x{o.dimensions.y:.1f}x{o.dimensions.z:.1f}m")
    return "\n".join(out)
```

### 5. Place on the sacred geometry hexagon

```python
import math
def shaddai_place_hexagon(obj_name, index, radius_m=260/3.889):
    """Place an object at hexagon vertex #index (0-5) around the Source.
    Vertex angles mirror the game's Seed of Life: 30°, 90°, 150°, 210°, 270°, 330°
    """
    obj = bpy.data.objects.get(obj_name)
    if not obj: return f"ERROR: {obj_name} not found"
    angles = [30, -30, 90, -90, 150, -150]  # game convention
    a = math.radians(angles[index % 6])
    obj.location.x = math.sin(a) * radius_m
    obj.location.z = math.cos(a) * radius_m  # Blender z = game -z... but we negate in import
    return f"Placed {obj_name} at hexagon vertex {index%6}: ({obj.location.x:.1f}, {obj.location.z:.1f})m"
```

### 6. Batch import GLBs from a directory

```python
import os
def shaddai_import_directory(dirpath, prefix=""):
    """Import all GLBs in a directory. Returns a summary."""
    files = [f for f in os.listdir(dirpath) if f.endswith('.glb')]
    imported = []
    for i, f in enumerate(sorted(files)):
        fp = os.path.join(dirpath, f)
        bpy.ops.import_scene.gltf(filepath=fp)
        if bpy.context.selected_objects:
            obj = bpy.context.selected_objects[-1]
            obj.name = prefix + f.replace('.glb', '')
            imported.append(obj.name)
    return f"Imported {len(imported)} GLBs: {', '.join(imported)}"
```

### 7. Check scale against the game's expected dimensions

```python
def shaddai_check_scale(obj_name, expected_height_m=None):
    """Check if a model is at the right scale for the game."""
    obj = bpy.data.objects.get(obj_name)
    if not obj: return f"ERROR: {obj_name} not found"
    V4_U = 7 / 1.8
    h_m = obj.dimensions.y  # Y is up in Blender
    h_game = h_m * V4_U
    result = f"{obj_name}: {h_m:.2f}m tall = {h_game:.1f} game units"
    if expected_height_m:
        if abs(h_m - expected_height_m) < 0.1:
            result += " ✓ correct scale"
        else:
            scale_fix = expected_height_m / h_m if h_m > 0 else 1
            result += f" ✗ expected {expected_height_m}m — scale by {scale_fix:.3f}"
    return result
```

---

## Agent Skills (what each agent does in Blender)

### TURTLE — Creation Master
**When invoked:** "TURTLE, design [thing]" or "TURTLE, check aesthetics"
**Blender operations:**
1. Import a GLB to inspect: `shaddai_import_glb(path, 0, 0)`
2. Check dimensions: `shaddai_check_scale(obj, expected_height)`
3. View the model: switch to Material Preview, frame it
4. Adjust materials/colors: set Principled BSDF values
5. Place on the hexagon: `shaddai_place_hexagon(obj, index)`
6. Report visual issues (squashed normals, missing textures, broken rigs)

**TURTLE's design eye:**
- Sacred geometry alignment (hexagon, golden ratio proportions)
- Color palette consistency with SHADDAI brand (void navy, gold, cyan, violet)
- Silhouette readability (does it read at 100m zoomed out?)
- Material sanity (no pure black, no blown-out white, correct metalness/roughness)

### NEXUS — Technical Architect
**When invoked:** "NEXUS, export this model" or "NEXUS, check compression"
**Blender operations:**
1. Export a model: `shaddai_export_glb(obj, output_path)`
2. Verify game scale: `shaddai_check_scale(obj)`
3. Batch export: iterate selected objects
4. Validate GLB structure (tri count, bone names match animation library)
5. Optimize: decimate, merge vertices, check for non-manifold geometry

**NEXUS's checks:**
- GLB file size < 15 MB (target: < 5 MB for props, < 12 MB for characters)
- Tri count < 50K for props, < 100K for hero models
- Bone names match the shared animation library (for retargeting)
- Scale is in metres (the game scales at load time)
- No orphan vertices or non-manifold edges

### SHADDAI — Orchestrator
**When invoked:** "SHADDAI, review the scene" or "all agents, check Blender"
**Blender operations:**
1. Scene audit: `shaddai_scene_audit()`
2. Check all placements against the asset audit doc
3. Verify the Seed of Life geometry (6 agents at correct hexagon vertices)
4. Review composition (golden ratio, sight lines, focal points)
5. Final sign-off before export

### QUILL — Documentation
**When invoked:** "QUILL, document this placement" or "QUILL, write the handoff"
**Blender operations:**
1. Scene audit: `shaddai_scene_audit()` (reads, doesn't modify)
2. Document: what was placed, where, at what scale
3. Write handoff notes for the next session

---

## MCP Connection Pattern

```
Owner: "TURTLE, check the new dragon model"
  → Agent invokes Blender MCP:
    1. shaddai_import_glb("/fal-assets/world/assets/volcano-dragon/volcano-dragon-mesh.glb", 0, -200)
    2. shaddai_model_info("volcano-dragon")
    3. shaddai_check_scale("volcano-dragon", 15.0)  # expected ~15m wingspan
  → TURTLE reviews the viewport render
  → TURTLE reports: "Wingspan reads well at distance. The membrane between
    fingers needs a double-sided material fix. Bone count (24) is light for
    a creature this size — recommend adding 8 more for tail segments."
```

---

## The GLB Inspector Bridge

The inspector (`localhost:3014/public/__inspector.html`) and Blender work together:

1. **Find the model in the inspector** — search, click, inspect wireframe/bones/dimensions
2. **Copy the path** from the inspector's title bar
3. **Paste into the Blender MCP** — import at a game coordinate
4. **Make changes in Blender** — materials, scale, rig adjustments
5. **Export via NEXUS** — `shaddai_export_glb()` to a game-ready file
6. **Verify in the inspector** — reload the exported GLB and confirm

This gives you a complete loop: inspect → import → modify → export → verify.
