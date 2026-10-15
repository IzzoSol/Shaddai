# build-map.py — builds the Ringed Realm in Blender FROM world-layout.js (via tools/blender/dump-layout.cjs JSON).
# Units: METRES (game units / 3.8889). Axes: game x → Blender X, game z → Blender -Y (north = +Y, like the atlas).
# Run through the MCP-for-Blender socket: node tools/blender/bl.cjs tools/blender/build-map.py
# (set LAYOUT_JSON below / via bpy.app.driver_namespace['SHD_LAYOUT'] before running)
import bpy, json, math, os

U = 7 / 1.8
LAYOUT_JSON = bpy.app.driver_namespace.get('SHD_LAYOUT')
J = json.load(open(LAYOUT_JSON))

def m(v): return v / U
def P(x, z, y=0.0): return (m(x), -m(z), m(y))

def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
    return c

def mat(name, hexcol, alpha=1.0, emit=0.0):
    M = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    r, g, b = ((hexcol >> 16) & 255) / 255, ((hexcol >> 8) & 255) / 255, (hexcol & 255) / 255
    M.diffuse_color = (r, g, b, alpha)
    M.use_nodes = True
    bsdf = M.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
        bsdf.inputs['Alpha'].default_value = alpha
        if emit: bsdf.inputs['Emission Color'].default_value = (r, g, b, 1); bsdf.inputs['Emission Strength'].default_value = emit
    if alpha < 1: M.blend_method = 'BLEND' if hasattr(M, 'blend_method') else None
    return M

def put(obj, c, props=None):
    for u in list(obj.users_collection): u.objects.unlink(obj)
    c.objects.link(obj)
    for k, v in (props or {}).items(): obj[k] = v
    return obj

def cyl(name, r, h, loc, c, M, verts=96, rx=None, ry_=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(loc[0], loc[1], loc[2] + h / 2))
    o = bpy.context.active_object; o.name = name
    if rx: o.scale.x = rx / r
    if ry_: o.scale.y = ry_ / r
    o.data.materials.append(M); return put(o, c)

def box(name, sx, sy, sz, loc, rotz, c, M):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0], loc[1], loc[2] + sz / 2))
    o = bpy.context.active_object; o.name = name; o.scale = (sx, sy, sz); o.rotation_euler.z = rotz
    o.data.materials.append(M); return put(o, c)

def label(text, loc, size, c, M):
    cu = bpy.data.curves.new(text, 'FONT'); cu.body = text; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    o = bpy.data.objects.new('Label · ' + text, cu); o.location = loc; o.data.materials.append(M)
    c.objects.link(o); return o

# ── clean slate (only our collections + default cube/light) ──
for n in ('SHD Ground', 'SHD Realms', 'SHD Transit', 'SHD Landmarks', 'SHD Labels'):
    c = bpy.data.collections.get(n)
    if c:
        for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
for n in ('Cube',):
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)

cG, cR, cT, cL, cX = coll('SHD Ground'), coll('SHD Realms'), coll('SHD Transit'), coll('SHD Landmarks'), coll('SHD Labels')
HALF = m(J['half'])
cyl('Ground', HALF, 0.2, (0, 0, -0.4), cG, mat('shd-ground', 0x10151c), verts=192)
white = mat('shd-label', 0xffffff, emit=1.5)

# realms: translucent coloured discs at their real radius + name
for b in J['biomes']:
    cx, cy, _ = P(b['c'][0], b['c'][1])
    o = cyl('Realm · ' + b['name'], m(b['r']), 0.3, (cx, cy, -0.1), cR, mat('realm-' + b['id'], b['color'], 0.55), verts=128)
    o['shd_realm'] = b['id']
    label(b['name'].upper(), (cx, cy, 2), 28, cX, white)

# transit ring deck (10 m wide, ~9 m up), stations, hubs, spokes
R, CITY = m(J['transitR']), m(J['cityR'])
gold, conc, cyan = mat('shd-gold', 0xe8c45c, emit=0.4), mat('shd-concrete', 0x3a4250), mat('shd-cyan', 0x5fe0ff, emit=2.0)
bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=5, major_segments=256, minor_segments=4, location=(0, 0, 9))
o = bpy.context.active_object; o.name = 'Maglev Ring'; o.scale.z = 0.25; o.data.materials.append(gold); put(o, cT)
HUB_R = CITY + 12
for s in J['stations']:
    x, y, _ = P(s['pos'][0], s['pos'][1]); a = math.atan2(y, x)
    box('Station · ' + s['name'], 40, 12, 12, (x, y, 3), a + math.pi / 2, cT, mat('shd-station', 0xeef2f6)).__setitem__('shd_station', s['id'])
    label(s['name'], (x * 1.07, y * 1.07, 16), 9, cX, gold)
    r0 = math.hypot(x, y) if s['id'] == 'central' else HUB_R
    if s['id'] != 'central':
        cyl('Hub · ' + s['name'], 10, 1, (math.cos(a) * HUB_R, math.sin(a) * HUB_R, 0), cT, cyan)
    L = R - r0; mid = r0 + L / 2
    box('Spoke · ' + s['name'], 6, L, 1.4, (math.cos(a) * mid, math.sin(a) * mid, 8.3), a - math.pi / 2, cT, conc)

# Southern Colosseum at real size (outer shell semi-axes 100.8 × 82.8 m, 46 m tall) + lobby toward the city
co = J.get('colosseum')
if co:
    x, y, _ = P(co['x'], co['z']); fx, fy = math.cos(co['face']), -math.sin(co['face'])
    o = cyl('Southern Colosseum', 100.8, 46, (x, y, 0), cL, mat('shd-stone', 0xd8c9a8), verts=160, rx=82.8 if False else None)
    # long axis runs along the side axis (perpendicular to the face direction)
    o.scale = (1, 82.8 / 100.8, 1); o.rotation_euler.z = math.atan2(fy, fx) + math.pi / 2
    o['shd_landmark'] = 'colosseum'
    lz = 82.8 + 16
    box('Colosseum Lobby', 60, 32, 26, (x + fx * lz, y + fy * lz, 0), math.atan2(fy, fx) + math.pi / 2, cL, mat('shd-stone', 0xd8c9a8))
    label('SOUTHERN COLOSSEUM', (x, y, 50), 16, cX, gold)

# the Grid (city) core label
label('SHADDAI · THE GRID', (0, 0, 4), 34, cX, cyan)
print('built', len(J['biomes']), 'realms,', len(J['stations']), 'stations')
