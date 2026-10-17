# grid-city-v4.py — builds THE GRID city blocks (Map v4) in Blender from the SAME plan the game uses:
#   public/assets/world/grid-city-v4.json  (made by tools/grid-city/grid-city-plan.cjs — never edit the JSON by hand)
# Heights: public/assets/terrain/height16.bin + terrain.json (same sampler as place-world-v4.py) so every building sits
# on the ground. Output: collection 'V4 Grid City' (re-running replaces it).
#
# Run:
#   headless / standalone : blender -b --factory-startup --python tools/blender/grid-city-v4.py -- <repo>
#   via the socket        : set bpy.app.driver_namespace['SHD_REPO'] = <repo>, then exec this file
#
# Structure (cheap on a low-resource laptop):
#   * building tiers  → LINKED DUPLICATES of 4 unit archetype meshes (box / taper 0.62 / crown 0.25 / needle 0.04),
#                       scaled per tier (one Object each, mesh data shared). Object.color carries the facade tint.
#   * accents, skybridges, lamps, pads, fountains, trees → merged into one mesh per material (few objects).
#   * glass material: procedural window grid from world position (bay 3 m × floor 3.5 m), random lit windows emit.
import bpy, json, math, os, sys
import numpy as np

NS = bpy.app.driver_namespace
def _repo():
    if NS.get('SHD_REPO'): return NS['SHD_REPO']
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if a and os.path.isdir(a[0]): return a[0]
    try: return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    except NameError: return os.getcwd()
REPO = _repo()
PLAN = json.load(open(os.path.join(REPO, 'public/assets/world/grid-city-v4.json')))
T = json.load(open(os.path.join(REPO, 'public/assets/terrain/terrain.json')))
N, HALF, MN, MX = T['size_px'], T['half_m'], T['min_m'], T['max_m']
HM = np.fromfile(os.path.join(REPO, 'public/assets/terrain/height16.bin'), dtype='<u2').reshape(N, N).astype(np.float32) / 65535 * (MX - MN) + MN
CELL = 2 * HALF / N

def H(x, y):   # bilinear terrain height (metres), row 0 = north, col 0 = west
    fx = (x + HALF) / CELL - 0.5; fy = (HALF - y) / CELL - 0.5
    j = int(min(max(math.floor(fx), 0), N - 2)); i = int(min(max(math.floor(fy), 0), N - 2)); tx = min(max(fx - j, 0), 1); ty = min(max(fy - i, 0), 1)
    return float((HM[i, j] * (1 - tx) + HM[i, j + 1] * tx) * (1 - ty) + (HM[i + 1, j] * (1 - tx) + HM[i + 1, j + 1] * tx) * ty)
def Hmin(x, y, r):   # lowest ground under the footprint → nothing floats
    return min(H(x + dx * r, y + dy * r) for dx, dy in ((0, 0), (.7, .7), (-.7, .7), (.7, -.7), (-.7, -.7))) - 0.3

# ── clean previous build ──
old = bpy.data.collections.get('V4 Grid City')
if old:
    for o in list(old.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    for ch in list(old.children_recursive): bpy.data.collections.remove(ch)
    bpy.data.collections.remove(old)
for m in [m for m in bpy.data.meshes if m.users == 0 and m.name.startswith('GC-')]: bpy.data.meshes.remove(m)
ROOT = bpy.data.collections.new('V4 Grid City'); bpy.context.scene.collection.children.link(ROOT)
def sub(name):
    c = bpy.data.collections.new('GC ' + name); ROOT.children.link(c); return c
cB, cD = sub('Buildings'), sub('Detail')

# ── materials ──
def hexrgb(h): h = h.lstrip('#'); return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))
def mat(name, rgb, emit=0.0, rough=0.6, metal=0.0):
    M = bpy.data.materials.get(name) or bpy.data.materials.new(name); M.use_nodes = True
    b = M.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    M.diffuse_color = (*rgb, 1); return M

def glass_material():
    """Steel panels + dark glass windows from WORLD position (so scaled linked duplicates keep real 3 m × 3.5 m bays);
    ~40 % of windows emit warm light (white noise per window cell). Object.color tints the steel (per-building tint)."""
    M = bpy.data.materials.get('GC-glass')
    if M: return M
    M = bpy.data.materials.new('GC-glass'); M.use_nodes = True; nt = M.node_tree; nd, ln = nt.nodes, nt.links
    b = nd.get('Principled BSDF'); b.inputs['Roughness'].default_value = 0.25; b.inputs['Metallic'].default_value = 0.5
    geo = nd.new('ShaderNodeNewGeometry'); obj = nd.new('ShaderNodeObjectInfo')
    sep = nd.new('ShaderNodeSeparateXYZ'); ln.new(geo.outputs['Position'], sep.inputs[0])
    nsep = nd.new('ShaderNodeSeparateXYZ'); ln.new(geo.outputs['Normal'], nsep.inputs[0])
    def math_(op, a, b_=None, v=None):
        n = nd.new('ShaderNodeMath'); n.operation = op
        for k, src in enumerate((a, b_)):
            if src is None: continue
            if isinstance(src, (int, float)): n.inputs[k].default_value = src
            else: ln.new(src, n.inputs[k])
        return n.outputs[0]
    u = math_('DIVIDE', math_('ADD', sep.outputs['X'], sep.outputs['Y']), 3.0)       # bays: 3 m
    v = math_('DIVIDE', sep.outputs['Z'], 3.5)                                         # floors: 3.5 m
    wu = math_('LESS_THAN', math_('FRACT', u), 0.82); wv = math_('LESS_THAN', math_('FRACT', v), 0.72)
    side = math_('LESS_THAN', math_('ABSOLUTE', nsep.outputs['Z']), 0.5)              # no windows on roofs
    win = math_('MULTIPLY', math_('MULTIPLY', wu, wv), side)
    comb = nd.new('ShaderNodeCombineXYZ'); ln.new(math_('FLOOR', u), comb.inputs['X']); ln.new(math_('FLOOR', v), comb.inputs['Y'])
    wn = nd.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; ln.new(comb.outputs[0], wn.inputs['Vector'])
    lit = math_('MULTIPLY', math_('GREATER_THAN', wn.outputs['Value'], 0.6), win)
    def mixc(blend, fac, a, b_):   # ShaderNodeMix (RGBA) — the legacy MixRGB node is gone in Blender 5
        n = nd.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
        I = {s.identifier: s for s in n.inputs}
        for key, src in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b_)):
            if isinstance(src, (int, float)): I[key].default_value = src
            elif isinstance(src, tuple): I[key].default_value = src
            else: ln.new(src, I[key])
        return [s for s in n.outputs if s.identifier == 'Result_Color'][0]
    steel = mixc('MULTIPLY', 1.0, (0.62, 0.66, 0.70, 1), obj.outputs['Color'])
    mix = mixc('MIX', win, steel, (0.012, 0.03, 0.045, 1))
    ln.new(mix, b.inputs['Base Color'])
    b.inputs['Emission Color'].default_value = (1.0, 0.78, 0.48, 1); ln.new(math_('MULTIPLY', lit, 3.0), b.inputs['Emission Strength'])
    M.diffuse_color = (0.7, 0.75, 0.8, 1); return M

GLASS = glass_material()
ACC = {k: mat('GC-accent-' + k, hexrgb(h), 6.0, 0.4) for k, h in (('teal', '27e0ff'), ('emerald', '00ff9c'), ('gold', 'e8c45c'))}
MATTE = mat('GC-matte', hexrgb('1a1f26'), 0, 0.8); PLAZA = mat('GC-plaza', hexrgb('2a3139'), 0, 0.85); BASIN = mat('GC-basin', hexrgb('39424c'), 0, 0.7)
LAWN = mat('GC-lawn', hexrgb('1c4d33'), 0, 0.9); CANOPY = mat('GC-canopy', hexrgb('1d7a4c'), 0.15, 0.85)
LAMP = mat('GC-lamp', hexrgb('c8fbff'), 8.0); BRIDGE = mat('GC-bridge', hexrgb('dfe8ef'), 0, 0.15, 0.6)
TINTS = [hexrgb(h) for h in ('e4eaef', 'd3dbe2', 'c2ccd6', 'aebccb', 'e9e3d8', '3b4550', '2c343d')]

# ── geometry helpers: a unit "box" with its base at z = 0 whose top is scaled by `taper` ──
def box_verts(cx, cy, rot, z0, w, d, h, taper=1.0):
    c, s = math.cos(rot), math.sin(rot); out = []
    for zz, k in ((z0, 1.0), (z0 + h, taper)):
        for lx, ly in ((-.5, -.5), (.5, -.5), (.5, .5), (-.5, .5)):
            x, y = lx * w * k, ly * d * k
            out.append((cx + x * c - y * s, cy + x * s + y * c, zz))
    return out
FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
def unit_mesh(name, taper, M):
    me = bpy.data.meshes.get(name)
    if me: return me
    me = bpy.data.meshes.new(name); me.from_pydata(box_verts(0, 0, 0, 0, 1, 1, 1, taper), [], FACES); me.materials.append(M); me.update(); return me
ARCH = [unit_mesh('GC-box', 1.0, GLASS), unit_mesh('GC-taper', 0.62, GLASS), unit_mesh('GC-crown', 0.25, GLASS),
        unit_mesh('GC-slab', 1.0, GLASS), unit_mesh('GC-needle', 0.04, ACC['gold'])]

class Batch:   # merged mesh per material (accents, lamps, pads, trees …)
    def __init__(self, name, M): self.name, self.M, self.v, self.f = name, M, [], []
    def box(self, *a):
        o = len(self.v); self.v += box_verts(*a); self.f += [tuple(i + o for i in fc) for fc in FACES]
    def dome(self, cx, cy, z, r, seg=8):   # low green dome canopy (hemisphere, 3 rings)
        o = len(self.v); rings = [(math.cos(a) * r, math.sin(a) * r * 0.8) for a in (0, 0.6, 1.1)]
        for rr, zz in rings:
            for k in range(seg): t = 2 * math.pi * k / seg; self.v.append((cx + rr * math.cos(t), cy + rr * math.sin(t), z + zz))
        top = len(self.v); self.v.append((cx, cy, z + r * 0.8))
        for ri in range(len(rings) - 1):
            for k in range(seg):
                a, b = o + ri * seg + k, o + ri * seg + (k + 1) % seg; self.f.append((a, b, b + seg, a + seg))
        for k in range(seg): self.f.append((o + 2 * seg + k, o + 2 * seg + (k + 1) % seg, top))
    def build(self):
        if not self.v: return None
        me = bpy.data.meshes.new('GC-' + self.name); me.from_pydata(self.v, [], self.f); me.materials.append(self.M); me.update()
        ob = bpy.data.objects.new('GC ' + self.name, me); cD.objects.link(ob); return ob
BA = {k: Batch('accent-' + k, M) for k, M in ACC.items()}
BM = {n: Batch(n, M) for n, M in (('matte', MATTE), ('plaza', PLAZA), ('basin', BASIN), ('lawn', LAWN), ('canopy', CANOPY), ('lamp', LAMP), ('bridge', BRIDGE))}

# ── buildings ──
rng = np.random.default_rng(PLAN.get('seed', 1))
byid, n_obj = {}, 0
for b in PLAN['buildings']:
    rot = math.radians(b['rot_deg']); c, s = math.cos(rot), math.sin(rot)
    gz = Hmin(b['x_m'], b['y_m'], max(b['w_m'], b['d_m']) * 0.5); byid[b['id']] = (b, gz)
    tint = TINTS[int(rng.integers(len(TINTS)))]; A = BA.get(b['accent'], BA['teal'])
    for i, (w, d, z0, h, ox, oy, ty) in enumerate(b['tiers']):
        cx, cy = b['x_m'] + ox * c - oy * s, b['y_m'] + ox * s + oy * c
        o = bpy.data.objects.new('%s.%d' % (b['id'], i), ARCH[ty]); o.location = (cx, cy, gz + z0); o.scale = (w, d, h)
        o.rotation_euler.z = rot; o.color = (*tint, 1); o['shd_kind'] = b['kind']; cB.objects.link(o); n_obj += 1
        if ty == 3: A.box(cx, cy, rot, gz + z0 - 0.35, w + 0.4, d + 0.4, 0.35); continue      # slab under-glow
        if ty in (2, 4): continue
        A.box(cx, cy, rot, gz + (z0 + h - 0.5 if ty == 0 else z0), w + 0.8, d + 0.8, 0.9)    # cornice / base band
        if i == (1 if b['kind'] == 'podium' else 0) and h > 50 and b['kind'] != 'hall':        # corner light fin
            fx, fy = cx + (w / 2) * c - (d / 2) * s, cy + (w / 2) * s + (d / 2) * c
            A.box(fx, fy, rot, gz + z0, 0.9, 0.9, h)

# ── skybridges ──
for a in PLAN['buildings']:
    if not a.get('skybridgeTo') or a['skybridgeTo'] not in byid: continue
    bb, gzb = byid[a['skybridgeTo']]; gza = byid[a['id']][1]
    dx, dy = bb['x_m'] - a['x_m'], bb['y_m'] - a['y_m']; L = math.hypot(dx, dy); rot = math.atan2(dy, dx)
    mx, my, z = (a['x_m'] + bb['x_m']) / 2, (a['y_m'] + bb['y_m']) / 2, round(min(a['h_m'], bb['h_m']) * 0.55)
    BM['bridge'].box(mx, my, rot, max(gza, gzb) + z, L, 7, 5)
    BA.get(a['accent'], BA['teal']).box(mx, my, rot, max(gza, gzb) + z - 0.4, L, 7.4, 0.4)
# ── plazas / parks / lamps ──
for p in PLAN.get('plazas', []):
    rot = math.radians(p['rot_deg']); gz = H(p['x_m'], p['y_m']) - 0.3; fr = p.get('fountain_r_m', 6)
    BM['plaza'].box(p['x_m'], p['y_m'], rot, gz, p['w_m'], p['d_m'], 0.5)
    BM['basin'].box(p['x_m'], p['y_m'], rot, gz + 0.5, fr * 2, fr * 2, 0.9, 0.9)
    BA['teal'].box(p['x_m'], p['y_m'], rot + 0.785, gz + 0.5, fr * 1.6, fr * 1.6, 0.95)
    BM['lamp'].box(p['x_m'], p['y_m'], rot, gz + 1.4, 1.2, 1.2, 5, 0.1)
for p in PLAN.get('parks', []):
    rot = math.radians(p['rot_deg']); gz = H(p['x_m'], p['y_m']) - 0.3
    BM['lawn'].box(p['x_m'], p['y_m'], rot, gz, p['w_m'], p['d_m'], 0.6)
    for x, y, r in p.get('trees', []):
        tz = H(x, y) - 0.3; BM['matte'].box(x, y, 0, tz, 0.6, 0.6, r * 0.9); BM['canopy'].dome(x, y, tz + r * 0.75, r)
for l in PLAN.get('lamps', []):
    x, y = l['x_m'], l['y_m']; gz = H(x, y) - 0.3; rot = math.atan2(y, x)
    BM['matte'].box(x, y, rot, gz, 0.3, 0.3, 9); BM['lamp'].box(x, y, rot, gz + 9, 1.6, 0.5, 0.35)
for B in list(BA.values()) + list(BM.values()): B.build()

st = PLAN.get('stats', {})
print('GRID CITY v4: %d buildings · %d tier objects · %d plazas · %d parks · %d lamps · %d skybridges' % (
    len(PLAN['buildings']), n_obj, len(PLAN.get('plazas', [])), len(PLAN.get('parks', [])), len(PLAN.get('lamps', [])), st.get('skybridges', 0)))
