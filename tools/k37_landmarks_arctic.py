# tools/k37_landmarks_arctic.py - K37 district landmarks + K36 arctic peak city (owner 2026-10-23), built in code, exported headless:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python tools/k37_landmarks_arctic.py -- [ids]
# ids: anvil exchange hearth arctic (default all). Writes public/assets/kits/shaddai_landmark_<id>_v01.glb and shaddai_arctic_peaks_v01.glb.
# Landmarks (TURTLE district language): base-centred at the origin, metres, +Z up. Arctic: WORLD coordinates (Blender x east / y north, absolute z),
# so the game places it at the origin; peak positions/heights come from public/assets/terrain (height16.bin) and the Ascension Arch spot.
import bpy, bmesh, math, os, sys, json, struct
from mathutils import Matrix, Vector

REPO = r'C:/Users/Brittany/Shaddai-3d'; OUT = REPO + '/public/assets/kits'
ids = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ids = ids or ['anvil', 'exchange', 'hearth', 'arctic']

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
MATS = {}
def mat(name, hexc, metal=0.2, rough=0.45, emit=0.0, alpha=1.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    c = tuple(((hexc >> s & 255) / 255.0) ** 2.2 for s in (16, 8, 0)) + (1,)
    b.inputs['Base Color'].default_value = c; b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = c; b.inputs['Emission Strength'].default_value = emit
    if alpha < 1: b.inputs['Alpha'].default_value = alpha; m.surface_render_method = 'BLENDED'
    MATS[name] = m; return m
class MB:   # one bmesh per material, joined into one object at the end
    def __init__(s): s.bm = {}
    def get(s, m): return s.bm.setdefault(m.name, (bmesh.new(), m))[0]
    def box(s, m, cx, cy, z0, sx, sy, sz, rot=0):
        bmesh.ops.create_cube(s.get(m), size=1, matrix=Matrix.Translation((cx, cy, z0 + sz / 2)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((sx, sy, sz, 1)))
    def cyl(s, m, cx, cy, z0, r1, r2, h, seg=24):
        bmesh.ops.create_cone(s.get(m), cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h, matrix=Matrix.Translation((cx, cy, z0 + h / 2)))
    def torus(s, m, cx, cy, z, R, r, tilt=0.0, seg=40, ring=8):
        bm = s.get(m); M = Matrix.Translation((cx, cy, z)) @ Matrix.Rotation(tilt, 4, 'X'); vs = []
        for i in range(seg):
            a = 2 * math.pi * i / seg; row = []
            for j in range(ring):
                b = 2 * math.pi * j / ring; p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
                row.append(bm.verts.new(M @ p))
            vs.append(row)
        for i in range(seg):
            for j in range(ring): bm.faces.new((vs[i][j], vs[(i + 1) % seg][j], vs[(i + 1) % seg][(j + 1) % ring], vs[i][(j + 1) % ring]))
    def dome(s, m, cx, cy, z, r, seg=24, rings=8):
        bm = s.get(m); vs = []
        for k in range(rings + 1):
            t = (math.pi / 2) * k / rings; row = [bm.verts.new((cx + r * math.cos(t) * math.cos(2 * math.pi * i / seg), cy + r * math.cos(t) * math.sin(2 * math.pi * i / seg), z + r * math.sin(t))) for i in range(seg)]
            vs.append(row)
        for k in range(rings):
            for i in range(seg): bm.faces.new((vs[k][i], vs[k][(i + 1) % seg], vs[k + 1][(i + 1) % seg], vs[k + 1][i]))
    def finish(s, name):
        obs = []
        for key, (bm, m) in s.bm.items():
            me = bpy.data.meshes.new(name + '_' + key); bm.to_mesh(me); bm.free(); me.materials.append(m)
            o = bpy.data.objects.new(name + '_' + key, me); bpy.context.scene.collection.objects.link(o); obs.append(o)
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs: o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join(); obs[0].name = name
        for p in obs[0].data.polygons: p.use_smooth = False
        return obs[0]
def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    print('K37OUT', os.path.basename(path), os.path.getsize(path))

WHITE = lambda: mat('lm_white', 0xeef1f4, 0.3, 0.35)
STEEL = lambda: mat('lm_steel', 0x2b3038, 0.8, 0.35)
GLASS = lambda: mat('lm_glass', 0x8fc4e8, 0.1, 0.05, 0.15, 0.55)

def anvil():   # FORGE - brutalist-industrial: steel ribs, stepped setbacks, cantilever pod-labs, twin halo rings. ~260 m
    clear(); m = MB(); cu = mat('lm_copper', 0xc43e00, 0.6, 0.3, 3.0); dark = mat('lm_forge_dark', 0x23262b, 0.5, 0.5)
    for r, h, z in ((78, 4, 0), (62, 4, 4), (48, 4, 8)): m.cyl(WHITE(), 0, 0, z, r, r, h, 48)
    tiers = [(46, 12, 96), (38, 108, 70), (30, 178, 52)]
    for w, z0, h in tiers:
        m.box(dark, 0, 0, z0, w, w, h)
        for sx in (-1, 1):
            for sy in (-1, 1): m.box(STEEL(), sx * w / 2, sy * w / 2, z0, 2.4, 2.4, h)
        for k in range(1, 4):
            for ax in (0, 1):
                off = -w / 2 + w * k / 4
                m.box(STEEL(), off if ax else -w / 2 - 0.4, -w / 2 - 0.4 if ax else off, z0, 1.2, 1.2, h); m.box(STEEL(), off if ax else w / 2 + 0.4, w / 2 + 0.4 if ax else off, z0, 1.2, 1.2, h)
        m.box(cu, 0, 0, z0 + h - 1.0, w + 1.6, w + 1.6, 1.0)                                   # copper floor band at each setback
    for z, a in ((40, 0.0), (82, 1.57), (140, 3.14), (196, 4.71)):                                 # cantilever pod-labs with glowing vents
        dx, dy = math.cos(a), math.sin(a); w = 46 if z < 108 else 38 if z < 178 else 30
        m.box(WHITE(), dx * (w / 2 + 8), dy * (w / 2 + 8), z, 16 if abs(dx) > 0.5 else 12, 12 if abs(dx) > 0.5 else 16, 10)
        m.box(cu, dx * (w / 2 + 16.2), dy * (w / 2 + 16.2), z + 3, 0.6 if abs(dx) > 0.5 else 10, 10 if abs(dx) > 0.5 else 0.6, 3)
    m.torus(cu, 0, 0, 238, 34, 2.6, 0.21); m.torus(cu, 0, 0, 252, 22, 1.8, -0.18)                  # twin energy halos
    for k in range(4): a = k * math.pi / 2 + 0.785; m.box(STEEL(), math.cos(a) * 14, math.sin(a) * 14, 230, 1.6, 1.6, 26)
    m.cyl(STEEL(), 0, 0, 230, 6, 1.2, 34, 12)
    m.finish('landmark_anvil'); export(OUT + '/shaddai_landmark_anvil_v01.glb')

def exchange():   # TRADE - glass column with white ribs, sapphire bands, sky-garden terraces, glass dome in a coin torus. ~250 m
    clear(); m = MB(); sap = mat('lm_sapphire', 0x0066b2, 0.4, 0.2, 3.0); green = mat('lm_garden', 0x3f8a4f, 0.0, 0.8)
    for r, h, z in ((72, 5, 0), (58, 5, 5), (44, 5, 10)): m.cyl(WHITE(), 0, 0, z, r, r, h, 48)
    m.cyl(GLASS(), 0, 0, 15, 24, 20, 205, 32)
    for k in range(24): a = 2 * math.pi * k / 24; m.box(WHITE(), math.cos(a) * 23, math.sin(a) * 23, 15, 1.4, 1.4, 205, a)
    for z in range(40, 220, 30): m.cyl(sap, 0, 0, z, 25.5, 25.5, 1.2, 32)
    for z in (85, 155):                                                                              # sky-garden terraces
        m.cyl(WHITE(), 0, 0, z, 34, 34, 2.2, 40); m.cyl(green, 0, 0, z + 2.2, 32, 32, 0.8, 40)
        for k in range(10): a = 2 * math.pi * k / 10; m.cyl(green, math.cos(a) * 29, math.sin(a) * 29, z + 3, 1.8, 0.2, 6, 6)
        m.cyl(GLASS(), 0, 0, z + 2.2, 34, 34, 1.4, 40)
    m.cyl(WHITE(), 0, 0, 220, 26, 26, 3, 40); m.dome(GLASS(), 0, 0, 223, 22)
    m.torus(sap, 0, 0, 236, 30, 2.2, math.pi / 2, 48)                                                 # standing "coin" torus around the dome
    m.cyl(WHITE(), 0, 0, 245, 2.0, 0.3, 30, 8)
    m.finish('landmark_exchange'); export(OUT + '/shaddai_landmark_exchange_v01.glb')

def hearth():   # RESIDENTIAL - soft modular pods, timber + white, twisting stacked floors, wave balconies, living dome. ~200 m
    clear(); m = MB(); wood = mat('lm_timber', 0xa8754a, 0.0, 0.7); sage = mat('lm_sage', 0x4a7c59, 0.1, 0.6, 1.2); green = mat('lm_garden2', 0x3f8a4f, 0.0, 0.8)
    for r, h, z in ((70, 4, 0), (56, 4, 4)): m.cyl(WHITE(), 0, 0, z, r, r, h, 48)
    z = 8
    for k in range(13):
        rot = k * math.radians(9); m.box(wood if k % 2 else WHITE(), 0, 0, z, 34, 34, 12.5, rot); m.box(sage, 0, 0, z + 12.5, 36, 36, 0.8, rot)
        for side in (0, 2):                                                                         # wave balconies (half-round pods)
            a = rot + side * math.pi / 2; m.cyl(GLASS(), math.cos(a) * 18, math.sin(a) * 18, z + 2, 6, 6, 8, 12)
        z += 13.3
    m.cyl(WHITE(), 0, 0, z, 24, 24, 2, 40); m.dome(green, 0, 0, z + 2, 21); m.dome(GLASS(), 0, 0, z + 2, 22.5)
    for k in range(3): a = 2 * math.pi * k / 3; m.dome(WHITE(), math.cos(a) * 46, math.sin(a) * 46, 8, 7)    # mini-dome pavilions on the plaza
    m.finish('landmark_hearth'); export(OUT + '/shaddai_landmark_hearth_v01.glb')

def arctic():   # K36: ice towers on four arctic summits, glass ice-bridges in a loop, skyway to the Ascension Arch, walkway + dock down to the ice river
    clear(); m = MB(); ice = mat('ar_ice', 0xbfe8ff, 0.1, 0.1, 0.3, 0.7); indigo = mat('ar_indigo', 0x1e3a8a, 0.4, 0.4); gold = mat('ar_gold', 0xfbbf24, 0.8, 0.3, 2.5)
    T = json.load(open(REPO + '/public/assets/terrain/terrain.json')); raw = open(REPO + '/public/assets/terrain/height16.bin', 'rb').read(); N = int(math.sqrt(len(raw) / 2)); H = T['half_m']
    def g(x, y):
        u = (x + H) * (N - 1) / (2 * H); v = (-y + H) * (N - 1) / (2 * H); i, j = int(u), int(v); fx, fy = u - i, v - j
        s = lambda a, b: struct.unpack_from('<H', raw, 2 * (b * N + a))[0]
        t = s(i, j) + (s(i + 1, j) - s(i, j)) * fx; bt = s(i, j + 1) + (s(i + 1, j + 1) - s(i, j + 1)) * fx
        return T['min_m'] + (T['max_m'] - T['min_m']) / 65535 * (t + (bt - t) * fy)
    PEAKS = [(-1313, 3608), (-1649, 3885), (-2019, 3360), (-1251, 3097)]   # summit (top), N, W, S - a loop around the arch's mountain
    tops = []
    for k, (x, y) in enumerate(PEAKS):
        z = g(x, y); hgt = 70 if k == 0 else 46
        m.cyl(indigo, x, y, z - 30, 26, 22, 34, 6)                                                    # hex plinth gripping the summit
        for i, (r1, r2, h) in enumerate(((16, 13, hgt * 0.45), (13, 10, hgt * 0.35), (10, 4, hgt * 0.2))):
            m.cyl(ice, x, y, z + 4 + sum(t[2] for t in ((16, 13, hgt * 0.45), (13, 10, hgt * 0.35), (10, 4, hgt * 0.2))[:i]), r1, r2, h, 6)
        m.torus(gold, x, y, z + 4 + hgt * 0.45, 17.5, 0.8, 0, 6, 6)                                     # gold halo at the first setback
        m.cyl(gold, x, y, z + 4 + hgt, 0.8, 0.1, 14, 6)
        tops.append((x, y, z + 12))                                                                  # bridge deck level
    def bridge(a, b, w, glass=True):
        d = Vector((b[0] - a[0], b[1] - a[1], b[2] - a[2])); L = d.length; n = max(8, int(L / 12)); sd = Vector((-d.y, d.x, 0)).normalized() * w / 2; bm = m.get(WHITE()); prev = None
        sag = min(18, L * 0.04)
        for i in range(n + 1):
            t = i / n; c = Vector(a) + d * t; c.z -= math.sin(math.pi * t) * sag
            row = (bm.verts.new(c - sd), bm.verts.new(c + sd))
            if prev: bm.faces.new((prev[0], row[0], row[1], prev[1]))
            prev = row
            if glass and i % 2 == 0: m.box(ice, c.x, c.y, c.z, 0.6, 0.6, 3.2)                           # glass rail posts
            if i % 4 == 0: m.box(gold, c.x + sd.x * 1.02, c.y + sd.y * 1.02, c.z + 3.0, 0.5, 0.5, 0.4); m.box(gold, c.x - sd.x * 1.02, c.y - sd.y * 1.02, c.z + 3.0, 0.5, 0.5, 0.4)
    for i in range(4): bridge(tops[i], tops[(i + 1) % 4], 10)                                         # the square loop of ice bridges
    ARCH = (4040 * math.sin(math.radians(335.6)), 4040 * math.cos(math.radians(335.6)), 756.0)
    bridge((tops[0][0], tops[0][1], tops[0][2] + 40), ARCH, 12)                                         # skyway from the summit tower to the arch
    # walkway from the south tower down to the ice river + a dock (boat ride needs the thermal gear cosmetic - gate in world-edge-realms.js)
    riv = [q for w in T['water'] if w.get('type') == 'river' for q in w['path_m']]; S = tops[3]   # nearest point on ANY terrain river (the arctic ice river)
    best = min(riv, key=lambda p: (p[0] - S[0]) ** 2 + (p[1] - S[1]) ** 2); dz = (best[0], best[1], T.get('water_level_m', 2) + max(0.0, g(best[0], best[1]) - 2) + 2.5)
    bridge(S, dz, 6); m.cyl(indigo, dz[0], dz[1], dz[2] - 2, 16, 16, 2, 24); m.torus(gold, dz[0], dz[1], dz[2], 16, 0.4, 0, 32, 6)
    o = m.finish('arctic_peaks'); o['dock'] = json.dumps(dz); o['skyway'] = json.dumps(ARCH)
    export(OUT + '/shaddai_arctic_peaks_v01.glb'); print('K36DOCK', json.dumps(dz))

for k in ids: globals()[k]()
print('K37DONE')
