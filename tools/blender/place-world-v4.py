# place-world-v4.py — maps the WHOLE GAME onto the Map v4 terrain in the open Blender (metres; X = east, Y = north).
# Positions: the atlas table (compass° clockwise from north, fraction of the realm rim, yaw°) — the SAME table the game
# layout uses under ?map=v4 (public/world-layout.js), so Blender and the game agree. Heights come straight from
# public/assets/terrain/height16.bin (+ terrain.json), so every object sits ON the ground.
# Settings: SHD_REPO (repo root), SHD_CACHE (decoded GLBs, .bl-cache). Removes the old small-scale ATLAS layers.
import bpy, json, math, os, random
import numpy as np
from mathutils import Vector

NS = bpy.app.driver_namespace
REPO = NS['SHD_REPO']; CACHE = NS['SHD_CACHE']
T = json.load(open(os.path.join(REPO, 'public/assets/terrain/terrain.json')))
N, HALF, MN, MX = T['size_px'], T['half_m'], T['min_m'], T['max_m']
HM = np.fromfile(os.path.join(REPO, 'public/assets/terrain/height16.bin'), dtype='<u2').reshape(N, N).astype(np.float32) / 65535 * (MX - MN) + MN
CELL = 2 * HALF / N
GRID_R, RING_R, RIM, WL = T['grid_r_m'], T['ring_r_m'], T['rim_m'], T['water_level_m']
random.seed(26)

def H(x, y):
    fx = (x + HALF) / CELL - 0.5; fy = (HALF - y) / CELL - 0.5
    j = int(min(max(math.floor(fx), 0), N - 2)); i = int(min(max(math.floor(fy), 0), N - 2)); tx = min(max(fx - j, 0), 1); ty = min(max(fy - i, 0), 1)
    return float((HM[i, j] * (1 - tx) + HM[i, j + 1] * tx) * (1 - ty) + (HM[i + 1, j] * (1 - tx) + HM[i + 1, j + 1] * tx) * ty)
def Hmin(x, y, r):   # lowest ground under a footprint → nothing floats
    return min(H(x + dx * r, y + dy * r) for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (.7, .7), (-.7, .7), (.7, -.7), (-.7, -.7)))
def slope(x, y, d=6.0):
    return math.hypot(H(x + d, y) - H(x - d, y), H(x, y + d) - H(x, y - d)) / (2 * d)
def at(c, r): a = math.radians(c); return (r * math.sin(a), r * math.cos(a))

# ── clean the old small-scale layers (keep ATLAS Ground: terrain / water / cloud sea) ──
for name in ('ATLAS Models', 'ATLAS Nature', 'ATLAS Transit', 'ATLAS Grid', 'ATLAS Labels', 'ATLAS Realm borders', 'ATLAS _nature sources', 'V4 World'):
    c = bpy.data.collections.get(name)
    if not c: continue
    for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    for ch in list(c.children_recursive): bpy.data.collections.remove(ch)
    bpy.data.collections.remove(c)
for c in [c for c in bpy.data.collections if c.name.startswith('NAT ') or c.name == 'glTF_not_exported']:
    for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(c)
for m in [m for m in bpy.data.meshes if m.users == 0]: bpy.data.meshes.remove(m)

def coll(name, parent=None):
    c = bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c); return c
ROOT = coll('V4 World')
cT, cG, cM, cW, cN = [coll('V4 ' + n, ROOT) for n in ('Transit', 'Grid', 'Realm models', 'Wilderness', 'Nature')]
SRC = coll('V4 _sources'); bpy.context.view_layer.layer_collection.children['V4 _sources'].exclude = True

def mat(name, rgb, emit=0.0, rough=0.6, metal=0.0, alpha=1.0):
    M = bpy.data.materials.get(name) or bpy.data.materials.new(name); M.use_nodes = True; b = M.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal; b.inputs['Alpha'].default_value = alpha
    if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    M.diffuse_color = (*rgb, alpha); return M
def link(o, c):
    for u in list(o.users_collection): u.objects.unlink(o)
    c.objects.link(o); return o
def box(name, dims, xy, z, rotz, c, M):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(xy[0], xy[1], z + dims[2] / 2)); o = bpy.context.active_object
    o.name = name; o.scale = dims; o.rotation_euler.z = rotz; o.data.materials.append(M); return link(o, c)
def cyl(name, r, h, xy, z, c, M, seg=48, open_=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=h, location=(xy[0], xy[1], z + h / 2), end_fill_type='NOTHING' if open_ else 'NGON')
    o = bpy.context.active_object; o.name = name; o.data.materials.append(M); return link(o, c)
def bar(name, p0, p1, w, h, z, c, M):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy)
    return box(name, (w, L, h), ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2), z, math.atan2(dy, dx) - math.pi / 2, c, M)
gold, cyan, white, stone, glass, concrete = (mat('V4-gold', (0.91, 0.77, 0.36), 0.6, 0.3, 0.8), mat('V4-cyan', (0.37, 0.88, 1.0), 4.0),
    mat('V4-white', (0.93, 0.95, 0.97), 0, 0.25), mat('V4-stone', (0.85, 0.79, 0.66)), mat('V4-glass', (0.75, 0.9, 1.0), 0.5, 0.05), mat('V4-concrete', (0.16, 0.18, 0.22)))

# ── glTF import → Empty with the model centred on it, base at the origin, widest side = length_m ──
_cache = {}
def source(key):
    """Import once into V4 _sources; placements are instances of that collection (cheap)."""
    if key in _cache: return _cache[key]
    f = os.path.join(CACHE, key + '.glb')
    if not os.path.exists(f): print('MISSING', key); _cache[key] = None; return None
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    c = bpy.data.collections.new('SRC ' + key); SRC.children.link(c)
    for o in new: link(o, c)
    bpy.context.view_layer.update()
    mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in new:
        if o.type == 'MESH':
            for v in o.bound_box:
                w = o.matrix_world @ Vector(v); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    c.instance_offset = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)
    size = mx - mn; _cache[key] = (c, max(size.x, size.y, 1e-4), max(size.z, 1e-4)); return _cache[key]
def place(key, name, xy, length_m, yaw_deg=0, lift=0.0, c=None, by_height=False, sink=True, props=None):
    s = source(key)
    if not s: return None
    col, wid, hgt = s
    k = length_m / (hgt if by_height else wid)
    z = (Hmin(xy[0], xy[1], wid * k * 0.35) if sink else H(xy[0], xy[1])) + lift
    o = bpy.data.objects.new(name, None); o.instance_type = 'COLLECTION'; o.instance_collection = col
    o.location = (xy[0], xy[1], z); o.scale = (k, k, k); o.rotation_euler.z = math.radians(yaw_deg)
    (c or cM).objects.link(o)
    for kk, vv in (props or {}).items(): o[kk] = vv
    return o

# ── 1. THE GRID district: edge ring, 2 inner ring roads, 12 avenues, city core, council agents, city props ──
gz = H(0, 0)
def torus(name, R, r, z, c, M):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=384, minor_segments=6, location=(0, 0, z))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(M); return link(o, c)
torus('Grid edge', GRID_R, 5, gz + 0.5, cG, cyan)
for f in (0.62, 0.36): torus('Grid ring road %.2f' % f, GRID_R * f, 4, gz + 0.4, cG, cyan)
for k in range(12): bar('Grid avenue %d' % k, at(k * 30, 175), at(k * 30, GRID_R), 10, 0.5, gz + 0.3, cG, cyan)
cyl('Shaddai City core (as built)', 167, 0.6, (0, 0), gz + 0.2, cG, mat('V4-core', (0.05, 0.25, 0.3), 1.2), seg=96)
for n, a in (('SHADDAI', None), ('NEXUS', 30), ('QUILL', 90), ('ORACLE', 150), ('PIKADON', 210), ('ZEROX', 270), ('TURTLE', 330)):
    xy = (0, 0) if a is None else at(a, 67)
    place('agent-' + n, 'Agent · ' + n, xy, 1.8, 0 if a is None else (a + 180), c=cG, by_height=True, sink=False, props={'shd_model': 'agent-' + n})
for key, xy, L in (('bld-shop', (-40 / 3.889, 85 / 3.889), 13), ('bld-arcade', (62 / 3.889, 55 / 3.889), 16)):
    place(key, 'City · ' + key, xy, L, c=cG, props={'shd_model': key})
for k in range(24):   # street lamps + fountains along the avenues
    a = k * 15; r = 420 + (k % 3) * 360
    place('prop-street-lamp', 'Grid lamp %d' % k, at(a + 3, r), 6, a, c=cG, by_height=True)
for k in range(6): place('prop-holo-fountain', 'Grid fountain %d' % k, at(k * 60 + 15, GRID_R * 0.62), 8, c=cG)

# ── 2. MAGLEV: ring deck ~9 m over the highest ground under it, 8 stations + Central, spokes to hubs on the Grid edge ──
ring_max = max(H(*at(c, RING_R)) for c in range(0, 360, 2))
DECK = ring_max + 9
torus('Maglev ring', RING_R, 5, DECK, cT, gold)
for st in T['stations']:
    c = st['compass']; p = at(c, RING_R); rz = math.radians(-c)
    box('Station · ' + st['name'], (40, 12, 2), p, DECK - 1, rz, cT, white)
    cn = cyl('Canopy · ' + st['name'], 7, 40, p, 0, cT, glass, 24, True); cn.rotation_euler = (0, math.pi / 2, rz); cn.location.z = DECK + 3
    hub = at(c, GRID_R + 45)
    bar('Spoke · ' + st['name'], hub, at(c, RING_R - 8), 6, 1.4, DECK - 1.5, cT, concrete)
    cyl('Hub · ' + st['name'], 38, 1.5, hub, H(*hub), cT, cyan, 48)
    cyl('Lift · ' + st['name'], 8, DECK - H(*hub), hub, H(*hub), cT, glass, 24, True)
    # pylons every ~40 m along the spoke
    L = RING_R - GRID_R - 60
    for t in range(1, int(L / 40)):
        q = at(c, GRID_R + 45 + t * 40); cyl('Pylon', 2.5, DECK - 1.5 - H(*q), q, H(*q), cT, concrete, 12)
cen = at(180, GRID_R + 40); box('Central Station', (40, 14, 12), cen, H(*cen), 0, cT, white)
bar('Spoke · Central', at(180, GRID_R + 60), at(180, RING_R - 8), 6, 1.4, DECK - 1.5, cT, concrete)
for c in range(0, 360, 1):                        # ring pylons every ~50 m (skip river beds)
    if (c * RING_R * math.pi / 180) % 50 > 50 * 0.9: continue
for k in range(int(2 * math.pi * RING_R / 50)):
    q = at(k * 360 / int(2 * math.pi * RING_R / 50), RING_R); g = H(*q)
    if g < WL - 0.5: continue
    cyl('Ring pylon %d' % k, 2.2, DECK - 1 - g, q, g, cT, concrete, 10)

# ── 3. SOUTHERN COLOSSEUM at real size (outer shell 201.6 × 165.6 m, 46 m), lobby facing the Grid ──
cc = at(180, RING_R + 300); cz = H(*cc)
sh = cyl('Southern Colosseum (shell)', 100.8, 46, cc, cz, cM, stone, 160, True); sh.scale.y = 82.8 / 100.8
bw = cyl('Colosseum (bowl)', 1, 30, cc, cz, cM, mat('V4-seat', (0.75, 0.68, 0.55)), 160, True); bw.scale = (86, 70, 1)
box('Colosseum lobby', (60, 32, 26), (cc[0], cc[1] + 82.8 + 16), H(cc[0], cc[1] + 99), 0, cM, stone)

# ── 4. REALM MODELS at their atlas spots (same table as world-layout.js under ?map=v4) ──
PLACE = [('hero-void-rift-gate', 0, .637, 180, 50, 0), ('hero-desert-terminal', 27, .644, 207, 60, 0),
    ('hero-fortress', 66, .807, 246, 80, 0), ('volcano-forge-tower', 58, .637, 0, 20, 0), ('volcano-ritual-circle', 72, .704, 0, 30, 0),
    ('volcano-dragon', 63, .726, 240, 40, 60), ('volcano-bridge', 64, .678, 64, 45, 0), ('volcano-gate', 61, .622, 241, 30, 0),
    ('hero-city-megatower', 100, .833, 0, 40, 0), ('bld-apartment-pod-block', 94, .770, 0, 45, 0), ('bld-inverted-cube-hab', 109, .785, 0, 30, 0),
    ('bld-neon-observatory', 114, .881, 0, 35, 0), ('bld-sea-terrace-spire', 90, .896, 0, 30, 0), ('bld-holo-market-v2', 104, .689, 284, 32, 0),
    ('hero-forest-amphitheater', 127, .793, 0, 50, 0), ('hero-mushroom-pods', 140, .704, 0, 40, 0), ('hero-farm-sky-structure', 152, .833, 0, 40, 31),
    ('homes-mushroom-pods', 134, .748, 0, 25, 0), ('homes-mushroom-pods', 146, .770, 0, 25, 0),
    ('hero-sky-dome', 338, .837, 0, 120, 0), ('hero-arctic-outpost', 332, .637, 152, 40, 0), ('hero-castle', 292, .815, 112, 70, 0),
    ('prop-obsidian-rocks', 284, .704, 0, 15, 0), ('prop-obsidian-rocks', 300, .759, 0, 16, 0),
    ('prop-crystal-cluster', 288, .870, 0, 8, 0), ('prop-crystal-cluster', 296, .667, 0, 7, 0), ('prop-crystal-cluster', 278, .796, 0, 9, 0),
    ('hero-beach-market-dome', 224, .652, 44, 40, 0)]
placed = 0
for i, (key, c, f, yaw, L, lift) in enumerate(PLACE):
    if place(key, 'Model · %s #%d' % (key, i), at(c, f * RIM), L, yaw, lift, props={'shd_model': key, 'compass': c, 'rim_frac': f}): placed += 1

# ── 5. WILDERNESS: waystations on each realm border, floating islands over lakes, bridges where rivers cross r≈0.55 rim ──
borders = []
realms = T['realms']
for R_ in realms:
    if R_['id'] in ('forest',): continue
    borders.append(R_['c1'] % 360)
ways = 0
for n, cb in enumerate(sorted(set(borders))):
    best, bs = None, 1e9
    for dc in (-2, -1, 0, 1, 2):
        for dr in (-160, -80, 0, 80, 160):
            q = at(cb + dc, RIM * 0.62 + dr); s_ = slope(*q)
            if H(*q) > WL + 1 and s_ < bs: best, bs = q, s_
    if not best: continue
    yaw = math.degrees(math.atan2(-best[0], -best[1]))       # face the Grid
    place('kit-platform-03', 'Waystation %d · platform' % n, best, 12, yaw, c=cW)
    off = lambda dx, dy: (best[0] + dx, best[1] + dy)
    place('kit-information-stand01', 'Waystation %d · info' % n, off(6, 0), 2.5, yaw, c=cW, by_height=True)
    place('kit-elevator-teleport01', 'Waystation %d · teleport' % n, off(-6, 4), 4, yaw, c=cW, by_height=True)
    place('kit-japanese-arch', 'Waystation %d · arch' % n, off(0, -10), 8, yaw, c=cW, by_height=True)
    place('prop-street-lamp', 'Waystation %d · lamp a' % n, off(9, -8), 6, yaw, c=cW, by_height=True)
    place('prop-street-lamp', 'Waystation %d · lamp b' % n, off(-9, -8), 6, yaw, c=cW, by_height=True)
    ways += 1
isl = 0
for w in T['water']:
    if w['type'] == 'lake':
        cx_, cy_ = w['center_m']; place('kit-floating-island-01', 'Floating island · lake %d' % isl, (cx_, cy_), 55, random.uniform(0, 360), lift=80, c=cW, sink=False); isl += 1
bridges = 0
for w in T['water']:
    if w['type'] != 'river': continue
    pts = w['path_m']; best = min(range(len(pts) - 1), key=lambda i: abs(math.hypot(*pts[i]) - RIM * 0.55))
    (x0, y0), (x1, y1) = pts[best], pts[best + 1]; ang = math.degrees(math.atan2(x1 - x0, y1 - y0)) + 90
    place('kit-sci-fi-bridge', 'River bridge %d' % bridges, ((x0 + x1) / 2, (y0 + y1) / 2), 65, -ang, lift=0, c=cW, sink=False); bridges += 1

# ── 6. NATURE: instanced vegetation per realm (Blender preview density; the game uses world-fill-v4.js) ──
def comp_of(x, y): return (math.degrees(math.atan2(x, y)) + 360) % 360
def inside(c, c0, c1, pad): span = (c1 - c0) % 360; rel = (c - c0) % 360; return pad <= rel <= span - pad
def scatter(tag, keys, c0, c1, r0, r1, n, hmin, hmax, pad=6):
    k = 0; tries = 0
    while k < n and tries < n * 8:
        tries += 1
        c = (c0 + random.uniform(0, (c1 - c0) % 360)) % 360; r = math.sqrt(random.uniform(r0 * r0, r1 * r1)); q = at(c, r)
        if not inside(c, c0, c1, pad) or H(*q) < WL + 0.8 or slope(*q) > 0.7: continue
        if abs(r - RING_R) < 60: continue
        o = place(random.choice(keys), '%s %d' % (tag, k), q, random.uniform(hmin, hmax), random.uniform(0, 360), c=cN, by_height=True, sink=False)
        if o: k += 1
    return k
RB = {r_['id']: r_ for r_ in realms}
def R(id_): r_ = RB[id_]; return r_['c0'], r_['c1'], r_['r0_m'], r_['r1_m']
nat = 0
nat += scatter('Darkforest tree', ['nat-deadtree-1', 'nat-deadtree-4', 'nat-deadtree-7', 'nat-mapletree-3'], *R('darkforest'), 900, 9, 18)
nat += scatter('Quill tree', ['nat-mapletree-1', 'nat-mapletree-3', 'nat-birchtree-1', 'nat-birchtree-3'], *R('forest'), 500, 10, 16, pad=4)
nat += scatter('Meadow tree', ['nat-birchtree-1', 'nat-birchtree-3', 'nat-bush-large', 'nat-bush-flowers', 'nat-flower-1-clump'], *R('meadow'), 700, 2, 14)
nat += scatter('Suburb tree', ['nat-mapletree-1'], *R('suburb'), 120, 8, 12)
nat += scatter('Island palm', ['kit-palm-tree03'], *R('ocean'), 260, 9, 13)
nat += scatter('Arctic dead tree', ['nat-deadtree-4'], *R('arctic'), 90, 6, 10)
nat += scatter('Arctic outcrop', ['kit-mountain05', 'kit-mountain01'], *R('arctic'), 18, 60, 140)
nat += scatter('Emberfall burnt tree', ['nat-deadtree-7', 'nat-deadtree-1'], *R('volcano'), 140, 6, 12)
nat += scatter('Emberfall outcrop', ['kit-mountain05'], *R('volcano'), 18, 50, 110)
nat += scatter('Sand dune', ['kit-sand-mount'], *R('desert'), 45, 20, 45)
for i in range(len(borders)):   # wilderness scrub in each corridor
    cb = sorted(set(borders))[i]
    nat += scatter('Wild scrub %d' % i, ['nat-bush-large', 'nat-bush-flowers', 'nat-mapletree-1', 'nat-birchtree-3'], cb - 5, cb + 5, GRID_R + 250, RIM - 100, 90, 2, 12, pad=0.5)

# ── 7. sun + sky ──
sun = bpy.data.objects.get('ATLAS Sun')
if not sun:
    ld = bpy.data.lights.new('ATLAS Sun', 'SUN'); ld.energy = 3.5; sun = bpy.data.objects.new('ATLAS Sun', ld); bpy.context.scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(35))
print('v4 placed: %d realm models, %d waystations, %d floating islands, %d bridges, %d nature · deck %.0f m · ring %.0f m' % (placed, ways, isl, bridges, nat, DECK, RING_R))
