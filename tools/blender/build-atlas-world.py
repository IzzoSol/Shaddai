# build-atlas-world.py — the WHOLE game laid out ON the owner's atlas picture (fal-assets/refs/world/ATLAS-ringed-realm.jpg).
# The atlas is the ground texture (un-tilted: vertical ×1/0.72) scaled so the world is ~5.4 km across; every position below is
# read off the picture (compass bearing clockwise from north + distance in METRES from The Grid's centre).
# Real sizes: every model's widest side = its real length in metres (same rule as the game's fit()).
# Settings (driver_namespace): SHD_REPO, SHD_MODELS (decoded GLB dir).  Output: collections "ATLAS …".
import bpy, math, os, random
from mathutils import Vector

NS = bpy.app.driver_namespace
REPO, MD = NS['SHD_REPO'], NS['SHD_MODELS']
U = 7 / 1.8                       # game units per metre
M_PX = 12.5 / U                   # metres per atlas pixel (horizontal) — atlas rim (840 px) = 10500 u
SQ = 0.72                         # atlas tilt: vertical pixels are squashed
CX, CY = 1000, 640                # atlas pixel of The Grid's centre
GRID_R, RING_R, RIM_R = 280 * M_PX, 495 * M_PX, 840 * M_PX   # ≈ 900 m, 1591 m, 2700 m
random.seed(7)

def at(c, r):                      # compass° + metres → Blender XY (north = +Y)
    a = math.radians(c); return (r * math.sin(a), r * math.cos(a))

# ── clean previous ATLAS build ──
for c in [c for c in bpy.data.collections if c.name.startswith('ATLAS') or c.name.startswith('SHD ')]:
    for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(c)
for n in ('Cube', 'Light'):
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)
def coll(name, parent=None):
    c = bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c); return c
ROOT = coll('ATLAS World')
cGround, cGrid, cTransit, cRealm, cModels, cNature, cLabels = [coll('ATLAS ' + n, ROOT) for n in ('Ground', 'Grid', 'Transit', 'Realm borders', 'Models', 'Nature', 'Labels')]
nature_src = coll('ATLAS _nature sources'); nature_src.hide_render = True
bpy.context.view_layer.layer_collection.children['ATLAS _nature sources'].exclude = True

def mat(name, rgb, emit=0.0, rough=0.6, metal=0.0):
    M = bpy.data.materials.get(name) or bpy.data.materials.new(name); M.use_nodes = True
    b = M.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    M.diffuse_color = (*rgb, 1); return M
def link(o, c):
    for u in list(o.users_collection): u.objects.unlink(o)
    c.objects.link(o); return o
def label(text, xy, size, c, M, z=40):
    cu = bpy.data.curves.new(text, 'FONT'); cu.body = text; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = size * 0.04
    o = bpy.data.objects.new('Label · ' + text, cu); o.location = (xy[0], xy[1], z); o.data.materials.append(M); c.objects.link(o); return o
def torus(name, R, r, z, c, M, seg=512):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=8, location=(0, 0, z))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(M); return link(o, c)
def box(name, dims, xy, z, rotz, c, M):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(xy[0], xy[1], z + dims[2] / 2)); o = bpy.context.active_object
    o.name = name; o.scale = dims; o.rotation_euler.z = rotz; o.data.materials.append(M); return link(o, c)
def cyl(name, r, h, xy, z, c, M, seg=64, open_=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=h, location=(xy[0], xy[1], z + h / 2), end_fill_type='NOTHING' if open_ else 'NGON')
    o = bpy.context.active_object; o.name = name; o.data.materials.append(M); return link(o, c)
def bar(name, p0, p1, w, h, z, c, M):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy)
    return box(name, (w, L, h), ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2), z, math.atan2(dy, dx) - math.pi / 2, c, M)

# ── 1. the atlas as the ground ──
W, H = 2000 * M_PX, 1343 * M_PX / SQ
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -(1343 / 2 - CY) * M_PX / SQ, 0))
g = bpy.context.active_object; g.name = 'Atlas ground'; g.scale = (W, H, 1); link(g, cGround)
M = bpy.data.materials.new('atlas-ground'); M.use_nodes = True; nt = M.node_tree
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(os.path.join(REPO, 'fal-assets/refs/world/ATLAS-ringed-realm.jpg'), check_existing=True)
bs = nt.nodes['Principled BSDF']; nt.links.new(tex.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.9
nt.links.new(tex.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 0.35
nt.nodes.active = tex; g.data.materials.append(M)

gold, cyan, white, stone, glass, dark = (mat('A-gold', (0.91, 0.77, 0.36), 0.6, 0.3, 0.8), mat('A-cyan', (0.37, 0.88, 1.0), 4.0),
    mat('A-white', (0.93, 0.95, 0.97), 0, 0.25), mat('A-stone', (0.85, 0.79, 0.66)), mat('A-glass', (0.75, 0.9, 1.0), 0.5, 0.05), mat('A-dark', (0.1, 0.12, 0.15)))

# ── 2. THE GRID: district edge ring, two inner ring roads, 12 radial avenues, city core (built Shaddai City, r 167 m) ──
torus('Grid edge', GRID_R, 4, 1, cGrid, cyan)
for f in (0.62, 0.36): torus('Grid ring road %.2f' % f, GRID_R * f, 3, 1, cGrid, cyan)
for k in range(12): bar('Grid avenue %d' % k, at(k * 30, 170), at(k * 30, GRID_R), 8, 0.6, 0.5, cGrid, cyan)
cyl('Shaddai City core (as built)', 650 / U, 1, (0, 0), 0.2, cGrid, mat('A-core', (0.05, 0.25, 0.3), 1.2), seg=96)

# ── 3. MAGLEV RING (deck ~9 m up) + stations at the atlas bearings + spokes to hubs on the Grid edge ──
torus('Maglev ring', RING_R, 5, 9, cTransit, gold)
STATIONS = [('Rift Gate Station', 0), ('Desert Terminal', 27), ('Emberfall Forge Station', 61), ('Suburb Transit Hub', 104),
            ('Meadowfields Halt', 142), ('Harbor Line Station', 221), ('Darkvault Station', 296), ('Arctic Outpost Station', 332)]
for name, c in STATIONS:
    p = at(c, RING_R); rz = math.radians(-c)
    box('Station · ' + name, (40, 12, 2), p, 8, rz, cTransit, white)
    canopy = cyl('Canopy · ' + name, 7, 40, p, 0, cTransit, glass, 24, True); canopy.rotation_euler = (0, math.pi / 2, rz); canopy.location.z = 12
    bar('Spoke · ' + name, at(c, GRID_R + 10), at(c, RING_R - 8), 6, 1.4, 8, cTransit, dark)
    cyl('Hub · ' + name, 10, 1.5, at(c, GRID_R + 10), 0, cTransit, cyan, 32)
    label(name.upper(), at(c, RING_R + 70), 16, cLabels, gold, 30)
box('Central Station', (40, 12, 10), at(180, GRID_R + 10), 0, 0, cTransit, white)
bar('Spoke · Central', at(180, GRID_R + 20), at(180, RING_R - 8), 6, 1.4, 8, cTransit, dark)
label('CENTRAL STATION', at(180, GRID_R + 60), 14, cLabels, gold, 30)

# ── 4. SOUTHERN COLOSSEUM at REAL size (outer shell 201.6 × 165.6 m, 46 m), lobby facing The Grid ──
cc = at(180, RING_R + 170)
sh = cyl('Southern Colosseum (shell)', 100.8, 46, cc, 0, cLabels, stone, 160, True); sh.scale.y = 82.8 / 100.8; link(sh, cModels)
bowl = cyl('Colosseum (bowl)', 1, 30, cc, 0, cModels, mat('A-seat', (0.75, 0.68, 0.55)), 160, True); bowl.scale = (86, 70, 1)
box('Colosseum lobby', (60, 32, 26), (cc[0], cc[1] + 82.8 + 16), 0, 0, cModels, stone)
label('SOUTHERN COLOSSEUM', (cc[0], cc[1] - 120), 22, cLabels, gold, 60)

# ── 5. realm borders (thin gold lines = wilderness edges) + realm names ──
REALMS = [('DEEP VOID', 346, 14, 950), ('SAND SEA', 14, 45, 950), ('EMBERFALL', 45, 80, 950), ('THE SUBURBS', 80, 122, 1700),
          ('QUILL FOREST', 88, 118, 950), ('MEADOWFIELDS', 122, 172, 950), ('CRYSTAL SEA', 196, 265, 950), ('DARKFOREST', 265, 330, 950), ('ARCTIC VAULT', 330, 346, 950)]
for name, c0, c1, r0 in REALMS:
    c1u = c1 + (360 if c1 < c0 else 0); mid = (c0 + c1u) / 2
    rl = (r0 + (RIM_R if name != 'QUILL FOREST' else 1550)) / 2
    label(name, at(mid, rl), 70 if name != 'QUILL FOREST' else 34, cLabels, white, 80)
for c in (14, 45, 80, 122, 172, 196, 265, 330, 346):
    bar('Border %d' % c, at(c, GRID_R + 40), at(c, RIM_R), 3, 0.3, 0.3, cRealm, gold)

# ── 6. realm models at their atlas spots (compass°, metres, yaw°, lift m) ──
PLACE = {
    'hero-void-rift-gate': (0, 1720, 180, 0),
    'hero-desert-terminal': (27, 1740, 207, 0),
    'hero-fortress': (66, 2180, 246, 1.7), 'volcano-forge-tower': (58, 1720, 0, 1.7), 'volcano-ritual-circle': (72, 1900, 0, 1.7),
    'volcano-dragon': (63, 1960, 240, 15), 'volcano-bridge': (64, 1830, 64, 0), 'volcano-gate': (61, 1680, 241, 0),
    'hero-city-megatower': (100, 2250, 0, 0), 'bld-apartment-pod-block': (94, 2080, 0, 0), 'bld-inverted-cube-hab': (109, 2120, 0, 0),
    'bld-neon-observatory': (114, 2380, 0, 0), 'bld-sea-terrace-spire': (90, 2420, 0, 0), 'bld-holo-market-v2': (104, 1860, 284, 0),
    'hero-forest-amphitheater': (127, 2140, 0, 0),   # atlas draws the amphitheater in MEADOWFIELDS
    'hero-mushroom-pods': (140, 1900, 0, 0), 'hero-farm-sky-structure': (152, 2250, 0, 31), 'homes-mushroom-pods': [(134, 2020, 0, 0), (146, 2080, 0, 0)],
    'hero-sky-dome': (338, 2260, 0, 0), 'hero-arctic-outpost': (332, 1720, 152, 0),
    'hero-castle': (292, 2200, 112, 0), 'prop-obsidian-rocks': [(284, 1900, 0, 0), (300, 2050, 0, 0)],
    'prop-crystal-cluster': [(288, 2350, 0, 0), (296, 1800, 0, 0), (278, 2150, 0, 0)],
    'hero-beach-market-dome': (224, 1760, 44, 0),
}
LEN = {'hero-fortress': 80, 'volcano-forge-tower': 20, 'volcano-ritual-circle': 30, 'volcano-dragon': 40, 'volcano-bridge': 45, 'volcano-gate': 30,
       'hero-castle': 70, 'prop-obsidian-rocks': 15, 'prop-crystal-cluster': 8, 'bld-apartment-pod-block': 45, 'bld-inverted-cube-hab': 30,
       'bld-neon-observatory': 35, 'bld-sea-terrace-spire': 30, 'bld-holo-market-v2': 32, 'hero-mushroom-pods': 40, 'hero-farm-sky-structure': 40,
       'homes-mushroom-pods': 25, 'hero-city-megatower': 40, 'hero-forest-amphitheater': 50, 'hero-sky-dome': 120, 'hero-arctic-outpost': 40,
       'hero-desert-terminal': 60, 'hero-void-rift-gate': 50, 'hero-beach-market-dome': 40}

def import_glb(path, name, target, length_m, xy, z, yaw_deg, key):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    E = bpy.data.objects.new(name, None); E.empty_display_type = 'ARROWS'; E.empty_display_size = 6; target.objects.link(E); E['shd_model'] = key
    for o in new:
        link(o, target)
        if o.parent is None: o.parent = E
    bpy.context.view_layer.update()
    mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in new:
        if o.type == 'MESH':
            for v in o.bound_box:
                w = o.matrix_world @ Vector(v); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    size = mx - mn; s = length_m / max(size.x, size.y, 1e-4); ctr = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in new:
        if o.parent == E: o.location -= ctr
    E.scale = (s, s, s); E.location = (xy[0], xy[1], z); E.rotation_euler.z = math.radians(yaw_deg)
    return E, new

placed = 0
for key, spots in PLACE.items():
    f = os.path.join(MD, key + '.glb')
    if not os.path.exists(f): print('MISSING', key); continue
    for i, (c, r, yaw, lift) in enumerate(spots if isinstance(spots, list) else [spots]):
        import_glb(f, 'Model · %s%s' % (key, '' if i == 0 else ' #%d' % (i + 1)), cModels, LEN[key], at(c, r), lift, yaw, key); placed += 1

# city core: the built city's fal props + the council agents on their hexagon (R 260 u ≈ 67 m) around SHADDAI
for key, x, z, L in (('bld-shop', -40, -85, 13), ('bld-arcade', 62, -55, 16)):
    f = os.path.join(MD, key + '.glb')
    if os.path.exists(f): import_glb(f, 'City · ' + key, cModels, L, (x / U, -z / U), 0, 0, key); placed += 1
AG = [('SHADDAI', 0, 0)] + [(n, 67 * math.sin(math.radians(a)), 67 * math.cos(math.radians(a))) for n, a in (('NEXUS', 30), ('QUILL', 90), ('ORACLE', 150), ('PIKADON', 210), ('ZEROX', 270), ('TURTLE', 330))]
for n, x, y in AG:
    f = os.path.join(MD, 'agent-%s.glb' % n) if os.path.exists(os.path.join(MD, 'agent-%s.glb' % n)) else os.path.join(MD, '%s.glb' % n)
    if os.path.exists(f):
        E, new = import_glb(f, 'Agent · ' + n, cModels, 1.2, (x, y), 0, 0, 'agent-' + n)
        # agents are sized by HEIGHT (1.8 m), not width
        bpy.context.view_layer.update(); zs = [ (o.matrix_world @ Vector(v)).z for o in new if o.type == 'MESH' for v in o.bound_box ]
        if zs: k = 1.8 / max(max(zs) - min(zs), 1e-4); E.scale = tuple(sc * k for sc in E.scale)
        placed += 1

# ── 7. nature: instanced kit trees / palms / peaks per realm (collection instances = cheap) ──
def src(key, length):
    f = os.path.join(MD, 'kit-%s.glb' % key)
    if not os.path.exists(f): return None
    c = bpy.data.collections.new('NAT ' + key); nature_src.children.link(c)
    E, new = import_glb(f, 'src ' + key, c, length, (0, 0), 0, 0, key)
    E.location = (0, 0, 0); return c
TREES = [s for s in (src('tree-01', 9), src('tree02', 10), src('tree03', 11), src('tree04', 9)) if s]
PALM, PEAK, DUNE = src('palm-tree03', 9), src('mountain01', 160), src('sand-mount', 90)
def scatter(name, sources, c0, c1, r0, r1, n, smin, smax):
    if not sources: return 0
    c1u = c1 + (360 if c1 < c0 else 0); k = 0
    for i in range(n):
        c = random.uniform(c0 + 1.5, c1u - 1.5); r = math.sqrt(random.uniform(r0 * r0, r1 * r1)); xy = at(c % 360, r)
        o = bpy.data.objects.new('%s %d' % (name, i), None); o.instance_type = 'COLLECTION'; o.instance_collection = random.choice(sources)
        o.location = (xy[0], xy[1], 0); o.rotation_euler.z = random.uniform(0, 6.283); s = random.uniform(smin, smax); o.scale = (s, s, s)
        cNature.objects.link(o); k += 1
    return k
nat = 0
nat += scatter('Darkforest tree', TREES, 265, 330, 1000, 2650, 900, 1.0, 2.2)
nat += scatter('Quill tree', TREES, 88, 118, 980, 1520, 260, 0.9, 1.8)
nat += scatter('Meadow tree', TREES, 122, 172, 1000, 2650, 220, 0.8, 1.6)
nat += scatter('Crystal palm', [PALM] if PALM else [], 196, 265, 1000, 1900, 160, 0.9, 1.5)
nat += scatter('Arctic peak', [PEAK] if PEAK else [], 330, 346, 1900, 2650, 10, 0.8, 1.6)
nat += scatter('Emberfall peak', [PEAK] if PEAK else [], 55, 80, 2250, 2650, 12, 1.0, 1.8)
nat += scatter('Sand dune', [DUNE] if DUNE else [], 16, 44, 1100, 2650, 40, 0.8, 2.0)

# ── 8. sun + sky ──
sun = bpy.data.objects.get('ATLAS Sun')
if not sun:
    ld = bpy.data.lights.new('ATLAS Sun', 'SUN'); ld.energy = 3.5; ld.angle = 0.1; sun = bpy.data.objects.new('ATLAS Sun', ld); bpy.context.scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(35))
w = bpy.context.scene.world or bpy.data.worlds.new('World'); bpy.context.scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = (0.02, 0.025, 0.04, 1); bg.inputs['Strength'].default_value = 0.6
print('atlas world: placed', placed, 'models,', nat, 'nature instances · grid %.0f m, ring %.0f m, rim %.0f m' % (GRID_R, RING_R, RIM_R))
