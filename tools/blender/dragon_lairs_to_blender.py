# tools/blender/dragon_lairs_to_blender.py - (2026-10-24) move the REALM_VIEW dragons from the old station perches to their sleeping lairs,
# same rule as SHADDAI-WORLD-3D.html lairFor: highest dry ground 3750-4500 m out, 6-18 deg off the station's road axis; the Void dragon by the citadel gate.
import bpy, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
SC = bpy.data.scenes['REALM_VIEW']; bpy.context.window.scene = SC
T = bpy.data.objects['realm_terrain']; te = T.evaluated_get(bpy.context.evaluated_depsgraph_get()); tm = te.to_mesh(); tm.calc_loop_triangles()
bvh = BVHTree.FromPolygons([T.matrix_world @ v.co for v in tm.vertices], [t.vertices[:] for t in tm.loop_triangles]); te.to_mesh_clear()
def gz(x, y): h = bvh.ray_cast(Vector((x, y, 3000)), Vector((0, 0, -1))); return h[0].z if h[0] else -999
STN = {'rift': 0, 'desert': 31, 'forge': 54, 'suburb': 90, 'meadow': 142.1, 'harbor': 225, 'darkvault': 299.1, 'arctic': 333.4}
moved = 0
for o in list(SC.objects):
    if not (o.instance_collection and 'dragon' in o.instance_collection.name.lower()): continue
    if o.name.endswith('.001'): o.hide_set(True); continue
    sid = o.name.replace('dragon_', '')
    if sid not in STN: continue
    if sid == 'rift': o.location = (70, 4050, gz(70, 4050)); moved += 1; continue
    best = None
    for dc in range(-18, 19, 3):
        if abs(dc) < 6: continue
        for r in range(3750, 4501, 75):
            a = math.radians(STN[sid] + dc); x, y = math.sin(a) * r, math.cos(a) * r; z = gz(x, y)
            if z > 8 and (best is None or z > best[2]): best = (x, y, z)
    if best: o.location = best; moved += 1
bpy.ops.wm.save_mainfile(); print('dragons moved', moved)
