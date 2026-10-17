# kit.py — shared helpers for assembling Shaddai buildings from the owner's Downloads kits (import from Blender scripts).
#   import sys; sys.path.insert(0, 'tools/blender/assets'); from kit import *
# proto(path) imports a kit piece once (textures relinked from the kit's shared Textures/, red trim → emerald emission,
# base-centre pivot) and hides it in _lib; put(path, x, y, z, rot, s|fit) links a copy into TARGET[0].
import bpy, os, math, re
from mathutils import Vector
DL = 'C:/Users/Brittany/OneDrive/Desktop/New folder/Downloads/'
SCI = DL + 'Modular SciFi MegaKit[Standard]/Modular SciFi MegaKit[Standard]/glTF/'
DT = DL + 'Downtown City MegaKit[Standard]/Exports/FBX (Unity)/'
ART = 'C:/Users/Brittany/OneDrive/Pictures/LF2/MODELS FOR FAL/BILLBOARDS and ART/'
OUT = os.path.abspath('.bl-cache/renders'); os.makedirs(OUT, exist_ok=True)
EMERALD = (0.0, 1.0, 0.61, 1); GOLD = (0.91, 0.77, 0.36, 1)
sc = bpy.context.scene
LIB = bpy.data.collections.new('_lib'); sc.collection.children.link(LIB)
WORLD = bpy.data.collections.new('KitOut'); sc.collection.children.link(WORLD)
TARGET = [WORLD]   # put()/emissive_plane() link into TARGET[0]; builders swap it per building

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
        if 'glass' in m.name.lower():   # Shaddai smoked glass: dark + reflective by day, faint warm window glow at night
            for l in list(bs.inputs['Base Color'].links): nt.links.remove(l)
            bs.inputs['Base Color'].default_value = (0.015, 0.03, 0.035, 1); bs.inputs['Metallic'].default_value = 0.6; bs.inputs['Roughness'].default_value = 0.08
            bs.inputs['Emission Color'].default_value = (1.0, 0.8, 0.55, 1); bs.inputs['Emission Strength'].default_value = 0.25
            m['_shaddai'] = 1; continue
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
    # the kit shares a handful of materials; every import brings copies ('MI_Trim_01.001') → point slots back at the first one
    for o in new:
        for sl in getattr(o, 'material_slots', []):
            m = sl.material
            if m and re.match(r'.+\.\d{3}$', m.name):
                b = bpy.data.materials.get(m.name[:-4])
                if b and b is not m: sl.material = b
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
    o = ob.copy(); o.hide_render = False; TARGET[0].objects.link(o); o.hide_set(False); o.rotation_mode = 'XYZ'   # glTF imports use QUATERNION → rotation_euler would be ignored
    o.location = (x, y, z); o.rotation_euler = (0, 0, math.radians(rot)); o.scale = (k, k, k); return o

ARTSLOT = [0]   # emissive_plane materials are named artslot-NN-<image> so the game can swap in new art by name
def emissive_plane(img, x, y, z, w, rot=0.0, strength=3.0):
    im = bpy.data.images.load(img, check_existing=True); h = w * im.size[1] / im.size[0]
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z + h / 2)); p = bpy.context.active_object
    p.scale = (w, h, 1); p.rotation_euler = (math.radians(90), 0, math.radians(rot))
    ARTSLOT[0] += 1; m = bpy.data.materials.new('artslot-%02d-' % ARTSLOT[0] + os.path.splitext(os.path.basename(img))[0][:24]); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = im
    nt.links.new(t.outputs['Color'], bs.inputs['Base Color']); nt.links.new(t.outputs['Color'], bs.inputs['Emission Color'])
    bs.inputs['Emission Strength'].default_value = strength; p.data.materials.append(m)
    for c in p.users_collection: c.objects.unlink(p)
    TARGET[0].objects.link(p); return p

def mat(name, col, em=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = 0.35
    if em: b.inputs['Emission Color'].default_value = col; b.inputs['Emission Strength'].default_value = em
    return m

