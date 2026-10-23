# tools/k37_landmarks_arctic.py - K37 district landmarks + K36 arctic peak city (owner 2026-10-23), built in code, exported headless:
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python tools/k37_landmarks_arctic.py -- [ids]
# ids: anvil exchange hearth arctic (default all). Writes public/assets/kits/shaddai_landmark_<id>_v01.glb and shaddai_arctic_peaks_v01.glb.
# Landmarks (TURTLE district language): base-centred at the origin, metres, +Z up. Arctic: WORLD coordinates (Blender x east / y north, absolute z),
# so the game places it at the origin; peak positions/heights come from public/assets/terrain (height16.bin) and the Ascension Arch spot.
import bpy, bmesh, math, os, sys, json, struct
from mathutils import Matrix, Vector

REPO = r'C:/Users/Brittany/Shaddai-3d'; OUT = REPO + '/public/assets/kits'
ids = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ids = ids or ['anvil', 'exchange', 'hearth', 'arctic', 'citadel', 'arena', 'park', 'oceanplat']

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
        d = Vector((b[0] - a[0], b[1] - a[1], b[2] - a[2])); L = d.length; n = max(8, int(L / 12)); sd = Vector((-d.y, d.x, 0)).normalized() * w / 2; bm = m.get(WHITE()); prev = None; prevr = None
        sag = min(18, L * 0.04); SPANS.append([list(a), list(b), w, sag])
        for e_, (P0, sgn) in enumerate(((a, 1), (b, -1))):   # lit door frame on the tower where the bridge arrives (owner: doors as you go up)
            if any(math.hypot(P0[0] - q[0], P0[1] - q[1]) < 1 for q in tops) or P0 is b and b == ARCH_PT[0]:
                dd = Vector((d.x, d.y, 0)).normalized() * sgn; fx, fy = P0[0] + dd.x * 15, P0[1] + dd.y * 15; ang = math.atan2(dd.y, dd.x) + math.pi / 2
                for sx in (-1, 1): m.box(gold, fx + math.cos(ang) * sx * 3.2, fy + math.sin(ang) * sx * 3.2, P0[2], 0.8, 0.8, 5.2)
                m.box(gold, fx, fy, P0[2] + 5.2, 7.2, 0.8, 0.8, ang); m.box(ice, fx, fy, P0[2], 5.6, 0.3, 5.0, ang); DOORS.append([fx, fy, P0[2]])
        for i in range(n + 1):
            t = i / n; c = Vector(a) + d * t; c.z -= math.sin(math.pi * t) * sag
            row = (bm.verts.new(c - sd), bm.verts.new(c + sd))
            rb = m.get(ice); rl = (rb.verts.new(c - sd * 1.02), rb.verts.new(c - sd * 1.02 + Vector((0, 0, 1.2))), rb.verts.new(c + sd * 1.02), rb.verts.new(c + sd * 1.02 + Vector((0, 0, 1.2))))
            if prev:
                bm.faces.new((prev[0], row[0], row[1], prev[1]))
                rb.faces.new((prevr[0], rl[0], rl[1], prevr[1])); rb.faces.new((prevr[2], prevr[3], rl[3], rl[2]))   # continuous glass rail walls (owner: bridge edges)
            prev = row; prevr = rl
            if i < n: c2 = Vector(a) + d * ((i + 1) / n); c2.z -= math.sin(math.pi * (i + 1) / n) * sag; mid = (c + c2) / 2; seg = (c2 - c).length
            if i < n: m.box(indigo, mid.x, mid.y, mid.z - 1.15, w * 0.96, seg + 0.05, 1.0, math.atan2(d.y, d.x) - math.pi / 2)            # deck slab thickness
            if i < n:
                for sx in (-1, 1): m.box(cyan_e, mid.x + sd.x * sx * 1.0, mid.y + sd.y * sx * 1.0, mid.z - 0.7, 0.25, seg + 0.05, 0.25, math.atan2(d.y, d.x) - math.pi / 2)   # glowing edge fascia
            if glass and i % 2 == 0: m.box(ice, c.x, c.y, c.z, 0.6, 0.6, 3.2)                           # glass rail posts
            if i % 4 == 0: m.box(gold, c.x + sd.x * 1.02, c.y + sd.y * 1.02, c.z + 3.0, 0.5, 0.5, 0.4); m.box(gold, c.x - sd.x * 1.02, c.y - sd.y * 1.02, c.z + 3.0, 0.5, 0.5, 0.4)
    SPANS = []; DOORS = []; LIFTS = []; cyan_e = mat('ar_edge', 0x5fe8ff, 0.1, 0.3, 3.0)
    ARCH_PT = [(4040 * math.sin(math.radians(335.6)), 4040 * math.cos(math.radians(335.6)), 756.0)]
    for t_ in tops:
        m.cyl(WHITE(), t_[0], t_[1], t_[2] - 1.0, 22, 22, 1.0, 24)                                       # landing deck where the bridges meet each tower
        gz_ = g(t_[0] + 20, t_[1]); m.cyl(GLASS(), t_[0] + 20, t_[1], gz_ - 2, 2.6, 2.6, t_[2] - gz_ + 3, 12); m.torus(cyan_e, t_[0] + 20, t_[1], t_[2] + 1, 2.6, 0.2, 0, 16, 4)   # glass lift ground -> deck
        m.box(WHITE(), t_[0] + 20, t_[1], gz_ - 0.2, 6, 6, 0.4); LIFTS.append([t_[0] + 20, t_[1], gz_, t_[2]])
    m.cyl(WHITE(), tops[0][0], tops[0][1], tops[0][2] + 39, 20, 20, 1.0, 24)                              # skyway balcony on the summit tower
    for i in range(4): bridge(tops[i], tops[(i + 1) % 4], 10)                                         # the square loop of ice bridges
    ARCH = (4040 * math.sin(math.radians(335.6)), 4040 * math.cos(math.radians(335.6)), 756.0)
    bridge((tops[0][0], tops[0][1], tops[0][2] + 40), ARCH, 12)                                         # skyway from the summit tower to the arch
    # walkway from the south tower down to the ice river + a dock (boat ride needs the thermal gear cosmetic - gate in world-edge-realms.js)
    riv = [q for w in T['water'] if w.get('type') == 'river' for q in w['path_m']]; S = tops[3]   # nearest point on ANY terrain river (the arctic ice river)
    best = min(riv, key=lambda p: (p[0] - S[0]) ** 2 + (p[1] - S[1]) ** 2); dz = (best[0], best[1], T.get('water_level_m', 2) + max(0.0, g(best[0], best[1]) - 2) + 2.5)
    bridge(S, dz, 6); m.cyl(indigo, dz[0], dz[1], dz[2] - 2, 16, 16, 2, 24); m.torus(gold, dz[0], dz[1], dz[2], 16, 0.4, 0, 32, 6)
    o = m.finish('arctic_peaks'); o['dock'] = json.dumps(dz); o['skyway'] = json.dumps(ARCH)
    export(OUT + '/shaddai_arctic_peaks_v01.glb'); print('K36DOCK', json.dumps(dz))
    json.dump({'tops': tops, 'spans': SPANS, 'doors': DOORS, 'lifts': LIFTS, 'balcony': [tops[0][0], tops[0][1], tops[0][2] + 40], 'dock': dz}, open(OUT + '/shaddai_arctic_peaks_v01.json', 'w'))

def _terrain():
    T = json.load(open(REPO + '/public/assets/terrain/terrain.json')); raw = open(REPO + '/public/assets/terrain/height16.bin', 'rb').read(); N = int(math.sqrt(len(raw) / 2)); H = T['half_m']
    def g(x, y):
        u = (x + H) * (N - 1) / (2 * H); v = (-y + H) * (N - 1) / (2 * H); i, j = int(u), int(v); fx, fy = u - i, v - j
        s_ = lambda a, b: struct.unpack_from('<H', raw, 2 * (b * N + a))[0]
        t = s_(i, j) + (s_(i + 1, j) - s_(i, j)) * fx; bt = s_(i, j + 1) + (s_(i + 1, j + 1) - s_(i, j + 1)) * fx
        return T['min_m'] + (T['max_m'] - T['min_m']) / 65535 * (t + (bt - t) * fy)
    return T, g

def citadel_v1():   # K38 (first pass, superseded) THE EVIL CITADEL (owner 2026-10-23 ref: giant indigo castle, brain dome, violet-vein cobble causeway, torches, magenta lava).
    # WORLD coordinates, behind the Void Castle on the far side of the Deep Void pit: centre (0, 4250), ~300 m to the dome.
    clear(); m = MB(); T, g = _terrain(); CX, CY = 0.0, 4250.0; Z = max(g(CX + dx, CY + dy) for dx in (-120, 0, 120) for dy in (-120, 0, 120)) - 6
    ind = mat('ct_indigo', 0x1b1640, 0.3, 0.6); stn = mat('ct_stone', 0x262042, 0.2, 0.8); vio = mat('ct_violet', 0x7a3dff, 0.2, 0.3, 4.0)
    mag = mat('ct_magenta', 0xff2bd6, 0.1, 0.4, 3.0); emb = mat('ct_ember', 0xff4a1a, 0.0, 0.5, 6.0); brain = mat('ct_brain', 0x3a2cff, 0.2, 0.4, 2.2)
    m.cyl(stn, CX, CY, Z - 20, 175, 165, 26, 8)
    m.cyl(mag, CX, CY, Z + 5.5, 160, 160, 0.6, 64); m.cyl(stn, CX, CY, Z + 5.6, 132, 132, 1.0, 64)
    for k in range(8):
        a0, a1 = 2 * math.pi * k / 8, 2 * math.pi * (k + 1) / 8; x0, y0, x1, y1 = CX + 120 * math.sin(a0), CY + 120 * math.cos(a0), CX + 120 * math.sin(a1), CY + 120 * math.cos(a1)
        L = math.hypot(x1 - x0, y1 - y0); ang = -math.atan2(x1 - x0, y1 - y0) + math.pi / 2
        m.box(ind, (x0 + x1) / 2, (y0 + y1) / 2, Z + 6, L, 7, 34, ang); m.box(vio, (x0 + x1) / 2, (y0 + y1) / 2, Z + 30, L * 0.9, 7.4, 1.2, ang)
        m.cyl(ind, x0, y0, Z + 6, 15, 13, 90, 12); m.cyl(stn, x0, y0, Z + 96, 16, 0.5, 46, 12)
        for z in range(20, 90, 14): m.cyl(vio, x0, y0, Z + z, 15.4, 15.2, 1.4, 12)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.5; x, y = CX + 48 * math.sin(a), CY + 48 * math.cos(a); h = 150 + 20 * (k % 2)
        m.cyl(ind, x, y, Z + 6, 17, 15, h, 12); m.cyl(stn, x, y, Z + 6 + h, 18, 0.5, 60, 12)
        for z in range(30, int(h), 16): m.box(vio, x + 15.5 * math.sin(a + math.pi), y + 15.5 * math.cos(a + math.pi), Z + z, 3, 3, 6)
    m.cyl(ind, CX, CY, Z + 6, 30, 24, 250, 16); m.cyl(stn, CX, CY, Z + 256, 26, 18, 16, 16)
    for z in range(30, 250, 18):
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4; m.box(vio, CX + 27 * math.sin(a), CY + 27 * math.cos(a), Z + z, 4, 4, 8)
    bm = m.get(brain); vs = []
    for i in range(17):
        th = math.pi * i / 16; row = []
        for j in range(32):
            ph = 2 * math.pi * j / 32; r = 46 * (1 + 0.06 * math.sin(7 * ph + 3 * th) + 0.05 * math.sin(11 * th)) * (0.5 if abs(math.cos(ph)) < 0.06 else 1)
            row.append(bm.verts.new((CX + r * math.sin(th) * math.cos(ph), CY + r * math.sin(th) * math.sin(ph), Z + 300 + 0.8 * r * math.cos(th))))
        vs.append(row)
    for i in range(16):
        for j in range(32): bm.faces.new((vs[i][j], vs[i][(j + 1) % 32], vs[i + 1][(j + 1) % 32], vs[i + 1][j]))
    m.box(emb, CX, CY - 124, Z + 6, 14, 2, 22)
    for k in range(9):
        y = CY - 170 + k * 6; m.box(stn, CX, y, Z + 5, 16, 6.2, 1.2); m.box(vio, CX, y, Z + 6.25, 12, 0.5, 0.08)
    for sx in (-1, 1):
        for k in range(5):
            y = CY - 175 + k * 14; m.cyl(stn, CX + sx * 10, y, Z + 6, 0.8, 1.1, 4, 6); m.cyl(emb, CX + sx * 10, y, Z + 10, 0.9, 0.2, 2.2, 6)
    # VOID GOO (owner 2026-10-24 refs: glowing purple goop / lava, void vibes): violet + magenta lava pools and channels across the Void floor
    import random as _r; R_ = _r.Random(6661); goo = mat('ct_goo', 0x9b2cff, 0.0, 0.2, 5.0); goo2 = mat('ct_goo2', 0xff2bd6, 0.0, 0.2, 4.0)
    for k in range(38):
        a = math.radians(R_.uniform(-20, 20)); r = R_.uniform(2300, 4600); x, y = r * math.sin(a), r * math.cos(a)
        if abs(x) < 70 and 3800 < y < 4200: continue
        rr = R_.uniform(14, 60); z = max(g(x + dx_, y + dy_) for dx_ in (-rr, 0, rr) for dy_ in (-rr, 0, rr)) + 0.8; m.cyl(goo if k % 3 else goo2, x, y, z - 0.2, rr, rr * 0.85, 0.5, 18); m.cyl(stn, x, y, z - 0.6, rr * 1.12, rr * 1.12, 0.5, 18)
    for k in range(6):   # goo channels snaking toward the moat
        x0 = R_.uniform(-900, 900); y0 = R_.uniform(3000, 3600)
        for j in range(30):
            x = x0 + math.sin(j * 0.35 + k) * 40; y = y0 + j * 22; z = max(g(x, y - 12), g(x, y), g(x, y + 12)) + 1.2; m.box(goo2 if k % 2 else goo, x, y, z - 0.2, 9, 24, 0.5, 0.3 * math.sin(j * 0.35 + k))
    # THE WALKWAY: violet-vein causeway from the Void Castle (pit north lip ~ (0, 3890)) up to the keep bridge (0, 4095), torches both sides
    for j in range(36):
        y = 3890 + j * 6; z = max(g(-8, y), g(0, y), g(8, y)) + 1.2; m.box(stn, 0, y, z - 0.6, 16, 6.2, 1.2); m.box(vio, 0, y, z + 0.05, 11, 0.5, 0.08)
        for sx in (-1, 1): m.box(stn, sx * 8.6, y, z - 0.4, 1.2, 6.2, 1.6)
        if j % 3 == 0:
            for sx in (-1, 1): m.cyl(stn, sx * 10, y, z, 0.9, 1.2, 4, 6); m.cyl(emb, sx * 10, y, z + 4, 1.0, 0.2, 2.4, 6)
    m.finish('citadel'); export(OUT + '/shaddai_void_citadel_v01.glb'); print('K38CITADEL', CX, CY, round(Z, 1))

def ann(m, mt, r0, r1, z0, h, seg=72):   # open annulus (tube): outer + inner walls + top/bottom rims, no caps over the middle
    bm = m.get(mt); rows = []
    for (r, z) in ((r1, z0), (r1, z0 + h), (r0, z0 + h), (r0, z0)):
        rows.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)])
    for k in range(4):
        A, B = rows[k], rows[(k + 1) % 4]
        for i in range(seg): bm.faces.new((A[i], A[(i + 1) % seg], B[(i + 1) % seg], B[i]))

def arena():   # K39 NEON SAKURA HOVER ARENA (owner refs image 61-64): wall-ride walls, quarter-pipe bowl, ramps, E/W goal hoops, floating rings, tower + torii.
    clear(); m = MB(); dk = mat('sa_floor', 0x141a26, 0.5, 0.4); wl = mat('sa_wall', 0x2a3142, 0.5, 0.4); cy_ = mat('sa_cyan', 0x22e6ff, 0.1, 0.3, 4.0)
    mg = mat('sa_magenta', 0xff3fb4, 0.1, 0.3, 4.0); tor = mat('sa_torii', 0xd2301e, 0.2, 0.5, 0.6); wh = mat('sa_white', 0xe9edf1, 0.3, 0.35)
    m.cyl(dk, 0, 0, -1, 48, 48, 1.6, 64)
    for k in range(14):
        r0 = 48 + k; z0 = 10 * (k / 14) ** 2; ann(m, dk, r0 - 0.2, r0 + 1.2, -1, z0 + 1)   # quarter-pipe steps (open rings)
    ann(m, wl, 62.4, 66, 0, 16)                                                           # wall-ride wall
    for z, mt in ((5, cy_), (9, mg), (13, cy_)): m.torus(mt, 0, 0, z, 62.5, 0.25, 0, 96, 6)
    for R, mt in ((20, cy_), (34, mg)): m.torus(mt, 0, 0, 0.62, R, 0.35, 0, 72, 6)
    for k in range(8):
        a = 2 * math.pi * k / 8; m.box(cy_ if k % 2 else mg, math.cos(a) * 34, math.sin(a) * 34, 0.6, 28, 0.6, 0.06, a)
    for k in range(6):
        a = 2 * math.pi * k / 6 + math.pi / 6; cx, cy = math.cos(a) * 40, math.sin(a) * 40
        m.box(wh, cx, cy, 0.6, 10, 6, 3.0, a)
    for x, mt in ((52, cy_), (-52, mg)):
        m.cyl(wl, x, 0, 0, 1.4, 1.2, 12, 8); m.torus(mt, x, 0, 19, 7, 0.6, math.pi / 2, 48, 8); m.torus(wh, x, 0, 19, 7.8, 0.3, math.pi / 2, 48, 6)
    for k in range(6):
        a = 2 * math.pi * k / 6; m.torus(cy_ if k % 2 else mg, math.cos(a) * 28, math.sin(a) * 28, 8, 3.2, 0.25, math.pi / 2, 32, 6)
    for r, z, h in ((11, 0.6, 8), (8.5, 8.6, 8), (6, 16.6, 8), (3.5, 24.6, 6)):
        m.cyl(wl, 0, 0, z, r, r * 0.92, h, 16); m.torus(cy_, 0, 0, z + h - 0.3, r * 0.95, 0.2, 0, 32, 4)
    for sx in (-1, 1): m.box(tor, sx * 4.5, -14, 0.6, 1.2, 1.2, 9)
    m.box(tor, 0, -14, 8.2, 12.5, 1.4, 1.0); m.box(tor, 0, -14, 9.6, 14, 1.6, 0.8)
    for k in range(3): ann(m, wl, 66, 66 + 5 * (k + 1), 0, 16 + k * 3 + 3)                   # stepped spectator tiers (open rings)
    m.finish('hover_arena'); export(OUT + '/shaddai_hover_arena_v01.glb')

def park():   # K40 HOVERSKATE PARK (owner 2026-10-23 refs image 58-64: Ironreach / Colosseum Hover-Skate League): high wall-ride walls + stands, a drop-in
    # tower with a glass elevator, the drop ramp into a big bowl, four ELECTRIC launch ramps (glowing coils), speed pads, floating rings, grind rails.
    # Base-centred metres; local -Y = the entrance (the game turns it to face the city centre). Profile mirrored in public/world-hoverpark-k40.js.
    clear(); m = MB()
    fl = mat('pk_floor', 0x10141c, 0.5, 0.35); wl = mat('pk_wall', 0x262c38, 0.6, 0.4); org = mat('pk_orange', 0xff7a1a, 0.1, 0.3, 4.0); cy_ = mat('pk_cyan', 0x22d8ff, 0.1, 0.3, 4.0)
    vio = mat('pk_violet', 0xb44bff, 0.1, 0.3, 3.5); wh = mat('pk_white', 0xe9edf1, 0.3, 0.35); gl = mat('pk_glass', 0x8fd8ff, 0.1, 0.05, 0.3, 0.45); gold = mat('pk_gold', 0xe8c45c, 0.8, 0.3, 0.6)
    m.cyl(fl, 0, 0, -1.2, 150, 150, 1.6, 96)
    for R, mt in ((60, cy_), (100, org), (140, cy_)): m.torus(mt, 0, 0, 0.42, R, 0.3, 0, 96, 6)
    ann(m, wl, 150, 154, 0, 20, 96)                                                                      # wall-ride wall
    for z, mt in ((4, org), (10, cy_), (16, org)): m.torus(mt, 0, 0, z, 149.8, 0.3, 0, 120, 6)
    for k in range(4): ann(m, wl, 154, 159 + k * 5, 0, 20 + (k + 1) * 3, 96)                              # stands
    for k in range(8):                                                                                   # light pylons on the stands
        a = 2 * math.pi * k / 8 + 0.2; x, y = math.cos(a) * 172, math.sin(a) * 172; m.cyl(wl, x, y, 30, 1.2, 0.8, 22, 8); m.box(vio if k % 2 else cy_, x, y, 52, 6, 1, 3, a)
    # big bowl (pool): quarter-pipe 34 -> 48 m up to 8 m, coping, outer apron 48 -> 60 m back to the floor
    for k in range(14): r0 = 34 + k; ann(m, fl, r0 - 0.2, r0 + 1.2, -1, 8 * ((k + 1) / 14) ** 2 + 1, 72)
    for k in range(12): r0 = 48 + k; ann(m, fl, r0 - 0.2, r0 + 1.2, -1, 8 * (1 - k / 12) + 1, 72)
    m.torus(gold, 0, 0, 8.2, 48, 0.5, 0, 96, 6); m.torus(cy_, 0, 0, 0.45, 20, 0.3, 0, 64, 6)
    # drop-in tower (back, +Y) with a glass elevator; drop ramp from the 46 m deck curving down into the bowl
    m.box(wl, 0, 105, 0, 18, 16, 46); m.box(wh, 0, 105, 46, 20, 18, 1.2); m.box(org, 0, 96.2, 40, 16, 0.4, 0.8)
    m.cyl(gl, 13, 105, 0, 3.2, 3.2, 50, 16); m.torus(cy_, 13, 105, 50, 3.2, 0.25, 0, 24, 4); m.box(wh, 13, 105, 0, 7, 7, 0.4)
    for j in range(48):                                                                                  # drop ramp: z = 46 (1-d)^2 from y 97 -> 50
        d0, d1 = j / 48, (j + 1) / 48; y0, y1 = 97 - 47 * d0, 97 - 47 * d1; z0 = 46 * (1 - d0) ** 2
        m.box(fl, 0, (y0 + y1) / 2, -0.6, 10, abs(y1 - y0) + 0.2, z0 + 0.6);
        if j % 4 == 0: m.box(org, -5.2, (y0 + y1) / 2, z0, 0.4, 1.2, 0.4); m.box(cy_, 5.2, (y0 + y1) / 2, z0, 0.4, 1.2, 0.4)
    # four ELECTRIC launch ramps (kicker z = 10 (u/24)^2, 12 m wide) with coil rings + chevrons
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2; ux, uy = math.cos(a), math.sin(a); px, py = -uy, ux; c0 = 88
        for j in range(24):
            u = j + 0.5; z = 10 * (u / 24) ** 2; x, y = ux * (c0 + u), uy * (c0 + u); m.box(fl, x, y, -0.4, 12, 1.15, z + 0.4, a + math.pi / 2)
            if j % 3 == 0: m.box(cy_ if k % 2 else vio, x, y, z + 0.05, 9, 0.35, 0.05, a + math.pi / 2)         # glowing chevrons on the face
        for s_ in (-1, 1):
            for j in range(0, 24, 4):
                u = j + 2; x, y = ux * (c0 + u) + px * s_ * 6.6, uy * (c0 + u) + py * s_ * 6.6; m.torus(org if k % 2 else cy_, x, y, 10 * (u / 24) ** 2 + 1.0, 1.2, 0.18, math.pi / 2, 16, 4)
    for k in range(8): a = 2 * math.pi * k / 8 + math.pi / 8; m.cyl(org if k % 2 else cy_, math.cos(a) * 75, math.sin(a) * 75, 0.4, 4, 4, 0.12, 24)   # speed pads
    for k in range(6): a = 2 * math.pi * k / 6; m.torus(vio if k % 2 else cy_, math.cos(a) * 122, math.sin(a) * 122, 16, 6, 0.4, math.pi / 2, 32, 6)  # floating rings
    for s_ in (-1, 1): m.box(gold, s_ * 70, -20, 1.0, 0.5, 34, 0.5); m.box(wl, s_ * 70, -36, 0, 0.6, 0.6, 1); m.box(wl, s_ * 70, -4, 0, 0.6, 0.6, 1)   # grind rails
    m.box(wh, 0, -150, 0, 26, 6, 1.0); m.box(org, 0, -150, 12, 24, 1.2, 1.2); [m.box(wl, sx * 12, -150, 0, 2, 2, 13) for sx in (-1, 1)]       # entrance gate
    m.finish('hover_park'); export(OUT + '/shaddai_hover_park_v01.glb')

def oceanplat():   # Crystal Sea town platform in the REEF language (owner: "make the platform a water platform same aesthetic"): white clearcoat ring deck,
    # wooden inlay, gold rail, glass band, pods on the rim, piers; plus the glass bridge to Reef B. WORLD coordinates (Blender metres).
    clear(); m = MB(); wh = mat('op_white', 0xf4f7fa, 0.1, 0.3); wood = mat('op_wood', 0xa7774a, 0.0, 0.8); gold = mat('op_gold', 0xd4b46a, 1.0, 0.25, 0.3); gl = mat('op_glass', 0x9fd8e8, 0.1, 0.04, 0.2, 0.35); cy_ = mat('op_cyan', 0x4fe3ff, 0.1, 0.3, 3.0)
    T = json.load(open(REPO + '/public/assets/world/realm-towns-v2.json'))['towns']; t = next(x for x in T if x['realm'] == 'ocean'); cx, cy, Y = t['c'][0], -t['c'][1], 3.2
    m.cyl(wood, cx, cy, Y - 1.4, 146, 146, 1.4, 96); m.cyl(wh, cx, cy, Y - 3.0, 150, 147, 1.8, 96)
    ann(m, wh, 146, 156, Y - 1.4, 1.6, 96)
    for i in range(96): pass
    bm = None
    m.torus(gold, cx, cy, Y + 1.1, 156, 0.18, 0, 128, 6); m.torus(cy_, cx, cy, Y - 0.2, 157, 0.35, 0, 128, 6)
    for k in range(12):                                                                                  # pier piles + rim pods (reef pods)
        a = 2 * math.pi * k / 12; x, y = cx + math.cos(a) * 151, cy + math.sin(a) * 151; m.cyl(wl_ := mat('op_pile', 0x3a3f46, 0.2, 0.6), x, y, -6, 0.9, 0.9, Y + 4, 8)
        if k % 3 == 0: m.dome(wh, cx + math.cos(a) * 168, cy + math.sin(a) * 168, Y - 0.5, 9); m.torus(gl, cx + math.cos(a) * 168, cy + math.sin(a) * 168, Y + 1.5, 9.2, 0.6, 0, 32, 6)
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8; ux, uy = math.sin(a), math.cos(a)
        m.box(wood, cx + ux * 182, cy + uy * 182, Y - 1.4, 8, 60, 1.2, -a)
    # glass bridge to Reef B (deck 4 m over the water, glass rails, cyan glow)
    B = (-2714.5, -2774.8); d = Vector((B[0] - cx, B[1] - cy, 0)); L = d.length; dn = d.normalized(); A0 = Vector((cx, cy, 0)) + dn * 156; A1 = Vector(B + (0,)) - dn * 70
    sd = Vector((-dn.y, dn.x, 0)) * 4; n = int((A1 - A0).length / 10); bmw = m.get(wh); bmg = m.get(gl); prev = None
    for i in range(n + 1):
        c = A0.lerp(A1, i / n); c.z = Y + 0.8 + math.sin(math.pi * i / n) * 6
        row = (bmw.verts.new(c - sd), bmw.verts.new(c + sd)); rg = (bmg.verts.new(c - sd), bmg.verts.new(c - sd + Vector((0, 0, 1.2))), bmg.verts.new(c + sd), bmg.verts.new(c + sd + Vector((0, 0, 1.2))))
        if prev: bmw.faces.new((prev[0][0], row[0], row[1], prev[0][1])); bmg.faces.new((prev[1][0], rg[0], rg[1], prev[1][1])); bmg.faces.new((prev[1][2], prev[1][3], rg[3], rg[2]))
        if i % 3 == 0: m.cyl(mat('op_pile', 0x3a3f46, 0.2, 0.6), c.x, c.y, -6, 0.7, 0.7, c.z + 6, 8); m.box(cy_, c.x, c.y, c.z + 0.02, 6, 0.4, 0.05, math.atan2(dn.y, dn.x))
        prev = (row, rg)
    m.finish('ocean_platform'); export(OUT + '/shaddai_ocean_platform_v01.glb')

def citadel():   # K38b THE EVIL CITADEL, huge (owner 2026-10-23: "needs to be huge and sections of it taking the whole back area with insides and a dungeon
    # that has an underground castle and one dragon next to the entrance"). WORLD coordinates, Void realm back area (compass ~344-16, r 4050-4650).
    # Great keep (~420 m to the brain dome) at (0, 4300), fortress sections W/E at (+-850, 4250), curtain walls + towers across the back,
    # magenta lava moat along the front, violet-vein bridges + torches to the gates, and the DUNGEON STAIR down from the keep's forecourt.
    # Writes shaddai_void_citadel_v01.json (gates, dungeon stair, dragon spot, colliders) for the game.
    clear(); m = MB(); T, g = _terrain()
    ind = mat('ct_indigo', 0x1b1640, 0.3, 0.6); stn = mat('ct_stone', 0x262042, 0.2, 0.8); vio = mat('ct_violet', 0x7a3dff, 0.2, 0.3, 4.0)
    mag = mat('ct_magenta', 0xff2bd6, 0.1, 0.4, 3.0); emb = mat('ct_ember', 0xff4a1a, 0.0, 0.5, 6.0); brain = mat('ct_brain', 0x3a2cff, 0.2, 0.4, 2.2); blk = mat('ct_black', 0x07060c, 0.0, 0.9)
    def base_z(cx, cy, R): return max(g(cx + dx, cy + dy) for dx in (-R, 0, R) for dy in (-R, 0, R)) - 6
    def tower(x, y, z, r, h, spire=True, bands=14):
        m.cyl(ind, x, y, z, r, r * 0.88, h, 12)
        if spire: m.cyl(stn, x, y, z + h, r * 1.08, 0.5, h * 0.45, 12)
        for zz in range(int(bands), int(h), int(bands)): m.cyl(vio, x, y, z + zz, r * 1.02, r * 0.99, 1.4, 12)
    def wall(x0, y0, x1, y1, z, h, t=9):
        L = math.hypot(x1 - x0, y1 - y0); a = math.atan2(y1 - y0, x1 - x0)
        m.box(ind, (x0 + x1) / 2, (y0 + y1) / 2, z, L, t, h, a); m.box(vio, (x0 + x1) / 2, (y0 + y1) / 2, z + h * 0.82, L * 0.96, t + 0.4, 1.4, a)
        for k in range(int(L / 9)): m.box(stn, x0 + (x1 - x0) * (k + 0.5) / int(L / 9), y0 + (y1 - y0) * (k + 0.5) / int(L / 9), z + h, 4, t, 3, a)   # crenellations
    COL = []
    # GREAT KEEP
    KX, KY = 0.0, 4300.0; KZ = base_z(KX, KY, 160)
    m.cyl(stn, KX, KY, KZ - 30, 200, 185, 36, 8); m.cyl(mag, KX, KY, KZ + 5.5, 190, 190, 0.6, 72); m.cyl(stn, KX, KY, KZ + 5.6, 160, 160, 1.0, 72)
    for k in range(8):
        a0, a1 = 2 * math.pi * k / 8, 2 * math.pi * (k + 1) / 8
        wall(KX + 150 * math.sin(a0), KY + 150 * math.cos(a0), KX + 150 * math.sin(a1), KY + 150 * math.cos(a1), KZ + 6, 44)
        tower(KX + 150 * math.sin(a0), KY + 150 * math.cos(a0), KZ + 6, 18, 120)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.5; tower(KX + 62 * math.sin(a), KY + 62 * math.cos(a), KZ + 6, 22, 210 + 25 * (k % 2))
    m.cyl(ind, KX, KY, KZ + 6, 40, 32, 360, 16); m.cyl(stn, KX, KY, KZ + 366, 34, 24, 20, 16)
    for zz in range(30, 360, 20):
        for k in range(4): a = k * math.pi / 2 + math.pi / 4; m.box(vio, KX + 37 * math.sin(a), KY + 37 * math.cos(a), KZ + zz, 5, 5, 9)
    bm = m.get(brain); vs = []
    for i in range(17):
        th = math.pi * i / 16; row = []
        for j in range(32):
            ph = 2 * math.pi * j / 32; r = 60 * (1 + 0.06 * math.sin(7 * ph + 3 * th) + 0.05 * math.sin(11 * th)) * (0.5 if abs(math.cos(ph)) < 0.06 else 1)
            row.append(bm.verts.new((KX + r * math.sin(th) * math.cos(ph), KY + r * math.sin(th) * math.sin(ph), KZ + 420 + 0.8 * r * math.cos(th))))
        vs.append(row)
    for i in range(16):
        for j in range(32): bm.faces.new((vs[i][j], vs[i][(j + 1) % 32], vs[i + 1][(j + 1) % 32], vs[i + 1][j]))
    COL.append([KX, KY, 150])
    # KEEP GATE (south) + bridge over the moat + torches; DUNGEON STAIR in the forecourt (west of the bridge foot)
    GY = KY - 152; m.box(emb, KX, GY, KZ + 6, 20, 2, 30); m.box(stn, KX, GY, KZ + 36, 30, 6, 6)
    for k in range(10): y = KY - 205 + k * 6; m.box(stn, KX, y, KZ + 5, 20, 6.2, 1.2); m.box(vio, KX, y, KZ + 6.25, 15, 0.5, 0.08)
    for sx in (-1, 1):
        for k in range(6): y = KY - 210 + k * 12; m.cyl(stn, KX + sx * 12, y, KZ + 6, 0.9, 1.2, 4, 6); m.cyl(emb, KX + sx * 12, y, KZ + 10, 1.0, 0.2, 2.4, 6)
    DX, DY = KX - 60, KY - 235; DZ = g(DX, DY)
    m.box(stn, DX, DY, DZ - 0.5, 22, 30, 1.0); m.box(blk, DX, DY + 2, DZ - 0.4, 12, 18, 0.5)
    for k in range(10): m.box(stn, DX, DY - 8 + k * 2, DZ - 0.6 - k * 1.2, 12, 2, 0.6)                  # stair down into the dark
    for sx in (-1, 1): m.box(stn, DX + sx * 8, DY, DZ, 2, 26, 8); m.cyl(emb, DX + sx * 8, DY - 12, DZ + 8, 1.0, 0.2, 2.4, 6)
    m.box(stn, DX, DY - 12, DZ + 8, 18, 3, 3); m.box(vio, DX, DY - 13.6, DZ + 9.5, 14, 0.3, 1.0)
    # FORTRESS SECTIONS W/E + the curtain wall across the whole back area
    for sx in (-1, 1):
        FX, FY = sx * 850.0, 4250.0; FZ = base_z(FX, FY, 110)
        m.cyl(stn, FX, FY, FZ - 24, 130, 118, 30, 8); m.cyl(mag, FX, FY, FZ + 5.5, 124, 124, 0.6, 64)
        for k in range(6):
            a0, a1 = 2 * math.pi * k / 6, 2 * math.pi * (k + 1) / 6
            wall(FX + 95 * math.sin(a0), FY + 95 * math.cos(a0), FX + 95 * math.sin(a1), FY + 95 * math.cos(a1), FZ + 6, 36); tower(FX + 95 * math.sin(a0), FY + 95 * math.cos(a0), FZ + 6, 15, 95)
        tower(FX, FY, FZ + 6, 30, 230); tower(FX + 36, FY + 20, FZ + 6, 16, 160); tower(FX - 30, FY + 26, FZ + 6, 14, 140)
        m.box(emb, FX, FY - 97, FZ + 6, 14, 2, 22); COL.append([FX, FY, 98])
    pts = [(-1350, 4380), (-850 - 110, 4300), (-150, 4460), (150, 4460), (850 + 110, 4300), (1350, 4380)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        z = min(g(x0, y0), g(x1, y1)); wall(x0, y0, x1, y1, z - 2, 60, 12)
        n = int(math.hypot(x1 - x0, y1 - y0) / 150)
        for k in range(n + 1): tower(x0 + (x1 - x0) * k / max(1, n), y0 + (y1 - y0) * k / max(1, n), z - 2, 14, 90)
    for x0 in (-1350, 1350): tower(x0, 4380, g(x0, 4380) - 2, 26, 170)
    # VOID GOO (owner 2026-10-24 refs: glowing purple goop / lava, void vibes): violet + magenta lava pools and channels across the Void floor
    import random as _r; R_ = _r.Random(6661); goo = mat('ct_goo', 0x9b2cff, 0.0, 0.2, 5.0); goo2 = mat('ct_goo2', 0xff2bd6, 0.0, 0.2, 4.0)
    for k in range(38):
        a = math.radians(R_.uniform(-20, 20)); r = R_.uniform(2300, 4600); x, y = r * math.sin(a), r * math.cos(a)
        if abs(x) < 70 and 3800 < y < 4200: continue
        rr = R_.uniform(14, 60); z = max(g(x + dx_, y + dy_) for dx_ in (-rr, 0, rr) for dy_ in (-rr, 0, rr)) + 0.8; m.cyl(goo if k % 3 else goo2, x, y, z - 0.2, rr, rr * 0.85, 0.5, 18); m.cyl(stn, x, y, z - 0.6, rr * 1.12, rr * 1.12, 0.5, 18)
    for k in range(6):   # goo channels snaking toward the moat
        x0 = R_.uniform(-900, 900); y0 = R_.uniform(3000, 3600)
        for j in range(30):
            x = x0 + math.sin(j * 0.35 + k) * 40; y = y0 + j * 22; z = max(g(x, y - 12), g(x, y), g(x, y + 12)) + 1.2; m.box(goo2 if k % 2 else goo, x, y, z - 0.2, 9, 24, 0.5, 0.3 * math.sin(j * 0.35 + k))
    # THE WALKWAY: violet-vein causeway from the Void Castle (pit north lip ~ (0, 3890)) up to the keep bridge (0, 4095), torches both sides
    for j in range(36):
        y = 3890 + j * 6; z = max(g(-8, y), g(0, y), g(8, y)) + 1.2; m.box(stn, 0, y, z - 0.6, 16, 6.2, 1.2); m.box(vio, 0, y, z + 0.05, 11, 0.5, 0.08)
        for sx in (-1, 1): m.box(stn, sx * 8.6, y, z - 0.4, 1.2, 6.2, 1.6)
        if j % 3 == 0:
            for sx in (-1, 1): m.cyl(stn, sx * 10, y, z, 0.9, 1.2, 4, 6); m.cyl(emb, sx * 10, y, z + 4, 1.0, 0.2, 2.4, 6)
    m.finish('citadel'); export(OUT + '/shaddai_void_citadel_v01.glb')
    json.dump({'keep_gate': [KX, GY - 4, KZ + 6], 'dungeon': [DX, DY - 10, DZ], 'secret_stop': [DX + 14, DY - 4, DZ - 12], 'dragon': [KX + 70, KY - 250], 'colliders': COL,
               'fort_gates': [[sx * 850.0, 4250.0 - 99, 0] for sx in (-1, 1)]}, open(OUT + '/shaddai_void_citadel_v01.json', 'w'))
    print('K38BCITADEL keep z', round(KZ, 1))

for k in ids: globals()[k]()
print('K37DONE')
