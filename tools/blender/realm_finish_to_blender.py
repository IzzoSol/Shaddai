# tools/blender/realm_finish_to_blender.py - mirror the 2026-10-23 realm finish pass into the owner's REALM_VIEW scene.
# Run in the open Blender via:  python tools/_bl.py tools/blender/realm_finish_to_blender.py
# ADDITIVE ONLY (owner rule: don't lose our edits): saves a backup copy first, builds everything in a new FINISH_20261023 collection,
# and only HIDES (never deletes) the old flat city_rivers object it replaces.
#   roads   <- public/assets/world/realm-roads-v1.json  (Blender metres, x east / y north)
#   spur    <- same file, spurs[]
#   towns   <- public/assets/world/realm-towns-v2.json  (game metres, z south -> Blender y = -z)
#   rivers  <- public/assets/world/city-zones-v1.json   (rebuilt as one joined ribbon per river, mitred at bends, draped on the terrain)
import bpy, bmesh, json, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

REPO = r'C:/Users/Brittany/Shaddai-3d'
W = lambda p: os.path.join(REPO, 'public/assets/world', p)
SC = bpy.data.scenes['REALM_VIEW']
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(REPO, 'docs/blender/realm-view-20261023-before-finish.blend'), copy=True)

def coll(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name); SC.collection.children.link(c)
    for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)   # only ever clears its OWN previous run
    return c
FIN = coll('FINISH_20261023')

T = bpy.data.objects['realm_terrain']
dg = bpy.context.evaluated_depsgraph_get(); te = T.evaluated_get(dg); tm = te.to_mesh()
bvh = BVHTree.FromPolygons([T.matrix_world @ v.co for v in tm.vertices], [p.vertices[:] for p in tm.polygons]); te.to_mesh_clear()
def ground(x, y):
    hit = bvh.ray_cast(Vector((x, y, 3000.0)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else 0.0

ZONES = json.load(open(W('city-zones-v1.json')))
TERR = json.load(open(os.path.join(REPO, 'public/assets/terrain/terrain.json')))
OCEAN = next(r for r in TERR['realms'] if r['id'] == 'ocean'); WL = float(TERR.get('water_level_m', 2))
RIV = [rv.get('points', rv) if isinstance(rv, dict) else rv for rv in ZONES['rivers']]
def water(x, y):   # water surface z or None (the Crystal Sea sector, or within a river's half width)
    c = (math.degrees(math.atan2(x, y)) + 360) % 360
    if OCEAN['c0'] <= c <= OCEAN['c1'] and math.hypot(x, y) >= OCEAN['r0_m']: return WL
    hw = ZONES.get('riverWidth_m', 22) / 2
    for line in RIV:
        for a, b in zip(line, line[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy or 1; t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2))
            if math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) <= hw: return ground(x, y) + 1.4
    return None

def mat(name, rgb, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value = (*rgb, 1)
    if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*rgb, 1); return m
def srgb(h): return tuple(((h >> s & 255) / 255.0) ** 2.2 for s in (16, 8, 0))
def obj(name, bm, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); FIN.objects.link(o); return o
def sides(P):
    out = []
    for i in range(len(P)):
        a, b = P[max(0, i - 1)], P[min(len(P) - 1, i + 1)]; dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1; out.append((-dy / l, dx / l))
    return out

# ---- ROADS: 11 m deck, 3 samples across, bridges at water + 3.5 m with a 1:12 ramp; accent edge strips ----
RD = json.load(open(W('realm-roads-v1.json'))); RW = RD['width_m']
ACC = dict(void=0x9a40ff, desert=0xffc94a, volcano=0xff6b35, suburb=0xc9a227, meadow=0x9be15d, ocean=0x00c2ff, darkforest=0x5fe0b0, arctic=0x9fe8ff, forest=0x7dff9a)
m_deck = mat('fin_road_deck', srgb(0x161c26))
for R in RD['roads']:
    P = R['pts']; n = len(P); S = sides(P); wet = [water(*p) for p in P]
    zc = [max(ground(*p) + 0.45, w + 3.5) if w is not None else -1e9 for p, w in zip(P, wet)]
    for i in range(n):
        if wet[i] is None: continue
        for k in range(1, 12):
            lim = zc[i] - k * 10 / 12
            for j in (i - k, i + k):
                if 0 <= j < n and wet[j] is None: zc[j] = max(zc[j], lim)
    bm = bmesh.new(); rows = []
    for i, p in enumerate(P):
        row = []
        for t in (-1, 0, 1):
            x, y = p[0] + S[i][0] * t * RW / 2, p[1] + S[i][1] * t * RW / 2
            z = zc[i] if wet[i] is not None else max(zc[i], ground(x, y) + 0.45)
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for i in range(n - 1):
        for s in range(2): bm.faces.new((rows[i][s], rows[i + 1][s], rows[i + 1][s + 1], rows[i][s + 1]))
    rowc = [[v.co.copy() for v in row] for row in rows]
    obj('road_' + R['id'], bm, [m_deck])
    bm = bmesh.new(); ms = mat('fin_road_glow_' + R['realm'], srgb(ACC.get(R['realm'], 0x8ffff0)), 4.0)
    for sd in (-1, 1):
        prev = None
        for i, p in enumerate(P):
            a = [rowc[i][0 if sd < 0 else 2].copy()]; inn = rowc[i][1].lerp(a[0], 1 - 0.6 / (RW / 2))
            v0 = bm.verts.new(a[0] + Vector((0, 0, 0.06))); v1 = bm.verts.new(inn + Vector((0, 0, 0.06)))
            if prev: bm.faces.new((prev[0], v0, v1, prev[1]))
            prev = (v0, v1)
    obj('road_glow_' + R['id'], bm, [ms])

# ---- SKYLINE SPUR: white viaduct deck 8 m wide, 9 m clear, pylons every ~24 m, stop pads ----
m_white, m_gold = mat('fin_maglev_white', srgb(0xeef2f6)), mat('fin_maglev_gold', srgb(0xc9a227))
for S_ in RD['spurs']:
    P = S_['pts']; n = len(P); SD = sides(P); zs = []
    for p in P:
        w = water(*p); zs.append(max(ground(*p), w if w is not None else -1e9) + S_['deckH_m'])
    for _ in range(3):
        for i in range(1, n - 1): zs[i] = max(zs[i], (zs[i - 1] + zs[i + 1]) / 2 - 0.5)
    bm = bmesh.new(); top = []; bot = []
    for i, p in enumerate(P):
        l = (p[0] - SD[i][0] * 4, p[1] - SD[i][1] * 4); r = (p[0] + SD[i][0] * 4, p[1] + SD[i][1] * 4)
        top.append((bm.verts.new((*l, zs[i])), bm.verts.new((*r, zs[i])))); bot.append((bm.verts.new((*l, zs[i] - 1.4)), bm.verts.new((*r, zs[i] - 1.4))))
    for i in range(n - 1):
        bm.faces.new((top[i][0], top[i][1], top[i + 1][1], top[i + 1][0])); bm.faces.new((bot[i][0], bot[i + 1][0], bot[i + 1][1], bot[i][1]))
        bm.faces.new((top[i][0], top[i + 1][0], bot[i + 1][0], bot[i][0])); bm.faces.new((top[i][1], bot[i][1], bot[i + 1][1], top[i + 1][1]))
    for i in range(0, n, 2):
        g = ground(*P[i]); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=1.5, radius2=1.5, depth=zs[i] - 1.4 - g + 2,
                                                 matrix=__import__('mathutils').Matrix.Translation((P[i][0], P[i][1], (zs[i] - 1.4 + g - 2) / 2)))
    obj('skyline_spur', bm, [m_white])
    for st in S_['stops']:
        bm = bmesh.new(); x, y = st['at']; bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=14, radius2=14, depth=0.8, matrix=__import__('mathutils').Matrix.Translation((x, y, ground(x, y) + 0.4)))
        obj('stop_' + st['id'], bm, [m_gold if st.get('sealed') else m_white])

# ---- TOWNS: collection instances of the realm kits (P_ libraries already in the file), scaled to TURTLE heights ----
TW = json.load(open(W('realm-towns-v2.json'))); rawH = {}
def raw_h(cn):
    if cn in rawH: return rawH[cn]
    c = bpy.data.collections.get(cn); zmin, zmax = 1e9, -1e9
    for o in (c.all_objects if c else []):
        if o.type == 'MESH':
            for v in o.bound_box: z = (o.matrix_world @ Vector(v)).z; zmin, zmax = min(zmin, z), max(zmax, z)
    rawH[cn] = max(1e-3, zmax - zmin) if c else None; return rawH[cn]
missing = set(); placed = 0
for t in TW['towns']:
    cx, cy = t['c'][0], -t['c'][1]; fz = (WL + 1.2) if water(cx, cy) is not None else None
    if fz is not None:
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=150, radius2=160, depth=2.4, matrix=__import__('mathutils').Matrix.Translation((cx, cy, fz - 1.2)))
        obj('deck_' + t['id'], bm, [m_white])
    for k, it in enumerate(t['items']):
        cn = 'P_' + it['file'].split('/')[-1]; h = raw_h(cn)
        if h is None: missing.add(cn); continue
        x, y = cx + it['x'], cy - it['z']; z = max(ground(x, y), fz) if fz is not None else ground(x, y)
        e = bpy.data.objects.new('%s_%02d' % (t['id'], k), None); e.instance_type = 'COLLECTION'; e.instance_collection = bpy.data.collections[cn]
        e.location = (x, y, z); e.rotation_euler = (0, 0, math.radians(it['yaw'])); e.scale = (it['h'] / h,) * 3; FIN.objects.link(e); placed += 1

# ---- RIVERS v2: one continuous ribbon per river, mitred joints, 3 across, +1.4 m over the ground ----
m_riv = bpy.data.materials.get('fin_river') or mat('fin_river', srgb(0x1aa0c8), 0.6)
hw = ZONES.get('riverWidth_m', 22) / 2
def _near(p, L):
    for a, b in zip(L, L[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dy * dy or 1; t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
        if math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t) < 18: return True
    return False
RUNS = []; KEPT = []   # same de-dupe as world-rivers.js: strokes retracing an earlier one within 18 m are skipped
for line in RIV:
    cur = []
    for p in line:
        if any(_near(p, K) for K in KEPT):
            if len(cur) > 1: RUNS.append(cur)
            cur = []
        else: cur.append(p)
    if len(cur) > 1: RUNS.append(cur)
    KEPT.append(line)
for ri, line in enumerate(RUNS):
    P = [p for i, p in enumerate(line) if i == 0 or math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) > 0.5]
    closed = math.hypot(P[0][0] - P[-1][0], P[0][1] - P[-1][1]) < 1.0
    if closed: P = P[:-1]
    D = []   # densify to <= 8 m so the ribbon drapes
    for i in range(len(P) - (0 if closed else 1)):
        a, b = P[i], P[(i + 1) % len(P)]; m = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 8))
        for k in range(m): D.append((a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m))
    if not closed: D.append(P[-1])
    n = len(D); bm = bmesh.new(); rows = []
    for i in range(n):
        a, b = D[(i - 1) % n if closed else max(0, i - 1)], D[(i + 1) % n if closed else min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1; sx, sy = -dy / l, dx / l
        rows.append([bm.verts.new((D[i][0] + sx * t * hw, D[i][1] + sy * t * hw, ground(D[i][0] + sx * t * hw, D[i][1] + sy * t * hw) + 1.4)) for t in (-1, 0, 1)])
    for i in range(n - (0 if closed else 1)):
        j = (i + 1) % n
        for s in range(2): bm.faces.new((rows[i][s], rows[j][s], rows[j][s + 1], rows[i][s + 1]))
    obj('river_v2_%d' % ri, bm, [m_riv])
# ---- SKY CLUSTER RE-LAYOUT (owner 2026-10-23 + TURTLE; same numbers as world-edge-realms.js REALMS). The Ascension Arch is NOT touched. ----
SKY = [('harbor', 97, 5060, 40), ('skycity', 97, 6400, 100), ('veil', 90.36, 6443, 100), ('rise', 108.02, 6520, 100)]
for sid, deg, r, y in SKY:
    o = bpy.data.objects.get('shaddai_edge_' + sid)
    if o: o.location = (r * math.sin(math.radians(deg)), r * math.cos(math.radians(deg)), y); o.rotation_euler = (0, 0, -math.radians(97))
bpy.context.view_layer.update()
def lw(name, bx, by, bz):
    o = bpy.data.objects.get(name); return (o.matrix_world @ Vector((bx, by, bz))) if o else None
BR = [('shaddai_suburb_star', 0, 340, 18, 'shaddai_edge_harbor', 0, 8, 0, 30), ('shaddai_edge_harbor', 0, 1110, 0, 'shaddai_edge_skycity', 0, 8, 0, 30),
      ('shaddai_edge_skycity', -322, 480, 0, 'shaddai_edge_veil', 255, 400, 0, 20), ('shaddai_edge_skycity', 322, 480, 0, 'shaddai_edge_rise', -755, 520, 0, 20)]
bm = bmesh.new()
for a, ax, ay, az, b, bx, by_, bz, wd in BR:
    p0, p1 = lw(a, ax, ay, az), lw(b, bx, by_, bz)
    if not (p0 and p1): continue
    d = p1 - p0; sd = Vector((-d.y, d.x, 0)).normalized() * wd / 2; arch = min(25, d.length * 0.06); prev = None
    for i in range(41):
        t = i / 40; c = p0.lerp(p1, t) + Vector((0, 0, math.sin(math.pi * t) * arch)); row = (bm.verts.new(c - sd), bm.verts.new(c + sd))
        if prev: bm.faces.new((prev[0], row[0], row[1], prev[1]))
        prev = row
obj('sky_bridges_v2', bm, [m_white])
old_br = bpy.data.objects.get('sky_bridges')
if old_br: old_br.hide_set(True)

# ---- MAGLEV RING + SPOKES + STATIONS (same numbers as world-transit.js: ring 2828.6 m, deck 9 m over the highest ground under it, 10 m wide;
# a straight spoke from each city-edge hub (1622 m) out to every ring station; Central Station's spoke starts at the station) ----
RING = 11000 / (7 / 1.8); HUB = 6222.22 / (7 / 1.8) + 12
gmax = max(ground(RING * math.sin(a), RING * math.cos(a)) for a in [k * math.pi / 180 for k in range(0, 360, 2)])
DY = gmax + 9; m_glow = mat('fin_maglev_rail', srgb(0x5fe0ff), 3.0)
bm = bmesh.new(); NA = 360; rows = []
for k in range(NA):
    a = 2 * math.pi * k / NA; ca, sa = math.sin(a), math.cos(a)
    rows.append([bm.verts.new(((RING + d) * ca, (RING + d) * sa, z)) for d, z in ((-5, DY), (5, DY), (5, DY - 1.4), (-5, DY - 1.4))])
for k in range(NA):
    A_, B_ = rows[k], rows[(k + 1) % NA]
    for s in range(4): bm.faces.new((A_[s], B_[s], B_[(s + 1) % 4], A_[(s + 1) % 4]))
for k in range(0, NA, 1):   # pylons every 1 degree (~49 m)
    a = 2 * math.pi * k / NA; x, y = RING * math.sin(a), RING * math.cos(a); g = ground(x, y)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=1.6, radius2=1.6, depth=DY - g, matrix=Matrix.Translation((x, y, (DY + g) / 2 - 0.7)))
STN = [(s['id'], s['xy_m']) for s in TERR.get('stations', [])]
for sid, (sx, sy) in STN:
    r = math.hypot(sx, sy); ux, uy = sx / r, sy / r; r0 = HUB if r > 2000 else r
    if r - r0 > 40:
        a0, a1 = (ux * r0, uy * r0), (ux * (r - 5), uy * (r - 5)); px, py = -uy, ux
        v = [bm.verts.new((a0[0] + px * w, a0[1] + py * w, DY)) for w in (-5, 5)] + [bm.verts.new((a1[0] + px * w, a1[1] + py * w, DY)) for w in (5, -5)]
        bm.faces.new(v)
        for k in range(int((r - r0) / 49)):
            x, y = ux * (r0 + k * 49), uy * (r0 + k * 49)
            for w in (-7, 7):
                g = ground(x + px * w, y + py * w); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=1.3, radius2=1.3, depth=DY - g, matrix=Matrix.Translation((x + px * w, y + py * w, (DY + g) / 2 - 0.7)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=20, radius2=20, depth=2, matrix=Matrix.Translation((sx, sy, DY + 0.5)))   # 40 m platform
obj('maglev_ring_spokes', bm, [m_white])
bm = bmesh.new()
for off in (-3, 3):
    prev = None
    for k in range(NA + 1):
        a = 2 * math.pi * (k % NA) / NA; v = bm.verts.new(((RING + off) * math.sin(a), (RING + off) * math.cos(a), DY + 0.3))
        if prev: bm.edges.new((prev, v))
        prev = v
obj('maglev_rails_glow', bm, [m_glow])

# ---- BIOME SCATTER: one merged mesh per species (same shapes as world-biome-scatter.js, metres, origin at the ground) ----
from mathutils import Matrix
def cone(bm, r1, r2, d, z, seg=7, x=0, y=0):
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=d, matrix=Matrix.Translation((x, y, z)))
def ico(bm, r, x, y, z, sx=1, sy=1, sz=1):
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r, matrix=Matrix.Translation((x, y, z)) @ Matrix.Diagonal((sx, sy, sz, 1)))
PROTO = {
    'pine':     (lambda bm: [cone(bm, .5, .35, 4, 2, 6), cone(bm, 3.6, 0, 6, 6), cone(bm, 2.8, 0, 5, 9.5), cone(bm, 1.8, 0, 4, 12.5)], 0x245633),
    'snowpine': (lambda bm: [cone(bm, .5, .35, 4, 2, 6), cone(bm, 3.4, 0, 6, 6), cone(bm, 2.6, 0, 5, 9.5), cone(bm, 1.7, 0, 4, 12.5)], 0xdfeaf2),
    'broad':    (lambda bm: [cone(bm, .6, .4, 5, 2.5, 6), ico(bm, 3.8, 0, 0, 7.5), ico(bm, 2.6, 1.8, -.8, 9), ico(bm, 2.4, -1.6, 1, 8.6)], 0x3d7a34),
    'shrub':    (lambda bm: [ico(bm, 1.1, 0, 0, .7), ico(bm, .8, .7, -.3, .6)], 0x6b7a3a),
    'hoodoo':   (lambda bm: [cone(bm, 3.2, 2.2, 6, 3), cone(bm, 2.2, 1.6, 5, 8.5), cone(bm, 1.5, 2.6, 1.6, 11.8)], 0xc98a4c),
    'crystal':  (lambda bm: [cone(bm, .9, 0, 6, 3, 6), cone(bm, .6, 0, 4, 1.8, 6, .9, -.2), cone(bm, .5, 0, 3, 1.4, 6, -.8, .3)], 0x8fe6ff),
    'boulder':  (lambda bm: [ico(bm, 2.2, 0, 0, 1, 1.3, 1, .75), ico(bm, 1.2, 1.9, -.8, .6)], 0x6e6a66),
    'lavarock': (lambda bm: [ico(bm, 2.0, 0, 0, 1, 1.2, 1.1, .8)], 0x2a1a14),
    'arch':     (lambda bm: [cone(bm, 14, 11, 6, 0, 8, 46, 0), cone(bm, 14, 11, 6, 0, 8, -46, 0)] + [ico(bm, 9, 46 * math.cos(math.pi * k / 18), 0, 46 * math.sin(math.pi * k / 18)) for k in range(19)], 0xb8763c),
}
SCAT = json.load(open(W('biome-scatter-v1.json')))['items']; by = {}
for e in SCAT: by.setdefault(e[0], []).append(e)
for sp, items in by.items():
    if sp not in PROTO: continue
    pb = bmesh.new(); PROTO[sp][0](pb); pme = bpy.data.meshes.new('proto_' + sp); pb.to_mesh(pme); pb.free()
    bm = bmesh.new()
    for e in items:
        x, y = e[1], -e[2]; M4 = Matrix.Translation((x, y, ground(x, y) - 0.3)) @ Matrix.Rotation(math.radians(e[4]), 4, 'Z') @ Matrix.Diagonal((e[3],) * 3 + (1,))
        tmp = pme.copy(); tmp.transform(M4); bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    bpy.data.meshes.remove(pme)
    o = obj('scatter_' + sp, bm, [mat('fin_scatter_' + sp, srgb(PROTO[sp][1]), 1.5 if sp == 'crystal' else 0.0)])

old = bpy.data.objects.get('city_rivers')
if old: old.hide_set(True); old.hide_render = True   # hidden, not deleted

# ---- 2026-10-23 (late) sync: Emberfall towers hidden, district landmarks replace the podium+hero stacks, arctic peak city ----
for n in ('EMB_Terrace_Towers', 'EMB_Road_Lava_Bridges'):
    o = bpy.data.objects.get(n)
    if o: o.hide_set(True); o.hide_render = True
DIST = json.load(open(W('grid-fabric-districts-v1.json')))
LMK = {'forge': 'anvil', 'trade': 'exchange', 'residential': 'hearth'}
heroes = [it for it in DIST['items'] if it.get('role') in ('district-podium', 'district-hero')]
for o in SC.objects:   # hide the fab instances standing on a podium/hero spot (replaced by the landmark)
    if o.name.startswith('fab_') and o.instance_collection and any(math.hypot(o.location.x - it['x_m'], o.location.y - it['y_m']) < 2 and it['key'] in o.instance_collection.name for it in heroes):
        o.hide_set(True)
def glb_into(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        FIN.objects.link(o)
    return [o for o in new if o.parent is None]
for it in [i for i in DIST['items'] if i.get('role') == 'district-podium']:
    k = LMK.get(it.get('cluster'))
    if not k: continue
    for r in glb_into(os.path.join(REPO, 'public/assets/kits/shaddai_landmark_%s_v01.glb' % k)):
        r.location = (it['x_m'], it['y_m'], ground(it['x_m'], it['y_m'])); r.rotation_euler = (0, 0, math.radians(it.get('yaw', 0)))
glb_into(os.path.join(REPO, 'public/assets/kits/shaddai_arctic_peaks_v01.glb'))

bpy.ops.wm.save_mainfile()
print('FINISH ok roads', len(RD['roads']), 'spur', len(RD['spurs']), 'town items', placed, 'missing', sorted(missing))
