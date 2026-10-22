"""tools/blender_dress.py — author realm dressing in docs/blender/realm-scenes-20261022.blend, export it for the game (2026-10-22).

In Blender (MCP execute or the Text editor):  exec(open(r"C:/Users/Brittany/Shaddai-3d/tools/blender_dress.py").read())
  dress_add("volcano", "/assets/models/fal/prop-crate.glb", x=22, z=128, yaw=0, h=1.2, col=0.8)
  dress_export()          # -> public/assets/world/realm-dress-v1.json (read by public/world-realm-dress.js)

Frame = world-realm-kits.js station-local METRES: station at the origin, Blender X = local x (along the track),
Blender -Y = local z (toward the lift / city), Z-rotation = yaw (same sign as three's rotation.y).
Every asset is imported ONCE into a hidden _A_<file> collection, normalized exactly like the game does (footprint centred,
feet at z=0), and placed as a collection instance. Per instance custom props: dress_file, dress_h (metres) or scale, dress_col.
Move/rotate instances freely in Blender, then dress_export() — the game shows what the scene shows.
"""
import bpy, json, math, os, mathutils

DRESS_ROOT = r"C:/Users/Brittany/Shaddai-3d/public"
DRESS_OUT = DRESS_ROOT + "/assets/world/realm-dress-v1.json"


def _src():
    s = bpy.data.collections.get("_KIT_SOURCES")
    if not s:
        s = bpy.data.collections.new("_KIT_SOURCES"); bpy.data.scenes[0].collection.children.link(s)
    return s


def dress_asset(file):
    """Import /assets/... once; returns (collection, raw_height_m). Normalized: footprint centred, feet at z=0."""
    name = "_A_" + file.strip("/").replace("/", "_")
    c = bpy.data.collections.get(name)
    if c:
        return c, c["raw_h"]
    before, scenes0 = set(bpy.data.objects), set(bpy.data.scenes)
    bpy.ops.import_scene.gltf(filepath=DRESS_ROOT + file)
    for sc in [x for x in bpy.data.scenes if x not in scenes0 and len(x.objects) == 0]: bpy.data.scenes.remove(sc)   # importer leaves empty scenes
    new = [o for o in bpy.data.objects if o not in before]
    c = bpy.data.collections.new(name); _src().children.link(c)
    for o in new:
        for cc in list(o.users_collection): cc.objects.unlink(o)
        c.objects.link(o)
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ mathutils.Vector(v) for o in new if o.type == "MESH" for v in o.bound_box]
    mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    c.instance_offset = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)   # the instance origin = footprint centre at the feet
    c["raw_h"] = max(1e-6, mx.z - mn.z); c["dress_file"] = file
    return c, c["raw_h"]


def dress_add(realm, file, x, z, yaw=0.0, h=None, s=1.0, col=0.0, name=None):
    """Place one instance in REALM_<realm>/DRESS_<realm>. x, z = station-local metres; h = real height in metres."""
    scn = bpy.data.scenes["REALM_" + realm]
    dc = bpy.data.collections.get("DRESS_" + realm)
    if not dc:
        dc = bpy.data.collections.new("DRESS_" + realm); scn.collection.children.link(dc)
    c, raw = dress_asset(file)
    k = (h / raw) if h else s
    e = bpy.data.objects.new(name or ("d_" + os.path.basename(file)[:-4]), None)
    e.instance_type = "COLLECTION"; e.instance_collection = c
    e.location = (x, -z, 0); e.rotation_euler = (0, 0, math.radians(yaw)); e.scale = (k, k, k)
    e["dress_file"] = file; e["dress_col"] = float(col)
    if h: e["dress_h"] = float(h)
    dc.objects.link(e)
    return e


def dress_export(path=DRESS_OUT):
    out = {"version": 1, "source": "docs/blender/realm-scenes-20261022.blend", "realms": {}}
    for scn in bpy.data.scenes:
        if not scn.name.startswith("REALM_") or "." in scn.name:   # skip Blender duplicate names (REALM_x.001)
            continue
        realm = scn.name[6:]; dc = bpy.data.collections.get("DRESS_" + realm); rows = []
        for e in (dc.objects if dc else []):
            if not e.instance_collection or "dress_file" not in e.instance_collection:
                continue
            raw = e.instance_collection["raw_h"]
            row = {"file": e.instance_collection["dress_file"], "x": round(e.location.x, 2), "z": round(-e.location.y, 2),
                   "yaw": round(math.degrees(e.rotation_euler.z), 1), "h": round(raw * e.scale.x, 3), "col": round(float(e.get("dress_col", 0)), 2)}
            rows.append(row)
        out["realms"][realm] = rows
    # MERGE (2026-10-23): entries written by other tools carry a "batch" tag (viewer-*, fixq-*, final-*) or are K29 district files -
    # keep them; Blender only owns the untagged entries. Without this, an export from Blender wiped every tool-placed model.
    if os.path.exists(path):
        try:
            old = json.load(open(path, encoding="utf-8"))
            for realm, rows in (old.get("realms") or {}).items():
                keep = [r for r in rows if r.get("batch") or "shaddai_dist_" in r.get("file", "")]
                out["realms"][realm] = keep + out["realms"].get(realm, [])
        except Exception as e:
            print("dress_export: could not merge existing file:", e)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=1)
    return {r: len(v) for r, v in out["realms"].items()}
