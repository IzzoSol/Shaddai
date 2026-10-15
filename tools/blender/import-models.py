# import-models.py — imports every realmModels GLB (meshopt-decoded copies) at its real game placement.
# Same rule as world-realmprops.js fit(): widest horizontal side = w, base on the ground + y, yaw = ry.
# Each model sits under an Empty "Model · <id>" carrying shd_model=<id> — MOVE/ROTATE/SCALE THAT EMPTY;
# export-layout.py reads the empties back into world-layout.js values.
import bpy, json, os, math
from mathutils import Vector

U = 7 / 1.8
J = json.load(open(bpy.app.driver_namespace['SHD_LAYOUT']))
DIR = bpy.app.driver_namespace['SHD_MODELS']

c = bpy.data.collections.get('SHD Models') or bpy.data.collections.new('SHD Models')
if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)

done, miss = 0, []
for md in J['models']:
    f = os.path.join(DIR, os.path.basename(md['url']))
    if not os.path.exists(f): miss.append(md['id']); continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    E = bpy.data.objects.new('Model · ' + md['id'], None); E.empty_display_type = 'ARROWS'; E.empty_display_size = 8
    c.objects.link(E); E['shd_model'] = md['id']; E['shd_realm'] = md['realm']
    for o in new:
        for u in list(o.users_collection): u.objects.unlink(o)
        c.objects.link(o)
        if o.parent is None: o.parent = E
    bpy.context.view_layer.update()
    # bounds of the imported meshes (world space, Z-up after the glTF importer)
    mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in new:
        if o.type != 'MESH': continue
        for v in o.bound_box:
            w = o.matrix_world @ Vector(v)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    size = mx - mn
    s = (md['w'] / U) / max(size.x, size.y, 1e-4)
    # centre the model on the empty (x/y) with its base at the empty's origin, then scale by the empty
    ctr = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in new:
        if o.parent == E: o.location -= ctr
    E.scale = (s, s, s)
    E.location = (md['x'] / U, -md['z'] / U, md['y'] / U)
    E.rotation_euler.z = md['ry']
    E['shd_w'] = md['w']; E['shd_len_m'] = md['len']
    done += 1
print('imported', done, 'missing', miss)
