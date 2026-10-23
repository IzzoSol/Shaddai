# tools/blender/k38_k41_to_blender.py - (2026-10-24) refresh the huge citadel (SETPIECES_20261023), the walkable arctic peaks (FINISH_20261023) and
# place a rigged titan per realm (TITANS_20261024; same spots as world-titans.js) + one beside the agents in AGENTS_VIEW.
import bpy, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
REPO = r'C:/Users/Brittany/Shaddai-3d'; SC = bpy.data.scenes['REALM_VIEW']; win = bpy.context.window; win.scene = SC
def imp(path, c):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        c.objects.link(o)
    return [o for o in new if o.parent is None]
SP = bpy.data.collections['SETPIECES_20261023']
for o in [o for o in SP.objects if o.name.startswith('citadel')]: bpy.data.objects.remove(o, do_unlink=True)
imp(REPO + '/../Shaddai/fal-assets/backups/glb-prepack/shaddai_void_citadel_v01.glb', SP)
FIN = bpy.data.collections['FINISH_20261023']
for o in [o for o in FIN.objects if o.name.startswith('arctic_peaks')]: bpy.data.objects.remove(o, do_unlink=True)
imp(REPO + '/../Shaddai/fal-assets/backups/glb-prepack/shaddai_arctic_peaks_v01.glb', FIN)
TC = bpy.data.collections.get('TITANS_20261024') or bpy.data.collections.new('TITANS_20261024')
if TC.name not in [x.name for x in SC.collection.children]: SC.collection.children.link(TC)
for o in list(TC.objects): bpy.data.objects.remove(o, do_unlink=True)
T = bpy.data.objects['realm_terrain']; te = T.evaluated_get(bpy.context.evaluated_depsgraph_get()); tm = te.to_mesh()
tm.calc_loop_triangles(); bvh = BVHTree.FromPolygons([T.matrix_world @ v.co for v in tm.vertices], [t.vertices[:] for t in tm.loop_triangles]); te.to_mesh_clear()   # displayed triangulation (quads split differently were up to 4 m off)
def gz(x, y): h = bvh.ray_cast(Vector((x, y, 3000)), Vector((0, 0, -1))); return h[0].z if h[0] else 0
REALMS = {'arctic': 330, 'darkforest': 285, 'desert': 24, 'volcano': 66, 'meadow': 152, 'suburb': 112, 'void': 8, 'forest': 100}
for rid, deg in REALMS.items():
    a = math.radians(deg); best = None
    for r in range(3500, 4301, 100):
        x, y = math.sin(a) * r, math.cos(a) * r; z = gz(x, y)
        if z > 8 and (best is None or abs(r - 3800) < abs(best[3] - 3800)): best = (x, y, z, r)
    if not best: continue
    for ro in imp(REPO + '/public/assets/creatures/titan-rigged.glb', TC): ro.location = best[:3]; ro.name = 'TITAN_' + rid
AV = bpy.data.scenes['AGENTS_VIEW']; win.scene = AV
AC = bpy.data.collections['AGENTS_RIGGED']
for o in [o for o in AC.objects if o.name.startswith('TITAN')]: bpy.data.objects.remove(o, do_unlink=True)
for ro in imp(REPO + '/public/assets/creatures/titan-rigged.glb', AC): ro.location = (14, 6, 0); ro.scale = (0.12, 0.12, 0.12); ro.name = 'TITAN_preview'
win.scene = SC; bpy.ops.wm.save_mainfile(); print('K38/K41 ok titans', len([o for o in TC.objects if o.name.startswith('TITAN')]))
