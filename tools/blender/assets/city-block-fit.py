# city-block-fit.py — FIT TEST: one Shaddai City street corner assembled from the owner's Downloads kits at true scale.
#   blender -b --factory-startup --python tools/blender/assets/city-block-fit.py
# Downtown MegaKit = streets/sidewalks/street furniture only (no brick). Modular SciFi MegaKit = the building, red trim → emerald.
# Owner props = the "clever things" (crypto booth, holo teleport, floor ring, code-bushes, planet holo, neon, billboards).
# Output: .bl-cache/renders/cityfit-*.png + .bl-cache/city-block-fit.blend. Never touches sources.
import bpy, os, math
from mathutils import Vector
DL = 'C:/Users/Brittany/OneDrive/Desktop/New folder/Downloads/'
SCI = DL + 'Modular SciFi MegaKit[Standard]/Modular SciFi MegaKit[Standard]/glTF/'
DT = DL + 'Downtown City MegaKit[Standard]/Exports/FBX (Unity)/'
ART = 'C:/Users/Brittany/OneDrive/Pictures/LF2/MODELS FOR FAL/BILLBOARDS and ART/'
OUT = os.path.abspath('.bl-cache/renders'); os.makedirs(OUT, exist_ok=True)
EMERALD = (0.0, 1.0, 0.61, 1); GOLD = (0.91, 0.77, 0.36, 1)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene
LIB = bpy.data.collections.new('_lib'); sc.collection.children.link(LIB)
WORLD = bpy.data.collections.new('CityBlockFit'); sc.collection.children.link(WORLD)

_tex = {}
def relink(src):
    d = os.path.dirname(src); files = {}
    for _ in range(4):
        for n in ('Textures', 'textures'):
            r = os.path.join(d, n)
            if os.path.isdir(r):
                if r not in _tex: _tex[r] = {f.lower(): os.path.join(dp, f) for dp, _, fs in os.walk(r) for f in fs}
                for k, v in _tex[r].items(): files.setdefault(k, v)
        d = os.path.dirname(d)
    for im in bpy.data.images:
        if im.source == 'FILE' and not os.path.exists(bpy.path.abspath(im.filepath)):
            f = files.get(os.path.basename(bpy.path.abspath(im.filepath)).lower()) or files.get((im.name + '.png').lower())
            if f: im.filepath = f; im.reload()
    return files

def shaddai_trim(files):
    # red light strips → emerald: swap *_Red basecolors for the neutral ones and drive emission from the kit's emissive maps
    for m in bpy.data.materials:
        if not m.use_nodes or m.get('_shaddai'): continue
        nt = m.node_tree; bs = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bs: continue
        for n in nt.nodes:
            if n.type == 'TEX_IMAGE' and n.image and '_red' in n.image.name.lower():
                alt = files.get(os.path.basename(n.image.filepath).lower().replace('_red', ''))
                if alt: n.image = bpy.data.images.load(alt, check_existing=True)
        key = next((k for k in ('trim_01', 'trim_02', 'padd') if k in m.name.lower() or any(n.type == 'TEX_IMAGE' and n.image and k in n.image.name.lower() for n in nt.nodes)), None)
        em = next((v for k, v in files.items() if key and key.split('_')[0] in k and key[-2:] in k and 'emissive' in k), None) if key else None
        if key == 'padd': em = files.get('t_paddingwall_emissive.png')
        if em:
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(em, check_existing=True)
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
            nt.links.new(t.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = EMERALD
            nt.links.new(mix.outputs[2], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 6.0
        m['_shaddai'] = 1

_proto = {}
def proto(path):
    if path in _proto: return _proto[path]
    before = set(bpy.data.objects)
    e = os.path.splitext(path)[1].lower()
    if e in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=path)
    else: bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]; new_names = [o.name for o in new]
    files = relink(path); shaddai_trim(files)
    ms = [o for o in new if o.type == 'MESH']
    for o in ms: o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    for o in ms: o.data = o.data.copy() if o.data.users > 1 else o.data
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(ms) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for n in new_names:
        o = bpy.data.objects.get(n)
        if o and o != ob: bpy.data.objects.remove(o, do_unlink=True)
    bb = [Vector(c) for c in ob.bound_box]; mn = Vector(map(min, *bb)); mx = Vector(map(max, *bb))
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    ob.data.transform(__import__('mathutils').Matrix.Translation(-off)); ob.location = (0, 0, 0)
    for c in ob.users_collection: c.objects.unlink(ob)
    LIB.objects.link(ob); ob.hide_render = True; ob.hide_set(True)
    _proto[path] = (ob, mx - mn); return _proto[path]

def put(path, x, y, z=0.0, rot=0.0, s=1.0, fit=None):
    ob, ext = proto(path)
    k = s if fit is None else fit / max(ext.z, 1e-3)          # fit = target height in metres
    o = ob.copy(); o.hide_render = False; WORLD.objects.link(o); o.hide_set(False)
    o.location = (x, y, z); o.rotation_euler = (0, 0, math.radians(rot)); o.scale = (k, k, k); return o

def emissive_plane(img, x, y, z, w, rot=0.0, strength=3.0):
    im = bpy.data.images.load(img, check_existing=True); h = w * im.size[1] / im.size[0]
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z + h / 2)); p = bpy.context.active_object
    p.scale = (w, h, 1); p.rotation_euler = (math.radians(90), 0, math.radians(rot))
    m = bpy.data.materials.new('bb-' + os.path.basename(img)); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = im
    nt.links.new(t.outputs['Color'], bs.inputs['Base Color']); nt.links.new(t.outputs['Color'], bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value = strength; p.data.materials.append(m)
    for c in p.users_collection: c.objects.unlink(p)
    WORLD.objects.link(p); return p

def mat(name, col, em=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = 0.35
    if em: b.inputs['Emission Color'].default_value = col; b.inputs['Emission Strength'].default_value = em
    return m

# ── STREETS (Downtown kit: streets/sidewalks/decals/furniture only) ──
put(DT + 'Street_4WayIntersection.fbx', 0, 0)
for k in range(5):
    put(DT + 'Street_4Lane.fbx', 12.5 + 3 + 6 * k, 0)
    put(DT + 'Street_4Lane.fbx', 0, 12.5 + 3 + 6 * k, rot=90)
for k in range(10):   # plaza / sidewalk slabs of the corner block (x 12.5..42, y 12.5..42)
    for j in range(10): put(DT + 'Sidewalk_NoCurb_3m.fbx', 14 + 3 * k, 14 + 3 * j)
for k in range(7):
    put(DT + 'Prop_Bollard.fbx', 14 + 4 * k, 12.2); put(DT + 'Prop_Bollard.fbx', 12.2, 18 + 4 * k)
put(DT + 'Decal_Crosswalk_Wide.fbx', 15, 0, 0.12, rot=90)

# ── THE BUILDING (SciFi MegaKit, 16 × 12 m, 2 floors + crown, emerald trim) — an enterable agent storefront ──
BX, BY, W, D = 28, 30, 16, 12
def ring(piece, z, skip_front=None, rot_extra=0):
    for i in range(W // 4):
        x = BX - W / 2 + 2 + 4 * i
        if skip_front is None or i not in skip_front: put(SCI + piece, x, BY - D / 2, z, rot=90 + rot_extra)
        put(SCI + piece, x, BY + D / 2, z, rot=90 + rot_extra)
    for j in range(D // 4):
        y = BY - D / 2 + 2 + 4 * j
        put(SCI + piece, BX - W / 2, y, z, rot=0 + rot_extra); put(SCI + piece, BX + W / 2, y, z, rot=0 + rot_extra)
ring('Walls/WallWindow_Straight.gltf', 0.0, skip_front={1})             # glass storefront ground floor
put(SCI + 'Platforms/Door_Frame_Square.gltf', BX - W / 2 + 6, BY - D / 2, 0)   # entrance
ring('Walls/WallAstra_Straight_Window.gltf', 3.2)
ring('Walls/TopWindow_Straight.gltf', 6.2)
for i in range(W // 4):                                                    # floor slab + roof deck
    for j in range(D // 4):
        put(SCI + 'Platforms/Platform_DarkPlates.gltf', BX - W / 2 + 2 + 4 * i, BY - D / 2 + 2 + 4 * j, 3.2)
        put(SCI + 'Platforms/Platform_Metal2.gltf', BX - W / 2 + 2 + 4 * i, BY - D / 2 + 2 + 4 * j, 8.2)
        put(SCI + 'Platforms/Platform_CenterPlate.gltf', BX - W / 2 + 2 + 4 * i, BY - D / 2 + 2 + 4 * j, 0.06)
# interior life, visible through the glass
put(SCI + 'Props/Prop_Computer.gltf', BX - 4, BY - 2, 0.06, rot=180); put(SCI + 'Props/Prop_Computer.gltf', BX - 2, BY - 2, 0.06, rot=180)
put(SCI + 'Props/Prop_Crate3.gltf', BX + 5, BY + 3, 0.06); put(SCI + 'Props/Prop_Crate4.gltf', BX + 6, BY + 4.4, 0.06, rot=20)
put(DL + 'Table_Futuristic.glb', BX + 1, BY + 1, 0.06)
put(SCI + 'Props/Prop_AccessPoint.gltf', BX - W / 2 + 8.8, BY - D / 2 - 0.4, 0.06, rot=180)
# rooftop billboard: the owner's SHADDAI banner, lit
put(SCI + 'Columns/Column_MetalSupport.gltf', BX - 5, BY, 8.2, s=1.0); put(SCI + 'Columns/Column_Pipes.gltf', BX + 5, BY, 8.2, fit=4)
emissive_plane(ART + 'SHADDAI AI IMAGE.jpg', BX, BY - 0.4, 11.0, 14, rot=0, strength=4)
# neon blade sign on the corner + agent emblem over the door
put(DL + 'Japanese_Sign_16.glb', BX - W / 2 - 0.4, BY - D / 2 - 0.2, 3.4, rot=-45, fit=3.2)
emissive_plane(ART + 'Gemini_Generated_Image_bc5af7bc5af7bc5a.png', BX - W / 2 + 6, BY - D / 2 - 0.35, 5.2, 4.2, strength=2.5)

# ── CLEVER THINGS on the plaza ──
put(DL + 'RetroComputerBooth.glb', 17, 19, 0.06, rot=-30, fit=2.6)                 # crypto kiosk (ZEROX markets terminal)
put(DL + 'ElevatorTeleport01_Art.glb', 17, 36, 0.06, rot=60, fit=5.0)               # holo teleport → fast-travel to ring stations
put(DL + 'Floor_Ring.glb', 22, 20, 0.07, s=1.4)                                      # quest/holo pad
put(DL + 'Colony_Planet_Art.glb', 22, 20, 1.2, s=0.45)                              # planet hologram hovering over the pad
for (x, y) in ((38, 15), (15, 27)):
    put(DT + 'Sidewalk_Planter.fbx', x, y, 0.06, s=1.4); put(DL + 'BlockChain_CodeBush_Art.glb', x, y, 0.5, fit=1.4)   # code-bush planters
put(SCI + 'Props/Prop_Light_Floor.gltf', 20, 26, 0.06); put(SCI + 'Props/Prop_Light_Floor.gltf', 36, 21, 0.06, rot=90)
emissive_plane(ART + 'GREEN GLITCH.png', 40, 19, 0.06, 2.4, rot=-60, strength=2)    # glitch ad screen
put(SCI + 'Props/Prop_Barrel_Large.gltf', 41, 38, 0.06)

# ── SCALE: 1.8 m citizen ──
body = mat('citizen', (0.05, 0.06, 0.07, 1)); glow = mat('citizen-glow', EMERALD, 4)
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=1.45, location=(19.5, 17, 0.06 + 0.725)); c1 = bpy.context.active_object; c1.data.materials.append(body)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=(19.5, 17, 0.06 + 1.62)); c2 = bpy.context.active_object; c2.data.materials.append(glow)
for o in (c1, c2):
    for c in o.users_collection: c.objects.unlink(o)
    WORLD.objects.link(o)

# ground under everything (the kit streets are tiles; the real world has terrain here)
bpy.ops.mesh.primitive_plane_add(size=400, location=(20, 20, -0.02)); gp = bpy.context.active_object; gp.data.materials.append(mat('ground', (0.02, 0.025, 0.03, 1)))
for c in gp.users_collection: c.objects.unlink(gp)
WORLD.objects.link(gp)
# ── NIGHT LIGHTING + RENDERS ──
sc.world = bpy.data.worlds.new('night'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.012, 0.016, 0.03, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
sd = bpy.data.lights.new('moon', 'SUN'); sd.energy = 0.35; sd.color = (0.6, 0.7, 1.0); so = bpy.data.objects.new('moon', sd); WORLD.objects.link(so); so.rotation_euler = (math.radians(55), 0, math.radians(35))
for (x, y, col) in ((20, 16, EMERALD), (36, 22, GOLD), (14, 34, EMERALD)):
    ld = bpy.data.lights.new('street', 'POINT'); ld.energy = 900; ld.color = col[:3]; ld.shadow_soft_size = 0.5
    lo = bpy.data.objects.new('street', ld); WORLD.objects.link(lo); lo.location = (x, y, 6)
try: sc.render.engine = 'BLENDER_EEVEE'
except Exception: sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 24; sc.eevee.use_bloom = True
except Exception: pass
sc.view_settings.view_transform = 'AgX'
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); WORLD.objects.link(cam); sc.camera = cam
def shot(name, pos, tgt, lens=24):
    cd.lens = lens; cam.location = pos; cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, 'cityfit-' + name + '.png'); bpy.ops.render.render(write_still=True); print('SHOT', sc.render.filepath, flush=True)
shot('street-eye', (6, 6, 1.65), (26, 26, 3.5), lens=20)
shot('aerial', (-8, -10, 26), (26, 26, 2), lens=24)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('.bl-cache/city-block-fit.blend'))
print('CITYFIT DONE', len(WORLD.objects), 'objects')
