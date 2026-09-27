# One-shot patch: build_canon.py ← step 6 (THE SUBURBS: megablock street grid ≥ 40 %, sky-megatower + promenade,
# east highway to the rim). Hero realm models keep their plots (reserved). Adds approval shots.
import sys
p = 'tools/blender/canon/build_canon.py'
s = open(p, encoding='utf-8').read()
def rep(a, b):
    global s
    if s.count(a) != 1: sys.exit('ANCHOR x%d %r' % (s.count(a), a[:70]))
    s = s.replace(a, b)

rep("# ── 16 DEBUG: atlas image empty", '''# ═════════ STEP 6: THE SUBURBS — megablock grid (≥ 40 % footprint), sky-megatower 100 m + promenade, east highway ═════════
if STEP >= 6:
    RIM_ = T['rim_m']
    MS = {'block': mat('sub-block', (0.22, 0.24, 0.28), 0, 0.45, 0.3), 'block2': mat('sub-block-2', (0.3, 0.31, 0.35), 0, 0.5, 0.2),
          'glassS': mat('sub-glass', (0.1, 0.16, 0.22), 0.15, 0.1, 0.6), 'neon': mat('sub-neon', (0.95, 0.35, 0.8), 3.0), 'tower': mat('sub-tower', (0.78, 0.82, 0.86), 0, 0.3, 0.5)}
    # hero realm models already placed in the Suburbs by world-layout (?map=v4 atlas table) keep their plots
    HERO = [(100, .833, 40), (94, .770, 45), (109, .785, 30), (114, .881, 35), (90, .896, 30), (104, .689, 32)]
    reserve = [(*at(c, f * RIM_), L_ * 0.75 + 10) for c, f, L_ in HERO]
    mt = next(l for l in LAY['landmarks'] if l['id'] == 'sky-megatower')['pos_m']; reserve.append((mt[0], mt[1], 48))
    tb = [s_ for s_ in LAY['stations'] if s_['id'] == 'suburb-transit-hub'][0]['bearing']
    # district frame: axes aligned to the east radial (u = outward, v = tangential); streets every 72 m, 14 m wide
    ux, uy = at(tb, 1); vx, vy = uy, -ux
    R0, R1 = RING_R + 520, RIM_ - 120; V0 = -1250; V1 = 1250
    sb = MeshBuf(); nbs = 0; foot = 0.0; area = 0.0; STEPV = 72.0; ST = 14.0
    def inside_wedge(x, y):
        c_ = bearing(x, y); r_ = math.hypot(x, y)
        return 86 <= c_ <= 118 and R0 <= r_ <= R1
    rr_ = R0
    while rr_ < R1 - STEPV:
        vv = V0
        while vv < V1 - STEPV:
            cx_, cy_ = ux * (rr_ + STEPV / 2) + vx * (vv + STEPV / 2), uy * (rr_ + STEPV / 2) + vy * (vv + STEPV / 2)
            if inside_wedge(cx_, cy_):
                bs = STEPV - ST; area += bs * bs
                # perimeter megablock: 2-4 buildings around a courtyard, heights 12-40 m, footprints 14-30 m deep
                for (ox, oy, w_, d_) in ((-bs / 4, -bs / 4, bs / 2 - 3, bs / 2 - 3), (bs / 4, -bs / 4, bs / 2 - 3, bs / 2 - 3), (-bs / 4, bs / 4, bs / 2 - 3, bs / 2 - 3), (bs / 4, bs / 4, bs / 2 - 3, bs / 2 - 3)):
                    if rng.random() < 0.18: continue                                                  # pocket courtyards / plazas
                    x_ = cx_ + vx * ox + ux * oy; y_ = cy_ + vy * ox + uy * oy
                    if any(math.hypot(x_ - a, y_ - b) < r for a, b, r in reserve): continue
                    g_ = min(H(x_ + dx, y_ + dy) for dx in (-w_ / 2, w_ / 2) for dy in (-d_ / 2, d_ / 2))
                    h_ = rng.uniform(12, 40) if rng.random() > 0.1 else rng.uniform(40, 60)
                    rot = math.atan2(uy, ux); m_ = rng.choice([MS['block'], MS['block2'], MS['glassS']])
                    sb.box(x_, y_, g_ - 1.0, w_, d_, h_ + 1.0, rot, m_)
                    for k in range(1, int(h_ // 8) + 1): sb.box(x_, y_, g_ + k * 8 - 0.4, w_ + 0.4, d_ + 0.4, 0.35, rot, MS['neon'] if k % 3 == 0 else MS['block2'])
                    COLL['obb'].append({'x': round(x_, 2), 'y': round(y_, 2), 'hx': round(w_ / 2, 2), 'hy': round(d_ / 2, 2), 'rot': round(rot, 4), 'top': round(g_ + h_, 2), 'kind': 'suburb-block'})
                    nbs += 1; foot += w_ * d_
            vv += STEPV
        rr_ += STEPV
    # district streets (between blocks), a graded ribbon following the ground
    for k in range(int((R1 - R0) / STEPV) + 1):
        r_ = R0 + k * STEPV
        pts = [(ux * r_ + vx * v_, uy * r_ + vy * v_) for v_ in range(int(V0), int(V1), 20)]
        pts = [(x, y, H(x, y) + 0.15) for x, y in pts if inside_wedge(x, y)]
        if len(pts) > 2: sb.ribbon(pts, ST, MAT['asphalt'])
    for k in range(int((V1 - V0) / STEPV) + 1):
        v_ = V0 + k * STEPV
        pts = [(ux * r_ + vx * v_, uy * r_ + vy * v_) for r_ in range(int(R0), int(R1), 20)]
        pts = [(x, y, H(x, y) + 0.15) for x, y in pts if inside_wedge(x, y)]
        if len(pts) > 2: sb.ribbon(pts, ST, MAT['asphalt'])
    hw = [(*at(tb, r_), H(*at(tb, r_)) + 0.25) for r_ in range(int(RING_R + 30), int(RIM_ - 60), 25)]   # east highway to the rim (12 m)
    sb.ribbon(hw, 16, MAT['walk']); sb.ribbon([(x, y, z + 0.08) for x, y, z in hw], 12, MAT['asphalt']); sb.ribbon([(x, y, z + 0.12) for x, y, z in hw], 0.4, MAT['curb'])
    sb.to_object('SUB_Megablocks_Streets_Highway', C['09_Suburbs'])
    # sky-megatower: 100 m, tapered, mid-deck promenade at 52 m (cloud-arch ref), crown ring
    tw = MeshBuf(); gz_ = H(*mt)
    tw.box(mt[0], mt[1], gz_, 44, 44, 10, 0, MS['block'])                                       # podium
    tw.box(mt[0], mt[1], gz_ + 10, 30, 30, 90, math.radians(45), MS['tower'], taper=0.62)
    tw.cyl(mt[0], mt[1], gz_ + 52, 30, 2.2, MS['tower'], seg=48); tw.cyl(mt[0], mt[1], gz_ + 54.2, 30.4, 0.5, MS['neon'], seg=48)   # promenade deck
    for k in range(12): a = k / 12 * 2 * math.pi; tw.box(mt[0] + 29 * math.cos(a), mt[1] + 29 * math.sin(a), gz_ + 54.2, 0.25, 3.0, 1.1, a, MS['glassS'])
    tw.cyl(mt[0], mt[1], gz_ + 100, 12, 1.2, MS['neon'], seg=32); tw.box(mt[0], mt[1], gz_ + 100, 1.2, 1.2, 22, 0, MS['tower'])
    for k in range(1, 12): tw.box(mt[0], mt[1], gz_ + 10 + k * 8, 30 * (1 - 0.38 * k * 8 / 90) + 0.6, 30 * (1 - 0.38 * k * 8 / 90) + 0.6, 0.4, math.radians(45), MS['neon'])
    tw.to_object('LM_SkyMegatower', C['09_Suburbs'])
    COLL['obb'].append({'x': round(mt[0], 2), 'y': round(mt[1], 2), 'hx': 22, 'hy': 22, 'rot': 0, 'top': round(gz_ + 10, 2), 'kind': 'megatower-podium'})
    COLL['circle'].append({'x': round(mt[0], 2), 'y': round(mt[1], 2), 'r': 30, 'top': round(gz_ + 54.2, 2), 'kind': 'megatower-promenade', 'walkableTop': True})
    text('SKY MEGATOWER', (mt[0], mt[1] - 23, gz_ + 12), 3, 0, C['09_Suburbs'], MAT['plateText'])
    LOG.setdefault('metrics', {})
    SUB_DENSITY = foot / max(area, 1); print('SUBURBS blocks', nbs, 'density', round(SUB_DENSITY, 3))

# ── 16 DEBUG: atlas image empty''')
rep("    EXP = ['01_Grid_Streets', '02_Grid_Blocks', '06_Meadow_Quill', '07_Void', '08_Emberfall', '15_Agents']",
    "    EXP = ['01_Grid_Streets', '02_Grid_Blocks', '06_Meadow_Quill', '07_Void', '08_Emberfall', '09_Suburbs', '15_Agents']")
rep("print('CANON DONE')", '''    if STEP >= 6:
        mt = next(l for l in LAY['landmarks'] if l['id'] == 'sky-megatower')['pos_m']; tb = [s_ for s_ in LAY['stations'] if s_['id'] == 'suburb-transit-hub'][0]['bearing']
        x, y = at(tb, RING_R + 120); shoot('eye-suburbs-highway', pos=(x, y + 4, H(x, y) + 0.4 + EYE), tgt=(*at(tb, RING_R + 900), H(x, y) + 20))
        shoot('suburbs-oblique', pos=(mt[0] - 900, mt[1] + 700, H(*mt) + 420), tgt=(mt[0] + 100, mt[1] - 50, H(*mt)), lens=26)
print('CANON DONE')''')
open(p, 'w', encoding='utf-8').write(s)

# the procedural suburbs cluster (realm-clusters-v4) would overlap the canon district → retire it
q = 'tools/blender/realm-clusters-v4.py'; t = open(q, encoding='utf-8').read()
a = "c0 = 102; ox, oy = at(c0, 3950)"
if t.count(a) != 1: sys.exit('clusters anchor')
t = t.replace(a, "c0 = 102; ox, oy = at(c0, 3950)\nSUBURBS_CLUSTER = False   # canon step 6 builds the Suburbs district (build_canon.py) — this generator would overlap it")
t = t.replace("for i in range(-3, 4):\n    for j in range(-4, 5):", "for i in (range(-3, 4) if SUBURBS_CLUSTER else []):\n    for j in range(-4, 5):")
open(q, 'w', encoding='utf-8').write(t)
print('patched')
