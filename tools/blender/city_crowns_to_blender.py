# tools/blender/city_crowns_to_blender.py - mirror world-city-crowns.js into REALM_VIEW (same district rule, same hash, same crown shapes,
# simplified). Crowns sit on every visible fab_ instance of the flat-roofed sc-* models. Additive: collection CROWNS_20261023.
import bpy, bmesh, math
from mathutils import Matrix, Vector
SC = bpy.data.scenes['REALM_VIEW']; U = 7 / 1.8
C = bpy.data.collections.get('CROWNS_20261023') or bpy.data.collections.new('CROWNS_20261023')
if C.name not in [x.name for x in SC.collection.children]: SC.collection.children.link(C)
for o in list(C.objects): bpy.data.objects.remove(o, do_unlink=True)
KEYS = ('sc-storefront-s', 'sc-storefront-l', 'sc-office', 'sc-office-mid', 'sc-market', 'sc-techlab', 'sc-civic-tower')
ACC = {'forge': 0xc43e00, 'trade': 0x0066b2, 'residential': 0x4a7c59, 'athenaeum': 0xe8c45c}
TYPES = {'forge': ['halo', 'setback', 'pods'], 'trade': ['dome', 'garden', 'coin'], 'residential': ['livingdome', 'wave', 'pavilion'], 'athenaeum': ['dome', 'coin', 'garden']}
def hash_(x, z): h = math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return h - math.floor(h)
def mat(n, hexc, emit=0):
    m = bpy.data.materials.get(n) or bpy.data.materials.new(n); m.use_nodes = True; b = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
    c = tuple(((hexc >> s & 255) / 255.0) ** 2.2 for s in (16, 8, 0)) + (1,); b.inputs['Base Color'].default_value = c; m.diffuse_color = c
    if emit: b.inputs['Emission Color'].default_value = c; b.inputs['Emission Strength'].default_value = emit
    return m
WHITE, GLASS, GREEN = mat('cr_white', 0xe9edf1), mat('cr_glass', 0x9fd4f0), mat('cr_green', 0x3f8a4f)
def proto(t, d):   # unit footprint, z up from the roof; returns {material: bmesh}
    out = {}; A = mat('cr_acc_' + d, ACC[d], 3)
    def bm(m): return out.setdefault(m.name, (bmesh.new(), m))[0]
    def box(m, sx, sz, sy, x, y, z): bmesh.ops.create_cube(bm(m), size=1, matrix=Matrix.Translation((x, y, z + sz / 2)) @ Matrix.Diagonal((sx, sy, sz, 1)))
    def cyl(m, r1, r2, h, z, x=0, y=0, seg=20): bmesh.ops.create_cone(bm(m), cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h, matrix=Matrix.Translation((x, y, z + h / 2)))
    def ring(m, R, r, z, standing=False):
        M = Matrix.Translation((0, 0, z)) @ (Matrix.Rotation(math.pi / 2, 4, 'X') if standing else Matrix()); b = bm(m); vs = []
        for i in range(24):
            a = 2 * math.pi * i / 24; vs.append([b.verts.new(M @ Vector(((R + r * math.cos(2 * math.pi * j / 6)) * math.cos(a), (R + r * math.cos(2 * math.pi * j / 6)) * math.sin(a), r * math.sin(2 * math.pi * j / 6)))) for j in range(6)])
        for i in range(24):
            for j in range(6): b.faces.new((vs[i][j], vs[(i + 1) % 24][j], vs[(i + 1) % 24][(j + 1) % 6], vs[i][(j + 1) % 6]))
    def dome(m, r, z): bmesh.ops.create_uvsphere(bm(m), u_segments=16, v_segments=8, radius=r, matrix=Matrix.Translation((0, 0, z)) @ Matrix.Diagonal((1, 1, 1, 1)))
    if t == 'halo': [box(WHITE, .04, .32, .04, sx * .3, sy * .3, 0) for sx in (-1, 1) for sy in (-1, 1)]; box(WHITE, .5, .06, .5, 0, 0, 0); ring(A, .42, .025, .34); ring(A, .3, .018, .42)
    elif t == 'setback': box(WHITE, .72, .16, .72, 0, 0, 0); box(A, .74, .02, .74, 0, 0, .16); box(WHITE, .48, .14, .48, 0, 0, .18); box(A, .5, .02, .5, 0, 0, .32); box(WHITE, .26, .12, .26, 0, 0, .34)
    elif t == 'pods': box(WHITE, .46, .16, .46, 0, 0, 0); box(WHITE, .34, .11, .18, .36, -.08, .05); box(WHITE, .18, .11, .34, -.08, .36, .05); box(A, .48, .02, .48, 0, 0, .16)
    elif t == 'dome': cyl(WHITE, .4, .4, .06, 0); dome(GLASS, .36, .06); ring(A, .4, .02, .07)
    elif t == 'garden': box(WHITE, .9, .04, .9, 0, 0, 0); box(GREEN, .82, .02, .82, 0, 0, .04); [cyl(GREEN, .05, 0, .16, .06, x, y, 6) for x, y in ((-.25, .2), (.22, -.2), (.25, .25))]; box(A, .9, .05, .015, 0, .45, .04); box(A, .9, .05, .015, 0, -.45, .04)
    elif t == 'coin': box(WHITE, .5, .08, .3, 0, 0, 0); ring(A, .26, .04, .36, True)
    elif t == 'livingdome': cyl(WHITE, .38, .38, .05, 0); dome(GREEN, .34, .05); ring(A, .38, .02, .06)
    elif t == 'wave': box(WHITE, .8, .04, .8, 0, 0, 0); [cyl(GLASS, .11, .11, .7, .04, 0, -.25 + i * .25, 12) for i in range(3)]; box(A, .82, .02, .015, 0, -.41, .04)
    else: box(WHITE, .7, .03, .7, 0, 0, 0); [box(WHITE, .03, .18, .03, sx * .25, sy * .25, .03) for sx in (-1, 1) for sy in (-1, 1)]; cyl(WHITE, .4, .4, .03, .21); dome(GREEN, .16, .24); ring(A, .4, .012, .24)
    return out
acc = {}; n = 0; bbcache = {}
for o in SC.objects:
    if not (o.name.startswith('fab_') and o.instance_collection and o.visible_get()): continue
    key = o.instance_collection.name[2:].replace('.glb', '')
    if key not in KEYS: continue
    cn = o.instance_collection.name
    if cn not in bbcache:
        mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
        for ob in o.instance_collection.all_objects:
            if ob.type == 'MESH':
                for v in ob.bound_box: w = ob.matrix_world @ Vector(v); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
        off = o.instance_collection.instance_offset; bbcache[cn] = (mn - off, mx - off)
    mn, mx = bbcache[cn]; s = o.scale.x; w, d = (mx.x - mn.x) * s, (mx.y - mn.y) * s; top = o.location.z + mx.z * s
    x, y = o.location.x, o.location.y; b = (math.degrees(math.atan2(x, y)) + 360) % 360
    dist = 'forge' if b < 90 else 'trade' if b < 180 else 'residential' if b < 270 else 'athenaeum'
    T = TYPES[dist]; t = T[int(hash_(x * U, -y * U) * len(T)) % len(T)]
    k = dist + ':' + t
    if k not in acc: acc[k] = (proto(t, dist), [])
    acc[k][1].append(Matrix.Translation((x, y, top)) @ Matrix.Rotation(o.rotation_euler.z, 4, 'Z') @ Matrix.Diagonal((w * .92, d * .92, min(w, d), 1))); n += 1
for k, (parts, mats) in acc.items():
    for mname, (pb, m) in parts.items():
        pme = bpy.data.meshes.new('p'); pb.to_mesh(pme); pb.free(); out = bmesh.new()
        for M in mats: tmp = pme.copy(); tmp.transform(M); out.from_mesh(tmp); bpy.data.meshes.remove(tmp)
        bpy.data.meshes.remove(pme); me = bpy.data.meshes.new('crown_' + k + '_' + mname); out.to_mesh(me); out.free(); me.materials.append(m)
        ob = bpy.data.objects.new(me.name, me); C.objects.link(ob)
bpy.ops.wm.save_mainfile(); print('CROWNS ok', n, 'buildings', len(acc), 'types')
