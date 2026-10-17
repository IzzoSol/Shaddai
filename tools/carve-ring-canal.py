#!/usr/bin/env python
"""tools/carve-ring-canal.py - the HARBOR RING CANAL (owner 2026-10-11: waterways outside the city, one ring, boats can circle the Grid).

Reads public/assets/terrain/{terrain.json,height16.bin,color.jpg} (never modifies them) and writes a PATCHED copy to
public/assets/terrain-ww/ that the game loads with ?waterways=1:
  - height16.bin  : a channel carved along the ring (bed LEVEL-4 m, 44 m wide) with trench walls / levees so the water sits in a bank
  - terrain.json  : the original + one river entry {type:'river', level_m:LEVEL, width_m:44, path_m:[...]} (closed loop)
Ring route: dynamic programming over (angle, radius) that keeps a CONSTANT water level and wanders between r1850 and r2700 to follow low ground
(level 25 m: ~12.6 km, mean cut 3 m, max cut 34 m, 2% of the ring needing a cut over 15 m).
Re-run after any heightmap rebuild (tools/blender/terrain-v4.py).   python tools/carve-ring-canal.py [--level 25] [--dry]
"""
import json, math, os, shutil, sys
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'public', 'assets', 'terrain')
DST = os.path.join(ROOT, 'public', 'assets', 'terrain-ww')
LEVEL = float(sys.argv[sys.argv.index('--level') + 1]) if '--level' in sys.argv else 25.0
DRY = '--dry' in sys.argv
HALF_W, BANK, LEVEE, DEPTH = 22.0, 30.0, 43.0, 4.0     # channel half width, trench/levee blend, outer levee fall-off, bed depth (m)

T = json.load(open(os.path.join(SRC, 'terrain.json')))
raw = np.fromfile(os.path.join(SRC, 'height16.bin'), dtype='<u2')
N = int(round(math.sqrt(raw.size)))
mn, mx = float(T['min_m']), float(T['max_m'])
hm = mn + raw.reshape(N, N).astype(np.float32) / 65535.0 * (mx - mn)       # metres, row 0 = north, col 0 = west
half = float(T['half_m']); cell = 2 * half / (N - 1)

def hat(e, n):
    r = int(round((half - n) / cell)); c = int(round((e + half) / cell))
    return float(hm[min(N - 1, max(0, r)), min(N - 1, max(0, c))])

# ---- 1. ring route: DP over angle x radius, closed loop --------------------------------------------------------------
TH = 360; radii = np.arange(1650, 2701, 25); NR = len(radii)      # 1650: just outside the Grid (r1600), so the ring never has to cross the Crystal Sea as a causeway
H = np.array([[hat(r * math.sin(math.radians(a)), r * math.cos(math.radians(a))) for r in radii] for a in range(TH)])
cost = np.maximum(H - LEVEL, 0) * 1.0 + np.maximum(LEVEL - H, 0) * 0.6
best = None
for start in range(0, NR, 6):
    D = np.full((TH, NR), 1e9); P = np.zeros((TH, NR), int); D[0, start] = cost[0, start]
    for t in range(1, TH):
        for j in range(NR):
            lo, hi = max(0, j - 1), min(NR, j + 2)
            k = lo + int(np.argmin(D[t - 1, lo:hi])); D[t, j] = D[t - 1, k] + cost[t, j] + 3.0 * abs(j - k); P[t, j] = k
    j = int(np.argmin([D[TH - 1, jj] + abs(jj - start) * 30 for jj in range(NR)])); tot = D[TH - 1, j] + abs(j - start) * 30
    if best is None or tot < best[0]:
        path = [j]
        for t in range(TH - 1, 0, -1): path.append(P[t, path[-1]])
        best = (tot, path[::-1])
rr = radii[best[1]].astype(float)
# light smoothing of the radius so the canal does not stair-step, then a closed Catmull-Rom resample to ~25 m
k = 5; sm = np.array([np.mean([rr[(t + d) % TH] for d in range(-k, k + 1)]) for t in range(TH)])
pts = [(sm[t] * math.sin(math.radians(t)), sm[t] * math.cos(math.radians(t))) for t in range(TH)]
def cr(p0, p1, p2, p3, t):
    return tuple(0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t ** 3) for i in range(2))
dense = []
for i in range(TH):
    a, b, c, d = pts[(i - 1) % TH], pts[i], pts[(i + 1) % TH], pts[(i + 2) % TH]
    for s in range(2): dense.append(cr(a, b, c, d, s / 2))
dense.append(dense[0])
length = sum(math.hypot(dense[i + 1][0] - dense[i][0], dense[i + 1][1] - dense[i][1]) for i in range(len(dense) - 1))

# ---- 1b. realm spurs, the sea lift, buoys ----------------------------------------------------------------------------
REALMS = {r['id']: r for r in T['realms']}
spurs = {}
for rid in ('void', 'desert', 'volcano', 'suburb', 'forest', 'meadow', 'darkforest', 'arctic'):
    r = REALMS[rid]; sp_ = (r['c1'] - r['c0']) % 360; comp = (r['c0'] + sp_ / 2) % 360
    r_ring = float(sm[int(round(comp)) % TH]); pl = []; rad = r_ring
    while rad <= 2650:
        e, n = rad * math.sin(math.radians(comp)), rad * math.cos(math.radians(comp))
        if rad > r_ring + 150 and hat(e, n) > LEVEL + 35: break          # stop at the foot of a mountain: the spur ends in a harbour basin there
        pl.append((e, n)); rad += 25
    if len(pl) >= 3: spurs[rid] = pl
# the sea lift: canal side = the ring at the harbor compass, sea side = first open water going outward from it
harb = next(s_ for s_ in T['stations'] if s_['id'] == 'harbor'); hc = harb['compass']
r_h = float(sm[int(round(hc)) % TH]); lift_canal = (r_h * math.sin(math.radians(hc)), r_h * math.cos(math.radians(hc))); rad = r_h; lift_sea = lift_canal
while rad < 4700:
    rad += 20; e, n = rad * math.sin(math.radians(hc)), rad * math.cos(math.radians(hc))
    if hat(e, n) <= T.get('water_level_m', 2.0) + 0.2: lift_sea = (e, n); break
def buoys_on(poly, tag, every=250.0):
    out = []; acc = 0.0
    for i in range(len(poly) - 1):
        d = math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]); acc += d
        if acc >= every: acc = 0.0; out.append({'e': round(poly[i][0], 1), 'n': round(poly[i][1], 1), 'realm': tag})
    return out
def realm_at(e, n):
    comp = math.degrees(math.atan2(e, n)) % 360
    for rid_, r in REALMS.items():
        if (comp - r['c0']) % 360 <= (r['c1'] - r['c0']) % 360: return rid_
    return 'grid'
buoys = [dict(b, realm=realm_at(b['e'], b['n'])) for b in buoys_on(dense, 'ring')]
for rid, pl in spurs.items(): buoys += buoys_on(pl, rid, 200.0)
print('spurs:', {k: '%.0f m' % (len(v) * 25) for k, v in spurs.items()}, '| lift canal', [round(v) for v in lift_canal], 'sea', [round(v) for v in lift_sea], '| buoys', len(buoys))

# ---- 2. carve ---------------------------------------------------------------------------------------------------------
dist = np.full((N, N), 1e9, dtype=np.float32)
reach = HALF_W + BANK + LEVEE + 2 * cell
SEGS = [(dense[i], dense[i + 1]) for i in range(len(dense) - 1)]
for pl in spurs.values(): SEGS += [(pl[i], pl[i + 1]) for i in range(len(pl) - 1)]
for (e0, n0), (e1, n1) in SEGS:
    r0 = int((half - max(n0, n1) - reach) / cell); r1 = int((half - min(n0, n1) + reach) / cell) + 1
    c0 = int((min(e0, e1) - reach + half) / cell); c1 = int((max(e0, e1) + reach + half) / cell) + 1
    r0, c0 = max(0, r0), max(0, c0); r1, c1 = min(N, r1), min(N, c1)
    rows = np.arange(r0, r1); cols = np.arange(c0, c1)
    E = (cols * cell - half)[None, :]; Nn = (half - rows * cell)[:, None]
    dx, dy = e1 - e0, n1 - n0; L2 = dx * dx + dy * dy or 1.0
    t = np.clip(((E - e0) * dx + (Nn - n0) * dy) / L2, 0, 1)
    d = np.hypot(E - (e0 + dx * t), Nn - (n0 + dy * t)).astype(np.float32)
    sub = dist[r0:r1, c0:c1]; np.minimum(sub, d, out=sub)
g = hm.copy(); out = hm.copy(); bed = LEVEL - DEPTH; crest = LEVEL + 1.5
m_chan = dist <= HALF_W
m_wall = (dist > HALF_W) & (dist <= HALF_W + BANK)
m_levee = (dist > HALF_W + BANK) & (dist <= HALF_W + BANK + LEVEE)
out[m_chan] = bed
t = np.clip((dist[m_wall] - HALF_W) / BANK, 0, 1); s = t * t * (3 - 2 * t)          # smoothstep from the bed up to bank height
bank = np.maximum(g[m_wall], crest); out[m_wall] = bed + (bank - bed) * s
t2 = np.clip((dist[m_levee] - HALF_W - BANK) / LEVEE, 0, 1); s2 = t2 * t2 * (3 - 2 * t2)
lowside = g[m_levee] < crest
out[m_levee] = np.where(lowside, crest + (g[m_levee] - crest) * s2, g[m_levee])      # raise low ground to a levee that falls back to the land
touched = int((m_chan | m_wall | m_levee).sum())
cut = np.maximum(g - out, 0)[m_chan | m_wall]; fill = np.maximum(out - g, 0)[m_chan | m_wall | m_levee]
print('ring: %.1f km at level %.0f m | radius %d-%d m | cells touched %d | max cut %.0f m, max fill %.0f m' % (length / 1000, LEVEL, rr.min(), rr.max(), touched, cut.max(), fill.max()))
if DRY: sys.exit(0)

# ---- 3. write the patched copy ---------------------------------------------------------------------------------------
os.makedirs(DST, exist_ok=True)
v = np.clip(np.round((out - mn) / (mx - mn) * 65535.0), 0, 65535).astype('<u2'); v.tofile(os.path.join(DST, 'height16.bin'))
shutil.copyfile(os.path.join(SRC, 'color.jpg'), os.path.join(DST, 'color.jpg'))
T2 = json.loads(json.dumps(T))
T2['water'] = [w for w in T2.get('water', []) if w.get('id') != 'harbor-ring'] + [{
    'id': 'harbor-ring', 'type': 'river', 'level_m': LEVEL, 'width_m': 2 * HALF_W, 'closed': True,
    'path_m': [[round(x, 1), round(y, 1)] for x, y in dense]}] + [
    {'id': 'harbor-spur-' + rid, 'type': 'river', 'level_m': LEVEL, 'width_m': 2 * HALF_W * 0.8, 'path_m': [[round(x, 1), round(y, 1)] for x, y in pl]} for rid, pl in spurs.items()]
T2['harbor'] = {'level_m': LEVEL, 'lift': {'canal_m': [round(lift_canal[0], 1), round(lift_canal[1], 1)], 'sea_m': [round(lift_sea[0], 1), round(lift_sea[1], 1)]},
                'buoys': buoys, 'gates': {rid: [round(pl[0][0], 1), round(pl[0][1], 1)] for rid, pl in spurs.items()}}
T2['note'] = str(T.get('note', '')) + ' | PATCHED by tools/carve-ring-canal.py (harbor ring canal, level %.0f m)' % LEVEL
json.dump(T2, open(os.path.join(DST, 'terrain.json'), 'w'))
print('wrote', DST)
