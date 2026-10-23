# tools/blender/park_platform_to_blender.py - (2026-10-23) K40 hover-skate park at PLAZA_SKATE (-880, 0), entrance facing the city centre, and the
# reef-style Crystal Sea platform + glass bridge to Reef B (world coords). Collection PARK_20261023; the earlier code-built ocean_deck_* are hidden.
import bpy, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
REPO = r'C:/Users/Brittany/Shaddai-3d'; SC = bpy.data.scenes['REALM_VIEW']
C = bpy.data.collections.get('PARK_20261023') or bpy.data.collections.new('PARK_20261023')
if C.name not in [x.name for x in SC.collection.children]: SC.collection.children.link(C)
for o in list(C.objects): bpy.data.objects.remove(o, do_unlink=True)
def imp(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        C.objects.link(o)
    return [o for o in new if o.parent is None]
T = bpy.data.objects['realm_terrain']; te = T.evaluated_get(bpy.context.evaluated_depsgraph_get()); tm = te.to_mesh()
tm.calc_loop_triangles(); bvh = BVHTree.FromPolygons([T.matrix_world @ v.co for v in tm.vertices], [t.vertices[:] for t in tm.loop_triangles]); te.to_mesh_clear()   # displayed triangulation (quads split differently were up to 4 m off)
h = bvh.ray_cast(Vector((-880, 0, 3000)), Vector((0, 0, -1))); gz = h[0].z if h[0] else 6
for r in imp(REPO + '/../Shaddai/fal-assets/backups/glb-prepack/shaddai_hover_park_v01.glb'): r.location = (-880, 0, gz); r.rotation_euler = (0, 0, math.radians(90))
imp(REPO + '/../Shaddai/fal-assets/backups/glb-prepack/shaddai_ocean_platform_v01.glb')
for n in ('ocean_deck_teal', 'ocean_deck_white', 'ocean_deck_glow'):
    o = bpy.data.objects.get(n)
    if o: o.hide_set(True)
bpy.ops.wm.save_mainfile(); print('PARK ok', len(C.objects))
