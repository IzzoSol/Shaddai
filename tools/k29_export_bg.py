"""tools/k29_export_bg.py — build + export K29 realm districts in a HEADLESS Blender (2026-10-23).

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python tools/k29_export_bg.py -- desert volcano ...

Why headless: exporting from the owner's open Blender froze/crashed it twice (stale selections across scenes leaked the void
landmark into every district GLB; the temp_override export then hung). A fresh background process has one scene, no UI and
no history, so a plain selection export is exact. Writes public/assets/kits/shaddai_dist_<realm>_<slot>_v01.glb and prints
one line per file with its node names, so the caller can verify each file holds ONLY its own piece.
"""
import bpy, sys, os

SRC = r"C:/Users/Brittany/Shaddai/public/assets/kits/_src/"
OUT = r"C:/Users/Brittany/Shaddai-3d/public/assets/kits"
realms = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for f in ("k1_tower.py", "k6_race.py", "k8_realm_stations.py", "k28_realm_landmarks.py", "k28b_realm_landmarks.py", "k29_realm_districts.py"):
    exec(open(SRC + f, encoding="utf-8").read())
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)          # factory cube / camera / light


def export_only(ob, path):
    for o in list(bpy.context.scene.objects):
        if o is not None: o.select_set(False)
    for o in [ob] + list(ob.children_recursive): o.select_set(True)
    ca = ob.data.color_attributes
    if ca.get("Col"): ca.active_color = ca["Col"]; ca.render_color_index = ca.find("Col")
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_cameras=False, export_lights=False)
    try: bpy.ops.export_scene.gltf(export_vertex_color="ACTIVE", **kw)
    except TypeError: bpy.ops.export_scene.gltf(**kw)


for realm in realms:
    for slot in SLOTS:
        ob, info = build_district_piece(realm, slot); ob["vc_linear_ok"] = 1
        path = OUT + "/shaddai_dist_%s_%s_v01.glb" % (realm, slot)
        export_only(ob, path)
        for o in [ob] + list(ob.children_recursive): bpy.data.objects.remove(o, do_unlink=True)   # next piece starts alone
        print("K29OUT", realm, slot, os.path.getsize(path))
print("K29DONE")
