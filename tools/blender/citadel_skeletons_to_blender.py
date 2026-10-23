# tools/blender/citadel_skeletons_to_blender.py - (2026-10-24) refresh the citadel (void goo + walkway) and show the six skeleton guards
# (game: world-mobs.js 'skeleton' camp, x -22.5..22.5 m at y 4060, aggro 10 m) as bone-white figures with violet eyes.
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
REPO = r'C:/Users/Brittany/Shaddai-3d'; SC = bpy.data.scenes['REALM_VIEW']; bpy.context.window.scene = SC
SP = bpy.data.collections['SETPIECES_20261023']
for o in [o for o in SP.objects if o.name.startswith(('citadel', 'skeleton'))]: bpy.data.objects.remove(o, do_unlink=True)
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=REPO + '/public/assets/kits/shaddai_void_citadel_v01.glb')
for o in [o for o in bpy.data.objects if o not in before]:
    for uc in list(o.users_collection): uc.objects.unlink(o)
    SP.objects.link(o)
T = bpy.data.objects['realm_terrain']; te = T.evaluated_get(bpy.context.evaluated_depsgraph_get()); tm = te.to_mesh(); tm.calc_loop_triangles()
bvh = BVHTree.FromPolygons([T.matrix_world @ v.co for v in tm.vertices], [t.vertices[:] for t in tm.loop_triangles]); te.to_mesh_clear()
def mat(n, rgb, emit=0):
    m = bpy.data.materials.get(n) or bpy.data.materials.new(n); m.use_nodes = True; b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = rgb + (1,); m.diffuse_color = rgb + (1,)
    if emit: b.inputs['Emission Color'].default_value = rgb + (1,); b.inputs['Emission Strength'].default_value = emit
    return m
bone, eye = mat('sk_bone', (0.82, 0.79, 0.7)), mat('sk_eye', (0.6, 0.25, 1.0), 6)
for k in range(6):
    x = (k - 2.5) * 9; y = 4060; h = bvh.ray_cast(Vector((x, y, 3000)), Vector((0, 0, -1))); z = h[0].z if h[0] else 30
    bm = bmesh.new(); eb = bmesh.new()
    def box(c, s): bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(c) @ Matrix.Diagonal(s + (1,)))
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.14, matrix=Matrix.Translation((0, 0, 1.68)))
    for i in range(5): box((0, 0, 1.15 + i * 0.07), (0.34 - abs(i - 2) * 0.03, 0.18, 0.025))     # ribs
    box((0, 0, 1.2), (0.04, 0.04, 0.5)); box((0, 0, 0.92), (0.26, 0.14, 0.08))                    # spine + pelvis
    for sx in (-1, 1):
        box((sx * 0.1, 0, 0.47), (0.04, 0.04, 0.85)); box((sx * 0.26, 0, 1.18), (0.035, 0.035, 0.55)); box((sx * 0.1, 0.06, 0.03), (0.08, 0.16, 0.04))
        bmesh.ops.create_cube(eb, size=1, matrix=Matrix.Translation((sx * 0.05, -0.12, 1.7)) @ Matrix.Diagonal((0.04, 0.02, 0.03, 1)))
    me = bpy.data.meshes.new('skeleton_%d' % k); bm.to_mesh(me); bm.free(); me.materials.append(bone); o = bpy.data.objects.new(me.name, me); SP.objects.link(o)
    em = bpy.data.meshes.new('skeleton_eyes_%d' % k); eb.to_mesh(em); eb.free(); em.materials.append(eye); e = bpy.data.objects.new(em.name, em); SP.objects.link(e); e.parent = o
    o.location = (x, y, z); o.scale = (1.15, 1.15, 1.15)
bpy.ops.wm.save_mainfile(); print('citadel + 6 skeletons ok')
