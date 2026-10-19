"""SHADDAI Blender Agent Toolkit — run via Blender MCP
Copy-paste any function or exec the whole file.
Game scale: V4_U = 7/1.8 ≈ 3.889 world units per metre.
Blender works in metres. Game x → Blender x, Game z → Blender -z.
"""
import bpy
import os
import math
from mathutils import Vector

V4_U = 7 / 1.8  # game world units per metre


def shaddai_import_glb(filepath, game_x=0, game_z=0, game_y=0, scale_m=1.0):
    """Import a GLB and place it at a game-world coordinate."""
    bpy.ops.import_scene.gltf(filepath=filepath)
    obj = bpy.context.selected_objects[-1] if bpy.context.selected_objects else None
    if not obj:
        return "ERROR: no object imported from " + str(filepath)
    obj.location = Vector((game_x / V4_U, game_y / V4_U, -game_z / V4_U))
    obj.scale = Vector((scale_m, scale_m, scale_m))
    return ("Imported {} at Blender ({:.2f}, {:.2f}, {:.2f})m "
            "= game ({:.0f}, {:.0f}, {:.0f})u").format(
        obj.name, obj.location.x, obj.location.y, obj.location.z, game_x, game_y, game_z)


def shaddai_export_glb(obj_name, filepath, apply_scale=True):
    """Export an object (and children) as a game-ready GLB."""
    obj = bpy.data.objects.get(obj_name)
    if not obj:
        return "ERROR: {} not found".format(obj_name)
    bpy.ops.object.select_all(action='DESELECT')

    def _sel(o):
        o.select_set(True)
        for c in o.children:
            _sel(c)
    _sel(obj)
    bpy.context.view_layer.objects.active = obj
    if apply_scale:
        # Store location, apply transforms, restore
        loc = obj.location.copy()
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.export_scene.gltf(
        filepath=filepath, use_selection=True, export_format='GLB',
        export_yup=True, export_apply=True, export_extras=True,
        export_animations=True, export_materials=True)
    size_kb = os.path.getsize(filepath) / 1024 if os.path.exists(filepath) else 0
    return "Exported {} → {} ({:.0f} KB)".format(obj_name, filepath, size_kb)


def shaddai_model_info(obj_name):
    """Full model report: meshes, tris, verts, bones, materials, dimensions."""
    obj = bpy.data.objects.get(obj_name)
    if not obj:
        return "ERROR: {} not found".format(obj_name)
    meshes = tris = verts = 0
    mats = set()
    bones = 0
    clips = set()

    def _scan(o):
        nonlocal meshes, tris, verts, bones
        if o.type == 'MESH' and o.data:
            meshes += 1
            verts += len(o.data.vertices)
            tris += len(o.data.polygons)
            for slot in o.material_slots:
                if slot.material:
                    mats.add(slot.material.name)
        if o.type == 'ARMATURE':
            bones += len(o.data.bones)
        if o.animation_data and o.animation_data.action:
            clips.add(o.animation_data.action.name)
        for c in o.children:
            _scan(c)
    _scan(obj)
    dims = obj.dimensions
    return str({
        "name": obj_name,
        "meshes": meshes, "tris": tris, "verts": verts,
        "bones": bones, "materials": sorted(mats),
        "dims_m": [round(d, 3) for d in (dims.x, dims.y, dims.z)],
        "dims_game": [round(d * V4_U, 1) for d in (dims.x, dims.y, dims.z)],
        "clips": sorted(clips),
        "loc_m": [round(v, 3) for v in obj.location],
        "loc_game": [round(obj.location.x * V4_U, 1),
                      round(obj.location.y * V4_U, 1),
                      round(-obj.location.z * V4_U, 1)],
    })


def shaddai_scene_audit():
    """List all top-level objects with their game-world positions."""
    out = []
    for o in bpy.data.objects:
        if o.parent:
            continue
        gx = o.location.x * V4_U
        gz = -o.location.z * V4_U
        gy = o.location.y * V4_U
        out.append("{:30s} {:10s} game=({:8.0f},{:6.0f},{:8.0f}) "
                   "dims={:.1f}x{:.1f}x{:.1f}m {:5.1f}KB".format(
                       o.name, o.type, gx, gy, gz,
                       o.dimensions.x, o.dimensions.y, o.dimensions.z, 0))
    return "\n".join(out) if out else "Scene is empty"


def shaddai_place_hexagon(obj_name, index, radius_game=260):
    """Place at Seed of Life hexagon vertex (0-5) around the Source."""
    obj = bpy.data.objects.get(obj_name)
    if not obj:
        return "ERROR: {} not found".format(obj_name)
    angles = [30, -30, 90, -90, 150, -150]
    a = math.radians(angles[index % 6])
    r = radius_game / V4_U
    obj.location.x = math.sin(a) * r
    obj.location.z = math.cos(a) * r
    return "Placed {} at hexagon vertex {} ({:.1f}, {:.1f})m = game r={}u".format(
        obj.name, index % 6, obj.location.x, obj.location.z, radius_game)


def shaddai_check_scale(obj_name, expected_height_m=None):
    """Check if a model is at the right scale for the game."""
    obj = bpy.data.objects.get(obj_name)
    if not obj:
        return "ERROR: {} not found".format(obj_name)
    h_m = obj.dimensions.y
    h_game = h_m * V4_U
    r = "{}: {:.3f}m tall = {:.1f} game units".format(obj_name, h_m, h_game)
    if expected_height_m is not None:
        if abs(h_m - expected_height_m) < 0.05:
            r += " [OK] correct scale"
        elif h_m > 0:
            fix = expected_height_m / h_m
            r += " [FIX] expected {:.2f}m — scale by {:.3f}".format(expected_height_m, fix)
    return r


def shaddai_import_batch(dirpath, prefix=""):
    """Import all GLBs from a directory. Returns summary."""
    if not os.path.isdir(dirpath):
        return "ERROR: {} is not a directory".format(dirpath)
    files = sorted([f for f in os.listdir(dirpath) if f.endswith('.glb')])
    imported = []
    errors = []
    for f in files:
        try:
            bpy.ops.import_scene.gltf(filepath=os.path.join(dirpath, f))
            if bpy.context.selected_objects:
                obj = bpy.context.selected_objects[-1]
                obj.name = prefix + f.replace('.glb', '')
                imported.append(obj.name)
        except Exception as e:
            errors.append(f + ": " + str(e))
    r = "Imported {} / {} GLBs from {}".format(len(imported), len(files), dirpath)
    if imported:
        r += "\n  " + ", ".join(imported[:10])
        if len(imported) > 10:
            r += " ... ({} more)".format(len(imported) - 10)
    if errors:
        r += "\n  ERRORS: " + "; ".join(errors[:5])
    return r


def shaddai_list_collections():
    """List all collections and their object counts."""
    out = []
    for coll in bpy.data.collections:
        objs = [o for o in coll.objects if not o.parents] if hasattr(coll, 'objects') else coll.objects
        out.append("{:30s} {:3d} objects".format(coll.name, len(coll.objects)))
    return "\n".join(out)


def shaddai_game_to_blender(game_x, game_z, game_y=0):
    """Convert game world coordinates to Blender metres."""
    return "Blender: ({:.2f}, {:.2f}, {:.2f})m".format(game_x / V4_U, game_y / V4_U, -game_z / V4_U)


def shaddai_blender_to_game(bx, by, bz):
    """Convert Blender metres to game world coordinates."""
    return "Game: ({:.0f}, {:.0f}, {:.0f})u".format(bx * V4_U, by * V4_U, -bz * V4_U)


# ── Run a full audit when the file is loaded ──
if __name__ == "__main__":
    print("=" * 60)
    print("SHADDAI BLENDER TOOLKIT")
    print("=" * 60)
    print(shaddai_scene_audit())
    print("-" * 60)
    print(shaddai_list_collections())
