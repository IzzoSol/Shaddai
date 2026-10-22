"""tools/glb_fix_bg.py — headless GLB repair: rotate (fix a model lying on its side) and re-export to a NEW file (2026-10-23).

  blender -b --factory-startup --python tools/glb_fix_bg.py -- <in.glb> <out.glb> <rot_x_deg> [rot_y_deg] [rot_z_deg]

Rotations are applied to the whole import about the world origin, then baked (export_apply). The source file is never written.
Prints FIXOUT <out> <width> <depth> <height> (Blender metres, Z up) so the caller can confirm the model now stands upright.
"""
import bpy, sys, math, os
from mathutils import Euler, Vector

a = sys.argv[sys.argv.index("--") + 1:]
src, dst = a[0], a[1]
rx, ry, rz = (float(a[i]) if len(a) > i else 0.0 for i in (2, 3, 4))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=src)
roots = [o for o in bpy.context.scene.objects if o.parent is None]
R = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ").to_matrix().to_4x4()
for o in roots: o.matrix_world = R @ o.matrix_world
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in bpy.context.scene.objects if o.type == "MESH" for c in o.bound_box]
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
os.makedirs(os.path.dirname(dst), exist_ok=True)
for o in bpy.context.scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=False, export_yup=True, export_apply=True, export_extras=True, export_cameras=False, export_lights=False)
print("FIXOUT", dst, round(mx.x - mn.x, 3), round(mx.y - mn.y, 3), round(mx.z - mn.z, 3))
