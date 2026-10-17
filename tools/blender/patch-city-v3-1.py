# One-shot patch: city_v3.py ← v3.1
#   • culture addendum: Culture Lane off the monument plaza, CLASS_ART / CLASS_MUSIC, art slots on every home / office / plot
#   • NE + NW petal fabric (lower-density themed library fill)
#   • night readability: rooftop skylights, bright track ring
#   • fixes: academy façade/terrace overlap, thin perch arms, courier route not rendered
import sys
p = 'tools/blender/canon/city_v3.py'
s = open(p, encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    if s.count(a) != n: sys.exit('ANCHOR x%d %r' % (s.count(a), a[:80]))
    s = s.replace(a, b)

# ── materials ──
rep("'plotLine': mat('v3-plot-line-off', (0.12, 0.13, 0.14), 0, 0.7),",
    "'plotLine': mat('v3-plot-line-off', (0.12, 0.13, 0.14), 0, 0.7), 'trackEdge': mat('v3-track-edge', CYAN, 9.0), 'slot': mat('v3-art-slot-blank', (0.028, 0.03, 0.034), 0, 0.3, 0.2),")

# ── skylights + art slots registry, before housing ──
rep("# ── 01 HOUSING: the 4 built wedges", """SKY = MeshBuf(); SLOTS = []   # warm rooftop skylights (night top-down 'constellation') + art slot registry (art-slots-v4.json)
def art_slot(buf, kind, host, x, y, z, rot, w, h, face_off, add_mesh=True):
    # empty slot = blank dark panel; filled = emissive artwork card (runtime swap by slot_id). face_off = local -y offset of the façade
    c_, s_ = math.cos(rot), math.sin(rot); fx, fy = x + face_off * s_, y - face_off * c_
    if add_mesh: buf.box(fx, fy, z, w, 0.06, h, rot, M3['slot'])
    SLOTS.append({'slot_id': '%s_%05d' % (kind, len(SLOTS) + 1), 'kind': kind, 'host': host, 'pos_m': [round(fx, 2), round(fy, 2), round(z, 2)], 'yaw': round(-math.degrees(rot), 2), 'w_m': w, 'h_m': h, 'filled': None})

# ── 01 HOUSING: the 4 built wedges""")
rep("    p_lit = rng.uniform(0.45, 0.60); z = GZ + 4.4\n",
    "    p_lit = rng.uniform(0.45, 0.60); z = GZ + 4.4\n"
    "    if rng.random() < p_lit: SKY.box(b['x'], b['y'], b['top'] + 0.02, 2 * hx * 0.45, 2 * hy * 0.35, 0.06, b['rot'], M3['warm'])\n"
    "    art_slot(hb, 'SLOT_FACADE', 'housing', b['x'], b['y'], GZ + 4.6, b['rot'], 2.4, 3.0, hy + 0.1)                 # 1 façade slot on the core-facing face\n"
    "    art_slot(hb, 'SLOT_HOME', 'housing', b['x'], b['y'], GZ + 5.0, b['rot'], 1.6, 1.1, 0, add_mesh=False)         # interior home slot (data only)\n")

# ── fabric(): generic library fill (Commons, NE campus fabric, NW race fabric) ──
a0 = s.index("WEIGHTS = [('sc-storefront-s', 24)")
a1 = s.index("for sp in (135.0, 157.5):")
s = s[:a0] + """ITEMS = []
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
            art_slot(None, 'SLOT_FACADE', '%s item %d (%s; library artslot-* material)' % (cluster, len(ITEMS) - 1, k), x, y, GZ + 3.4, rot, 2.4, 2.4, m['d'] / 2 + 0.1, add_mesh=False)
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
""" + s[a1:]
rep("LOG['metrics']['v3_commons_items'] = len(ITEMS)\n", "")

# ── Culture Lane buildings, before the campus ──
rep("# ── 02 ACADEMY + FORGE campus", """# ── CULTURE LANE (SE Commons, off the monument plaza): broadcast booth, gallery shop, arcade alcove, 4 studios. NOT a 5th petal. ──
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
marker('BLD_BROADCAST', bx, by, lz, endpoint='radio queue (new, SPARKS-only; tiny capped per-spin pay)', skill_required='music.compose|music.perform', dashboard_id='culture.radio')
marker('OBJ_RADIO_QUEUE', *PL_(bu, -5.0), lz, queue='city radio + building speakers', unlock_slot_sparks=5, spin_pay_sparks_capped=True, dashboard_id='culture.radio.queue')
gx_, gy_, gu, gv = lane_bld('BLD_GALLERY_SHOP', 100, 124, -1, 12, 6.5, M3['pale'])
for k in range(8):                                                                                                   # SLOT_GALLERY_01-08: blank until a piece is placed
    uu = 102 + (k % 4) * 5.5; zz = lz + (1.3 if k < 4 else 3.7)
    cl.box(*PL_(uu, -6.52), zz, 0.05, 2.0, 1.6, LROT, M3['slot'])
    marker('SLOT_GALLERY_%02d' % (k + 1), *PL_(uu, -6.52), zz, slot_kind='SLOT_GALLERY', filled=None, price_sparks='set by seller', nft_later='optional provenance flag only')
marker('BLD_GALLERY_SHOP', gx_, gy_, lz, endpoint='bazaar-routes (SPARKS; PayBox/x402 pay-IN only)', dashboard_id='culture.gallery')
marker('OBJ_EXHIBIT_INTAKE', *PL_(126.5, -6.0), lz, submits_to='TURTLE museum (core city) — jury, scarce', skill_required='oracle.exhibit', dashboard_id='culture.exhibit')
cl.box(*PL_(126.5, -7.0), lz, 1.0, 1.2, 1.4, LROT, M3['graph']); cl.box(*PL_(126.5, -6.45), lz + 1.0, 0.05, 0.9, 0.3, LROT, M3['cyan'])
ax_, ay_, au, av = lane_bld('BLD_ARCADE', 78, 94, 1, 12, 5.5, M3['steel'])
for k in range(4):                                                                                                   # 4 cabinets, no casino floor
    cx2, cy2 = PL_(80.5 + k * 3.8, 8.6); cl.box(cx2, cy2, lz, 0.9, 0.8, 1.9, LROT, M3['graph']); cl.box(*PL_(80.5 + k * 3.8, 8.15), lz + 1.1, 0.05, 0.6, 0.5, LROT, M3['cyan'])
    marker('ARCADE_CAB_%02d' % (k + 1), cx2, cy2, lz, game=['reflex', 'rhythm', 'prediction', 'skill'][k], prize='SPARKS or cosmetics (no gambling)')
marker('BLD_ARCADE', ax_, ay_, lz, note='arcade alcove: 4 skill cabinets; the Hall stays inside ZEROX downtown', dashboard_id='culture.arcade')
for k in range(4):                                                                                                   # STUDIO_01-04: tiny rentable production rooms
    sx2, sy2, su, sv = lane_bld('STUDIO_%02d' % (k + 1), 100 + k * 10, 108 + k * 10, 1, 8, 4.5, M3['graph'])
    cl.box(*PL_(su, 6.47), lz + 2.2, 0.06, 5.0, 1.2, LROT, M3['warm'])
    marker('STUDIO_%02d' % (k + 1), sx2, sy2, lz, rent_sparks_per_day=3, for_skills=['music.compose', 'turtle.art.motion', 'quill.lyric'], dashboard_id='culture.studio.%02d' % (k + 1))
cl.box(*PL_(166, 7.9), lz, 0.5, 48, 4.2, LROT, M3['graph'])   # the agent art wall
for k in range(6): art_slot(cl, 'SLOT_FACADE', 'culture lane wall', *PL_(144 + k * 8, 7.2), lz + 1.6, LROT + math.pi / 2, 2.4, 2.4, 0.0)   # agent art wall
cl.to_object('CULTURE_LANE', C['06_COMMONS']); marker('CULTURE_LANE', *PL_((LANE_U0 + LANE_U1) / 2, 0), lz, note='a block, not a petal', dashboard_id='culture')

# ── 02 ACADEMY + FORGE campus""")

# ── Academy: façade/terrace geometry fix + CLASS_ART / CLASS_MUSIC ──
rep("ab = MeshBuf(); AV = -78; AU = 18", "ab = MeshBuf(); AV = -95; AU = 18; AF = AV + 30   # AF = plaza-facing façade (hall is 60 m along v)")
rep("for k in range(22): ab.box(*P(AU - 27 + k * 2.55, AV + 15.3), cz + 0.3, 0.2, 1.2, 12.8", "for k in range(14): ab.box(*P(AU - 16 + k * 2.45, AF + 0.6), cz + 0.3, 1.2, 0.2, 12.8")
rep("for k in range(28): ab.box(*P(AU - 27.5 + k * 2.0, AV + 15.5), cz + 13.6", "for k in range(18): ab.box(*P(AU - 17 + k * 2.0, AF + 0.5), cz + 13.6")
rep("ab.box(*P(AU, AV + 15.5), cz + 14.6, 55, 0.06, 0.06", "ab.box(*P(AU, AF + 0.5), cz + 14.6, 0.06, 34, 0.06")
rep("ab.box(*P(AU + 16, AV + 15.4), cz + 5.5, 0.2, 8, 4, ROT, M3['cyan']); marker('OBJ_CLASS_BOARD', *P(AU + 16, AV + 15.4)",
    "ab.box(*P(AU + 10, AF + 0.4), cz + 5.5, 0.2, 8, 4, ROT, M3['cyan']); marker('OBJ_CLASS_BOARD', *P(AU + 10, AF + 0.4)")
rep("AV + 26 - r_ * math.sin(a) * 0.9)", "AF + 20 - r_ * math.sin(a) * 0.9)")
rep("x, y = P(-4, AV + 26); ab.cyl(", "x, y = P(-4, AF + 20); ab.cyl(")
rep("ab.box(gx, gy, cz + 13.7, 3.0, 3.0, 0.2, ROT, M3['cyan']); ab.to_object('ACADEMY_HALL', C['02_ACADEMY_FORGE'])",
    """ab.box(gx, gy, cz + 13.7, 3.0, 3.0, 0.2, ROT, M3['cyan'])
for nm, u_, sk_ in (('CLASS_ART', 33, ['turtle.art.still', 'turtle.art.motion', 'quill.prose', 'quill.lyric', 'oracle.exhibit']), ('CLASS_MUSIC', 44, ['music.compose', 'music.perform'])):
    ab.box(*P(u_, AF + 6), cz, 10, 10, 5.0, ROT, M3['glassC']); ab.box(*P(u_, AF + 6), cz + 5.0, 10.4, 10.4, 0.3, ROT, M3['pale'])   # practice rooms beside the terrace
    marker(nm, *P(u_, AF + 6), cz, teaches=sk_, endpoint='academy-routes:/catalog,/quote,/open_tab,/spend,/close_tab', dashboard_id='academy.' + nm[6:].lower())
ab.to_object('ACADEMY_HALL', C['02_ACADEMY_FORGE'])""")
rep("for v_ in range(AV + 18, FV - 17, 12): sp.box(", "for v_ in range(AF + 4, FV - 17, 12): sp.box(")

# ── Perch arms thicker; courier route = data only ──
rep("pb.box((PX_ + ex) / 2, (PY_ + ey) / 2, pz_ + h_ - 0.8, 1.2, 12, 0.8, -a, M3['steel'])", "pb.box((PX_ + ex) / 2, (PY_ + ey) / 2, pz_ + h_ - 1.8, 2.6, 14, 1.8, -a, M3['steel'])")
rep("ro = bpy.data.objects.new('ROUTE_COURIER', rc_); ro.data.materials.append(M3['cyanDim']); C['03_PERCH'].objects.link(ro)",
    "ro = bpy.data.objects.new('ROUTE_COURIER', rc_); ro.data.materials.append(M3['cyanDim']); C['03_PERCH'].objects.link(ro); ro.hide_render = True   # data curve (viewport only)")

# ── Track ring bright enough to read as THE cyan ring at night ──
rep("tb.annulus(RR - 5.4, RR - 5.0, GZ + 0.29, M3['cyan'], seg=1024); tb.annulus(RR + 5.0, RR + 5.4, GZ + 0.29, M3['cyan'], seg=1024)",
    "tb.annulus(RR - 6.4, RR - 5.0, GZ + 0.29, M3['trackEdge'], seg=1024); tb.annulus(RR + 5.0, RR + 6.4, GZ + 0.29, M3['trackEdge'], seg=1024)")

# ── NE + NW fabric (after campus / perch / race quarter exist) ──
rep("# ── 05 PLOTS (SW petal)", """# ── NE campus fabric + NW race fabric: lower-density themed library fill so the petals read as districts, not empty land ──
OP = next(a['pos_m'] for a in LAY['agents'] if a['id'] == 'oracle'); TP = next(a['pos_m'] for a in LAY['agents'] if a['id'] == 'turtle')
def ne_skip(x, y, ac, rc): return math.hypot(x - CAMPUS_PLAZA_POS[0], y - CAMPUS_PLAZA_POS[1]) < 175 or math.hypot(x - PX_, y - PY_) < 50 or math.hypot(x - OP[0], y - OP[1]) < 22 or math.hypot(x - TP[0], y - TP[1]) < 22
W_NE = [('sc-techlab', 30), ('sc-office', 16), ('sc-office-mid', 10), ('sc-garden', 22), ('sc-storefront-s', 14), ('sc-market', 5), ('sc-teleport', 3)]
LOG['metrics']['v3_ne_fabric'] = fabric(22.5, 90.0, W_NE, {'sc-teleport': 3, 'sc-market': 6}, ne_skip, 'ne-campus', C['02_ACADEMY_FORGE'], gap=(10, 18), row_gap=(8, 12))
SKC = Ps(0, 0); VPC = Pv(0, 0)
def nw_skip(x, y, ac, rc): return (rc > 1500 and ac > 343) or math.hypot(x - SKC[0], y - SKC[1]) < 55 or math.hypot(x - VPC[0], y - VPC[1]) < 40 or math.hypot(x - tx_, y - ty_) < 22
W_NW = [('sc-techlab', 36), ('sc-storefront-s', 24), ('sc-garden', 20), ('sc-office', 14), ('sc-market', 4), ('sc-teleport', 2)]
LOG['metrics']['v3_nw_fabric'] = fabric(292.5, 360.0, W_NW, {'sc-teleport': 2, 'sc-market': 4}, nw_skip, 'nw-race', C['04_TRACK'], gap=(10, 18), row_gap=(8, 12))
SKY.to_object('LIGHTS_Rooftop_Skylights', C['01_HOUSING'])

# ── 05 PLOTS (SW petal)""")

# ── plots: one blank SLOT_HOME panel on each beacon post ──
rep("    pb2.box(bx, by, GZ, 0.35, 0.35, 3.0, rot, M3['steel']); pb2.box(bx, by, GZ + 3.0, 0.6, 0.6, 0.6, rot, M3['beaconOff'])\n",
    "    pb2.box(bx, by, GZ, 0.35, 0.35, 3.0, rot, M3['steel']); pb2.box(bx, by, GZ + 3.0, 0.6, 0.6, 0.6, rot, M3['beaconOff'])\n"
    "    art_slot(pb2, 'SLOT_HOME', 'PLOT-SW-%04d' % (len(PLOTS) + 1), bx, by, GZ + 1.3, rot, 1.2, 0.9, 0.2)\n")
rep("'state': 'empty', 'mode': None, 'owner_id': None, 'pending_sparks': 0, 'boost_lock': 0})",
    "'state': 'empty', 'mode': None, 'owner_id': None, 'pending_sparks': 0, 'boost_lock': 0, 'art_slot': SLOTS[-1]['slot_id']})")

# ── exports ──
rep("open(os.path.join(wd, 'grid-commons-v4.json'), 'w')", "open(os.path.join(wd, 'grid-fabric-v4.json'), 'w')")
rep("'note': 'Commons (SE petal) — building library instances;", "'note': 'Grid fabric (Commons SE, NE campus, NW race) — building library instances;")
rep("'counts': {'commons': len(ITEMS)}", "'counts': {c: sum(1 for i in ITEMS if i['cluster'] == c) for c in ('commons', 'ne-campus', 'nw-race')}")
rep("json.dump({'version': 1, 'note': 'SW Plot District",
    "json.dump({'version': 1, 'note': 'art slots: empty = blank panel, filled = emissive artwork card (SPARKS placement; NFT later = provenance only)', 'slots': SLOTS}, open(os.path.join(wd, 'art-slots-v4.json'), 'w'), separators=(',', ':'))\n"
    "json.dump({'version': 1, 'note': 'SW Plot District")
rep("V3_SHOTS = {'plaza': CAMPUS_PLAZA_POS,", "V3_SHOTS = {'lane': PL_(130, 0), 'plaza': CAMPUS_PLAZA_POS,")
open(p, 'w', encoding='utf-8').write(s)
print('patched')
