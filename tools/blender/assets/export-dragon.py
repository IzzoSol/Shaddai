# blender -b .bl-cache/src/Dragon_Baked_Actions.blend --python tools/blender/assets/export-dragon.py -- <out.glb>
# Rigged dragon (136 bones, baked Fly/Idle/Walk/Run) → GLB with ALL actions as clips, textures embedded.
import bpy, sys, os
out = sys.argv[sys.argv.index('--') + 1]
for im in bpy.data.images:
    print('IMG', im.name, 'packed' if im.packed_file else 'file', im.filepath, 'size', tuple(im.size))
# 2.77 Blender-Internal materials don't export → rebuild as Principled from the PACKED images
IMG = {n: bpy.data.images.get(n) for n in ('Dragon_Bump_Col.jpg.000', 'Dragon_ground_color.jpg.001', 'Dragon_Nor.jpg.001', 'Dragon_Nor_mirror.jpg.001')}
PLAN = {'Game_dragon.002': ('Dragon_Bump_Col.jpg.000', 'Dragon_Nor_mirror.jpg.001'), 'Game_dragon.003': ('Dragon_ground_color.jpg.001', 'Dragon_Nor.jpg.001')}
for mname, (cn, nn) in PLAN.items():
    m = bpy.data.materials.get(mname)
    if not m: continue
    m.use_nodes = True; nt = m.node_tree
    for nd in list(nt.nodes): nt.nodes.remove(nd)
    outn = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(bs.outputs[0], outn.inputs[0])
    bs.inputs['Roughness'].default_value = 0.55
    if IMG.get(cn): tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = IMG[cn]; nt.links.new(tc.outputs['Color'], bs.inputs['Base Color'])
    if IMG.get(nn):
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = IMG[nn]; tn.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    print('MAT', mname, cn, nn)
for mname, col in (('EYES.001', (0.9, 0.55, 0.05)),):
    m = bpy.data.materials.get(mname)
    if m:
        m.use_nodes = True; bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bs: bs.inputs['Base Color'].default_value = (*col, 1); bs.inputs['Emission Color'].default_value = (*col, 1); bs.inputs['Emission Strength'].default_value = 3.0
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name == 'Armature')
for o in bpy.data.objects: o.select_set(o == arm or o.parent == arm)
bpy.context.view_layer.objects.active = arm
# rename actions to game-friendly clip names
ren = {'Fly_New': 'fly', 'Idel_New': 'idle', 'Walk_New': 'walk', 'Run_New': 'run'}
for a in bpy.data.actions:
    if a.name in ren: a.name = ren[a.name]
kw = dict(filepath=out, export_format='GLB', use_selection=True, export_animations=True, export_skins=True, export_yup=True, export_apply=False)
try: bpy.ops.export_scene.gltf(export_animation_mode='ACTIONS', **kw)
except TypeError: bpy.ops.export_scene.gltf(**kw)
print('EXPORTED', out, os.path.getsize(out))
# quick check render (3/4 view, idle pose)
if '--render' in sys.argv:
    sc = bpy.context.scene
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.parent != arm: o.hide_render = True
    arm.animation_data.action = bpy.data.actions.get('fly') if arm.animation_data else None; sc.frame_set(int(sys.argv[sys.argv.index('--render') + 1]) if len(sys.argv) > sys.argv.index('--render') + 1 else 40)
    cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
    from mathutils import Vector
    dg = bpy.context.evaluated_depsgraph_get(); me_o = next(o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm)
    ev = me_o.evaluated_get(dg); pts = [ev.matrix_world @ v.co for v in ev.to_mesh().vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (mn + mx) / 2; rad = (mx - mn).length / 2
    cam.location = ctr + Vector((0.75, -1.0, 0.55)).normalized() * rad * 2.3; cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler(); cd.clip_end = rad * 20
    ld = bpy.data.lights.new('s', 'SUN'); ld.energy = 3.5; so = bpy.data.objects.new('s', ld); sc.collection.objects.link(so); so.rotation_euler = (0.8, 0.2, 0.6)
    sc.world = sc.world or bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.6, 0.75, 1)
    try: sc.render.engine = 'BLENDER_EEVEE'
    except Exception: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = 960, 640; sc.render.filepath = out.replace('.glb', '-check.png'); bpy.ops.render.render(write_still=True); print('RENDERED')
