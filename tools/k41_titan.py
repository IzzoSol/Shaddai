# tools/k41_titan.py - K41 REALM TITAN (owner 2026-10-23 refs CNCRONIN1 / CNCJACK3 / CNCJACK4: ornate armoured samurai-aztec giants).
# A 40 m rigged humanoid built in code: armature (13 bones) + rigid-skinned armour parts + three actions (idle, walk, slam). Exported headless:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python tools/k41_titan.py
# Writes public/assets/creatures/titan-rigged.glb. Colours are the base palette; the game tints one copy per realm.
import bpy, bmesh, math, os
from mathutils import Matrix, Vector
OUT = r'C:/Users/Brittany/Shaddai-3d/public/assets/creatures/titan-rigged.glb'
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
def mat(n, hexc, metal=0.6, rough=0.35, emit=0.0):
    m = bpy.data.materials.new(n); m.use_nodes = True; b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    c = tuple(((hexc >> s & 255) / 255.0) ** 2.2 for s in (16, 8, 0)) + (1,); b.inputs['Base Color'].default_value = c; b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = c; b.inputs['Emission Strength'].default_value = emit
    return m
ARM, GOLD, MAG, SUIT, EYE = mat('ti_armour', 0x2a8a6a), mat('ti_gold', 0xd4a020, 0.9, 0.25), mat('ti_magenta', 0xc02a8a, 0.4, 0.4), mat('ti_suit', 0x1a1a2a, 0.2, 0.7), mat('ti_eye', 0xffd040, 0.0, 0.3, 8.0)
MATS = [ARM, GOLD, MAG, SUIT, EYE]
# ---- armature ----
bpy.ops.object.armature_add(location=(0, 0, 0)); rig = bpy.context.object; rig.name = 'TitanRig'; A = rig.data; A.name = 'TitanRig'
bpy.ops.object.mode_set(mode='EDIT'); eb = A.edit_bones; eb.remove(eb[0])
B = {}
def bone(n, h, t, parent=None):
    b = eb.new(n); b.head = h; b.tail = t
    if parent: b.parent = B[parent]
    B[n] = b; return b
bone('root', (0, 0, 0), (0, 0, 2)); bone('hips', (0, 0, 18), (0, 0, 21), 'root'); bone('spine', (0, 0, 21), (0, 0, 31), 'hips'); bone('head', (0, 0, 32), (0, 0, 38), 'spine')
for s, x in (('L', 1), ('R', -1)):
    bone('uarm.' + s, (7 * x, 0, 30), (8 * x, 0, 21), 'spine'); bone('farm.' + s, (8 * x, 0, 21), (8.5 * x, 0, 12), 'uarm.' + s)
    bone('thigh.' + s, (3 * x, 0, 18), (3 * x, 0, 9), 'hips'); bone('shin.' + s, (3 * x, 0, 9), (3 * x, 0, 1), 'thigh.' + s)
bpy.ops.object.mode_set(mode='OBJECT')
# ---- armour parts, each rigidly bound to one bone ----
parts = []
def part(bone_name, mt, build):
    bm = bmesh.new(); build(bm); me = bpy.data.meshes.new('p'); bm.to_mesh(me); bm.free(); me.materials.append(mt)
    o = bpy.data.objects.new('p_' + bone_name, me); bpy.context.scene.collection.objects.link(o); vg = o.vertex_groups.new(name=bone_name); vg.add(list(range(len(me.vertices))), 1.0, 'REPLACE'); parts.append(o)
def box(cx, cy, cz, sx, sy, sz, rx=0.0, rz=0.0): return lambda bm: bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Diagonal((sx, sy, sz, 1)))
def cyl(cx, cy, z0, z1, r1, r2, seg=10): return lambda bm: bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=abs(z1 - z0), matrix=Matrix.Translation((cx, cy, (z0 + z1) / 2)))
def multi(*fs): return lambda bm: [f(bm) for f in fs]
part('hips', SUIT, box(0, 0, 19.5, 9, 5.5, 4)); part('hips', ARM, multi(*[box(math.sin(a) * 5.2, math.cos(a) * 3.4, 15.5, 4.2, 1.0, 6.5, 0.18 * math.cos(a), -a) for a in [k * math.pi / 4 for k in range(8)]]))   # tasset plates
part('hips', GOLD, box(0, 0, 21.2, 10, 6.2, 0.9))
part('spine', ARM, box(0, 0, 26.5, 12, 7.5, 10)); part('spine', GOLD, multi(box(0, -3.9, 27, 9, 0.5, 1.0), box(0, -3.9, 24.5, 7, 0.5, 0.8), box(0, -3.9, 29.5, 10, 0.5, 0.8)))
part('spine', MAG, box(0, -3.95, 26.8, 3, 0.5, 3, 0, 0.785)); part('spine', SUIT, box(0, 0, 31.2, 5, 4, 2))
part('head', ARM, box(0, 0, 34.8, 4.4, 4.6, 5)); part('head', GOLD, multi(box(0, 0, 37.6, 6.5, 6.5, 0.8), box(-2.2, -1.5, 39.5, 0.6, 0.6, 4.5, 0, -0.5), box(2.2, -1.5, 39.5, 0.6, 0.6, 4.5, 0, 0.5)))   # brim + kuwagata crest
part('head', SUIT, box(0, -2.4, 34.2, 3.4, 0.4, 2.4)); part('head', EYE, multi(box(-0.8, -2.65, 35.0, 0.9, 0.2, 0.45), box(0.8, -2.65, 35.0, 0.9, 0.2, 0.45)))
for s, x in (('L', 1), ('R', -1)):
    part('uarm.' + s, ARM, box(8.5 * x, 0, 30.5, 6.5, 7.5, 3.2, 0, 0.12 * x)); part('uarm.' + s, GOLD, box(8.8 * x, 0, 29.0, 6.8, 7.8, 0.6))   # pauldron
    part('uarm.' + s, SUIT, cyl(7.5 * x, 0, 21, 29, 1.5, 1.7)); part('farm.' + s, ARM, cyl(8.3 * x, 0, 13, 21, 1.6, 1.3)); part('farm.' + s, GOLD, cyl(8.3 * x, 0, 16, 17, 1.75, 1.75))
    part('farm.' + s, SUIT, box(8.5 * x, 0, 11, 2.6, 2.2, 2.6))
    part('thigh.' + s, SUIT, cyl(3 * x, 0, 9, 18, 1.9, 2.3)); part('thigh.' + s, ARM, box(3.2 * x, -1.2, 13.5, 3.6, 1.2, 6))
    part('shin.' + s, ARM, cyl(3 * x, 0, 1.5, 9, 1.6, 2.0)); part('shin.' + s, GOLD, cyl(3 * x, 0, 7.5, 8.4, 2.1, 2.1)); part('shin.' + s, SUIT, box(3 * x, -1.2, 0.8, 3.0, 5.0, 1.6))
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); body = bpy.context.object; body.name = 'TitanBody'
body.parent = rig; mod = body.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
# ---- actions: idle / walk / slam ----
rig.animation_data_create(); bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE'); P = rig.pose.bones
for pb in P: pb.rotation_mode = 'XYZ'
def act(name, frames, keys):
    a = bpy.data.actions.new(name); rig.animation_data.action = a
    for f, pose in keys:
        for pb in P: pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
        for bn, (rx, ry, rz) in pose.items():
            if bn == 'root_z': P['root'].location = (0, rx, 0); P['root'].keyframe_insert('location', frame=f); continue
            P[bn].rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
        for pb in P: pb.keyframe_insert('rotation_euler', frame=f)
    tr = rig.animation_data.nla_tracks.new(); tr.name = name; tr.strips.new(name, 1, a); rig.animation_data.action = None
act('idle', 48, [(1, {'spine': (2, 0, 0), 'uarm.L': (0, 0, 4), 'uarm.R': (0, 0, -4)}), (25, {'spine': (-2, 0, 1), 'uarm.L': (3, 0, 6), 'uarm.R': (3, 0, -6), 'head': (0, 0, 6)}), (48, {'spine': (2, 0, 0), 'uarm.L': (0, 0, 4), 'uarm.R': (0, 0, -4)})])
def walkpose(s): return {'thigh.L': (25 * s, 0, 0), 'thigh.R': (-25 * s, 0, 0), 'shin.L': (max(0, -30 * s), 0, 0), 'shin.R': (max(0, 30 * s), 0, 0), 'uarm.L': (-18 * s, 0, 4), 'uarm.R': (18 * s, 0, -4), 'spine': (4, 0, 4 * s)}
act('walk', 32, [(1, walkpose(1)), (9, walkpose(0)), (17, walkpose(-1)), (25, walkpose(0)), (32, walkpose(1))])
act('slam', 40, [(1, {}), (14, {'uarm.L': (-160, 0, 10), 'uarm.R': (-160, 0, -10), 'farm.L': (-20, 0, 0), 'farm.R': (-20, 0, 0), 'spine': (-12, 0, 0)}),
                 (22, {'uarm.L': (-40, 0, 6), 'uarm.R': (-40, 0, -6), 'spine': (28, 0, 0), 'head': (10, 0, 0), 'thigh.L': (-20, 0, 0), 'thigh.R': (-20, 0, 0), 'shin.L': (35, 0, 0), 'shin.R': (35, 0, 0)}),
                 (30, {'uarm.L': (-40, 0, 6), 'uarm.R': (-40, 0, -6), 'spine': (24, 0, 0), 'thigh.L': (-15, 0, 0), 'thigh.R': (-15, 0, 0), 'shin.L': (28, 0, 0), 'shin.R': (28, 0, 0)}), (40, {})])
bpy.ops.object.mode_set(mode='OBJECT')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True, export_yup=True)
print('K41OUT', os.path.getsize(OUT), 'bones', len(A.bones), 'actions', [a.name for a in bpy.data.actions])
