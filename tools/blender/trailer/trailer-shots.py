# trailer-shots.py — HEADLESS: cinematic EEVEE stills of the real SHADDAI assets for the pre-trailer.
#   blender -b --factory-startup --python tools/blender/trailer/trailer-shots.py -- <repo> <outdir> <scratchpad-with-train.obj,weapons.obj>
# Shots: 7-agent lineup (hero + low angle), agent close-ups, train nose, weapons row, dragon. 1280x720, dark studio + emerald/gold rim.
import bpy, sys, os, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
REPO, OUT, SCR = a[0], os.path.abspath(a[1]), a[2]
os.makedirs(OUT, exist_ok=True)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError: sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.render.image_settings.file_format = 'PNG'
try: bpy.context.preferences.system.gl_texture_limit = 'CLAMP_1024'   # 8 GB laptop: cap texture memory
except Exception: pass
try: sc.eevee.taa_render_samples = 16
except Exception: pass
try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'
except Exception: pass
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.006, 0.009, 0.014, 1); bg.inputs['Strength'].default_value = 1.0

def light(name, kind, loc, energy, color, size=2.0, rot=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color
    if kind == 'AREA': ld.size = size
    lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo); lo.location = loc
    if rot: lo.rotation_euler = [math.radians(r) for r in rot]
    else:
        c = lo.constraints.new('TRACK_TO'); e = bpy.data.objects.new(name + '_t', None); sc.collection.objects.link(e); e.location = (0, 0, 1); c.target = e
    return lo

def floor():
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0)); f = bpy.context.object
    m = bpy.data.materials.new('floor'); m.use_nodes = True; b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.012, 0.016, 0.02, 1); b.inputs['Roughness'].default_value = 0.18; b.inputs['Metallic'].default_value = 0.6
    f.data.materials.append(m)

def cam(loc, tgt, lens=35):
    cd = bpy.data.cameras.new('c'); cd.lens = lens; c = bpy.data.objects.new('c', cd); sc.collection.objects.link(c); c.location = loc
    e = bpy.data.objects.new('ct', None); sc.collection.objects.link(e); e.location = tgt
    k = c.constraints.new('TRACK_TO'); k.target = e; k.track_axis = 'TRACK_NEGATIVE_Z'; k.up_axis = 'UP_Y'; sc.camera = c; return c

def shoot(name):
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True); print('SHOT', name)

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

def imp_glb(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new('R', None); sc.collection.objects.link(root)
    for o in new:
        if o.parent is None: o.parent = root
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in new if o.type == 'MESH' for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return root, mn, mx

def fit(root, mn, mx, height, x=0.0, y=0.0, rotz=0.0):
    k = height / max(1e-6, (mx.z - mn.z)); root.scale = (k, k, k)
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    root.rotation_euler[2] = rotz
    root.location = (x - cx * k, y - cy * k, -mn.z * k)

def rim_rig():
    light('key', 'AREA', (3.5, -5, 5), 900, (1.0, 0.93, 0.8), 4)
    light('rimG', 'AREA', (-5, 3, 3.2), 1400, (0.0, 1.0, 0.61), 3)
    light('rimY', 'AREA', (5, 3.5, 3.0), 1100, (0.91, 0.77, 0.36), 3)
    light('fill', 'AREA', (0, -8, 1.5), 180, (0.6, 0.75, 1.0), 6)

# 1) the seven — lineup (heroes 1.8 m)
AG = ['oracle', 'zerox', 'nexus', 'shaddai', 'turtle', 'pikadon', 'quill']
floor(); rim_rig()
for i, n in enumerate(AG):
    p = os.path.join(REPO, 'fal-assets', 'characters', n, n + '-rigged.glb')
    if not os.path.exists(p): print('MISSING', p); continue
    r, mn, mx = imp_glb(p); fit(r, mn, mx, 1.95 if n == 'shaddai' else 1.8, x=(i - 3) * 1.25, y=(0.6 if n == 'shaddai' else 0) + abs(i - 3) * 0.12)
cam((0, -9.5, 1.6), (0, 0, 1.05), 38); shoot('t-01-lineup')
cam((0.8, -5.2, 0.35), (0, 0, 1.25), 24); shoot('t-02-lineup-low')
for n, x in (('zerox', -2.5), ('nexus', -1.25), ('turtle', 1.25), ('shaddai', 0.0)):
    cam((x + 0.35, -2.4, 1.55), (x, 0, 1.45), 50); shoot('t-03-close-' + n)
clear()

# 2) weapons row (code-built export)
floor(); rim_rig()
wobj = os.path.join(SCR, 'weapons.obj')
if os.path.exists(wobj):
    bpy.ops.wm.obj_import(filepath=wobj, up_axis='Y', forward_axis='NEGATIVE_Z')
    for m in bpy.data.materials:
        b = next((x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None) if m.use_nodes else None
        if b:
            col = b.inputs['Base Color'].default_value
            if max(col[0], col[1], col[2]) > 0.45 and (col[1] > 0.5 or col[2] > 0.5 or col[0] > 0.6):   # bright slots = glow parts
                b.inputs['Emission Color'].default_value = col; b.inputs['Emission Strength'].default_value = 3.0
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in bpy.data.objects if o.type == 'MESH' and o.name != 'Plane' for c in o.bound_box]
    if pts:
        cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2; cz = (min(p.z for p in pts) + max(p.z for p in pts)) / 2
        span = max(p.x for p in pts) - min(p.x for p in pts)
        cam((cx, -span * 0.95, cz + 0.2), (cx, 0, cz), 35); shoot('t-04-weapons')
clear()

# 3) train nose (code-built export) — dusk glow
floor(); light('sun', 'SUN', (0, 0, 10), 2.5, (1.0, 0.72, 0.5), rot=(62, 0, 140)); rim_rig()
tobj = os.path.join(SCR, 'train.obj')
if os.path.exists(tobj):
    bpy.ops.wm.obj_import(filepath=tobj, up_axis='Y', forward_axis='NEGATIVE_Z')
    for m in bpy.data.materials:
        b = next((x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None) if m.use_nodes else None
        if b:
            col = b.inputs['Base Color'].default_value
            if col[1] > 0.6 and col[0] < 0.3: b.inputs['Emission Color'].default_value = col; b.inputs['Emission Strength'].default_value = 6.0
            elif min(col[0], col[1], col[2]) > 0.8: b.inputs['Metallic'].default_value = 0.4; b.inputs['Roughness'].default_value = 0.15
    cam((9, -58, 3.2), (0, -40, 2.0), 40); shoot('t-05-train-nose')
    cam((-14, -20, 9), (0, -10, 2), 28); shoot('t-06-train-side')
clear()

# 4) dragon
floor(); rim_rig(); light('fire', 'POINT', (0, -3, 2), 2500, (1.0, 0.35, 0.08))
dp = os.path.join(REPO, 'public', 'assets', 'creatures', 'dragon-rigged.glb')
if os.path.exists(dp):
    r, mn, mx = imp_glb(dp); fit(r, mn, mx, 6.0, rotz=math.radians(-25))
    cam((6, -14, 3.0), (0, 0, 3.0), 30); shoot('t-07-dragon')
print('TRAILER SHOTS DONE')
