# convert-asset.py — owner downloads → game GLB (real size, clips, materials) + a check render.
#   blender -b [file.blend] --factory-startup --python tools/blender/assets/convert-asset.py -- \
#       --src <file.fbx|.obj|.dae|(omit when a .blend is opened)> --out <out.glb> --size <metres> --measure length|height \
#       [--clips "Walk:10-40,Idle:170-200"] [--rename "Walk_New:walk,Idel_New:idle"] [--tex <folder of textures>] [--render <frame>] [--yaw <deg>]
# NEVER deletes source files. Old gzip .blend (2.7x) must be decompressed first (gzip -dc).
import bpy, sys, os, math, glob
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
def arg(k, d=None): return a[a.index(k) + 1] if k in a else d
SRC, OUT = arg('--src'), arg('--out'); SIZE = float(arg('--size', '1')); MEAS = arg('--measure', 'length')
CLIPS = arg('--clips'); REN = arg('--rename'); TEX = arg('--tex'); RENDER = arg('--render'); YAW = float(arg('--yaw', '0'))

if SRC:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    ext = os.path.splitext(SRC)[1].lower()
    if ext == '.fbx': bpy.ops.import_scene.fbx(filepath=SRC, automatic_bone_orientation=('--fbx-raw' not in a), ignore_leaf_bones=('--fbx-raw' in a))
    elif ext == '.obj': bpy.ops.wm.obj_import(filepath=SRC)
    elif ext == '.dae': bpy.ops.wm.collada_import(filepath=SRC)
    elif ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=SRC)
    else: sys.exit('unsupported ' + ext)

# ── helpers for layered (4.4+) and legacy actions ──
def fcurves(act):
    fc = list(getattr(act, 'fcurves', []) or [])
    if fc: return fc
    out = []
    for L in getattr(act, 'layers', []):
        for st in L.strips:
            for cb in getattr(st, 'channelbags', []): out += list(cb.fcurves)
    return out
def split_action(src, name, f0, f1):
    new = src.copy(); new.name = name
    for fc in fcurves(new):
        kps = fc.keyframe_points
        for i in reversed(range(len(kps))):
            if not (f0 - 0.01 <= kps[i].co.x <= f1 + 0.01): kps.remove(kps[i])
        for kp in kps: kp.co.x -= f0; kp.handle_left.x -= f0; kp.handle_right.x -= f0
    new.use_fake_user = True
    return new

arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.visible_get() is not False]
if arms:   # a rigged character: only meshes bound to the skeleton count (ignore stray ground planes / props in the file)
    bound = [o for o in meshes if o.parent in arms or any(md.type == 'ARMATURE' for md in o.modifiers)]
    if bound: meshes = bound
print('FOUND meshes', [(o.name, len(o.data.polygons)) for o in meshes][:12], 'armatures', [(o.name, len(o.data.bones)) for o in arms], 'actions', [ac.name for ac in bpy.data.actions][:30])

# ── clean clip names: 'Armature|Armature|Wolf_Run_Cycle_' → 'run'-ish readable names ──
for ac in bpy.data.actions:
    nm = ac.name.split('|')[-1].strip('_ ').lower()
    for pre in ('wolf_', 'armature_', 'mixamo.com'): nm = nm.replace(pre, '')
    nm = nm.replace('_cycle', '').replace('cycle', '').strip('_ ') or ac.name
    if nm != ac.name and not bpy.data.actions.get(nm): ac.name = nm

# ── clips: rename and/or split one timeline into named clips ──
if REN:
    for pair in REN.split(','):
        k, v = pair.split(':'); ac = bpy.data.actions.get(k)
        if ac: ac.name = v
if CLIPS and bpy.data.actions:
    base = max(bpy.data.actions, key=lambda ac: len(fcurves(ac)))
    made = []
    for spec in CLIPS.split(','):
        nm, rg = spec.split(':'); f0, f1 = [float(x) for x in rg.split('-')]
        made.append(split_action(base, nm.strip().lower(), f0, f1).name)
    base.use_fake_user = False; base.name = '_timeline'
    print('SPLIT', made)

# ── materials: if a material has no image texture but a texture folder was given, wire the best-matching images ──
if TEX:
    files = glob.glob(os.path.join(TEX, '**', '*.*'), recursive=True)
    def pick(words):
        for w in words:                                  # priority order: the material's own keyword first
            for f in files:
                if w and w in os.path.basename(f).lower(): return f
        return None
    for m in {s.material for o in meshes for s in o.material_slots if s.material}:
        m.use_nodes = True; nt = m.node_tree
        outs = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL']
        if len(outs) > 1:
            keep = next((o for o in outs if o.is_active_output), outs[0]); keep.target = 'ALL'
            for o in outs:
                if o is not keep:
                    for l in list(o.inputs['Surface'].links): nt.links.remove(l)
                    o.target = 'CYCLES'; o.is_active_output = False
            keep.is_active_output = True
        if any(n.type == 'TEX_IMAGE' and n.image for n in nt.nodes): continue
        bs = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None) or nt.nodes.new('ShaderNodeBsdfPrincipled')
        outn = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        if not outn.inputs['Surface'].is_linked: nt.links.new(bs.outputs[0], outn.inputs['Surface'])   # legacy (2.7x) materials: the BSDF was never wired
        mk = m.name.lower().replace('wolf', '').replace('_', ' ').strip().split(' ')[0].rstrip('s')   # 'Wolf_Fur'→'fur', 'eyes'→'eye'
        col = pick([m.name.lower(), mk if len(mk) > 2 else None, 'basecolor', 'base_color', 'albedo', 'diffuse', '_col', 'body'])
        nor = pick(['normal', '_nor', '_n.'])
        if col:
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(col, check_existing=True); nt.links.new(t.outputs['Color'], bs.inputs['Base Color'])
        if nor:
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(nor, check_existing=True); t.image.colorspace_settings.name = 'Non-Color'
            nm_ = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm_.inputs['Color']); nt.links.new(nm_.outputs['Normal'], bs.inputs['Normal'])
        print('MAT', m.name, os.path.basename(col or '-'), os.path.basename(nor or '-'))

# ── --opaque: some exports ship bodies with alpha 0 + a baked 'SKY' reflection image → solid pearl body (maglev refs: white capsule)
if '--opaque' in a:
    for m in {s_.material for o in meshes for s_ in o.material_slots if s_.material}:
        if not m.use_nodes: continue
        nt = m.node_tree; bs = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bs: continue
        for n in list(nt.nodes):
            if n.type == 'TEX_IMAGE' and n.image and 'sky' in n.image.name.lower():
                for l in list(n.outputs[0].links): nt.links.remove(l)
        if bs.inputs['Alpha'].default_value < 0.05:
            bs.inputs['Alpha'].default_value = 1.0; bs.inputs['Base Color'].default_value = (0.93, 0.95, 0.97, 1); bs.inputs['Roughness'].default_value = 0.22; bs.inputs['Metallic'].default_value = 0.25
            print('OPAQUE', m.name)

# ── real size: scale the top-level roots so the measured extent equals --size metres ──
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in meshes:
    ev = o.evaluated_get(dg)
    for c in ev.bound_box:
        w = ev.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
ext_ = mx - mn; cur = ext_.z if MEAS == 'height' else max(ext_.x, ext_.y)
k = SIZE / max(cur, 1e-6)
roots = [o for o in bpy.data.objects if o.parent is None and o.type in ('MESH', 'ARMATURE', 'EMPTY')]
for o in roots:
    o.scale = (o.scale.x * k, o.scale.y * k, o.scale.z * k); o.location = (o.location - Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))) * k
    o.rotation_euler.z += math.radians(YAW)
bpy.context.view_layer.update()
print('SIZE extent_m', tuple(round(v * k, 2) for v in ext_), 'scale', round(k, 5))

for o in bpy.data.objects: o.select_set(o in roots or (o.parent in roots) or any(p in roots for p in [o.parent, o.parent.parent if o.parent else None]))
kw = dict(filepath=OUT, export_format='GLB', use_selection=False, export_animations=bool(bpy.data.actions), export_skins=True, export_yup=True, export_apply=False)
try: bpy.ops.export_scene.gltf(export_animation_mode='ACTIONS', **kw)
except TypeError: bpy.ops.export_scene.gltf(**kw)
print('EXPORTED', OUT, os.path.getsize(OUT))

if RENDER is not None:
    sc = bpy.context.scene
    for o in meshes:
        if arg('--hide') and arg('--hide').lower() in o.name.lower(): o.hide_render = True; print('HIDDEN', o.name)
    arm = arms[0] if arms else None
    if arm and arm.animation_data is None: arm.animation_data_create()
    acts = [ac for ac in bpy.data.actions if not ac.name.startswith('_')]
    pref = next((ac for n in ('idle', 'walk', 'fly', 'swim', 'run') for ac in acts if ac.name == n), None) or next((ac for ac in acts if ac.frame_range[1] - ac.frame_range[0] > 4), acts[0] if acts else None)
    if arm and pref: arm.animation_data.action = pref; print('POSE', pref.name)
    sc.frame_set(int(RENDER))
    dg = bpy.context.evaluated_depsgraph_get(); mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in meshes:
        ev = o.evaluated_get(dg)
        for c in ev.bound_box:
            w = ev.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    ctr = (mn + mx) / 2; rad = max((mx - mn).length / 2, 0.1)
    cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.clip_end = rad * 50; cd.clip_start = rad * 0.01
    cam.location = ctr + Vector((0.75, -1.0, 0.5)).normalized() * rad * 2.6; cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    ld = bpy.data.lights.new('s', 'SUN'); ld.energy = 3.5; so = bpy.data.objects.new('s', ld); sc.collection.objects.link(so); so.rotation_euler = (0.8, 0.2, 0.6)
    sc.world = sc.world or bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.72, 1)
    try: sc.render.engine = 'BLENDER_EEVEE'
    except Exception: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = 720, 480; sc.render.filepath = OUT.replace('.glb', '-check.png'); bpy.ops.render.render(write_still=True); print('RENDERED', sc.render.filepath)
