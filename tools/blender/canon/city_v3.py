# city_v3.py — SHADDAI CITY v3 (docs/CITY-MASTER-BRIEF-v2.md + owner's v3 brief, 2026-09-27). exec()'d by build_canon.py at step>=7,
# so it shares its globals (MeshBuf, mat, MAT, COLL, at, H, GZ, LAY, C, rng, text, logadd, GRID_R, bearing, REPO).
# Canon map (locked): core r<170 m = the EXISTING 3D Shaddai City (do not touch). 16 Grid wedges; N/E/S/W built; 4 empty petals:
#   NE 22.5-90 Campus + Perch · NW 292.5-360 Race Quarter (+ TRACK_MAIN on the r1600 ring, CCW) · SE 112.5-180 Commons (+ monument)
#   SW 202.5-270 Plot District (+ thin Deed Office / Builder Yard strip on its SE-facing edge). Built wedges → lived-in housing.
# Exports (with 'export'): markers-v4.json, grid-commons-v4.json (clusters-loader format), plots-v4.json. SPARKS law in DOC_SPARKS.
import bpy, math, json, os
from mathutils import Vector

V3 = ['00_GRID_DO_NOT_TOUCH', '01_HOUSING', '02_ACADEMY_FORGE', '03_PERCH', '04_TRACK', '05_PLOTS', '06_COMMONS', '07_MARKERS', '08_DOCS']
for n in V3:
    if n not in C: c = bpy.data.collections.new(n); bpy.context.scene.collection.children.link(c); C[n] = c
CYAN = hexrgb('#3DFFF0'); EMBER = hexrgb('#FF4A1A'); VOID = hexrgb('#7A3DFF'); WARM = hexrgb('#FFF2D0'); EMER = hexrgb('#00ff9c')
M3 = {'steel': mat('v3-dark-steel', (0.07, 0.08, 0.09), 0, 0.35, 0.8), 'char': mat('v3-charcoal-stone', (0.11, 0.115, 0.12), 0, 0.85),
      'graph': mat('v3-graphite', (0.16, 0.17, 0.18), 0, 0.4, 0.7), 'cyan': mat('v3-grid-cyan', CYAN, 4.0), 'cyanDim': mat('v3-cyan-dim', CYAN, 1.2),
      'ember': mat('v3-forge-ember', EMBER, 6.0), 'void': mat('v3-void-lip', VOID, 5.0), 'warm': mat('v3-window-warm', WARM, 2.6),
      'pale': mat('v3-pale-stone', (0.78, 0.78, 0.76), 0, 0.6), 'glassC': mat('v3-cyan-glass', (0.35, 0.8, 0.85), 0.25, 0.05, 0.3),
      'emer': mat('v3-emerald', EMER, 3.0), 'track': mat('v3-track', (0.018, 0.02, 0.024), 0, 0.6), 'plot': mat('v3-plot-pad', (0.06, 0.065, 0.07), 0, 0.9),
      'plotLine': mat('v3-plot-line-off', (0.12, 0.13, 0.14), 0, 0.7), 'trackEdge': mat('v3-track-edge', CYAN, 9.0), 'slot': mat('v3-art-slot-blank', (0.028, 0.03, 0.034), 0, 0.3, 0.2), 'beaconOff': mat('v3-beacon-off', (0.05, 0.05, 0.06), 0, 0.5), 'gold': MAT['gold']}
MARK = []
def marker(name, x, y, z=None, **props):
    z = GZ if z is None else z
    e = bpy.data.objects.new(name, None); e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 3; e.location = (x, y, z)
    for k, v in props.items():
        if v is not None: e[k] = json.dumps(v) if isinstance(v, (list, dict)) else v
    C['07_MARKERS'].objects.link(e); MARK.append({'name': name, 'pos_m': [round(x, 2), round(y, 2), round(z, 2)], 'props': props}); return e
# Marker data schema (city-v3/markers@2), mirrored by tools/city/normalize-markers.mjs: keep the two in sync (its --check cross-checks this file).
#   endpoints=[ep(service, method, path, status)]  machine-readable routes (status 'new' = service being written; method 'MCP' = MCP tool name)
#   sparks_price=number|None + price_rule='fixed'|'seller'|'per-skill'|'per-class'|'dynamic' (+ price_unit, price_key -> docs/city-v3/PRICES.md)
#   dashboard_id on every interactive marker; legacy={...} keeps the old prose fields for one release. No route pays SPARKS out.
def ep(service, method=None, path=None, status=None):
    d = {'service': service}
    if method: d['method'] = method
    if path: d['path'] = path
    if status: d['status'] = status
    return d
def frame(c_deg, r0):
    """local frame at bearing c: u = outward radial, v = clockwise tangent. P(u, v) → world xy; ROT = box rot (local y = u, local x = v)."""
    a = math.radians(c_deg); ux, uy = math.sin(a), math.cos(a); vx, vy = uy, -ux; cx, cy = r0 * ux, r0 * uy
    return (lambda u, v: (cx + ux * u + vx * v, cy + uy * u + vy * v)), math.radians(-c_deg)
def ellipse_pts(P, a_v, b_u, z, n=96): return [(*P(b_u * math.cos(2 * math.pi * k / n), a_v * math.sin(2 * math.pi * k / n)), z) for k in range(n + 1)]
def disc_fan(buf, pts, m):
    mi = buf.mi(m); cx = sum(p[0] for p in pts[:-1]) / (len(pts) - 1); cy = sum(p[1] for p in pts[:-1]) / (len(pts) - 1)
    ctr = buf.bm.verts.new((cx, cy, pts[0][2])); vs = [buf.bm.verts.new(p) for p in pts[:-1]]
    for k in range(len(vs)): f = buf.bm.faces.new((ctr, vs[k], vs[(k + 1) % len(vs)])); f.material_index = mi
def quad(buf, a, b, c, d, m):
    f = buf.bm.faces.new([buf.bm.verts.new(p) for p in (a, b, c, d)]); f.material_index = buf.mi(m)
def slots(a0, a1, r_in, r_out, depth_fn, width_fn, gap=(4, 6), row_gap=(5, 7), skip=None):
    """step-1 block slot generator for any wedge range: yields (x, y, ac, rc, w, d). spoke/ring road clearances like step 1."""
    for (b0, b1) in [(r0, r1) for (r0, r1) in ((170, 576), (576, 992), (992, GRID_R)) if r1 > r_in and r0 < r_out]:
        rin, rout = max(b0, r_in) + 8, min(b1, r_out) - 8; r = rin
        while r < rout - 10:
            d = depth_fn(); rc = r + d / 2
            if rc + d / 2 > rout: break
            amin = a0 + math.degrees(8 / rc); amax = a1 - math.degrees(8 / rc); a = amin
            while a < amax:
                w = width_fn(); da = math.degrees(w / rc)
                if a + da > amax: break
                ac = a + da / 2; x, y = at(ac, rc)
                if not (skip and skip(x, y, ac, rc)): yield (x, y, ac, rc, w, d)
                a += da + math.degrees(rng.uniform(*gap) / rc)
            r += d + rng.uniform(*row_gap)

# ── 00 GRID DO NOT TOUCH: the core disc (existing 3D city lives here in the game) — outline only, never exported ──
g0 = MeshBuf(); g0.annulus(166, 170, GZ + 0.3, M3['cyanDim'], seg=256); g0.to_object('CORE_EXISTING_CITY_r170_DO_NOT_BUILD', C['00_GRID_DO_NOT_TOUCH'])

# ── MONUMENT → COMMONS PLAZA (owner 2026-09-27: out of the centre, into the Commons square) ──
PLAZA_C = at(146.25, 784); PZ = H(*PLAZA_C)
for nm in ('LM_ShaddaiMonument_CentralStation', 'TXT_CENTRAL_STATION'):
    o = bpy.data.objects.get(nm)
    if o: o.location = (o.location.x + PLAZA_C[0], o.location.y + PLAZA_C[1], o.location.z + (PZ - GZ))
t_ = bpy.data.objects.get('TXT_CENTRAL_STATION')
if t_: t_.data.body = 'SHADDAI COMMONS'; t_.name = 'TXT_SHADDAI_COMMONS'
for cc in COLL['circle']:
    if cc['kind'] in ('monument', 'central-station-deck') and abs(cc['x']) < 1 and abs(cc['y']) < 1: cc['x'] = round(PLAZA_C[0], 2); cc['y'] = round(PLAZA_C[1], 2)
pl = MeshBuf(); pl.cyl(*PLAZA_C, PZ + 0.02, 72, 0.12, M3['char'], seg=96)   # plaza floor (monument deck r34 sits on it)
ring_pts = [(PLAZA_C[0] + 60 * math.sin(2 * math.pi * k / 128), PLAZA_C[1] + 60 * math.cos(2 * math.pi * k / 128), PZ + 0.16) for k in range(129)]
pl.ribbon(ring_pts, 0.6, M3['emer']); pl.to_object('COMMONS_PLAZA', C['06_COMMONS'])

SKY = MeshBuf(); SLOTS = []   # warm rooftop skylights (night top-down 'constellation') + art slot registry (art-slots-v4.json)
def art_slot(buf, kind, host, x, y, z, rot, w, h, face_off, add_mesh=True, ht=None):
    # empty slot = blank dark panel; filled = emissive artwork card (runtime swap by slot_id). face_off = local -y offset of the façade
    c_, s_ = math.cos(rot), math.sin(rot); fx, fy = x + face_off * s_, y - face_off * c_
    if add_mesh: buf.box(fx, fy, z, w, 0.06, h, rot, M3['slot'])
    SLOTS.append({'slot_id': '%s_%05d' % (kind, len(SLOTS) + 1), 'kind': kind, **ht, 'pos_m': [round(fx, 2), round(fy, 2), round(z, 2)], 'yaw': round(-math.degrees(rot), 2), 'w_m': w, 'h_m': h, 'filled': None, 'legacy': {'host': host}})

# ── 01 HOUSING: the 4 built wedges become lived-in (lit windows 45-60 %, arcade bands, courier pads) ──
hb = MeshBuf(); wb = MeshBuf(); blocks = [o for o in COLL['obb'] if o['kind'] == 'grid-block']
for bi, b in enumerate(blocks):
    c_, s_ = math.cos(b['rot']), math.sin(b['rot']); hx, hy = b['hx'], b['hy']; top = b['top'] - 0.3
    def W(lx, ly): return (b['x'] + lx * c_ - ly * s_, b['y'] + lx * s_ + ly * c_)
    for side in (-1, 1):                                                      # arcade band on both street faces (±y = radial faces)
        ax, ay = W(0, side * (hy + 1.75)); hb.box(ax, ay, GZ + 3.6, 2 * hx, 3.5, 0.25, b['rot'], M3['graph'])
        lx_, ly_ = W(0, side * (hy + 0.06)); hb.box(lx_, ly_, GZ + 3.3, 2 * hx * 0.92, 0.12, 0.15, b['rot'], M3['cyan'])
    p_lit = rng.uniform(0.45, 0.60); z = GZ + 4.4
    if rng.random() < p_lit: SKY.box(b['x'], b['y'], b['top'] + 0.02, 2 * hx * 0.45, 2 * hy * 0.35, 0.06, b['rot'], M3['warm'])
    art_slot(hb, 'SLOT_FACADE', 'housing', b['x'], b['y'], GZ + 4.6, b['rot'], 2.4, 3.0, hy + 0.1, ht={'host_type': 'housing', 'host_id': bi})                 # 1 façade slot on the core-facing face
    art_slot(hb, 'SLOT_HOME', 'housing', b['x'], b['y'], GZ + 5.0, b['rot'], 1.6, 1.1, 0, add_mesh=False, ht={'host_type': 'housing', 'host_id': bi})         # interior home slot (data only)
    while z + 1.8 < top:
        for (face, half, span) in ((1, hy, hx), (-1, hy, hx), (2, hx, hy), (-2, hx, hy)):
            nb_ = max(1, int(2 * span // 6)); bw = 2 * span / nb_
            for k in range(nb_):
                if rng.random() > p_lit: continue
                o_ = -span + bw * (k + 0.5); wm = M3['cyanDim'] if rng.random() < 0.05 else M3['warm']
                if abs(face) == 1:
                    y0 = face * (half + 0.04); pts = [W(o_ - bw * 0.38, y0), W(o_ + bw * 0.38, y0)]
                else:
                    x0 = (face // 2) * (half + 0.04); pts = [W(x0, o_ - bw * 0.38), W(x0, o_ + bw * 0.38)]
                quad(wb, (*pts[0], z), (*pts[1], z), (*pts[1], z + 1.7), (*pts[0], z + 1.7), wm)
        z += 3.2
tall = sorted(blocks, key=lambda b: -b['top'])[:12]
for b in tall:                                                               # rooftop courier pads (apartment pads, not the Perch)
    hb.cyl(b['x'], b['y'], b['top'], 1.4, 0.2, M3['graph'], seg=24); hb.cyl(b['x'], b['y'], b['top'] + 0.2, 1.5, 0.05, M3['cyan'], seg=24)
    for k in range(8): a = k / 8 * 2 * math.pi; hb.box(b['x'] + 1.6 * math.cos(a), b['y'] + 1.6 * math.sin(a), b['top'], 0.08, 0.08, 0.9, 0, M3['steel'])
hb.to_object('HOUSING_Arcades_CourierPads', C['01_HOUSING']); wb.to_object('HOUSING_Windows_Lit', C['01_HOUSING'])
LOG.setdefault('metrics', {}); LOG['metrics']['v3_housing_blocks'] = len(blocks); LOG['metrics']['v3_courier_pads'] = len(tall)

# ── 06 COMMONS (SE petal): the 9-type Shaddai building library (instances; game gets grid-commons-v4.json) ──
SCD = os.path.join(REPO, '.bl-cache', 'sc'); META = json.load(open(os.path.join(SCD, 'sc-types.json')))
PROTO = {}; libc = bpy.data.collections.new('_sc_proto'); bpy.context.scene.collection.children.link(libc)
for key in META:
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(SCD, key + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]; ob = next(o for o in new if o.type == 'MESH')
    for o in new:
        for cc in o.users_collection: cc.objects.unlink(o)
        libc.objects.link(o)
    ob.rotation_mode = 'XYZ'; dm = ob.modifiers.new('proxy', 'DECIMATE'); dm.ratio = 0.07          # Blender proxy only; the game gets full + LODs
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.modifier_apply(modifier='proxy'); ob.select_set(False)
    ob.hide_render = True; ob.hide_set(True); PROTO[key] = ob
libc.hide_render = True
ITEMS = []
def fabric(a0, a1, weights, caps, skip, cluster, col, gap=(5, 8), row_gap=(5, 7)):
    used = {}; n0 = len(ITEMS)
    def pk():
        ws = [(k, w) for k, w in weights if used.get(k, 0) < caps.get(k, 10 ** 9)]
        t = rng.uniform(0, sum(w for _, w in ws))
        for k, w in ws:
            t -= w
            if t <= 0: return k
        return ws[0][0]
    cur = {'k': pk()}
    def cw(): cur['k'] = pk(); return META[cur['k']]['w'] + 0.0
    for (x, y, ac, rc, w, d) in slots(a0, a1, 170, GRID_R, lambda: 22.0, cw, gap=gap, row_gap=row_gap, skip=skip):
        k = cur['k']
        if k == 'sc-teleport' and any(it['key'] == k and math.hypot(it['x_m'] - x, it['y_m'] - y) < 260 for it in ITEMS): k = 'sc-garden'   # teleports spread out
        used[k] = used.get(k, 0) + 1; m = META[k]; rot = math.radians(-ac)
        o = PROTO[k].copy(); o.hide_render = False; col.objects.link(o); o.hide_set(False); o.location = (x, y, GZ); o.rotation_euler = (0, 0, rot)
        L = max(PROTO[k].dimensions.x, PROTO[k].dimensions.y)
        ITEMS.append({'key': k, 'x_m': round(x, 1), 'y_m': round(y, 1), 'len_m': round(L, 2), 'yaw': round(-math.degrees(rot), 2), 'lift_m': 0, 'by_height': False, 'cluster': cluster})
        if m['collider']:
            COLL['obb'].append({'x': round(x, 2), 'y': round(y, 2), 'hx': m['w'] / 2, 'hy': m['d'] / 2, 'rot': round(rot, 4), 'top': round(GZ + m['h'], 2), 'kind': cluster + '-' + k[3:]})
            if rng.random() < 0.55: SKY.box(x, y, GZ + m['h'] + 0.35, m['w'] * 0.35, m['d'] * 0.3, 0.06, rot, M3['warm'])
            art_slot(None, 'SLOT_FACADE', '%s item %d (%s; library artslot-* material)' % (cluster, len(ITEMS) - 1, k), x, y, GZ + 3.4, rot, 2.4, 2.4, m['d'] / 2 + 0.1, add_mesh=False, ht={'host_type': 'fabric', 'host_id': len(ITEMS) - 1, 'host_key': k, 'host_cluster': cluster})
    return len(ITEMS) - n0

# Culture Lane (owner culture addendum): ONE short street off the monument plaza, heading outward along the petal axis
LANE_B = 146.25; PL_, LROT = frame(LANE_B, 784)       # u = outward from the plaza centre, v = clockwise
LANE_U0, LANE_U1 = 74, 196
def in_lane(x, y):
    dx, dy = x - PLAZA_C[0], y - PLAZA_C[1]; a = math.radians(LANE_B); u = dx * math.sin(a) + dy * math.cos(a); v = dx * math.cos(a) - dy * math.sin(a)
    return LANE_U0 - 10 < u < LANE_U1 + 12 and abs(v) < 36
QP = next(a['pos_m'] for a in LAY['agents'] if a['id'] == 'quill')
def commons_skip(x, y, ac, rc): return math.hypot(x - PLAZA_C[0], y - PLAZA_C[1]) < 84 or math.hypot(x - QP[0], y - QP[1]) < 20 or in_lane(x, y)
W_COMMONS = [('sc-storefront-s', 22), ('sc-storefront-l', 13), ('sc-office', 16), ('sc-office-mid', 14), ('sc-market', 6), ('sc-techlab', 7), ('sc-garden', 12), ('sc-teleport', 3), ('sc-civic-tower', 4)]
LOG['metrics']['v3_commons_items'] = fabric(112.5, 180.0, W_COMMONS, {'sc-civic-tower': 10, 'sc-teleport': 8, 'sc-market': 24}, commons_skip, 'commons', C['06_COMMONS'])
for sp in (135.0, 157.5):
    for r_ in range(260, int(GRID_R) - 60, 110):
        x, y = at(sp + math.degrees(9 / r_), r_); o = PROTO['sc-ad-pylon'].copy(); o.hide_render = False; C['06_COMMONS'].objects.link(o); o.hide_set(False)
        o.location = (x, y, GZ); rot = math.radians(-sp); o.rotation_euler = (0, 0, rot)
        ITEMS.append({'key': 'sc-ad-pylon', 'x_m': round(x, 1), 'y_m': round(y, 1), 'len_m': round(max(PROTO['sc-ad-pylon'].dimensions.x, PROTO['sc-ad-pylon'].dimensions.y), 2), 'yaw': round(-math.degrees(rot), 2), 'lift_m': 0, 'by_height': False, 'cluster': 'commons'})

# ── HUB_HOME_A..F, STALL_001..012, NODE_MAIL ──
hubs = []
for i, (c0, r_) in enumerate(((2.0, 700), (92.0, 700), (182.0, 700), (272.0, 700))):   # A-D: one per built wedge, on the spoke sidewalk
    x, y = at(c0, r_); hubs.append((x, y))
    marker('HUB_HOME_' + 'ABCD'[i], x, y, slot_type='both', rent_sparks_per_day=5, vendor_enabled=True, agent_capacity=2, dashboard_id='home.' + 'abcd'[i], home_id='home.' + 'abcd'[i], endpoints=[ep('home', 'GET', '/api/home/status', 'new'), ep('home', 'POST', '/api/home/inhabit', 'new'), ep('home', 'POST', '/api/home/rent', 'new'), ep('home', 'POST', '/api/home/checkin', 'new')], sparks_price=5, price_rule='fixed', price_key='home.rent', price_unit='day')
for i, a_ in enumerate((120, 175)):                                           # E-F: Commons, on the plaza ring
    x, y = PLAZA_C[0] + 66 * math.sin(math.radians(a_)), PLAZA_C[1] + 66 * math.cos(math.radians(a_))
    marker('HUB_HOME_' + 'EF'[i], x, y, slot_type='home', rent_sparks_per_day=5, vendor_enabled=False, agent_capacity=3, dashboard_id='home.' + 'ef'[i], home_id='home.' + 'ef'[i], endpoints=[ep('home', 'GET', '/api/home/status', 'new'), ep('home', 'POST', '/api/home/inhabit', 'new'), ep('home', 'POST', '/api/home/rent', 'new'), ep('home', 'POST', '/api/home/checkin', 'new')], sparks_price=5, price_rule='fixed', price_key='home.rent', price_unit='day')
st = MeshBuf(); n_ = 0
for (hx_, hy_) in hubs:                                                       # 6 stalls near hubs A-D (arcade edges), 6 around the plaza
    for k in range(2 if n_ < 4 else 1):
        if n_ >= 6: break
        x, y = hx_ + (k * 4 - 2), hy_ - 5; n_ += 1
        st.box(x, y, GZ, 2, 2, 0.12, 0, M3['graph']); st.box(x, y, GZ + 0.12, 2.1, 0.08, 0.05, 0, M3['emer'])
        marker('STALL_%03d' % n_, x, y, pad_m=2, sparks_price=None, price_rule='seller', price_key='bazaar.item', paybox_merchant_id='stall.%03d' % n_, endpoints=[ep('bazaar', 'GET', '/api/bazaar/list'), ep('bazaar', 'POST', '/api/bazaar/buy')], vendor_offline=True, dashboard_id='stall.%03d' % n_, legacy={'endpoint': 'bazaar-routes', 'sparks_price': 0})
for k in range(6):
    n_ += 1; a_ = math.radians(30 + k * 50); x, y = PLAZA_C[0] + 74 * math.sin(a_), PLAZA_C[1] + 74 * math.cos(a_)
    st.box(x, y, PZ, 2, 2, 0.12, a_, M3['graph']); st.box(x, y, PZ + 0.12, 2.1, 0.08, 0.05, a_, M3['emer'])
    marker('STALL_%03d' % n_, x, y, PZ, pad_m=2, sparks_price=None, price_rule='seller', price_key='bazaar.item', paybox_merchant_id='stall.%03d' % n_, endpoints=[ep('bazaar', 'GET', '/api/bazaar/list'), ep('bazaar', 'POST', '/api/bazaar/buy')], vendor_offline=True, dashboard_id='stall.%03d' % n_, legacy={'endpoint': 'bazaar-routes', 'sparks_price': 0})
st.to_object('STALL_Pads', C['06_COMMONS'])
x, y = PLAZA_C[0] - 70 * math.sin(math.radians(146.25)), PLAZA_C[1] - 70 * math.cos(math.radians(146.25))   # plaza edge on the core-facing side
marker('NODE_MAIL', x, y, PZ, endpoints=[ep('agentmail', 'GET', '/api/agentmail/messages')], dashboard_id='mail', legacy={'endpoint': 'agentmail-routes'})

# ── CULTURE LANE (SE Commons, off the monument plaza): broadcast booth, gallery shop, arcade alcove, 4 studios. NOT a 5th petal. ──
cl = MeshBuf(); lz = PZ
cl.ribbon([(*PL_(u_, 0), lz + 0.1) for u_ in range(LANE_U0 - 2, LANE_U1 + 2, 4)], 10, M3['char'])
for s_ in (-1, 1): cl.ribbon([(*PL_(u_, s_ * 5.2), lz + 0.14) for u_ in range(LANE_U0 - 2, LANE_U1 + 2, 4)], 0.3, M3['emer'])
def lane_bld(name, u0, u1, side, depth, h, m, glass=True):
    uc = (u0 + u1) / 2; vc = side * (6.5 + depth / 2); x, y = PL_(uc, vc)
    cl.box(x, y, lz, depth, u1 - u0, h, LROT, m); cl.box(x, y, lz + h, depth + 0.3, u1 - u0 + 0.3, 0.3, LROT, M3['graph'])
    if glass: cl.box(*PL_(uc, side * 6.45), lz + 0.2, 0.08, (u1 - u0) * 0.8, h * 0.55, LROT, M3['glassC'])        # lane-facing shopfront
    cl.box(*PL_(uc, side * 6.4), lz + h * 0.62, 0.1, (u1 - u0) * 0.9, 0.14, LROT, M3['emer'])                      # emerald lintel
    COLL['obb'].append({'x': round(x, 2), 'y': round(y, 2), 'hx': depth / 2, 'hy': (u1 - u0) / 2, 'rot': round(LROT, 4), 'top': round(lz + h, 2), 'kind': 'culture-' + name.lower()})
    return x, y, uc, vc
bx, by, bu, bv = lane_bld('BLD_BROADCAST', 78, 94, -1, 12, 9, M3['steel'])
cl.box(*PL_(bu, bv), lz + 9.3, 0.4, 0.4, 3.0, LROT, M3['steel']); cl.cyl(*PL_(bu, bv), lz + 12.0, 0.5, 1.5, M3['graph'], seg=24, r2=3.2, open_top=True)   # roof dish
cl.box(*PL_(bu, -6.35), lz + 7.4, 0.1, 5, 0.6, LROT, M3['cyan'])                                                       # ON-AIR bar
marker('BLD_BROADCAST', bx, by, lz, endpoints=[ep('radio', 'GET', '/api/radio/queue', 'new')], skill_required='music.compose|music.perform', dashboard_id='culture.radio', legacy={'endpoint': 'radio queue (new, SPARKS-only; tiny capped per-spin pay)'})
marker('OBJ_RADIO_QUEUE', *PL_(bu, -5.0), lz, queue='city radio + building speakers', unlock_slot_sparks=5, spin_pay_sparks_capped=True, dashboard_id='culture.radio.queue', endpoints=[ep('radio', 'GET', '/api/radio/queue', 'new'), ep('radio', 'POST', '/api/radio/queue/unlock', 'new')], sparks_price=5, price_rule='fixed', price_key='radio.slot_unlock', price_unit='each')
gx_, gy_, gu, gv = lane_bld('BLD_GALLERY_SHOP', 100, 124, -1, 12, 6.5, M3['pale'])
for k in range(8):                                                                                                   # SLOT_GALLERY_01-08: blank until a piece is placed
    uu = 102 + (k % 4) * 5.5; zz = lz + (1.3 if k < 4 else 3.7)
    cl.box(*PL_(uu, -6.52), zz, 0.05, 2.0, 1.6, LROT, M3['slot'])
    marker('SLOT_GALLERY_%02d' % (k + 1), *PL_(uu, -6.52), zz, slot_kind='SLOT_GALLERY', filled=None, nft_later='optional provenance flag only', dashboard_id='culture.gallery.slot.%02d' % (k + 1), endpoints=[ep('bazaar', 'POST', '/api/bazaar/buy')], sparks_price=None, price_rule='seller', price_key='gallery.piece', legacy={'price_sparks': 'set by seller'})
    gp_ = PL_(uu, -6.52); SLOTS.append({'slot_id': 'SLOT_GALLERY_%02d' % (k + 1), 'kind': 'SLOT_GALLERY', 'host_type': 'gallery', 'host_id': 'BLD_GALLERY_SHOP', 'pos_m': [round(gp_[0], 2), round(gp_[1], 2), round(zz, 2)], 'yaw': round(-math.degrees(LROT + math.pi / 2), 2), 'w_m': 2.0, 'h_m': 1.6, 'filled': None, 'legacy': {'host': 'BLD_GALLERY_SHOP'}})
marker('BLD_GALLERY_SHOP', gx_, gy_, lz, endpoints=[ep('bazaar', 'GET', '/api/bazaar/list'), ep('bazaar', 'POST', '/api/bazaar/list-item')], sparks_price=None, price_rule='fixed', price_key='gallery.listing', price_unit='each', dashboard_id='culture.gallery', legacy={'endpoint': 'bazaar-routes (SPARKS; PayBox/x402 pay-IN only)'})
marker('OBJ_EXHIBIT_INTAKE', *PL_(126.5, -6.0), lz, submits_to='TURTLE museum (core city) — jury, scarce', skill_required='oracle.exhibit', dashboard_id='culture.exhibit', endpoints=[], sparks_price=None, price_rule='fixed', price_key='exhibit.submit', price_unit='each')
cl.box(*PL_(126.5, -7.0), lz, 1.0, 1.2, 1.4, LROT, M3['graph']); cl.box(*PL_(126.5, -6.45), lz + 1.0, 0.05, 0.9, 0.3, LROT, M3['cyan'])
ax_, ay_, au, av = lane_bld('BLD_ARCADE', 78, 94, 1, 12, 5.5, M3['steel'])
for k in range(4):                                                                                                   # 4 cabinets, no casino floor
    cx2, cy2 = PL_(80.5 + k * 3.8, 8.6); cl.box(cx2, cy2, lz, 0.9, 0.8, 1.9, LROT, M3['graph']); cl.box(*PL_(80.5 + k * 3.8, 8.15), lz + 1.1, 0.05, 0.6, 0.5, LROT, M3['cyan'])
    marker('ARCADE_CAB_%02d' % (k + 1), cx2, cy2, lz, game=['reflex', 'rhythm', 'prediction', 'skill'][k], prize='SPARKS or cosmetics (no gambling)', dashboard_id='culture.arcade.cab.%02d' % (k + 1), endpoints=[ep('arcade', 'GET', '/api/arcade/games'), ep('arcade', 'POST', '/api/arcade/result')])
marker('BLD_ARCADE', ax_, ay_, lz, note='arcade alcove: 4 skill cabinets; the Hall stays inside ZEROX downtown', dashboard_id='culture.arcade', endpoints=[ep('arcade', 'GET', '/api/arcade/games'), ep('arcade', 'GET', '/api/arcade/leaderboard')])
for k in range(4):                                                                                                   # STUDIO_01-04: tiny rentable production rooms
    sx2, sy2, su, sv = lane_bld('STUDIO_%02d' % (k + 1), 100 + k * 10, 108 + k * 10, 1, 8, 4.5, M3['graph'])
    cl.box(*PL_(su, 6.47), lz + 2.2, 0.06, 5.0, 1.2, LROT, M3['warm'])
    marker('STUDIO_%02d' % (k + 1), sx2, sy2, lz, rent_sparks_per_day=3, for_skills=['music.compose', 'turtle.art.motion', 'quill.lyric'], dashboard_id='culture.studio.%02d' % (k + 1), endpoints=[ep('economy', 'POST', '/api/economy/spend')], sparks_price=3, price_rule='fixed', price_key='studio.rent', price_unit='day')
cl.box(*PL_(166, 7.9), lz, 0.5, 48, 4.2, LROT, M3['graph'])   # the agent art wall
for k in range(6): art_slot(cl, 'SLOT_FACADE', 'culture lane wall', *PL_(144 + k * 8, 7.2), lz + 1.6, LROT + math.pi / 2, 2.4, 2.4, 0.0, ht={'host_type': 'culture-lane', 'host_id': 'CULTURE_LANE'})   # agent art wall
cl.to_object('CULTURE_LANE', C['06_COMMONS']); marker('CULTURE_LANE', *PL_((LANE_U0 + LANE_U1) / 2, 0), lz, note='a block, not a petal', dashboard_id='culture', endpoints=[])

# ── 02 ACADEMY + FORGE campus (NE petal, outer third, plaza faces the core) ──
CC = 56.25; P, ROT = frame(CC, 1290); cz = H(*P(0, 0)); cb = MeshBuf()
disc_fan(cb, ellipse_pts(P, 46, 30, cz + 0.05), M3['char'])
cb.ribbon(ellipse_pts(P, 40, 25, cz + 0.12), 0.7, M3['cyan'])             # cyan clock ring
for k in range(12):                                                           # clock ticks
    a = 2 * math.pi * k / 12; x, y = P(25 * math.cos(a) * 0.92, 40 * math.sin(a) * 0.92); cb.box(x, y, cz + 0.1, 0.5, 2.2 if k % 3 == 0 else 1.2, 0.08, ROT + a, M3['cyan'])
cb.to_object('CAMPUS_PLAZA', C['02_ACADEMY_FORGE'])
hbd = MeshBuf(); x, y = P(0, 0)
hbd.box(x, y, cz, 3.2, 0.9, 10.5, ROT, M3['steel'], taper=0.86)
for side in (-1, 1): xx, yy = P(side * 0.47, 0); hbd.box(xx, yy, cz + 2.0, 2.4, 0.04, 7.2, ROT, M3['cyan'])
hbd.to_object('OBJ_HIRING_BOARD', C['02_ACADEMY_FORGE'])
COLL['obb'].append({'x': round(x, 2), 'y': round(y, 2), 'hx': 1.6, 'hy': 0.45, 'rot': round(ROT, 4), 'top': round(cz + 10.5, 2), 'kind': 'hiring-board'})
marker('OBJ_HIRING_BOARD', x, y, cz, endpoints=[ep('hire', 'GET', '/api/hire/rates'), ep('hire', 'POST', '/api/hire/:agent'), ep('x402-agent', 'POST', '/api/x402/agent/:name/hire'), ep('work-sessions', 'POST', '/api/work/assign'), ep('work-sessions', 'GET', '/api/work/active')], sparks_price=None, price_rule='dynamic', price_key='hire.contract', skill_required='work.hire', dashboard_id='hiring', paybox_merchant_id='city.hiring', legacy={'endpoint': 'hire-routes:/api/hire/rates,/api/hire/:agent; x402-agent-routes:/:name/hire; work-sessions:/assign'})
kx, ky = P(-20, 30); kb = MeshBuf(); kb.box(kx, ky, cz, 1.2, 0.8, 2.2, ROT, M3['graph']); kb.box(*P(-20.42, 30), cz + 1.1, 0.9, 0.04, 0.7, ROT, M3['cyan'])
for k in range(4): a = k * math.pi / 4; kb.box(kx, ky, cz + 2.2, 1.0 * abs(math.cos(a)) + 0.12, 0.12 + 1.0 * abs(math.sin(a)), 0.1, ROT, M3['gold'])   # spark glyph
kb.to_object('OBJ_SPARKS_KIOSK', C['02_ACADEMY_FORGE'])
marker('OBJ_SPARKS_KIOSK', kx, ky, cz, endpoints=[ep('economy', 'GET', '/api/economy/balance'), ep('economy', 'GET', '/api/economy/catalog'), ep('economy', 'POST', '/api/economy/catalog/purchase')], sparks_price=None, price_rule='dynamic', price_key='kiosk.catalog', paybox_merchant_id='city.kiosk', dashboard_id='sparks', legacy={'endpoint': 'economy-routes:/balance,/catalog,/catalog/purchase'})
for nm, (u_, v_) in (('SPAWN_TRAINEE', (-10, -30)), ('SPAWN_TEACHER', (8, -34)), ('SPAWN_HIRE', (-14, 8))): marker(nm, *P(u_, v_), cz)

# Forge wing (+v side, toward Emberfall): long open-ended foundry, ribs every 8 m, ember only in bay throats
fb = MeshBuf(); FV = 74; U0, U1 = -32, 56
fb.box(*P((U0 + U1) / 2, FV), cz, 36, U1 - U0, 0.3, ROT, M3['char'])
for k in range(int((U1 - U0) / 8) + 1):
    u_ = U0 + k * 8
    for s_ in (-1, 1): fb.box(*P(u_, FV + s_ * 18), cz, 1.0, 1.0, 16, ROT, M3['steel'])
    fb.box(*P(u_, FV), cz + 16, 37, 1.0, 1.4, ROT, M3['steel'])
    if k < int((U1 - U0) / 8): fb.box(*P(u_ + 4, FV), cz + 16.9, 36.5, 6.8, 0.25, ROT, M3['graph'])   # roof panels with 1.2 m light slits between
for s_ in (-1, 1): fb.box(*P((U0 + U1) / 2, FV + s_ * 8), cz + 12, 0.6, U1 - U0, 0.8, ROT, M3['steel'])      # gantries
for k, (u_, v_) in enumerate([(u, FV + v) for u in (-14, 6, 26) for v in (-8, 8)]):
    fb.box(*P(u_, v_), cz + 0.3, 8, 10, 0.02, ROT, M3['steel'])
    for (du, dv, su, sv) in ((5, 0, 0.3, 8), (-5, 0, 0.3, 8), (0, 4, 10, 0.3), (0, -4, 10, 0.3)): fb.box(*P(u_ + du, v_ + dv), cz + 0.3, sv, su, 0.06, ROT, M3['ember'] if du > 0 else M3['steel'])
    fb.box(*P(u_ + 4.9, v_), cz + 0.3, 6, 0.4, 1.4, ROT, M3['ember'])        # the bay throat (only orange light)
    marker('BAY_%02d' % (k + 1), *P(u_, v_), cz, skill_install=True, dashboard_id='forge.bay.%02d' % (k + 1), endpoints=[ep('skills-market', 'GET', '/api/skills/receipts')])
for u_ in range(U0 + 4, U1, 8): fb.box(*P(u_, FV), cz + 0.3, 0.3, 3.0, 0.03, ROT, M3['ember'])               # floor channel dashes
gx0 = FV + 0.0                                                               # roof glyph: anvil + circuit (cyan, readable top-down)
for (du, dv, su, sv) in ((10, 0, 4, 16), (6, 0, 4, 6), (2, 0, 3, 11)): fb.box(*P(du, gx0 + dv), cz + 17.2, sv, su, 0.2, ROT, M3['cyan'])
for (du, dv, su, sv) in ((-6, -5, 12, 0.5), (-12, -5, 0.5, 8), (-6, 5, 12, 0.5), (-12, 5, 0.5, 8)): fb.box(*P(du, gx0 + dv), cz + 17.2, sv, su, 0.2, ROT, M3['cyan'])
fb.to_object('FORGE_HALL', C['02_ACADEMY_FORGE'])
fr = MeshBuf()
for i, (u_, v_) in enumerate(((-18, 44), (-10, 46), (-2, 44))):             # FRAME_01-03 in the yard (03 = winged: wings ARE the forelimbs, no hands)
    x, y = P(u_, v_); fr.cyl(x, y, cz, 1.6, 0.25, M3['graph'], seg=20)
    for s_ in (-0.35, 0.35): fr.box(*P(u_, v_ + s_), cz + 0.25, 0.35, 0.4, 2.2, ROT, M3['graph'])
    fr.box(x, y, cz + 2.45, 1.1, 0.6, 0.4, ROT, M3['steel']); fr.box(x, y, cz + 2.85, 1.3, 0.75, 1.6, ROT, M3['graph'], taper=0.85); fr.box(x, y, cz + 4.5, 0.55, 0.55, 0.55, ROT, M3['steel'])
    fr.box(x, y, cz + 3.9, 0.35, 0.8, 0.12, ROT, M3['cyan'])
    if i < 2:
        for s_ in (-0.85, 0.85): fr.box(*P(u_, v_ + s_), cz + 2.3, 0.3, 0.3, 1.8, ROT, M3['graph'])
    else:
        for s_ in (-1, 1):
            fr.box(*P(u_, v_ + s_ * 1.3), cz + 4.0, 1.4, 0.3, 0.3, ROT, M3['graph']); fr.box(*P(u_ - 0.2, v_ + s_ * 2.6), cz + 2.6, 2.4, 0.05, 1.8, ROT, M3['steel'])
    marker('FRAME_%02d' % (i + 1), x, y, cz, frame_type='winged' if i == 2 else 'bipedal', skill_required='forge.frame.winged' if i == 2 else 'forge.frame.basic', hands=(i < 2), dashboard_id='forge.frame.%02d' % (i + 1), endpoints=[])
x, y = P(-26, 50); fr.box(x, y, cz, 0.9, 0.9, 1.2, ROT, M3['steel']); fr.box(x, y, cz + 1.2, 0.08, 0.5, 0.02, ROT, M3['cyan']); fr.cyl(x, y, cz + 0.02, 1.3, 0.04, M3['cyanDim'], seg=24)
marker('NODE_SKILL_INSTALL', x, y, cz, endpoints=[ep('skills-market', 'POST', '/api/skills/market/:id/run'), ep('skills-market', 'GET', '/api/skills/receipts')], paybox_merchant_id='forge.install', sparks_price=None, price_rule='per-skill', price_key='install.tier', seat_anim_s=3, dashboard_id='forge.install', legacy={'endpoint': 'skills-market-routes:/api/skills/market/:id/run,/api/skills/receipts', 'sparks_price': 'per skill (DOC_SKILLS)'})
x, y = P(-26, 54); fr.box(x, y, cz, 0.9, 2.4, 0.9, ROT, M3['graph']); fr.box(*P(-26.4, 54), cz + 0.9, 0.1, 2.0, 1.2, ROT, M3['steel'])
marker('NODE_REPAIR', x, y, cz, skill_required='forge.repair', dashboard_id='forge.repair', endpoints=[], sparks_price=None, price_rule='fixed', price_key='forge.repair', price_unit='each')
fr.to_object('FORGE_Frames_Install_Repair', C['02_ACADEMY_FORGE'])

# Academy wing (-v side): half-bowl lecture terrace facing the plaza + 3-level hall behind (pale stone, cyan glass fins, no orange)
ab = MeshBuf(); AV = -95; AU = 18; AF = AV + 30   # AF = plaza-facing façade (hall is 60 m along v)
ab.box(*P(AU, AV), cz, 60, 34, 0.3, ROT, M3['pale'])
for k in range(4): ab.box(*P(AU - 12 + k * 8.5, AV - 6), cz + 0.3, 12, 7.5, 4.2, ROT, M3['glassC']); marker('CLASS_%02d' % (k + 1), *P(AU - 12 + k * 8.5, AV - 6), cz, endpoints=[ep('academy', 'GET', '/api/academy/catalog'), ep('academy', 'POST', '/api/academy/quote'), ep('academy', 'POST', '/api/academy/open_tab'), ep('academy', 'POST', '/api/academy/spend'), ep('academy', 'POST', '/api/academy/close_tab')], sparks_price=None, price_rule='per-class', price_key='academy.tuition', dashboard_id='academy.class.%02d' % (k + 1), legacy={'endpoint': 'academy-routes:/catalog,/quote,/open_tab,/spend,/close_tab'})
ab.box(*P(AU, AV), cz + 4.5, 56, 30, 4.5, ROT, M3['pale']); marker('ARCHIVE', *P(AU, AV), cz + 4.5, dashboard_id='academy.archive', endpoints=[], note='ORACLE research wing (ORACLE pad nearby)')
ab.box(*P(AU, AV), cz + 9.0, 56, 30, 4.2, ROT, M3['glassC']); ab.box(*P(AU, AV), cz + 13.2, 57, 31, 0.4, ROT, M3['pale'])
for k in range(14): ab.box(*P(AU - 16 + k * 2.45, AF + 0.6), cz + 0.3, 1.2, 0.2, 12.8, ROT, M3['glassC'])                         # cyan glass fins (plaza-facing)
for k in range(18): ab.box(*P(AU - 17 + k * 2.0, AF + 0.5), cz + 13.6, 0.06, 0.06, 1.0, ROT, M3['steel'])
ab.box(*P(AU, AF + 0.5), cz + 14.6, 0.06, 34, 0.06, ROT, M3['cyan']); marker('DECK_OBSERVE', *P(AU, AV), cz + 13.6, walkable=True)
ab.box(*P(AU + 10, AF + 0.4), cz + 5.5, 0.2, 8, 4, ROT, M3['cyan']); marker('OBJ_CLASS_BOARD', *P(AU + 10, AF + 0.4), cz + 5.5, endpoints=[ep('academy', 'GET', '/api/academy/catalog')], dashboard_id='academy.board', legacy={'endpoint': 'academy-routes:/catalog'})
for i in range(7):                                                            # half-bowl rows (open toward the plaza, +v)
    r_ = 6 + i * 2.2
    for k in range(18):
        a = math.pi * (k + 0.5) / 18; ab.box(*P(-4 + r_ * math.cos(a) * 0 + (r_ * math.cos(a)), AF + 20 - r_ * math.sin(a) * 0.9), cz + i * 0.45, 2.0, 1.9, 0.45 * (i + 1), ROT + a, M3['pale'])
x, y = P(-4, AF + 20); ab.cyl(x, y, cz, 3.2, 0.6, M3['pale'], seg=32); ab.cyl(x, y, cz + 0.6, 3.3, 0.05, M3['cyan'], seg=32)
marker('OBJ_GRADUATION_DAIS', x, y, cz + 0.6, dashboard_id='academy.graduation', endpoints=[])
gx, gy = P(AU, AV)                                                           # roof glyph: open ring + eye
for k in range(40): a = 2 * math.pi * k / 40; ab.box(gx + 10 * math.cos(a), gy + 10 * math.sin(a), cz + 13.7, 1.6, 0.7, 0.15, a + math.pi / 2, M3['cyan'])
ab.box(gx, gy, cz + 13.7, 3.0, 3.0, 0.2, ROT, M3['cyan'])
for nm, u_, sk_ in (('CLASS_ART', 33, ['turtle.art.still', 'turtle.art.motion', 'quill.prose', 'quill.lyric', 'oracle.exhibit']), ('CLASS_MUSIC', 44, ['music.compose', 'music.perform'])):
    ab.box(*P(u_, AF + 6), cz, 10, 10, 5.0, ROT, M3['glassC']); ab.box(*P(u_, AF + 6), cz + 5.0, 10.4, 10.4, 0.3, ROT, M3['pale'])   # practice rooms beside the terrace
    marker(nm, *P(u_, AF + 6), cz, teaches=sk_, endpoints=[ep('academy', 'GET', '/api/academy/catalog'), ep('academy', 'POST', '/api/academy/quote'), ep('academy', 'POST', '/api/academy/open_tab'), ep('academy', 'POST', '/api/academy/spend'), ep('academy', 'POST', '/api/academy/close_tab')], sparks_price=None, price_rule='per-class', price_key='academy.tuition', dashboard_id='academy.' + nm[6:].lower(), legacy={'endpoint': 'academy-routes:/catalog,/quote,/open_tab,/spend,/close_tab'})
ab.to_object('ACADEMY_HALL', C['02_ACADEMY_FORGE'])
COLL['obb'].append({'x': round(gx, 2), 'y': round(gy, 2), 'hx': 28, 'hy': 15, 'rot': round(ROT, 4), 'top': round(cz + 13.6, 2), 'kind': 'academy-hall'})
sp = MeshBuf()                                                                # canopy spine linking Forge ↔ Academy (connected roofs)
sp.box(*P(26, 0), cz + 12, AV * -1 + FV + 10, 6, 0.4, ROT, M3['graph']); sp.box(*P(26, 0), cz + 11.9, AV * -1 + FV + 10, 0.4, 0.1, ROT, M3['cyan'])
for v_ in range(AF + 4, FV - 17, 12): sp.box(*P(26, v_), cz, 0.5, 0.5, 12, ROT, M3['steel'])
sp.to_object('CAMPUS_CanopySpine', C['02_ACADEMY_FORGE'])
CAMPUS_PLAZA_POS = P(0, 0)

# ── 03 PERCH (NE outer rim, behind the campus, off the race line) — tallest new thing, void-purple lip only ──
PX_, PY_ = at(50.0, 1520); pz_ = H(PX_, PY_); pb = MeshBuf(); PH = 84
pb.box(PX_, PY_, pz_, 10, 10, PH, math.radians(-50), M3['steel'], taper=0.55)
pb.box(*at(50.0, 1520 - 6.5), pz_, 3, 3, PH, math.radians(-50), M3['glassC'])                                 # elevator shaft
pb.cyl(PX_, PY_, pz_ + PH - 10, 5, 10, M3['graph'], r2=20, seg=40)                                             # crown cone
pb.cyl(PX_, PY_, pz_ + PH, 22, 2.5, M3['graph'], seg=64); pb.cyl(PX_, PY_, pz_ + PH + 2.5, 22.3, 0.6, M3['void'], seg=64, open_top=True)
for k in range(4):                                                            # cyan approach chevrons on the crown
    a = math.radians(-50 + 90 * k); cx_, cy_ = PX_ + 15 * math.sin(a), PY_ + 15 * math.cos(a)
    for s_ in (-1, 1): pb.box(cx_ + s_ * 1.6 * math.cos(a), cy_ - s_ * 1.6 * math.sin(a), pz_ + PH + 2.5, 0.5, 4.0, 0.06, -a + s_ * 0.6, M3['cyan'])
for k in range(6): a = 2 * math.pi * k / 6; pb.box(PX_ + 21 * math.sin(a), PY_ + 21 * math.cos(a), pz_ + PH + 2.5, 0.6, 0.6, 1.4, 0, M3['steel'])   # mooring hooks
for s_ in (-1, 1): pb.box(PX_ + s_ * 6, PY_, pz_ + PH + 2.5, 0.2, 3.0, 5.0, 0, M3['steel'])                                        # wind vanes
PADS_ = []
for i, (h_, a_deg) in enumerate(((30, 0), (42, 90), (54, 180), (66, 270))):
    a = math.radians(a_deg - 50); ex, ey = PX_ + 16 * math.sin(a), PY_ + 16 * math.cos(a)
    pb.box(PX_ + 9 * math.sin(a), PY_ + 9 * math.cos(a), pz_ + h_ - 1.2, 1.6, 1.6, 1.2, -a, M3['steel']); pb.box((PX_ + ex) / 2, (PY_ + ey) / 2, pz_ + h_ - 1.8, 2.6, 14, 1.8, -a, M3['steel'])
    pb.cyl(ex, ey, pz_ + h_, 7, 1.2, M3['graph'], seg=40); pb.cyl(ex, ey, pz_ + h_ + 1.2, 7.1, 0.3, M3['cyanDim'], seg=40, open_top=True)
    PADS_.append((ex, ey, pz_ + h_ + 1.2))
    COLL['circle'].append({'x': round(ex, 2), 'y': round(ey, 2), 'r': 7, 'top': round(pz_ + h_ + 1.2, 2), 'kind': 'perch-pad', 'walkableTop': True})
    marker('PERCH_' + 'ABCD'[i], ex, ey, pz_ + h_ + 1.2, perch_access='pilot.dragon', dashboard_id='perch.' + 'abcd'[i], endpoints=[])
pb.to_object('PERCH_SPIRE', C['03_PERCH'])
COLL['circle'].append({'x': round(PX_, 2), 'y': round(PY_, 2), 'r': 22, 'top': round(pz_ + PH + 2.5, 2), 'kind': 'perch-crown', 'walkableTop': True})
COLL['obb'].append({'x': round(PX_, 2), 'y': round(PY_, 2), 'hx': 5, 'hy': 5, 'rot': round(math.radians(-50), 4), 'top': round(pz_ + PH, 2), 'kind': 'perch-shaft'})
PERCH_CROWN = (PX_, PY_, pz_ + PH + 2.5)
marker('PERCH_MAIN', *PERCH_CROWN, perch_access='pilot.dragon', capacity_dragons=3, dashboard_id='perch.main', endpoints=[], status='landing = status hit')

# ── 04 TRACK: TRACK_MAIN on the existing r1600 ring road (CCW), gate at the N spoke, NW Race Quarter ──
tb = MeshBuf(); RR = GRID_R
tb.annulus(RR - 5, RR + 5, GZ + 0.27, M3['track'], seg=1024)
tb.annulus(RR - 6.4, RR - 5.0, GZ + 0.29, M3['trackEdge'], seg=1024); tb.annulus(RR + 5.0, RR + 6.4, GZ + 0.29, M3['trackEdge'], seg=1024)
for k in range(6): x, y = at(-0.25 - k * 0.018, RR); tb.box(x, y, GZ + 0.29, 0.3, 9.6, 0.02, 0, M3['cyanDim'])     # faint start ticks
tb.to_object('TRACK_MAIN', C['04_TRACK'])
for i in range(8): x, y = at((360 - 45 * i) % 360, RR); marker('CP_%02d' % i, x, y, GZ + 0.3, order=i, direction='CCW', start=(i == 0))
gb = MeshBuf(); gx, gy = at(0.0, RR)                                          # GATE_START: 4-wide arch across the ribbon (radial span), cyan inner ring
for s_ in (-1, 1): gb.box(gx, gy + s_ * 10, GZ, 2.2, 3.0, 15, 0, M3['steel']); COLL['obb'].append({'x': round(gx, 2), 'y': round(gy + s_ * 10, 2), 'hx': 1.1, 'hy': 1.5, 'rot': 0, 'top': round(GZ + 15, 2), 'kind': 'gate-pylon'})
gb.box(gx, gy, GZ + 15, 2.4, 23, 2.0, 0, M3['steel'])
for k in range(36): a = 2 * math.pi * k / 36; gb.box(gx, gy + 7.2 * math.cos(a), GZ + 7.8 + 7.2 * math.sin(a), 0.5, 0.9, 0.9, 0, M3['cyan'])
gb.to_object('GATE_START', C['04_TRACK'])
marker('GATE_START', gx, gy, GZ, endpoints=[ep('race', 'GET', '/api/race/track', 'new'), ep('race', 'GET', '/api/race/heats', 'new'), ep('race', 'POST', '/api/race/heats/:heatId/enter', 'new')], paybox_merchant_id='race.gate', sparks_price=10, price_rule='fixed', price_key='race.entry', price_unit='entry', legacy={'endpoint': 'race (new): entry = economy /spend, prize = economy /grant'}, lanes=4, pulse=True, dashboard_id='race.gate', skill_required='race.circuit')
rq = MeshBuf()
for i in range(8):                                                            # PIT_01-08 parallel to the ribbon, inside the ring, NW side
    c_ = 358.0 - i * 1.0; x, y = at(c_, RR - 16); rot = math.radians(-c_); Pp, _ = frame(c_, RR - 16)
    rq.box(*Pp(-3.8, 0), GZ, 11, 0.4, 4.5, rot, M3['steel']); rq.box(*Pp(0, -5.3), GZ, 0.4, 8, 4.5, rot, M3['graph']); rq.box(*Pp(0, 5.3), GZ, 0.4, 8, 4.5, rot, M3['graph'])
    rq.box(x, y, GZ + 4.5, 11.2, 8.4, 0.3, rot, M3['steel']); rq.box(*Pp(3.9, 0), GZ + 4.3, 10.4, 0.1, 0.12, rot, M3['cyan'])
    COLL['obb'].append({'x': round(x, 2), 'y': round(y, 2), 'hx': 5.5, 'hy': 4, 'rot': round(rot, 4), 'top': round(GZ + 4.8, 2), 'kind': 'pit'})
    marker('PIT_%02d' % (i + 1), x, y, GZ, paybox_merchant_id='race.pit.%02d' % (i + 1), sparks_price=5, price_rule='fixed', price_key='race.pit', price_unit='each', dashboard_id='race.pit.%02d' % (i + 1), endpoints=[ep('race', 'GET', '/api/race/heats/:heatId', 'new')])
tx_, ty_ = at(356.0, RR - 36); rq.box(tx_, ty_, GZ, 6, 6, 42, math.radians(4), M3['steel'], taper=0.8)
for s_ in (-1, 1): rq.box(tx_ + s_ * 1.4, ty_ + 2.5, GZ + 32, 2.4, 0.15, 5.5, math.radians(4 + s_ * 12), M3['cyan'])     # two-screen face toward the gate
rq.to_object('RACE_Pits_Tower', C['04_TRACK']); marker('TOWER_RACE', tx_, ty_, GZ, screens=2, dashboard_id='race.tower', endpoints=[ep('race', 'GET', '/api/race/heats', 'new')])
COLL['obb'].append({'x': round(tx_, 2), 'y': round(ty_, 2), 'hx': 3, 'hy': 3, 'rot': round(math.radians(4), 4), 'top': round(GZ + 42, 2), 'kind': 'race-tower'})
Ps, RS = frame(326.25, 1250); sk = MeshBuf(); sx_, sy_ = Ps(0, 0)          # PLAZA_SKATE: small ribbon + bowl (hover/skate class only)
disc_fan(sk, ellipse_pts(Ps, 34, 22, GZ + 0.03), M3['char']); sk.ribbon(ellipse_pts(Ps, 30, 18, GZ + 0.08), 3.0, M3['track']); sk.ribbon(ellipse_pts(Ps, 31.7, 19.7, GZ + 0.1), 0.25, M3['cyan'])
for i in range(5): sk.cyl(*Ps(0, 0), GZ + 0.05 - 0, 9 - i * 1.4, 0.5 + i * 0.0, M3['graph'] if i % 2 else M3['char'], seg=40, r2=9 - i * 1.4 + 0.8, open_top=True)
sk.to_object('PLAZA_SKATE', C['04_TRACK']); marker('PLAZA_SKATE', sx_, sy_, GZ, skill_required='race.skate', note='SKATE pack (Hall) arena', dashboard_id='race.skate', endpoints=[])
Pv, RV = frame(341.25, 1370); vb = MeshBuf(); disc_fan(vb, ellipse_pts(Pv, 24, 14, GZ + 0.03, n=4), M3['char'])
vb.box(*Pv(0, 0), GZ, 26, 46, 0.15, RV, M3['char']); vb.box(*Pv(12.8, 0), GZ + 0.15, 0.2, 46, 0.1, RV, M3['cyan'])
VEH = [('VEH_GROUND_RUNNER', 'street', 'drive.ground'), ('VEH_HOVER_SLIDE', 'skate/hover', 'drive.hover'), ('VEH_RAIL_NEEDLE', 'mag-rail', 'drive.rail'),
       ('VEH_HAULER', 'heavy', 'drive.hauler'), ('VEH_SKY_SKIFF', 'short flight', 'pilot.skiff'), ('VEH_DRAGON_HARNESS', 'dragon race', 'pilot.dragon')]
for i, (nm, cls, gate) in enumerate(VEH):
    v_ = -18 + i * 7.2; x, y = Pv(-2, v_); z = GZ + 0.15
    if nm == 'VEH_GROUND_RUNNER':
        vb.box(x, y, z + 0.4, 2.0, 4.6, 0.9, RV, M3['graph']); vb.box(x, y, z + 1.3, 1.7, 2.4, 0.6, RV, M3['glassC'])
        for du in (-1.5, 1.5):
            for dv in (-0.95, 0.95): vb.cyl(*Pv(-2 + du, v_ + dv), z, 0.4, 0.4, M3['steel'], seg=12)
    elif nm == 'VEH_HOVER_SLIDE': vb.box(x, y, z + 0.5, 0.7, 2.1, 0.12, RV, M3['graph']); vb.cyl(x, y, z + 0.2, 0.5, 0.05, M3['cyan'], seg=16)
    elif nm == 'VEH_RAIL_NEEDLE': vb.box(x, y, z + 0.3, 1.3, 8.0, 1.1, RV, M3['steel'], taper=0.5); vb.box(x, y, z + 0.05, 0.3, 8.4, 0.25, RV, M3['cyan'])
    elif nm == 'VEH_HAULER': vb.box(x, y, z + 0.6, 2.8, 8.0, 3.0, RV, M3['graph']); vb.box(*Pv(-2 - 3.2, v_), z + 0.6, 2.8, 1.8, 2.2, RV, M3['steel'])
    elif nm == 'VEH_SKY_SKIFF': vb.box(x, y, z + 1.0, 1.4, 4.2, 1.0, RV, M3['graph'], taper=0.7); vb.box(x, y, z + 1.3, 5.8, 1.4, 0.1, RV, M3['steel']); vb.box(x, y, z + 0.0, 0.3, 0.3, 1.0, RV, M3['steel'])
    else: vb.box(x, y, z, 1.2, 1.2, 1.4, RV, M3['steel']); vb.box(x, y, z + 1.4, 1.1, 1.6, 0.35, RV, M3['graph']); vb.box(x, y, z + 1.75, 0.2, 1.4, 0.5, RV, M3['cyan'])
    marker(nm, x, y, z, vehicle_class=cls, skill_gate=gate, paybox_merchant_id='race.vehicle.' + nm[4:].lower(), dashboard_id='vehicle.' + nm[4:].lower(), endpoints=[], sparks_price=None, price_rule='fixed', price_key='vehicle.checkout', price_unit='day')
vb.to_object('PAD_VEHICLE_SHOP', C['04_TRACK']); marker('PAD_VEHICLE_SHOP', *Pv(0, 0), GZ, dashboard_id='race.vehicles', endpoints=[])
rc_ = bpy.data.curves.new('ROUTE_COURIER', 'CURVE'); rc_.dimensions = '3D'; spl = rc_.splines.new('POLY')
RP = [PERCH_CROWN, (*at(38, 900), GZ + 70), (*at(20, 190), GZ + 45), (*at(8, 900), GZ + 35), (gx, gy, GZ + 22)]
spl.points.add(len(RP) - 1)
for k, p_ in enumerate(RP): spl.points[k].co = (*p_, 1)
rc_.bevel_depth = 0.6; ro = bpy.data.objects.new('ROUTE_COURIER', rc_); ro.data.materials.append(M3['cyanDim']); C['03_PERCH'].objects.link(ro); ro.hide_render = True   # data curve (viewport only)

# ── NE campus fabric + NW race fabric: lower-density themed library fill so the petals read as districts, not empty land ──
OP = next(a['pos_m'] for a in LAY['agents'] if a['id'] == 'oracle'); TP = next(a['pos_m'] for a in LAY['agents'] if a['id'] == 'turtle')
def ne_skip(x, y, ac, rc): return math.hypot(x - CAMPUS_PLAZA_POS[0], y - CAMPUS_PLAZA_POS[1]) < 175 or math.hypot(x - PX_, y - PY_) < 50 or math.hypot(x - OP[0], y - OP[1]) < 22 or math.hypot(x - TP[0], y - TP[1]) < 22
W_NE = [('sc-techlab', 30), ('sc-office', 16), ('sc-office-mid', 10), ('sc-garden', 22), ('sc-storefront-s', 14), ('sc-market', 5), ('sc-teleport', 3)]
LOG['metrics']['v3_ne_fabric'] = fabric(22.5, 90.0, W_NE, {'sc-teleport': 3, 'sc-market': 6}, ne_skip, 'ne-campus', C['02_ACADEMY_FORGE'], gap=(10, 18), row_gap=(8, 12))
SKC = Ps(0, 0); VPC = Pv(0, 0)
def nw_skip(x, y, ac, rc): return (rc > 1500 and ac > 343) or math.hypot(x - SKC[0], y - SKC[1]) < 55 or math.hypot(x - VPC[0], y - VPC[1]) < 40 or math.hypot(x - tx_, y - ty_) < 22
W_NW = [('sc-techlab', 36), ('sc-storefront-s', 24), ('sc-garden', 20), ('sc-office', 14), ('sc-market', 4), ('sc-teleport', 2)]
LOG['metrics']['v3_nw_fabric'] = fabric(292.5, 360.0, W_NW, {'sc-teleport': 2, 'sc-market': 4}, nw_skip, 'nw-race', C['04_TRACK'], gap=(10, 18), row_gap=(8, 12))
SKY.to_object('LIGHTS_Rooftop_Skylights', C['01_HOUSING'])

# ── 05 PLOTS (SW petal): claimable pads + dark beacons; thin DEED_OFFICE + BUILDER_YARD strip on the SE-facing edge (202.5°) ──
PLOTS = []; pb2 = MeshBuf()
def plot_skip(x, y, ac, rc): return ac < 209.5 or math.hypot(x - next(a['pos_m'] for a in LAY['agents'] if a['id'] == 'nexus')[0], y - next(a['pos_m'] for a in LAY['agents'] if a['id'] == 'nexus')[1]) < 20
for (x, y, ac, rc, w, d) in slots(202.5, 270.0, 170, GRID_R, lambda: rng.choice([22.0, 26.0]), lambda: rng.choice([22.0, 26.0, 30.0]), gap=(5, 6), skip=plot_skip):
    rot = math.radians(-ac); c_, s_ = math.cos(rot), math.sin(rot); pw, pd = w - 3, d - 3
    pb2.box(x, y, GZ, pw, pd, 0.18, rot, M3['plot'])
    for (lx, ly, sx, sy) in ((0, pd / 2, pw, 0.25), (0, -pd / 2, pw, 0.25), (pw / 2, 0, 0.25, pd), (-pw / 2, 0, 0.25, pd)): pb2.box(x + lx * c_ - ly * s_, y + lx * s_ + ly * c_, GZ + 0.18, sx, sy, 0.06, rot, M3['plotLine'])
    bx, by = x + (-pw / 2 + 0.8) * c_ - (-pd / 2 + 0.8) * s_, y + (-pw / 2 + 0.8) * s_ + (-pd / 2 + 0.8) * c_
    pb2.box(bx, by, GZ, 0.35, 0.35, 3.0, rot, M3['steel']); pb2.box(bx, by, GZ + 3.0, 0.6, 0.6, 0.6, rot, M3['beaconOff'])
    art_slot(pb2, 'SLOT_HOME', 'PLOT-SW-%04d' % (len(PLOTS) + 1), bx, by, GZ + 1.3, rot, 1.2, 0.9, 0.2, ht={'host_type': 'plot', 'host_id': 'PLOT-SW-%04d' % (len(PLOTS) + 1)})
    PLOTS.append({'plot_id': 'PLOT-SW-%04d' % (len(PLOTS) + 1), 'x_m': round(x, 1), 'y_m': round(y, 1), 'w_m': pw, 'd_m': pd, 'yaw': round(-math.degrees(rot), 2), 'beacon_m': [round(bx, 1), round(by, 1)],
                  'state': 'empty', 'mode': None, 'owner_id': None, 'pending_sparks': 0, 'boost_lock': 0, 'art_slot': SLOTS[-1]['slot_id']})
pb2.to_object('PLOT_Pads_Beacons', C['05_PLOTS'])
DO = at(205.5, 760); db = MeshBuf(); rd = math.radians(-205.5)
db.box(*DO, GZ, 30, 18, 10, rd, M3['steel']); db.box(*DO, GZ + 10, 30.4, 18.4, 0.3, rd, M3['graph'])
Pd, _ = frame(205.5, 760); db.box(*Pd(-9.2, 0), GZ + 3.2, 26, 0.12, 0.2, rd, M3['cyan']); db.box(*Pd(0, 0), GZ + 10.3, 4, 4, 0.2, rd, M3['cyan'])   # lintel + roof glyph (deed square)
COLL['obb'].append({'x': round(DO[0], 2), 'y': round(DO[1], 2), 'hx': 15, 'hy': 9, 'rot': round(rd, 4), 'top': round(GZ + 10.3, 2), 'kind': 'deed-office'})
marker('DEED_OFFICE', *DO, GZ, endpoints=[ep('plots', 'MCP', 'plot_buy'), ep('plots', 'MCP', 'plot_status')], paybox_merchant_id='city.deeds', sparks_price=None, price_rule='dynamic', price_key='plot.claim', dashboard_id='plots.deeds', legacy={'endpoint': 'plot system (plot_buy / plot_status)', 'sparks_price': 'claim fee (DOC_PLOTS)'})
BY = at(205.5, 900); Pb, _ = frame(205.5, 900); db.box(*BY, GZ, 30, 50, 0.12, rd, M3['char'])
for (u_, v_, su, sv) in ((-25, 0, 0.2, 30), (25, 0, 0.2, 30), (0, -15, 50, 0.2), (0, 15, 50, 0.2)): db.box(*Pb(u_, v_), GZ, sv, su, 1.2, rd, M3['steel'])
db.to_object('DEED_OFFICE_BUILDER_YARD', C['05_PLOTS'])
for i, k in enumerate(('sc-storefront-s', 'sc-garden', 'sc-techlab')):      # Builder Yard showroom: the first catalogue of the building library
    o = PROTO[k].copy(); o.hide_render = False; C['05_PLOTS'].objects.link(o); o.hide_set(False); o.location = (*Pb(-12 + i * 12, 0), GZ + 0.12); o.rotation_euler = (0, 0, rd)
marker('BUILDER_YARD', *BY, GZ, catalogue=[k for k in META], dashboard_id='plots.builder', endpoints=[ep('economy', 'GET', '/api/economy/catalog'), ep('economy', 'POST', '/api/economy/catalog/purchase')], sparks_price=None, price_rule='dynamic', price_key='builder.kit')
LOG['metrics']['v3_plots'] = len(PLOTS)

# ── AGENT_PROXY_01..08 (max 8): at homes, plaza, pits — home_id / job_id / schedule (DOC_WORLD §agents) ──
PROX = [('home.a', 'hiring-board contract', hubs[0]), ('home.b', 'stall.001', hubs[1]), ('home.c', 'forge.bay.01', CAMPUS_PLAZA_POS), ('home.d', 'academy.class.01', CAMPUS_PLAZA_POS),
        ('home.e', 'race.pit.01', at(355, RR - 20)), ('home.f', 'perch courier', PERCH_CROWN[:2]), ('home.a', 'stall.007', PLAZA_C), ('home.b', 'academy.board teacher', CAMPUS_PLAZA_POS)]
ag = MeshBuf()
for i, (home, job, (x, y)) in enumerate(PROX):
    x, y = x + 3 + i * 1.5, y + 3; ag.box(x, y, GZ, 0.5, 0.4, 1.8, 0, M3['graph']); ag.box(x, y, GZ + 1.8, 0.3, 0.3, 0.3, 0, M3['emer'])
    marker('AGENT_PROXY_%02d' % (i + 1), x, y, GZ, home_id=home, job_id=job, schedule=['leave home 08:00', 'work 09:00-17:00', 'return 18:00'], skills=[], sparks_wallet='ledger:agent-proxy-%02d' % (i + 1))
ag.to_object('AGENT_PROXIES', C['07_MARKERS'])

# ── 08 DOCS: text objects (also written to docs/city-v3/*.md for the repo) ──
DOCS = json.load(open(os.path.join(REPO, 'tools/blender/canon/city_v3_docs.json'), encoding='utf-8'))
DOCS['DOC_WORLD'] = DOCS['DOC_WORLD'].replace('{PLAZA}', '%.0f, %.0f' % CAMPUS_PLAZA_POS).replace('{PERCH}', '%.0f, %.0f, %.0f' % PERCH_CROWN).replace('{GATE}', '%.0f, %.0f' % (gx, gy)) \
    .replace('{DEED}', '%.0f, %.0f' % DO).replace('{MONUMENT}', '%.0f, %.0f' % PLAZA_C).replace('{GRID_D}', '%.0f' % (2 * GRID_R)).replace('{WORLD_D}', '%.0f' % (2 * HALF))
os.makedirs(os.path.join(REPO, 'docs', 'city-v3'), exist_ok=True)
for i, (nm, body) in enumerate(DOCS.items()):
    cu = bpy.data.curves.new(nm, 'FONT'); cu.body = body; cu.size = 6; o = bpy.data.objects.new(nm, cu); o.location = (-HALF + 200 + i * 900, -HALF + 200, 0)
    o.hide_render = True; C['08_DOCS'].objects.link(o)
    open(os.path.join(REPO, 'docs', 'city-v3', nm + '.md'), 'w', encoding='utf-8').write(body)

# ── UNSTICK: interactive markers buried inside a solid OBB move DOOR_M outside the nearest façade, at street level; markers that
#    shared a building slide 3 m apart along the façade. Identical to tools/city/unstick-markers.mjs (keep in sync).
DOOR_M = 1.2; _placed = []
def _is_interactive(p): return bool(p.get('dashboard_id') or p.get('endpoints') or p.get('paybox_merchant_id') or p.get('skill_required') or p.get('skill_gate'))
def _inside(o, x, y, z):
    if z >= o['top'] - 0.3: return None
    c, s_ = math.cos(o['rot']), math.sin(o['rot']); dx, dy = x - o['x'], y - o['y']; lx, ly = dx * c + dy * s_, -dx * s_ + dy * c
    return (lx, ly, c, s_) if abs(lx) < o['hx'] and abs(ly) < o['hy'] else None
for m_ in MARK:
    if not _is_interactive(m_['props']): continue
    x, y, z = m_['pos_m']; moved = False; tan = None
    for _ in range(6):
        hit = next(((o, h) for o in COLL['obb'] for h in [_inside(o, x, y, z)] if h), None)
        if not hit: break
        o, (lx, ly, c, s_) = hit; nx, ny = lx, ly
        if o['hx'] - abs(lx) < o['hy'] - abs(ly): nx = (-1 if lx < 0 else 1) * (o['hx'] + DOOR_M); tan = (-s_, c)
        else: ny = (-1 if ly < 0 else 1) * (o['hy'] + DOOR_M); tan = (c, s_)
        x = o['x'] + nx * c - ny * s_; y = o['y'] + nx * s_ + ny * c; z = min(z, GZ); moved = True
    if moved:
        x0, y0 = x, y; k = 1
        while any(math.hypot(px - x, py - y) < 1.5 for px, py in _placed) and k < 12:
            st = math.ceil(k / 2) * 3 * (1 if k % 2 else -1); x, y = x0 + tan[0] * st, y0 + tan[1] * st; k += 1
        _placed.append((x, y)); m_.setdefault('legacy', {})['pos_m_buried'] = m_['pos_m']; m_['pos_m'] = [round(x, 2), round(y, 2), round(z, 2)]
        e_ = bpy.data.objects.get(m_['name'])
        if e_: e_.location = tuple(m_['pos_m'])

# ── data for the game + dashboard (same ids everywhere) ──
wd = os.path.join(REPO, 'public/assets/world'); os.makedirs(wd, exist_ok=True)
json.dump({'version': 1, 'note': 'SHADDAI City v3 markers (metres, X east, Y north, Z up; game x = X*U, z = -Y*U, y = Z*U)', 'schema': 'city-v3/markers@2 (endpoints[], sparks_price number|null + price_rule, dashboard_id; see tools/city/normalize-markers.mjs, docs/city-v3/PRICES.md)', 'markers': MARK}, open(os.path.join(wd, 'markers-v4.json'), 'w'), indent=0)
json.dump({'version': 1, 'note': 'Grid fabric (Commons SE, NE campus, NW race) — building library instances; clusters-loader format (yaw deg, loader applies -yaw about +Y)', 'units_per_m': 7 / 1.8,
           'counts': {c: sum(1 for i in ITEMS if i['cluster'] == c) for c in ('commons', 'ne-campus', 'nw-race')}, 'items': ITEMS}, open(os.path.join(wd, 'grid-fabric-v4.json'), 'w'), separators=(',', ':'))
json.dump({'version': 1, 'note': 'art slots: empty = blank panel, filled = emissive artwork card (SPARKS placement; NFT later = provenance only)', 'schema': 'city-v3/art-slots@2 (host_type + host_id; legacy.host kept one release)', 'slots': SLOTS}, open(os.path.join(wd, 'art-slots-v4.json'), 'w'), separators=(',', ':'))
json.dump({'version': 1, 'note': 'SW Plot District — states empty/claimed/built/listed/lapsed; lights = ledger (dark → beacon → windows → cyan edge)', 'plots': PLOTS}, open(os.path.join(wd, 'plots-v4.json'), 'w'), separators=(',', ':'))

# ── cameras ──
cd = bpy.data.cameras.new('CAM_TOP'); cd.type = 'ORTHO'; cd.ortho_scale = 2 * GRID_R + 300; ct = bpy.data.objects.new('CAM_TOP', cd); ct.location = (0, 0, 6000); C['08_DOCS'].objects.link(ct)
cd.clip_end = 20000
cg = bpy.data.cameras.new('CAM_GATE'); cg.lens = 22; cg.clip_end = 20000; cgo = bpy.data.objects.new('CAM_GATE', cg); C['08_DOCS'].objects.link(cgo)
cgo.location = (gx + 30, gy, GZ + 3.0); cgo.rotation_euler = (Vector((*at(352, RR), GZ + 2)) - cgo.location).to_track_quat('-Z', 'Y').to_euler()   # CCW: first turn heads west
V3_SHOTS = {'lane': PL_(130, 0), 'plaza': CAMPUS_PLAZA_POS, 'perch': PERCH_CROWN, 'gate': (gx, gy), 'commons': PLAZA_C, 'deed': DO}
print('CITY V3', json.dumps({k: LOG['metrics'][k] for k in LOG['metrics'] if k.startswith('v3')}), 'markers', len(MARK))
