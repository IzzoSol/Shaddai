# thumbs.py — headless thumbnail per model (glb/gltf/fbx/obj/blend) + contact sheets, WORKBENCH (fast on weak GPUs).
#   blender -b --factory-startup --python tools/blender/assets/thumbs.py -- <list.json> <outdir> [px]
# list.json = [{"id": "...", "path": "..."}]. Writes <outdir>/<id>.png, <outdir>/index.json (size m, tris, error). Never touches sources.
import bpy, sys, os, json, math, traceback
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
LST, OUTD = a[0], os.path.abspath(a[1]); PX = int(a[2]) if len(a) > 2 else 256
os.makedirs(OUTD, exist_ok=True)
items = json.load(open(LST, encoding='utf-8'))
idx_path = os.path.join(OUTD, 'index.json')
index = json.load(open(idx_path, encoding='utf-8')) if os.path.exists(idx_path) else {}

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions, bpy.data.curves, bpy.data.textures):
        for d in list(coll):
            if d.users == 0: coll.remove(d)

def imp(p):
    e = os.path.splitext(p)[1].lower()
    if e in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=p)
    elif e == '.fbx': bpy.ops.import_scene.fbx(filepath=p)
    elif e == '.obj': bpy.ops.wm.obj_import(filepath=p)
    elif e == '.blend':
        with bpy.data.libraries.load(p) as (src, dst): dst.objects = [n for n in src.objects]
        for o in dst.objects:
            if o: bpy.context.scene.collection.objects.link(o)
    else: raise RuntimeError('unsupported ' + e)

_tex_cache = {}
def relink(src):
    # kits (Quaternius MegaKits) ship one shared Textures/ folder a few levels up — relink missing images from there;
    # FBX with no image at all but an obvious BaseColor by material name gets it wired too
    d = os.path.dirname(src); roots = []
    for _ in range(4):
        for n in ('Textures', 'textures', 'Texture'):
            if os.path.isdir(os.path.join(d, n)): roots.append(os.path.join(d, n))
        d = os.path.dirname(d)
    files = {}
    for r in roots:
        if r not in _tex_cache: _tex_cache[r] = {f.lower(): os.path.join(dp, f) for dp, _, fs in os.walk(r) for f in fs}
        for k, v in _tex_cache[r].items(): files.setdefault(k, v)
    if not files: return
    for im in bpy.data.images:
        if im.source == 'FILE' and not os.path.exists(bpy.path.abspath(im.filepath)):
            f = files.get(os.path.basename(bpy.path.abspath(im.filepath)).lower()) or files.get((im.name + '.png').lower())
            if f: im.filepath = f; im.reload()

sc = bpy.context.scene
for it in items:
    if it['id'] in index and os.path.exists(os.path.join(OUTD, it['id'] + '.png')): continue
    rec = {'path': it['path']}
    try:
        clear(); imp(it['path'])
        relink(it['path'])
        bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        ms = [o for o in sc.objects if o.type == 'MESH']
        mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3); tris = 0
        for o in ms:
            ev = o.evaluated_get(dg)
            for c in ev.bound_box:
                w = ev.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
        if not ms: raise RuntimeError('no meshes')
        ext = mx - mn; ctr = (mn + mx) / 2; rad = max(ext.length / 2, 1e-3)
        rec.update(size_m=[round(v, 2) for v in ext], tris=tris, anims=len(bpy.data.actions), arm=any(o.type == 'ARMATURE' for o in sc.objects))
        cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
        cd.lens = 50; cd.clip_start = rad * 0.01; cd.clip_end = rad * 40
        cam.location = ctr + Vector((0.8, -1.0, 0.55)).normalized() * rad * 2.9
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading
        sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_cavity = True; sh.show_object_outline = False
        sc.render.film_transparent = False
        sc.world = sc.world or bpy.data.worlds.new('w'); sc.world.color = (0.05, 0.06, 0.08)
        sc.render.resolution_x = sc.render.resolution_y = PX; sc.render.resolution_percentage = 100
        sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = os.path.join(OUTD, it['id'] + '.png')
        bpy.ops.render.render(write_still=True)
    except Exception as ex:
        rec['error'] = str(ex)[:160]
    index[it['id']] = rec
    json.dump(index, open(idx_path, 'w', encoding='utf-8'), indent=0)
    print('THUMB', it['id'], rec.get('tris'), rec.get('size_m'), rec.get('error', ''), flush=True)
print('THUMBS DONE', len(index))
