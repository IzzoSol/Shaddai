"""tools/k31_export_bg.py — build + export K31 EDGE REALMS in a HEADLESS Blender (2026-10-23).

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python tools/k31_export_bg.py -- harbor arch veil rise cloudsea

Same reason as k29_export_bg.py (exporting from the open UI froze it). Writes public/assets/kits/shaddai_edge_<id>_v01.glb.
"""
import bpy, sys, os

SRC = r"C:/Users/Brittany/Shaddai/public/assets/kits/_src/"
OUT = r"C:/Users/Brittany/Shaddai-3d/public/assets/kits"
ids = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for f in ("k1_tower.py", "k6_race.py", "k8_realm_stations.py", "k28_realm_landmarks.py", "k31_edge_realms.py"):
    exec(open(SRC + f, encoding="utf-8").read())
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

for eid in ids or list(EDGE_BUILDERS):
    ob = EDGE_BUILDERS[eid](); ob["vc_linear_ok"] = 1
    for o in list(bpy.context.scene.objects): o.select_set(False)
    for o in [ob] + list(ob.children_recursive): o.select_set(True)
    path = OUT + "/shaddai_edge_%s_v01.glb" % eid
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_cameras=False, export_lights=False)
    try: bpy.ops.export_scene.gltf(export_vertex_color="ACTIVE", **kw)
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    print("K31OUT", eid, os.path.getsize(path), len(ob.data.polygons))
    for o in [ob] + list(ob.children_recursive): bpy.data.objects.remove(o, do_unlink=True)
print("K31DONE")
