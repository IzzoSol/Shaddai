# tools/blender/ocean_deck_to_blender.py - restyle the Crystal Sea town deck in REALM_VIEW to match world-realm-dress.js (2026-10-23):
# dark teal deck, white rim, cyan glow edge, eight piers with mooring posts. Hides the plain deck_town2-ocean disc (not deleted).
import bpy, bmesh, math, json
from mathutils import Matrix
SC = bpy.data.scenes['REALM_VIEW']; FIN = bpy.data.collections['FINISH_20261023']
T = json.load(open(r'C:/Users/Brittany/Shaddai-3d/public/assets/world/realm-towns-v2.json'))['towns']; t = next(x for x in T if x['realm'] == 'ocean')
cx, cy, Y = t['c'][0], -t['c'][1], 2.0 + 1.2
old = bpy.data.objects.get('deck_town2-ocean')
if old: old.hide_set(True); old.hide_render = True
for n in ('ocean_deck_teal', 'ocean_deck_white', 'ocean_deck_glow'):
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)
def mat(n, rgb, emit=0):
    m = bpy.data.materials.get(n) or bpy.data.materials.new(n); m.use_nodes = True; b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = rgb + (1,); m.diffuse_color = rgb + (1,)
    if emit: b.inputs['Emission Color'].default_value = rgb + (1,); b.inputs['Emission Strength'].default_value = emit
    return m
B = {k: bmesh.new() for k in ('teal', 'white', 'glow')}
bmesh.ops.create_cone(B['teal'], cap_ends=True, segments=64, radius1=146, radius2=150, depth=2.4, matrix=Matrix.Translation((cx, cy, Y - 1.2)))
def ring(bm, R, r, z, seg=96):
    vs = [[bm.verts.new((cx + (R + r * math.cos(2 * math.pi * j / 6)) * math.cos(2 * math.pi * i / seg), cy + (R + r * math.cos(2 * math.pi * j / 6)) * math.sin(2 * math.pi * i / seg), z + r * math.sin(2 * math.pi * j / 6))) for j in range(6)] for i in range(seg)]
    for i in range(seg):
        for j in range(6): bm.faces.new((vs[i][j], vs[(i + 1) % seg][j], vs[(i + 1) % seg][(j + 1) % 6], vs[i][(j + 1) % 6]))
ring(B['white'], 152, 3, Y - 0.2); ring(B['glow'], 155.5, 0.6, Y - 0.6)
for k in range(8):
    a = k * math.pi / 4 + math.pi / 8; ux, uy = math.sin(a), math.cos(a)
    bmesh.ops.create_cube(B['white'], size=1, matrix=Matrix.Translation((cx + ux * 182, cy + uy * 182, Y - 0.8)) @ Matrix.Rotation(-a, 4, 'Z') @ Matrix.Diagonal((8, 60, 1.2, 1)))
    for mk in range(3):
        d = 165 + mk * 20; sd = 5 if mk % 2 else -5
        bmesh.ops.create_cone(B['glow'], cap_ends=True, segments=6, radius1=0.4, radius2=0.4, depth=3, matrix=Matrix.Translation((cx + ux * d + uy * sd, cy + uy * d - ux * sd, Y + 0.3)))
M = {'teal': mat('od_teal', (0.012, 0.045, 0.06)), 'white': mat('od_white', (0.86, 0.89, 0.91)), 'glow': mat('od_glow', (0.11, 0.8, 1.0), 3)}
for k, bm in B.items():
    me = bpy.data.meshes.new('ocean_deck_' + k); bm.to_mesh(me); bm.free(); me.materials.append(M[k]); FIN.objects.link(bpy.data.objects.new('ocean_deck_' + k, me))
bpy.ops.wm.save_mainfile(); print('ocean deck ok')
