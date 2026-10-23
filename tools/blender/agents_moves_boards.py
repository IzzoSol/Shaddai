# tools/blender/agents_moves_boards.py - AGENTS_VIEW showcase (owner 2026-10-24: "agent movements rigged, hoverboards ... in blender").
# Row 1: each council agent plays a different clip of its 23 (NLA solo). Row 2: a linked copy of each agent rides a code-built hoverboard doing a
# looping trick (ollie / kickflip / heelflip / 360 / backflip / grab / varial). Press Play (frames 1-60) to watch.
import bpy, bmesh, math
from mathutils import Matrix
AV = bpy.data.scenes['AGENTS_VIEW']; C = bpy.data.collections['AGENTS_RIGGED']; win = bpy.context.window; win.scene = AV
BC = bpy.data.collections.get('AGENTS_BOARDS') or bpy.data.collections.new('AGENTS_BOARDS')
if BC.name not in [x.name for x in AV.collection.children]: AV.collection.children.link(BC)
for o in list(BC.objects): bpy.data.objects.remove(o, do_unlink=True)
MOVES = {'SHADDAI': 'combo', 'ZEROX': 'heavy', 'ORACLE': 'attack1', 'NEXUS': 'kick', 'TURTLE': 'run', 'QUILL': 'roll', 'PIKADON': 'block'}
TRICKS = {'SHADDAI': 'kickflip', 'ZEROX': '360', 'ORACLE': 'ollie', 'NEXUS': 'heelflip', 'TURTLE': 'backflip', 'QUILL': 'grab', 'PIKADON': 'varial'}
def solo(arm, clip):
    ad = arm.animation_data; ad.action = None
    for t in ad.nla_tracks: t.is_solo = False; t.mute = (t.name != clip)
    for t in ad.nla_tracks:
        if t.name == clip:
            t.mute = False
            for st in t.strips: st.repeat = max(1, 60 / max(1, st.frame_end - st.frame_start)); st.frame_start = 1
def mat(n, hexc, emit=0):
    m = bpy.data.materials.get(n) or bpy.data.materials.new(n); m.use_nodes = True; b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    c = tuple(((hexc >> s & 255) / 255.0) ** 2.2 for s in (16, 8, 0)) + (1,); b.inputs['Base Color'].default_value = c; m.diffuse_color = c
    if emit: b.inputs['Emission Color'].default_value = c; b.inputs['Emission Strength'].default_value = emit
    return m
deck, glow = mat('hb_deck', 0x111821), mat('hb_glow', 0x22e6ff, 5)
def board(name):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Diagonal((1.3, 0.38, 0.06, 1))); me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(deck)
    o = bpy.data.objects.new(name, me); BC.objects.link(o)
    gb = bmesh.new()
    for x in (-0.45, 0.45): bmesh.ops.create_cone(gb, cap_ends=True, segments=16, radius1=0.13, radius2=0.13, depth=0.05, matrix=Matrix.Translation((x, 0, -0.05)))
    bmesh.ops.create_cube(gb, size=1, matrix=Matrix.Translation((0, 0.2, 0)) @ Matrix.Diagonal((1.2, 0.02, 0.03, 1))); bmesh.ops.create_cube(gb, size=1, matrix=Matrix.Translation((0, -0.2, 0)) @ Matrix.Diagonal((1.2, 0.02, 0.03, 1)))
    gm = bpy.data.meshes.new(name + '_glow'); gb.to_mesh(gm); gb.free(); gm.materials.append(glow); g = bpy.data.objects.new(name + '_glow', gm); BC.objects.link(g); g.parent = o
    return o
def key(o, path, f, val, idx=None):
    setattr(o, path, val) if idx is None else None
    o.keyframe_insert(path, frame=f)
arms = [o for o in C.objects if o.type == 'ARMATURE' and o.name.startswith('AGENT_')]
for i, arm in enumerate(sorted(arms, key=lambda a: a.location.x)):
    code = arm.name.replace('AGENT_', ''); solo(arm, MOVES.get(code, 'idle'))
    # row 2: linked copy (shared meshes) on a board
    rig = arm.copy(); rig.animation_data_clear(); rig.animation_data_create(); BC.objects.link(rig)
    if arm.animation_data:
        for t in arm.animation_data.nla_tracks:
            nt = rig.animation_data.nla_tracks.new(); nt.name = t.name
            for st in t.strips: nt.strips.new(st.name, int(st.frame_start), st.action)
    for ch in arm.children:
        c2 = ch.copy(); BC.objects.link(c2); c2.parent = rig
        for md in c2.modifiers:
            if md.type == 'ARMATURE': md.object = rig
    solo(rig, 'slideLoop' if TRICKS[code] == 'grab' else 'idle')
    pivot = bpy.data.objects.new('BOARD_' + code, None); BC.objects.link(pivot); pivot.location = (arm.location.x, -6, 0.4)
    b = board('hoverboard_' + code); b.parent = pivot; rig.parent = pivot; rig.location = (0, 0, 0.08); rig.rotation_euler = (0, 0, 0)
    t = TRICKS[code]
    for f, z in ((1, 0.4), (20, 0.6), (32, 3.2), (44, 0.6), (60, 0.4)): pivot.location.z = z; pivot.keyframe_insert('location', index=2, frame=f)
    for f in (1, 20, 44, 60):
        b.rotation_euler = (0, 0, 0); b.keyframe_insert('rotation_euler', frame=f); pivot.rotation_euler = (0, 0, 0); pivot.keyframe_insert('rotation_euler', frame=f)
    if t in ('kickflip', 'heelflip', 'varial'):
        sgn = 1 if t != 'heelflip' else -1
        b.rotation_euler = (sgn * 2 * math.pi, 0, math.pi if t == 'varial' else 0); b.keyframe_insert('rotation_euler', frame=44)
    elif t == '360': pivot.rotation_euler = (0, 0, 2 * math.pi); pivot.keyframe_insert('rotation_euler', frame=44)
    elif t == 'backflip': pivot.rotation_euler = (0, -2 * math.pi, 0); pivot.keyframe_insert('rotation_euler', frame=44)
AV.frame_start, AV.frame_end = 1, 60; AV.render.fps = 30
win.scene = bpy.data.scenes['REALM_VIEW']; bpy.ops.wm.save_mainfile(); print('SHOWCASE ok', len(arms), 'agents; boards', len([o for o in BC.objects if o.name.startswith('BOARD_')]))
