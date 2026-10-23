# tools/blender/citadel_arena_agents_to_blender.py - (2026-10-23) K38 citadel + K39 hover arena into REALM_VIEW (collection SETPIECES_20261023),
# and the 7 rigged council agents (public/assets/agents/*.glb, 24 bones, 23 clips) lined up in their own scene AGENTS_VIEW.
import bpy, math, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree
REPO = r'C:/Users/Brittany/Shaddai-3d'; SC = bpy.data.scenes['REALM_VIEW']
def coll(sc, n):
    c = bpy.data.collections.get(n) or bpy.data.collections.new(n)
    if c.name not in [x.name for x in sc.collection.children]: sc.collection.children.link(c)
    for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
    return c
def imp(path, c):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        c.objects.link(o)
    return [o for o in new if o.parent is None]
win = bpy.context.window; old = win.scene; win.scene = SC
C = coll(SC, 'SETPIECES_20261023')
imp(REPO + '/public/assets/kits/shaddai_void_citadel_v01.glb', C)
T = bpy.data.objects['realm_terrain']; te = T.evaluated_get(bpy.context.evaluated_depsgraph_get()); tm = te.to_mesh()
tm.calc_loop_triangles(); bvh = BVHTree.FromPolygons([T.matrix_world @ v.co for v in tm.vertices], [t.vertices[:] for t in tm.loop_triangles]); te.to_mesh_clear()   # displayed triangulation (quads split differently were up to 4 m off)
hit = bvh.ray_cast(Vector((380, -3050, 3000)), Vector((0, 0, -1))); gz = hit[0].z if hit[0] else 0
for r in imp(REPO + '/public/assets/kits/shaddai_hover_arena_v01.glb', C): r.location = (380, -3050, gz)
AV = bpy.data.scenes.get('AGENTS_VIEW') or bpy.data.scenes.new('AGENTS_VIEW'); win.scene = AV
A = coll(AV, 'AGENTS_RIGGED')
for i, n in enumerate(['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON']):
    roots = imp(REPO + '/public/assets/agents/%s.glb' % n, A)
    for r in roots: r.location = (i * 3.0 - 9, 0, 0); r.name = 'AGENT_' + n
win.scene = SC
bpy.ops.wm.save_mainfile(); print('SETPIECES ok; agents', len(A.objects), 'objects in AGENTS_VIEW')
