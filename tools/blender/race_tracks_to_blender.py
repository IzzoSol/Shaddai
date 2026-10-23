# tools/blender/race_tracks_to_blender.py - (2026-10-24) the two live race tracks into REALM_VIEW (collection RACE_20261024), from the same
# generator the game uses (public/world-race.js TRACKS): Skyline Circuit 'grand-course' (deck height per point, on pylons) + Dragon Gate figure-8.
# Input: %TEMP%/tracks.json written by: node -e "...require('./public/world-race.js') ... TRACKS[id]()" (see the session notes).
import bpy, bmesh, json, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
SC = bpy.data.scenes['REALM_VIEW']; bpy.context.window.scene = SC
TR = json.load(open(os.path.join(os.environ.get('TEMP', r'C:/Users/Brittany/AppData/Local/Temp'), 'tracks.json')))
C = bpy.data.collections.get('RACE_20261024') or bpy.data.collections.new('RACE_20261024')
if C.name not in [x.name for x in SC.collection.children]: SC.collection.children.link(C)
for o in list(C.objects): bpy.data.objects.remove(o, do_unlink=True)
T = bpy.data.objects['realm_terrain']; te = T.evaluated_get(bpy.context.evaluated_depsgraph_get()); tm = te.to_mesh(); tm.calc_loop_triangles()
bvh = BVHTree.FromPolygons([T.matrix_world @ v.co for v in tm.vertices], [t.vertices[:] for t in tm.loop_triangles]); te.to_mesh_clear()
def gz(x, y): h = bvh.ray_cast(Vector((x, y, 3000)), Vector((0, 0, -1))); return h[0].z if h[0] else 0
def mat(n, rgb, emit=0):
    m = bpy.data.materials.get(n) or bpy.data.materials.new(n); m.use_nodes = True; b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = rgb + (1,); m.diffuse_color = rgb + (1,)
    if emit: b.inputs['Emission Color'].default_value = rgb + (1,); b.inputs['Emission Strength'].default_value = emit
    return m
deckM, glowM, pylM = mat('rc_deck', (0.03, 0.035, 0.05)), mat('rc_glow', (1.0, 0.25, 0.05), 5), mat('rc_pylon', (0.8, 0.82, 0.86))
def build(name, P, W, closed=True):
    n = len(P); bm = bmesh.new(); gb = bmesh.new(); rows = []
    for i, p in enumerate(P):
        a, b = P[(i - 1) % n], P[(i + 1) % n]; dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1; sx, sy = -dy / l, dx / l
        g = gz(p[0], p[1]); z = g + (p[2] if len(p) > 2 else 0) + 1.0
        rows.append([bm.verts.new((p[0] + sx * t * W / 2, p[1] + sy * t * W / 2, max(z, gz(p[0] + sx * t * W / 2, p[1] + sy * t * W / 2) + 1.0) if len(p) < 3 or p[2] < 2 else z)) for t in (-1, 0, 1)])
        if len(p) > 2 and p[2] > 3 and i % 3 == 0:
            bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=1.6, radius2=1.6, depth=z - g, matrix=Matrix.Translation((p[0], p[1], (z + g) / 2)))
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        for s in range(2): bm.faces.new((rows[i][s], rows[j][s], rows[j][s + 1], rows[i][s + 1]))
        for s in (0, 2):
            a0, a1 = rows[i][s].co, rows[j][s].co; v = [gb.verts.new(a0 + Vector((0, 0, 0.05))), gb.verts.new(a1 + Vector((0, 0, 0.05))), gb.verts.new(a1 + Vector((0, 0, 0.9))), gb.verts.new(a0 + Vector((0, 0, 0.9)))]; gb.faces.new(v)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(deckM); C.objects.link(bpy.data.objects.new(name, me))
    gm = bpy.data.meshes.new(name + '_edge'); gb.to_mesh(gm); gb.free(); gm.materials.append(glowM); C.objects.link(bpy.data.objects.new(name + '_edge', gm))
build('race_skyline_circuit', TR['grand-course'], 22)
build('race_dragon_gate', TR['dragon-gate'], 20)
bpy.ops.wm.save_mainfile(); print('RACE ok')
