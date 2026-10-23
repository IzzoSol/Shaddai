# tools/k42_pikadon.py - PIKADON rebuilt on the council's shared 24-bone rig (owner 2026-10-23: the PIKADON.glb body was not PIKADON).
# Reference: public/assets/agents/PIKADON-portrait.png - red ornate plate armour, horned helm with a glowing visor slit, gold trim, big shield.
# Takes QUILL.glb's skeleton + all 23 clips (identical bone names on every agent), removes QUILL's mesh and builds the red armour as parts bound
# rigidly to the bones, then exports public/assets/agents/PIKADON.glb (the old file is kept as PIKADON_old_model.glb).
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python tools/k42_pikadon.py
import bpy, bmesh, math, os, shutil
from mathutils import Vector, Matrix
A = r'C:/Users/Brittany/Shaddai-3d/public/assets/agents/'
if not os.path.exists(A + 'PIKADON_old_model.glb'): shutil.copy(A + 'PIKADON.glb', A + 'PIKADON_old_model.glb')
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=A + 'QUILL.glb')
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o.type == 'MESH' or (o.type == 'EMPTY')]: bpy.data.objects.remove(o, do_unlink=True)   # QUILL's body + its stray icosphere
def mat(n, hexc, metal=0.7, rough=0.3, emit=0.0):
    m = bpy.data.materials.new(n); m.use_nodes = True; b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    c = tuple(((hexc >> s & 255) / 255.0) ** 2.2 for s in (16, 8, 0)) + (1,); b.inputs['Base Color'].default_value = c; b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = c; b.inputs['Emission Strength'].default_value = emit
    return m
RED, DARK, GOLD, VISOR, LEATHER = mat('pk_red', 0xb3121a), mat('pk_darkred', 0x5a0a10, 0.5, 0.45), mat('pk_gold', 0xd9a326, 0.9, 0.25), mat('pk_visor', 0xffc23a, 0.0, 0.3, 8.0), mat('pk_leather', 0x3a2418, 0.1, 0.8)
BN = rig.data.bones   # build in the rig's OWN space (QUILL's armature is stored at 0.01 scale - cm units)
def H(n): return BN[n].head_local.copy()
def T(n): return BN[n].tail_local.copy()
scale = (H('Head') - H('LeftFoot')).length / 1.55   # rig units per metre-ish (the agent is ~1.8 m)
parts = []
def seg(bone, a, b, w, d, mt, pad=0.0):   # a box from point a to b, w x d cross-section, bound to `bone`
    a, b = Vector(a), Vector(b); v = b - a; L = v.length + pad
    q = Vector((0, 0, 1)).rotation_difference(v.normalized()) if v.length > 1e-6 else Matrix().to_quaternion()
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((w, d, L, 1)))
    me = bpy.data.meshes.new('p'); bm.to_mesh(me); bm.free(); me.materials.append(mt); o = bpy.data.objects.new('p_' + bone, me); bpy.context.scene.collection.objects.link(o)
    o.vertex_groups.new(name=bone).add(list(range(len(me.vertices))), 1.0, 'REPLACE'); parts.append(o); return o
def blob(bone, c, sx, sy, sz, mt):
    return seg(bone, Vector(c) - Vector((0, 0, sz / 2)), Vector(c) + Vector((0, 0, sz / 2)), sx, sy, mt)
s = scale
# torso: hips, spine, chest plate, gold collar ring, belt, tabard
seg('Hips', H('Hips') - Vector((0, 0, 0.06 * s)), H('Spine02'), 0.36 * s, 0.24 * s, DARK)
seg('Spine01', H('Spine01'), H('Spine'), 0.42 * s, 0.27 * s, RED); seg('Spine', H('Spine'), H('neck'), 0.46 * s, 0.30 * s, RED)
blob('Spine', (H('Spine') + H('neck')) / 2 + Vector((0, -0.155 * s, 0.02 * s)), 0.30 * s, 0.03 * s, 0.24 * s, GOLD)          # chest emblem plate
blob('Spine', H('neck') - Vector((0, 0, 0.02 * s)), 0.40 * s, 0.32 * s, 0.05 * s, GOLD)                                        # collar
blob('Hips', H('Hips') + Vector((0, 0, 0.02 * s)), 0.40 * s, 0.28 * s, 0.07 * s, LEATHER); blob('Hips', H('Hips') + Vector((0, -0.145 * s, 0.02 * s)), 0.09 * s, 0.03 * s, 0.08 * s, GOLD)   # belt + buckle
seg('Hips', H('Hips') + Vector((0, -0.13 * s, -0.02 * s)), H('Hips') + Vector((0, -0.14 * s, -0.42 * s)), 0.18 * s, 0.03 * s, DARK)    # front tabard
seg('Hips', H('Hips') + Vector((0, 0.13 * s, -0.02 * s)), H('Hips') + Vector((0, 0.15 * s, -0.48 * s)), 0.30 * s, 0.03 * s, DARK)     # back cape panel
# head: horned helm + glowing visor slit + crest spike
hc = H('Head') + Vector((0, 0, 0.12 * s))   # head centre above the Head joint (its tail is far off, like the feet)
blob('Head', hc, 0.24 * s, 0.26 * s, 0.30 * s, RED); blob('Head', hc + Vector((0, -0.13 * s, 0.0)), 0.16 * s, 0.02 * s, 0.035 * s, VISOR)
seg('Head', hc + Vector((0, 0, 0.14 * s)), hc + Vector((0, 0, 0.32 * s)), 0.03 * s, 0.03 * s, GOLD)
for x in (-1, 1):
    seg('Head', hc + Vector((0.10 * x * s, 0, 0.10 * s)), hc + Vector((0.24 * x * s, 0, 0.30 * s)), 0.04 * s, 0.04 * s, RED)     # horns
    seg('Head', hc + Vector((0.24 * x * s, 0, 0.30 * s)), hc + Vector((0.20 * x * s, 0, 0.40 * s)), 0.025 * s, 0.025 * s, GOLD)
# arms: pauldrons, upper arm, vambrace, gauntlet; shield on the left forearm
for side, pre in (('Left', 1), ('Right', -1)):
    sh = H(side + 'Arm'); blob(side + 'Arm', sh + Vector((0, 0, 0.05 * s)), 0.22 * s, 0.24 * s, 0.10 * s, RED); blob(side + 'Arm', sh + Vector((0, 0, 0.0)), 0.24 * s, 0.26 * s, 0.025 * s, GOLD)
    seg(side + 'Arm', H(side + 'Arm'), H(side + 'ForeArm'), 0.11 * s, 0.11 * s, DARK)
    seg(side + 'ForeArm', H(side + 'ForeArm'), H(side + 'Hand'), 0.12 * s, 0.12 * s, RED); blob(side + 'ForeArm', H(side + 'ForeArm'), 0.13 * s, 0.13 * s, 0.03 * s, GOLD)
    blob(side + 'Hand', H(side + 'Hand') + (H(side + 'Hand') - H(side + 'ForeArm')).normalized() * 0.06 * s, 0.09 * s, 0.10 * s, 0.10 * s, RED)
fa = (H('LeftForeArm') + H('LeftHand')) / 2; out = (H('LeftHand') - H('RightHand')).normalized()
sp = fa + out * 0.10 * s; seg('LeftForeArm', sp - Vector((0, 0, 0.36 * s)), sp + Vector((0, 0, 0.40 * s)), 0.04 * s, 0.50 * s, RED)   # the shield
seg('LeftForeArm', sp + out * 0.025 * s - Vector((0, 0, 0.30 * s)), sp + out * 0.025 * s + Vector((0, 0, 0.34 * s)), 0.02 * s, 0.40 * s, GOLD)
blob('LeftForeArm', sp + out * 0.04 * s + Vector((0, 0, 0.02 * s)), 0.03 * s, 0.14 * s, 0.14 * s, VISOR)                           # glowing shield gem
# legs: thigh, knee guard, greave, boot
for side in ('Left', 'Right'):
    seg(side + 'UpLeg', H(side + 'UpLeg'), H(side + 'Leg'), 0.15 * s, 0.16 * s, DARK)
    blob(side + 'Leg', H(side + 'Leg') + Vector((0, -0.04 * s, 0)), 0.14 * s, 0.10 * s, 0.12 * s, GOLD)
    seg(side + 'Leg', H(side + 'Leg'), H(side + 'Foot'), 0.13 * s, 0.14 * s, RED)
    seg(side + 'Foot', H(side + 'Foot'), H(side + 'ToeBase'), 0.12 * s, 0.10 * s, RED, pad=0.06 * s)   # foot -> toe (the foot bone's tail is far off)
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); body = bpy.context.object; body.name = 'PIKADON_armour'
body.data.transform(rig.matrix_world)   # rig-space cm -> world metres, then bind with Blender's own operator (handles the 0.01 rig scale)
for a_ in ([rig.animation_data] if rig.animation_data else []): a_.action = None
for pb in rig.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_NAME')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=A + 'PIKADON.glb', export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_yup=True)
print('K42OUT', os.path.getsize(A + 'PIKADON.glb'), 'actions', len(bpy.data.actions))
