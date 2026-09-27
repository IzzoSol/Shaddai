# build_canon.py — Master Build Prompt, steps 0-3 (monument + Grid wedges, 8 stations on the ring, Meadowfields Halt +
# civic boulevard + Quill Forest mass), then approval renders. EVERY position comes from world-layout.json (no eyeballing).
#   blender -b --factory-startup --python tools/blender/canon/build_canon.py -- <repo> [step=3] [norender]
# Axis: metres, +X east, +Y NORTH, Z up. Collections 00_..16_ per the prompt; DEBUG view layer for the atlas overlay.
import bpy, bmesh, json, math, os, sys, random
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
NS = bpy.app.driver_namespace
REPO = (argv[0] if argv and not argv[0].startswith(('step=', 'norender')) else NS.get('SHD_REPO')) or os.getcwd()
STEP = int(next((a.split('=')[1] for a in argv if a.startswith('step=')), '3'))
RENDER = 'norender' not in argv
OUT = os.path.join(REPO, '.bl-cache', 'renders'); os.makedirs(OUT, exist_ok=True)
LAY = json.load(open(os.path.join(REPO, 'tools/blender/canon/world-layout.json')))
T = json.load(open(os.path.join(REPO, 'public/assets/terrain/terrain.json')))
N, HALF, MN, MX = T['size_px'], T['half_m'], T['min_m'], T['max_m']
HM = np.fromfile(os.path.join(REPO, 'public/assets/terrain/height16.bin'), dtype='<u2').reshape(N, N).astype(np.float32) / 65535 * (MX - MN) + MN
CELL = 2 * HALF / N
GRID_R, RING_R, WL = LAY['map']['gridRadius_m'], LAY['map']['goldRingRadius_m'], T['water_level_m']
rng = random.Random(37)
COLL = {'obb': [], 'circle': []}   # game colliders (metres; exported to public/assets/world/canon-colliders-v4.json)
LOG = {'added': {}, 'deleted': []}
def logadd(col, n=1): LOG['added'][col] = LOG['added'].get(col, 0) + n

def H(x, y):
    fx = (x + HALF) / CELL - 0.5; fy = (HALF - y) / CELL - 0.5
    j = int(min(max(math.floor(fx), 0), N - 2)); i = int(min(max(math.floor(fy), 0), N - 2)); tx = min(max(fx - j, 0), 1); ty = min(max(fy - i, 0), 1)
    return float((HM[i, j] * (1 - tx) + HM[i, j + 1] * tx) * (1 - ty) + (HM[i + 1, j] * (1 - tx) + HM[i + 1, j + 1] * tx) * ty)
def at(c, r): a = math.radians(c); return (r * math.sin(a), r * math.cos(a))
def bearing(x, y): return (math.degrees(math.atan2(x, y)) + 360) % 360

# ── scene reset + collections ──
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
NAMES = ['00_Layout_Disc', '01_Grid_Streets', '02_Grid_Blocks', '03_RingRail', '04_Stations', '05_Gates', '06_Meadow_Quill', '07_Void', '08_Emberfall',
         '09_Suburbs', '10_Sand', '11_Forest', '12_Sea', '13_Arctic', '14_Colosseum', '15_Agents', '16_Debug']
C = {}
for n in NAMES: c = bpy.data.collections.new(n); bpy.context.scene.collection.children.link(c); C[n] = c

def mat(name, rgb, emit=0.0, rough=0.7, metal=0.0, alpha=1.0):
    M = bpy.data.materials.get(name) or bpy.data.materials.new(name); M.use_nodes = True; b = M.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    b.inputs['Alpha'].default_value = alpha
    if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    M.diffuse_color = (*rgb, alpha); return M
def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
MAT = {'asphalt': mat('asphalt', (0.05, 0.055, 0.065), 0, 0.85), 'walk': mat('sidewalk', (0.42, 0.44, 0.47), 0, 0.9),
       'curb': mat('curb-neon', (0.15, 0.85, 1.0), 2.5), 'glass': mat('facade-glass', (0.08, 0.12, 0.16), 0, 0.15, 0.6),
       'panel': mat('facade-panel', (0.72, 0.76, 0.8), 0, 0.5, 0.2), 'obsidian': mat('facade-obsidian', (0.035, 0.04, 0.05), 0, 0.3, 0.4),
       'roofglow': mat('roof-neon', (0.15, 0.9, 0.95), 3.0), 'gold': mat('gold', (0.91, 0.77, 0.36), 0.3, 0.3, 0.9),
       'deck': mat('rail-deck', (0.84, 0.8, 0.7), 0, 0.5), 'concrete': mat('concrete', (0.55, 0.56, 0.58), 0, 0.8),
       'white': mat('station-white', (0.93, 0.95, 0.97), 0, 0.3), 'canopy': mat('canopy-glass', (0.7, 0.88, 1.0), 0.3, 0.05, 0.1),
       'plate': mat('nameplate', (0.05, 0.06, 0.08), 0, 0.4), 'plateText': mat('nameplate-text', (0.95, 0.8, 0.4), 2.0),
       'monument': mat('monument', (0.06, 0.08, 0.1), 0, 0.2, 0.8), 'monEdge': mat('monument-edge', (0.2, 0.95, 1.0), 6.0),
       'greenroof': mat('green-roof', (0.26, 0.5, 0.2), 0, 0.9), 'civic': mat('civic-stone', (0.88, 0.86, 0.8), 0, 0.6),
       'blossom': mat('blossom', (0.98, 0.72, 0.84), 0, 0.8), 'leaf': mat('quill-leaf', (0.1, 0.26, 0.1), 0, 0.9), 'leaf2': mat('quill-leaf-2', (0.14, 0.33, 0.12), 0, 0.9),
       'bark': mat('bark', (0.22, 0.15, 0.1), 0, 0.9), 'seat': mat('amph-seat', (0.8, 0.76, 0.66), 0, 0.8), 'plaza': mat('plaza-stone', (0.62, 0.6, 0.56), 0, 0.8),
       'stall': mat('agora-stall', (0.9, 0.55, 0.2), 0.4, 0.6), 'lamp': mat('lamp-head', (1.0, 0.9, 0.6), 5.0)}

# ── mesh builders (merged meshes = few objects, per prompt: no 400 unique meshes) ──
class MeshBuf:
    def __init__(self): self.bm = bmesh.new(); self.mats = []
    def mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)
    def box(self, cx, cy, z0, sx, sy, sz, rot, m, taper=1.0):
        mi = self.mi(m); c, s = math.cos(rot), math.sin(rot); vs = []
        for zz, k in ((z0, 1.0), (z0 + sz, taper)):
            for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                lx, ly = dx * sx / 2 * k, dy * sy / 2 * k
                vs.append(self.bm.verts.new((cx + lx * c - ly * s, cy + lx * s + ly * c, zz)))
        for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
            face = self.bm.faces.new([vs[i] for i in f]); face.material_index = mi
    def cyl(self, cx, cy, z0, r, h, m, seg=24, r2=None, open_top=False):
        mi = self.mi(m); r2 = r if r2 is None else r2; bot, top = [], []
        for k in range(seg):
            a = k / seg * 2 * math.pi
            bot.append(self.bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z0)))
            top.append(self.bm.verts.new((cx + r2 * math.cos(a), cy + r2 * math.sin(a), z0 + h)))
        for k in range(seg):
            f = self.bm.faces.new((bot[k], bot[(k + 1) % seg], top[(k + 1) % seg], top[k])); f.material_index = mi
        if not open_top and r2 > 0.01: f = self.bm.faces.new(list(reversed(top))[::-1]); f.material_index = mi
    def ribbon(self, pts, w, m, zoff=0.0):
        """flat strip of width w along pts [(x,y,z)] (e.g. roads, deck)"""
        mi = self.mi(m); L, R_ = [], []
        for i, (x, y, z) in enumerate(pts):
            x0, y0 = pts[max(i - 1, 0)][:2]; x1, y1 = pts[min(i + 1, len(pts) - 1)][:2]
            dx, dy = x1 - x0, y1 - y0; l = math.hypot(dx, dy) or 1; nx, ny = -dy / l * w / 2, dx / l * w / 2
            L.append(self.bm.verts.new((x + nx, y + ny, z + zoff))); R_.append(self.bm.verts.new((x - nx, y - ny, z + zoff)))
        for i in range(len(pts) - 1):
            f = self.bm.faces.new((L[i], R_[i], R_[i + 1], L[i + 1])); f.material_index = mi
    def annulus(self, r0, r1, z, m, seg=512, zf=None):
        mi = self.mi(m); a_, b_ = [], []
        for k in range(seg):
            a = k / seg * 2 * math.pi; ca, sa = math.cos(a), math.sin(a)
            za = zf(r0 * sa, r0 * ca) if zf else z; zb = zf(r1 * sa, r1 * ca) if zf else z
            a_.append(self.bm.verts.new((r0 * sa, r0 * ca, za))); b_.append(self.bm.verts.new((r1 * sa, r1 * ca, zb)))
        for k in range(seg):
            f = self.bm.faces.new((a_[k], b_[k], b_[(k + 1) % seg], a_[(k + 1) % seg])); f.material_index = mi
    def to_object(self, name, col):
        me = bpy.data.meshes.new(name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(m)
        o = bpy.data.objects.new(name, me); col.objects.link(o); logadd(col.name); return o

def text(body, loc, size, rotz, col, m, extrude=0.08):
    cu = bpy.data.curves.new(body, 'FONT'); cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = extrude
    o = bpy.data.objects.new('TXT_' + body.replace(' ', '_'), cu); o.location = loc; o.rotation_euler = (math.radians(90), 0, rotz)
    o.data.materials.append(m); col.objects.link(o); logadd(col.name); return o

# ── 00 LAYOUT DISC: the Map v4 terrain (height16.bin + color.jpg) — unchanged geography ──
step = 4; sub = HM[::step, ::step]; n = sub.shape[0]
xs = -HALF + (np.arange(N)[::step] + 0.5) * CELL; ys = HALF - (np.arange(N)[::step] + 0.5) * CELL
gx, gy = np.meshgrid(xs, ys); verts = np.stack([gx.ravel(), gy.ravel(), sub.ravel()], 1).astype(np.float32)
ii = np.arange(n - 1); I, J = np.meshgrid(ii, ii, indexing='ij'); a = (I * n + J).ravel(); faces = np.stack([a, a + n, a + n + 1, a + 1], 1)
me = bpy.data.meshes.new('DISC_Terrain'); me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel())
me.loops.add(faces.size); me.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
me.polygons.add(len(faces)); me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * 4).astype(np.int32)); me.polygons.foreach_set('loop_total', np.full(len(faces), 4, np.int32))
me.update(); uv = me.uv_layers.new(name='UVMap'); vuv = np.stack([(verts[:, 0] + HALF) / (2 * HALF), (verts[:, 1] + HALF) / (2 * HALF)], 1)
uv.data.foreach_set('uv', vuv[faces.ravel()].ravel())
for p in me.polygons: p.use_smooth = True
TM = bpy.data.materials.new('disc-terrain'); TM.use_nodes = True; nt = TM.node_tree
tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(os.path.join(REPO, 'public/assets/terrain/color.jpg'))
nt.links.new(tx.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color']); nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95; nt.nodes.active = tx
me.materials.append(TM); disc = bpy.data.objects.new('DISC_Terrain', me); C['00_Layout_Disc'].objects.link(disc); logadd('00_Layout_Disc')
bpy.ops.mesh.primitive_circle_add(vertices=256, radius=HALF - 100, fill_type='NGON', location=(0, 0, WL - 0.3)); w = bpy.context.active_object; w.name = 'DISC_Water'
for u in list(w.users_collection): u.objects.unlink(w)
C['00_Layout_Disc'].objects.link(w); w.data.materials.append(mat('water', (0.1, 0.45, 0.6), 0, 0.05, 0.75))
bpy.ops.mesh.primitive_plane_add(size=60000, location=(0, 0, -160)); cs = bpy.context.active_object; cs.name = 'DISC_CloudSea'
for u in list(cs.users_collection): u.objects.unlink(cs)
C['00_Layout_Disc'].objects.link(cs); cs.data.materials.append(mat('cloud-sea', (0.95, 0.96, 1.0), 0.6))
GZ = H(0, 0)   # the Grid is a flat district at this height

# ═════════ STEP 1: SHADDAI monument + Central Station + Grid streets + 4 cardinal wedges of blocks + Agora + agent pads ═════════
SPOKES = [k * 22.5 for k in range(16)]; RINGS = [170.0, 576.0, 992.0, GRID_R]; STREET = 12.0
st = MeshBuf()
for r in RINGS:
    st.annulus(r - 6, r + 6, GZ + 0.12, MAT['walk']); st.annulus(r - 4, r + 4, GZ + 0.2, MAT['asphalt']); st.annulus(r - 0.25, r + 0.25, GZ + 0.24, MAT['curb'])
for c in SPOKES:
    p = [(*at(c, r), GZ) for r in np.linspace(170, GRID_R, 60)]
    st.ribbon(p, 12, MAT['walk'], 0.12); st.ribbon(p, 8, MAT['asphalt'], 0.2); st.ribbon(p, 0.5, MAT['curb'], 0.24)
st.to_object('STREETS_Grid', C['01_Grid_Streets'])

mon = MeshBuf()
mon.box(0, 0, GZ, 12, 12, 60, 0, MAT['monument'], taper=0.12)                       # 60 m spire (prompt: 50-70 m)
for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):                                # cyan emissive edges
    for k in range(30):
        t0, t1 = k / 30, (k + 1) / 30; s0, s1 = 6 * (1 - 0.88 * t0), 6 * (1 - 0.88 * t1)
        mon.box(dx * (s0 + s1) / 2, dy * (s0 + s1) / 2, GZ + t0 * 60, 0.45, 0.45, 2.05, 0, MAT['monEdge'])
mon.cyl(0, 0, GZ + 44, 9, 0.6, MAT['monEdge'], seg=48)                                # halo ring
mon.cyl(0, 0, GZ, 34, 4, MAT['white'], seg=64); mon.cyl(0, 0, GZ + 4, 20, 0.3, MAT['plaza'], seg=48)   # Central Station deck around the base
mon.cyl(0, 0, GZ + 8, 36, 0.4, MAT['canopy'], seg=64, open_top=False)                # canopy ring
for c in (0, 90, 180, 270):                                                           # 4 stair heads onto the N/E/S/W spokes
    for k in range(10):
        x, y = at(c, 34 + k * 1.6); mon.box(x, y, GZ, 10, 1.7, 4 - k * 0.4, math.radians(-c), MAT['concrete'])
COLL['circle'].append({'x': 0, 'y': 0, 'r': 7.5, 'top': GZ + 60, 'kind': 'monument'}); COLL['circle'].append({'x': 0, 'y': 0, 'r': 34, 'top': GZ + 4.3, 'kind': 'central-station-deck', 'walkableTop': True})
mon.to_object('LM_ShaddaiMonument_CentralStation', C['01_Grid_Streets'])
text('CENTRAL STATION', (*at(180, 36.5), GZ + 11), 3, 0, C['01_Grid_Streets'], MAT['plateText'])

AG = next(l for l in LAY['landmarks'] if l['id'] == 'agora')['pos_m']
PADS = [(a['pos_m'][0], a['pos_m'][1], a) for a in LAY['agents']]
def reserved(x, y):
    if math.hypot(x - AG[0], y - AG[1]) < 42: return True
    return any(math.hypot(x - px, y - py) < 16 for px, py, _ in PADS)
WEDGES = [(0.0, 22.5), (90.0, 112.5), (180.0, 202.5), (270.0, 292.5)] if STEP >= 1 else []
blk = MeshBuf(); nb, area_fp, area_blocks = 0, 0.0, 0.0
BANDS = [(170, 576), (576, 992), (992, GRID_R)]
for (a0, a1) in WEDGES:
    for bi, (r0, r1) in enumerate(BANDS):
        rin, rout = r0 + 6 + 2, r1 - 6 - 2                                            # inset 2 m from the curb (road half-width 6)
        area_blocks += math.pi * (rout ** 2 - rin ** 2) * (a1 - a0) / 360
        r = rin; row = 0
        while r < rout - 10:
            depth = rng.uniform(18, 28); rc = r + depth / 2
            if rc + depth / 2 > rout: break
            amin = a0 + math.degrees((6 + 2) / rc); amax = a1 - math.degrees((6 + 2) / rc)   # clear of the spoke streets
            amid = (a0 + a1) / 2; alley = (bi % 2 == 0)                               # 3 m alley mid-wedge every other ring band
            a = amin
            while a < amax:
                wdt = rng.uniform(20, 34); da = math.degrees(wdt / rc)
                if a + da > amax: break
                ac = a + da / 2
                if alley and abs(ac - amid) < math.degrees((wdt / 2 + 1.5) / rc):
                    a += math.degrees(3 / rc); continue
                x, y = at(ac, rc)
                if not reserved(x, y) and rng.random() > 0.08:                      # ~8 % pocket plazas
                    civic = rng.random() < 0.06
                    h = rng.uniform(40, 70) if civic else rng.uniform(8, 16)
                    m = rng.choice([MAT['glass'], MAT['panel'], MAT['obsidian'], MAT['glass']])
                    rot = math.radians(-ac)
                    blk.box(x, y, GZ, wdt - 1.0, depth - 1.0, 1.0, rot, MAT['obsidian'])            # ground-floor recess (arcade) 1 m
                    blk.box(x, y, GZ + 1.0, wdt, depth, h - 1.0, rot, m)
                    blk.box(x, y, GZ + h, wdt * 0.97, depth * 0.97, 0.3, rot, MAT['obsidian'])       # dark roof
                    cr_, sr_ = math.cos(rot), math.sin(rot)
                    for ex, ey, sx_, sy_ in ((0, depth / 2, wdt, 0.45), (0, -depth / 2, wdt, 0.45), (wdt / 2, 0, 0.45, depth), (-wdt / 2, 0, 0.45, depth)):
                        blk.box(x + ex * cr_ - ey * sr_, y + ex * sr_ + ey * cr_, GZ + h + 0.3, sx_, sy_, 0.35, rot, MAT['roofglow'])   # thin neon roof edge
                    COLL['obb'].append({'x': round(x, 2), 'y': round(y, 2), 'hx': round(wdt / 2, 2), 'hy': round(depth / 2, 2), 'rot': round(rot, 4), 'top': round(GZ + h + 0.3, 2), 'kind': 'grid-block'})
                    nb += 1; area_fp += wdt * depth
                a += da + math.degrees(rng.uniform(4, 6) / rc)                        # 4-6 m local paths between buildings
            r += depth + rng.uniform(5, 7); row += 1
if nb: blk.to_object('BLD_Grid_CardinalWedges', C['02_Grid_Blocks'])
DENSITY = area_fp / max(area_blocks, 1)

ag = MeshBuf()                                                                        # Agora: 30x30 plaza, 3 stall rows (3 m), no cars
agr = math.radians(-bearing(*AG)); ag.box(AG[0], AG[1], GZ, 30, 30, 0.3, agr, MAT['plaza'])
for row in (-6, 0, 6):
    for k in range(-4, 5):
        c_, s_ = math.cos(agr), math.sin(agr); lx, ly = k * 3.2, row
        ag.box(AG[0] + lx * c_ - ly * s_, AG[1] + lx * s_ + ly * c_, GZ + 0.3, 2.4, 2.0, 2.6, agr, MAT['stall'])
ag.cyl(AG[0], AG[1], GZ + 0.3, 2.5, 1.2, MAT['curb'], seg=24)
ag.to_object('LM_Agora', C['02_Grid_Blocks']); text('AGORA', (AG[0], AG[1] - 18, GZ + 5), 3.5, agr, C['02_Grid_Blocks'], MAT['plateText'])
for px, py, a in PADS:                                                                # agent pads 8x8 m with unique trim + sign
    pz = H(px, py); pm = MeshBuf(); trim = mat('trim-' + a['id'], hexrgb(a['trim']), 3.0)
    pm.box(px, py, pz, 8, 8, 0.35, 0, MAT['obsidian'])
    for dx, dy, sx, sy in ((0, 4, 8.4, 0.4), (0, -4, 8.4, 0.4), (4, 0, 0.4, 8.4), (-4, 0, 0.4, 8.4)): pm.box(px + dx, py + dy, pz + 0.35, sx, sy, 0.15, 0, trim)
    pm.box(px + 5.5, py, pz, 0.3, 0.3, 3.5, 0, MAT['concrete']); pm.box(px + 5.5, py, pz + 3.5, 0.2, 3.2, 1.2, 0, trim)
    pm.to_object('PAD_' + a['id'].upper(), C['15_Agents']); text(a['id'].upper(), (px + 5.7, py, pz + 4.1), 0.8, math.radians(90), C['15_Agents'], MAT['plateText'], 0.02)

# ═════════ STEP 2: gold-ring rail deck (4 m, 6 m above grade, supports every 20 m) + 8 stations (ONE kit) + station spoke roads ═════════
if STEP >= 2:
    NSEG = int(2 * math.pi * RING_R / 20)                                            # a sample every 20 m = a support every 20 m
    g = np.array([H(*at(k * 360 / NSEG, RING_R)) for k in range(NSEG)]); g = np.maximum(g, WL)
    ker = np.ones(21) / 21; gs = np.convolve(np.concatenate([g[-10:], g, g[:10]]), ker, 'valid')   # smooth grade → level-ish deck
    deckz = gs + 6.0
    pts = [(*at(k * 360 / NSEG, RING_R), deckz[k]) for k in range(NSEG)] + [(*at(0, RING_R), deckz[0])]
    rr = MeshBuf(); rr.ribbon(pts, 4.0, MAT['deck'])
    for off in (-0.75, 0.75):
        rp = [(*at(k * 360 / NSEG, RING_R + off), deckz[k % NSEG] + 0.25) for k in range(NSEG + 1)]; rr.ribbon(rp, 0.12, MAT['gold'], 0)
    for off in (-2.0, 2.0):
        rp = [(*at(k * 360 / NSEG, RING_R + off), deckz[k % NSEG] + 1.1) for k in range(NSEG + 1)]; rr.ribbon(rp, 0.1, MAT['concrete'], 0)
    for k in range(NSEG):
        x, y = at(k * 360 / NSEG, RING_R); g0 = H(x, y)
        if g0 < WL - 0.3: continue
        rr.cyl(x, y, g0 - 1, 0.6, deckz[k] - g0 + 0.6, MAT['concrete'], seg=8)
    rr.to_object('RAIL_GoldRing', C['03_RingRail'])
    deck_at = lambda c: float(deckz[int(round(c / 360 * NSEG)) % NSEG])
    STN = [s for s in LAY['stations'] if s['id'] != 'central']
    for s in STN:
        c = s['bearing']; rot = math.radians(-c); dz = deck_at(c)
        inx, iny = at(c, RING_R - 6.5)                                                # platform kisses the inner side of the beam
        kit = MeshBuf()
        kit.box(inx, iny, dz - 1.0, 24, 8, 1.0, rot, MAT['white'])                    # platform 24 x 8 m
        for sx in (-10, 10):
            for sy in (-3, 3):
                cx_, cy_ = inx + sx * math.cos(rot) - sy * math.sin(rot), iny + sx * math.sin(rot) + sy * math.cos(rot)
                kit.box(cx_, cy_, dz, 0.4, 0.4, 4.0, rot, MAT['gold'])
        kit.box(inx, iny, dz + 4.0, 26, 9, 0.3, rot, MAT['canopy'])                   # canopy 4 m
        kit.box(inx, iny, dz + 4.3, 26, 0.3, 0.3, rot, MAT['gold'])
        gx_, gy_ = at(c, RING_R - 14); gz = H(gx_, gy_)                               # stairs down to the spoke road (Grid side)
        nst = max(6, int((dz - gz) / 0.35))
        for k in range(nst):
            sx_, sy_ = at(c, RING_R - 10.5 - k * (14 / nst)); kit.box(sx_, sy_, gz, 3.0, 14 / nst + 0.05, max(0.2, (dz - gz) * (1 - k / nst)), rot, MAT['concrete'])
        px_, py_ = at(c, RING_R - 11)                                                 # nameplate 3 m tall
        kit.box(px_, py_, dz + 4.6, 16, 0.4, 3.0, rot, MAT['plate'])
        kit.to_object('STN_' + ''.join(w.capitalize() for w in s['id'].split('-')), C['04_Stations'])
        tx_, ty_ = at(c, RING_R - 11.3)
        text(s['name'].upper(), (tx_, ty_, dz + 6.1), 1.35, math.radians(-c), C['04_Stations'], MAT['plateText'], 0.05)
        # the station's spoke continues as a 12 m road: Grid edge → ring → into the biome
        rd = [(*at(c, r), H(*at(c, r)) + 0.15) for r in np.linspace(GRID_R, RING_R + 700, 90)]
        rd = [p for p in rd if p[2] > WL + 0.2]
        if len(rd) > 2:
            road = MeshBuf(); road.ribbon(rd, 12, MAT['walk']); road.ribbon([(x, y, z + 0.08) for x, y, z in rd], 8, MAT['asphalt']); road.to_object('ROAD_Spoke_' + s['id'], C['01_Grid_Streets'])

# ═════════ STEP 3: MEADOWFIELDS — Halt, 12 m boulevard, green-roof civic street, amphitheater bowl; QUILL FOREST mass ═════════
if STEP >= 3:
    halt = next(s for s in LAY['stations'] if s['id'] == 'meadowfields-halt'); hc = halt['bearing']
    amp = next(l for l in LAY['landmarks'] if l['id'] == 'harvest-amphitheater')['pos_m']
    h0 = at(hc, RING_R + 30)                                                          # boulevard starts just outside the Halt
    L_ = math.hypot(amp[0] - h0[0], amp[1] - h0[1]); ux, uy = (amp[0] - h0[0]) / L_, (amp[1] - h0[1]) / L_; nx, ny = -uy, ux
    bpts = [(h0[0] + ux * t, h0[1] + uy * t, H(h0[0] + ux * t, h0[1] + uy * t) + 0.15) for t in np.linspace(0, L_ - 40, 120)]
    bl = MeshBuf(); bl.ribbon(bpts, 12, MAT['plaza']); bl.ribbon([(x, y, z + 0.06) for x, y, z in bpts], 6, MAT['walk'])
    for t in np.arange(10, L_ - 50, 30):                                              # lamps every 30 m both sides
        for sd in (-7.5, 7.5):
            x, y = h0[0] + ux * t + nx * sd, h0[1] + uy * t + ny * sd; z = H(x, y)
            bl.box(x, y, z, 0.25, 0.25, 5, 0, MAT['concrete']); bl.box(x, y, z + 5, 0.6, 0.6, 0.35, 0, MAT['lamp'])
    bl.to_object('ROAD_Meadow_Boulevard', C['06_Meadow_Quill'])
    # green-roof civic kit: round halls + crescent courtyards, courtyards FACE the road, 16-24 m centre spacing, 2 groups
    civ = MeshBuf(); ncv = 0; yaw = math.atan2(uy, ux)
    for group_t in (60, L_ - 260):
        t = group_t
        for k in range(6):
            side = -1 if k % 2 == 0 else 1; t += rng.uniform(16, 24) if k % 2 == 0 else 0
            cx_, cy_ = h0[0] + ux * t + nx * side * 26, h0[1] + uy * t + ny * side * 26; z = H(cx_, cy_)
            if k % 3 == 1:                                                            # crescent courtyard building (opening toward the road)
                face = math.atan2(-ny * side, -nx * side)
                for s_ in range(9):
                    a = face + math.radians(-120 + s_ * 30); ox_, oy_ = cx_ + 11 * math.cos(a), cy_ + 11 * math.sin(a)
                    if abs(math.degrees(a - face)) % 360 < 40: continue
                    civ.box(ox_, oy_, z, 9, 6, 9, a + math.pi / 2, MAT['civic']); civ.box(ox_, oy_, z + 9, 9.4, 6.4, 0.8, a + math.pi / 2, MAT['greenroof'])
                    COLL['obb'].append({'x': round(ox_, 2), 'y': round(oy_, 2), 'hx': 4.5, 'hy': 3.0, 'rot': round(a + math.pi / 2, 4), 'top': round(z + 9.8, 2), 'kind': 'civic-court'})
            else:                                                                     # round hall with a roof garden
                rr_ = rng.uniform(8, 12); hh = rng.uniform(8, 12)
                civ.cyl(cx_, cy_, z, rr_, hh, MAT['civic'], seg=28); civ.cyl(cx_, cy_, z + hh, rr_ + 0.6, 0.9, MAT['greenroof'], seg=28)
                COLL['circle'].append({'x': round(cx_, 2), 'y': round(cy_, 2), 'r': round(rr_, 2), 'top': round(z + hh + 0.9, 2), 'kind': 'civic-hall'})
                for g_ in range(5):
                    a = rng.uniform(0, 6.283); civ.cyl(cx_ + rr_ * 0.5 * math.cos(a), cy_ + rr_ * 0.5 * math.sin(a), z + hh + 0.9, 1.4, 1.6, MAT['leaf2'], seg=8, r2=0.2)
            ncv += 1
    civ.to_object('BLD_Meadow_Civic', C['06_Meadow_Quill'])
    am = MeshBuf(); az = H(*amp)                                                      # amphitheater bowl 50 m, stage facing the boulevard
    am.cyl(amp[0], amp[1], az - 0.5, 30, 0.6, MAT['plaza'], seg=64)
    for k in range(7):
        r_ = 10 + k * 2.2; am.cyl(amp[0], amp[1], az + 0.1 + k * 0.7, r_ + 2.2, 0.7, MAT['seat'], seg=64, open_top=False)
    sx_, sy_ = amp[0] - ux * 4, amp[1] - uy * 4; am.box(sx_, sy_, az + 0.1, 12, 6, 1.0, yaw + math.pi / 2, MAT['civic'])
    am.to_object('LM_HarvestAmphitheater', C['06_Meadow_Quill'])
    # blossom trees as an EDGE of the boulevard (not the whole biome)
    bt = MeshBuf()
    for t in np.arange(20, L_ - 60, 16):
        for sd in (-10.5, 10.5):
            x, y = h0[0] + ux * t + nx * sd, h0[1] + uy * t + ny * sd; z = H(x, y)
            bt.cyl(x, y, z, 0.35, 3.2, MAT['bark'], seg=6); bt.cyl(x, y, z + 3.0, 3.2, 3.8, MAT['blossom'], seg=10, r2=1.4)
    bt.to_object('VEG_Blossom_Edge', C['06_Meadow_Quill'])
    # QUILL FOREST: a dark tree MASS between the Grid's east edge and the Halt (canopy 12-20 m)
    qf = MeshBuf(); nq = 0; tries = 0
    q = next(r for r in LAY['regions'] if r['id'] == 'quill-forest')
    while nq < 420 and tries < 6000:
        tries += 1
        c = rng.uniform(q['bearing'] - 14, q['bearing'] + 20); r = rng.uniform(GRID_R + 40, RING_R - 70)
        x, y = at(c, r); z = H(x, y)
        if z < WL + 0.5 or any(abs(c - s['bearing']) < 1.2 for s in LAY['stations']): continue
        hgt = rng.uniform(12, 20); cr = hgt * rng.uniform(0.22, 0.3)
        qf.cyl(x, y, z, 0.5, hgt * 0.35, MAT['bark'], seg=6)
        if rng.random() < 0.55: qf.cyl(x, y, z + hgt * 0.25, cr, hgt * 0.75, MAT['leaf'], seg=9, r2=0.3)            # conifer
        else: qf.cyl(x, y, z + hgt * 0.3, cr * 1.2, hgt * 0.7, MAT['leaf2'], seg=9, r2=cr * 0.5)                 # broadleaf
        nq += 1
    qf.to_object('VEG_QuillForest_Mass', C['06_Meadow_Quill'])
    LOG['deleted'].append('meadow mushroom "red-shack" village (realm-clusters meadow-village) — not placed in the canon scene')

FEAT = T.get('features', {})
# ═════════ STEP 4: DEEP VOID — overlook plaza on the Grid-side lip, winged ring gate, tetrahedron over the pit, vortex ═════════
if STEP >= 4 and 'void' in FEAT:
    V = FEAT['void']; pc = V['pit_centre_m']; lip = V['lip_z_m']; flo = V['floor_z_m']; ovp = V['overlook_m']
    MV = {'stone': mat('void-stone', (0.16, 0.14, 0.2), 0, 0.55, 0.2), 'rune': mat('void-rune', (0.62, 0.25, 1.0), 6.0), 'dark': mat('void-dark', (0.02, 0.01, 0.04), 0, 0.3),
          'rail': mat('void-rail', (0.75, 0.62, 0.95), 1.5, 0.3, 0.6)}
    vb = MeshBuf()
    vb.box(ovp[0], ovp[1], lip, 20, 16, 0.6, 0, MAT['plaza'])                                   # overlook plaza 20 x 16 m
    for dx, dy, sx, sy in ((0, 8, 20, 0.3), (10, 0, 0.3, 16), (-10, 0, 0.3, 16)):                   # railings on the pit side + flanks
        vb.box(ovp[0] + dx, ovp[1] + dy, lip + 0.6, sx, sy, 1.1, 0, MV['rail'])
    gy = pc[1] - V['pit_r_m'] + 6                                                               # winged ring gate stands on the south lip, framing the pit
    RR = 32.0; gz = lip + RR - 2
    for k in range(48):                                                                         # the ring: 48 stone voussoirs (arch blocks)
        a0 = k / 48 * 2 * math.pi; a1 = (k + 1) / 48 * 2 * math.pi; am = (a0 + a1) / 2
        x = RR * math.cos(am); z = RR * math.sin(am)
        if gz + z < lip - 1: continue
        blk = MeshBuf() if False else vb
        vb.box(pc[0] + x, gy, gz + z - 2.2, 2 * RR * math.sin(math.pi / 48) + 0.6, 4.5, 4.4, 0, MV['stone'])
    for k in range(96):                                                                         # inner rune rim (emissive)
        am = k / 96 * 2 * math.pi; x = (RR - 3) * math.cos(am); z = (RR - 3) * math.sin(am)
        if gz + z > lip - 1: vb.box(pc[0] + x, gy, gz + z - 0.4, 2.2, 1.0, 0.8, 0, MV['rune'])
    for sd in (-1, 1):                                                                          # stone wings sweeping up and out
        for k in range(9):
            t_ = k / 8; wx = pc[0] + sd * (RR + 4 + t_ * 38); wz = gz - 6 + t_ * 30 + 10 * math.sin(t_ * math.pi)
            vb.box(wx, gy, wz, 8, 3.2, 18 - t_ * 12, 0, MV['stone'])
        vb.box(pc[0] + sd * (RR + 1), gy, lip - 1, 7, 7, gz - lip + 1, 0, MV['stone'])            # piers on the lip
    th = 18.0; tz = lip + 12                                                                    # hovering tetrahedron over the pit centre
    tb = vb.bm; mi = vb.mi(MV['rune'])
    pts = [(pc[0], pc[1], tz + th * 0.8)] + [(pc[0] + th * 0.6 * math.cos(a), pc[1] + th * 0.6 * math.sin(a), tz - th * 0.3) for a in (0, 2.094, 4.189)]
    vs = [tb.verts.new(q) for q in pts]
    for f in ((0, 1, 2), (0, 2, 3), (0, 3, 1), (1, 3, 2)):
        ff = tb.faces.new([vs[i] for i in f]); ff.material_index = mi
    for k in range(7):                                                                          # vortex: shrinking emissive rings spiralling down
        r_ = V['pit_r_m'] * (0.85 - k * 0.11); z_ = lip - 3 - k * 3.4
        vb.annulus(r_ - 1.2, r_, z_, MV['rune'], seg=96) if False else None
        for q in range(64):
            a = q / 64 * 2 * math.pi + k * 0.35
            vb.box(pc[0] + r_ * math.sin(a), pc[1] + r_ * math.cos(a), z_, 2 * math.pi * r_ / 64 * 0.7, 1.2, 0.5, -a, MV['rune'])
    vb.cyl(pc[0], pc[1], flo - 0.5, V['pit_r_m'] * 0.18, 0.6, MV['dark'], seg=48)
    vb.to_object('LM_Void_OverlookGate', C['07_Void'])
    text('RIFT OVERLOOK', (ovp[0], ovp[1] - 9, lip + 3.5), 1.6, 0, C['07_Void'], MAT['plateText'])
    COLL['obb'].append({'x': round(ovp[0], 2), 'y': round(ovp[1], 2), 'hx': 10, 'hy': 8, 'rot': 0, 'top': round(lip + 0.6, 2), 'kind': 'void-overlook', 'walkableTop': True})
    for sd in (-1, 1): COLL['obb'].append({'x': round(pc[0] + sd * (RR + 1), 2), 'y': round(gy, 2), 'hx': 3.5, 'hy': 3.5, 'rot': 0, 'top': round(gz, 2), 'kind': 'void-gate-pier'})

# ═════════ STEP 5: EMBERFALL — graded switchback, lava channel (mesh trough), 2 stone arch bridges, tower terrace ═════════
if STEP >= 5 and 'emberfall' in FEAT:
    E = FEAT['emberfall']; tc = E['terrace_centre_m']; tz = E['terrace_z_m']
    ME = {'basalt': mat('ember-basalt', (0.09, 0.07, 0.07), 0, 0.7), 'lava': mat('ember-lava', (0.85, 0.16, 0.02), 2.2, 0.4),
          'glow': mat('ember-window', (1.0, 0.45, 0.12), 3.5), 'arch': mat('ember-arch', (0.36, 0.3, 0.27), 0, 0.8)}
    rd = [(x, y, z + 0.15) for x, y, z in E['road_m']]
    br = E['bridges_m']
    def near_bridge(x, y, r=16): return any(math.hypot(x - b[0], y - b[1]) < r for b in br)
    segs, cur = [], []
    for q in rd:
        if near_bridge(q[0], q[1]):
            if len(cur) > 1: segs.append(cur)
            cur = []
        else: cur.append(q)
    if len(cur) > 1: segs.append(cur)
    er = MeshBuf()
    for sg in segs: er.ribbon(sg, 12, MAT['walk']); er.ribbon([(x, y, z + 0.08) for x, y, z in sg], 8, MAT['asphalt'])
    lava = [(x, y, H(x, y) + 1.2) for x, y in E['channel_m']]
    er.ribbon(lava, 12, ME['lava'])                                                             # molten surface inside the 14 m trough
    for b in br:                                                                                # stone arch bridges (deck 10 x 34 m + arch + parapets)
        k = min(range(len(rd)), key=lambda k: math.hypot(rd[k][0] - b[0], rd[k][1] - b[1]))
        a_ = rd[max(k - 2, 0)]; b_ = rd[min(k + 2, len(rd) - 1)]; yaw = math.atan2(b_[1] - a_[1], b_[0] - a_[0]) - math.pi / 2
        bz = b[2] + 0.4
        er.box(b[0], b[1], bz - 1.2, 10, 34, 1.2, yaw, ME['arch'])
        for sd in (-1, 1):
            ox, oy = math.cos(yaw) * sd * 4.7, math.sin(yaw) * sd * 4.7
            er.box(b[0] + ox, b[1] + oy, bz, 0.6, 34, 1.1, yaw, ME['arch'])
        for q in range(13):                                                                     # the arch ring under the deck
            t_ = q / 12; ly = -14 + 28 * t_; dz = 7 * math.sin(math.pi * t_)
            ax, ay = b[0] - math.sin(yaw) * ly, b[1] + math.cos(yaw) * ly
            er.box(ax, ay, bz - 1.2 - (7 - dz) - 1.4, 9, 2.4, 1.6, yaw, ME['arch'])
        COLL['obb'].append({'x': round(b[0], 2), 'y': round(b[1], 2), 'hx': 5, 'hy': 17, 'rot': round(yaw, 4), 'top': round(bz, 2), 'kind': 'ember-bridge', 'walkableTop': True})
    er.to_object('EMB_Road_Lava_Bridges', C['08_Emberfall'])
    tw = MeshBuf(); ntw = 0
    tw.cyl(tc[0], tc[1], tz, 176, 0.5, ME['basalt'], seg=72)                                    # terrace deck
    for k in range(9):                                                                          # 9 dark tower blocks 16-40 m around a forge plaza
        a = k / 9 * 2 * math.pi + 0.3; r_ = 105 + (k % 3) * 18; x, y = tc[0] + r_ * math.cos(a), tc[1] + r_ * math.sin(a)
        w_ = rng.uniform(16, 24); d_ = rng.uniform(16, 22); h_ = rng.uniform(16, 40); rot = a + math.pi / 2
        tw.box(x, y, tz + 0.5, w_, d_, h_, rot, ME['basalt'], taper=0.86)
        for f_ in range(int(h_ // 6)):
            tw.box(x, y, tz + 3 + f_ * 6, w_ * 0.9, d_ + 0.3, 0.5, rot, ME['glow'])
        COLL['obb'].append({'x': round(x, 2), 'y': round(y, 2), 'hx': round(w_ / 2, 2), 'hy': round(d_ / 2, 2), 'rot': round(rot, 4), 'top': round(tz + 0.5 + h_, 2), 'kind': 'ember-tower'}); ntw += 1
    tw.cyl(tc[0], tc[1], tz + 0.5, 9, 2.2, ME['arch'], seg=24); tw.cyl(tc[0], tc[1], tz + 2.7, 6, 0.6, ME['lava'], seg=24)   # forge brazier
    tw.to_object('EMB_Terrace_Towers', C['08_Emberfall'])
    e_ = bpy.data.objects.new('DRAGON_Emberfall_perch', None); e_.empty_display_type = 'CONE'; e_.empty_display_size = 20
    rx, ry = tc[0] + 260 * math.cos(math.radians(30)), tc[1] + 260 * math.sin(math.radians(30)); e_.location = (rx, ry, H(rx, ry) + 10); C['08_Emberfall'].objects.link(e_)
    LOG.setdefault('added', {})['emberfall_towers'] = ntw

# ── 16 DEBUG: atlas image empty (north-up, 0.35), 10x10 grid, station empties — only in the DEBUG view layer ──
img = bpy.data.images.load(os.path.join(REPO, LAY['map']['source']))
E = bpy.data.objects.new('DEBUG_AtlasOverlay', None); E.empty_display_type = 'IMAGE'; E.data = img
E.empty_image_offset = (-0.5, -0.5); E.color[3] = 0.35; E.use_empty_image_alpha = True; E.location = (0, 0, 40)
E.empty_display_size = 2 * HALF; E.scale = (1, 1.0 / 0.62, 1)   # atlas is drawn tilted: vertical stretch ≈ 1/0.62 (adjust by eye in DEBUG)
C['16_Debug'].objects.link(E)
PXW, PXH = img.size[0], img.size[1]; RCX, RCY, RRX, RRY = 583.0, 335.0, 318.0, 165.0   # image-37 disc centre + gold-ring radii (px), measured by eye
MX_, MY_ = RING_R / RRX, RING_R / RRY                                                   # metres per px (atlas is drawn tilted → vertical scale differs)
bpy.ops.mesh.primitive_plane_add(size=1, location=((PXW / 2 - RCX) * MX_, -(PXH / 2 - RCY) * MY_, 60)); ov = bpy.context.active_object; ov.name = 'DEBUG_AtlasPlane'
ov.scale = (PXW * MX_, PXH * MY_, 1)
for u in list(ov.users_collection): u.objects.unlink(ov)
C['16_Debug'].objects.link(ov)
OM = bpy.data.materials.new('debug-atlas'); OM.use_nodes = True; ont = OM.node_tree; ob = ont.nodes['Principled BSDF']
otx = ont.nodes.new('ShaderNodeTexImage'); otx.image = img; ont.links.new(otx.outputs['Color'], ob.inputs['Base Color']); ont.links.new(otx.outputs['Color'], ob.inputs['Emission Color'])
ob.inputs['Emission Strength'].default_value = 0.8; ob.inputs['Alpha'].default_value = 0.35
try: OM.surface_render_method = 'BLENDED'
except Exception: pass
ov.data.materials.append(OM)
dg = MeshBuf()
for k in range(11):
    v = -HALF + k * (2 * HALF / 10)
    dg.box(v, 0, 45, 4, 2 * HALF, 0.5, 0, MAT['curb']); dg.box(0, v, 45, 2 * HALF, 4, 0.5, 0, MAT['curb'])
dg.to_object('DEBUG_Grid10x10', C['16_Debug'])
for s in LAY['stations']:
    e = bpy.data.objects.new('DEBUG_STN_' + s['id'], None); e.empty_display_type = 'ARROWS'; e.empty_display_size = 60; e.location = (*s['pos_m'], 50); C['16_Debug'].objects.link(e)
for r in LAY['regions']:
    e = bpy.data.objects.new('DEBUG_REG_' + r['id'], None); e.empty_display_type = 'CUBE'; e.empty_display_size = 120; e.location = (*r['pos_m'], 50); C['16_Debug'].objects.link(e)
vl = bpy.context.scene.view_layers[0]; vl.name = 'MAIN'
vl.layer_collection.children['16_Debug'].exclude = True
dbg = bpy.context.scene.view_layers.new('DEBUG')
for n_ in NAMES: dbg.layer_collection.children[n_].exclude = (n_ not in ('00_Layout_Disc', '16_Debug', '01_Grid_Streets', '04_Stations', '03_RingRail'))

# ── write the change log ──
LOG['metrics'] = {'grid_buildings_4_wedges': nb, 'grid_density_4_wedges': round(DENSITY, 3), 'meadow_civic': locals().get('ncv', 0), 'quill_trees': locals().get('nq', 0), 'step': STEP}
json.dump(LOG, open(os.path.join(REPO, 'tools/blender/canon/build-log-step%d.json' % STEP), 'w'), indent=1)
print('CANON', json.dumps(LOG['metrics']))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(REPO, '.bl-cache', 'canon-step%d.blend' % STEP), compress=True)

# ── EXPORT to the game (argv 'export'): canon districts as one GLB in METRES (game scales by U) + collider list ──
if 'export' in argv:
    EXP = ['01_Grid_Streets', '02_Grid_Blocks', '06_Meadow_Quill', '07_Void', '08_Emberfall', '15_Agents']
    for o in list(bpy.data.objects):
        if o.type == 'FONT' and any(o.name in bpy.data.collections[n].objects for n in EXP):
            me_ = o.to_mesh().copy(); ob_ = bpy.data.objects.new(o.name + '_mesh', me_); ob_.matrix_world = o.matrix_world.copy()
            for m_ in o.data.materials: me_.materials.append(m_)
            for c_ in o.users_collection: c_.objects.link(ob_)
            bpy.data.objects.remove(o, do_unlink=True)
    for o in bpy.context.scene.objects: o.select_set(False)
    keep = [o for n in EXP for o in bpy.data.collections[n].objects if o.type == 'MESH']
    for o in keep: o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    outg = os.path.join(REPO, '.bl-cache', 'canon-v4-raw.glb')
    bpy.ops.export_scene.gltf(filepath=outg, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    U_ = 7 / 1.8
    def g(p): return {'x': round(p['x'] * U_, 2), 'z': round(-p['y'] * U_, 2)}
    colls = {'version': 1, 'units_per_m': U_, 'note': 'game units; obb rot = rotation about +Y (same sign as Blender Z because z = -Y); top = walkable top (units)',
             'obb': [dict(g(o), hx=round(o['hx'] * U_, 2), hz=round(o['hy'] * U_, 2), rot=o['rot'], top=round(o['top'] * U_, 2), kind=o['kind'], walkableTop=o.get('walkableTop', False)) for o in COLL['obb']],
             'circle': [dict(g(c), r=round(c['r'] * U_, 2), top=round(c['top'] * U_, 2), kind=c['kind'], walkableTop=c.get('walkableTop', False)) for c in COLL['circle']]}
    os.makedirs(os.path.join(REPO, 'public/assets/world'), exist_ok=True)
    json.dump(colls, open(os.path.join(REPO, 'public/assets/world/canon-colliders-v4.json'), 'w'), separators=(',', ':'))
    print('EXPORT glb', outg, 'obb', len(COLL['obb']), 'circle', len(COLL['circle']))

# ── approval renders: top-down ortho of the whole disc (+ DEBUG overlay) and 1.6 m eye-level per step ──
if RENDER:
    sc = bpy.context.scene
    try: sc.render.engine = 'BLENDER_EEVEE'
    except Exception: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    w_ = sc.world or bpy.data.worlds.new('World'); sc.world = w_; w_.use_nodes = True
    bg = w_.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = (0.55, 0.72, 0.95, 1); bg.inputs['Strength'].default_value = 0.9
    ld = bpy.data.lights.new('SUN', 'SUN'); ld.energy = 4.0; sun = bpy.data.objects.new('SUN', ld); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    cd = bpy.data.cameras.new('CAM'); cam = bpy.data.objects.new('CAM', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.clip_start = 0.1; cd.clip_end = 60000
    def shoot(name, layer='MAIN', ortho=None, pos=None, tgt=None, lens=24, res=(1280, 720)):
        sc.render.resolution_x, sc.render.resolution_y = res
        for v in sc.view_layers: v.use = (v.name == layer)
        if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho; cam.location = (0, 0, 12000); cam.rotation_euler = (0, 0, 0)
        else:
            cd.type = 'PERSP'; cd.lens = lens; cam.location = pos
            cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(OUT, 'canon-s%d-%s.png' % (STEP, name)); bpy.ops.render.render(write_still=True); print('SHOT', name)
    EYE = 1.6
    shoot('top', ortho=10600, res=(1400, 1400))
    shoot('top-debug', layer='DEBUG', ortho=10600, res=(1400, 1400))
    shoot('grid-top', ortho=3600, res=(1400, 1400))
    x, y = at(0, 700); shoot('eye-grid-north-spoke', pos=(x + 3, y, GZ + EYE), tgt=(0, 0, GZ + 30))
    x, y = at(90, 1100); shoot('eye-grid-east-agora', pos=(x, y - 3, GZ + EYE), tgt=(AG[0], AG[1], GZ + 6))
    if STEP >= 2:
        s = next(s for s in LAY['stations'] if s['id'] == 'rift-gate'); c = s['bearing']; x, y = at(c, RING_R - 70)
        shoot('eye-station-riftgate', pos=(x + 3, y, H(x, y) + EYE), tgt=(*at(c, RING_R - 8), deck_at(c) + 3))
    if STEP >= 3:
        x, y = h0[0] + ux * 30, h0[1] + uy * 30
        shoot('eye-meadow-halt-boulevard', pos=(x, y, H(x, y) + EYE), tgt=(h0[0] + ux * 200, h0[1] + uy * 200, H(x, y) + 6))
        x, y = at(hc, RING_R - 60); shoot('eye-meadow-halt-station', pos=(x, y, H(x, y) + EYE), tgt=(*at(hc, RING_R), deck_at(hc) + 3))
        q = next(r for r in LAY['regions'] if r['id'] == 'quill-forest')   # (q is reused as a loop var in steps 4-5)
        x, y = at(q['bearing'] + 6, GRID_R); shoot('eye-quill-forest-seam', pos=(x, y, H(x, y) + EYE), tgt=(*at(q['bearing'] + 8, GRID_R + 450), H(x, y) + 6))
        shoot('meadow-oblique', pos=(h0[0] - ux * 250 + nx * 250, h0[1] - uy * 250 + ny * 250, H(*h0) + 260), tgt=(h0[0] + ux * 400, h0[1] + uy * 400, H(*h0)), lens=26)
    if STEP >= 4 and 'void' in FEAT:
        V = FEAT['void']; ovp = V['overlook_m']; pc = V['pit_centre_m']
        shoot('eye-void-overlook', pos=(ovp[0], ovp[1] - 6, V['lip_z_m'] + 0.6 + EYE), tgt=(pc[0], pc[1], V['lip_z_m'] + 8))
        shoot('void-oblique', pos=(pc[0] - 380, pc[1] - 420, V['lip_z_m'] + 260), tgt=(pc[0], pc[1], V['lip_z_m'] - 10), lens=28)
    if STEP >= 5 and 'emberfall' in FEAT:
        E = FEAT['emberfall']; b0 = E['bridges_m'][0]; tc = E['terrace_centre_m']
        shoot('eye-emberfall-bridge', pos=(b0[0] - 40, b0[1] + 10, b0[2] + 0.4 + EYE + 1), tgt=(tc[0], tc[1], E['terrace_z_m'] + 15))
        shoot('emberfall-oblique', pos=(tc[0] - 700, tc[1] + 250, E['terrace_z_m'] + 330), tgt=(tc[0] - 150, tc[1], E['terrace_z_m']), lens=26)
print('CANON DONE')
