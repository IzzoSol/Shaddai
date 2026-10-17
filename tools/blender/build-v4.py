# build-v4.py — MAP v4 proposal in Blender: realm WEDGES + wilderness gaps, city, maglev ring, stations at each
# realm mouth, spokes/hubs, Southern Colosseum. Reads SHD_V4 (map-v4-proposal.json). Metres, north = +Y.
import bpy, json, math, bmesh

U = 7 / 1.8
J = json.load(open(bpy.app.driver_namespace['SHD_V4']))
def m(v): return v / U
def comp(c):  # compass deg → Blender XY unit vector (north +Y, east +X)
    r = math.radians(c); return math.sin(r), math.cos(r)

for n in ('SHD Ground', 'SHD Realms', 'SHD Transit', 'SHD Landmarks', 'SHD Labels', 'SHD Models'):
    c = bpy.data.collections.get(n)
    if c:
        for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
    return c
def mat(name, hexcol, emit=0.0):
    M = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    r, g, b = ((hexcol >> 16) & 255) / 255, ((hexcol >> 8) & 255) / 255, (hexcol & 255) / 255
    M.diffuse_color = (r, g, b, 1); return M
def link(o, c):
    for u in list(o.users_collection): u.objects.unlink(o)
    c.objects.link(o); return o
def mesh_obj(name, verts, faces, c, M, z=0):
    me = bpy.data.meshes.new(name); me.from_pydata([(v[0], v[1], z) for v in verts], [], faces); me.update()
    o = bpy.data.objects.new(name, me); o.data.materials.append(M); c.objects.link(o); return o
def disc(name, r, c, M, z=0, seg=160):
    vs = [(0, 0)] + [(r * math.cos(i / seg * 2 * math.pi), r * math.sin(i / seg * 2 * math.pi)) for i in range(seg)]
    return mesh_obj(name, vs, [(0, i + 1, (i + 1) % seg + 1) for i in range(seg)], c, M, z)
def wedge(name, c0, c1, r0, r1, c, M, z=0):
    if c1 < c0: c1 += 360
    n = max(8, int((c1 - c0) / 1.5)); vs = []
    for i in range(n + 1):
        x, y = comp(c0 + (c1 - c0) * i / n); vs.append((x * m(r0), y * m(r0))); vs.append((x * m(r1), y * m(r1)))
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(n)]
    return mesh_obj(name, vs, faces, c, M, z)
def ring(name, r, w, c, M, z):
    seg = 256; vs = []
    for i in range(seg):
        a = i / seg * 2 * math.pi; vs += [((r - w / 2) * math.cos(a), (r - w / 2) * math.sin(a)), ((r + w / 2) * math.cos(a), (r + w / 2) * math.sin(a))]
    return mesh_obj(name, vs, [(2 * i, 2 * i + 1, (2 * i + 3) % (2 * seg), (2 * i + 2) % (2 * seg)) for i in range(seg)], c, M, z)
def label(text, loc, size, c, M):
    cu = bpy.data.curves.new(text, 'FONT'); cu.body = text; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    o = bpy.data.objects.new('Label · ' + text, cu); o.location = loc; o.data.materials.append(M); c.objects.link(o); return o
def bar(name, x0, y0, x1, y1, w, c, M, z):
    dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy); nx, ny = -dy / L * w / 2, dx / L * w / 2
    return mesh_obj(name, [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], [(0, 1, 2, 3)], c, M, z)

cG, cR, cT, cL, cX = coll('SHD Ground'), coll('SHD Realms'), coll('SHD Transit'), coll('SHD Landmarks'), coll('SHD Labels')
disc('Wilderness (ground)', m(J['half']), cG, mat('v4-wild', 0x2a3322), z=-0.5)
disc('The Grid (city)', m(J['cityR']), cR, mat('v4-grid', 0x1f8fb0), z=0.2)
white, gold, cyan = mat('v4-white', 0xffffff), mat('v4-gold', 0xe8c45c), mat('v4-cyan', 0x5fe0ff)
for R in J['realms']:
    o = wedge('Realm · ' + R['name'], R['c0'], R['c1'], R['r0'], R['r1'], cR, mat('v4-' + R['id'], R['color']), z=0.1)
    o['shd_realm'] = R['id']
    c1 = R['c1'] + (360 if R['c1'] < R['c0'] else 0); mid = (R['c0'] + c1) / 2
    x, y = comp(mid); rm = m((R['r0'] + R['r1']) / 2)
    label(R['name'].upper(), (x * rm, y * rm, 3), 70 if R['r1'] - R['r0'] > 2000 else 34, cX, white)
ring('Maglev Ring', m(J['transitR']), 10, cT, gold, 1)
HUB = m(J['cityR']) + 12
# one station at each realm mouth (on the ring, at the realm's centre bearing) + Central due south
mouths = []
for R in J['realms']:
    if R['id'] == 'suburb': continue            # Suburbs reached through Quill Forest's station line (atlas: Suburb Transit Hub)
    c1 = R['c1'] + (360 if R['c1'] < R['c0'] else 0); mouths.append((R['name'], (R['c0'] + c1) / 2))
mouths.append(('Central Station', 180))
for name, cdeg in mouths:
    x, y = comp(cdeg); Rr = m(J['transitR'])
    bar('Station · ' + name, x * (Rr - 6), y * (Rr - 6), x * (Rr + 6), y * (Rr + 6), 40, cT, white, 2)
    bar('Spoke · ' + name, x * HUB, y * HUB, x * Rr, y * Rr, 6, cT, cyan, 1.5)
    label(name, (x * (Rr + 40), y * (Rr + 40), 4), 12, cX, gold)
co = J['colosseum']; x, y = comp(co['compass']); d = m(co['dist'])
o = disc('Southern Colosseum', 100.8, cL, mat('v4-stone', 0xd8c9a8), z=2); o.scale.y = 82.8 / 100.8; o.location = (x * d, y * d, 0)
label('SOUTHERN COLOSSEUM', (x * d, y * d - 110, 4), 22, cX, white)
label('SHADDAI · THE GRID', (0, 0, 4), 40, cX, white)
# scale bar: 500 m
bar('Scale 500 m', m(-J['half']) + 20, m(-J['half']) + 20, m(-J['half']) + 520, m(-J['half']) + 20, 8, cX, white, 3)
label('500 m', (m(-J['half']) + 270, m(-J['half']) + 50, 3), 30, cX, white)
print('v4 built', len(J['realms']), 'realms · map', round(2 * m(J['half'])), 'm across')

# ── the owner's atlas under everything, un-tilted (vertical ×1/squash) and scaled so its transit ring = ours ──
A = J.get('atlas')
if A:
    import os
    img_path = os.path.join(bpy.app.driver_namespace.get('SHD_REPO', ''), A['file'])
    mpp = m(J['transitR']) / A['ringPxH']; mppV = mpp / A['squash']
    W, H = A['px'][0] * mpp, A['px'][1] * mppV
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -(A['px'][1] / 2 - A['centrePx'][1]) * mppV, -2))
    pl = bpy.context.active_object; pl.name = 'Atlas (reference)'; pl.scale = (W, H, 1); link(pl, cG)
    M = bpy.data.materials.new('atlas-ref'); M.use_nodes = True
    tex = M.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(img_path, check_existing=True)
    M.node_tree.links.new(tex.outputs['Color'], M.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    M.node_tree.nodes.active = tex; pl.data.materials.append(M)
    for o in cR.objects: o.display_type = 'WIRE'; o.show_wire = True
    print('atlas plane', round(W), 'x', round(H), 'm')
