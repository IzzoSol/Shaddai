# One-shot patch: build_canon.py ← steps 4 (Deep Void) + 5 (Emberfall), export 07/08, extra approval shots.
import sys
p = 'tools/blender/canon/build_canon.py'
s = open(p, encoding='utf-8').read()
def rep(a, b):
    global s
    if s.count(a) != 1: sys.exit('ANCHOR x%d %r' % (s.count(a), a[:70]))
    s = s.replace(a, b)

rep("# ── 16 DEBUG: atlas image empty", '''FEAT = T.get('features', {})
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
    th = 10.0; tz = lip + 10                                                                    # hovering tetrahedron over the pit centre
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
    ME = {'basalt': mat('ember-basalt', (0.09, 0.07, 0.07), 0, 0.7), 'lava': mat('ember-lava', (1.0, 0.33, 0.05), 8.0, 0.4),
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

# ── 16 DEBUG: atlas image empty''')

rep("    EXP = ['01_Grid_Streets', '02_Grid_Blocks', '06_Meadow_Quill', '15_Agents']",
    "    EXP = ['01_Grid_Streets', '02_Grid_Blocks', '06_Meadow_Quill', '07_Void', '08_Emberfall', '15_Agents']")
rep("             'obb': [dict(g(o), hx=round(o['hx'] * U_, 2), hz=round(o['hy'] * U_, 2), rot=o['rot'], top=round(o['top'] * U_, 2), kind=o['kind']) for o in COLL['obb']],",
    "             'obb': [dict(g(o), hx=round(o['hx'] * U_, 2), hz=round(o['hy'] * U_, 2), rot=o['rot'], top=round(o['top'] * U_, 2), kind=o['kind'], walkableTop=o.get('walkableTop', False)) for o in COLL['obb']],")
rep("print('CANON DONE')", '''    if STEP >= 4 and 'void' in FEAT:
        V = FEAT['void']; ovp = V['overlook_m']; pc = V['pit_centre_m']
        shoot('eye-void-overlook', pos=(ovp[0], ovp[1] - 6, V['lip_z_m'] + 0.6 + EYE), tgt=(pc[0], pc[1], V['lip_z_m'] + 8))
        shoot('void-oblique', pos=(pc[0] - 380, pc[1] - 420, V['lip_z_m'] + 260), tgt=(pc[0], pc[1], V['lip_z_m'] - 10), lens=28)
    if STEP >= 5 and 'emberfall' in FEAT:
        E = FEAT['emberfall']; b0 = E['bridges_m'][0]; tc = E['terrace_centre_m']
        shoot('eye-emberfall-bridge', pos=(b0[0] - 40, b0[1] + 10, b0[2] + 0.4 + EYE + 1), tgt=(tc[0], tc[1], E['terrace_z_m'] + 15))
        shoot('emberfall-oblique', pos=(tc[0] - 700, tc[1] + 250, E['terrace_z_m'] + 330), tgt=(tc[0] - 150, tc[1], E['terrace_z_m']), lens=26)
print('CANON DONE')''')
open(p, 'w', encoding='utf-8').write(s)
print('patched')
